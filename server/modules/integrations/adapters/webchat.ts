/**
 * @file server/modules/integrations/adapters/webchat.ts
 * Website Live Chat Zero-Cost Local Adapter
 */

import crypto from 'crypto';
import { ChannelType, UnifiedMessage, UUID } from '../../../core/types.ts';
import { ChannelAdapter, WebhookVerificationResult } from '../contracts.ts';

export class WebChatChannelAdapter implements ChannelAdapter {
  public channelType: ChannelType = 'webchat';
  public name = 'OmniFlow Web Chat Widget (Local Zero-Cost)';

  public async verifyWebhook(
    headers: Record<string, string>,
    rawBody: string | Buffer
  ): Promise<WebhookVerificationResult> {
    try {
      const parsed = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString('utf-8'));
      const sender = parsed?.visitorId || parsed?.sessionId || 'web_visitor';
      return {
        isValid: true,
        rawPayload: parsed,
        senderIdentifier: sender,
      };
    } catch (err: any) {
      return {
        isValid: false,
        rawPayload: null,
        senderIdentifier: '',
        error: `Malformed Webchat payload: ${err.message}`,
      };
    }
  }

  public async normalizeInboundMessage(payload: any, organizationId: UUID): Promise<UnifiedMessage> {
    const visitorId = payload?.visitorId || payload?.sessionId || 'visitor-anon';
    const visitorName = payload?.visitorName || `زائر الموقع (${visitorId.slice(-4)})`;
    const text = payload?.message || payload?.text || payload?.body || '[رسالة ويب]';

    return {
      id: crypto.randomUUID(),
      organizationId,
      customerId: `cust-web-${visitorId}`,
      conversationId: `conv-web-${visitorId}`,
      channel: 'webchat',
      direction: 'inbound',
      type: 'text',
      body: text,
      sender: {
        id: `cust-web-${visitorId}`,
        name: visitorName,
        type: 'customer',
      },
      status: 'delivered',
      createdAt: new Date().toISOString(),
      metadata: {
        visitorId,
        browser: payload?.browser || 'Chrome/Windows',
        pageUrl: payload?.pageUrl || '/support',
      },
    };
  }

  public async dispatchOutboundMessage(
    message: UnifiedMessage
  ): Promise<{ externalMessageId: string; status: 'sent' | 'delivered' | 'failed' }> {
    return {
      externalMessageId: `web-out-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      status: 'delivered',
    };
  }

  public async fetchHealthStatus(): Promise<{ isHealthy: boolean; latencyMs: number; details?: string }> {
    return {
      isHealthy: true,
      latencyMs: 1,
      details: 'Local Web Chat engine operational (0 external dependencies, $0.00)',
    };
  }
}
