import * as locks from '../src/locks.mjs';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

test('Lock sanity', () => {
    new locks.Lock();
});

test('Lock simple use', async () => {
    const l = new locks.Lock();
    expect(l.locked()).toBe(false);
    await l.acquire();
    expect(l.locked()).toBe(true);
    expect(await Promise.race([sleep(10).then(x => 'still-locked'), l.acquire()])).toBe('still-locked');
    l.release();
    expect(l.locked()).toBe(true); // picked up from the 2nd acquire
    l.release();
    expect(l.locked()).toBe(false);
});
