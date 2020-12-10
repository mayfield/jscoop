//import {jest} from '@jest/globals';
import * as queues from '../src/queues.js';

test('Queue sanity', () => {
    new queues.Queue();
});

test('Queue simple use', async () => {
    const q = new queues.Queue();
    q.put(11);
    expect(await q.get()).toBe(11);
});
