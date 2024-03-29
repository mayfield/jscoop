/* global FinalizationRegistry */

let gcRegistry;
try {
    gcRegistry = new FinalizationRegistry(stack => {
        console.error("Unfinished future detected", stack);
    });
} catch(e) {/*no-pragma*/}


/**
 * A [Promise]{@link external:Promise}-like object that allows for easy external fulfillment.
 * Future objects can also be cancelled to indicate to the fulfiller that the Future is no
 * longer being used.  Modeled after Python's
 * [asyncio.Future]{@link https://docs.python.org/3/library/asyncio-future.html}
 *
 * @extends external:Promise
 */
export class Future extends Promise {
    constructor(options={}) {
        let _resolve;
        let _reject;
        super((resolve, reject) => {
            _resolve = resolve;
            _reject = reject;
        });
        this._resolve = _resolve;
        this._reject = _reject;
        this._pending = true;
        this._cancelled = false;
        this._callbacks = [];
        this._trackFinalization = options.trackFinalization && gcRegistry;
        if (this._trackFinalization) {
            gcRegistry.register(this, (new Error()).stack, this);
        }
    }

    // Allow use of then/catch chaining.
    static get [Symbol.species]() {
        return Promise;
    }

    get [Symbol.toStringTag]() {
        return 'Future';
    }

    /**
     * Cancel the future and run callbacks.
     *
     * @returns {boolean} {@link true} if {@link Future} was pending, otherwise {@link false}
     */
    cancel() {
        if (!this._pending) {
            return false;
        }
        this._cancelled = true;
        this._setDone();
        return true;
    }

    /**
     * Indicates if the Future was cancelled.
     *
     * @returns {boolean}
     */
    cancelled() {
        return this._cancelled;
    }

    /**
     * Indicates if the Future is fulfilled.
     *
     * @returns {boolean}
     */
    done() {
        return !this._pending;
    }

    /**
     * Return the result of a fulfilled Future.  If the Future is not fulfilled
     * it will throw an Error.
     *
     * @returns {*}
     */
    result() {
        if (this._cancelled) {
            throw new Error('Cancelled Future');
        }
        if (this._pending) {
            throw new Error('Unfulfilled Future');
        }
        if (this._error) {
            throw this._error;
        }
        return this._result;
    }

    /**
     * Return the Error of a fulfilled but rejected Future.  If the Future is not
     * done it will throw an Error.
     *
     * @returns {Error}
     */
    error() {
        if (this._cancelled) {
            throw new Error('Cancelled Future');
        }
        if (this._pending) {
            throw new Error('Unfulfilled Future');
        }
        return this._error;
    }

    /**
     * Add a callback that is executed immediately on fulfillment of the Future.
     * For some use cases it is not acceptable to let the event loop run other
     * tasks before a finalizer of some sort is run.  E.g. Lock and Queue.
     *
     * @param {Function} callback - A callback that is invoked with this Future.
     */
    addImmediateCallback(callback) {
        if (!this._pending) {
            callback(this);
        } else {
            this._callbacks.push(callback);
        }
    }

    /**
     * Set the result of a Future and resolve it.  The Future will be put into
     * the fulfilled state and any functions awaiting the result will be resumed
     * on the next event loop tick.
     *
     * @param {*} result - Any value that should be passed to awaiters.
     */
    setResult(result) {
        if (!this._pending) {
            throw new Error('Already fulfilled');
        }
        this._result = result;
        this._setDone();
        this._resolve(result);
    }

    _setDone() {
        this._pending = false;
        if (this._trackFinalization) {
            gcRegistry.unregister(this);
        }
        this._runCallbacks();
    }

    /**
     * Set the Error of a Future and reject it.  The Future will be put into
     * the fulfilled state and any functions awaiting the result will be resumed
     * on the next event loop tick.
     *
     * @param {Error} e - A valid Error that will be thrown to awaiters.
     */
    setError(e) {
        if (!this._pending) {
            throw new Error('Already fulfilled');
        }
        this._error = e;
        this._reject(e);
        this._setDone();
    }

    _runCallbacks() {
        for (const cb of this._callbacks) {
            cb(this);
        }
    }
}


/**
 * The built in Promise object.
 *
 * @external Promise
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise}
 */

