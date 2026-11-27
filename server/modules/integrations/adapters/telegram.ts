/**
 * @file server/modules/integrations/adapters/telegram.ts
 * Telegram Bot API Official Channel Adapter (100% Free / Zero-Cost First)
 * Strict State Separation: DISABLED (default), CONFIGURED, CONNECTED, SIMULATED, FAILED
 */

import crypto from 'crypto';
import { ChannelType, UnifiedMessage, UUID } from '../../../core/types.ts';
import {
  ChannelAdapter,
  WebhookVerificationResult,
  TelegramAdapterConfig,
  AdapterOperationalState,
  AdapterHealthStatus,
  MessageDeliveryStatus,
} from '../contracts.ts';

export class TelegramChannelAdapter implements ChannelAdapter {
  public channelType: ChannelType = 'telegram';
  public name = 'Telegram Bot API (Official Free Tier)';
  private config: TelegramAdapterConfig;
  private state: AdapterOperationalState = 'DISABLED';

  constructor(config: TelegramAdapterConfig = {}) {
    const botToken = config.botToken || process.env.TELEGRAM_BOT_TOKEN;
    const webhookSecretToken = config.webhookSecretToken || process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;
    const allowSimulation = config.allowSimulation ?? (process.env.NODE_ENV === 'test');

    this.config = {
      botToken,
      webhookSecretToken,
      allowSimulation,
    };

    if (this.config.allowSimulation) {
      this.state = 'SIMULATED';
    } else if (this.config.botToken) {
      this.state = 'CONFIGURED';
    } else {
      this.state = 'DISABLED';
    }
  }

  public getState(): AdapterOperationalState {
    return this.state;
  }

  public async verifyWebhook(
    headers: Record<string, string>,
    rawBody: string | Buffer
  ): Promise<WebhookVerificationResult> {
    if (this.state === 'DISABLED') {
      return {
        isValid: false,
        rawPayload: null,
        senderIdentifier: '',
        error: 'Telegram adapter is DISABLED: Bot token not configured',
      };
    }

    const secretHeader = headers['x-telegram-bot-api-secret-token'];

    if (this.state === 'SIMULATED') {
      try {
        const parsed = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString('utf-8'));
        const sender = parsed?.message?.from?.username || String(parsed?.message?.from?.id || 'sim_telegram_user');
        return {
          isValid: true,
          rawPayload: parsed,
          senderIdentifier: sender,
          signatureHeader: secretHeader,
          isSimulated: true,
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

    if (!this.config.webhookSecretToken) {
      return {
        isValid: false,
        rawPayload: null,
        senderIdentifier: '',
        error: 'Missing webhook secret token for Telegram signature verification',
      };
    }

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
    const isSim = this.state === 'SIMULATED';

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
      status: isSim ? 'simulated' : 'delivered',
      createdAt: msg?.date
        ? new Date(msg.date * 1000).toISOString()
        : new Date().toISOString(),
      metadata: {
        telegramMessageId: msg?.message_id,
        chatId: msg?.chat?.id,
        isSimulated: isSim,
      },
    };
  }

  public async dispatchOutboundMessage(
    message: UnifiedMessage
  ): Promise<{ externalMessageId: string; status: MessageDeliveryStatus }> {
    if (this.state === 'DISABLED') {
      return {
        externalMessageId: '',
        status: 'disabled',
      };
    }

    if (this.state === 'SIMULATED') {
      return {
        externalMessageId: `sim-tg-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        status: 'simulated',
      };
    }

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
      if (data?.ok) {
        this.state = 'CONNECTED';
        return {
          externalMessageId: String(data.result?.message_id),
          status: 'sent',
        };
      }
      return {
        externalMessageId: '',
        status: 'failed',
      };
    } catch {
      this.state = 'FAILED';
      return {
        externalMessageId: '',
        status: 'failed',
      };
    }
  }

  public async fetchHealthStatus(): Promise<AdapterHealthStatus> {
    const start = Date.now();

    if (this.state === 'DISABLED') {
      return {
        state: 'DISABLED',
        isHealthy: false,
        latencyMs: 0,
        details: 'Telegram Bot API adapter disabled (no bot token configured).',
      };
    }

    if (this.state === 'SIMULATED') {
      return {
        state: 'SIMULATED',
        isHealthy: true,
        latencyMs: Date.now() - start,
        details: 'Telegram Bot API adapter active in SIMULATED mode ($0.00, local test).',
        isSimulated: true,
      };
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${this.config.botToken}/getMe`);
      const data = await res.json();
      const healthy = Boolean(data?.ok);
      this.state = healthy ? 'CONNECTED' : 'FAILED';
      return {
        state: this.state,
        isHealthy: healthy,
        latencyMs: Date.now() - start,
        details: data?.ok ? `Connected to Telegram Bot @${data.result?.username}` : 'Telegram API authorization failed',
      };
    } catch (err: any) {
      this.state = 'FAILED';
      return {
        state: 'FAILED',
        isHealthy: false,
        latencyMs: Date.now() - start,
        details: `Telegram API error: ${err.message}`,
      };
    }
  }
}
