import * as fs from 'fs';
import * as path from 'path';

export interface Chunk {
  text: string;
  sourceFile: string;
  category?: string;
  title?: string;
}

export class LocalIndexer {
  private knowledgeDir: string;
  private chunks: Chunk[] = [];
  private filesStatus: Map<string, { loaded: boolean, chunksCount: number }> = new Map();

  constructor() {
    this.knowledgeDir = path.join(process.cwd(), 'src', 'knowledge');
  }

  public loadKnowledgeBase() {
    try {
      this.chunks = [];
      this.filesStatus.clear();
      if (!fs.existsSync(this.knowledgeDir)) return;
      
      const files = fs.readdirSync(this.knowledgeDir);
      for (const file of files) {
        if (file.endsWith('.md')) {
          const content = fs.readFileSync(path.join(this.knowledgeDir, file), 'utf-8');
          const fileChunks = this.parseChunks(content, file);
          this.chunks.push(...fileChunks);
          this.filesStatus.set(file, { loaded: true, chunksCount: fileChunks.length });
        }
      }
      console.log(`Loaded ${this.filesStatus.size} files, extracted ${this.chunks.length} chunks into local knowledge base.`);
    } catch (error) {
      console.error('Error loading knowledge base:', error);
    }
  }

  private parseChunks(content: string, sourceFile: string): Chunk[] {
    const parts = content.split(/(?:^|\n)## CHUNK:/g);
    const result: Chunk[] = [];
    
    for (let i = 0; i < parts.length; i++) {
      let text = parts[i].trim();
      if (!text) continue;
      
      let category, title;
      const lines = text.split('\n');
      for (const line of lines) {
        const lower = line.toLowerCase();
        if (lower.startsWith('category:')) category = line.substring(9).trim();
        if (lower.startsWith('title:')) title = line.substring(6).trim();
      }

      result.push({ text, sourceFile, category, title });
    }
    
    return result;
  }

  public getChunks(): Chunk[] {
    return this.chunks;
  }

  public getStatus() {
    const files = [];
    let totalChunks = 0;
    for (const [name, stats] of this.filesStatus.entries()) {
      files.push({ name, loaded: stats.loaded, chunks: stats.chunksCount });
      totalChunks += stats.chunksCount;
    }
    return { files, totalChunks };
  }
}

export const indexer = new LocalIndexer();
