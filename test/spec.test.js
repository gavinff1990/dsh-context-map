import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LIMITS, SpecError, normalizeSpec, slugify } from '../lib/spec.js'

const base = {
  title: 'T',
  nodes: [
    { id: 'a', label: 'root', kind: 'goal' },
    { id: 'b', label: 'child', kind: 'action', parent: 'a' },
  ],
}

test('normalizes defaults and keeps ids', () => {
  const model = normalizeSpec(base, { now: new Date('2026-01-02T03:04:05Z') })
  assert.equal(model.title, 'T')
  assert.equal(model.locale, 'zh')
  assert.equal(model.theme, 'auto')
  assert.deepEqual(model.formats, ['svg', 'html', 'md'])
  assert.equal(model.outDir, '.dsh-context-map')
  assert.equal(model.roots.length, 1)
  assert.equal(model.roots[0].id, 'a')
  assert.equal(model.byId.get('b').depth, 1)
  assert.equal(model.byId.get('a').children.length, 1)
  assert.equal(model.meta.generatedAt, '2026-01-02T03:04:05.000Z')
})

test('assigns ids when omitted, defaults kind, and wraps several roots', () => {
  const model = normalizeSpec({ title: 'x', nodes: [{ label: 'one' }, { label: 'two' }] })
  assert.equal(model.nodes[0].id, '__root__')
  assert.deepEqual(model.nodes.slice(1).map((node) => node.id), ['n1', 'n2'])
  assert.equal(model.nodes[1].kind, 'context')
  assert.equal(model.roots.length, 1)
  assert.equal(model.roots[0].synthetic, true, 'two roots get a synthetic parent')
})

test('slugify keeps a repo-safe id', () => {
  assert.equal(slugify('把 DSH 插件做成三渠道产品'), 'dsh')
  assert.equal(slugify('Context Map v2'), 'context-map-v2')
  assert.equal(slugify('///'), 'context-map')
  assert.match(slugify('Hello World!'), /^[a-z0-9]+(-[a-z0-9]+)*$/u)
})

test('rejects an empty label with an actionable message', () => {
  assert.throws(() => normalizeSpec({ title: 'x', nodes: [{ label: '   ' }] }), (error) => {
    assert.ok(error instanceof SpecError)
    assert.equal(error.code, 'E_SPEC_LABEL')
    assert.match(error.message, /nodes\[0\]/u)
    return true
  })
})

test('rejects an unknown kind and lists the valid ones', () => {
  assert.throws(() => normalizeSpec({ title: 'x', nodes: [{ label: 'a', kind: 'idea' }] }), (error) => {
    assert.equal(error.code, 'E_SPEC_KIND')
    assert.match(error.message, /goal, context, decision/u)
    return true
  })
})

test('rejects a dangling parent', () => {
  assert.throws(() => normalizeSpec({ title: 'x', nodes: [{ label: 'a', parent: 'ghost' }] }), /not a node id/u)
})

test('rejects a parent cycle', () => {
  const nodes = [
    { id: 'a', label: 'a', parent: 'b' },
    { id: 'b', label: 'b', parent: 'a' },
  ]
  assert.throws(() => normalizeSpec({ title: 'x', nodes }), (error) => {
    assert.equal(error.code, 'E_SPEC_CYCLE')
    return true
  })
})

test('rejects duplicate ids', () => {
  assert.throws(() => normalizeSpec({ title: 'x', nodes: [{ id: 'a', label: '1' }, { id: 'a', label: '2' }] }), /Duplicate node id/u)
})

test('rejects a node count over the cap', () => {
  const nodes = Array.from({ length: LIMITS.nodes + 1 }, (_, index) => ({ label: `n${index}` }))
  assert.throws(() => normalizeSpec({ title: 'x', nodes }), (error) => {
    assert.equal(error.code, 'E_SPEC_SIZE')
    return true
  })
})

test('deduplicates links and keeps their labels', () => {
  const model = normalizeSpec({
    ...base,
    links: [
      { from: 'a', to: 'b', label: 'blocks' },
      { from: 'a', to: 'b', label: 'blocks' },
      { from: 'b', to: 'a' },
    ],
  })
  assert.equal(model.links.length, 2)
  assert.equal(model.links[0].label, 'blocks')
})

test('rejects a link to a missing node', () => {
  assert.throws(() => normalizeSpec({ ...base, links: [{ from: 'a', to: 'zzz' }] }), /not a node id/u)
})

test('formats are restricted and ordered', () => {
  const model = normalizeSpec({ ...base, formats: ['md', 'svg'] })
  assert.deepEqual(model.formats, ['svg', 'md'])
  assert.throws(() => normalizeSpec({ ...base, formats: ['pdf'] }), /selected nothing/u)
})

test('caps title and label length', () => {
  const model = normalizeSpec({ title: 'x'.repeat(400), nodes: [{ label: 'y'.repeat(400) }] })
  assert.ok(model.title.endsWith('\u2026'))
  assert.ok(model.nodes[0].label.length <= LIMITS.label)
})

test('a single explicit root is not wrapped', () => {
  const model = normalizeSpec({ title: 'x', nodes: [{ id: 'root', label: 'r' }, { id: 'kid', label: 'k', parent: 'root' }] })
  assert.equal(model.roots.length, 1)
  assert.equal(model.roots[0].id, 'root')
  assert.equal(model.nodes.length, 2)
})
