import * as futures from '../src/futures.js';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

test('Future sanity', () => {
    new futures.Future();
});
