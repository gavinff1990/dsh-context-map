/**
 * Input normalization.
 *
 * The model hands the tool a loose outline. Everything downstream — layout,
 * SVG, HTML, Markdown — works on the tighter model this module returns: stable
 * ids, validated kinds, a single rooted tree plus optional cross links, and the
 * export options resolved to concrete defaults.
 * @module dsh-context-map/spec
 */

/** Node kinds, in legend order. */
export const KINDS = ['goal', 'context', 'decision', 'action', 'artifact', 'risk', 'question', 'note']
/** Optional node progress markers. */
export const STATUSES = ['done', 'active', 'planned', 'blocked', 'unknown']
/** Exportable formats, in write order. */
export const FORMATS = ['svg', 'html', 'md']
/** Supported UI locales. */
export const LOCALES = ['zh', 'en']
/** Supported themes. */
export const THEMES = ['light', 'dark', 'auto']

/** Hard limits that keep one map readable and one file small. */
export const LIMITS = {
  nodes: 300,
  links: 150,
  title: 120,
  subtitle: 200,
  label: 240,
  detail: 600,
  linkLabel: 60,
}

/**
 * A rejected spec: a caller mistake the model can fix from the message alone.
 */
export class SpecError extends Error {
  /**
   * @param {string} code - stable machine code, e.g. `E_SPEC_KIND`.
   * @param {string} message - actionable description.
   */
  constructor(code, message) {
    super(message)
    this.name = 'SpecError'
    this.code = code
  }
}

/**
 * @param {unknown} value - candidate string.
 * @returns {string} trimmed string, empty when not a string.
 */
function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Cut a string to a character cap, marking the cut.
 * @param {string} value - source text.
 * @param {number} cap - maximum characters.
 * @returns {string} capped text.
 */
function cap(value, cap_) {
  return value.length <= cap_ ? value : `${value.slice(0, Math.max(cap_ - 1, 1)).trimEnd()}\u2026`
}

/**
 * Derive a filesystem-safe slug.
 * @param {string} value - preferred slug or source text.
 * @returns {string} `[a-z0-9-]` slug.
 */
export function slugify(value) {
  const slug = String(value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 60)
    .replace(/-+$/u, '')
  return slug === '' ? 'context-map' : slug
}

/**
 * Validate and normalize one tool call's spec.
 * @param {unknown} input - raw arguments.
 * @param {object} [options] - normalization options.
 * @param {Date} [options.now] - clock used for the generated-at stamp.
 * @returns {object} normalized model.
 * @throws {SpecError} when the outline cannot be turned into a rooted tree.
 */
export function normalizeSpec(input, options = {}) {
  const now = options.now ?? new Date()
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new SpecError('E_SPEC_ROOT', 'The spec must be an object with a `nodes` array.')
  }
  const source = /** @type {Record<string, unknown>} */ (input)

  const title = cap(text(source.title), LIMITS.title) || (text(source.subtitle) ? cap(text(source.subtitle), LIMITS.title) : 'Context map')
  const subtitle = cap(text(source.subtitle), LIMITS.subtitle)
  const locale = LOCALES.includes(/** @type {string} */ (source.locale)) ? /** @type {string} */ (source.locale) : 'zh'
  const theme = THEMES.includes(/** @type {string} */ (source.theme)) ? /** @type {string} */ (source.theme) : 'auto'

  if (!Array.isArray(source.nodes) || source.nodes.length === 0) {
    throw new SpecError('E_SPEC_NODES', '`nodes` must be a non-empty array of { label, kind, parent?, detail? } objects.')
  }
  if (source.nodes.length > LIMITS.nodes) {
    throw new SpecError('E_SPEC_SIZE', `This outline has ${source.nodes.length} nodes; one map is capped at ${LIMITS.nodes}. Group related leaves under a shared parent.`)
  }

  /** @type {Map<string, object>} */
  const byId = new Map()
  /** @type {object[]} */
  const nodes = []
  source.nodes.forEach((raw, index) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new SpecError('E_SPEC_NODE', `nodes[${index}] must be an object.`)
    }
    const node = /** @type {Record<string, unknown>} */ (raw)
    const label = cap(text(node.label), LIMITS.label)
    if (label === '') throw new SpecError('E_SPEC_LABEL', `nodes[${index}] has an empty label. Every node needs a short label a reader can scan.`)
    const id = text(node.id) || `n${index + 1}`
    if (byId.has(id)) throw new SpecError('E_SPEC_ID', `Duplicate node id "${id}". Ids must be unique.`)
    const kind = text(node.kind) || 'context'
    if (!KINDS.includes(kind)) {
      throw new SpecError('E_SPEC_KIND', `nodes[${index}] ("${label}") has kind "${kind}"; valid kinds are ${KINDS.join(', ')}.`)
    }
    const status = text(node.status)
    if (status !== '' && !STATUSES.includes(status)) {
      throw new SpecError('E_SPEC_STATUS', `nodes[${index}] ("${label}") has status "${status}"; valid statuses are ${STATUSES.join(', ')}.`)
    }
    /** @type {object} */
    const entry = {
      id,
      label,
      kind,
      detail: cap(text(node.detail), LIMITS.detail),
      status: status === '' ? 'unknown' : status,
      parent: text(node.parent) || null,
      synthetic: false,
      depth: 0,
      children: [],
    }
    byId.set(id, entry)
    nodes.push(entry)
  })

  for (const [index, node] of nodes.entries()) {
    if (node.parent === null) continue
    if (node.parent === node.id) throw new SpecError('E_SPEC_PARENT', `nodes[${index}] ("${node.label}") lists itself as its parent.`)
    if (!byId.has(node.parent)) {
      throw new SpecError('E_SPEC_PARENT', `nodes[${index}] ("${node.label}") points at parent "${node.parent}", which is not a node id in this map.`)
    }
  }

  // Cycle guard: every chain must terminate at a root inside `nodes.length` hops.
  for (const node of nodes) {
    let cursor = node
    let hops = 0
    while (cursor.parent !== null) {
      if (hops > nodes.length) {
        throw new SpecError('E_SPEC_CYCLE', `Node "${node.id}" is part of a parent cycle; the outline must be a tree.`)
      }
      cursor = byId.get(cursor.parent)
      hops += 1
    }
  }

  let roots = nodes.filter((node) => node.parent === null)
  if (roots.length > 1) {
    const synthetic = {
      id: '__root__',
      label: subtitle || (locale === 'zh' ? '上下文全景' : 'Context overview'),
      kind: 'context',
      detail: '',
      status: 'unknown',
      parent: null,
      synthetic: true,
      depth: 0,
      children: [],
    }
    byId.set(synthetic.id, synthetic)
    nodes.unshift(synthetic)
    for (const root of roots) root.parent = synthetic.id
    roots = [synthetic]
  }

  // Depth and child links, breadth-first from the single root.
  const queue = [...roots]
  while (queue.length > 0) {
    const node = queue.shift()
    node.children = []
    for (const child of nodes) {
      if (child.parent === node.id) {
        child.depth = node.depth + 1
        node.children.push(child)
        queue.push(child)
      }
    }
  }

  /** @type {{from: string, to: string, label: string}[]} */
  const links = []
  if (source.links !== undefined) {
    if (!Array.isArray(source.links)) throw new SpecError('E_SPEC_LINKS', '`links` must be an array of { from, to, label? } objects.')
    if (source.links.length > LIMITS.links) {
      throw new SpecError('E_SPEC_SIZE', `This map declares ${source.links.length} cross links; the cap is ${LIMITS.links}.`)
    }
    const seen = new Set()
    source.links.forEach((raw, index) => {
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new SpecError('E_SPEC_LINKS', `links[${index}] must be an object.`)
      }
      const link = /** @type {Record<string, unknown>} */ (raw)
      const from = text(link.from)
      const to = text(link.to)
      if (!byId.has(from)) throw new SpecError('E_SPEC_LINKS', `links[${index}] starts at "${from}", which is not a node id in this map.`)
      if (!byId.has(to)) throw new SpecError('E_SPEC_LINKS', `links[${index}] ends at "${to}", which is not a node id in this map.`)
      if (from === to) throw new SpecError('E_SPEC_LINKS', `links[${index}] points "${from}" at itself.`)
      const label = cap(text(link.label), LIMITS.linkLabel)
      const key = `${from}\u0000${to}\u0000${label}`
      if (seen.has(key)) return
      seen.add(key)
      links.push({ from, to, label })
    })
  }

  let formats = FORMATS
  if (source.formats !== undefined) {
    if (!Array.isArray(source.formats)) throw new SpecError('E_SPEC_FORMATS', '`formats` must be an array using any of: svg, html, md.')
    const picked = FORMATS.filter((format) => source.formats.includes(format))
    if (picked.length === 0) throw new SpecError('E_SPEC_FORMATS', '`formats` selected nothing; use any of: svg, html, md.')
    formats = picked
  }

  const outDir = text(source.outDir) || '.dsh-context-map'
  const slug = slugify(text(source.slug) || title)
  const metaSource = typeof source.meta === 'object' && source.meta !== null ? /** @type {Record<string, unknown>} */ (source.meta) : {}

  return {
    title,
    subtitle,
    locale,
    theme,
    nodes,
    byId,
    roots,
    links,
    formats,
    outDir,
    slug,
    meta: {
      generatedAt: now.toISOString(),
      source: cap(text(metaSource.source), 160),
      version: text(metaSource.version),
    },
  }
}
