/**
 * The `session_facts` tool.
 *
 * A read-only window onto what this session actually did: which files were
 * written or read, which commands ran, which tools fired, what failed. The
 * model calls it before drawing a map when the outline should cite real paths
 * instead of recollected ones.
 * @module dsh-context-map/facts-tool
 */

import { sessionKey } from './session-facts.js'

/** The tool name the model calls. */
export const FACTS_TOOL_NAME = 'session_facts'

const DESCRIPTION = [
  'List what this session has actually done so far: files written or read, commands run, tools used and failures.',
  'Call it before `context_map` when the map should cite real paths and real commands — artifact and action nodes then come from evidence instead of recollection.',
  'Nothing is persisted and nothing leaves the process: the list is a bounded in-memory record of this session\'s tool calls, cleared when the plugin unloads.',
  'Pass `clear: true` to drop the record after reading it (useful when starting a fresh phase).',
].join(' ')

/**
 * JSON Schema of the arguments.
 * @returns {object} raw schema in the harness-enforced subset.
 */
function parameters() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      scope: {
        type: 'string',
        description: 'Which section to return. Default `all`.',
        enum: ['all', 'files', 'commands', 'tools'],
      },
      limit: {
        type: 'integer',
        description: 'Maximum entries per list, 1–100. Default 30.',
      },
      clear: {
        type: 'boolean',
        description: 'Drop this session\'s record after reading it.',
      },
    },
  }
}

/**
 * JSON Schema of the canonical output.
 * @returns {object} raw schema.
 */
function outputSchema() {
  const counted = {
    type: 'object',
    additionalProperties: true,
    required: ['path'],
    properties: {
      path: { type: 'string' },
      writes: { type: 'integer' },
      reads: { type: 'integer' },
    },
  }
  return {
    type: 'object',
    additionalProperties: true,
    required: ['scope', 'files', 'commands', 'tools', 'errors', 'totals'],
    properties: {
      scope: { type: 'string' },
      files: {
        type: 'object',
        additionalProperties: true,
        required: ['written', 'read', 'writtenTotal', 'readTotal'],
        properties: {
          written: { type: 'array', items: counted },
          read: { type: 'array', items: counted },
          writtenTotal: { type: 'integer' },
          readTotal: { type: 'integer' },
        },
      },
      commands: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: true,
          required: ['cmd', 'ok'],
          properties: {
            cmd: { type: 'string' },
            ok: { type: 'boolean' },
            at: { type: 'integer' },
          },
        },
      },
      commandTotal: { type: 'integer' },
      tools: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: true,
          required: ['name', 'count', 'errors'],
          properties: {
            name: { type: 'string' },
            count: { type: 'integer' },
            errors: { type: 'integer' },
          },
        },
      },
      errors: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: true,
          required: ['tool', 'message'],
          properties: {
            tool: { type: 'string' },
            message: { type: 'string' },
            at: { type: 'integer' },
          },
        },
      },
      cleared: { type: 'boolean' },
      totals: {
        type: 'object',
        additionalProperties: true,
        required: ['calls', 'files', 'commands', 'tools', 'errors'],
        properties: {
          calls: { type: 'integer' },
          files: { type: 'integer' },
          commands: { type: 'integer' },
          tools: { type: 'integer' },
          errors: { type: 'integer' },
        },
      },
    },
  }
}

/**
 * One-line summary rendered as the model-facing result content.
 * @param {object} value - canonical value.
 * @returns {string} text.
 */
function summary(value) {
  const lines = [
    `Session facts: ${value.totals.calls} tool calls · ${value.files.writtenTotal} files written · ${value.files.readTotal} read · ${value.commandTotal} commands · ${value.totals.errors} errors`,
  ]
  if (value.files.written.length > 0) {
    const list = value.files.written.slice(0, 8).map((file) => file.path).join(', ')
    lines.push(`Written: ${list}${value.files.writtenTotal > 8 ? ', …' : ''}`)
  }
  if (value.commands.length > 0) {
    lines.push(`Last commands: ${value.commands.slice(-3).map((command) => command.cmd).join(' | ')}`)
  }
  if (value.errors.length > 0) {
    lines.push(`Recent errors: ${value.errors.slice(-2).map((error) => `${error.tool}: ${error.message}`).join(' | ')}`)
  }
  if (value.totals.calls === 0) lines.push('No tool calls recorded yet — the record starts when this plugin loads.')
  return lines.join('\n')
}

/**
 * Build the `session_facts` tool definition.
 * @param {object} options - dependencies.
 * @param {import('./session-facts.js').SessionStore} options.store - per-session store.
 * @returns {object} complete `ToolDefinition`.
 */
export function createSessionFactsTool({ store }) {
  return {
    name: FACTS_TOOL_NAME,
    description: DESCRIPTION,
    parameters: parameters(),
    output: {
      schema: outputSchema(),
      render(_args, value) {
        return [{ type: 'text', text: summary(value) }]
      },
    },
    async execute(args, exec) {
      const input = typeof args === 'object' && args !== null ? args : {}
      const scope = ['all', 'files', 'commands', 'tools'].includes(input.scope) ? input.scope : 'all'
      const limit = Number.isInteger(input.limit) ? input.limit : undefined
      const digest = store.digestFor(exec, { scope, limit })
      if (input.clear === true) digest.cleared = store.clear(sessionKey(exec))
      return digest
    },
    presentCall() {
      return { card: 'generic', title: 'Session facts', kind: 'other' }
    },
    presentResult(_args, result) {
      return { card: 'generic', title: 'Session facts', content: result.content }
    },
  }
}
