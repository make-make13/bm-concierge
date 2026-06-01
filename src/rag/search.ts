import { indexer, Chunk } from './indexer';

export class RagSearch {
  public search(query: string, topK: number = 3): string {
    const chunks = indexer.getChunks();
    if (chunks.length === 0) return '';

    const queryTokens = query.toLowerCase().split(/[\s,.\-!?]+/).filter(t => t.length > 2);
    
    const scoredChunks = chunks.map(chunk => {
      let score = 0;
      const chunkTextLower = chunk.text.toLowerCase();
      for (const token of queryTokens) {
        if (chunkTextLower.includes(token)) {
          score += 1;
        }
      }
      return { chunk, score };
    });

    // Sort by score descending
    scoredChunks.sort((a, b) => b.score - a.score);

    // Take topK
    const topChunks = scoredChunks.slice(0, topK).filter(c => c.score > 0);
    
    // Fallback: if no keywords matched, just return the first two chunks (usually general info)
    const results = topChunks.length > 0 ? topChunks : scoredChunks.slice(0, 2);

    let combined = '';
    for (const res of results) {
      combined += `\n--- [Source: ${res.chunk.sourceFile}` + 
                  (res.chunk.category ? `, Category: ${res.chunk.category}` : '') + 
                  (res.chunk.title ? `, Title: ${res.chunk.title}` : '') + 
                  `] ---\n${res.chunk.text}\n`;
    }
    return combined;
  }
}

export const searchEngine = new RagSearch();
