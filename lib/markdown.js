/**
 * Markdown export: Mermaid source plus a readable outline.
 *
 * The `.md` file is the diff-friendly artifact — it goes into a PR, a design
 * doc or a wiki, where an SVG cannot. Mermaid class definitions mirror the SVG
 * palette so the same map keeps the same color code in both.
 * @module dsh-context-map/markdown
 */

import { escapeMermaid } from './text.js'
import { KIND_STYLES, kindColors, kindLabel, statusLabel, strings } from './theme.js'
import { diffSummary } from './diff.js'

/**
 * Keep raw angle brackets out of the Markdown artifact: a label copied from a
 * chat can contain a `<script>` sample, and the file is meant to be committed
 * and rendered by a Markdown host untouched.
 * @param {unknown} value - raw text.
 * @returns {string} Markdown-safe text.
 */
const mdSafe = (value) => String(value ?? '').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/**
 * Mermaid `flowchart` body.
 * @param {object} model - normalized model.
 * @param {Map<string, string>} ids - node id to Mermaid id.
 * @returns {string[]} lines.
 */
function mermaid(model, ids) {
  const lines = ['flowchart LR']
  for (const node of model.nodes) {
    lines.push(`  ${ids.get(node.id)}["${escapeMermaid(node.label)}"]`)
  }
  for (const node of model.nodes) {
    for (const child of node.children) {
      lines.push(`  ${ids.get(node.id)} --> ${ids.get(child.id)}`)
    }
  }
  for (const link of model.links) {
    const arrow = link.label === '' ? '-.->' : `-.->|${escapeMermaid(link.label).replaceAll('|', '/')}|`
    lines.push(`  ${ids.get(link.from)} ${arrow} ${ids.get(link.to)}`)
  }
  for (const kind of Object.keys(KIND_STYLES)) {
    if (!model.nodes.some((node) => node.kind === kind)) continue
    const light = kindColors('light', kind)
    lines.push(`  classDef ${kind} fill:${light.fill},stroke:${light.accent},stroke-width:1.5px,color:#0f172a`)
  }
  for (const kind of Object.keys(KIND_STYLES)) {
    const members = model.nodes.filter((node) => node.kind === kind).map((node) => ids.get(node.id))
    if (members.length > 0) lines.push(`  class ${members.join(',')} ${kind}`)
  }
  return lines
}

/**
 * Nested bullet outline.
 * @param {object} model - normalized model.
 * @returns {string[]} lines.
 */
function outline(model) {
  /** @type {string[]} */
  const lines = []
  /**
   * @param {object} node - subtree root.
   * @param {number} depth - indent level.
   */
  function visit(node, depth) {
    const indent = '  '.repeat(depth)
    const status = node.status === 'unknown' ? '' : ` · ${statusLabel(node.status, model.locale)}`
    const detail = node.detail === '' ? '' : ` — ${mdSafe(node.detail)}`
    lines.push(`${indent}- **${kindLabel(node.kind, model.locale)}** ${mdSafe(node.label)}${detail}${status}`)
    for (const child of node.children) visit(child, depth + 1)
  }
  for (const root of model.roots) visit(root, 0)
  return lines
}

/**
 * Render the Markdown artifact.
 * @param {object} model - normalized model.
 * @param {object} geo - layout geometry.
 * @param {object} [options] - render options.
 * @param {string} [options.version] - package version.
 * @param {{format: string, path: string}[]} [options.files] - planned files to list.
 * @param {object|null} [options.diff] - revision diff against the previous sidecar.
 * @returns {string} Markdown document.
 */
export function renderMarkdown(model, geo, options = {}) {
  const t = strings(model.locale)
  const ids = new Map(model.nodes.map((node, index) => [node.id, `n${index + 1}`]))
  /** @type {Record<string, number>} */
  const kindCounts = {}
  for (const node of model.nodes) kindCounts[node.kind] = (kindCounts[node.kind] ?? 0) + 1
  const stamp = model.meta.generatedAt.slice(0, 10)
  const version = options.version ?? ''
  const diff = options.diff ?? null

  /** @type {string[]} */
  const header = [`# ${mdSafe(model.title)}`]
  if (model.subtitle !== '') header.push('', `> ${mdSafe(model.subtitle)}`)
  header.push('', `> ${geo.nodes.length} ${t.nodes} · ${geo.depth} ${t.depth} · ${geo.crossLinks.length} ${t.links} · ${t.generated} ${stamp}`, '')

  const kindRows = Object.keys(KIND_STYLES)
    .filter((kind) => kindCounts[kind] !== undefined)
    .map((kind) => `| ${kindLabel(kind, model.locale)} (\`${kind}\`) | ${kindCounts[kind]} |`)

  const inventory = [
    `| # | ${t.inventory} | ${t.kinds} | ${t.status} |`,
    '| --- | --- | --- | --- |',
    ...model.nodes.map((node, index) => `| ${index + 1} | ${mdSafe(node.label).replaceAll('|', '\\|')} | ${kindLabel(node.kind, model.locale)} | ${statusLabel(node.status, model.locale)} |`),
  ]

  const fileList = (options.files ?? []).map((file) => `- \`${file.path}\``)

  const diffSection = diff === null ? [] : [
    `## ${model.locale === 'en' ? 'Revision changes' : '变更'}`,
    '',
    `> ${diffSummary(diff, model.locale)}`,
    '',
    ...diff.added.map((node) => `- **+** ${mdSafe(node.label)}`),
    ...diff.changed.map((node) => `- **~** ${mdSafe(node.label)}（${node.fields.join(', ')}）`),
    ...diff.removed.map((node) => `- **\u2212** ${mdSafe(node.label)}`),
    '',
  ]

  return [
    ...header,
    '```mermaid',
    ...mermaid(model, ids),
    '```',
    '',
    ...diffSection,
    `## ${t.outline}`,
    '',
    ...outline(model),
    '',
    `## ${t.kinds}`,
    '',
    '| 类型 | 数量 |',
    '| --- | --- |',
    ...kindRows,
    '',
    `## ${t.inventory}`,
    '',
    ...inventory,
    ...(fileList.length === 0 ? [] : ['', `## ${t.files}`, '', ...fileList]),
    '',
    `<sub>dsh-context-map${version === '' ? '' : ` v${version}`} · ${model.locale === 'en' ? 'generated from the conversation outline' : '根据对话纲要生成'}</sub>`,
    '',
  ].join('\n')
}
