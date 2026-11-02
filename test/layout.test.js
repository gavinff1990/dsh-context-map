import assert from 'node:assert/strict'
import { test } from 'node:test'
import { layout, readingOrder, statusCounts } from '../lib/layout.js'
import { normalizeSpec } from '../lib/spec.js'

/** A small three-level tree with siblings of different text lengths. */
const spec = {
  title: 'Layout fixture',
  nodes: [
    { id: 'root', label: 'Root', kind: 'goal' },
    { id: 'a', label: 'Alpha', kind: 'context', parent: 'root', detail: 'short' },
    { id: 'b', label: 'Beta with a considerably longer label that wraps', kind: 'action', parent: 'root' },
    { id: 'a1', label: 'A one', kind: 'artifact', parent: 'a' },
    { id: 'a2', label: 'A two', kind: 'artifact', parent: 'a' },
    { id: 'b1', label: 'B one', kind: 'risk', parent: 'b' },
  ],
}

const composed = () => {
  const model = normalizeSpec(spec, { now: new Date('2026-01-01T00:00:00Z') })
  return { model, geo: layout(model) }
}

test('every node gets a positive box inside the canvas', () => {
  const { model, geo } = composed()
  for (const node of model.nodes) {
    assert.ok(node.w > 0, `${node.id} width`)
    assert.ok(node.h > 0, `${node.id} height`)
    assert.ok(node.x >= 0 && node.y >= 0, `${node.id} origin`)
    assert.ok(node.x + node.w <= geo.width + 0.01, `${node.id} fits horizontally`)
    assert.ok(node.y + node.h <= geo.height + 0.01, `${node.id} fits vertically`)
    assert.ok(geo.contentTop <= node.y, `${node.id} starts below the header`)
  }
})

test('columns advance strictly with depth', () => {
  const { model, geo } = composed()
  assert.equal(geo.columns.length, 3)
  for (let depth = 1; depth < geo.columnX.length; depth += 1) {
    assert.ok(geo.columnX[depth] > geo.columnX[depth - 1], `column ${depth} is to the right`)
  }
  for (const node of model.nodes) assert.equal(node.x, geo.columnX[node.depth])
})

test('siblings inside one parent never overlap', () => {
  const { model } = composed()
  for (const node of model.nodes) {
    if (node.children.length < 2) continue
    const children = [...node.children].sort((left, right) => left.y - right.y)
    for (let index = 1; index < children.length; index += 1) {
      const previous = children[index - 1]
      const current = children[index]
      assert.ok(previous.y + previous.h <= current.y + 0.01, `${node.id}: ${previous.id} overlaps ${current.id}`)
    }
  }
})

test('a parent is centered on the subtree band of its children', () => {
  const { model } = composed()
  for (const node of model.nodes) {
    if (node.children.length === 0) continue
    const first = node.children[0]
    const last = node.children[node.children.length - 1]
    const mid = (first.subTop + last.subTop + last.subtree) / 2
    const parentCenter = node.y + node.h / 2
    assert.ok(Math.abs(parentCenter - mid) <= 1.5, `${node.id} center ${parentCenter} vs children band ${mid}`)
    assert.ok(parentCenter > Math.min(...node.children.map((child) => child.y)) - 1)
    assert.ok(parentCenter < Math.max(...node.children.map((child) => child.y + child.h)) + 1)
  }
})

test('layout is deterministic', () => {
  const first = composed().geo
  const second = composed().geo
  assert.deepEqual(
    first.nodes.map((node) => [node.id, node.x, node.y, node.w, node.h]),
    second.nodes.map((node) => [node.id, node.x, node.y, node.w, node.h]),
  )
})

test('reading order is depth first from the root', () => {
  const { model } = composed()
  assert.deepEqual(readingOrder(model).map((node) => node.id), ['root', 'a', 'a1', 'a2', 'b', 'b1'])
})

test('status counts skip unmarked nodes', () => {
  const model = normalizeSpec(
    {
      title: 's',
      nodes: [
        { label: 'root', kind: 'goal', status: 'done' },
        { label: 'kid', parent: 'n1', status: 'active' },
        { label: 'other', parent: 'n1' },
      ],
    },
    { now: new Date('2026-01-01T00:00:00Z') },
  )
  assert.deepEqual(statusCounts(model), { done: 1, active: 1 })
})

test('a long label wraps into multiple lines and grows the card', () => {
  const short = normalizeSpec({ title: 's', nodes: [{ label: 'short' }] })
  const long = normalizeSpec({ title: 's', nodes: [{ label: 'a '.repeat(60) }] })
  const shortGeo = layout(short)
  const longGeo = layout(long)
  assert.ok(long.nodes[0].labelLines.length > 1)
  assert.ok(longGeo.nodes[0].h > shortGeo.nodes[0].h)
})
