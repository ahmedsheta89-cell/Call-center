/**
 * @file server/modules/integrations/adapters/cequens.ts
 * CEQUENS Egyptian CPaaS Omnichannel & SMS Adapter (Egypt Market Focus)
 */

import crypto from 'crypto';
import { ChannelType, UnifiedMessage, UUID } from '../../../core/types.ts';
import { ChannelAdapter, WebhookVerificationResult } from '../contracts.ts';

export interface CequensAdapterConfig {
  apiKey?: string;
  senderName?: string;
  webhookSecret?: string;
  sandboxMode?: boolean;
}

export class CequensChannelAdapter implements ChannelAdapter {
  public channelType: ChannelType = 'sms';
  public name = 'CEQUENS CPaaS Egypt (SMS & Omnichannel)';
  private config: CequensAdapterConfig;

  constructor(config: CequensAdapterConfig = {}) {
    this.config = {
      sandboxMode: config.sandboxMode ?? true,
      senderName: config.senderName || 'OmniFlow',
      ...config,
    };
  }

  public async verifyWebhook(
    headers: Record<string, string>,
    rawBody: string | Buffer
  ): Promise<WebhookVerificationResult> {
    const authHeader = headers['authorization'] || headers['Authorization'];

    if (this.config.sandboxMode || !this.config.webhookSecret) {
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
          error: `Malformed CEQUENS JSON: ${err.message}`,
        };
      }
    }

    // Verify bearer token or API key header
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
      status: 'delivered',
      createdAt: payload?.timestamp || new Date().toISOString(),
      metadata: {
        cequensMessageId: payload?.messageId || payload?.id,
        networkOperator: payload?.operator || 'Vodafone / Orange / WE / e&',
        countryCode: 'EG',
      },
    };
  }

  public async dispatchOutboundMessage(
    message: UnifiedMessage
  ): Promise<{ externalMessageId: string; status: 'sent' | 'delivered' | 'failed' }> {
    if (this.config.sandboxMode || !this.config.apiKey) {
      return {
        externalMessageId: `ceq-msg-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        status: 'delivered',
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
        return {
          externalMessageId: data?.data?.messageId || `ceq-${Date.now()}`,
          status: 'sent',
        };
      }
      return { externalMessageId: '', status: 'failed' };
    } catch {
      return { externalMessageId: '', status: 'failed' };
    }
  }

  public async fetchHealthStatus(): Promise<{ isHealthy: boolean; latencyMs: number; details?: string }> {
    const start = Date.now();
    if (this.config.sandboxMode || !this.config.apiKey) {
      return {
        isHealthy: true,
        latencyMs: Date.now() - start,
        details: 'CEQUENS Egyptian CPaaS Adapter active in sandbox simulation mode ($0.00)',
      };
    }

    try {
      const res = await fetch('https://api.cequens.com/sms/v1/account/balance', {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      const data = await res.json();
      return {
        isHealthy: res.status === 200,
        latencyMs: Date.now() - start,
        details: data?.balance !== undefined ? `Account active, balance: ${data.balance}` : 'API reachable',
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
