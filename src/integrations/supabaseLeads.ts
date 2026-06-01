import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';
import { LeadPayload } from '../types/leads';

export class SupabaseWriter {
  private client: SupabaseClient | null = null;

  constructor() {
    this.reinitialize();
  }

  public reinitialize() {
    if (config.supabase.url && config.supabase.serviceRoleKey) {
      this.client = createClient(config.supabase.url, config.supabase.serviceRoleKey);
      console.log('Supabase client initialized');
    } else {
      this.client = null;
      console.warn('WARNING: Supabase URL or Service Role Key is missing. Leads will not be saved.');
    }
  }

  private mapLocalLeadToSupabasePayload(localLead: LeadPayload): any {
    const phoneValue = localLead.phone || localLead.guest_contact || 'не указан';
    const consentAcceptedValue = localLead.consent_accepted !== undefined ? localLead.consent_accepted : true;
    
    return {
      ...localLead,
      phone: phoneValue,
      consent_accepted: consentAcceptedValue
    };
  }

  public async createLead(payload: LeadPayload): Promise<string | null> {
    if (!this.client) {
      console.error('Failed to create lead: Supabase is not configured.');
      return null;
    }

    try {
      const supabasePayload = this.mapLocalLeadToSupabasePayload(payload);

      const { data, error } = await this.client
        .from(config.supabase.leadsTable)
        .insert([supabasePayload])
        .select('id')
        .single();

      if (error) {
        console.error('Error inserting lead to Supabase:', error);
        return null;
      }

      console.log('Lead created in Supabase with ID:', data.id);
      return data.id;
    } catch (err) {
      console.error('Exception while creating lead:', err);
      return null;
    }
  }
}

export const supabaseWriter = new SupabaseWriter();
