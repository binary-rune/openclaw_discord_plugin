"""
OpenClaw Discord Bridge - Type Definitions

Type classes and dataclasses for the Discord bridge.
"""

from dataclasses import dataclass, field
from typing import Optional, Literal, Dict, List, Any
from enum import Enum


class DMPolicy(str, Enum):
    """DM access policy options."""
    OPEN = "open"
    PAIRING = "pairing"
    ALLOWLIST = "allowlist"
    DISABLED = "disabled"


class GroupPolicy(str, Enum):
    """Guild message policy options."""
    OPEN = "open"
    ALLOWLIST = "allowlist"
    DISABLED = "disabled"


class ActivityType(int, Enum):
    """Discord activity types."""
    PLAYING = 0
    STREAMING = 1
    LISTENING = 2
    WATCHING = 3
    CUSTOM = 4


class BotStatus(str, Enum):
    """Bot status options."""
    ONLINE = "online"
    IDLE = "idle"
    DND = "dnd"
    INVISIBLE = "invisible"


@dataclass
class IntentsConfig:
    """Gateway intents configuration."""
    message_content: bool = True
    server_members: bool = True
    presence: bool = False


@dataclass
class AccountConfig:
    """Account-specific configuration."""
    token: str
    proxy: Optional[str] = None
    device_id: Optional[str] = None


@dataclass
class GuildConfig:
    """Guild-specific configuration."""
    require_mention: bool = True
    users: List[str] = field(default_factory=list)
    channels: Dict[str, 'ChannelConfig'] = field(default_factory=dict)


@dataclass
class ChannelConfig:
    """Channel-specific configuration within a guild."""
    allow: bool = True
    require_mention: bool = False


@dataclass
class BridgeConfig:
    """Main bridge configuration."""
    discord_token: str
    openclaw_auth_token: str
    openclaw_http_url: str = "http://127.0.0.1:18789"
    proxy_url: Optional[str] = "http://127.0.0.1:7890"
    dm_policy: DMPolicy = DMPolicy.OPEN
    group_policy: GroupPolicy = GroupPolicy.ALLOWLIST
    allow_from: List[str] = field(default_factory=list)
    device_id: str = "openclaw-discord-bridge"
    intents: IntentsConfig = field(default_factory=IntentsConfig)
    status: BotStatus = BotStatus.ONLINE
    activity: Optional[str] = "OpenClaw Bridge"
    activity_type: ActivityType = ActivityType.LISTENING
    activity_url: Optional[str] = None


@dataclass
class SessionKey:
    """Session key for OpenClaw routing."""
    agent_id: str = "default"
    channel: Literal["discord"] = "discord"
    account_id: str = "default"
    peer: Optional[str] = None
    guild_id: Optional[str] = None
    channel_id: Optional[str] = None


@dataclass
class DiscordMessageContext:
    """Discord message context for OpenClaw session routing."""
    message_id: str
    channel_id: str
    guild_id: Optional[str]
    user_id: str
    account_id: str
    device_id: str
    is_dm: bool
    thread_id: Optional[str] = None
    parent_channel_id: Optional[str] = None


@dataclass
class OpenClawMessagePayload:
    """Message payload sent to OpenClaw HTTP API."""
    session_key: SessionKey
    content: str
    timestamp: int