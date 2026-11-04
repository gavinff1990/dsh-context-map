/**
 * The `.json` sidecar: the map as data.
 *
 * Every render writes a sidecar that is also a valid input spec, so a map can
 * be re-rendered, diffed between revisions, or handed back with `update` to
 * produce the next revision without re-drafting the outline.
 * @module dsh-context-map/sidecar
 */

/** Sidecar format version. */
export const SIDECAR_SCHEMA_VERSION = 1

/** How many past revisions to summarise (counts only, not snapshots). */
const HISTORY_LIMIT = 5

/**
 * A sidecar that cannot be used as an update source.
 */
export class SidecarError extends Error {
  /**
   * @param {string} code - stable machine code.
   * @param {string} message - actionable description.
   */
  constructor(code, message) {
    super(message)
    this.name = 'SidecarError'
    this.code = code
  }
}

/**
 * Build the sidecar for one revision.
 * @param {object} model - normalized model.
 * @param {object} options - build options.
 * @param {object|null} [options.diff] - diff against the previous revision.
 * @param {object|null} [options.previous] - previous sidecar.
 * @param {string} [options.version] - package version.
 * @returns {object} sidecar.
 */
export function buildSidecar(model, options = {}) {
  const previous = options.previous ?? null
  const diff = options.diff ?? null
  const revision = (Number.isInteger(previous?.revision) ? previous.revision : 0) + 1

  const history = Array.isArray(previous?.history) ? [...previous.history] : []
  if (diff !== null) {
    history.push({
      revision,
      at: model.meta.generatedAt,
      added: diff.added.length,
      changed: diff.changed.length,
      removed: diff.removed.length,
      unchanged: diff.unchanged,
    })
  }

  return {
    schemaVersion: SIDECAR_SCHEMA_VERSION,
    generator: `dsh-context-map@${options.version ?? ''}`.replace(/@$/u, ''),
    title: model.title,
    subtitle: model.subtitle,
    locale: model.locale,
    theme: model.theme,
    revision,
    generatedAt: model.meta.generatedAt,
    nodes: model.nodes
      .filter((node) => node.synthetic !== true)
      .map((node) => ({
        id: node.id,
        label: node.label,
        kind: node.kind,
        detail: node.detail,
        parent: node.parent,
        status: node.status,
      })),
    links: model.links.map((link) => ({ from: link.from, to: link.to, label: link.label })),
    history: history.slice(-HISTORY_LIMIT),
  }
}

/**
 * Serialize a sidecar for writing.
 * @param {object} sidecar - sidecar.
 * @returns {string} pretty JSON with a trailing newline.
 */
export function serializeSidecar(sidecar) {
  return `${JSON.stringify(sidecar, null, 2)}\n`
}

/**
 * Validate a parsed sidecar before using it as an update source.
 * @param {unknown} value - parsed JSON.
 * @returns {object} the same value, narrowed.
 * @throws {SidecarError} when the document is not a usable revision.
 */
export function assertSidecar(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SidecarError('E_SIDECAR_SHAPE', 'The update file must be a JSON object written by this plugin.')
  }
  const sidecar = /** @type {Record<string, unknown>} */ (value)
  if (sidecar.schemaVersion !== SIDECAR_SCHEMA_VERSION) {
    throw new SidecarError(
      'E_SIDECAR_VERSION',
      `The update file declares schemaVersion ${JSON.stringify(sidecar.schemaVersion)}; this version reads ${SIDECAR_SCHEMA_VERSION}.`,
    )
  }
  if (!Array.isArray(sidecar.nodes) || sidecar.nodes.length === 0) {
    throw new SidecarError('E_SIDECAR_NODES', 'The update file has no nodes array to compare against.')
  }
  for (const [index, node] of sidecar.nodes.entries()) {
    if (typeof node !== 'object' || node === null) {
      throw new SidecarError('E_SIDECAR_NODE', `The update file's nodes[${index}] is not an object.`)
    }
    if (typeof node.id !== 'string' || node.id === '' || typeof node.label !== 'string') {
      throw new SidecarError('E_SIDECAR_NODE', `The update file's nodes[${index}] needs string id and label fields.`)
    }
  }
  if (sidecar.revision !== undefined && !Number.isInteger(sidecar.revision)) {
    throw new SidecarError('E_SIDECAR_REVISION', 'The update file\'s revision must be an integer.')
  }
  return sidecar
}
