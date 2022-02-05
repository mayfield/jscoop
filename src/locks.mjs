/* eslint no-unsafe-finally: "off" */

import {Future} from './futures.mjs';


/**
 * A classic multitasking lock mechanism.
 *
 * @see Python's [asyncio.Lock]{@link https://docs.python.org/3/library/asyncio-sync.html#lock}
 */
export class Lock {
    constructor() {
        this._waiting = new Set();
        this._locked = false;
    }

    /**
     * Indicates the internal locked state of the Lock.
     *
     * @returns {boolean}
     */
    locked() {
        return this._locked;
    }

    /**
     * Acquire the lock if available, otherwise wait until it is released
     * and then take the lock and return.
     *
     * @async
     * @returns {Future<boolean>} {@link true}
     */
    acquire() {
        const f = new Future();
        if (!this._locked) {
            this._locked = true;
            f.setResult(true);
            return f;
        }
        f.addImmediateCallback(() => {
            if (!f.cancelled()) {
                this._locked = true;
            }
            this._waiting.delete(f);
        });
        this._waiting.add(f);
        return f;
    }

    /**
     * Release this lock and wake up and calls to [acquire]{@link Lock#acquire}.
     */
    release() {
        if (!this._locked) {
            throw new Error('Lock is not acquired');
        }
        this._locked = false;
        for (const f of this._waiting) {
            if (!f.done()) {
                f.setResult(true);
                break;
            }
        }
    }
}


/**
 * A classic multitasking Condition mechanism.
 *
 * @param {Lock} [lock] - A shared lock object that is used to synchronize multiple Conditions.
 * @borrows {Lock.acquire} as foo
 * @borrows Lock.release as bar
 *
 * @example
 * const cond = new Condition();
 * await cond.acquire();
 * setTimeout(() => cond.notify(), 1000);
 * await cond.wait(); // will wait for 1000ms
 * // do work...
 * cond.release();
 * @see Python's [asyncio.Condition]{@link https://docs.python.org/3/library/asyncio-sync.html#condition}
 */
export class Condition {
    constructor(lock) {
        if (lock === undefined) {
            lock = new Lock();
        }
        this._lock = lock;
        this.locked = lock.locked.bind(lock);
        this.acquire = lock.acquire.bind(lock);
        this.release = lock.release.bind(lock);
        this._waiting = new Set();
    }

    /**
     * Wait until the condition is satisfied.  When multiple awaiters exist they will
     * be woken up one at a time if [notify]{@link Condition#notify} is used.  If
     * [notifyAll]{@link Condition#notifyAll} is used then all awaiters will be woken up.
     * Once completed the internal {@link Lock} is reacquired.
     *
     * @async
     * @returns {Future<boolean>} {@link true}
     */
    wait() {
        if (!this.locked()) {
            throw new Error('Lock not acquired');
        }
        const f = new Future();
        const w = new Future();
        this.release();
        // Being woken by notify is just step 1, we must also reacquire the
        // internal lock so we need to wrap the waiter future.
        f.addImmediateCallback(() => f.cancelled() && w.cancel());
        w.addImmediateCallback(() => {
            this.acquire.addImmediateCallback(() => !f.cancelled() && f.setResult(true));
            this._waiting.delete(w);
        });
        this._waiting.add(w);
        return f;
    }

    /**
     * Wake up any awaiters using [wait]{@link Condition#wait}.
     *
     * @param {Number} [n=1] - The number of awaiters to wake up.
     */
    notify(n=1) {
        if (!this.locked()) {
            throw new Error('Lock not acquired');
        }
        let idx = 0;
        for (const f of this._waiting) {
            if (idx >= n) {
                break;
            }
            if (!f.done()) {
                idx++;
                f.setResult(true);
            }
        }
    }

    /**
     * Wake up ALL awaiters using [wait]{@link Condition#wait}.
     */
    notifyAll() {
        this.notify(this._waiting.size);
    }
}
/**
 * The internal lock state.
 *
 * @function Condition#locked
 * @see [Lock.locked]{@link Lock#locked}
 */

/**
 * Acquire the internal lock.
 *
 * @function Condition#acquire
 * @async
 * @see [Lock.acquire]{@link Lock#acquire}
 */

/**
 * Release the internal lock.
 *
 * @function Condition#release
 * @see [Lock.release]{@link Lock#release}
 */


/**
 * A classic counting Semaphore used to regulate access to a resource.
 *
 * @param {Number} [value=1] - The number of simultaneous acquisitions
 *                             this semaphore will permit before blocking.
 * @see Python's [asyncio.Semaphore]{@link https://docs.python.org/3/library/asyncio-sync.html#semaphore}
 */
export class Semaphore {
    constructor(value=1) {
        if (value < 0) {
            throw new Error('Value must be >= 0');
        }
        this._value = value;
        this._waiters = [];
    }

    _wakeUpNext() {
        while (this._waiters.length) {
            const waiter = this._waiters.shift();
            if (!waiter.done()) {
                waiter.setResult(true);
                return;
            }
        }
    }

    /**
     * Has the semaphore exhausted all acquisitions.
     *
     * @returns {boolean} {@link true} if it will block an [acquire]{@link Semaphore#acquire}
     */
    locked() {
        return this._value === 0;
    }

    /**
     * Attempt to acquire one of the available slots in this semaphore.
     * If none are available, wait in line until one is available.
     *
     * @async
     * @returns {Future<boolean>} {@link true}
     */
    acquire() {
        const f = new Future();
        if (!this._value) {
            this._waiters.push(f);
            f.addImmediateCallback(() => {
                if (!f.cancelled()) {
                    this._value--;
                }
            });
        } else {
            this._value--;
            f.setResult(true);
        }
        return f;
    }

    /**
     * Release a slot previously acquired with [acquire]{@link Semaphore#acquire}
     */
    release() {
        this._value++;
        this._wakeUpNext();
    }
}


/**
 * A very simple object for indicating when some event has been triggered.
 *
 * @see Python's [asyncio.Event]{@link https://docs.python.org/3/library/asyncio-sync.html#event}
 */
export class Event {
    constructor() {
        this._waiting = new Set();
        this._isSet = false;
    }

    /**
     * @returns {boolean} {@link true} if [set]{@link Event#set} was called.
     */
    isSet() {
        return this._isSet;
    }

    /**
     * Wake ALL awaiters of [wait]{@link Event#wait}
     */
    set() {
        if (!this._isSet) {
            this._isSet = true;
            for (const f of this._waiting) {
                if (!f.done()) {
                    f.setResult(true);
                }
            }
        }
    }

    /**
     * Opposite of [set]{@link Event#set}.  Clear the Event state so future
     * calls to [wait]{@link Event#wait} will block.
     */
    clear() {
        this._isSet = false;
    }

    /**
     * Wait until this event object is triggered with [set]{@link Event#set}.
     *
     * @async
     * @returns {Future<boolean>} {@link true}
     */
    wait() {
        const f = new Future();
        if (this._isSet) {
            f.setResult(true);
        } else {
            f.addImmediateCallback(() => this._waiting.delete(f));
            this._waiting.add(f);
        }
        return f;
    }
}
