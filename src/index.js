import * as futures from './futures.js';
import * as locks from './locks.js';
import * as queues from './queues.js';

export default Object.assign({}, futures, locks, queues);

// XXX figure out clean way to interface with legacy GC that imports us.
//self.jscoop = {
//    queues
//};
