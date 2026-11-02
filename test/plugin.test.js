import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { apply } from '../lib/index.js'
import { TOOL_NAME } from '../lib/tool.js'
import { parse } from 'node:path'
import { resolveOutDir, OutputPathError } from '../lib/files.js'

const here = fileURLToPath(new URL('.', import.meta.url))

/**
 * Capture the registration made by `apply`.
 * @returns {{def: object, disposers: number}}
 */
function register() {
  /** @type {any} */
  const captured = { def: null, disposers: 0 }
  const ctx = {
    tools: {
      register(definition) {
        captured.def = definition
        return () => { captured.disposers += 1 }
      },
    },
  }
  apply(ctx)
  return captured
}

test('the plugin declares its injection and registers exactly one tool', () => {
  const { def } = register()
  assert.equal(TOOL_NAME, 'context_map')
  assert.ok(def !== null, 'registered a definition')
  assert.equal(def.name, 'context_map')
  assert.equal(def.parameters.type, 'object')
  assert.deepEqual(def.parameters.required, ['title', 'nodes'])
  assert.equal(def.output.schema.type, 'object')
  assert.equal(typeof def.output.render, 'function')
  assert.equal(typeof def.execute, 'function')
  assert.ok(def.description.length > 200, 'description teaches the model the kinds')
})

test('the schema exposes every parameter the implementation reads', () => {
  const { def } = register()
  const properties = Object.keys(def.parameters.properties)
  assert.deepEqual(properties, ['title', 'subtitle', 'nodes', 'links', 'outDir', 'slug', 'formats', 'theme', 'locale'])
  const nodeProperties = Object.keys(def.parameters.properties.nodes.items.properties)
  assert.deepEqual(nodeProperties, ['id', 'label', 'kind', 'detail', 'parent', 'status'])
})

test('execute writes the three artifacts and returns their paths', async () => {
  const directory = await mkdtemp(join(here, '.tmp-'))
  try {
    const { def } = register()
    const value = await def.execute(
      {
        title: 'Runtime fixture',
        outDir: directory,
        nodes: [
          { id: 'root', label: 'Goal', kind: 'goal' },
          { id: 'a', label: 'Step', kind: 'action', parent: 'root' },
          { id: 'b', label: 'Risk', kind: 'risk', parent: 'root' },
        ],
        links: [{ from: 'b', to: 'a', label: 'blocks' }],
      },
      { signal: new AbortController().signal },
    )
    assert.equal(value.title, 'Runtime fixture')
    assert.equal(value.files.length, 3)
    assert.deepEqual(value.files.map((file) => file.format), ['svg', 'html', 'md'])
    assert.equal(value.stats.nodes, 3)
    assert.equal(value.stats.links, 1)
    for (const file of value.files) {
      const info = await stat(file.path)
      assert.ok(info.size > 0, `${file.format} is not empty`)
      assert.ok(file.path.startsWith(directory), 'written inside outDir')
      const content = await readFile(file.path, 'utf8')
      if (file.format === 'svg') assert.match(content, /<svg class="cm-svg"/u)
      if (file.format === 'html') assert.match(content, /<!DOCTYPE html>/u)
      if (file.format === 'md') assert.match(content, /```mermaid/u)
    }
    const rendered = def.output.render(null, value)
    assert.equal(rendered.length, 1)
    assert.match(rendered[0].text, /Context map written: Runtime fixture/u)
    assert.ok(rendered[0].text.includes(value.files[0].path))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('a bad outline fails with a fixable message', async () => {
  const { def } = register()
  await assert.rejects(
    () => def.execute({ title: 'x', nodes: [{ label: 'a', kind: 'nonsense' }] }, { signal: new AbortController().signal }),
    /valid kinds are goal, context, decision/u,
  )
})

test('an aborted call stops before writing', async () => {
  const directory = await mkdtemp(join(here, '.tmp-'))
  try {
    const { def } = register()
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(
      () => def.execute({ title: 'x', outDir: directory, nodes: [{ label: 'a' }] }, { signal: controller.signal }),
      (error) => error?.name === 'AbortError',
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('the output guard refuses a filesystem root', () => {
  const root = parse(process.cwd()).root
  assert.throws(() => resolveOutDir(process.cwd(), root), (error) => {
    assert.ok(error instanceof OutputPathError)
    assert.equal(error.code, 'E_OUTDIR')
    return true
  })
})

test('the output guard refuses the dsh home', () => {
  const { homedir } = process.env.USERPROFILE !== undefined && process.platform === 'win32'
    ? { homedir: () => process.env.USERPROFILE }
    : { homedir: () => process.env.HOME }
  const target = join(String(homedir()), '.dsh', 'maps')
  assert.throws(() => resolveOutDir(process.cwd(), target), /configuration or credentials/u)
})

test('presenters stay pure on unknown arguments', () => {
  const { def } = register()
  assert.equal(def.presentCall(undefined).card, 'generic')
  assert.equal(def.presentCall({ title: 'Named' }).title, 'Context map · Named')
  const result = def.presentResult({}, { content: [{ type: 'text', text: 'ok' }] })
  assert.equal(result.card, 'generic')
})
