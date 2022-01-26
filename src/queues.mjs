/* global */

import {Future} from './futures.mjs';
import * as locks from './locks.mjs';


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
            const w = waiters.shift();
            if (!w.done()) {
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
    async put(...args) {
        while (this.full) {
            const putter = new Future();
            this._putters.push(putter);
            try {
                await putter;
            } catch(e) {
                if (!this.full) {
                    this._wakeupNext(this._putters);
                }
                throw e;
            }
        }
        return this.putNoWait(...args);
    }

    /**
     * Place a new item in the queue if it is not full.
     *
     * @param {*} item - Any object to pass to the caller of [dequeue]{@link Queue#dequeue}.
     * @throws {QueueFull}
     */
    putNoWait(...args) {
        if (this.full) {
            throw new QueueFull();
        }
        this._put(...args);
        this._unfinishedTasks++;
        this._finished.clear();
        this._wakeupNext(this._getters);
    }

    /**
     * Wait for an item to be available.
     * Users should [cancel]{@link Future#cancel} the returned {@link Future} if they
     * are no longer wanting data. Such as when used in {@link Promise.race}.
     *
     * @async
     * @param {QueueWaitOptions} [options]
     * @returns {Future} Resolves when data is available to [get]{@link Queue#get}.
     */
    wait(options={}, _callback) {
        const size = options.size == null ? 1 : options.size;
        if (this.size < size) {
            // If `waiter` gets collected before we set a result on it, it's likely a
            // user error.  They must be cancelled if the result is going to be unused.
            const waiter = new Future({trackFinalization: true});
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
                this._getters.push(getter);
            };
            scheduleWait();
            waiter.addImmediateCallback(() => {
                if (waiter.cancelled()) {
                    getter.cancel();
                }
            });
            return waiter;
        } else {
            const ready = new Future();
            ready.setResult(_callback ? _callback() : undefined);
            return ready;
        }
    }

    /**
     * Get an item from the queue if it is not empty.  The returned {@link Future} MUST be
     * cancelled if the caller is no longer wanting the queue item.
     *
     * @async
     * @param {QueueWaitOptions} [options]
     * @returns {Future<*>} An item from the head of the queue.
     */
    get(options) {
        return this.wait(options, () => this.getNoWait());
    }

    /**
     * Get an item from the queue if it is not empty.
     *
     * @throws {QueueEmpty}
     * @returns {*} An item from the head of the queue.
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
     * Get all items from the queue.  If the queue cannot satisfy the size requirements
     * then it will block.  The returned {@link Future} MUST be cancelled if the caller
     * is no longer wanting the queue items.
     *
     * @async
     * @param {QueueWaitOptions} [options]
     * @returns {Future<Array<*>>} A {@link Future} that resolves with an {@link Array} of items from the queue.
     */
    getAll(options) {
        return this.wait(options, () => this.getAllNoWait());
    }

    /**
     * Get all items from the queue without waiting.
     *
     * @returns {Array<*>} An {@link Array} of items from the queue.
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
        // Minor optimization for head/tail insertion.
        // Check to see if our new entry can avoid full array sort.  Note that the tail
        // is highest priority so we can use Array.pop (much faster than shift).
        if (!this._queue.length || prio < this._queue[this._queue.length - 1][0]) {
            this._queue.push([prio, item]);
        } else if (prio > this._queue[0][0]) {
            this._queue.unshift([prio, item]);
        } else {
            this._queue.push([prio, item]);
            this._queue.sort(([a], [b]) => a < b ? 1 : a == b ? 0 : -1);
        }
    }

    _get() {
        return this._queue.pop()[1];
    }
}

// We don't need to override put, but it's worth documenting the params...

/**
 * Place a new item in the queue if it is not full.  Otherwise block until space is
 * available.
 *
 * @async
 * @function PriorityQueue#put
 * @param {*} item - Any object to pass to the caller of [dequeue]{@link Queue#dequeue}.
 * @param {Number} prio - The sort order for this item.
 */

/**
 * Place a new item in the queue if it is not full.
 *
 * @function PriorityQueue#putNoWait
 * @param {*} item - Any object to pass to the caller of [dequeue]{@link Queue#dequeue}.
 * @param {Number} prio - The sort order for this item.
 * @throws {QueueFull}
 */


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
