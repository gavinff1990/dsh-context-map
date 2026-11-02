/**
 * Test entry that runs every suite in one process.
 *
 * `node --test` forks a child per file, which a confined runner (the dsh file
 * sandbox, some CI containers) refuses with EPERM. Importing the suites here
 * keeps `npm test` working in those environments and still exits non-zero on
 * failure, because node:test owns the exit code.
 */
import { readdir } from 'node:fs/promises'

const directory = new URL('../test/', import.meta.url)
const files = (await readdir(directory))
  .filter((entry) => entry.endsWith('.test.js'))
  .sort()

for (const file of files) {
  process.stdout.write(`# ${file}\n`)
  await import(new URL(file, directory).href)
}
