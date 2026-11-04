/**
 * Revision diff.
 *
 * A map that can be updated needs to say what changed since the last revision:
 * which nodes appeared, which disappeared, which were edited. Matching prefers
 * a stable id, falls back to an identical label, and never reuses one old node
 * twice — so a renamed node reads as one change, not an add plus a remove.
 * @module dsh-context-map/diff
 */

/**
 * @param {object} node - normalized or stored node.
 * @returns {{id: string, label: string, kind: string}} compact reference.
 */
const brief = (node) => ({ id: node.id, label: node.label, kind: node.kind })

/**
 * Compare a stored revision with the new model.
 * @param {{nodes: object[]}} previous - sidecar from the last revision.
 * @param {object} next - normalized model.
 * @returns {{added: object[], removed: object[], changed: object[], unchanged: number, addedIds: Set<string>, changedIds: Set<string>, removedIds: Set<string>}}
 */
export function diffModels(previous, next) {
  const oldNodes = Array.isArray(previous?.nodes) ? previous.nodes : []
  const byId = new Map()
  const byLabel = new Map()
  for (const node of oldNodes) {
    if (typeof node?.id === 'string') byId.set(node.id, node)
    if (typeof node?.label === 'string' && !byLabel.has(node.label)) byLabel.set(node.label, node)
  }

  /** @type {Map<string, object>} new id to old node */
  const matched = new Map()
  /** @type {Set<string>} old ids already claimed */
  const claimed = new Set()

  for (const node of next.nodes) {
    const old = byId.get(node.id)
    if (old !== undefined && !claimed.has(old.id)) {
      matched.set(node.id, old)
      claimed.add(old.id)
    }
  }
  for (const node of next.nodes) {
    if (matched.has(node.id)) continue
    const old = byLabel.get(node.label)
    if (old !== undefined && !claimed.has(old.id)) {
      matched.set(node.id, old)
      claimed.add(old.id)
    }
  }

  const added = next.nodes.filter((node) => !matched.has(node.id)).map(brief)
  const removed = oldNodes.filter((node) => !claimed.has(node.id)).map(brief)

  const changed = []
  for (const [newId, old] of matched) {
    const node = next.byId.get(newId)
    const fields = []
    if (old.label !== node.label) fields.push('label')
    if ((old.kind ?? 'context') !== node.kind) fields.push('kind')
    if ((old.detail ?? '') !== node.detail) fields.push('detail')
    if ((old.parent ?? null) !== (node.parent ?? null)) fields.push('parent')
    if ((old.status ?? 'unknown') !== node.status) fields.push('status')
    if (fields.length > 0) changed.push({ id: newId, label: node.label, fields })
  }

  return {
    added,
    removed,
    changed,
    unchanged: matched.size - changed.length,
    addedIds: new Set(added.map((node) => node.id)),
    changedIds: new Set(changed.map((node) => node.id)),
    removedIds: new Set(removed.map((node) => node.id)),
  }
}

/**
 * Human-readable summary of a diff.
 * @param {ReturnType<typeof diffModels>|null} diff - diff or null.
 * @param {'zh'|'en'} locale - label language.
 * @returns {string} e.g. `新增 2 · 修改 1 · 删除 0`, or an empty string.
 */
export function diffSummary(diff, locale = 'zh') {
  if (diff === null) return ''
  const zh = locale !== 'en'
  const parts = [
    `${zh ? '新增' : 'added'} ${diff.added.length}`,
    `${zh ? '修改' : 'changed'} ${diff.changed.length}`,
    `${zh ? '删除' : 'removed'} ${diff.removed.length}`,
  ]
  return parts.join(' · ')
}
