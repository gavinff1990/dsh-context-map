/**
 * Composition: spec to artifacts.
 *
 * Pure except for the final write, so the layout and every renderer can be
 * tested without touching a disk, and the CLI and the tool share one path.
 * @module dsh-context-map/build
 */

import { layout, modelKindCounts } from './layout.js'
import { renderMarkdown } from './markdown.js'
import { renderHtml } from './html.js'
import { normalizeSpec } from './spec.js'
import { renderSvg } from './svg.js'
import { resolveOutDir, writeArtifacts } from './files.js'
import { VERSION } from './version.js'

/**
 * Render every requested format in memory.
 * @param {unknown} input - raw tool arguments or CLI spec.
 * @param {object} [options] - build options.
 * @param {Date} [options.now] - clock for the generated-at stamp.
 * @param {string} [options.version] - version printed in artifacts.
 * @returns {{model: object, geo: object, artifacts: {format: string, filename: string, content: string}[], stats: object}} composed map.
 */
export function composeMap(input, options = {}) {
  const version = options.version ?? VERSION
  const model = normalizeSpec(input, { now: options.now })
  const geo = layout(model)
  const svg = renderSvg(model, geo, { theme: model.theme, version })
  const planned = model.formats.map((format) => ({ format, path: `${model.slug}.${format}` }))
  const artifacts = []
  if (model.formats.includes('svg')) {
    artifacts.push({ format: 'svg', filename: `${model.slug}.svg`, content: svg })
  }
  if (model.formats.includes('html')) {
    artifacts.push({ format: 'html', filename: `${model.slug}.html`, content: renderHtml(model, geo, svg, { theme: model.theme, version }) })
  }
  if (model.formats.includes('md')) {
    artifacts.push({ format: 'md', filename: `${model.slug}.md`, content: renderMarkdown(model, geo, { version, files: planned }) })
  }
  const kindCounts = modelKindCounts(model)
  return {
    model,
    geo,
    svg,
    artifacts,
    stats: {
      nodes: geo.nodes.length,
      depth: geo.depth,
      links: geo.crossLinks.length,
      kinds: kindCounts,
      width: geo.width,
      height: geo.height,
    },
  }
}

/**
 * Compose and write one map.
 * @param {unknown} input - raw tool arguments or CLI spec.
 * @param {object} options - build and destination options.
 * @param {string} options.base - working directory for a relative `outDir`.
 * @param {Date} [options.now] - clock.
 * @param {string} [options.version] - version.
 * @param {AbortSignal} [options.signal] - cancellation.
 * @returns {Promise<{model: object, geo: object, files: {format: string, path: string, bytes: number}[], stats: object}>} written map.
 */
export async function writeMap(input, options) {
  const composed = composeMap(input, options)
  const directory = resolveOutDir(options.base, composed.model.outDir)
  const files = await writeArtifacts(directory, composed.artifacts, options.signal)
  return { model: composed.model, geo: composed.geo, files, stats: composed.stats }
}
