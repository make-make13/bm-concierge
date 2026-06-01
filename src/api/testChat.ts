import { Request, Response } from 'express';
import { conversationService } from '../core/conversationService';
import { ChatMessageRequest } from '../types/chat';

export const testChatHandler = async (req: Request, res: Response) => {
  try {
    const chatRequest: ChatMessageRequest = req.body;

    if (!chatRequest || !chatRequest.message || !chatRequest.channel) {
      return res.status(400).json({ error: 'Missing required fields: message, channel' });
    }

    const response = await conversationService.processMessage({
      channel: chatRequest.channel as any,
      source: 'test_ai',
      externalConversationId: 'test_' + Date.now(),
      guestName: chatRequest.guestName || 'Неизвестно',
      guestContact: chatRequest.guestContact || '',
      message: chatRequest.message
    });
    
    return res.json({
       reply: response.reply,
       leadCreated: response.leadCreated,
       leadId: response.leadId,
       confidence: response.metadata ? (response.metadata as any).confidence : undefined,
       reason: response.leadCreated ? 'detected lead intent keywords' : 'processed by AI'
    });
  } catch (error) {
    console.error('Error in test chat handler:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
