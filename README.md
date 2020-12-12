jscoop
========
JavaScript Cooperative Multitasking Locks and Jobs Processing

[![NPM](https://img.shields.io/npm/v/jscoop.svg)](https://www.npmjs.com/package/jscoop)
[![Docs](https://img.shields.io/badge/docs-api-lightgrey.svg)](https://mayfield.github.io/jscoop)

This is port of Python's asyncio locks, futures and queues modules along
with batch processing routines.


Compatibility
--------
* Browsers >= Good
* NodeJS >= 14 (some versions of 13 too)


Usage
--------
### NodeJS
To use this code in NodeJS, `import` the `jscoop` module to get all the
available functionality, or you can selectively import the sub modules, such as
`jscoop/locks`, `jscoop/queues`, etc.  See the `src` directory or `src/coop.js`
for details.

```js
import * as coop from 'jscoop';

(async function() {
    const sem = new coop.Semaphore(2);
    await sem.acquire();
    await sem.acquire();
    await sem.acquire(); // blocks
})();
```

### Browser
For a browser you need to place the files somewhere that your web server
can find them and `import` the full path to the `coop.js` file, or one of
the other submodules if you only want some of the functionality.
```html
<script type="module">
    import * as coop from 'jscoop/src/coop.js';

    (async function() {
        const sem = new coop.Semaphore(2);
        await sem.acquire();
        await sem.acquire();
        await sem.acquire(); // blocks
    })();
</script>
```


Examples
--------
*jobs.BufferedWork* - Node
```js
import * as jobs from 'jscoop/jobs';

const bufWork = new jobs.BufferedWork(10);

async function sleep(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
}

async function producer() {
    for (let i = 0; i < 200; i++) {
        // Enqueue a random sleep that returns it's start order.
        await bufWork.enqueue(sleep(Math.random() * 1000).then(() => i));
        console.info('Added to queue', i);
    }
}

async function consumer() {
    for await (const i of bufWork) {
        console.info('Consumed finished result', i);
    }
}

(async () => {
    await Promise.all([producer(), consumer()]);
    console.info("Job compete");
})();
```


*locks.Lock* - Browser
```js
import * as locks from 'jscoop/src/locks.js';

(async () => {
    const lock = new locks.Lock();
    await lock.acquire();
    lock.release();
    await lock.acquire();
    await lock.acquire(); // blocks
})();
```


*queues.Queue* - Node
```js
import * as queues from 'jscoop/queues';

(async () => {
    const q = new queues.Queue();
    q.put(1);
    q.put(2);
    await q.get(); // 1
    await q.get(); // 2
    await q.get(); // blocks
})();
```
