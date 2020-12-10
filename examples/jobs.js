import * as jobs from '../src/jobs.js';

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
