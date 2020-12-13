import * as jobs from '../src/jobs.js';

const rl1 = new jobs.RateLimiter('3/sec', {limit: 20, period: 10000, spread: true});
const rl2 = new jobs.RateLimiter('30/min', {limit: 33, period: 33000});

async function sleep(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
    const rlGroup = new jobs.RateLimiterGroup();
    rlGroup.push(rl1);
    rlGroup.push(rl2);
    for (let i = 0; i < 2000; i++) {
        await rlGroup.wait();
        console.group("Group Iteration: " + (i + 1));
        console.info('' + rl1);
        console.info('' + rl2);
        console.groupEnd();
    }
})();
