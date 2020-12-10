

async function sleep(ms) {
    return await new Promise(resolve => setTimeout(x => resolve(ms), ms));
}




export class AsyncEvent {
    set() {
        if (this._waiter) {
            const _waiter = this._waiter;
            this._waiter = null;
            this._wakeWaiter();
        }
    }

    clear() {
        this._waiter = null;
    }

    async wait() {
        if (!this._waiter) {
            this._waiter = new Promise(resolve => this._wakeWaiter = resolve);
        }
        await this._waiter;
    }
}


export class Batch {
    constructor(size) {
        this.size = size;
        this.id = 0;
        this.pending = new Map();
        this._waiters = [];
        this._wakeEvent = new AsyncEvent();
    }

    async enqueue(promise) {
        if (this.pending.size >= this.size) {
            const waiter = new AsyncEvent();
            this._waiters.push(waiter);
            await waiter.wait();
        }
        const id = this.id++;
        this.pending.set(id, promise
            .then(value => ({success: true, value, id}))
            .catch(e => ({success: false, e, id})));
        this._wakeEvent.set();
        return id;
    }

    async *[Symbol.asyncIterator]() {
        while (this.pending.size) {
            const envelope = await Promise.race([this._wakeEvent.wait(), ...this.pending.values()]);
            if (envelope === undefined) {
                this._wakeEvent.clear();
                continue;  // wakeEvent, use updated pending values..
            }
            this.pending.delete(envelope.id);
            if (this._waiters.length) {
                this._waiters.shift().set();
            }
            if (envelope.success) {
                yield [envelope.id, envelope.value];
            } else if (envelope.success === false && envelope.e) {
                throw envelope.e;
            } else {
                throw Error("Internal AsyncBatch Error");
            }
        }
    }
}

const done = setTimeout(() => null, 3600 * 1000);
(async function() {
    'use strict';

    const b = new AsyncBatch(10000);
    async function fill() {
        for (let i = 0; i < 20000; i++) {
            const delay = Math.random();
            const id = await b.enqueue(sleep(delay));
            if (!(i % 1000)) {
                console.info('Added ', id, 'to queue');
            }
        }
    }
    fill().catch(e => console.error('fill error', e));

    for await (const [id, value] of b) {
        //console.info('Processed', id, value);
    }
    console.warn("EXIT");
})().catch(e => console.error('error', e)).finally(() => clearTimeout(done));
