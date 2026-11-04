/**
 * Composition: spec to artifacts.
 *
 * Pure except for the final write and the optional sidecar read, so layout and
 * every renderer can be tested without touching a disk, and the CLI and the
 * tool share one path.
 * @module dsh-context-map/build
 */

import { diffModels } from './diff.js'
import { layout, modelKindCounts } from './layout.js'
import { renderMarkdown } from './markdown.js'
import { renderHtml } from './html.js'
import { normalizeSpec } from './spec.js'
import { renderSvg } from './svg.js'
import { resolveOutDir, readSidecar, writeArtifacts } from './files.js'
import { buildSidecar, serializeSidecar } from './sidecar.js'
import { VERSION } from './version.js'

/**
 * Render every requested format for one normalized model.
 * @param {object} model - normalized model.
 * @param {object} [options] - render options.
 * @param {string} [options.version] - version printed in artifacts.
 * @param {object|null} [options.previous] - previous sidecar for diffing.
 * @returns {{model: object, geo: object, artifacts: object[], stats: object, sidecar: object, diff: object|null}}
 */
export function composeModel(model, options = {}) {
  const version = options.version ?? VERSION
  const previous = options.previous ?? null
  const diff = previous === null ? null : diffModels(previous, model)
  const geo = layout(model)
  const svg = renderSvg(model, geo, { theme: model.theme, version, diff })
  const sidecar = buildSidecar(model, { diff, previous, version })
  const planned = model.formats.map((format) => ({ format, path: `${model.slug}.${format}` }))

  const artifacts = []
  if (model.formats.includes('svg')) {
    artifacts.push({ format: 'svg', filename: `${model.slug}.svg`, content: svg })
  }
  if (model.formats.includes('html')) {
    artifacts.push({ format: 'html', filename: `${model.slug}.html`, content: renderHtml(model, geo, svg, { theme: model.theme, version, diff }) })
  }
  if (model.formats.includes('md')) {
    artifacts.push({ format: 'md', filename: `${model.slug}.md`, content: renderMarkdown(model, geo, { version, files: planned, diff }) })
  }
  if (model.formats.includes('json')) {
    artifacts.push({ format: 'json', filename: `${model.slug}.json`, content: serializeSidecar(sidecar) })
  }

  return {
    model,
    geo,
    svg,
    artifacts,
    sidecar,
    diff,
    stats: {
      nodes: geo.nodes.length,
      depth: geo.depth,
      links: geo.crossLinks.length,
      kinds: modelKindCounts(model),
      width: geo.width,
      height: geo.height,
      revision: sidecar.revision,
      ...(diff === null
        ? {}
        : {
            added: diff.added.length,
            changed: diff.changed.length,
            removed: diff.removed.length,
          }),
    },
  }
}

/**
 * Render every requested format in memory.
 * @param {unknown} input - raw tool arguments or CLI spec.
 * @param {object} [options] - build options.
 * @param {Date} [options.now] - clock for the generated-at stamp.
 * @param {string} [options.version] - version printed in artifacts.
 * @param {object|null} [options.previous] - previous sidecar for diffing.
 * @returns {object} composed map.
 */
export function composeMap(input, options = {}) {
  const model = normalizeSpec(input, { now: options.now })
  return composeModel(model, options)
}

/**
 * Compose and write one map, loading the update sidecar when asked.
 * @param {unknown} input - raw tool arguments or CLI spec.
 * @param {object} options - build and destination options.
 * @param {string} options.base - working directory for relative paths.
 * @param {Date} [options.now] - clock.
 * @param {string} [options.version] - version.
 * @param {AbortSignal} [options.signal] - cancellation.
 * @returns {Promise<object>} written map.
 */
export async function writeMap(input, options) {
  const model = normalizeSpec(input, { now: options.now })
  let previous = null
  if (model.update !== '') {
    previous = await readSidecar(model.update, options.base)
  }
  const composed = composeModel(model, { version: options.version, previous: previous?.sidecar ?? null })
  const directory = resolveOutDir(options.base, model.outDir)
  const files = await writeArtifacts(directory, composed.artifacts, options.signal)
  return {
    model: composed.model,
    geo: composed.geo,
    files,
    stats: composed.stats,
    sidecar: composed.sidecar,
    diff: composed.diff,
    previousPath: previous?.path ?? null,
  }
}
