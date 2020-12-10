
import {Event} from './locks.js';


export class BufferedWork {
    constructor(size, options={}) {
        this.permitErrors = options.permitErrors;
        this.size = size;
        this.id = 0;
        this.pending = new Map();
        this._waiters = [];
        this._waker = new Event();
    }

    async enqueue(promise) {
        if (this.pending.size >= this.size) {
            const waiter = new Event();
            this._waiters.push(waiter);
            await waiter.wait();
        }
        const id = this.id++;
        this.pending.set(id, promise
            .then(value => ({success: true, value, id}))
            .catch(value => ({success: false, value, id})));
        this._waker.set();
    }

    async *[Symbol.asyncIterator]() {
        while (this.pending.size) {
            const envelope = await Promise.race([this._waker.wait(), ...this.pending.values()]);
            if (envelope === true && this._waker.isSet()) {
                this._waker.clear();
                continue;
            }
            this.pending.delete(envelope.id);
            if (this._waiters.length) {
                this._waiters.shift().set();
            }
            if (envelope.success || this.permitErrors) {
                yield envelope.value;
            } else if (envelope.success === false) {
                throw envelope.value;
            } else {
                throw Error("Internal Error");
            }
        }
    }
}


const rateLimiterInstances = {};

export class RateLimiter {
    static async singleton(label, spec) {
        if (!rateLimiterInstances[label]) {
            rateLimiterInstances[label] = new this(label, spec);
        }
        const instance = rateLimiterInstances[label];
        await instance._init;
        return instance;
    }

    constructor(label, spec) {
        this.version = 1;
        this.label = label;
        this.spec = spec;
        this._init = this.loadState();
    }

    // Subclasses can override to use permanent storage like IndexedDB.
    async getState() {
        return this._state;
    }

    // Virtual: can override to use permanent storage like IndexedDB.
    async setState(state) {
        this._state = state;
    }

    async wait() {
        const spreadDelay = this.state.spec.period / this.state.spec.limit;
        this.maybeReset();
        // Perform as loop because this should work with concurreny too.
        while (this.state.count >= this.state.spec.limit ||
               (this.state.spec.spread && Date.now() - this.state.last < spreadDelay)) {
            await sleep(50);
            this.maybeReset();
        }
    }

    increment() {
        this.state.count++;
        this.state.last = Date.now();
        this._saveState();  // bg okay
    }

    toString() {
        return `RateLimiter [${this.label}]: period: ${this.state.spec.period / 1000}s, ` +
            `usage: ${this.state.count}/${this.state.spec.limit}`;
    }

    async _loadState() {
        const state = await this.getState();
        if (!state || state.version !== this.version) {
            this.state = {
                version: this.version,
                first: Date.now(),
                last: 0,
                count: 0,
                spec: this.spec
            };
            await this._saveState();
        } else {
            this.state = state;
        }
    }

    async _saveState() {
        await this.setState(this.state);
    }

    _maybeReset() {
        if (Date.now() - this.state.first > this.state.spec.period) {
            console.info(`Reseting rate limit period: ${this}`);
            this.state.count = 0;
            this.state.first = Date.now();
            this._saveState();  // bg okay
        }
    }
}


class RateLimiterGroup extends Array {
    async add(label, spec) {
        this.push(await RateLimiter.singleton(label, spec));
    }

    async wait() {
        await Promise.all(this.map(x => x.wait()));
    }

    increment() {
        console.group('RateLimiterGroup');
        try {
            for (const x of this) {
                x.increment();
                console.debug(`Increment: ${x}`);
            }
        } finally {
            console.groupEnd();
        }
    }
}
