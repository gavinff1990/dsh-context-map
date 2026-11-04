import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  LIMITS,
  SessionStore,
  extractCommand,
  extractPaths,
  sessionKey,
} from '../lib/session-facts.js'
import { createSessionFactsTool } from '../lib/facts-tool.js'

/** @param {object} [overrides] - agent identity overrides. */
const exec = (overrides = {}) => ({ name: 'write_file', arguments: {}, agent: { session: { id: 's1' } }, ...overrides })

/** @param {object} [overrides] - result overrides. */
const ok = (overrides = {}) => ({ isError: false, content: [{ type: 'text', text: 'ok' }], ...overrides })

test('session key prefers the session id, then the agent id, then unknown', () => {
  assert.equal(sessionKey({ agent: { session: { id: 'abc' } } }), 'abc')
  assert.equal(sessionKey({ agent: { id: 'agent-1' } }), 'agent-1')
  assert.equal(sessionKey({}), 'unknown')
  assert.equal(sessionKey(undefined), 'unknown')
})

test('paths come from known keys, arrays and path-shaped strings', () => {
  const paths = extractPaths({
    path: 'src/a.ts',
    files: ['docs/b.md', { file_path: 'lib/c.js' }],
    note: 'not a path',
    command: 'echo /tmp/x',
  })
  assert.ok(paths.includes('src/a.ts'))
  assert.ok(paths.includes('docs/b.md'))
  assert.ok(paths.includes('lib/c.js'))
  assert.ok(!paths.includes('not a path'))
})

test('path extraction rejects newlines and oversized strings', () => {
  const paths = extractPaths({ path: 'a\nb', other: 'x'.repeat(500) + '/y' })
  assert.deepEqual(paths, [])
})

test('commands are read from command, cmd or script', () => {
  assert.equal(extractCommand({ command: 'npm test' }), 'npm test')
  assert.equal(extractCommand({ cmd: 'git status' }), 'git status')
  assert.equal(extractCommand({ script: 'node  x.mjs' }), 'node x.mjs')
  assert.equal(extractCommand({ nope: 'x' }), '')
  assert.equal(extractCommand(null), '')
})

test('writes and reads are counted separately, per path', () => {
  const store = new SessionStore({ now: () => 1000 })
  store.record(exec({ name: 'write_file', arguments: { path: 'src/a.ts' } }), ok())
  store.record(exec({ name: 'edit_file', arguments: { file_path: 'src/a.ts' } }), ok())
  store.record(exec({ name: 'read_file', arguments: { path: 'src/a.ts' } }), ok())
  store.record(exec({ name: 'read_file', arguments: { path: 'docs/b.md' } }), ok())

  const digest = store.digestFor(exec())
  assert.equal(digest.files.writtenTotal, 1)
  assert.equal(digest.files.written[0].path, 'src/a.ts')
  assert.equal(digest.files.written[0].writes, 2)
  assert.equal(digest.files.readTotal, 1, 'a path that was written is reported under written only')
  assert.equal(digest.files.written[0].reads, 1)
  assert.equal(digest.totals.calls, 4)
})

test('command tools record the command line and its outcome', () => {
  const store = new SessionStore()
  store.record(exec({ name: 'pwsh', arguments: { command: 'npm test' } }), ok())
  store.record(exec({ name: 'pwsh', arguments: { command: 'npm run build' } }), ok({ isError: true, content: [{ type: 'text', text: 'build failed' }] }))

  const digest = store.digestFor(exec())
  assert.equal(digest.commandTotal, 2)
  assert.equal(digest.commands[0].cmd, 'npm test')
  assert.equal(digest.commands[0].ok, true)
  assert.equal(digest.commands[1].ok, false)
  assert.equal(digest.totals.errors, 1)
  assert.equal(digest.errors[0].message, 'build failed')
})

test('the plugin never records its own tool calls', () => {
  const store = new SessionStore()
  store.record(exec({ name: 'context_map', arguments: { nodes: [{ path: 'x/y.ts' }] } }), ok())
  store.record(exec({ name: 'session_facts', arguments: {} }), ok())
  assert.equal(store.digestFor(exec()).totals.calls, 0)
})

test('sessions are isolated and unknown sessions read empty', () => {
  const store = new SessionStore()
  store.record(exec({ agent: { session: { id: 'a' } }, name: 'write_file', arguments: { path: 'a.ts' } }), ok())
  store.record(exec({ agent: { session: { id: 'b' } }, name: 'write_file', arguments: { path: 'b.ts' } }), ok())

  assert.equal(store.digestFor({ agent: { session: { id: 'a' } } }).files.written[0].path, 'a.ts')
  assert.equal(store.digestFor({ agent: { session: { id: 'b' } } }).files.written[0].path, 'b.ts')
  assert.equal(store.digestFor({ agent: { session: { id: 'c' } } }).totals.calls, 0)
})

test('the store keeps a bounded number of sessions', () => {
  const store = new SessionStore({ sessions: 2 })
  store.record(exec({ agent: { session: { id: 'one' } }, arguments: { path: '1.ts' } }), ok())
  store.record(exec({ agent: { session: { id: 'two' } }, arguments: { path: '2.ts' } }), ok())
  store.record(exec({ agent: { session: { id: 'three' } }, arguments: { path: '3.ts' } }), ok())
  assert.equal(store.digestFor({ agent: { session: { id: 'one' } } }).totals.calls, 0, 'oldest session evicted')
  assert.equal(store.digestFor({ agent: { session: { id: 'three' } } }).totals.calls, 1)
})

test('commands and errors are capped', () => {
  const store = new SessionStore()
  for (let index = 0; index < LIMITS.commands + 10; index += 1) {
    store.record(exec({ name: 'pwsh', arguments: { command: `echo ${index}` } }), ok())
  }
  for (let index = 0; index < LIMITS.errors + 5; index += 1) {
    store.record(exec({ name: 'pwsh', arguments: { command: `fail ${index}` } }), ok({ isError: true }))
  }
  const digest = store.digestFor(exec(), { limit: 100 })
  assert.equal(digest.commandTotal, LIMITS.commands)
  assert.equal(digest.errors.length, LIMITS.errors)
  assert.equal(digest.commands.at(-1).cmd, `fail ${LIMITS.errors + 4}`)
})

test('scope and limit narrow the digest', () => {
  const store = new SessionStore()
  for (let index = 0; index < 5; index += 1) {
    store.record(exec({ name: 'write_file', arguments: { path: `f${index}.ts` } }), ok())
  }
  const filesOnly = store.digestFor(exec(), { scope: 'files', limit: 2 })
  assert.equal(filesOnly.files.written.length, 2)
  assert.equal(filesOnly.files.writtenTotal, 5)
  assert.deepEqual(filesOnly.commands, [])

  const toolsOnly = store.digestFor(exec(), { scope: 'tools' })
  assert.equal(toolsOnly.tools[0].name, 'write_file')
  assert.equal(toolsOnly.tools[0].count, 5)
  assert.deepEqual(toolsOnly.files.written, [])
})

test('written paths sort by activity, then name', () => {
  const store = new SessionStore()
  store.record(exec({ name: 'write_file', arguments: { path: 'b.ts' } }), ok())
  store.record(exec({ name: 'write_file', arguments: { path: 'a.ts' } }), ok())
  store.record(exec({ name: 'write_file', arguments: { path: 'b.ts' } }), ok())
  const written = store.digestFor(exec()).files.written
  assert.deepEqual(written.map((file) => file.path), ['b.ts', 'a.ts'])
})

test('clear drops one session', () => {
  const store = new SessionStore()
  store.record(exec({ arguments: { path: 'a.ts' } }), ok())
  assert.equal(store.clear('s1'), true)
  assert.equal(store.digestFor(exec()).totals.calls, 0)
  assert.equal(store.clear('s1'), false)
})

test('the facts tool returns a digest and can clear afterwards', async () => {
  const store = new SessionStore()
  store.record(exec({ name: 'write_file', arguments: { path: 'src/a.ts' } }), ok())
  const tool = createSessionFactsTool({ store })

  const value = await tool.execute({}, exec())
  assert.equal(value.totals.calls, 1)
  assert.equal(value.files.written[0].path, 'src/a.ts')
  const rendered = tool.output.render(null, value)
  assert.match(rendered[0].text, /1 tool calls/u)
  assert.match(rendered[0].text, /src\/a\.ts/u)

  const cleared = await tool.execute({ clear: true }, exec())
  assert.equal(cleared.cleared, true)
  assert.equal((await tool.execute({}, exec())).totals.calls, 0)
})

test('the facts tool tolerates junk arguments', async () => {
  const store = new SessionStore()
  const tool = createSessionFactsTool({ store })
  const value = await tool.execute({ scope: 'nope', limit: 'many' }, exec())
  assert.equal(value.scope, 'all')
  assert.equal(value.totals.calls, 0)
  assert.match(tool.output.render(null, value)[0].text, /No tool calls recorded/u)
})
