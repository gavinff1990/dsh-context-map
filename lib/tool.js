/**
 * The model-facing tool definition.
 *
 * Registered as a plain `ToolDefinition`: `parameters` is already the wire-level
 * JSON Schema the model sees, so this package needs no dependency on the
 * harness packages and cannot drift when their authoring DSL changes. Input is
 * validated by `normalizeSpec`, which reports a fixable message per mistake.
 * @module dsh-context-map/tool
 */

import { writeMap } from './build.js'
import { VERSION } from './version.js'

/** The tool name the model calls. */
export const TOOL_NAME = 'context_map'

/** Longest description that still fits comfortably in a system prompt. */
const DESCRIPTION = [
  'Turn the conversation so far into an information-architecture map of its context.',
  'Use it when the user asks to visualise, map, outline, or summarise the structure of a discussion, plan or project — "draw the context of this chat", "make an architecture map", "给我画一张上下文结构图".',
  'Distill the conversation yourself into 10–30 nodes: one `goal` root, then 3–5 branches (research, decisions, delivery, risks), each with 2–6 children.',
  'Group by meaning rather than listing every point under the goal — a flat star of twenty siblings is unreadable; two or three levels read as a structure.',
  'Choose `kind` by what a node does in the argument: `goal` drives the work, `context` constrains it, `decision` settles a question, `action` moves it, `artifact` is a thing produced, `risk` can break it, `question` is still open, `note` is worth keeping.',
  'Keep labels short (one line the reader can scan) and put the qualifying sentence in `detail`.',
  'When the map should cite what actually happened — files touched, commands run — call `session_facts` first and use its `path` values in `artifact` and `action` nodes instead of recalling them.',
  'The tool writes a self-contained SVG, an interactive searchable HTML page and a Mermaid Markdown file into the workspace, and returns their paths.',
  'Prefer one map per topic: if the discussion splits into two unrelated projects, call it twice.',
].join(' ')

/**
 * JSON Schema for the model-facing arguments.
 * @returns {object} raw schema in the harness-enforced subset.
 */
function parameters() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'nodes'],
    properties: {
      title: {
        type: 'string',
        description: 'Map title: what this context is about, at most one short line. Use the user’s own words when they named the topic.',
      },
      subtitle: {
        type: 'string',
        description: 'Optional second line: the decision or question the map answers, or the session it came from.',
      },
      nodes: {
        type: 'array',
        description: 'The outline. First node is usually the goal root; every other node names its `parent` by id.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label'],
          properties: {
            id: { type: 'string', description: 'Stable id used by `parent` and `links`. Optional; defaults to n1, n2, … in input order.' },
            label: { type: 'string', description: 'Short scannable label, ideally under 40 characters.' },
            kind: {
              type: 'string',
              description: 'goal: what the user wants. context: constraint or background. decision: a choice already made. action: work being or to be done. artifact: a file, document, diagram or other deliverable. risk: something that can break. question: something still open. note: anything else worth keeping.',
              enum: ['goal', 'context', 'decision', 'action', 'artifact', 'risk', 'question', 'note'],
            },
            detail: { type: 'string', description: 'One clarifying sentence: the evidence, the reason, or the exact path.' },
            parent: { type: 'string', description: 'Id of the parent node, or omit for a root. Only one root is usual.' },
            status: {
              type: 'string',
              description: 'Optional progress marker drawn as a dot.',
              enum: ['done', 'active', 'planned', 'blocked', 'unknown'],
            },
          },
        },
      },
      links: {
        type: 'array',
        description: 'Cross links for dependencies the tree cannot express, e.g. a risk that threatens a decision. Draw sparingly.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['from', 'to'],
          properties: {
            from: { type: 'string', description: 'Source node id.' },
            to: { type: 'string', description: 'Target node id.' },
            label: { type: 'string', description: 'Optional short relation, e.g. "blocks".' },
          },
        },
      },
      outDir: {
        type: 'string',
        description: 'Directory for the three files. Prefer an absolute path inside the user’s project, e.g. "<workspace>/docs/context-map"; a relative path resolves against the process working directory. Defaults to .dsh-context-map.',
      },
      slug: { type: 'string', description: 'File base name, ASCII letters, digits and dashes. Defaults to the title.' },
      formats: {
        type: 'array',
        description: 'Which artifacts to write. Defaults to all three.',
        items: { type: 'string', enum: ['svg', 'html', 'md'] },
      },
      theme: { type: 'string', description: 'Palette for the SVG and the initial HTML theme.', enum: ['light', 'dark', 'auto'] },
      locale: { type: 'string', description: 'Language of the kind pills, legend and UI copy.', enum: ['zh', 'en'] },
    },
  }
}

/**
 * JSON Schema of the canonical output value.
 * @returns {object} raw schema.
 */
function outputSchema() {
  return {
    type: 'object',
    additionalProperties: true,
    required: ['title', 'files', 'stats'],
    properties: {
      title: { type: 'string' },
      files: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: true,
          required: ['format', 'path', 'bytes'],
          properties: {
            format: { type: 'string' },
            path: { type: 'string' },
            bytes: { type: 'integer' },
          },
        },
      },
      stats: {
        type: 'object',
        additionalProperties: true,
        required: ['nodes', 'depth', 'links', 'width', 'height'],
        properties: {
          nodes: { type: 'integer' },
          depth: { type: 'integer' },
          links: { type: 'integer' },
          width: { type: 'number' },
          height: { type: 'number' },
          kinds: { type: 'object', additionalProperties: true },
        },
      },
    },
  }
}

/**
 * The directory relative paths resolve against.
 *
 * The harness runs tool bodies in its own process, so `process.cwd()` is the
 * application directory rather than the session workspace. Prefer a workspace
 * the execution context exposes, then the environment, then the process.
 * @param {object} [exec] - tool run context.
 * @returns {string} absolute base directory.
 */
function baseDirectory(exec) {
  const candidates = [
    exec?.agent?.session?.cwd,
    exec?.agent?.cwd,
    process.env.DSH_CONTEXT_MAP_BASE,
    process.env.DSH_WORKSPACE,
    process.cwd(),
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate !== '') return candidate
  }
  return process.cwd()
}

/**
 * One-line summary rendered as the model-facing result content.
 * @param {object} value - canonical output value.
 * @returns {string} text.
 */
function summary(value) {
  const lines = [
    `Context map written: ${value.title}`,
    ...value.files.map((file) => `- ${file.format.toUpperCase()} ${file.path} (${file.bytes} B)`),
    `${value.stats.nodes} nodes · ${value.stats.depth} levels · ${value.stats.links} cross links · ${value.stats.width}×${value.stats.height}px`,
    'Open the HTML in a browser to zoom, search and filter by kind; embed the SVG directly; commit the Markdown for a reviewable diff.',
  ]
  return lines.join('\n')
}

/**
 * Build the tool definition registered with `ctx.tools`.
 * @returns {object} a complete `ToolDefinition`.
 */
export function createContextMapTool() {
  return {
    name: TOOL_NAME,
    description: DESCRIPTION,
    parameters: parameters(),
    output: {
      schema: outputSchema(),
      /**
       * @param {unknown} _args - validated arguments, unused.
       * @param {object} value - canonical output value.
       * @returns {{type: 'text', text: string}[]} model-facing content.
       */
      render(_args, value) {
        return [{ type: 'text', text: summary(value) }]
      },
    },
    /**
     * @param {unknown} args - model-supplied arguments.
     * @param {object} exec - execution identity and cancellation.
     * @returns {Promise<object>} canonical output value.
     */
    async execute(args, exec) {
      exec?.signal?.throwIfAborted()
      const written = await writeMap(args, {
        base: baseDirectory(exec),
        signal: exec?.signal,
        version: VERSION,
      })
      return {
        title: written.model.title,
        files: written.files,
        stats: written.stats,
      }
    },
    /**
     * Pending card in a UI.
     * @param {unknown} args - model-supplied arguments.
     * @returns {object} render intent.
     */
    presentCall(args) {
      const title = typeof args === 'object' && args !== null && typeof (/** @type {any} */ (args).title) === 'string'
        ? /** @type {any} */ (args).title
        : 'Context map'
      return { card: 'generic', title: `Context map · ${title}`, kind: 'other' }
    },
    /**
     * Completed card in a UI.
     * @param {unknown} _args - arguments.
     * @param {object} result - durable result.
     * @returns {object} render intent.
     */
    presentResult(_args, result) {
      return { card: 'generic', title: 'Context map', content: result.content }
    },
  }
}
