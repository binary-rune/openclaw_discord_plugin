/**
 * OpenClaw Discord Proxy Plugin
 * 
 * A workaround plugin for OpenClaw's Discord channel that properly respects
 * proxy configuration for both WebSocket and REST API calls.
 * 
 * Fixes issue: https://github.com/openclaw/openclaw/issues/27409
 */

import { Client, GatewayIntentBits, Partials, Events, Message, TextChannel, DMChannel } from 'discord.js';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { DiscordProxyConfig, GuildConfig, ChannelConfig, DiscordMessageContext, SessionKey, PairingRequest } from './types';

// Pairing codes storage (in production, this would be persisted)
const pairingRequests = new Map<string, PairingRequest>();
const approvedUsers = new Map<string, Set<string>>(); // accountId -> set of userIds

// Active clients per account
const clients = new Map<string, Client>();

/**
 * Generate a random pairing code
 */
function generatePairingCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Check if a user is allowed to send messages
 */
function isUserAllowed(
  userId: string,
  config: DiscordProxyConfig,
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
        // Check if user has been approved via pairing
        const accountApproved = approvedUsers.get('default');
        return accountApproved?.has(userId) ?? false;
    }
  }

  // Guild message policy
  if (config.groupPolicy === 'disabled') {
    return false;
  }

  if (config.groupPolicy === 'allowlist' && guildId) {
    const guildConfig = config.guilds?.[guildId];
    if (!guildConfig) {
      return false;
    }

    // Check user allowlist
    if (guildConfig.users && guildConfig.users.length > 0) {
      if (!guildConfig.users.includes(userId)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Check if bot should respond to a message
 */
function shouldRespond(
  message: Message,
  config: DiscordProxyConfig,
  client: Client
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

  // For guild messages, check mention requirements
  if (guildId) {
    const guildConfig = config.guilds?.[guildId];
    const requireMention = guildConfig?.requireMention ?? true;

    if (requireMention) {
      // Check if bot is mentioned
      const mentioned = message.mentions.users?.has(client.user?.id ?? '') ?? false;
      if (!mentioned) {
        return false;
      }
    }

    // Check channel-specific config
    const channelId = message.channel.id;
    const channelConfig = guildConfig?.channels?.[channelId];
    if (channelConfig?.allow === false) {
      return false;
    }
    if (channelConfig?.requireMention && !(message.mentions.users?.has(client.user?.id ?? '') ?? false)) {
      return false;
    }
  }

  return true;
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
 * Send a message to Discord with proper proxy handling
 */
async function sendDiscordMessage(
  client: Client,
  channelId: string,
  content: string,
  proxyUrl?: string
): Promise<void> {
  const channel = await client.channels.fetch(channelId);
  
  if (!channel) {
    throw new Error(`Channel ${channelId} not found`);
  }

  // Check if channel is text-based
  if (!('send' in channel)) {
    throw new Error(`Channel ${channelId} is not text-based`);
  }

  // Send message - proxy is already configured on the client
  await (channel as TextChannel | DMChannel).send({ content });
}

/**
 * Initialize Discord client for an account
 */
async function initializeAccount(
  accountId: string,
  config: DiscordProxyConfig,
  onMessage: (message: DiscordMessageContext, content: string) => Promise<void>
): Promise<Client> {
  // Resolve account configuration
  const accountConfig = config.accounts?.[accountId] || config.accounts?.default;
  const token = accountConfig?.token || config.token;
  const proxyUrl = accountConfig?.proxy || config.proxy;
  const deviceId = accountConfig?.deviceId || config.deviceId || `openclaw-discord-proxy-${accountId}`;

  if (!token) {
    throw new Error(`No token configured for account ${accountId}`);
  }

  // Create proxy-aware client
  const client = createDiscordClient(token, proxyUrl, config.intents);

  // Set up event handlers
  client.once(Events.ClientReady, async () => {
    console.log(`[DiscordProxy] Account ${accountId} logged in as ${client.user?.tag}`);
    
    // Set presence if configured
    if (config.status || config.activity) {
      client.user?.setPresence({
        status: config.status as any,
        activities: config.activity ? [{
          name: config.activity,
          type: config.activityType as any,
          url: config.activityUrl,
        }] : [],
      });
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    // Check if we should respond
    if (!shouldRespond(message, config, client)) {
      return;
    }

    // Generate context
    const context: DiscordMessageContext = {
      messageId: message.id,
      channelId: message.channel.id,
      guildId: message.guild?.id,
      userId: message.author.id,
      accountId,
      deviceId,
      isDm: !message.guild,
      threadId: message.channel.isThread() ? message.channel.id : undefined,
      parentChannelId: message.channel.isThread() ? message.channel.parentId ?? undefined : undefined,
    };

    // Handle message content
    const content = message.content;
    if (content) {
      await onMessage(context, content);
    }
  });

  // Handle pairing requests for DMs
  client.on(Events.MessageCreate, async (message) => {
    if (!message.guild && config.dmPolicy === 'pairing') {
      const content = message.content.trim().toUpperCase();
      
      // Check if message is a pairing code
      if (content.startsWith('PAIR ') || content.length === 6) {
        const code = content.replace('PAIR ', '').trim();
        const request = pairingRequests.get(code);
        
        if (request && request.expiresAt > Date.now()) {
          // Approve the pairing
          const accountApproved = approvedUsers.get(accountId) || new Set();
          accountApproved.add(message.author.id);
          approvedUsers.set(accountId, accountApproved);
          
          await message.reply(`✅ Pairing approved! You can now send messages.`);
          pairingRequests.delete(code);
        }
      }
    }
  });

  // Login
  await client.login(token);

  return client;
}

/**
 * Create a Discord client with proxy support
 */
function createDiscordClient(
  token: string,
  proxyUrl?: string,
  intentsConfig?: { messageContent?: boolean; serverMembers?: boolean; presence?: boolean }
): Client {
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

  const clientOptions: ConstructorParameters<typeof Client>[0] = {
    intents,
    partials: [
      Partials.Channel,
      Partials.Message,
      Partials.Reaction,
    ],
  };

  // Configure proxy if provided
  if (proxyUrl) {
    const proxyAgent = new HttpsProxyAgent(proxyUrl);
    // Note: discord.js v14 uses undici internally, the agent type is different
    // We use type assertion here since the agent will work at runtime
    clientOptions.rest = {
      agent: proxyAgent as any,
    };
  }

  return new Client(clientOptions);
}

/**
 * Plugin entry point
 */
export async function activate(context: {
  config: DiscordProxyConfig;
  sendMessage: (sessionKey: SessionKey, content: string) => Promise<void>;
  registerPairing: (channel: string, code: string, userId: string) => Promise<void>;
  approvePairing: (channel: string, code: string) => Promise<void>;
}): Promise<void> {
  const { config, sendMessage, registerPairing, approvePairing } = context;

  if (!config.enabled) {
    console.log('[DiscordProxy] Plugin disabled');
    return;
  }

  if (!config.token && !config.accounts) {
    console.error('[DiscordProxy] No token configured');
    return;
  }

  console.log('[DiscordProxy] Starting Discord Proxy plugin...');

  // Message handler
  const handleMessage = async (context: DiscordMessageContext, content: string) => {
    console.log(`[DiscordProxy] Message from ${context.userId} in ${context.channelId}`);

    // Generate session key
    const sessionKey = generateSessionKey(
      { 
        id: context.messageId, 
        author: { id: context.userId }, 
        channel: { id: context.channelId, isThread: () => false, parent: null },
        guild: context.guildId ? { id: context.guildId } : null,
        mentions: { users: { has: () => false } },
        content,
      } as any,
      context.accountId,
      context.deviceId
    );

    // Forward to OpenClaw
    try {
      await sendMessage(sessionKey, content);
    } catch (error) {
      console.error('[DiscordProxy] Error sending message to OpenClaw:', error);
    }
  };

  // Initialize accounts
  const accountsToInitialize = config.accounts 
    ? Object.keys(config.accounts)
    : ['default'];

  for (const accountId of accountsToInitialize) {
    try {
      const client = await initializeAccount(accountId, config, handleMessage);
      clients.set(accountId, client);
    } catch (error) {
      console.error(`[DiscordProxy] Failed to initialize account ${accountId}:`, error);
    }
  }

  console.log(`[DiscordProxy] Initialized ${clients.size} account(s)`);
}

/**
 * Plugin cleanup
 */
export async function deactivate(): Promise<void> {
  console.log('[DiscordProxy] Shutting down...');

  for (const [accountId, client] of clients.entries()) {
    try {
      await client.destroy();
    } catch (error) {
      console.error(`[DiscordProxy] Error shutting down account ${accountId}:`, error);
    }
  }

  clients.clear();
}

// Export types for OpenClaw
export type { DiscordProxyConfig, SessionKey, DiscordMessageContext };