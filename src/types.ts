/**
 * Discord Proxy Plugin Types
 */

/**
 * Plugin configuration interface
 */
export interface DiscordProxyConfig {
  /** Enable the Discord Proxy channel */
  enabled: boolean;
  /** Discord bot token */
  token: string;
  /** HTTP/HTTPS proxy URL */
  proxy?: string;
  /** Device identifier for session management */
  deviceId?: string;
  /** DM access policy */
  dmPolicy?: 'pairing' | 'allowlist' | 'open' | 'disabled';
  /** Guild message policy */
  groupPolicy?: 'open' | 'allowlist' | 'disabled';
  /** Guild-specific configuration */
  guilds?: Record<string, GuildConfig>;
  /** Allowed user IDs for DMs */
  allowFrom?: string[];
  /** Gateway intents configuration */
  intents?: IntentsConfig;
  /** Message streaming mode */
  streaming?: 'off' | 'partial' | 'block';
  /** Reply threading mode */
  replyToMode?: 'off' | 'first' | 'all';
  /** Message history limit */
  historyLimit?: number;
  /** Multiple bot account configuration */
  accounts?: Record<string, AccountConfig>;
  /** Bot status (online, idle, dnd, invisible) */
  status?: 'online' | 'idle' | 'dnd' | 'invisible';
  /** Bot activity name */
  activity?: string;
  /** Bot activity type (0=Playing, 1=Streaming, 2=Listening, 3=Watching, 4=Custom) */
  activityType?: number;
  /** Bot activity URL (for streaming) */
  activityUrl?: string;
}

/**
 * Guild-specific configuration
 */
export interface GuildConfig {
  /** Require @mention to respond */
  requireMention?: boolean;
  /** Allowed user IDs */
  users?: string[];
  /** Channel-specific configuration */
  channels?: Record<string, ChannelConfig>;
}

/**
 * Channel-specific configuration within a guild
 */
export interface ChannelConfig {
  /** Allow messages in this channel */
  allow?: boolean;
  /** Require @mention to respond in this channel */
  requireMention?: boolean;
}

/**
 * Gateway intents configuration
 */
export interface IntentsConfig {
  /** Message content intent */
  messageContent?: boolean;
  /** Server members intent */
  serverMembers?: boolean;
  /** Presence intent */
  presence?: boolean;
}

/**
 * Account-specific configuration
 */
export interface AccountConfig {
  /** Bot token for this account */
  token: string;
  /** Proxy URL for this account */
  proxy?: string;
  /** Device ID for this account */
  deviceId?: string;
}

/**
 * Discord message context for OpenClaw session routing
 */
export interface DiscordMessageContext {
  /** Message ID */
  messageId: string;
  /** Channel ID */
  channelId: string;
  /** Guild ID (if applicable) */
  guildId?: string;
  /** User ID */
  userId: string;
  /** Account ID */
  accountId: string;
  /** Device ID */
  deviceId: string;
  /** Is DM */
  isDm: boolean;
  /** Thread ID (if applicable) */
  threadId?: string;
  /** Parent channel ID (for threads) */
  parentChannelId?: string;
}

/**
 * Pairing request for DM access
 */
export interface PairingRequest {
  /** Pairing code */
  code: string;
  /** User ID */
  userId: string;
  /** Channel ID */
  channelId: string;
  /** Expiration timestamp */
  expiresAt: number;
}

/**
 * Session key for OpenClaw routing
 */
export interface SessionKey {
  /** Agent ID */
  agentId: string;
  /** Channel type */
  channel: 'discord';
  /** Account ID */
  accountId: string;
  /** Peer ID (user ID for DMs) */
  peer?: string;
  /** Guild ID (for guild messages) */
  guildId?: string;
  /** Channel ID */
  channelId?: string;
}