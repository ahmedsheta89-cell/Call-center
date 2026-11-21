/**
 * @file server/modules/integrations/adapters/whatsappCloud.ts
 * Meta WhatsApp Cloud API Official Adapter (with Hub Signature Verification & Template Support)
 */

import crypto from 'crypto';
import { ChannelType, UnifiedMessage, UUID } from '../../../core/types.ts';
import { ChannelAdapter, WebhookVerificationResult, WhatsAppCloudApiConfig } from '../contracts.ts';

export class WhatsAppCloudChannelAdapter implements ChannelAdapter {
  public channelType: ChannelType = 'whatsapp';
  public name = 'Meta WhatsApp Cloud API (Official)';
  private config: Partial<WhatsAppCloudApiConfig> & { sandboxMode?: boolean };

  constructor(config: Partial<WhatsAppCloudApiConfig> & { sandboxMode?: boolean } = {}) {
    this.config = {
      sandboxMode: config.sandboxMode ?? true,
      ...config,
    };
  }

  public async verifyWebhook(
    headers: Record<string, string>,
    rawBody: string | Buffer
  ): Promise<WebhookVerificationResult> {
    const signature = headers['x-hub-signature-256'] || headers['X-Hub-Signature-256'];

    if (this.config.sandboxMode || !this.config.appSecret) {
      try {
        const parsed = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString('utf-8'));
        const entry = parsed?.entry?.[0];
        const change = entry?.changes?.[0];
        const contact = change?.value?.contacts?.[0];
        const sender = contact?.wa_id || change?.value?.messages?.[0]?.from || 'unknown_wa_sender';
        return {
          isValid: true,
          rawPayload: parsed,
          senderIdentifier: sender,
          signatureHeader: signature,
        };
      } catch (err: any) {
        return {
          isValid: false,
          rawPayload: null,
          senderIdentifier: '',
          error: `Malformed WhatsApp JSON: ${err.message}`,
        };
      }
    }

    if (!signature) {
      return {
        isValid: false,
        rawPayload: null,
        senderIdentifier: '',
        error: 'Missing X-Hub-Signature-256 header',
      };
    }

    const hmac = crypto.createHmac('sha256', this.config.appSecret);
    hmac.update(rawBody);
    const expectedSig = `sha256=${hmac.digest('hex')}`;

    const isValid =
      signature.length === expectedSig.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));

    if (!isValid) {
      return {
        isValid: false,
        rawPayload: null,
        senderIdentifier: '',
        error: 'Invalid HMAC-SHA256 signature',
      };
    }

    try {
      const parsed = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString('utf-8'));
      const entry = parsed?.entry?.[0];
      const change = entry?.changes?.[0];
      const contact = change?.value?.contacts?.[0];
      const sender = contact?.wa_id || change?.value?.messages?.[0]?.from || 'unknown_wa_sender';
      return {
        isValid: true,
        rawPayload: parsed,
        senderIdentifier: sender,
        signatureHeader: signature,
      };
    } catch (err: any) {
      return {
        isValid: false,
        rawPayload: null,
        senderIdentifier: '',
        error: `Malformed WhatsApp JSON payload: ${err.message}`,
      };
    }
  }

  public async normalizeInboundMessage(payload: any, organizationId: UUID): Promise<UnifiedMessage> {
    const entry = payload?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const msg = value?.messages?.[0] || payload;
    const contact = value?.contacts?.[0];

    const waId = msg?.from || contact?.wa_id || 'wa_customer';
    const customerName = contact?.profile?.name || `عميل واتساب (${waId.slice(-4)})`;
    const text = msg?.text?.body || msg?.body || (msg?.type ? `[رسالة من نوع ${msg.type}]` : 'رسالة واردة');

    return {
      id: crypto.randomUUID(),
      organizationId,
      customerId: `cust-wa-${waId}`,
      conversationId: `conv-wa-${waId}`,
      channel: 'whatsapp',
      direction: 'inbound',
      type: 'text',
      body: text,
      sender: {
        id: `cust-wa-${waId}`,
        name: customerName,
        type: 'customer',
      },
      status: 'delivered',
      createdAt: msg?.timestamp
        ? new Date(Number(msg.timestamp) * 1000).toISOString()
        : new Date().toISOString(),
      metadata: {
        whatsappMessageId: msg?.id,
        phoneNumberId: value?.metadata?.phone_number_id,
        displayPhoneNumber: value?.metadata?.display_phone_number,
      },
    };
  }

  public async dispatchOutboundMessage(
    message: UnifiedMessage
  ): Promise<{ externalMessageId: string; status: 'sent' | 'delivered' | 'failed' }> {
    if (this.config.sandboxMode || !this.config.accessToken || !this.config.phoneNumberId) {
      return {
        externalMessageId: `wamid.HBgL${Date.now()}${crypto.randomBytes(6).toString('hex')}`,
        status: 'delivered',
      };
    }

    try {
      const recipient = (message.metadata?.recipient as string) || message.conversationId?.replace('conv-wa-', '');
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${this.config.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: recipient,
            type: 'text',
            text: { preview_url: false, body: message.body },
          }),
        }
      );
      const data = await res.json();
      if (data?.messages?.[0]?.id) {
        return {
          externalMessageId: data.messages[0].id,
          status: 'sent',
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
    if (this.config.sandboxMode || !this.config.accessToken) {
      return {
        isHealthy: true,
        latencyMs: Date.now() - start,
        details: 'WhatsApp Cloud API Adapter running in local zero-cost simulation mode',
      };
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${this.config.phoneNumberId}?access_token=${this.config.accessToken}`
      );
      const data = await res.json();
      return {
        isHealthy: Boolean(data?.id),
        latencyMs: Date.now() - start,
        details: data?.id ? `Connected to WABA ID ${data.id}` : 'Meta Graph API token error',
      };
    } catch (err: any) {
      return {
        isHealthy: false,
        latencyMs: Date.now() - start,
        details: `Graph API connection error: ${err.message}`,
      };
    }
  }
}
