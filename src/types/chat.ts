export interface ChatMessageRequest {
  message: string;
  channel: string;
  guestName?: string;
  guestContact?: string;
}

export interface ChatMessageResponse {
  reply: string;
  leadCreated: boolean;
  leadId?: string;
  confidence: string;
  reason: string;
  provider?: string;
  model?: string;
  usedChunks?: string[];
}
