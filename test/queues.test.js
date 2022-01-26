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

test('Queue multiple pre waits without gets (strong refs)', async () => {
    const q = new queues.Queue();
    const w1 = q.wait();
    const w2 = q.wait();
    const w3 = q.wait();
    w2.cancel();
    await q.put(1);
    await q.put(2);
    await w1;
    await w3; // Dont timeout...
});

test('Queue multiple pre waits without gets', async () => {
    const q = new queues.Queue();
    q.wait().cancel();
    const w2 = q.wait();
    await q.put(1);
    await w2; // Dont timeout...
});

test('PriorityQueue out of order num prio', async () => {
    const q = new queues.PriorityQueue();
    await q.put('last', 20);
    await q.put('first', 10);
    await q.put('middle', 15);
    expect(await q.get()).toBe('first');
    expect(await q.get()).toBe('middle');
    expect(await q.get()).toBe('last');
});

test('PriorityQueue out of order alpha prio', async () => {
    const q = new queues.PriorityQueue();
    await q.put('last', 'C');
    await q.put('first', 'A');
    await q.put('middle', 'B');
    expect(await q.get()).toBe('first');
    expect(await q.get()).toBe('middle');
    expect(await q.get()).toBe('last');
});
