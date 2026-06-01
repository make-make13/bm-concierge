export interface AIReply {
  text: string;
  provider: string;
  model: string;
  confidence?: string;
  usedChunks?: string[];
}

export interface ConnectionTestResult {
  success: boolean;
  error?: string;
  provider: string;
  model: string;
}

export interface AIProvider {
  generateReply(input: string, contextChunks: string[], systemPrompt: string): Promise<AIReply>;
  testConnection(): Promise<ConnectionTestResult>;
}
