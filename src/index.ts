/**
 * OpenClaw Discord Bridge - Legacy Plugin Entry Point
 * 
 * DEPRECATED: This file is kept for backward compatibility only.
 * The project has been migrated to a Standalone Bridge architecture.
 * 
 * For the new standalone bridge, use:
 *   npm run start        - Run built bridge
 *   npm run start:dev    - Run with ts-node
 * 
 * See README.md for setup instructions.
 * 
 * Fixes issue: https://github.com/openclaw/openclaw/issues/27409
 */

// Re-export bridge types for compatibility
export type { DiscordProxyConfig, SessionKey, DiscordMessageContext } from './types';

// Export a simple deprecation notice if this file is imported
console.warn('[DiscordProxy] WARNING: The plugin entry point (src/index.ts) is deprecated.');
console.warn('[DiscordProxy] Please use the standalone bridge instead.');
console.warn('[DiscordProxy] See README.md for migration instructions.');

// Placeholder for legacy compatibility
export async function activate(context: any): Promise<void> {
  console.error('[DiscordProxy] ERROR: The plugin entry point is deprecated.');
  console.error('[DiscordProxy] Please use the standalone bridge: npm run start');
  throw new Error('Plugin entry point is deprecated. Use the standalone bridge instead.');
}

export async function deactivate(): Promise<void> {
  console.log('[DiscordProxy] Deactivated (legacy entry point)');
}