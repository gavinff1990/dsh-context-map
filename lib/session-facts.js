/**
 * Session fact collection.
 *
 * The map is only as honest as the outline behind it. Instead of asking the
 * model to recall what happened, the plugin listens to `tools/result` and keeps
 * a bounded, in-memory record of the file paths and commands this session
 * actually touched — no session-log parsing, no disk, no network.
 *
 * Facts are kept per session, keyed by the agent identity the execution
 * exposes, and dropped when the plugin unloads.
 * @module dsh-context-map/session-facts
 */

/** Tools that write to the filesystem. */
const WRITE_TOOL = /(write|edit|create|append|delete|remove|move|rename|patch|upload)/iu
/** Tools that only read. */
const READ_TOOL = /(read|glob|grep|list|stat|search|find|inspect|view)/iu
/** Tools that run a command. */
const COMMAND_TOOL = /(bash|shell|pwsh|powershell|exec|command|run)/iu
/** Tools this plugin registers; their calls must not become facts about the session. */
const OWN_TOOLS = new Set(['context_map', 'session_facts'])

/** Argument keys that usually hold a path. */
const PATH_KEYS = ['path', 'file_path', 'filePath', 'target', 'targetPath', 'destination', 'source', 'cwd', 'dir', 'directory', 'root', 'files', 'paths']
/** Argument keys that usually hold a command line. */
const COMMAND_KEYS = ['command', 'cmd', 'script', 'commandLine']

/** Absolute-ish or relative-ish path shapes, used only when no known key matches. */
const LOOKS_LIKE_PATH = /^(?:[A-Za-z]:[\\/]|\/|\.{1,2}[\\/]).*|^[^<>|*?\n]+[\\/][^<>|*?\n]+$/u

/** Caps that keep one long session from growing without bound. */
export const LIMITS = {
  sessions: 8,
  filePaths: 300,
  commands: 120,
  errors: 40,
  toolNames: 60,
  text: 160,
}

/**
 * Best-effort identity of the session an execution belongs to.
 * @param {object} [exec] - tool execution.
 * @returns {string} stable key, `unknown` when nothing identifies it.
 */
export function sessionKey(exec) {
  const candidates = [
    exec?.agent?.session?.id,
    exec?.agent?.sessionId,
    exec?.agent?.id,
    exec?.sessionId,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate !== '') return candidate
  }
  return 'unknown'
}

/**
 * Collapse whitespace and cut to a readable length.
 * @param {unknown} value - raw value.
 * @param {number} [max] - character cap.
 * @returns {string} one-line text.
 */
function oneLine(value, max = LIMITS.text) {
  const text = String(value ?? '').replace(/\s+/gu, ' ').trim()
  return text.length <= max ? text : `${text.slice(0, Math.max(max - 1, 1))}\u2026`
}

/**
 * Whether a string plausibly names a filesystem path.
 * @param {string} value - candidate.
 * @returns {boolean} true when it looks like a path.
 */
function looksLikePath(value) {
  if (value === '' || value.length > 400) return false
  if (/[\r\n]/u.test(value)) return false
  return LOOKS_LIKE_PATH.test(value)
}

/**
 * Whether a value under a known path key is usable as a path.
 * @param {string} value - trimmed candidate.
 * @returns {boolean} true when it can be recorded.
 */
function usablePath(value) {
  return value !== '' && value.length <= 400 && !/[\r\n]/u.test(value)
}

/**
 * Collect path-like strings from one argument bag.
 * @param {unknown} args - parsed tool arguments.
 * @returns {string[]} paths, deduplicated, in argument order.
 */
export function extractPaths(args) {
  /** @type {Set<string>} */
  const found = new Set()
  const visit = (value, key, depth) => {
    if (depth > 3 || value === null || value === undefined) return
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (PATH_KEYS.includes(key) ? usablePath(trimmed) : looksLikePath(trimmed)) found.add(trimmed)
      return
    }
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, key, depth + 1)
      return
    }
    if (typeof value === 'object') {
      for (const [childKey, childValue] of Object.entries(value)) visit(childValue, childKey, depth + 1)
    }
  }
  visit(args, '', 0)
  return [...found].slice(0, 40)
}

/**
 * Extract the command line from one argument bag.
 * @param {unknown} args - parsed tool arguments.
 * @returns {string} command, empty when absent.
 */
export function extractCommand(args) {
  if (typeof args !== 'object' || args === null) return ''
  for (const key of COMMAND_KEYS) {
    const value = /** @type {Record<string, unknown>} */ (args)[key]
    if (typeof value === 'string' && value.trim() !== '') return oneLine(value)
  }
  return ''
}

/**
 * Text of a tool result, for error messages only.
 * @param {object} result - tool execution result.
 * @returns {string} flattened text, capped.
 */
function resultText(result) {
  const blocks = Array.isArray(result?.content) ? result.content : []
  return oneLine(blocks.map((block) => (block?.type === 'text' ? block.text : '')).join(' '))
}

/**
 * One session's bounded fact set.
 */
class SessionFacts {
  /**
   * @param {number} [now] - clock, injectable for tests.
   */
  constructor(now = Date.now) {
    this.now = now
    /** @type {Map<string, {reads: number, writes: number, lastAt: number}>} */
    this.files = new Map()
    /** @type {{cmd: string, ok: boolean, at: number}[]} */
    this.commands = []
    /** @type {Map<string, {count: number, errors: number}>} */
    this.tools = new Map()
    /** @type {{tool: string, message: string, at: number}[]} */
    this.errors = []
    this.total = 0
    this.lastAt = 0
  }

  /**
   * Record one finished tool call.
   * @param {string} name - tool name.
   * @param {object} exec - execution (arguments attached).
   * @param {object} result - normalized result.
   * @returns {void}
   */
  record(name, exec, result) {
    const at = this.now()
    const isError = result?.isError === true
    const commandTool = COMMAND_TOOL.test(name)
    const writeTool = WRITE_TOOL.test(name)
    const readTool = READ_TOOL.test(name)

    this.total += 1
    this.lastAt = at

    const tool = this.tools.get(name) ?? { count: 0, errors: 0 }
    tool.count += 1
    if (isError) tool.errors += 1
    if (this.tools.size < LIMITS.toolNames || this.tools.has(name)) this.tools.set(name, tool)

    if (commandTool) {
      const cmd = extractCommand(exec?.arguments)
      if (cmd !== '') {
        this.commands.push({ cmd, ok: !isError, at })
        if (this.commands.length > LIMITS.commands) this.commands.splice(0, this.commands.length - LIMITS.commands)
      }
    }

    const paths = extractPaths(exec?.arguments)
    if (paths.length > 0 && (writeTool || readTool || !commandTool)) {
      for (const path of paths) {
        const entry = this.files.get(path) ?? { reads: 0, writes: 0, lastAt: 0 }
        if (writeTool) entry.writes += 1
        else entry.reads += 1
        entry.lastAt = at
        if (this.files.size < LIMITS.filePaths || this.files.has(path)) this.files.set(path, entry)
      }
    }

    if (isError) {
      this.errors.push({ tool: name, message: resultText(result), at })
      if (this.errors.length > LIMITS.errors) this.errors.splice(0, this.errors.length - LIMITS.errors)
    }
  }

  /**
   * Project the facts into the shape the tool returns.
   * @param {object} [options] - projection options.
   * @param {number} [options.limit] - maximum entries per list.
   * @param {'all'|'files'|'commands'|'tools'} [options.scope] - which section to return.
   * @returns {object} digest.
   */
  digest(options = {}) {
    const limit = Math.min(Math.max(options.limit ?? 30, 1), 100)
    const scope = options.scope ?? 'all'
    const sortByActivity = (left, right) => (right.writes + right.reads) - (left.writes + left.reads) || left.path.localeCompare(right.path)

    const written = []
    const read = []
    for (const [path, entry] of this.files) {
      if (entry.writes > 0) written.push({ path, writes: entry.writes, reads: entry.reads })
      else read.push({ path, reads: entry.reads, writes: entry.writes })
    }
    written.sort(sortByActivity)
    read.sort(sortByActivity)

    const tools = [...this.tools.entries()]
      .map(([name, value]) => ({ name, count: value.count, errors: value.errors }))
      .sort((left, right) => right.count - left.count)

    return {
      scope,
      files: {
        written: scope === 'all' || scope === 'files' ? written.slice(0, limit) : [],
        read: scope === 'all' || scope === 'files' ? read.slice(0, limit) : [],
        writtenTotal: written.length,
        readTotal: read.length,
      },
      commands: scope === 'all' || scope === 'commands' ? this.commands.slice(-limit) : [],
      commandTotal: this.commands.length,
      tools: scope === 'all' || scope === 'tools' ? tools.slice(0, limit) : [],
      errors: scope === 'all' ? this.errors.slice(-limit) : [],
      totals: {
        calls: this.total,
        files: this.files.size,
        commands: this.commands.length,
        tools: this.tools.size,
        errors: this.errors.length,
      },
    }
  }
}

/**
 * Per-session fact stores with LRU eviction.
 */
export class SessionStore {
  /**
   * @param {object} [options] - store options.
   * @param {number} [options.sessions] - how many sessions to keep.
   * @param {() => number} [options.now] - clock, injectable for tests.
   */
  constructor(options = {}) {
    this.maxSessions = options.sessions ?? LIMITS.sessions
    this.now = options.now ?? Date.now
    /** @type {Map<string, SessionFacts>} */
    this.sessions = new Map()
  }

  /**
   * Store for one key, created on demand and moved to the end on use.
   * @param {string} key - session key.
   * @returns {SessionFacts} store.
   */
  for(key) {
    let facts = this.sessions.get(key)
    if (facts === undefined) {
      facts = new SessionFacts(this.now)
      this.sessions.set(key, facts)
    } else {
      this.sessions.delete(key)
      this.sessions.set(key, facts)
    }
    while (this.sessions.size > this.maxSessions) {
      const oldest = this.sessions.keys().next().value
      this.sessions.delete(oldest)
    }
    return facts
  }

  /**
   * Handle one `tools/result` event.
   * @param {object} exec - execution with arguments.
   * @param {object} result - normalized result.
   * @returns {void}
   */
  record(exec, result) {
    const name = exec?.name
    if (typeof name !== 'string' || name === '') return
    if (OWN_TOOLS.has(name)) return
    this.for(sessionKey(exec)).record(name, exec, result)
  }

  /**
   * Digest for the session an execution belongs to.
   * @param {object} exec - execution that identifies the session.
   * @param {object} [options] - projection options.
   * @returns {object} digest.
   */
  digestFor(exec, options) {
    const key = sessionKey(exec)
    const facts = this.sessions.get(key)
    if (facts === undefined) {
      return {
        scope: options?.scope ?? 'all',
        files: { written: [], read: [], writtenTotal: 0, readTotal: 0 },
        commands: [],
        commandTotal: 0,
        tools: [],
        errors: [],
        totals: { calls: 0, files: 0, commands: 0, tools: 0, errors: 0 },
      }
    }
    return facts.digest(options)
  }

  /**
   * Drop one session's facts.
   * @param {string} key - session key.
   * @returns {boolean} whether anything was dropped.
   */
  clear(key) {
    return this.sessions.delete(key)
  }
}
