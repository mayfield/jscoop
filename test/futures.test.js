import * as futures from '../src/futures.mjs';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

test('Future sanity', () => {
    new futures.Future();
});
