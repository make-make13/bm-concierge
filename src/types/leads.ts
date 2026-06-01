export interface LeadPayload {
  source: string;
  channel: string;
  guest_name: string;
  guest_contact: string;
  phone?: string;
  consent_accepted?: boolean;
  message: string;
  ai_summary: string;
  external_conversation_id: string;
  transcript_json: any[];
}
