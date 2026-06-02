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
  /**
   * Генерация ответа ИИ
   * @param input Сообщение гостя
   * @param contextChunks Фрагменты из базы знаний (RAG)
   * @param systemPrompt Инструкция для ИИ
   * @param history История диалога
   */
  generateReply(
    input: string, 
    contextChunks: string[], 
    systemPrompt: string,
    history?: { role: string, content: string }[]
  ): Promise<AIReply>;
  
  testConnection(): Promise<ConnectionTestResult>;
}
