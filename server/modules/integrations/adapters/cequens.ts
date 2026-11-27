/**
 * @file server/modules/integrations/adapters/cequens.ts
 * CEQUENS Egyptian CPaaS Omnichannel & SMS Adapter (Egypt Market Focus)
 * Strict State Separation: DISABLED (default), CONFIGURED, CONNECTED, SIMULATED, FAILED
 */

import crypto from 'crypto';
import { ChannelType, UnifiedMessage, UUID } from '../../../core/types.ts';
import {
  ChannelAdapter,
  WebhookVerificationResult,
  AdapterOperationalState,
  AdapterHealthStatus,
  CequensAdapterConfig,
  MessageDeliveryStatus,
} from '../contracts.ts';

export class CequensChannelAdapter implements ChannelAdapter {
  public channelType: ChannelType = 'sms';
  public name = 'CEQUENS CPaaS Egypt (SMS & Omnichannel)';
  private config: CequensAdapterConfig;
  private state: AdapterOperationalState = 'DISABLED';

  constructor(config: CequensAdapterConfig = {}) {
    const apiKey = config.apiKey || process.env.CEQUENS_API_KEY;
    const webhookSecret = config.webhookSecret || process.env.CEQUENS_WEBHOOK_SECRET;
    const allowSimulation = config.allowSimulation ?? (process.env.NODE_ENV === 'test');

    this.config = {
      apiKey,
      webhookSecret,
      senderName: config.senderName || process.env.CEQUENS_SENDER_NAME || 'OmniFlow',
      allowSimulation,
    };

    if (this.config.allowSimulation) {
      this.state = 'SIMULATED';
    } else if (this.config.apiKey) {
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
        error: 'CEQUENS adapter is DISABLED: No API key or webhook secret configured',
      };
    }

    const authHeader = headers['authorization'] || headers['Authorization'];

    if (this.state === 'SIMULATED') {
      try {
        const parsed = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString('utf-8'));
        const sender = parsed?.sender || parsed?.from || parsed?.mobileNumber || 'cequens_sim_client';
        return {
          isValid: true,
          rawPayload: parsed,
          senderIdentifier: sender,
          signatureHeader: authHeader,
          isSimulated: true,
        };
      } catch (err: any) {
        return {
          isValid: false,
          rawPayload: null,
          senderIdentifier: '',
          error: `Malformed CEQUENS JSON: ${err.message}`,
        };
      }
    }

    // Live mode verification with webhook secret
    if (!this.config.webhookSecret) {
      return {
        isValid: false,
        rawPayload: null,
        senderIdentifier: '',
        error: 'Missing webhook secret for CEQUENS signature verification',
      };
    }

    const expected = `Bearer ${this.config.webhookSecret}`;
    const provided = authHeader || '';
    const isValid =
      provided.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

    if (!isValid) {
      return {
        isValid: false,
        rawPayload: null,
        senderIdentifier: '',
        error: 'Invalid CEQUENS webhook authorization header',
      };
    }

    try {
      const parsed = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString('utf-8'));
      const sender = parsed?.sender || parsed?.from || parsed?.mobileNumber || 'cequens_client';
      return {
        isValid: true,
        rawPayload: parsed,
        senderIdentifier: sender,
        signatureHeader: authHeader,
      };
    } catch (err: any) {
      return {
        isValid: false,
        rawPayload: null,
        senderIdentifier: '',
        error: `Malformed CEQUENS JSON payload: ${err.message}`,
      };
    }
  }

  public async normalizeInboundMessage(payload: any, organizationId: UUID): Promise<UnifiedMessage> {
    const sender = payload?.sender || payload?.from || payload?.mobileNumber || '201000000000';
    const text = payload?.messageText || payload?.body || payload?.text || '[رسالة نصية واردة]';
    const isSim = this.state === 'SIMULATED';

    return {
      id: crypto.randomUUID(),
      organizationId,
      customerId: `cust-sms-${sender}`,
      conversationId: `conv-sms-${sender}`,
      channel: 'sms',
      direction: 'inbound',
      type: 'text',
      body: text,
      sender: {
        id: `cust-sms-${sender}`,
        name: `عميل الرسائل (${sender})`,
        type: 'customer',
      },
      status: isSim ? 'simulated' : 'delivered',
      createdAt: payload?.timestamp || new Date().toISOString(),
      metadata: {
        cequensMessageId: payload?.messageId || payload?.id,
        networkOperator: payload?.operator || 'Vodafone / Orange / WE / e&',
        countryCode: 'EG',
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
        externalMessageId: `sim-ceq-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        status: 'simulated',
      };
    }

    try {
      const res = await fetch('https://api.cequens.com/sms/v1/messages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          senderName: this.config.senderName,
          messageText: message.body,
          recipients: [(message.metadata?.recipient as string) || message.conversationId?.replace('conv-sms-', '')],
          messageType: 'text',
        }),
      });
      const data = await res.json();
      if (data?.data?.messageId || data?.success) {
        this.state = 'CONNECTED';
        return {
          externalMessageId: data?.data?.messageId || `ceq-${Date.now()}`,
          status: 'sent',
        };
      }
      return { externalMessageId: '', status: 'failed' };
    } catch {
      this.state = 'FAILED';
      return { externalMessageId: '', status: 'failed' };
    }
  }

  public async fetchHealthStatus(): Promise<AdapterHealthStatus> {
    const start = Date.now();

    if (this.state === 'DISABLED') {
      return {
        state: 'DISABLED',
        isHealthy: false,
        latencyMs: 0,
        details: 'CEQUENS Egyptian CPaaS adapter disabled (no API credentials configured).',
      };
    }

    if (this.state === 'SIMULATED') {
      return {
        state: 'SIMULATED',
        isHealthy: true,
        latencyMs: Date.now() - start,
        details: 'CEQUENS Egyptian CPaaS adapter active in isolated SIMULATED mode ($0.00, no live SMS dispatch).',
        isSimulated: true,
      };
    }

    try {
      const res = await fetch('https://api.cequens.com/sms/v1/account/balance', {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      const data = await res.json();
      const healthy = res.status === 200;
      this.state = healthy ? 'CONNECTED' : 'FAILED';
      return {
        state: this.state,
        isHealthy: healthy,
        latencyMs: Date.now() - start,
        details: data?.balance !== undefined ? `Connected to CEQUENS Egypt API, balance: ${data.balance}` : 'API reachable',
      };
    } catch (err: any) {
      this.state = 'FAILED';
      return {
        state: 'FAILED',
        isHealthy: false,
        latencyMs: Date.now() - start,
        details: `CEQUENS Egypt connection failed: ${err.message}`,
      };
    }
  }
}
