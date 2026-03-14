# OpenClaw Discord Proxy Plugin

A workaround plugin for OpenClaw's Discord channel that properly respects proxy configuration for both WebSocket and REST API calls.

## Problem

The official OpenClaw Discord channel has a bug (issue [#27409](https://github.com/openclaw/openclaw/issues/27409)) where:
- Gateway WebSocket connections respect the proxy configuration ✓
- REST API calls (sending messages) do NOT respect the proxy configuration ✗
- Result: Bot can receive messages but cannot send replies, showing "fetch failed" errors

This plugin provides a complete workaround by implementing a Discord channel handler with proper proxy support for both WebSocket and REST API calls.

## Features

- ✅ **Full proxy support** for both WebSocket and REST API calls
- ✅ **Device ID mechanism** for session management and identification
- ✅ **Multi-account support** with per-account proxy configuration
- ✅ **All official channel features**: DMs, guilds, pairing, allowlists
- ✅ **Drop-in replacement** configuration (disable official, enable plugin)
- ✅ **Thread bindings** for subagent sessions
- ✅ **Interactive components** (buttons, selects, modals)
- ✅ **Voice channel support** (with proxy)
- ✅ **Exec approvals** via Discord buttons

## Installation

### Prerequisites

- Node.js >= 18.0.0
- OpenClaw >= 2024.1.0
- A Discord bot token (get from [Discord Developer Portal](https://discord.com/developers/applications))

### Install Steps

```bash
# Clone the repository
git clone https://github.com/binary-rune/openclaw_discord_plugin.git
cd openclaw_discord_plugin

# Install dependencies
npm install

# Build the plugin
npm run build

# Install in OpenClaw
openclaw plugins install ./path/to/openclaw_discord_plugin
```

## Configuration

### Step 1: Disable Official Discord Channel

Edit your `openclaw.json` or use CLI:

```bash
# Disable the official Discord channel
openclaw config set channels.discord.enabled false --json
```

This is important to prevent conflicts and duplicate connections.

### Step 2: Configure Discord Proxy Plugin

#### Using CLI (Recommended)

```bash
# Set bot token
openclaw config set channels.discordProxy.token "YOUR_BOT_TOKEN" --json

# Set proxy (CRITICAL - this is the fix for issue #27409)
openclaw config set channels.discordProxy.proxy "http://127.0.0.1:7890" --json

# Set device ID (optional, auto-generated if not provided)
openclaw config set channels.discordProxy.deviceId "openclaw-discord-proxy-001" --json

# Enable the plugin
openclaw config set channels.discordProxy.enabled true --json

# Restart gateway
openclaw gateway restart
```

#### Using Configuration File

```json5
{
  // Disable official Discord channel
  "channels": {
    "discord": {
      "enabled": false
    },
    
    // Enable Discord Proxy plugin
    "discordProxy": {
      "enabled": true,
      "token": "YOUR_BOT_TOKEN",
      "proxy": "http://127.0.0.1:7890",
      "deviceId": "openclaw-discord-proxy-001",
      
      // DM policy (pairing, allowlist, open, disabled)
      "dmPolicy": "pairing",
      
      // Guild policy (open, allowlist, disabled)
      "groupPolicy": "allowlist",
      
      // Guild configuration
      "guilds": {
        "YOUR_SERVER_ID": {
          "requireMention": false,
          "users": ["YOUR_USER_ID"],
          "channels": {
            "general": { "allow": true },
            "help": { "allow": true, "requireMention": true }
          }
        }
      },
      
      // Allowed users for DMs (when dmPolicy is allowlist)
      "allowFrom": ["YOUR_USER_ID"],
      
      // Gateway intents
      "intents": {
        "messageContent": true,
        "serverMembers": true,
        "presence": false
      },
      
      // Streaming mode
      "streaming": "partial",
      
      // Reply mode
      "replyToMode": "off",
      
      // History limit
      "historyLimit": 20
    }
  }
}
```

### Step 3: Pair Your Discord Account

If using `dmPolicy: "pairing"` (default):

1. DM your bot in Discord
2. Bot responds with a pairing code
3. Approve the code:

```bash
# List pending pairings
openclaw pairing list discordProxy

# Approve the pairing
openclaw pairing approve discordProxy <CODE>
```

## Device ID Mechanism

The plugin supports device identification for:
- **Session persistence**: Messages from the same device map to the same session
- **Multi-device support**: Different devices can have separate conversations
- **Thread bindings**: Subagent sessions can be bound to specific device IDs

### Device ID Configuration

```json5
{
  "channels": {
    "discordProxy": {
      "deviceId": "my-custom-device-id",  // Custom device identifier
      "accounts": {
        "default": {
          "deviceId": "account-specific-device-id"  // Per-account override
        }
      }
    }
  }
}
```

### How Device ID Works

1. **Inbound messages**: Device ID is extracted from the session context
2. **Session routing**: Messages with the same device ID route to the same session
3. **Thread bindings**: Subagent sessions can be bound to specific device IDs
4. **Presence tracking**: Device status is tracked in the Gateway

## Multi-Account Configuration

You can configure multiple Discord bot accounts:

```json5
{
  "channels": {
    "discordProxy": {
      "enabled": true,
      "accounts": {
        "default": {
          "token": "BOT_TOKEN_1",
          "proxy": "http://127.0.0.1:7890",
          "deviceId": "device-1"
        },
        "secondary": {
          "token": "BOT_TOKEN_2",
          "proxy": "http://127.0.0.1:7891",
          "deviceId": "device-2"
        }
      }
    }
  }
}
```

## Environment Variables

Alternative configuration using environment variables:

```bash
# Disable official Discord channel
OPENCLAW_CHANNELS_DISCORD_ENABLED=false

# Enable and configure Discord Proxy plugin
OPENCLAW_CHANNELS_DISCORDPROXY_ENABLED=true
OPENCLAW_CHANNELS_DISCORDPROXY_TOKEN=YOUR_BOT_TOKEN
OPENCLAW_CHANNELS_DISCORDPROXY_PROXY=http://127.0.0.1:7890
OPENCLAW_CHANNELS_DISCORDPROXY_DEVICEID=openclaw-discord-proxy-001

# Or use SecretRef for tokens (recommended for production)
# See: https://docs.openclaw.ai/gateway/secrets
```

## Troubleshooting

### Bot can't send messages

1. Verify proxy is running:
   ```bash
   curl -x http://127.0.0.1:7890 https://discord.com/api/users/@me
   ```

2. Check logs:
   ```bash
   openclaw logs --follow | grep discordProxy
   ```

3. Verify token: Ensure bot token is correct and not expired

### Pairing not working

1. Ensure DMs are enabled from server members
2. Check `dmPolicy` configuration
3. Verify bot has permission to send DMs

### Proxy connection issues

1. Test proxy with Discord API directly
2. Check proxy authentication if required
3. Verify proxy URL format (include `http://` prefix)

### "fetch failed" errors

This is the exact issue this plugin fixes. If you still see these errors:
1. Verify the official Discord channel is disabled
2. Verify the proxy URL is correct
3. Check if your proxy supports HTTPS connections

## Comparison: Official vs Plugin

| Feature | Official Channel | Proxy Plugin |
|---------|-----------------|---------------|
| WebSocket via proxy | ✅ | ✅ |
| REST API via proxy | ❌ (bug) | ✅ |
| Device ID support | ✅ | ✅ |
| Multi-account | ✅ | ✅ |
| Pairing | ✅ | ✅ |
| Guild allowlists | ✅ | ✅ |
| Thread bindings | ✅ | ✅ |
| Voice channels | ✅ | ✅ |
| Exec approvals | ✅ | ✅ |

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run watch

# Clean build
npm run clean
```

## License

MIT License - See LICENSE file for details

## Contributing

Contributions welcome! Please read CONTRIBUTING.md first.

## Related Links

- [OpenClaw Documentation](https://docs.openclaw.ai/)
- [Discord Developer Portal](https://discord.com/developers/applications)
- [Issue #27409](https://github.com/openclaw/openclaw/issues/27409)
- [OpenClaw Discord Channel Docs](https://docs.openclaw.ai/channels/discord)