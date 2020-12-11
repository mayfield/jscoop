import * as jobs from '../src/jobs.js';

function timeout(ms) {
    return new Promise(resolve => setTimeout(() => resolve('timeout'), ms));
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
    rl.increment();
    expect(await Promise.race([timeout(100), rl.wait()])).toBe('timeout');
});

test('RateLimiter concurrent block', async () => {
    const rl = new jobs.RateLimiter('test', {
        period: 3600 * 1000, // enough to cause jest to timeout on fail
        limit: 1
    });
    const w1 = rl.wait().then(() => rl.increment());
    const w2 = rl.wait().then(() => rl.increment());
    const w3 = rl.wait().then(() => rl.increment());
    expect(await Promise.race([timeout(100), w1])).toNotBe('timeout');
    expect(await Promise.race([timeout(100), w2])).toBe('timeout');
    expect(await Promise.race([timeout(100), w3])).toBe('timeout');
});

