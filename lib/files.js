/**
 * Filesystem seam.
 *
 * The plugin writes exactly three artifacts into one directory. This module is
 * the only place that touches the disk, and it refuses the locations where a
 * stray write would be destructive rather than merely untidy: the filesystem
 * root, the dsh home, and the usual credential stores.
 * @module dsh-context-map/files
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, parse, resolve, sep } from 'node:path'

/**
 * Paths this plugin will never write into, compared case-insensitively after
 * resolution so a symlink or a `..` segment cannot smuggle a target in.
 * @returns {string[]} absolute directories that stay off limits.
 */
function protectedRoots() {
  const home = homedir()
  const roots = [join(home, '.ssh'), join(home, '.aws'), join(home, '.gnupg'), join(home, '.dsh'), join(home, '.config')]
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
    roots.push(systemRoot, join(systemRoot, 'System32'))
  } else {
    roots.push('/etc', '/usr', '/bin', '/sbin', '/boot', '/dev', '/proc', '/sys', '/var/lib')
  }
  return roots.map((entry) => entry.toLowerCase())
}

/**
 * A rejected destination that the model can fix by naming another directory.
 */
export class OutputPathError extends Error {
  /**
   * @param {string} message - actionable description.
   */
  constructor(message) {
    super(message)
    this.name = 'OutputPathError'
    this.code = 'E_OUTDIR'
  }
}

/**
 * Resolve the output directory and prove it is safe to write into.
 * @param {string} base - working directory relative paths resolve against.
 * @param {string} outDir - requested directory.
 * @returns {string} absolute directory.
 * @throws {OutputPathError} when the directory is a root or a protected path.
 */
export function resolveOutDir(base, outDir) {
  const absolute = resolve(base, outDir)
  if (absolute === parse(absolute).root) {
    throw new OutputPathError(`Refusing to write the map into the filesystem root (${absolute}). Pass a project directory as outDir.`)
  }
  const lower = absolute.toLowerCase()
  for (const root of protectedRoots()) {
    if (lower === root || lower.startsWith(`${root}${sep}`)) {
      throw new OutputPathError(`Refusing to write into ${absolute}: that location holds configuration or credentials. Pass a project directory as outDir.`)
    }
  }
  return absolute
}

/**
 * Write every artifact into the resolved directory.
 * @param {string} directory - absolute directory.
 * @param {{format: string, filename: string, content: string}[]} artifacts - files to write.
 * @param {AbortSignal} [signal] - cancellation from the tool call.
 * @returns {Promise<{format: string, path: string, bytes: number}[]>} written files.
 */
export async function writeArtifacts(directory, artifacts, signal) {
  signal?.throwIfAborted()
  await mkdir(directory, { recursive: true })
  /** @type {{format: string, path: string, bytes: number}[]} */
  const written = []
  for (const artifact of artifacts) {
    signal?.throwIfAborted()
    const path = join(directory, artifact.filename)
    await writeFile(path, artifact.content, 'utf8')
    written.push({ format: artifact.format, path, bytes: Buffer.byteLength(artifact.content, 'utf8') })
  }
  return written
}
