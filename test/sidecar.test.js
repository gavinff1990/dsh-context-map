import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { diffModels, diffSummary } from '../lib/diff.js'
import { assertSidecar, serializeSidecar, SidecarError } from '../lib/sidecar.js'
import { composeMap, writeMap } from '../lib/build.js'
import { normalizeSpec } from '../lib/spec.js'
import { readSidecar } from '../lib/files.js'

const here = fileURLToPath(new URL('.', import.meta.url))
const NOW = new Date('2026-05-06T07:08:09Z')

/** @param {object[]} nodes - nodes with one explicit root. */
const spec = (nodes) => ({ title: 'Rev', nodes })
const model = (nodes) => normalizeSpec(spec(nodes), { now: NOW })

/** Sidecar shape the diff consumes. */
const previousOf = (nodes) => ({ schemaVersion: 1, revision: 1, nodes })

/** A root plus the given children, all parented, so no synthetic root appears. */
const tree = (children, rootId = 'root') => [{ id: rootId, label: 'Root', kind: 'goal' }, ...children]

test('diff finds added, removed and changed nodes', () => {
  const previous = previousOf([
    { id: 'a', label: 'Alpha', kind: 'goal', detail: '', parent: null, status: 'unknown' },
    { id: 'b', label: 'Beta', kind: 'context', detail: '', parent: 'a', status: 'unknown' },
    { id: 'c', label: 'Gamma', kind: 'risk', detail: '', parent: 'a', status: 'unknown' },
  ])
  const next = model([
    { id: 'a', label: 'Alpha', kind: 'goal' },
    { id: 'b', label: 'Beta renamed', kind: 'context', parent: 'a' },
    { id: 'd', label: 'Delta', kind: 'action', parent: 'a' },
  ])
  const diff = diffModels(previous, next)
  assert.equal(diff.unchanged, 1)
  assert.deepEqual(diff.added.map((node) => node.id), ['d'])
  assert.deepEqual(diff.removed.map((node) => node.id), ['c'])
  assert.deepEqual(diff.changed, [{ id: 'b', label: 'Beta renamed', fields: ['label'] }])
  assert.equal(diffSummary(diff, 'zh'), '新增 1 · 修改 1 · 删除 1')
  assert.equal(diffSummary(diff, 'en'), 'added 1 · changed 1 · removed 1')
})

test('a renamed node matches by id, not by label', () => {
  const previous = previousOf([{ id: 'a', label: 'Old', kind: 'goal', detail: '', parent: null, status: 'unknown' }])
  const diff = diffModels(previous, model([{ id: 'a', label: 'New' }]))
  assert.equal(diff.added.length, 0)
  assert.equal(diff.removed.length, 0)
  assert.deepEqual(diff.changed[0].fields, ['label', 'kind'])
})

test('a node that only gained an id matches by label', () => {
  const previous = previousOf([{ id: 'n1', label: 'Same', kind: 'context', detail: '', parent: null, status: 'unknown' }])
  const diff = diffModels(previous, model([{ label: 'Same' }]))
  assert.equal(diff.added.length, 0)
  assert.equal(diff.removed.length, 0)
})

test('one old node is never claimed twice', () => {
  const previous = previousOf([
    { id: 'root', label: 'Root', kind: 'goal', detail: '', parent: null, status: 'unknown' },
    { id: 'twin', label: 'Twin', kind: 'context', detail: '', parent: 'root', status: 'unknown' },
  ])
  const diff = diffModels(previous, model([
    { id: 'root', label: 'Root', kind: 'goal' },
    { label: 'Twin', kind: 'goal', parent: 'root' },
    { label: 'Twin', kind: 'risk', parent: 'root' },
  ]))
  assert.equal(diff.removed.length, 0)
  assert.equal(diff.added.length, 1)
  assert.equal(diff.changed.length, 1)
  assert.equal(diff.unchanged, 1)
})

test('the first revision has no diff and no history', () => {
  const composed = composeMap(spec([{ id: 'a', label: 'Alpha' }]), { now: NOW, version: '9.9.9' })
  assert.equal(composed.diff, null)
  assert.equal(composed.sidecar.revision, 1)
  assert.deepEqual(composed.sidecar.history, [])
  assert.equal(composed.artifacts.at(-1).format, 'json')
})

test('a later revision increments, records history and marks nodes', () => {
  const first = composeMap(
    spec(tree([{ id: 'b', label: 'Beta', parent: 'root' }])),
    { now: NOW, version: '9.9.9' },
  )
  const second = composeMap(
    spec(tree([{ id: 'b', label: 'Beta', parent: 'root' }, { id: 'c', label: 'Gamma', parent: 'root' }])),
    { now: NOW, version: '9.9.9', previous: first.sidecar },
  )
  assert.equal(second.sidecar.revision, 2)
  assert.deepEqual(second.sidecar.history.at(-1), {
    revision: 2,
    at: NOW.toISOString(),
    added: 1,
    changed: 0,
    removed: 0,
    unchanged: 2,
  })
  const svg = second.artifacts.find((artifact) => artifact.format === 'svg').content
  assert.match(svg, /cm-node cm-n-context cm-node-new/u)
  assert.match(svg, /新增 1/u)
})

test('the markdown artifact lists the change set', () => {
  const first = composeMap(spec(tree([{ id: 'b', label: 'Beta', parent: 'root' }])), { now: NOW })
  const second = composeMap(spec(tree([{ id: 'c', label: 'Gamma', parent: 'root' }])), { now: NOW, previous: first.sidecar })
  const md = second.artifacts.find((artifact) => artifact.format === 'md').content
  assert.match(md, /## 变更/u)
  assert.match(md, /\*\*\+\*\* Gamma/u)
  assert.match(md, /\*\*−\*\* Beta/u)
})

test('the sidecar keeps the outline and drops the synthetic root', () => {
  const composed = composeMap({ title: 'R', nodes: [{ label: 'one' }, { label: 'two' }] }, { now: NOW })
  assert.equal(composed.sidecar.nodes.length, 2)
  assert.ok(composed.sidecar.nodes.every((node) => node.id !== '__root__'))
  assert.equal(composed.sidecar.title, 'R')
  assert.equal(composed.model.nodes.length, 3)
})

test('serialize round-trips through assertSidecar', () => {
  const composed = composeMap(spec([{ id: 'a', label: 'Alpha' }]), { now: NOW })
  const parsed = JSON.parse(serializeSidecar(composed.sidecar))
  assert.doesNotThrow(() => assertSidecar(parsed))
})

test('assertSidecar rejects the wrong shape, version and nodes', () => {
  assert.throws(() => assertSidecar(null), (error) => error instanceof SidecarError && error.code === 'E_SIDECAR_SHAPE')
  assert.throws(() => assertSidecar({ schemaVersion: 2, nodes: [] }), /schemaVersion/u)
  assert.throws(() => assertSidecar({ schemaVersion: 1, nodes: [] }), /no nodes array/u)
  assert.throws(() => assertSidecar({ schemaVersion: 1, nodes: [{ id: 'a' }] }), /string id and label/u)
})

test('readSidecar reports missing, invalid and wrong-version files', async () => {
  const directory = await mkdtemp(join(here, '.tmp-'))
  try {
    await assert.rejects(() => readSidecar('nope.json', directory), (error) => error.code === 'E_SIDECAR_MISSING')

    const broken = join(directory, 'broken.json')
    await writeFile(broken, '{ not json', 'utf8')
    await assert.rejects(() => readSidecar(broken, directory), (error) => error.code === 'E_SIDECAR_JSON')

    const wrong = join(directory, 'wrong.json')
    await writeFile(wrong, JSON.stringify({ schemaVersion: 9, nodes: [{ id: 'a', label: 'a' }] }), 'utf8')
    await assert.rejects(() => readSidecar(wrong, directory), (error) => error.code === 'E_SIDECAR_VERSION')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('writeMap reads the previous sidecar and writes revision two', async () => {
  const directory = await mkdtemp(join(here, '.tmp-'))
  try {
    const first = await writeMap(
      {
        title: 'Rev',
        nodes: [{ id: 'a', label: 'Alpha', kind: 'goal' }, { id: 'b', label: 'Beta', parent: 'a' }],
        outDir: directory,
      },
      { base: here, version: '9.9.9', now: NOW },
    )
    const sidecarPath = first.files.find((file) => file.format === 'json').path

    const second = await writeMap(
      {
        title: 'Rev',
        update: sidecarPath,
        nodes: [{ id: 'a', label: 'Alpha', kind: 'goal' }, { id: 'c', label: 'Gamma', parent: 'a' }],
        outDir: directory,
      },
      { base: here, version: '9.9.9', now: NOW },
    )
    assert.equal(second.stats.revision, 2)
    assert.equal(second.stats.added, 1)
    assert.equal(second.stats.removed, 1)
    assert.equal(second.previousPath, sidecarPath)
    assert.equal(second.files.length, 4, 'svg, html, md and the json sidecar')

    const written = JSON.parse(await readFile(sidecarPath, 'utf8'))
    assert.equal(written.revision, 2, 'the sidecar on disk is the new revision')
    assert.deepEqual(written.nodes.map((node) => node.id), ['a', 'c'])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('an update path that does not exist fails loudly', async () => {
  const directory = await mkdtemp(join(here, '.tmp-'))
  try {
    await assert.rejects(
      () => writeMap({ title: 'Rev', update: join(directory, 'missing.json'), nodes: [{ label: 'a' }], outDir: directory }, { base: here }),
      /No update file/u,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
