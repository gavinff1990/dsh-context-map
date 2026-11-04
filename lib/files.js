/**
 * Filesystem seam.
 *
 * The plugin writes exactly three artifacts into one directory. This module is
 * the only place that touches the disk, and it refuses the locations where a
 * stray write would be destructive rather than merely untidy: the filesystem
 * root, the dsh home, and the usual credential stores.
 * @module dsh-context-map/files
 */

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, parse, resolve, sep } from 'node:path'
import { SidecarError, assertSidecar } from './sidecar.js'

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

/** Largest sidecar this plugin will read back; anything larger is not ours. */
const SIDECAR_MAX_BYTES = 1_000_000

/**
 * Read a previous revision's sidecar.
 * @param {string} file - path to a `.json` sidecar, absolute or relative to `base`.
 * @param {string} base - directory relative paths resolve against.
 * @returns {Promise<{path: string, sidecar: object}>} parsed and validated sidecar.
 * @throws {SidecarError} when the file is missing, oversized, not JSON, or not a sidecar.
 */
export async function readSidecar(file, base) {
  const absolute = resolve(base, file)
  let info
  try {
    info = await stat(absolute)
  } catch {
    throw new SidecarError('E_SIDECAR_MISSING', `No update file at ${absolute}. Pass the .json this plugin wrote on a previous run.`)
  }
  if (!info.isFile()) {
    throw new SidecarError('E_SIDECAR_FILE', `${absolute} is not a file.`)
  }
  if (info.size > SIDECAR_MAX_BYTES) {
    throw new SidecarError('E_SIDECAR_SIZE', `${absolute} is larger than ${SIDECAR_MAX_BYTES} bytes; that is not a map sidecar.`)
  }
  const text = await readFile(absolute, 'utf8')
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new SidecarError('E_SIDECAR_JSON', `${absolute} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  return { path: absolute, sidecar: assertSidecar(parsed) }
}
