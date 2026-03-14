# OpenClaw Discord Bridge

A **standalone** Discord-to-OpenClaw bridge with full proxy support for both WebSocket and REST API calls.

## Problem Solved

The official OpenClaw Discord channel has a bug (issue [#27409](https://github.com/openclaw/openclaw/issues/27409)) where:
- Gateway WebSocket connections respect the proxy configuration ✓
- REST API calls (sending messages) do NOT respect the proxy configuration ✗
- Result: Bot can receive messages but cannot send replies, showing "fetch failed" errors

This standalone bridge provides a complete workaround by:
- Running independently from OpenClaw
- Using `HttpsProxyAgent` for **both** WebSocket and REST API calls
- Forwarding messages to OpenClaw via HTTP API

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Standalone Bridge                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │  Discord Bot    │───▶│  Message Router │───▶│  OpenClaw   │ │
│  │  (with proxy)   │    │  (session mgmt) │    │  HTTP API   │ │
│  └─────────────────┘    └─────────────────┘    └─────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │    OpenClaw Gateway           │
                    │    (port 18789)               │
                    │    - HTTP API endpoint        │
                    │    - Auth token validation    │
                    │    - Message ingestion        │
                    └───────────────────────────────┘
```

### Key Fix: Proxy Injection

```
┌─────────────────────────────────────────────────────────────────────┐
│  Official Channel (Bug)        │  Standalone Bridge (Fixed)        │
│────────────────────────────────┼──────────────────────────────────│
│                                │                                   │
│  Discord.js Client             │  Discord.js Client                │
│  ┌──────────────────────┐     │  ┌──────────────────────┐         │
│  │ WebSocket: ✓ Proxy   │     │  │ WebSocket: ✓ Proxy   │         │
│  │ REST: ✗ No Proxy     │     │  │ REST: ✓ Proxy        │         │
│  │ (fetch failed)       │     │  │ (via HttpsProxyAgent)│         │
│  └──────────────────────┘     │  └──────────────────────┘         │
│                               │            ▲                       │
│  Config: proxy set            │            │                       │
│  Result: Partial working      │  Config: proxy set                │
│                               │  Result: Full proxy support        │
└───────────────────────────────┴────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- OpenClaw running with HTTP API enabled
- A Discord bot token (get from [Discord Developer Portal](https://discord.com/developers/applications))

### Installation

```bash
# Clone the repository
git clone https://github.com/binary-rune/openclaw_discord_plugin.git
cd openclaw_discord_plugin

# Install dependencies
npm install

# Build the bridge
npm run build
```

### Step 1: Configure OpenClaw HTTP API

First, you need to set up an auth token in OpenClaw for the bridge to use:

```bash
# Generate a secure auth token (you can use any secure string)
# Option A: Use openssl to generate one
openssl rand -hex 32

# Option B: Use any secure string you prefer
# Example: "my-secure-bridge-token-12345"
```

Then configure OpenClaw to accept this token:

```bash
# Set the HTTP auth token in OpenClaw
openclaw config set http.authToken "YOUR_GENERATED_TOKEN" --json

# Restart OpenClaw gateway to apply the config
openclaw gateway restart
```

> **Important:** The `http.authToken` is used to authenticate incoming HTTP requests to OpenClaw's API. Keep this token secure and only share it with trusted services.

### Step 2: Configure the Bridge

Create a `.env` file in the project directory:

```bash
# Required: Discord bot token
DISCORD_TOKEN=YOUR_BOT_TOKEN_HERE

# Required: Auth token you set in OpenClaw
OPENCLAW_AUTH_TOKEN=YOUR_GENERATED_TOKEN

# Optional: OpenClaw HTTP API URL (default: http://127.0.0.1:18789)
OPENCLAW_HTTP_URL=http://127.0.0.1:18789

# Optional: HTTP/HTTPS proxy URL (default: http://127.0.0.1:7890)
# This is the KEY setting that fixes issue #27409
PROXY_URL=http://127.0.0.1:7890

# Optional: DM policy (open, pairing, allowlist, disabled)
DM_POLICY=open

# Optional: Guild policy (open, allowlist, disabled)
GROUP_POLICY=allowlist

# Optional: Device ID for session management
DEVICE_ID=openclaw-discord-bridge

# Optional: Allowed user IDs for DMs (comma-separated, for allowlist mode)
ALLOW_FROM=123456789,987654321
```

### Step 3: Run the Bridge

```bash
# Development mode (with ts-node)
npm run start:dev

# Or run the built version
npm start
```

Or with environment variables directly:

```bash
DISCORD_TOKEN="YOUR_BOT_TOKEN" \
OPENCLAW_AUTH_TOKEN="YOUR_TOKEN" \
PROXY_URL="http://127.0.0.1:7890" \
OPENCLAW_HTTP_URL="http://127.0.0.1:18789" \
npm start
```

### Step 4: Test the Connection

1. Send a DM to your Discord bot
2. Check the bridge logs for message forwarding
3. Check OpenClaw logs for received messages

```bash
# Watch bridge logs
npm start 2>&1 | tee bridge.log

# Watch OpenClaw logs
openclaw logs --follow
```

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | Yes | - | Discord bot token |
| `OPENCLAW_AUTH_TOKEN` | Yes | - | Auth token for OpenClaw HTTP API |
| `OPENCLAW_HTTP_URL` | No | `http://127.0.0.1:18789` | OpenClaw HTTP API URL |
| `PROXY_URL` | No | `http://127.0.0.1:7890` | HTTP/HTTPS proxy URL |
| `DM_POLICY` | No | `open` | DM policy: `open`, `pairing`, `allowlist`, `disabled` |
| `GROUP_POLICY` | No | `allowlist` | Guild policy: `open`, `allowlist`, `disabled` |
| `DEVICE_ID` | No | `openclaw-discord-bridge` | Device ID for session management |
| `ALLOW_FROM` | No | - | Comma-separated user IDs for allowlist mode |
| `INTENT_MESSAGE_CONTENT` | No | `true` | Enable message content intent |
| `INTENT_SERVER_MEMBERS` | No | `true` | Enable server members intent |
| `INTENT_PRESENCE` | No | `false` | Enable presence intent |

### DM Policies

- `open`: Accept DMs from all users
- `pairing`: Require pairing code approval (simplified in bridge mode)
- `allowlist`: Only accept DMs from specified user IDs
- `disabled`: Reject all DMs

### Guild Policies

- `open`: Accept messages from all guilds
- `allowlist`: Only accept from configured guilds (TODO: implement guild config)
- `disabled`: Reject all guild messages

## Running as a Service

### systemd Service (Linux)

Create `/etc/systemd/system/openclaw-discord-bridge.service`:

```ini
[Unit]
Description=OpenClaw Discord Bridge
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/openclaw_discord_plugin
Environment=DISCORD_TOKEN=YOUR_BOT_TOKEN
Environment=OPENCLAW_AUTH_TOKEN=YOUR_TOKEN
Environment=PROXY_URL=http://127.0.0.1:7890
Environment=OPENCLAW_HTTP_URL=http://127.0.0.1:18789
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then enable and start the service:

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service
sudo systemctl enable openclaw-discord-bridge

# Start service
sudo systemctl start openclaw-discord-bridge

# Check status
sudo systemctl status openclaw-discord-bridge

# View logs
sudo journalctl -u openclaw-discord-bridge -f
```

### pm2 (Node.js Process Manager)

```bash
# Install pm2 globally
npm install -g pm2

# Start the bridge
pm2 start npm --name "discord-bridge" -- start

# Or with environment variables
pm2 start npm --name "discord-bridge" -- start -- \
  --DISCORD_TOKEN="YOUR_TOKEN" \
  --OPENCLAW_AUTH_TOKEN="YOUR_TOKEN" \
  --PROXY_URL="http://127.0.0.1:7890"

# Or use a pm2 ecosystem config file
pm2 start ecosystem.config.js

# View status
pm2 status

# View logs
pm2 logs discord-bridge
```

## Discord Bot Setup

### Step 1: Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application**
3. Name it (e.g., "OpenClaw Bridge")

### Step 2: Create Bot

1. Click **Bot** in the sidebar
2. Click **Add Bot**
3. Copy the bot token (click **Reset Token**)

### Step 3: Enable Privileged Intents

In the Bot settings, enable:
- **Message Content Intent** (required)
- **Server Members Intent** (recommended for allowlists)
- **Presence Intent** (optional)

### Step 4: Invite Bot to Server

1. Click **OAuth2** → **URL Generator**
2. Select scopes: `bot`, `applications.commands`
3. Select bot permissions:
   - View Channels
   - Send Messages
   - Read Message History
   - Embed Links
4. Copy the generated URL and open in browser
5. Select your server and authorize

### Step 5: Enable DMs

For the bot to receive DMs:
1. Right-click your server icon → **Privacy Settings**
2. Enable **Direct Messages**

## Troubleshooting

### "fetch failed" errors

This is the exact issue this bridge fixes. If you still see these errors:

1. Verify proxy is running:
   ```bash
   curl -x http://127.0.0.1:7890 https://discord.com/api/users/@me
   ```

2. Check proxy URL format (include `http://` prefix)

3. Verify proxy supports HTTPS connections

### Bridge won't start

1. Check environment variables are set:
   ```bash
   env | grep -E "DISCORD|OPENCLAW"
   ```

2. Verify Discord token is valid

3. Check OpenClaw is running and HTTP API is accessible:
   ```bash
   curl http://127.0.0.1:18789/api/health
   ```

### Messages not reaching OpenClaw

1. Check bridge logs for "Message sent to OpenClaw"

2. Verify auth token matches:
   ```bash
   # In bridge .env
   OPENCLAW_AUTH_TOKEN=your-token
   
   # In OpenClaw config
   openclaw config get http.authToken --json
   ```

3. Test HTTP API directly:
   ```bash
   curl -X POST http://127.0.0.1:18789/api/v1/messages/ingest \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"sessionKey":{"agentId":"default","channel":"discord","accountId":"test"},"content":"test","timestamp":1234567890}'
   ```

### Bot not receiving messages

1. Verify bot is invited to server with correct permissions

2. Check Discord intents are enabled in Developer Portal

3. Verify DMs are enabled from server members

## Comparison: Plugin vs Standalone Bridge

| Feature | Plugin Approach | Standalone Bridge |
|---------|----------------|-------------------|
| Proxy support (WebSocket) | ✅ | ✅ |
| Proxy support (REST) | ✅ | ✅ |
| Installation complexity | High (plugin system) | Low (standalone) |
| Configuration | OpenClaw config | Environment variables |
| Lifecycle | Tied to OpenClaw | Independent |
| Debugging | Harder | Easier |
| Restart impact | Requires OpenClaw restart | Independent restart |
| HTTP API required | No | Yes |

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch mode (auto-rebuild on changes)
npm run watch

# Run development version
npm run start:dev

# Clean build artifacts
npm run clean
```

## Security Considerations

1. **Discord Token**: Keep your bot token secret. Never commit to version control.

2. **Auth Token**: The `OPENCLAW_AUTH_TOKEN` authenticates bridge → OpenClaw. Use a strong random value.

3. **Proxy**: If using a proxy, ensure it's trusted. The proxy can see all Discord traffic.

4. **Network**: The bridge should run on the same network as OpenClaw, or use TLS for remote connections.

## License

MIT License

## Related Links

- [OpenClaw Documentation](https://docs.openclaw.ai/)
- [Discord Developer Portal](https://discord.com/developers/applications)
- [Issue #27409](https://github.com/openclaw/openclaw/issues/27409)