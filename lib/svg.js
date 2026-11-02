/**
 * SVG renderer.
 *
 * One self-contained `<svg>`: inline CSS variables for both themes, inline
 * markers, no external font or image. The same markup is written to `*.svg`
 * and embedded by the HTML export, so the two can never drift.
 * @module dsh-context-map/svg
 */

import { escapeXml, measureText } from './text.js'
import { KIND_STYLES, STATUS_STYLES, kindColors, kindLabel, strings, tokens } from './theme.js'
import { METRICS, round } from './layout.js'

/**
 * @param {unknown} value - raw value.
 * @returns {string} XML-safe text.
 */
const esc = (value) => escapeXml(value)

/**
 * CSS variable block for one theme.
 * @param {'light'|'dark'} theme - theme.
 * @returns {string} declarations without a selector.
 */
function vars(theme) {
  const t = tokens(theme)
  return [
    `--bg:${t.bg}`,
    `--surface:${t.surface}`,
    `--surface-alt:${t.surfaceAlt}`,
    `--ink:${t.ink}`,
    `--ink-soft:${t.inkSoft}`,
    `--muted:${t.muted}`,
    `--faint:${t.faint}`,
    `--edge:${t.edge}`,
    `--edge-strong:${t.edgeStrong}`,
    `--pill:${t.pill}`,
    `--grid:${t.grid}`,
  ].join(';')
}

/**
 * @param {string} kind - node kind.
 * @returns {string} CSS class carrying the kind colors.
 */
const kindClass = (kind) => `cm-n-${kind}`

/**
 * Per-kind color rules for both themes.
 * @returns {string} CSS rules.
 */
function kindRules() {
  return Object.keys(KIND_STYLES).map((kind) => {
    const light = kindColors('light', kind)
    const dark = kindColors('dark', kind)
    return `  .${kindClass(kind)}{--kind:${light.accent};--card-tint:${light.fill}}\n  .cm-svg[data-theme="dark"] .${kindClass(kind)}{--kind:${dark.accent};--card-tint:${dark.fill}}\n  @media (prefers-color-scheme: dark){.cm-svg[data-theme="auto"] .${kindClass(kind)}{--kind:${dark.accent};--card-tint:${dark.fill}}}`
  }).join('\n')
}

/**
 * Render the map as an SVG document.
 * @param {object} model - normalized model.
 * @param {object} geo - layout geometry.
 * @param {object} [options] - render options.
 * @param {'light'|'dark'|'auto'} [options.theme] - requested theme.
 * @param {string} [options.version] - package version printed in the footer.
 * @returns {string} complete SVG markup.
 */
export function renderSvg(model, geo, options = {}) {
  const m = METRICS
  const t = strings(model.locale)
  const theme = options.theme ?? model.theme ?? 'auto'
  const version = options.version ?? ''
  const generated = new Date(model.meta.generatedAt)
  // Day granularity keeps a regenerated map byte-identical within the same day,
  // so a committed artifact does not churn just because it was rebuilt.
  const stamp = Number.isNaN(generated.getTime()) ? '' : generated.toISOString().slice(0, 10)

  const { width, height } = geo
  const edges = geo.edges.map((edge) => `    <path class="cm-edge" d="${edge.d}"/>`).join('\n')
  const crossLinks = geo.crossLinks.map((link) => crossLinkMarkup(link)).join('\n')
  const nodes = geo.nodes.map((node) => nodeMarkup(node, model, t)).join('\n')

  return `<svg class="cm-svg" data-theme="${esc(theme)}" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="cm-title cm-desc" font-family="'Inter', 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', system-ui, -apple-system, sans-serif">
  <title id="cm-title">${esc(model.title)} — ${esc(t.mapLabel)}</title>
  <desc id="cm-desc">${esc(model.title)}: ${geo.nodes.length} ${esc(t.nodes)}, ${geo.depth} ${esc(t.depth)}, ${geo.crossLinks.length} ${esc(t.links)}.</desc>
  <style>
  .cm-svg{${vars('light')}}
  .cm-svg[data-theme="dark"]{${vars('dark')}}
  @media (prefers-color-scheme: dark){.cm-svg[data-theme="auto"]{${vars('dark')}}}
${kindRules()}
  .cm-bg{fill:var(--bg)}
  .cm-title{fill:var(--ink);font-size:${m.titleSize}px;font-weight:650;letter-spacing:-0.2px}
  .cm-subtitle{fill:var(--muted);font-size:${m.subtitleSize}px}
  .cm-meta{fill:var(--faint);font-size:11px;letter-spacing:0.4px}
  .cm-card-halo{fill:var(--card-tint);opacity:.5}
  .cm-card{fill:var(--surface);stroke:var(--kind);stroke-opacity:.42;stroke-width:1.2px}
  .cm-accent{fill:var(--kind);opacity:.92}
  .cm-pill{fill:var(--kind);font-size:${m.pillSize}px;font-weight:700;letter-spacing:1.1px}
  .cm-label{fill:var(--ink);font-size:${m.labelSize}px;font-weight:600}
  .cm-detail{fill:var(--muted);font-size:${m.detailSize}px}
  .cm-status{fill:var(--status, transparent)}
  .cm-edge{fill:none;stroke:var(--edge-strong);stroke-width:1.5px;stroke-linecap:round;opacity:.85}
  .cm-cross{fill:none;stroke:var(--edge-strong);stroke-width:1.3px;stroke-dasharray:5 4;opacity:.7}
  .cm-cross-label{fill:var(--muted);font-size:9.5px;letter-spacing:.3px}
  .cm-cross-chip{fill:var(--surface);stroke:var(--edge);stroke-width:1px}
  .cm-legend-title{fill:var(--faint);font-size:9.5px;font-weight:700;letter-spacing:1.4px}
  .cm-legend-text{fill:var(--muted);font-size:11px}
  .cm-legend-dot{fill:var(--kind);stroke:none}
  .cm-brand{fill:var(--faint);font-size:10px;letter-spacing:.3px}
  .cm-hint{fill:var(--faint);font-size:10px}
  </style>
  <defs>
    <marker id="cm-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 1 1.6 L 9 5 L 1 8.4 z" fill="var(--edge-strong)"/>
    </marker>
  </defs>
  <rect class="cm-bg" x="0" y="0" width="${width}" height="${height}"/>
  <g class="cm-header">
    <text class="cm-meta" x="${m.padX}" y="34">${esc(t.mapLabel.toUpperCase())}</text>
    <text class="cm-meta" x="${width - m.padX}" y="34" text-anchor="end">${geo.nodes.length} ${esc(t.nodes)} · ${geo.depth} ${esc(t.depth)} · ${geo.crossLinks.length} ${esc(t.links)}</text>
    <text class="cm-meta" x="${width - m.padX}" y="52" text-anchor="end">${esc(t.generated)} ${esc(stamp)}</text>
${geo.titleLines.map((line, index) => `    <text class="cm-title" x="${m.padX}" y="${58 + index * m.titleLine + 22}">${esc(line)}</text>`).join('\n')}
${geo.subtitleLines.map((line, index) => `    <text class="cm-subtitle" x="${m.padX}" y="${58 + geo.titleLines.length * m.titleLine + 18 + index * m.subtitleLine}">${esc(line)}</text>`).join('\n')}
  </g>
  <g class="cm-links">
${edges}
  </g>
  <g class="cm-crosslinks">
${crossLinks}
  </g>
  <g class="cm-nodes">
${nodes}
  </g>
${legendMarkup(model, geo, t)}
  <text class="cm-brand" x="${m.padX}" y="${height - 26}">dsh-context-map${version === '' ? '' : ` v${esc(version)}`}</text>
  <text class="cm-hint" x="${width - m.padX}" y="${height - 26}" text-anchor="end">${esc(model.locale === 'en' ? 'Generated from the conversation outline' : '根据对话纲要生成')}</text>
</svg>
`
}

/**
 * One node card.
 * @param {object} node - laid-out node.
 * @param {object} model - normalized model.
 * @param {Record<string, string>} t - strings.
 * @returns {string} SVG group.
 */
function nodeMarkup(node, model, t) {
  const m = METRICS
  const x = round(node.x)
  const y = round(node.y)
  const w = round(node.w)
  const h = round(node.h)
  const pillY = y + m.padCardY + 10
  const labelTop = y + m.padCardY + m.pillHeight + m.pillGap + m.labelSize * 0.88
  const status = STATUS_STYLES[node.status] ?? STATUS_STYLES.unknown
  const hasStatus = status.color !== '' && node.status !== 'unknown'
  const dot = hasStatus
    ? `\n      <circle class="cm-status" cx="${round(x + m.padCardX + 4)}" cy="${round(pillY - 4)}" r="3.1" style="--status:${status.color}"><title>${esc(`${t.status}: ${model.locale === 'en' ? status.en : status.zh}`)}</title></circle>`
    : ''
  const pillX = x + m.padCardX + (hasStatus ? m.statusDot + 6 : 0)
  const labelLines = node.labelLines.map((line, index) => `      <text class="cm-label" x="${round(x + m.padCardX)}" y="${round(labelTop + index * m.labelLine)}">${esc(line)}</text>`).join('\n')
  const detailTop = labelTop + (node.labelLines.length - 1) * m.labelLine + 16
  const detailLines = node.detailLines.map((line, index) => `      <text class="cm-detail" x="${round(x + m.padCardX)}" y="${round(detailTop + index * m.detailLine)}">${esc(line)}</text>`).join('\n')
  const search = `${node.label} ${node.detail} ${node.kind}`.toLowerCase()

  return `    <g class="cm-node ${kindClass(node.kind)}" data-id="${esc(node.id)}" data-kind="${esc(node.kind)}" data-search="${esc(search)}"${node.synthetic ? ' data-synthetic="true"' : ''}>
      <rect class="cm-card-halo" x="${x}" y="${y}" width="${w}" height="${h}" rx="${m.radius}"/>
      <rect class="cm-card" x="${x}" y="${y}" width="${w}" height="${h}" rx="${m.radius}"/>
      <rect class="cm-accent" x="${x + 1}" y="${y + 10}" width="3" height="${round(h - 20)}" rx="1.5"/>
      <text class="cm-pill" x="${round(pillX)}" y="${round(pillY)}">${esc(kindLabel(node.kind, model.locale).toUpperCase())}</text>${dot}
${labelLines}
${detailLines}
    </g>`
}

/**
 * One cross-link curve with an optional label chip.
 * @param {object} link - laid-out cross link.
 * @returns {string} SVG group.
 */
function crossLinkMarkup(link) {
  if (link.label === '') {
    return `    <g class="cm-crosslink" data-from="${esc(link.from)}" data-to="${esc(link.to)}"><path class="cm-cross" d="${link.d}" marker-end="url(#cm-arrow)"/></g>`
  }
  const chipWidth = measureText(link.label, 9.5) + 12
  return `    <g class="cm-crosslink" data-from="${esc(link.from)}" data-to="${esc(link.to)}"><path class="cm-cross" d="${link.d}" marker-end="url(#cm-arrow)"/><rect class="cm-cross-chip" x="${round(link.labelX - chipWidth / 2)}" y="${round(link.labelY - 8)}" width="${round(chipWidth)}" height="16" rx="8"/><text class="cm-cross-label" x="${link.labelX}" y="${round(link.labelY + 3)}" text-anchor="middle">${esc(link.label)}</text></g>`
}

/**
 * Legend chips, six per row.
 * @param {object} model - normalized model.
 * @param {object} geo - layout geometry.
 * @param {Record<string, string>} t - strings.
 * @returns {string} SVG group.
 */
function legendMarkup(model, geo, t) {
  const m = geo.metrics
  /** @type {Record<string, number>} */
  const counts = {}
  for (const node of model.nodes) counts[node.kind] = (counts[node.kind] ?? 0) + 1
  const kinds = Object.keys(KIND_STYLES).filter((kind) => counts[kind] !== undefined)
  const perRow = 6
  const columnWidth = Math.min((geo.width - m.padX * 2) / perRow, 132)
  const rows = kinds.map((kind, index) => {
    const row = Math.floor(index / perRow)
    const column = index % perRow
    const x = m.padX + column * columnWidth
    const y = geo.legendY + row * m.legendRow
    return `    <g class="cm-legend-item ${kindClass(kind)}" data-kind="${kind}"><rect class="cm-legend-dot" x="${round(x)}" y="${round(y - 8)}" width="8" height="8" rx="2.5"/><text class="cm-legend-text" x="${round(x + 14)}" y="${round(y)}">${esc(kindLabel(kind, model.locale))} · ${counts[kind]}</text></g>`
  }).join('\n')
  return `  <g class="cm-legend">
    <text class="cm-legend-title" x="${m.padX}" y="${round(geo.legendY - 26)}">${esc(t.legend.toUpperCase())}</text>
${rows}
  </g>`
}
