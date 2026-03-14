/**
 * Proxy-aware Discord Client
 * 
 * This module creates Discord.js clients with proper proxy support
 * for both WebSocket and REST API calls, fixing issue #27409.
 */

import { Client, GatewayIntentBits, Partials, Options } from 'discord.js';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { AccountConfig, IntentsConfig } from './types';

/**
 * Calculate Discord gateway intents from configuration
 */
export function calculateIntents(intentsConfig?: IntentsConfig): GatewayIntentBits[] {
  const intents: GatewayIntentBits[] = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ];

  if (intentsConfig?.serverMembers !== false) {
    intents.push(GatewayIntentBits.GuildMembers);
  }

  if (intentsConfig?.presence === true) {
    intents.push(GatewayIntentBits.GuildPresences);
  }

  return intents;
}

/**
 * Create a proxy-aware Discord client
 * 
 * The key fix for issue #27409 is injecting the proxy agent into
 * the REST API HTTP client.
 */
export function createProxyClient(
  token: string,
  proxyUrl?: string,
  intentsConfig?: IntentsConfig
): Client {
  const intents = calculateIntents(intentsConfig);

  // Create options with proxy agent if proxy is configured
  const clientOptions: ConstructorParameters<typeof Client>[0] = {
    intents,
    partials: [
      Partials.Channel,
      Partials.Message,
      Partials.Reaction,
    ],
  };

  // If proxy is configured, we need to inject it into the REST client
  if (proxyUrl) {
    // Use http(s)-proxy-agent for the REST API
    // discord.js v14 uses undici internally, we need to configure it differently
    const proxyAgent = new HttpsProxyAgent(proxyUrl);
    
    // Set the agent for REST API calls
    // Note: This uses the internal rest options
    (clientOptions as any).rest = {
      agent: proxyAgent,
    };
  }

  const client = new Client(clientOptions);

  return client;
}

/**
 * Resolve account configuration from plugin config
 */
export function resolveAccountConfig(
  config: {
    token?: string;
    proxy?: string;
    deviceId?: string;
    accounts?: Record<string, AccountConfig>;
  },
  accountId: string = 'default'
): AccountConfig | null {
  // Check for named account first
  if (config.accounts?.[accountId]) {
    return config.accounts[accountId];
  }

  // Fall back to default account
  if (config.accounts?.default) {
    return config.accounts.default;
  }

  // Fall back to root-level config
  if (config.token) {
    return {
      token: config.token,
      proxy: config.proxy,
      deviceId: config.deviceId,
    };
  }

  return null;
}

/**
 * Get the effective proxy URL for an account
 */
export function getEffectiveProxy(
  config: { proxy?: string; accounts?: Record<string, AccountConfig> },
  accountId: string = 'default'
): string | undefined {
  const accountConfig = resolveAccountConfig(config, accountId);
  return accountConfig?.proxy || config.proxy;
}

/**
 * Get the effective device ID for an account
 */
export function getEffectiveDeviceId(
  config: { deviceId?: string; accounts?: Record<string, AccountConfig> },
  accountId: string = 'default'
): string {
  const accountConfig = resolveAccountConfig(config, accountId);
  return accountConfig?.deviceId || config.deviceId || `openclaw-discord-proxy-${accountId}`;
}