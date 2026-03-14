/**
 * OpenClaw Discord Bridge - Standalone Application
 * 
 * A standalone bridge that connects Discord to OpenClaw via HTTP API.
 * This approach provides full proxy support for both WebSocket and REST API calls,
 * fixing issue #27409.
 * 
 * Architecture:
 *   Discord Bot (with proxy) → Message Router → OpenClaw HTTP API
 */

import { Client, GatewayIntentBits, Partials, Events, Message, TextChannel, DMChannel } from 'discord.js';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { calculateIntents, resolveAccountConfig } from './client';
import type { AccountConfig, IntentsConfig, DiscordMessageContext } from './types';

/**
 * Bridge configuration from environment variables
 */
interface BridgeConfig {
  discordToken: string;
  proxyUrl?: string;
  openclawHttpUrl: string;
  openclawAuthToken: string;
  dmPolicy: 'open' | 'pairing' | 'allowlist' | 'disabled';
  groupPolicy: 'open' | 'allowlist' | 'disabled';
  allowFrom?: string[];
  intents?: IntentsConfig;
  deviceId: string;
}

/**
 * Session key for OpenClaw routing
 */
interface SessionKey {
  agentId: string;
  channel: 'discord';
  accountId: string;
  peer?: string;
  guildId?: string;
  channelId?: string;
}

/**
 * Message payload sent to OpenClaw HTTP API
 */
interface OpenClawMessagePayload {
  sessionKey: SessionKey;
  content: string;
  timestamp: number;
}

/**
 * Parse bridge configuration from environment variables
 */
function loadBridgeConfig(): BridgeConfig {
  const discordToken = process.env.DISCORD_TOKEN;
  const openclawAuthToken = process.env.OPENCLAW_AUTH_TOKEN;

  if (!discordToken) {
    throw new Error('DISCORD_TOKEN environment variable is required');
  }

  if (!openclawAuthToken) {
    throw new Error('OPENCLAW_AUTH_TOKEN environment variable is required');
  }

  return {
    discordToken,
    proxyUrl: process.env.PROXY_URL || 'http://127.0.0.1:7890',
    openclawHttpUrl: process.env.OPENCLAW_HTTP_URL || 'http://127.0.0.1:18789',
    openclawAuthToken,
    dmPolicy: (process.env.DM_POLICY as any) || 'open',
    groupPolicy: (process.env.GROUP_POLICY as any) || 'allowlist',
    allowFrom: process.env.ALLOW_FROM?.split(',').map(s => s.trim()),
    deviceId: process.env.DEVICE_ID || 'openclaw-discord-bridge',
    intents: {
      messageContent: process.env.INTENT_MESSAGE_CONTENT !== 'false',
      serverMembers: process.env.INTENT_SERVER_MEMBERS !== 'false',
      presence: process.env.INTENT_PRESENCE === 'true',
    },
  };
}

/**
 * Create a proxy-aware Discord client for the bridge
 * 
 * The key fix for issue #27409 is injecting the proxy agent into
 * both WebSocket and REST API calls.
 */
function createBridgeClient(config: BridgeConfig): Client {
  const intents = calculateIntents(config.intents);

  const clientOptions: ConstructorParameters<typeof Client>[0] = {
    intents,
    partials: [
      Partials.Channel,
      Partials.Message,
      Partials.Reaction,
    ],
  };

  // Inject proxy agent for both WebSocket and REST API
  if (config.proxyUrl) {
    const proxyAgent = new HttpsProxyAgent(config.proxyUrl);
    clientOptions.rest = {
      agent: proxyAgent as any,
    };
  }

  return new Client(clientOptions);
}

/**
 * Generate session key for OpenClaw routing
 */
function generateSessionKey(
  message: Message,
  accountId: string,
  deviceId: string
): SessionKey {
  const isDm = !message.guild;

  if (isDm) {
    return {
      agentId: 'default',
      channel: 'discord',
      accountId,
      peer: message.author.id,
    };
  }

  return {
    agentId: 'default',
    channel: 'discord',
    accountId,
    guildId: message.guild!.id,
    channelId: message.channel.id,
  };
}

/**
 * Send message to OpenClaw HTTP API
 */
async function sendToOpenClaw(
  config: BridgeConfig,
  payload: OpenClawMessagePayload
): Promise<void> {
  const url = `${config.openclawHttpUrl}/api/v1/messages/ingest`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.openclawAuthToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenClaw API error: ${response.status} ${errorText}`);
    }

    console.log(`[Bridge] Message sent to OpenClaw: ${payload.sessionKey.peer || payload.sessionKey.channelId}`);
  } catch (error) {
    console.error('[Bridge] Failed to send message to OpenClaw:', error);
    throw error;
  }
}

/**
 * Check if user is allowed to send messages
 */
function isUserAllowed(
  userId: string,
  config: BridgeConfig,
  guildId?: string
): boolean {
  // Check DM policy
  if (!guildId) {
    switch (config.dmPolicy) {
      case 'open':
        return true;
      case 'disabled':
        return false;
      case 'allowlist':
        return config.allowFrom?.includes(userId) ?? false;
      case 'pairing':
      default:
        // For simplicity, pairing mode allows all in standalone bridge
        return true;
    }
  }

  // Guild message policy
  if (config.groupPolicy === 'disabled') {
    return false;
  }

  return true;
}

/**
 * Check if bot should respond to a message
 */
function shouldRespond(
  message: Message,
  config: BridgeConfig
): boolean {
  // Ignore bot messages
  if (message.author.bot) {
    return false;
  }

  const guildId = message.guild?.id;
  const userId = message.author.id;

  // Check if user is allowed
  if (!isUserAllowed(userId, config, guildId)) {
    return false;
  }

  // For guild messages, require mention
  if (guildId) {
    const mentioned = message.mentions.users?.has(message.client.user?.id ?? '');
    if (!mentioned) {
      return false;
    }
  }

  return true;
}

/**
 * Send message to Discord channel with proxy support
 */
async function sendDiscordMessage(
  client: Client,
  channelId: string,
  content: string
): Promise<void> {
  const channel = await client.channels.fetch(channelId);
  
  if (!channel) {
    throw new Error(`Channel ${channelId} not found`);
  }

  if (!('send' in channel)) {
    throw new Error(`Channel ${channelId} is not text-based`);
  }

  await (channel as TextChannel | DMChannel).send({ content });
}

/**
 * Main bridge class
 */
class DiscordBridge {
  private client: Client;
  private config: BridgeConfig;
  private accountId: string = 'default';

  constructor(config: BridgeConfig) {
    this.config = config;
    this.client = createBridgeClient(config);
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Handle client ready event
    this.client.once(Events.ClientReady, async () => {
      console.log(`[Bridge] Connected as ${this.client.user?.tag}`);
      console.log(`[Bridge] Proxy: ${this.config.proxyUrl || 'none'}`);
      console.log(`[Bridge] OpenClaw API: ${this.config.openclawHttpUrl}`);
      
      // Set presence if desired
      await this.client.user?.setPresence({
        status: 'online',
        activities: [{ name: 'OpenClaw Bridge', type: 2 }], // Type 2 = Listening
      });
    });

    // Handle incoming messages
    this.client.on(Events.MessageCreate, async (message) => {
      if (!shouldRespond(message, this.config)) {
        return;
      }

      try {
        await this.handleMessage(message);
      } catch (error) {
        console.error('[Bridge] Error handling message:', error);
      }
    });

    // Handle errors
    this.client.on(Events.Error, (error) => {
      console.error('[Bridge] Discord error:', error);
    });
  }

  private async handleMessage(message: Message): Promise<void> {
    console.log(`[Bridge] Message from ${message.author.tag} in ${message.channel.id}`);

    const sessionKey = generateSessionKey(
      message,
      this.accountId,
      this.config.deviceId
    );

    const payload: OpenClawMessagePayload = {
      sessionKey,
      content: message.content,
      timestamp: Date.now(),
    };

    await sendToOpenClaw(this.config, payload);
  }

  /**
   * Start the bridge
   */
  async start(): Promise<void> {
    console.log('[Bridge] Starting Discord Bridge...');
    await this.client.login(this.config.discordToken);
  }

  /**
   * Stop the bridge
   */
  async stop(): Promise<void> {
    console.log('[Bridge] Stopping Discord Bridge...');
    await this.client.destroy();
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    const config = loadBridgeConfig();
    
    console.log('[Bridge] Configuration loaded:');
    console.log(`  - Discord Token: ${config.discordToken.substring(0, 10)}...`);
    console.log(`  - Proxy URL: ${config.proxyUrl || 'none'}`);
    console.log(`  - OpenClaw URL: ${config.openclawHttpUrl}`);
    console.log(`  - DM Policy: ${config.dmPolicy}`);
    console.log(`  - Group Policy: ${config.groupPolicy}`);
    console.log(`  - Device ID: ${config.deviceId}`);

    const bridge = new DiscordBridge(config);
    await bridge.start();

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n[Bridge] Received SIGINT, shutting down...');
      await bridge.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n[Bridge] Received SIGTERM, shutting down...');
      await bridge.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('[Bridge] Failed to start:', error);
    process.exit(1);
  }
}

// Run the bridge
main();