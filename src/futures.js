
export class InvalidStateError extends Error {}
export class CancelledError extends Error {}

const PENDING = Symbol('pending');
const CANCELLED = Symbol('cancelled');
const FINISHED = Symbol('finished');


export class Future extends Promise {
    constructor() {
        let _resolve;
        let _reject;
        super((resolve, reject) => {
            _resolve = resolve;
            _reject = reject;
        });
        this._resolve = _resolve;
        this._reject = _reject;
        this._state = PENDING;
    }

    // Allow use of then/catch chaining.
    static get [Symbol.species]() {
        return Promise;
    }

    get [Symbol.toStringTag]() {
        return 'Future';
    }

    cancel() {
        if (this._state !== PENDING) {
            return false;
        }
        this._state = CANCELLED;
        this._reject(new CancelledError());
    }

    cancelled() {
        return this._state === CANCELLED;
    }

    done() {
        return this._state !== PENDING;
    }

    result() {
        if (this._state === CANCELLED) {
            throw new CancelledError();
        }
        if (this._state !== FINISHED) {
            throw new InvalidStateError('Result not ready.');
        }
        if (this._error) {
            throw self._error;
        }
        return self._result;
    }

    error() {
        if (this._state === CANCELLED) {
            throw new CancelledError();
        }
        if (this._state !== FINISHED) {
            throw new InvalidStateError('Error/Result are not set.');
        }
        return self._error;
    }

    setResult(result) {
        if (this._state !== PENDING) {
            throw new InvalidStateError(`${this._state}: ${this}`);
        }
        this._result = result;
        this._state = FINISHED;
        this._resolve(result);
    }

    setError(e) {
        if (this._state !== PENDING) {
            throw new InvalidStateError(`${this._state}: ${this}`);
        }
        this._error = e;
        this._state = FINISHED;
        this._reject(e);
    }
}
