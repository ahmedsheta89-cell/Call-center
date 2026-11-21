/**
 * @file server/modules/integrations/registry.ts
 * Provider Adapter Architecture - Registry & Discovery for Omnichannel & Telephony
 */

import { ChannelType, UUID } from '../../core/types.ts';
import { ChannelAdapter, TelephonyAdapter } from './contracts.ts';

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
}
