/* global WeakRef */

import {Future} from './futures.mjs';
import * as locks from './locks.mjs';

/* We can live without weakref but error detection is worse
 * and small memory leaks are possible. */
let MaybeWeakRef;
try {
    MaybeWeakRef = WeakRef;
} catch(e) {
    class StrongRef {
        constructor(obj) {
            this.obj = obj;
        }
        unref() {
            return this.obj;
        }
    }
    MaybeWeakRef = StrongRef;
}

/**
 * Indicates that the queue is empty.
 *
 * @extends external:Error
 */
export class QueueEmpty extends Error {}

/**
 * Indicates that the queue is full.
 *
 * @extends external:Error
 */
export class QueueFull extends Error {}

/**
 * @typedef QueueWaitOptions
 * @type {Object}
 * @property {Number} [size] - Wait until the available items meets or exceeds this value.
 */

/**
 * A classic producer/consumer construct for regulating work.
 *
 * @see Python's [asyncio.Queue]{@link https://docs.python.org/3/library/asyncio-queue.html}
 * @param {Number} [maxsize=0] - The number of items allowed to be stored before blocking.
 */
export class Queue {
    constructor(maxsize=0) {
        this._maxsize = maxsize;
        this._getters = [];
        this._putters = [];
        this._unfinishedTasks = 0;
        this._finished = new locks.Event();
        this._finished.set();
        this._queue = [];
    }

    /**
     * @protected
     */
    _get() {
        return this._queue.shift();
    }

    /**
     * @protected
     */
    _put(item) {
        return this._queue.push(item);
    }

    _wakeupNext(waiters) {
        while (waiters.length) {
            const ref = waiters.shift();
            const w = ref.deref();
            if (w && !w.done()) {
                w.setResult();
                break;
            }
        }
    }

    /**
     * The number of items waiting to be dequeued.
     * @type {Number}
     */
    get size() {
        return this._queue.length;
    }

    /**
     * The maximum number of items that can be enqueued.
     * @type {Number}
     */
    get maxsize() {
        return this._maxsize;
    }

    /**
     * {@link true} if a call to [put]{@link Queue#put} would block.
     * @type {boolean}
     */
    get full() {
        if (this._maxsize <= 0) {
            return false;
        } else {
            return this._queue.length >= this._maxsize;
        }
    }

    /**
     * Place a new item in the queue if it is not full.  Otherwise block until space is
     * available.
     *
     * @param {*} item - Any object to pass to the caller of [dequeue]{@link Queue#dequeue}.
     */
    async put(item) {
        while (this.full) {
            const putter = new Future();
            this._putters.push(new MaybeWeakRef(putter));
            try {
                await putter;
            } catch(e) {
                if (!this.full) {
                    this._wakeupNext(this._putters);
                }
                throw e;
            }
        }
        return this.putNoWait(item);
    }

    /**
     * Place a new item in the queue if it is not full.
     *
     * @param {*} item - Any object to pass to the caller of [dequeue]{@link Queue#dequeue}.
     * @throws {QueueFull}
     */
    putNoWait(item) {
        if (this.full) {
            throw new QueueFull();
        }
        this._put.apply(this, arguments);
        this._unfinishedTasks++;
        this._finished.clear();
        this._wakeupNext(this._getters);
    }

    /**
     * Wait for an item to be available.
     *
     * @param {QueueWaitOptions} [options]
     * @returns {Future} User should cancel the future if they are no longer wanting data.
     */
    wait(options={}, _callback) {
        const size = options.size == null ? 1 : options.size;
        // If this gets GC'd before we set a result on it, it's likely a user error.  They
        // must be cancelled if not used (i.e. Promise.race([...]))
        const waiter = new Future({trackFinalization: true});
        if (this.size < size) {
            let getter;
            const scheduleWait = () => {
                getter = new Future();
                getter.addImmediateCallback(() => {
                    // We cancelled too, but we only need to check the waiter's state
                    if (waiter.cancelled()) {
                        return;
                    }
                    if (this.size < size) {
                        scheduleWait();
                    } else {
                        waiter.setResult(_callback ? _callback() : undefined);
                    }
                });
                this._getters.push(new MaybeWeakRef(getter));
            };
            scheduleWait();
            waiter.addImmediateCallback(() => {
                if (waiter.cancelled()) {
                    getter.cancel();
                }
            });
        } else {
            waiter.setResult(_callback ? _callback() : undefined);
        }
        return waiter;
    }

    /**
     * Get an item from the queue if it is not empty.  Otherwise block until an item is available.
     *
     * @param {QueueWaitOptions} [options]
     * @returns {Future(*)} An item from the head of the queue.
     */
    get(options) {
        return this.wait(options, () => this.getNoWait());
    }

    /**
     * Get an item from the queue if it is not empty.
     *
     * @throws {QueueEmpty}
     * @returns {Future(*)} An item from the head of the queue.
     */
    getNoWait() {
        if (!this.size) {
            throw new QueueEmpty();
        }
        const item = this._get();
        this._wakeupNext(this._putters);
        return item;
    }

    /**
     * Get all items from the queue.
     *
     * @param {QueueWaitOptions} [options]
     * @returns {Future(Array)} An array of items from the queue.
     */
    getAll(options) {
        return this.wait(options, () => this.getAllNoWait());
    }

    /**
     * Get all items from the queue without waiting.
     */
    getAllNoWait() {
        const items = [];
        while (this.size) {
            items.push(this._get());
        }
        this._wakeupNext(this._putters);
        return items;
    }

    /**
     * Decrement the number of pending tasks.  Called by consumers after completing
     * their use of a dequeued item to indicate that processing has finished.
     *
     * When all dequeued items have been accounted for with an accompanying call to
     * this function [join]{@link Queue#join} will unblock.
     *
     * @param {Number} [count=1] - The number of tasks to mark as done.
     */
    taskDone(count=1) {
        if (this._unfinishedTasks - count < 0) {
            throw new Error('Called too many times');
        }
        this._unfinishedTasks -= count;
        if (this._unfinishedTasks === 0) {
            this._finished.set();
        }
    }

    /**
     * Will block until all items are dequeued and for every item that was dequeued a call
     * was made to [taskdone]{@link Queue#taskDone}.
     */
    async join() {
        if (this._unfinishedTasks > 0) {
            await this._finished.wait();
        }
    }
}


/**
 * A subtype of {@link Queue} that lets the producer control the ordering of pending items
 * with a priority argument.
 *
 * @see Python's [asyncio.PriorityQueue]{@link https://docs.python.org/3/library/asyncio-queue.html#priority-queue}
 * @extends Queue
 */
export class PriorityQueue extends Queue {
    _put(item, prio) {
        this._queue.push([prio, item]);
        this._queue.sort((a, b) => b[0] - a[0]);
    }

    _get() {
        return this._queue.pop()[1];
    }

    /**
     * Place a new item in the queue if it is not full.  Otherwise block until space is
     * available.
     *
     * @param {*} item - Any object to pass to the caller of [dequeue]{@link Queue#dequeue}.
     * @param {Number} prio - The sort order for this item.
     */
    async put(item, prio) {
        return await super.put(item, prio);
    }
}


/**
 * A Last-In-First-Out Queue.  Items are dequeued in the opposite order that
 * they are enqueued.
 *
 * @see Python's [asyncio.LifoQueue]{@link https://docs.python.org/3/library/asyncio-queue.html#lifo-queue}
 * @extends Queue
 */
export class LifoQueue extends Queue {
    _get() {
        return this._queue.pop();
    }
}


/**
 * The built in Error object.
 *
 * @external Error
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error}
 */
