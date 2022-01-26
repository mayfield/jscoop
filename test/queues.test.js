import * as queues from '../src/queues.mjs';

test('Queue sanity', () => {
    new queues.Queue();
});

test('Queue simple use', async () => {
    const q = new queues.Queue();
    q.put(11);
    expect(await q.get()).toBe(11);
});

test('Queue multiple gets', async () => {
    const q = new queues.Queue();
    const g1 = q.get();
    const g2 = q.get();
    await q.put(1);
    await q.put(2);
    expect(await g1).toBe(1);
    expect(await g2).toBe(2);
});

test('Queue multiple pre waits without gets', async () => {
    const q = new queues.Queue();
    const w1 = q.wait();
    const w2 = q.wait();
    const w3 = q.wait();
    await q.put(1);
    await q.put(2);
    await w1;
    await w2;
    await w3; // Dont timeout...
});

test('Queue multiple waits without gets', async () => {
    const q = new queues.Queue();
    await q.put(1);
    await q.put(2);
    await q.wait();
    await q.wait();
    await q.wait(); // Dont timeout...
});
