/**
 * Deterministic tree layout.
 *
 * A left-to-right information architecture: depth becomes a column, siblings
 * stack vertically, a parent is centered on the block of its children, and each
 * column is as wide as its widest card so the grid reads as one structure. No
 * randomness, no canvas, no font metrics from the browser: the same spec always
 * produces the same coordinates, which is what makes the output testable and
 * diff-friendly in git.
 * @module dsh-context-map/layout
 */

import { measureText, wrapText } from './text.js'
import { kindLabel, statusLabel } from './theme.js'

/** Pixel metrics of the drawing. */
export const METRICS = {
  padX: 56,
  padBottom: 104,
  gapX: 76,
  gapY: 16,
  minCardWidth: 172,
  maxCardWidth: 320,
  padCardX: 15,
  padCardY: 13,
  radius: 12,
  labelSize: 13.5,
  labelLine: 19,
  detailSize: 11.5,
  detailLine: 15,
  pillSize: 9.5,
  pillHeight: 15,
  pillGap: 7,
  statusDot: 6,
  titleSize: 24,
  titleLine: 31,
  subtitleSize: 12.5,
  subtitleLine: 19,
  legendRow: 30,
  minCanvasWidth: 760,
}

/**
 * Clamp a value.
 * @param {number} value - candidate.
 * @param {number} min - lower bound.
 * @param {number} max - upper bound.
 * @returns {number} clamped value.
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Measure a card before column widths are known.
 * @param {object} node - normalized node.
 * @param {'zh'|'en'} locale - label locale.
 * @returns {{width: number, pill: number}} natural content width and pill width.
 */
function naturalWidth(node, locale) {
  const m = METRICS
  const pill = measureText(kindLabel(node.kind, locale), m.pillSize) + 14
  const content = m.maxCardWidth - m.padCardX * 2
  const label = Math.min(measureText(node.label, m.labelSize), content)
  const detail = node.detail === '' ? 0 : Math.min(measureText(node.detail, m.detailSize), content)
  const status = node.status === 'unknown' ? 0 : m.statusDot + 6
  const width = clamp(Math.max(label, detail, pill + status + 4) + m.padCardX * 2, m.minCardWidth, m.maxCardWidth)
  return { width, pill }
}

/**
 * Lay out one normalized model.
 * @param {object} model - output of `normalizeSpec`.
 * @param {object} [options] - layout options.
 * @param {'light'|'dark'} [options.theme] - theme used only for the exported metadata.
 * @returns {object} geometry consumed by every renderer.
 */
export function layout(model, options = {}) {
  const m = METRICS
  const locale = model.locale
  void options

  /** @type {Map<number, number>} */
  const columnWidths = new Map()
  for (const node of model.nodes) {
    const { width } = naturalWidth(node, locale)
    columnWidths.set(node.depth, Math.max(columnWidths.get(node.depth) ?? 0, width))
  }
  const depthCount = Math.max(...model.nodes.map((node) => node.depth)) + 1
  for (let depth = 0; depth < depthCount; depth += 1) {
    if (!columnWidths.has(depth)) columnWidths.set(depth, m.minCardWidth)
  }

  /** @type {Map<number, number>} */
  const columnX = new Map()
  let cursorX = m.padX
  for (let depth = 0; depth < depthCount; depth += 1) {
    columnX.set(depth, cursorX)
    cursorX += columnWidths.get(depth) + m.gapX
  }
  const contentWidth = cursorX - m.gapX + m.padX
  const width = Math.max(contentWidth, m.minCanvasWidth)

  const headerTextWidth = width - m.padX * 2 - 200
  const titleLines = wrapText(model.title, m.titleSize, Math.max(headerTextWidth, 240))
  const subtitleLines = model.subtitle === '' ? [] : wrapText(model.subtitle, m.subtitleSize, Math.max(headerTextWidth, 240))
  const headerHeight = 58 + titleLines.length * m.titleLine + (subtitleLines.length > 0 ? subtitleLines.length * m.subtitleLine + 6 : 0) + 30

  // Sizes first, then heights, because wrapping depends on the column width.
  for (const node of model.nodes) {
    const columnW = columnWidths.get(node.depth)
    node.w = columnW
    node.h = 0
    node.pillW = naturalWidth(node, locale).pill
  }

  const textWidthFor = (node) => node.w - m.padCardX * 2
  for (const node of model.nodes) {
    node.labelLines = wrapText(node.label, m.labelSize, textWidthFor(node))
    node.detailLines = node.detail === '' ? [] : wrapText(node.detail, m.detailSize, textWidthFor(node))
    node.h = m.padCardY * 2 + m.pillHeight + m.pillGap + node.labelLines.length * m.labelLine + (node.detailLines.length > 0 ? 4 + node.detailLines.length * m.detailLine : 0)
  }

  /**
   * Total vertical extent of one subtree.
   * @param {object} node - subtree root.
   * @returns {number} height in pixels.
   */
  function subtreeHeight(node) {
    if (node.children.length === 0) return node.h
    let total = 0
    for (const child of node.children) total += subtreeHeight(child) + m.gapY
    total -= m.gapY
    return Math.max(total, node.h)
  }

  let cursorY = headerHeight
  for (const root of model.roots) {
    root.subtree = subtreeHeight(root)
    placeTree(root, cursorY)
    cursorY += root.subtree + m.gapY * 2
  }
  const treeBottom = cursorY - m.gapY * 2

  /**
   * Place one subtree from its top edge.
   * @param {object} node - subtree root.
   * @param {number} top - top edge in pixels.
   */
  function placeTree(node, top) {
    node.x = columnX.get(node.depth)
    node.subTop = top
    if (node.children.length === 0) {
      node.y = top + (node.subtree - node.h) / 2
      return
    }
    let childrenTotal = 0
    for (const child of node.children) {
      child.subtree = subtreeHeight(child)
      childrenTotal += child.subtree + m.gapY
    }
    childrenTotal -= m.gapY
    let childTop = top + (node.subtree - childrenTotal) / 2
    for (const child of node.children) {
      placeTree(child, childTop)
      childTop += child.subtree + m.gapY
    }
    node.y = top + (node.subtree - node.h) / 2
  }

  const edges = []
  for (const node of model.nodes) {
    for (const child of node.children) {
      const x1 = node.x + node.w
      const y1 = node.y + node.h / 2
      const x2 = child.x
      const y2 = child.y + child.h / 2
      const bend = Math.max((x2 - x1) * 0.52, 26)
      edges.push({
        from: node.id,
        to: child.id,
        d: `M ${round(x1)} ${round(y1)} C ${round(x1 + bend)} ${round(y1)}, ${round(x2 - bend)} ${round(y2)}, ${round(x2)} ${round(y2)}`,
      })
    }
  }

  const crossLinks = []
  for (const link of model.links) {
    const from = model.byId.get(link.from)
    const to = model.byId.get(link.to)
    if (from === undefined || to === undefined) continue
    const sameColumn = Math.abs(from.x - to.x) < 1
    if (sameColumn) {
      // Same column: leave and re-enter from the right so the curve never runs
      // behind unrelated cards. The label sits on the bulge, outside the cards.
      const x = from.x + from.w
      const y1 = from.y + from.h / 2
      const y2 = to.y + to.h / 2
      const bulge = 56
      crossLinks.push({
        ...link,
        d: `M ${round(x)} ${round(y1)} C ${round(x + bulge)} ${round(y1)}, ${round(x + bulge)} ${round(y2)}, ${round(x)} ${round(y2)}`,
        labelX: round(x + bulge + 8),
        labelY: round((y1 + y2) / 2),
      })
      continue
    }
    const x1 = from.x + from.w / 2
    const y1 = from.y + from.h
    const x2 = to.x + to.w / 2
    const y2 = to.y
    const below = y2 > y1
    const lift = Math.max(Math.abs(y2 - y1) * 0.28, 34)
    const d = below
      ? `M ${round(x1)} ${round(y1)} C ${round(x1)} ${round(y1 + lift)}, ${round(x2)} ${round(y2 - lift)}, ${round(x2)} ${round(y2)}`
      : `M ${round(x1)} ${round(y1)} C ${round(x1 + 40)} ${round(y1 + lift * 0.6)}, ${round(x2 - 40)} ${round(y2 - lift * 0.6)}, ${round(x2)} ${round(y2)}`
    crossLinks.push({
      ...link,
      d,
      labelX: round((x1 + x2) / 2 + 16),
      labelY: round((y1 + y2) / 2),
    })
  }

  const maxDepth = Math.max(...model.nodes.map((node) => node.depth))
  const legendRows = Math.ceil(Object.keys(modelKindCounts(model)).length / 6)
  const footerHeight = m.legendRow * Math.max(legendRows, 1) + 58

  // A cross link routed around the right edge needs room for its bulge and its
  // label; widen the canvas instead of letting the curve clip.
  let canvasWidth = width
  for (const link of crossLinks) {
    const halfChip = link.label === '' ? 6 : measureText(link.label, 9.5) / 2 + 10
    canvasWidth = Math.max(canvasWidth, link.labelX + halfChip + m.padX)
  }

  return {
    width: round(canvasWidth),
    height: round(treeBottom + footerHeight + m.padBottom),
    contentTop: round(headerHeight),
    contentBottom: round(treeBottom),
    columns: Array.from({ length: depthCount }, (_, depth) => round(columnWidths.get(depth))),
    columnX: Array.from({ length: depthCount }, (_, depth) => round(columnX.get(depth))),
    nodes: model.nodes,
    edges,
    crossLinks,
    roots: model.roots.map((node) => node.id),
    depth: maxDepth + 1,
    titleLines,
    subtitleLines,
    headerHeight: round(headerHeight),
    legendY: round(treeBottom + 34),
    metrics: m,
  }
}

/**
 * Count nodes per kind, in legend order.
 * @param {object} model - normalized model.
 * @returns {Record<string, number>} counts keyed by kind.
 */
export function modelKindCounts(model) {
  /** @type {Record<string, number>} */
  const counts = {}
  for (const node of model.nodes) counts[node.kind] = (counts[node.kind] ?? 0) + 1
  return counts
}

/**
 * Round to a stable precision so output files do not churn on float noise.
 * @param {number} value - raw number.
 * @returns {number} rounded number.
 */
export function round(value) {
  return Math.round(value * 100) / 100
}

/**
 * Nodes ordered for the accessible outline: depth first, then input order.
 * @param {object} model - normalized model.
 * @returns {object[]} nodes in reading order.
 */
export function readingOrder(model) {
  /** @type {object[]} */
  const out = []
  /**
   * @param {object} node - subtree root.
   */
  function visit(node) {
    out.push(node)
    for (const child of node.children) visit(child)
  }
  for (const root of model.roots) visit(root)
  return out
}

/**
 * Count statuses for the summary line.
 * @param {object} model - normalized model.
 * @returns {Record<string, number>} counts keyed by status.
 */
export function statusCounts(model) {
  /** @type {Record<string, number>} */
  const counts = {}
  for (const node of model.nodes) {
    if (node.status === 'unknown') continue
    counts[node.status] = (counts[node.status] ?? 0) + 1
  }
  return counts
}

export { statusLabel }
