jscoop
========
JavaScript Cooperative Multitasking Locks and Jobs Processing

This is port of Python's asyncio locks, futures and queues modules along
with batch processing routines.


Compatibility
--------
* Browsers >= Good
* NodeJS >= 14 (some versions of 13 too)


Usage
--------

### NodeJS
To use this code in NodeJS simply import the `coop.js` module to get all the
available functionality, or you can selectively import the sub modules, such as
`locks`, `queues`, etc.

```js
import * from 'coop';

(async function() {
    const sem = locks.Semaphore(2);
    await sem.acquire();
    await sem.acquire();
    await sem.acquire(); // blocks
})();
```

### Browser
```html
<script type="module">
    import * from 'jscoop/src/coop.js';

    (async function() {
        const sem = locks.Semaphore(2);
        await sem.acquire();
        await sem.acquire();
        await sem.acquire(); // blocks
    })();
</script>


Examples
--------
*jobs.Buffered*
```js
import * as jobs from '../src/jobs.js';

const buffered = new jobs.Buffered(10);

async function sleep(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
}

async function producer() {
    for (let i = 0; i < 200; i++) {
        // Enqueue a random sleep that returns it's start order.
        await buffered.enqueue(sleep(Math.random() * 1000).then(() => i));
        console.info('Added to queue', i);
    }
}

async function consumer() {
    for await (const i of buffered) {
        console.info('Consumed finished result', i);
    }
}

(async () => {
    await Promise.all([producer(), consumer()]);
    console.info("Job compete");
})();
```
