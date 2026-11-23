/**
 * @file server/modules/integrations/adapters/whatsappCloud.ts
 * Meta WhatsApp Cloud API Official Adapter (with Hub Signature Verification & Template Support)
 * Strict State Separation: DISABLED (default), CONFIGURED, CONNECTED, SIMULATED, FAILED
 */

import crypto from 'crypto';
import { ChannelType, UnifiedMessage, UUID } from '../../../core/types.ts';
import {
  ChannelAdapter,
  WebhookVerificationResult,
  WhatsAppCloudApiConfig,
  AdapterOperationalState,
  AdapterHealthStatus,
  MessageDeliveryStatus,
} from '../contracts.ts';

export class WhatsAppCloudChannelAdapter implements ChannelAdapter {
  public channelType: ChannelType = 'whatsapp';
  public name = 'Meta WhatsApp Cloud API (Official)';
  private config: WhatsAppCloudApiConfig;
  private state: AdapterOperationalState = 'DISABLED';

  constructor(config: WhatsAppCloudApiConfig = {}) {
    const accessToken = config.accessToken || process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = config.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
    const appSecret = config.appSecret || process.env.WHATSAPP_APP_SECRET;
    const allowSimulation = config.allowSimulation ?? (process.env.NODE_ENV === 'test');

    this.config = {
      accessToken,
      phoneNumberId,
      wabaId: config.wabaId || process.env.WHATSAPP_WABA_ID,
      appSecret,
      verifyToken: config.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN,
      rateLimitPerSecond: config.rateLimitPerSecond || 50,
      allowSimulation,
    };

    if (this.config.accessToken && this.config.phoneNumberId) {
      this.state = 'CONFIGURED';
    } else if (this.config.allowSimulation) {
      this.state = 'SIMULATED';
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
        error: 'WhatsApp Cloud adapter is DISABLED: Credentials not configured',
      };
    }

    const signature = headers['x-hub-signature-256'] || headers['X-Hub-Signature-256'];

    if (this.state === 'SIMULATED') {
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
          isSimulated: true,
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

    if (!this.config.appSecret) {
      return {
        isValid: false,
        rawPayload: null,
        senderIdentifier: '',
        error: 'Missing app secret for WhatsApp webhook signature validation',
      };
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
    const isSim = this.state === 'SIMULATED';

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
      status: isSim ? 'simulated' : 'delivered',
      createdAt: msg?.timestamp
        ? new Date(Number(msg.timestamp) * 1000).toISOString()
        : new Date().toISOString(),
      metadata: {
        whatsappMessageId: msg?.id,
        phoneNumberId: value?.metadata?.phone_number_id,
        displayPhoneNumber: value?.metadata?.display_phone_number,
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
        externalMessageId: `sim-wamid.HBgL${Date.now()}${crypto.randomBytes(6).toString('hex')}`,
        status: 'simulated',
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
        this.state = 'CONNECTED';
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
        details: 'Meta WhatsApp Cloud API adapter disabled (missing access token or phone number ID).',
      };
    }

    if (this.state === 'SIMULATED') {
      return {
        state: 'SIMULATED',
        isHealthy: true,
        latencyMs: Date.now() - start,
        details: 'WhatsApp Cloud API adapter active in SIMULATED mode ($0.00, local testing only).',
        isSimulated: true,
      };
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${this.config.phoneNumberId}?access_token=${this.config.accessToken}`
      );
      const data = await res.json();
      const healthy = Boolean(data?.id);
      this.state = healthy ? 'CONNECTED' : 'FAILED';
      return {
        state: this.state,
        isHealthy: healthy,
        latencyMs: Date.now() - start,
        details: data?.id ? `Connected to WhatsApp Cloud API, Phone ID ${data.id}` : 'Meta Graph API token error',
      };
    } catch (err: any) {
      this.state = 'FAILED';
      return {
        state: 'FAILED',
        isHealthy: false,
        latencyMs: Date.now() - start,
        details: `Graph API connection error: ${err.message}`,
      };
    }
  }
}
