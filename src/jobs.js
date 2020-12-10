
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
