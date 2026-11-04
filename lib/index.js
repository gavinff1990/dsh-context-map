/**
 * dsh-context-map — a Cordis plugin for DeepSeek Harness.
 *
 * The plugin contributes two model-callable tools: `context_map` renders an
 * outline into artifacts, `session_facts` reports what this session actually
 * did so the outline can cite real files and commands. It opens no socket,
 * spawns no process, and touches disk only inside the `outDir` a map call
 * names; unloading the plugin disposes both registrations through Cordis.
 * @module dsh-context-map
 */

import { FACTS_TOOL_NAME, createSessionFactsTool } from './facts-tool.js'
import { SessionStore } from './session-facts.js'
import { TOOL_NAME, createContextMapTool } from './tool.js'

/** Display name used by Cordis diagnostics. */
export const name = 'dsh-context-map'

/** The tool registry must exist before the tools can be registered. */
export const inject = ['tools']

/**
 * Register both tools and start recording session facts.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @returns {void}
 */
export function apply(ctx) {
  const store = new SessionStore()
  ctx.tools.register(createContextMapTool())
  ctx.tools.register(createSessionFactsTool({ store }))
  ctx.on('tools/result', (exec, result) => {
    store.record(exec, result)
  })
}

export { TOOL_NAME, FACTS_TOOL_NAME, createContextMapTool, createSessionFactsTool, SessionStore }
