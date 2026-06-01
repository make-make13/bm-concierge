import nodemailer from 'nodemailer';
import { config } from '../config';

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export class SMTPService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.reinitialize();
  }

  public reinitialize() {
    if (config.smtp.enabled && config.smtp.host && config.smtp.user && config.smtp.password) {
      this.transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: {
          user: config.smtp.user,
          pass: config.smtp.password,
        },
      });
      console.log('SMTP service initialized');
    } else {
      this.transporter = null;
      if (config.smtp.enabled) {
        console.warn('WARNING: SMTP is enabled but some settings are missing.');
      }
    }
  }

  public async sendEmail(options: SendEmailOptions): Promise<boolean> {
    if (!this.transporter) {
      console.error('SMTP: Cannot send email, transporter not initialized.');
      return false;
    }

    try {
      const from = config.smtp.fromEmail 
        ? `"${config.smtp.fromName}" <${config.smtp.fromEmail}>` 
        : `"${config.smtp.fromName}" <${config.smtp.user}>`;

      await this.transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });

      return true;
    } catch (err) {
      console.error('SMTP: Failed to send email:', err);
      return false;
    }
  }

  public async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!config.smtp.host || !config.smtp.user || !config.smtp.password) {
      return { success: false, error: 'Settings missing: Host, User, or Password' };
    }

    const testTransporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.password,
      },
    });

    try {
      await testTransporter.verify();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

export const smtpService = new SMTPService();
