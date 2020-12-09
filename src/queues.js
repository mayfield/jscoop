import * as Future from './future.js';
import * as locks from './locks.js';


export class QueueEmpty extends Error {}
export class QueueFull extends Error {}


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

    qsize() {
        return this._queue.length;
    }

    get maxsize() {
        return this._maxsize;
    }

    empty() {
        return this._queue.length === 0;
    }

    full() {
        if (this._maxsize <= 0) {
            return false;
        } else {
            return this._queue.length >= this._maxsize;
        }
    }

    async put(item) {
        while (this.full()) {
            const putter = new Future();
            self._putters.push(putter);
            try {
                await putter;
            } catch(e) {
                if (!this.full()) {
                    this._wakeupNext(this._putters);
                }
                throw e;
            }
        }
        return this.putNoWait(item);
    }

    putNoWait(item) {
        if (this.full()) {
            throw new QueueFull();
        }
        this._put(item);
        this._unfinished_tasks++;
        this._finished.clear();
        this._wakeupNext(this._getters);
    }

    async get() {
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
        return this.getNoWait();
    }

    getNoWait() {
        if (this.empty()) {
            throw new QueueEmpty();
        }
        const item = this._get();
        this._wakeupNext(this._putters);
        return item;
    }

    taskDone() {
        if (this._unfinishedTasks <= 0) {
            throw new Error('Called too many times');
        }
        this._unfinishedTasks--;
        if (this._unfinishedTasks === 0) {
            this._finished.set();
        }
    }

    async join() {
        if (this._unfinishedTasks > 0) {
            await this._finished.wait();
        }
    }
}


export class PriorityQueue extends Queue {
    _put(item, prio) {
        this._queue.push([prio, item]);
        this._queue.sort((a, b) => b[0] - a[0]);
    }

    _get() {
        return this._queue.pop()[1];
    }
}


export class LifoQueue extends Queue {
    _get() {
        return this._queue.pop();
    }
}
