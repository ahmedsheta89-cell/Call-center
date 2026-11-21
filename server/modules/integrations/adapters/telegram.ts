/**
 * @file server/modules/integrations/adapters/telegram.ts
 * Telegram Bot API Official Channel Adapter (100% Free / Zero-Cost First)
 */

import crypto from 'crypto';
import { ChannelType, UnifiedMessage, UUID } from '../../../core/types.ts';
import { ChannelAdapter, WebhookVerificationResult } from '../contracts.ts';

export interface TelegramAdapterConfig {
  botToken?: string;
  webhookSecretToken?: string;
  sandboxMode?: boolean;
}

export class TelegramChannelAdapter implements ChannelAdapter {
  public channelType: ChannelType = 'telegram';
  public name = 'Telegram Bot API (Official Free Tier)';
  private config: TelegramAdapterConfig;

  constructor(config: TelegramAdapterConfig = {}) {
    this.config = {
      sandboxMode: config.sandboxMode ?? true,
      botToken: config.botToken,
      webhookSecretToken: config.webhookSecretToken,
    };
  }

  public async verifyWebhook(
    headers: Record<string, string>,
    rawBody: string | Buffer
  ): Promise<WebhookVerificationResult> {
    const secretHeader = headers['x-telegram-bot-api-secret-token'];
    
    // In sandbox or test mode without configured secret, allow verification
    if (this.config.sandboxMode || !this.config.webhookSecretToken) {
      try {
        const parsed = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString('utf-8'));
        const sender = parsed?.message?.from?.username || String(parsed?.message?.from?.id || 'unknown_telegram_user');
        return {
          isValid: true,
          rawPayload: parsed,
          senderIdentifier: sender,
          signatureHeader: secretHeader,
        };
      } catch (err: any) {
        return {
          isValid: false,
          rawPayload: null,
          senderIdentifier: '',
          error: `Malformed Telegram JSON payload: ${err.message}`,
        };
      }
    }

    // Verify secret token constant-time
    const expected = this.config.webhookSecretToken;
    const provided = secretHeader || '';
    const isValid =
      provided.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

    if (!isValid) {
      return {
        isValid: false,
        rawPayload: null,
        senderIdentifier: '',
        error: 'Invalid X-Telegram-Bot-Api-Secret-Token',
      };
    }

    try {
      const parsed = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString('utf-8'));
      const sender = parsed?.message?.from?.username || String(parsed?.message?.from?.id || 'unknown_telegram_user');
      return {
        isValid: true,
        rawPayload: parsed,
        senderIdentifier: sender,
        signatureHeader: secretHeader,
      };
    } catch (err: any) {
      return {
        isValid: false,
        rawPayload: null,
        senderIdentifier: '',
        error: `Malformed Telegram JSON: ${err.message}`,
      };
    }
  }

  public async normalizeInboundMessage(payload: any, organizationId: UUID): Promise<UnifiedMessage> {
    const msg = payload?.message || payload;
    const text = msg?.text || msg?.caption || '[وسائط غير نصية]';
    const senderId = String(msg?.from?.id || 'tg_unknown');
    const senderName = [msg?.from?.first_name, msg?.from?.last_name].filter(Boolean).join(' ') || msg?.from?.username || senderId;

    return {
      id: crypto.randomUUID(),
      organizationId,
      customerId: `cust-tg-${senderId}`,
      conversationId: `conv-tg-${senderId}`,
      channel: 'telegram',
      direction: 'inbound',
      type: 'text',
      body: text,
      sender: {
        id: `cust-tg-${senderId}`,
        name: senderName,
        type: 'customer',
      },
      status: 'delivered',
      createdAt: msg?.date ? new Date(msg.date * 1000).toISOString() : new Date().toISOString(),
      metadata: {
        telegramMessageId: msg?.message_id,
        chatId: msg?.chat?.id,
        username: msg?.from?.username,
      },
    };
  }

  public async dispatchOutboundMessage(
    message: UnifiedMessage
  ): Promise<{ externalMessageId: string; status: 'sent' | 'delivered' | 'failed' }> {
    // If running in sandbox or without token, simulate successful dispatch with $0 cost
    if (this.config.sandboxMode || !this.config.botToken) {
      return {
        externalMessageId: `tg-mock-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        status: 'delivered',
      };
    }

    // Live dispatch via Telegram Bot API sendMessage
    try {
      const chatId = (message.metadata?.chatId as string) || message.conversationId?.replace('conv-tg-', '');
      const res = await fetch(`https://api.telegram.org/bot${this.config.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message.body,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        return {
          externalMessageId: String(data.result?.message_id),
          status: 'delivered',
        };
      }
      return {
        externalMessageId: '',
        status: 'failed',
      };
    } catch {
      return {
        externalMessageId: '',
        status: 'failed',
      };
    }
  }

  public async fetchHealthStatus(): Promise<{ isHealthy: boolean; latencyMs: number; details?: string }> {
    const start = Date.now();
    if (this.config.sandboxMode || !this.config.botToken) {
      return {
        isHealthy: true,
        latencyMs: Date.now() - start,
        details: 'Telegram Bot API Adapter active in local zero-cost mode',
      };
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${this.config.botToken}/getMe`);
      const data = await res.json();
      return {
        isHealthy: data.ok === true,
        latencyMs: Date.now() - start,
        details: data.ok ? `Connected to @${data.result?.username}` : 'Telegram API rejected token',
      };
    } catch (err: any) {
      return {
        isHealthy: false,
        latencyMs: Date.now() - start,
        details: `Connection failed: ${err.message}`,
      };
    }
  }
}
