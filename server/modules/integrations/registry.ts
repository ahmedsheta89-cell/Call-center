/**
 * @file server/modules/integrations/registry.ts
 * Provider Adapter Architecture - Registry, Discovery & Per-Tenant Adapter Resolution
 */

import { ChannelType } from '../../core/types.ts';
import { ChannelAdapter, TelephonyAdapter } from './contracts.ts';
import { WhatsAppCloudChannelAdapter } from './adapters/whatsappCloud.ts';
import { WebChatChannelAdapter } from './adapters/webchat.ts';
import { EmailChannelAdapter } from './adapters/emailBridge.ts';
import { CequensChannelAdapter } from './adapters/cequens.ts';
import { TelegramChannelAdapter } from './adapters/telegram.ts';
import { SipTelephonyAdapter } from './adapters/sipTelephony.ts';

export class IntegrationRegistry {
  private static channelAdapters: Map<string, ChannelAdapter> = new Map();
  private static telephonyAdapters: Map<string, TelephonyAdapter> = new Map();
  private static defaultTelephonyAdapter: string = 'sip_egypt';

  public static registerChannelAdapter(id: string, adapter: ChannelAdapter): void {
    this.channelAdapters.set(id, adapter);
  }

  public static getChannelAdapter(id: string): ChannelAdapter | undefined {
    return this.channelAdapters.get(id);
  }

  public static listChannelAdapters(): Array<{ id: string; name: string; channelType: ChannelType }> {
    return Array.from(this.channelAdapters.entries()).map(([id, a]) => ({
      id,
      name: a.name,
      channelType: a.channelType,
    }));
  }

  public static registerTelephonyAdapter(id: string, adapter: TelephonyAdapter): void {
    this.telephonyAdapters.set(id, adapter);
  }

  public static getTelephonyAdapter(id?: string): TelephonyAdapter | undefined {
    const targetId = id || this.defaultTelephonyAdapter;
    return this.telephonyAdapters.get(targetId) || this.telephonyAdapters.values().next().value;
  }

  public static setDefaultTelephonyAdapter(id: string): void {
    this.defaultTelephonyAdapter = id;
  }

  public static listTelephonyAdapters(): Array<{ id: string; name: string }> {
    return Array.from(this.telephonyAdapters.entries()).map(([id, a]) => ({
      id,
      name: a.name,
    }));
  }

  /**
   * Resolves a ChannelAdapter configured specifically for a tenant's persisted configuration.
   * Preserves strict default DISABLED state unless real non-placeholder credentials exist
   * or explicit allowSimulation=true is requested.
   */
  public static resolveChannelAdapterForTenant(
    channelKey: string,
    storedConfig?: Record<string, any>,
    allowSimulation = false
  ): ChannelAdapter {
    const norm = channelKey.replace(/^chan-/, '').toLowerCase();
    const cfg = storedConfig || {};

    if (norm === 'webchat') {
      return this.channelAdapters.get('webchat') || new WebChatChannelAdapter();
    }
    if (norm === 'whatsapp' || norm === 'whatsapp_cloud' || norm === 'messenger') {
      return new WhatsAppCloudChannelAdapter({
        accessToken: cfg.accessToken || cfg.apiToken,
        phoneNumberId: cfg.phoneNumberId,
        wabaId: cfg.wabaId,
        appSecret: cfg.appSecret || cfg.webhookSecret,
        verifyToken: cfg.verifyToken,
        allowSimulation,
      });
    }
    if (norm === 'sms' || norm === 'cequens' || norm === 'cequens_sms') {
      return new CequensChannelAdapter({
        apiKey: cfg.apiKey || cfg.apiToken,
        senderName: cfg.senderName,
        webhookSecret: cfg.webhookSecret,
        allowSimulation,
      });
    }
    if (norm === 'telegram') {
      return new TelegramChannelAdapter({
        botToken: cfg.botToken || cfg.apiToken,
        webhookSecretToken: cfg.webhookSecretToken || cfg.webhookSecret,
        allowSimulation,
      });
    }
    if (norm === 'email') {
      return new EmailChannelAdapter({
        smtpHost: cfg.smtpHost,
        smtpPort: cfg.smtpPort ? Number(cfg.smtpPort) : undefined,
        smtpUser: cfg.smtpUser || cfg.user,
        smtpPass: cfg.smtpPass || cfg.smtpPassword || cfg.password,
        webhookSecret: cfg.webhookSecret,
        allowSimulation,
      });
    }

    return (
      this.channelAdapters.get(norm) ||
      this.channelAdapters.get(channelKey) ||
      new WebChatChannelAdapter()
    );
  }

  /**
   * Resolves a TelephonyAdapter configured specifically for a tenant's persisted voice configuration.
   */
  public static resolveTelephonyAdapterForTenant(
    storedConfig?: Record<string, any>,
    allowSimulation = false
  ): TelephonyAdapter {
    const cfg = storedConfig || {};
    return new SipTelephonyAdapter({
      sipServerUri: cfg.sipServerUri || cfg.sipHost,
      sipUsername: cfg.sipUsername || cfg.username,
      sipPassword: cfg.sipPassword || cfg.password,
      defaultCallerId: cfg.defaultCallerId,
      allowSimulation,
    });
  }
}
