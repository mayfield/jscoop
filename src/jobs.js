
import {Event} from './locks.js';


/**
 * A job control system that permits up to a fixed number of jobs (awaitables)
 * to remain unfulfilled before blocking a producer from enqueueing any more work.
 * In effect it provides a simple way to build a producer/consumer pattern with
 * some regulation on the number of tasks the producer should enqueue based on
 * fulfillment of the work.  The results of each enqueue job are yielded in the
 * order they finish, not the order they are enqueued.
 *
 * @param {Number} size - Number of outstanding (unfulfilled) tasks to allow.
 * @example
 * const sleep = ms => newPromise(r => setTimeout(r, ms));
 * const bw = new BufferedWork(3);
 * await bw.enqueue(sleep(1000));
 * await bw.enqueue(sleep(1000));
 * await bw.enqueue(sleep(1000));
 * await bw.enqueue(sleep(1000)); // blocks for ~1 second waiting
 * for await (const _ of bw) {
 *    // Handle results...
 * }
 */
export class BufferedWork {
    constructor(size, options={}) {
        this.permitErrors = options.permitErrors;
        this.size = size;
        this.id = 0;
        this.pending = new Map();
        this._waiters = [];
        this._waker = new Event();
    }

    /**
     * Add a new job to the work queue immediately if a spot is available.  If the
     * queue is full, wait until a free slot is available.
     *
     * @param {external:Promise} promise - The awaitable to enqueue.
     */
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

    /**
     * An async generator that yields the results of completed tasks.  Note that the
     * {@link BufferedWork} instance itself is also iterable and produces the same
     * results.
     *
     * @generator
     * @yields {*} Return values from completed jobs as soon as they are ready.
     * @example
     * const bw = new BufferedWork(10);
     * bw.enqueue(1);
     * bw.enqueue(2);
     * for await (const x of bw.asCompleted()) {
     *   console.log(x); // 1
     *                   // 2
     * }
     *
     * // or...
     * bw.enqueue(1);
     * bw.enqueue(2);
     * for await (const x of bw) {
     *   console.log(x); // 1
     *                   // 2
     * }
     */
    async *asCompleted() {
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

    [Symbol.asyncIterator]() {
        return this.asCompleted();
    }
}


const rateLimiterInstances = {};

/**
 * @typedef RateLimiterSpec
 * @type {Object}
 * @property {Number} limit - The maximum number of calls in a period
 * @property {Number} period - The period in milliseconds for constraining the {limit}
 * @property {boolean} [spread] - Instead of racing to the limit and then blocking until the period resets,
 *                                delay each call so the eventual usage is spread out over the period.
 */

/**
 * An extensible rate limiter that can be used to prevent abuse of external
 * services or limited resources.  The storage methods are intended for override
 * to support rate limiting across multiple sessions or devices if you have a
 * shared storage backing.
 *
 * @param {String} label - The unique label used for singleton uses and storage keys.
 * @param {RateLimiterSpec} spec - The configuration for this limiter.
 */
export class RateLimiter {

    /**
     * Create or return an existing instance.
     *
     * @param {String} label - Unique identifier for this singleton.
     * @param {RateLimiterSpec} spec - The spec to be used if, and only if, a new instance is created.
     * @returns {RateLimiter} A new or existing instance.
     */
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

    /**
     * Subclasses can override to use permanent storage like IndexedDB.  Otherwise
     * state is just local to this instance.
     *
     * @abstract
     * @returns {Object} Meta data about the current usage
     */
    async getState() {
        return this._state;
    }

    /**
     * Subclasses can override to use permanent storage like IndexedDB.  Otherwise
     * state is just local to this instance.
     *
     * @abstract
     */
    async setState(state) {
        this._state = state;
    }

    /**
     * Blocks until it is safe to run again.  Note that this routine is concurrency-safe, so some
     * calls for a given context may block longer than expected because of multiple accesses.
     *
     * @abstract
     */
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

    /**
     * Increment use of the rate limiter.  This indicates that a usage occurred and the limit
     * should respond accordingly for the next, or existing, calls to {@link RateLimter#wait}.
     */
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


/**
 * A grouping for {@link RateLimiter} classes.
 *
 * @extends Array
 */
class RateLimiterGroup extends Array {

    /**
     * Add a {RateLimiter} singleton to this group.
     *
     * @param {String} label - The unique label identifying the {@link RateLimiter}.
     * @param {RateLimiterSpec} spec - The spec to be used for the {@link RateLimiter}.
     */
    async add(label, spec) {
        this.push(await RateLimiter.singleton(label, spec));
    }

    /**
     * Wait for all the limiters in this group to unblock.
     */
    async wait() {
        await Promise.all(this.map(x => x.wait()));
    }

    /**
     * Increment usage for all the limiters in this group.
     */
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
