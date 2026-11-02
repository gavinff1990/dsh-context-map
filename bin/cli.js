#!/usr/bin/env node
/**
 * Command-line entry: the same renderer the tool uses, outside of dsh.
 *
 * Useful for CI, for regenerating a committed map, and for checking a spec by
 * hand. It reads one JSON file (or stdin), writes the artifacts, and prints the
 * paths — no network, no configuration, no state.
 */

import { readFile } from 'node:fs/promises'
import { composeMap, writeMap } from '../lib/build.js'
import { resolveOutDir } from '../lib/files.js'
import { VERSION } from '../lib/version.js'

const HELP = `dsh-context-map ${VERSION} — draw a conversation's context as an architecture map

Usage
  dsh-context-map <spec.json | -> [options]

Options
  -o, --out <dir>       output directory (default: .dsh-context-map)
  -f, --formats <list>  comma separated: svg,html,md (default: all)
  -t, --theme <name>    light | dark | auto (default: auto)
  -l, --locale <name>   zh | en (default: zh)
  -s, --slug <name>     file base name (default: derived from the title)
      --stdout          print the SVG to stdout instead of writing files
      --json            print the computed geometry as JSON (debugging, previews)
  -q, --quiet           only print the written paths
  -h, --help            show this help
  -v, --version         print the version

Spec shape
  { "title": "...", "subtitle": "...", "theme": "auto", "locale": "zh",
    "nodes": [{ "id": "n1", "label": "...", "kind": "goal", "detail": "...", "parent": "n1" }],
    "links": [{ "from": "n1", "to": "n2", "label": "blocks" }] }

Example
  node bin/cli.js examples/spec.json --out examples/out
`

/**
 * @param {string[]} argv - arguments after the script name.
 * @returns {{file: string | null, options: Record<string, unknown>, help: boolean, version: boolean}}
 */
function parseArgs(argv) {
  /** @type {Record<string, unknown>} */
  const options = {}
  let file = null
  let help = false
  let version = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '-h' || arg === '--help') help = true
    else if (arg === '-v' || arg === '--version') version = true
    else if (arg === '-q' || arg === '--quiet') options.quiet = true
    else if (arg === '--stdout') options.stdout = true
    else if (arg === '--json') options.json = true
    else if (arg === '-o' || arg === '--out') options.outDir = argv[++index]
    else if (arg === '-t' || arg === '--theme') options.theme = argv[++index]
    else if (arg === '-l' || arg === '--locale') options.locale = argv[++index]
    else if (arg === '-s' || arg === '--slug') options.slug = argv[++index]
    else if (arg === '-f' || arg === '--formats') {
      const list = String(argv[++index] ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)
      options.formats = list
    } else if (arg !== '-' && arg.startsWith('-')) {
      throw new Error(`Unknown option ${arg}. Run with --help for usage.`)
    } else if (file === null) file = arg
    else throw new Error(`Unexpected extra argument ${arg}.`)
  }
  return { file, options, help, version }
}

/**
 * Read the spec from a file or standard input.
 * @param {string | null} file - path, `-` for stdin, or null for stdin.
 * @returns {Promise<unknown>} parsed spec.
 */
async function readSpec(file) {
  const fromStdin = file === null || file === '-'
  const text = fromStdin
    ? await new Promise((accept, reject) => {
        let buffer = ''
        process.stdin.setEncoding('utf8')
        process.stdin.on('data', (chunk) => { buffer += chunk })
        process.stdin.on('end', () => accept(buffer))
        process.stdin.on('error', reject)
      })
    : await readFile(file, 'utf8')
  if (text.trim() === '') throw new Error(fromStdin ? 'No spec on stdin.' : `${file} is empty.`)
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`The spec is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Merge CLI overrides over the spec.
 * @param {unknown} spec - parsed spec.
 * @param {Record<string, unknown>} options - CLI options.
 * @returns {Record<string, unknown>} effective spec.
 */
function merge(spec, options) {
  const merged = { ...(spec ?? {}) }
  if (options.outDir !== undefined) merged.outDir = options.outDir
  if (options.theme !== undefined) merged.theme = options.theme
  if (options.locale !== undefined) merged.locale = options.locale
  if (options.slug !== undefined) merged.slug = options.slug
  if (options.formats !== undefined) merged.formats = options.formats
  return merged
}

/**
 * Run the CLI.
 * @returns {Promise<number>} exit code.
 */
async function main() {
  const argv = process.argv.slice(2)
  const { file, options, help, version } = parseArgs(argv)
  if (help) {
    process.stdout.write(HELP)
    return 0
  }
  if (version) {
    process.stdout.write(`${VERSION}\n`)
    return 0
  }
  const spec = merge(await readSpec(file), options)
  if (options.stdout === true) {
    const composed = composeMap(spec)
    process.stdout.write(composed.svg)
    return 0
  }
  if (options.json === true) {
    const composed = composeMap(spec)
    const { model, geo } = composed
    const payload = {
      title: model.title,
      subtitle: model.subtitle,
      locale: model.locale,
      width: geo.width,
      height: geo.height,
      headerHeight: geo.headerHeight,
      legendY: geo.legendY,
      columns: geo.columns,
      nodes: geo.nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        x: node.x,
        y: node.y,
        w: node.w,
        h: node.h,
        labelLines: node.labelLines,
        detailLines: node.detailLines,
        status: node.status,
      })),
      edges: geo.edges,
      crossLinks: geo.crossLinks,
      stats: composed.stats,
    }
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
    return 0
  }
  const written = await writeMap(spec, { base: process.cwd(), version: VERSION })
  if (options.quiet !== true) {
    const kinds = Object.entries(written.stats.kinds).map(([kind, count]) => `${kind}:${count}`).join(' ')
    process.stdout.write(`${written.model.title}\n${written.stats.nodes} nodes · ${written.stats.depth} levels · ${written.stats.links} links · ${kinds}\n`)
    process.stdout.write(`output ${resolveOutDir(process.cwd(), written.model.outDir)}\n`)
  }
  for (const artifact of written.files) process.stdout.write(`${artifact.format}\t${artifact.path}\t${artifact.bytes}\n`)
  return 0
}

main().then(
  (code) => { process.exitCode = code },
  (error) => {
    process.stderr.write(`dsh-context-map: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  },
)
