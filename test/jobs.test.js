import * as jobs from '../src/jobs.js';
import {Future} from '../src/futures.js';

/*
let _t;
function test(name, cb) {
    if (_t) {
        _t = _t.finally(cb);
    } else {
        _t = Promise.resolve(cb());
    }
    _t.then(() => console.log("pass")).catch(console.error);
}
function expect(a) {
    return {
        toBe: b => {if (a !== b) throw new Error('not eq')},
        toBeUndefined: () => {if (a !== undefined) throw new Error("not undef")}
    };
}
*/

const _timeouts = [];

function timeout(ms) {
    let to;
    const p = new Promise(resolve => to = setTimeout(() => resolve('timeout'), ms));
    p.clear = () => clearTimeout(to);
    _timeouts.push(to);
    return p;
}

function clearTimeouts() {
    for (const x of _timeouts) {
        clearTimeout(x);
    }
    _timeouts.length = 0;
}


test('RateLimiter', () => {
    new jobs.RateLimiter('foo', {
        period: 1000,
        limit: 1
    });
});

test('RateLimiter nonconcurrent no block', async () => {
    const rl = new jobs.RateLimiter('test', {
        period: 3600 * 1000, // enough to cause jest to timeout on fail
        limit: 1
    });
    await rl.wait();
});

test('RateLimiter nonconcurrent block', async () => {
    const rl = new jobs.RateLimiter('test', {
        period: 3600 * 1000, // enough to cause jest to timeout on fail
        limit: 1
    });
    await rl.wait();
    expect(await Promise.race([timeout(100), rl.wait()])).toBe('timeout');
});

test('RateLimiter concurrent block', async () => {
    const rl = new jobs.RateLimiter('test', {
        period: 400,
        limit: 2
    });
    const w1 = rl.wait();
    const w2 = rl.wait();
    const w3 = rl.wait();
    expect(await Promise.race([timeout(50), w1])).toBeUndefined();
    expect(await Promise.race([timeout(50), w2])).toBeUndefined();
    expect(await Promise.race([timeout(50), w3])).toBe('timeout');
    await w3; // for testing to no complain
    clearTimeouts();
});

test('UnorderedWorkQueue sanity', async () => {
    const wq = new jobs.UnorderedWorkQueue();
});

test('UnorderedWorkQueue put', async () => {
    const wq = new jobs.UnorderedWorkQueue();
    await wq.put(timeout(100));
    expect(wq.pending()).toBe(1);
    await wq.put(timeout(100));
    expect(wq.pending()).toBe(2);
    await timeout(300);
    expect(wq.pending()).toBe(0);
    expect(wq.fulfilled()).toBe(2);
});

test('UnorderedWorkQueue get', async () => {
    const wq = new jobs.UnorderedWorkQueue();
    await wq.put(timeout(100));
    expect(wq.pending()).toBe(1);
    expect(await wq.get()).toBe('timeout');
    expect(wq.pending()).toBe(0);
    expect(wq.fulfilled()).toBe(0);
});

test('UnorderedWorkQueue maxPending', async () => {
    const wq = new jobs.UnorderedWorkQueue({maxPending: 1});
    const f1 = new Future();
    await wq.put(f1);
    expect(wq.pending()).toBe(1);
    const f2 = new Future();
    expect(await Promise.race([timeout(50), wq.put(f2)])).toBe('timeout');
    f1.setResult();
    await timeout(10);
    expect(wq.pending()).toBe(1);
    expect(wq.fulfilled()).toBe(1);
    f2.setResult();
    await timeout(10);
    expect(wq.pending()).toBe(0);
    expect(wq.fulfilled()).toBe(2);
});

test('UnorderedWorkQueue maxFulfilled', async () => {
    const wq = new jobs.UnorderedWorkQueue({maxFulfilled: 1});
    const donezo = new Future();
    donezo.setResult();
    await wq.put(donezo);
    await timeout(10);
    expect(wq.pending()).toBe(0);
    expect(wq.fulfilled()).toBe(1);
    expect(await Promise.race([timeout(50), wq.put(donezo)])).toBe('timeout');
    expect(wq.pending()).toBe(0);
    expect(wq.fulfilled()).toBe(1);
    await wq.get();
    await timeout(10);
    expect(wq.pending()).toBe(0);
    expect(wq.fulfilled()).toBe(1);
    await wq.get();
    await timeout(10);
    expect(wq.pending()).toBe(0);
    expect(wq.fulfilled()).toBe(0);
});


test('UnorderedWorkQueue concurrent put', async () => {
    const wq = new jobs.UnorderedWorkQueue({maxPending: 2});
    const f = new Future();
    const puts = [];
    for (let i = 0; i < 10; i++) {
        puts.push(wq.put(f));
        wq.get();
    }
    f.setResult();
    await Promise.all(puts);
});
