
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
        this._pending = true;
    }

    // Allow use of then/catch chaining.
    static get [Symbol.species]() {
        return Promise;
    }

    get [Symbol.toStringTag]() {
        return 'Future';
    }

    done() {
        return !this._pending;
    }

    result() {
        if (this._pending) {
            throw new Error('Unfulfilled Awaitable');
        }
        if (this._error) {
            throw self._error;
        }
        return self._result;
    }

    error() {
        if (this._pending) {
            throw new Error('Unfulfilled Awaitable');
        }
        return self._error;
    }

    setResult(result) {
        if (!this._pending) {
            throw new Error('Already fulfilled');
        }
        this._result = result;
        this._pending = false;
        this._resolve(result);
    }

    setError(e) {
        if (!this._pending) {
            throw new Error('Already fulfilled');
        }
        this._error = e;
        this._pending = true;
        this._reject(e);
    }
}
