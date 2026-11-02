/**
 * Registry contract checks.
 *
 * The harness registry accepts a plain `ToolDefinition` and validates its raw
 * JSON Schema against a documented subset before the tool becomes visible. This
 * suite re-implements that subset check locally so a schema regression fails
 * here instead of at load time inside someone's profile.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createContextMapTool } from '../lib/tool.js'

const TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])
const SCALARS = new Set(['string', 'number', 'boolean', 'null'])

/**
 * Walk one schema node and report every violation of the enforced subset.
 * @param {unknown} node - candidate schema node.
 * @param {string} path - location for the message.
 * @param {string[]} problems - accumulator.
 * @returns {string[]} problems.
 */
function auditSchema(node, path = 'schema', problems = []) {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) {
    problems.push(`${path}: a schema node must be an object`)
    return problems
  }
  const schema = /** @type {Record<string, unknown>} */ (node)
  const allowed = new Set(['type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'description', 'title', 'default', 'examples'])
  for (const key of Object.keys(schema)) {
    if (!allowed.has(key)) problems.push(`${path}: unsupported keyword "${key}"`)
  }
  if (schema.type !== undefined && !TYPES.has(/** @type {string} */ (schema.type))) {
    problems.push(`${path}: unsupported type ${JSON.stringify(schema.type)}`)
  }
  if (schema.type === 'object') {
    if (typeof schema.additionalProperties !== 'boolean') {
      problems.push(`${path}: an object node must declare additionalProperties true or false`)
    }
    const properties = schema.properties
    if (properties !== undefined) {
      if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) {
        problems.push(`${path}: properties must be an object`)
      } else {
        for (const [name, child] of Object.entries(properties)) auditSchema(child, `${path}.${name}`, problems)
      }
    }
    if (schema.required !== undefined) {
      if (!Array.isArray(schema.required) || schema.required.some((entry) => typeof entry !== 'string')) {
        problems.push(`${path}: required must be an array of names`)
      } else if (properties !== undefined) {
        for (const name of schema.required) {
          if (!Object.hasOwn(/** @type {object} */ (properties), name)) {
            problems.push(`${path}: required "${name}" is not declared in properties`)
          }
        }
      }
    }
  }
  if (schema.type === 'array' && schema.items !== undefined) {
    auditSchema(schema.items, `${path}.items`, problems)
  }
  if (schema.enum !== undefined) {
    if (!Array.isArray(schema.enum) || schema.enum.length === 0) problems.push(`${path}: enum must be a non-empty array`)
    else if (schema.type !== undefined && SCALARS.has(/** @type {string} */ (schema.type))) {
      for (const value of schema.enum) {
        if (value === null ? schema.type !== 'null' : typeof value !== schema.type) {
          problems.push(`${path}: enum value ${JSON.stringify(value)} does not match type ${schema.type}`)
        }
      }
    }
  }
  if (schema.oneOf !== undefined && (!Array.isArray(schema.oneOf) || schema.oneOf.length < 2)) {
    problems.push(`${path}: oneOf needs at least two branches`)
  }
  return problems
}

test('parameters are a valid raw JSON Schema in the enforced subset', () => {
  const tool = createContextMapTool()
  assert.deepEqual(auditSchema(tool.parameters, 'parameters'), [])
})

test('the output schema is a valid raw JSON Schema in the enforced subset', () => {
  const tool = createContextMapTool()
  assert.deepEqual(auditSchema(tool.output.schema, 'output'), [])
})

test('the registry-required fields are present and well typed', () => {
  const tool = createContextMapTool()
  assert.equal(typeof tool.name, 'string')
  assert.match(tool.name, /^[a-z][a-z0-9_]*$/u)
  assert.ok(tool.description.length >= 40, 'a model needs enough description to choose the tool')
  assert.equal(typeof tool.parameters, 'object')
  assert.equal(typeof tool.output.schema, 'object')
  assert.equal(typeof tool.output.render, 'function')
  assert.equal(typeof tool.execute, 'function')
  assert.equal(tool.timeoutMs, undefined, 'no timeout is declared, so none is enforced')
})

test('every kind in the parameter enum is a kind the renderer knows', async () => {
  const { KINDS } = await import('../lib/spec.js')
  const tool = createContextMapTool()
  const enumKinds = tool.parameters.properties.nodes.items.properties.kind.enum
  assert.deepEqual(enumKinds, KINDS)
})

test('required arguments are exactly title and nodes', () => {
  const tool = createContextMapTool()
  assert.deepEqual([...tool.parameters.required].sort(), ['nodes', 'title'])
})
