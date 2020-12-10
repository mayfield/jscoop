/* eslint no-unsafe-finally: "off" */

import {CancelledError, Future} from './futures.js';


export class Condition {
    constructor(lock) {
        if (lock === undefined) {
            lock = new Lock();
        }
        this._lock = lock;
        this.locked = lock.locked.bind(lock);
        this.acquire = lock.acquire.bind(lock);
        this.release = lock.release.bind(lock);
        this._waiters = [];
    }

    async wait() {
        if (!this.locked()) {
            throw new Error('Lock not acquired');
        }
        this.release();
        try {
            const f = new Future();
            this._waiters.push(f);
            try {
                return await f;
            } finally {
                this._waiters.splice(this._waiters.indexOf(f), 1);
            }
        } finally {
            for (;;) {
                try {
                    await this.acquire();
                    break;
                } catch(e) {
                    if (e instanceof CancelledError) {
                        continue;
                    }
                    throw e;
                }
            }
        }
    }

    notify(n=1) {
        if (!this.locked()) {
            throw new Error('Lock not acquired');
        }
        let idx = 0;
        for (const f of this._waiters) {
            if (idx >= n) {
                break;
            }
            if (!f.done()) {
                idx++;
                f.setResult(true);
            }
        }
    }

    notifyAll() {
        this.notify(this._waiters.length);
    }
}


export class Lock {
    constructor() {
        this._waiters = [];
        this._locked = false;
    }

    locked() {
        return this._locked;
    }

    async acquire() {
        if (!this._locked) {
            this._locked = true;
            return true;
        }
        const f = new Future();
        this._waiters.push(f);
        try {
            await f;
            this._locked = true;
            return true;
        } finally {
            this._waiters.splice(this._waiters.indexOf(f), 1);
        }
    }

    release() {
        if (!this._locked) {
            throw new Error('Lock is not acquired');
        }
        this._locked = false;
        for (const f of this._waiters) {
            if (!f.done()) {
                f.setResult(true);
                break;
            }
        }
    }
}


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
                waiter.setResult();
                return;
            }
        }
    }
    
    locked() {
        return this._value === 0;
    }

    async acquire() {
        while (this._value <= 0) {
            const f = new Future();
            this._waiters.push(f);
            try {
                await f;
            } catch(e) {
                if (this._value > 0) {
                    this._wakeUpNext();
                }
                throw e;
            }
        }
        this._value--;
        return true;
    }

    async release() {
        this._value++;
        this._wakeUpNext();
    }
}


export class Event {
    constructor() {
        this._waiters = [];
        this._isSet = false;
    }

    isSet() {
        return this._isSet;
    }

    set() {
        if (!this._isSet) {
            this._isSet = true;
            for (const f of this._waiters) {
                f.setResult(true);
            }
        }
    }

    clear() {
        this._isSet = false;
    }

    async wait() {
        if (this._isSet) {
            return true;
        }
        const f = new Future();
        this._waiters.push(f);
        try {
            return await f;
        } finally {
            this._waiters.splice(this._waiters.indexOf(f), 1);
        }
    }
}
