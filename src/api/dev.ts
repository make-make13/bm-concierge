import { Router, Request, Response } from 'express';
import { config, saveDevConfig } from '../config';
import { indexer } from '../rag/indexer';
import { supabaseWriter } from '../integrations/supabaseLeads';

export const devRouter = Router();

devRouter.get('/config/status', (req: Request, res: Response) => {
  res.json({
    devUiEnabled: config.devUiEnabled,
    supabase: {
      urlConfigured: !!config.supabase.url,
      url: config.supabase.url,
      serviceRoleKeyConfigured: !!config.supabase.serviceRoleKey,
      table: config.supabase.leadsTable
    },
    aiProvider: config.aiProvider
  });
});

devRouter.post('/config', (req: Request, res: Response) => {
  try {
    saveDevConfig(req.body);
    supabaseWriter.reinitialize();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

devRouter.post('/supabase/test', async (req: Request, res: Response) => {
  try {
    const leadId = await supabaseWriter.createLead({
      source: "dev_ui_test",
      channel: "dev",
      guest_name: "Dev UI Test",
      guest_contact: "@dev",
      message: "Тестовая заявка из dev-панели",
      ai_summary: "Проверка записи заявки в Supabase из dev UI",
      external_conversation_id: "dev:test",
      transcript_json: []
    });

    if (leadId) {
      res.json({ success: true, leadId });
    } else {
      res.status(500).json({ error: "Failed to create lead. Supabase might not be configured properly." });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

devRouter.get('/knowledge/status', (req: Request, res: Response) => {
  res.json(indexer.getStatus());
});

devRouter.post('/knowledge/reload', (req: Request, res: Response) => {
  try {
    indexer.loadKnowledgeBase();
    res.json({ success: true, status: indexer.getStatus() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
