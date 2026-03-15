"""
OpenClaw Discord Bridge - Standalone Application

A standalone bridge that connects Discord to OpenClaw via HTTP API.
This approach provides full proxy support for both WebSocket and REST API calls,
fixing issue #27409.

Architecture:
    Discord Bot (with proxy) → Message Router → OpenClaw HTTP API

Usage:
    python bridge.py
    
Or with environment variables:
    DISCORD_TOKEN="your_token" OPENCLAW_AUTH_TOKEN="your_token" python bridge.py
"""

import asyncio
import logging
from datetime import datetime
from typing import Optional, Dict, Any

import discord
from discord import Intents, Message, TextChannel, DMChannel, PartialMessageable
from aiohttp import ClientSession, ClientTimeout, TCPConnector
from aiohttp_socks import ProxyConnector

from config import load_bridge_config, print_config_summary
from types import (
    BridgeConfig,
    SessionKey,
    OpenClawMessagePayload,
    DMPolicy,
    GroupPolicy,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def generate_session_key(
    message: Message,
    account_id: str,
    device_id: str
) -> SessionKey:
    """
    Generate session key for OpenClaw routing.
    
    Args:
        message: The Discord message
        account_id: The account identifier
        device_id: The device identifier
        
    Returns:
        SessionKey for routing
    """
    is_dm = not message.guild
    
    if is_dm:
        return SessionKey(
            agent_id="default",
            channel="discord",
            account_id=account_id,
            peer=message.author.id,
        )
    
    return SessionKey(
        agent_id="default",
        channel="discord",
        account_id=account_id,
        guild_id=message.guild.id,
        channel_id=message.channel.id,
    )


def create_proxy_connector(proxy_url: Optional[str]) -> Optional[ProxyConnector]:
    """
    Create a proxy connector for aiohttp.
    
    Args:
        proxy_url: The proxy URL (e.g., "http://127.0.0.1:7890")
        
    Returns:
        ProxyConnector or None if no proxy
    """
    if not proxy_url:
        return None
    
    # Parse proxy URL and create appropriate connector
    # aiohttp_socks handles http, https, socks4, socks5
    try:
        return ProxyConnector.from_url(proxy_url)
    except ValueError as e:
        logger.warning(f"Failed to create proxy connector: {e}")
        return None


async def send_to_openclaw(
    session: ClientSession,
    config: BridgeConfig,
    payload: OpenClawMessagePayload
) -> None:
    """
    Send message to OpenClaw HTTP API.
    
    Args:
        session: The aiohttp client session
        config: Bridge configuration
        payload: Message payload to send
        
    Raises:
        Exception: If the request fails
    """
    url = f"{config.openclaw_http_url}/api/v1/messages/ingest"
    
    data = {
        "sessionKey": {
            "agentId": payload.session_key.agent_id,
            "channel": payload.session_key.channel,
            "accountId": payload.session_key.account_id,
        },
        "content": payload.content,
        "timestamp": payload.timestamp,
    }
    
    # Add optional fields
    if payload.session_key.peer:
        data["sessionKey"]["peer"] = payload.session_key.peer
    if payload.session_key.guild_id:
        data["sessionKey"]["guildId"] = payload.session_key.guild_id
    if payload.session_key.channel_id:
        data["sessionKey"]["channelId"] = payload.session_key.channel_id
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {config.openclaw_auth_token}",
    }
    
    try:
        async with session.post(url, json=data, headers=headers) as response:
            if response.status != 200:
                error_text = await response.text()
                raise Exception(f"OpenClaw API error: {response.status} {error_text}")
            
            peer_id = payload.session_key.peer or payload.session_key.channel_id
            logger.info(f"Message sent to OpenClaw: {peer_id}")
            
    except Exception as e:
        logger.error(f"Failed to send message to OpenClaw: {e}")
        raise


def is_user_allowed(
    user_id: str,
    config: BridgeConfig,
    guild_id: Optional[str] = None
) -> bool:
    """
    Check if user is allowed to send messages.
    
    Args:
        user_id: The Discord user ID
        config: Bridge configuration
        guild_id: The guild ID (None for DMs)
        
    Returns:
        True if user is allowed, False otherwise
    """
    # Check DM policy
    if not guild_id:
        match config.dm_policy:
            case DMPolicy.OPEN:
                return True
            case DMPolicy.DISABLED:
                return False
            case DMPolicy.ALLOWLIST:
                return user_id in config.allow_from
            case DMPolicy.PAIRING:
                # For simplicity, pairing mode allows all in standalone bridge
                return True
    
    # Guild message policy
    if config.group_policy == GroupPolicy.DISABLED:
        return False
    
    return True


def should_respond(
    message: Message,
    config: BridgeConfig
) -> bool:
    """
    Check if bot should respond to a message.
    
    Args:
        message: The Discord message
        config: Bridge configuration
        
    Returns:
        True if bot should respond, False otherwise
    """
    # Ignore bot messages
    if message.author.bot:
        return False
    
    guild_id = message.guild.id if message.guild else None
    user_id = message.author.id
    
    # Check if user is allowed
    if not is_user_allowed(user_id, config, guild_id):
        return False
    
    # For guild messages, require mention
    if guild_id:
        if not message.mentions or not any(
            member.id == message.guild.me.id for member in message.mentions
        ):
            return False
    
    return True


class DiscordBridge:
    """
    Main bridge class connecting Discord to OpenClaw.
    """
    
    def __init__(self, config: BridgeConfig):
        """
        Initialize the Discord bridge.
        
        Args:
            config: Bridge configuration
        """
        self.config = config
        self.session: Optional[ClientSession] = None
        self.account_id = "default"
        
        # Create Discord intents
        intents = Intents.default()
        intents.message_content = config.intents.message_content
        intents.members = config.intents.server_members
        intents.presence = config.intents.presence
        
        # Create Discord client with proxy support
        proxy_url = config.proxy_url
        self.client = discord.Client(
            intents=intents,
            proxy=proxy_url,
        )
        
        # Setup event handlers
        self.client.event(self.on_ready)
        self.client.event(self.on_message)
        self.client.event(self.on_error)
    
    async def on_ready(self) -> None:
        """Handle client ready event."""
        logger.info(f"Connected as {self.client.user}")
        logger.info(f"Proxy: {self.config.proxy_url or 'none'}")
        logger.info(f"OpenClaw API: {self.config.openclaw_http_url}")
        
        # Set presence
        if self.config.activity:
            activity = discord.Activity(
                name=self.config.activity,
                type=self.config.activity_type.value,
                url=self.config.activity_url,
            )
            await self.client.change_presence(
                status=discord.Status[self.config.status.value.upper()],
                activity=activity,
            )
    
    async def on_message(self, message: Message) -> None:
        """
        Handle incoming messages.
        
        Args:
            message: The received message
        """
        if not should_respond(message, self.config):
            return
        
        try:
            await self.handle_message(message)
        except Exception as e:
            logger.error(f"Error handling message: {e}", exc_info=True)
    
    async def on_error(self, event: str, *args: Any, **kwargs: Any) -> None:
        """
        Handle Discord client errors.
        
        Args:
            event: The event name
            *args: Event arguments
            **kwargs: Event keyword arguments
        """
        logger.error(f"Discord error in {event}: {args}", exc_info=True)
    
    async def handle_message(self, message: Message) -> None:
        """
        Process and forward a message to OpenClaw.
        
        Args:
            message: The Discord message to process
        """
        logger.info(f"Message from {message.author} in channel {message.channel.id}")
        
        session_key = generate_session_key(
            message,
            self.account_id,
            self.config.device_id
        )
        
        payload = OpenClawMessagePayload(
            session_key=session_key,
            content=message.content,
            timestamp=int(datetime.now().timestamp() * 1000),
        )
        
        if self.session:
            await send_to_openclaw(self.session, self.config, payload)
    
    async def start(self) -> None:
        """Start the Discord bridge."""
        logger.info("Starting Discord Bridge...")
        
        # Create aiohttp session with proxy
        connector = create_proxy_connector(self.config.proxy_url)
        timeout = ClientTimeout(total=30)
        
        self.session = ClientSession(
            connector=connector,
            timeout=timeout,
        )
        
        # Start Discord client
        await self.client.start(self.config.discord_token)
    
    async def stop(self) -> None:
        """Stop the Discord bridge."""
        logger.info("Stopping Discord Bridge...")
        
        if self.session:
            await self.session.close()
        
        if self.client.is_ready():
            await self.client.close()


async def main() -> None:
    """Main entry point."""
    try:
        config = load_bridge_config()
        print_config_summary(config)
        
        bridge = DiscordBridge(config)
        
        # Handle graceful shutdown
        import signal
        
        async def shutdown(signum):
            logger.info(f"Received signal {signum}, shutting down...")
            await bridge.stop()
        
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, lambda s=sig: asyncio.create_task(shutdown(s)))
        
        await bridge.start()
        
    except ValueError as e:
        logger.error(f"Configuration error: {e}")
        exit(1)
    except discord.LoginFailure:
        logger.error("Invalid Discord token")
        exit(1)
    except Exception as e:
        logger.error(f"Failed to start: {e}", exc_info=True)
        exit(1)


if __name__ == "__main__":
    asyncio.run(main())