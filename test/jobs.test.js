import * as jobs from '../src/jobs.js';

test('RateLimiter', () => {
    new jobs.RateLimiter('foo', {
        period: 1000,
        limit: 1
    });
});

test('RateLimiter nonconcurrent use', async () => {
    const rl = new jobs.RateLimiter('test', {
        period: 3600 * 1000, // enough to cause jest to timeout on fail
        limit: 1
    });
    await rl.wait();
});
