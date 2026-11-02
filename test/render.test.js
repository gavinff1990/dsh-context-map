import assert from 'node:assert/strict'
import { test } from 'node:test'
import { composeMap } from '../lib/build.js'
import { normalizeSpec } from '../lib/spec.js'
import { layout } from '../lib/layout.js'
import { renderHtml } from '../lib/html.js'
import { renderMarkdown } from '../lib/markdown.js'
import { renderSvg } from '../lib/svg.js'

const NOW = new Date('2026-02-03T04:05:06Z')

const hostile = {
  title: 'Map <with> & "quotes"',
  subtitle: 'A <script>alert(1)</script> subtitle',
  nodes: [
    { id: 'root', label: 'Goal <script>alert("x")</script>', kind: 'goal' },
    { id: 'kid', label: 'Child & "quoted"', detail: 'detail <b>bold</b>', kind: 'risk', parent: 'root', status: 'blocked' },
  ],
  links: [{ from: 'kid', to: 'root', label: 'blocks' }],
}

/** @returns {{model: object, geo: object, svg: string}} */
function fixture(spec = hostile) {
  const model = normalizeSpec(spec, { now: NOW })
  const geo = layout(model)
  return { model, geo, svg: renderSvg(model, geo, { theme: 'light', version: '9.9.9' }) }
}

test('svg is a standalone document with accessible titles', () => {
  const { svg } = fixture()
  assert.match(svg, /^<svg class="cm-svg"/u)
  assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/u)
  assert.match(svg, /role="img"/u)
  assert.match(svg, /<title id="cm-title">/u)
  assert.match(svg, /<desc id="cm-desc">/u)
  assert.match(svg, /v9\.9\.9/u)
})

test('svg escapes hostile labels instead of injecting markup', () => {
  const { svg } = fixture()
  assert.ok(!svg.includes('<script>alert'), 'no raw script tag')
  assert.ok(!svg.includes('<b>bold</b>'), 'no raw html in detail')
  assert.match(svg, /&lt;script&gt;/u)
  assert.match(svg, /&amp;/u)
  assert.match(svg, /&quot;/u)
})

test('both themes ship in one svg and auto follows the system', () => {
  const { svg } = fixture()
  assert.match(svg, /\.cm-svg\[data-theme="dark"\]/u)
  assert.match(svg, /prefers-color-scheme: dark/u)
  assert.match(svg, /--bg:#0b1220/u)
  assert.match(svg, /--bg:#f8fafc/u)
})

test('every node kind has a colour rule', () => {
  const { svg } = fixture()
  for (const kind of ['goal', 'context', 'decision', 'action', 'artifact', 'risk', 'question', 'note']) {
    assert.ok(svg.includes(`.cm-n-${kind}{--kind:`), `${kind} rule`)
  }
})

test('edges connect every parent to its children', () => {
  const { model, geo } = fixture()
  const pairs = model.nodes.flatMap((node) => node.children.map((child) => `${node.id}->${child.id}`))
  assert.deepEqual(geo.edges.map((edge) => `${edge.from}->${edge.to}`), pairs)
  assert.equal(geo.crossLinks.length, 1)
})

test('html embeds the same svg and wires the toolbar', () => {
  const { model, geo, svg } = fixture()
  const html = renderHtml(model, geo, svg, { theme: 'auto', version: '9.9.9' })
  assert.match(html, /^<!DOCTYPE html>/u)
  assert.ok(html.includes(svg.slice(0, 200)), 'svg is inlined, not referenced')
  for (const id of ['q', 'zoom-in', 'zoom-out', 'zoom-reset', 'fit', 'theme', 'print']) {
    assert.ok(html.includes(`id="${id}"`), `control ${id}`)
  }
  assert.match(html, /prefers-color-scheme:dark/u)
  assert.match(html, /@media print/u)
  assert.ok(html.includes('button.jump'), 'outline rail is interactive')
})

test('html keeps hostile text escaped in attributes too', () => {
  const { model, geo, svg } = fixture()
  const html = renderHtml(model, geo, svg, {})
  assert.ok(!html.includes('data-search="Goal <script>'), 'attribute payload escaped')
  assert.ok(html.includes('&lt;script&gt;'), 'escaped copy present')
})

test('markdown carries mermaid, outline, inventory and files', () => {
  const { model, geo } = fixture()
  const md = renderMarkdown(model, geo, { version: '9.9.9', files: [{ format: 'svg', path: 'map.svg' }] })
  assert.match(md, /^# Map/u)
  assert.match(md, /```mermaid\nflowchart LR/u)
  assert.match(md, /classDef goal/u)
  assert.match(md, /## 结构/u)
  assert.match(md, /## 节点清单/u)
  assert.match(md, /map\.svg/u)
  assert.ok(!md.includes('<script>'), 'no raw html')
})

test('composeMap produces all three artifacts with stable names', () => {
  const composed = composeMap(
    { title: 'Context Map v2', nodes: [{ label: 'root', kind: 'goal' }] },
    { now: NOW, version: '9.9.9' },
  )
  assert.deepEqual(composed.artifacts.map((artifact) => artifact.filename), ['context-map-v2.svg', 'context-map-v2.html', 'context-map-v2.md'])
  assert.deepEqual(composed.artifacts.map((artifact) => artifact.format), ['svg', 'html', 'md'])
  assert.equal(composed.stats.nodes, 1)
  assert.ok(composed.stats.width >= 700)
})

test('formats can be narrowed', () => {
  const composed = composeMap({ title: 'only md', nodes: [{ label: 'root' }], formats: ['md'] }, { now: NOW })
  assert.deepEqual(composed.artifacts.map((artifact) => artifact.format), ['md'])
})

test('deterministic output for a fixed clock', () => {
  const first = composeMap(hostile, { now: NOW, version: '9.9.9' })
  const second = composeMap(hostile, { now: NOW, version: '9.9.9' })
  assert.equal(first.artifacts[0].content, second.artifacts[0].content)
  assert.equal(first.artifacts[2].content, second.artifacts[2].content)
})

test('english locale swaps UI copy without touching labels', () => {
  const model = normalizeSpec({ title: 'Sub', nodes: [{ label: 'root', kind: 'goal' }], locale: 'en' }, { now: NOW })
  const geo = layout(model)
  const svg = renderSvg(model, geo, { theme: 'light' })
  assert.match(svg, /LEGEND/u)
  assert.match(svg, /Generated from the conversation outline/u)
  assert.ok(svg.includes('>GOAL<'), 'kind pill localized')
})
