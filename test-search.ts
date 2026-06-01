import { searchEngine } from './src/rag/search';
import { indexer } from './src/rag/indexer';
indexer.loadKnowledgeBase();
console.log('Query: Можно ли с собакой?');
const q = 'Можно ли с собакой?';
const tokens = q.toLowerCase().split(/[\s,.\-!?]+/).filter(t => t.length > 2);
console.log('Tokens:', tokens);
console.log('Result length:', searchEngine.search(q).length);
console.log('Result text:', searchEngine.search(q));
