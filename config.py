"""
OpenClaw Discord Bridge - Configuration Module

Loads and validates bridge configuration from environment variables.
"""

import os
from typing import List, Optional

from dotenv import load_dotenv
from types import (
    BridgeConfig,
    IntentsConfig,
    DMPolicy,
    GroupPolicy,
    BotStatus,
    ActivityType,
)

# Load environment variables from .env file
load_dotenv()


def load_bridge_config() -> BridgeConfig:
    """
    Load bridge configuration from environment variables.
    
    Returns:
        BridgeConfig: The loaded configuration
        
    Raises:
        ValueError: If required environment variables are missing
    """
    # Required variables
    discord_token = os.getenv("DISCORD_TOKEN")
    openclaw_auth_token = os.getenv("OPENCLAW_AUTH_TOKEN")
    
    if not discord_token:
        raise ValueError(
            "DISCORD_TOKEN environment variable is required. "
            "Get it from https://discord.com/developers/applications"
        )
    
    if not openclaw_auth_token:
        raise ValueError(
            "OPENCLAW_AUTH_TOKEN environment variable is required. "
            "Generate with: openssl rand -hex 32"
        )
    
    # Optional variables with defaults
    proxy_url = os.getenv("PROXY_URL", "http://127.0.0.1:7890")
    openclaw_http_url = os.getenv("OPENCLAW_HTTP_URL", "http://127.0.0.1:18789")
    
    # Parse DM policy
    dm_policy_str = os.getenv("DM_POLICY", "open").lower()
    try:
        dm_policy = DMPolicy(dm_policy_str)
    except ValueError:
        raise ValueError(
            f"Invalid DM_POLICY: {dm_policy_str}. "
            f"Must be one of: {', '.join([p.value for p in DMPolicy])}"
        )
    
    # Parse group policy
    group_policy_str = os.getenv("GROUP_POLICY", "allowlist").lower()
    try:
        group_policy = GroupPolicy(group_policy_str)
    except ValueError:
        raise ValueError(
            f"Invalid GROUP_POLICY: {group_policy_str}. "
            f"Must be one of: {', '.join([p.value for p in GroupPolicy])}"
        )
    
    # Parse allowlist
    allow_from_str = os.getenv("ALLOW_FROM", "")
    allow_from: List[str] = [
        user_id.strip() for user_id in allow_from_str.split(",") if user_id.strip()
    ] if allow_from_str else []
    
    # Parse device ID
    device_id = os.getenv("DEVICE_ID", "openclaw-discord-bridge")
    
    # Parse intents
    intents = IntentsConfig(
        message_content=os.getenv("INTENT_MESSAGE_CONTENT", "true").lower() != "false",
        server_members=os.getenv("INTENT_SERVER_MEMBERS", "true").lower() != "false",
        presence=os.getenv("INTENT_PRESENCE", "false").lower() == "true",
    )
    
    # Parse bot status
    status_str = os.getenv("BOT_STATUS", "online").lower()
    try:
        status = BotStatus(status_str)
    except ValueError:
        raise ValueError(
            f"Invalid BOT_STATUS: {status_str}. "
            f"Must be one of: {', '.join([s.value for s in BotStatus])}"
        )
    
    # Parse activity type
    activity_type_str = os.getenv("ACTIVITY_TYPE", "2")
    try:
        activity_type = ActivityType(int(activity_type_str))
    except ValueError:
        raise ValueError(
            f"Invalid ACTIVITY_TYPE: {activity_type_str}. "
            f"Must be an integer: 0=Playing, 1=Streaming, 2=Listening, 3=Watching, 4=Custom"
        )
    
    # Parse activity
    activity = os.getenv("ACTIVITY", "OpenClaw Bridge")
    activity_url = os.getenv("ACTIVITY_URL")
    
    return BridgeConfig(
        discord_token=discord_token,
        openclaw_auth_token=openclaw_auth_token,
        openclaw_http_url=openclaw_http_url,
        proxy_url=proxy_url if proxy_url else None,
        dm_policy=dm_policy,
        group_policy=group_policy,
        allow_from=allow_from,
        device_id=device_id,
        intents=intents,
        status=status,
        activity=activity,
        activity_type=activity_type,
        activity_url=activity_url,
    )


def print_config_summary(config: BridgeConfig) -> None:
    """
    Print a summary of the loaded configuration.
    
    Args:
        config: The bridge configuration to print
    """
    print("\n" + "=" * 50)
    print("OpenClaw Discord Bridge - Configuration")
    print("=" * 50)
    print(f"Discord Token:    {config.discord_token[:10]}...")
    print(f"Proxy URL:        {config.proxy_url or 'none'}")
    print(f"OpenClaw URL:     {config.openclaw_http_url}")
    print(f"DM Policy:        {config.dm_policy.value}")
    print(f"Group Policy:     {config.group_policy.value}")
    print(f"Device ID:        {config.device_id}")
    print(f"Allow From:       {', '.join(config.allow_from) or 'all'}")
    print(f"Status:           {config.status.value}")
    print(f"Activity:         {config.activity} (type {config.activity_type.value})")
    print("=" * 50 + "\n")