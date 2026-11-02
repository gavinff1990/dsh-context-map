import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { VERSION } from '../lib/version.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (path) => readFile(join(root, path), 'utf8')

/**
 * @returns {Promise<any>} parsed package.json
 */
async function manifest() {
  return JSON.parse(await read('package.json'))
}

test('lib/version.js matches package.json', async () => {
  const pkg = await manifest()
  assert.equal(VERSION, pkg.version)
})

test('plugin id satisfies the registry slug rule', async () => {
  const pkg = await manifest()
  assert.match(pkg.name, /^[a-z0-9]+(-[a-z0-9]+)*$/u)
})

test('package declares the dsh bundle patch and the patch exists', async () => {
  const pkg = await manifest()
  assert.equal(typeof pkg.dsh?.bundle?.patch, 'string')
  const patch = await read(pkg.dsh.bundle.patch)
  assert.match(patch, /^- insert:/mu)
  assert.ok(patch.includes(pkg.name), 'the row names this package')
  await stat(join(root, pkg.dsh.bundle.patch))
})

test('entry points exist', async () => {
  const pkg = await manifest()
  await stat(join(root, pkg.main))
  for (const [name, path] of Object.entries(pkg.bin)) {
    assert.equal(typeof name, 'string')
    await stat(join(root, path))
  }
})

test('licence is SPDX-recognisable and the file is present', async () => {
  const pkg = await manifest()
  assert.equal(pkg.license, 'MIT')
  const licence = await read('LICENSE')
  assert.match(licence, /MIT License/u)
})

test('README documents the install command the registries look for', async () => {
  const readme = await read('README.md')
  assert.match(readme, /dsh plugin --profile \w+ add dsh-context-map/u)
  assert.match(readme, /cordis\.patch\.yml/u)
})

test('topics are declared as keywords and no stray dependency is required', async () => {
  const pkg = await manifest()
  assert.ok(pkg.keywords.includes('dsh-plugin'))
  assert.ok(pkg.keywords.includes('deepseek-harness'))
  assert.equal(pkg.dependencies, undefined, 'zero runtime dependencies')
})

test('files whitelist keeps the tarball scannable and small', async () => {
  const pkg = await manifest()
  for (const entry of ['lib', 'bin', 'cordis.patch.yml', 'README.md', 'LICENSE']) {
    assert.ok(pkg.files.includes(entry), `files includes ${entry}`)
  }
})
