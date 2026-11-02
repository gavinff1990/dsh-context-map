/**
 * dsh-context-map — a Cordis plugin for DeepSeek Harness.
 *
 * The plugin contributes one model-callable tool, `context_map`. It holds no
 * state, opens no socket, spawns no process, and writes only the artifacts of
 * the call it is serving; unloading the plugin disposes the registration
 * through Cordis, so `inject` alone is enough to keep it in a profile.
 * @module dsh-context-map
 */

import { TOOL_NAME, createContextMapTool } from './tool.js'

/** Display name used by Cordis diagnostics. */
export const name = 'dsh-context-map'

/** The tool registry must exist before the tool can be registered. */
export const inject = ['tools']

/**
 * Register the map tool.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @returns {void}
 */
export function apply(ctx) {
  ctx.tools.register(createContextMapTool())
}

export { TOOL_NAME, createContextMapTool }
