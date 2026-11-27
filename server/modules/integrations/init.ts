/**
 * @file server/modules/integrations/init.ts
 * Integration Subsystem Initialization - Registers all standard and Egyptian market adapters
 */

import { IntegrationRegistry } from './registry.ts';
import { TelegramChannelAdapter } from './adapters/telegram.ts';
import { WhatsAppCloudChannelAdapter } from './adapters/whatsappCloud.ts';
import { CequensChannelAdapter } from './adapters/cequens.ts';
import { WebChatChannelAdapter } from './adapters/webchat.ts';
import { EmailChannelAdapter } from './adapters/emailBridge.ts';
import { SipTelephonyAdapter } from './adapters/sipTelephony.ts';

let isInitialized = false;

export function initializeIntegrationAdapters(): void {
  if (isInitialized) return;

  // Register Channel Adapters
  IntegrationRegistry.registerChannelAdapter('telegram', new TelegramChannelAdapter());
  IntegrationRegistry.registerChannelAdapter('whatsapp_cloud', new WhatsAppCloudChannelAdapter());
  IntegrationRegistry.registerChannelAdapter('cequens_sms', new CequensChannelAdapter());
  IntegrationRegistry.registerChannelAdapter('webchat', new WebChatChannelAdapter());
  IntegrationRegistry.registerChannelAdapter('email', new EmailChannelAdapter());

  // Register Telephony Adapters
  const sipAdapter = new SipTelephonyAdapter();
  IntegrationRegistry.registerTelephonyAdapter('sip_egypt', sipAdapter);
  IntegrationRegistry.setDefaultTelephonyAdapter('sip_egypt');

  isInitialized = true;
}
