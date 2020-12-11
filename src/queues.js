/**
 * @module queues
 */

import {Future} from './futures.js';
import * as locks from './locks.js';


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

    _get() {
        return this._queue.shift();
    }

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
     *  @returns {Number} The number of items waiting to be dequeued.
     */
    qsize() {
        return this._queue.length;
    }

    /**
     *  @returns {Number} The maximum number of items that can be enqueued.
     */
    maxsize() {
        return this._maxsize;
    }

    /**
     *  @returns {boolean} {@link true} if no items are enqueued.
     */
    empty() {
        return this._queue.length === 0;
    }

    /**
     *  @returns {boolean} {@link true} if a call to [enqueue]{@link Queue#enqueue} would block.
     */
    full() {
        if (this._maxsize <= 0) {
            return false;
        } else {
            return this._queue.length >= this._maxsize;
        }
    }

    /**
     * @typedef {Object} PutOptions
     * @property {boolean} [noWait] - Set to {@link true} if the call should not block.  If the call
     *                                can not complete without blocking then {@link QueueFull} is thrown.
     */

    /**
     * Place a new item in the queue if it is not full.  Otherwise block until space is
     * available or if {@link options.noWait} is {@link true} throw {@link QueueFull}.
     *
     * @param {*} item - Any object to pass to the caller of [dequeue]{@link Queue#dequeue}.
     * @param {PutOptions} [options]
     */
    async put(item, options={}) {
        if (!options.noWait) {
            while (this.full()) {
                const putter = new Future();
                this._putters.push(putter);
                try {
                    await putter;
                } catch(e) {
                    if (!this.full()) {
                        this._wakeupNext(this._putters);
                    }
                    throw e;
                }
            }
        }
        if (this.full()) {
            throw new QueueFull();
        }
        this._put.apply(this, arguments);
        this._unfinished_tasks++;
        this._finished.clear();
        this._wakeupNext(this._getters);
    }

    /**
     * @typedef {Object} GetOptions
     * @property {boolean} [noWait] - Set to {@link true} if the call should not block.  If the call
     *                                can not complete without blocking then {@link QueueEmpty} is thrown.
     */

    /**
     * Get an item from the queue if it is not empty.  Otherwise block until an item is available or
     * if {@link options.noWait} is {@link true} then {@link QueueEmpty} will be thrown.
     *
     * @param {GetOptions} [options]
     * @returns {*} An item from the head of the queue.
     */
    async get(options={}) {
        if (!options.noWait) {
            while (this.empty()) {
                const getter = new Future();
                this._getters.push(getter);
                try {
                    await getter;
                } catch(e) {
                    if (!this.empty()) {
                        this._wakeupNext(this._getters);
                    }
                    throw e;
                }
            }
        }
        if (this.empty()) {
            throw new QueueEmpty();
        }
        const item = this._get();
        this._wakeupNext(this._putters);
        return item;
    }

    /**
     * Decrement the number of pending tasks.  Called by consumers after completing
     * their use of a dequeued item to indicate that processing has finished.
     *
     * When all dequeued items have been accounted for with an accompanying call to
     * this function [join]{@link Queue#join} will unblock.
     */
    taskDone() {
        if (this._unfinishedTasks <= 0) {
            throw new Error('Called too many times');
        }
        this._unfinishedTasks--;
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
    _put(item, _, prio) {
        this._queue.push([prio, item]);
        this._queue.sort((a, b) => b[0] - a[0]);
    }

    _get() {
        return this._queue.pop()[1];
    }

    /**
     * Place a new item in the queue if it is not full.  Otherwise block until space is
     * available or if {@link options.noWait} is {@link true} throw {@link QueueFull}.
     *
     * @param {Number} prio - The sort order for this item.
     * @param {*} item - Any object to pass to the caller of [dequeue]{@link Queue#dequeue}.
     * @param {PutOptions} [options]
     */
    async put(prio, item, options={}) {
        return await super.put(item, options, prio);
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

