/**
 * Width estimation, wrapping and escaping.
 *
 * The map is laid out without a canvas, so every box size comes from a
 * deterministic approximation of the glyphs a browser will draw. The estimate
 * only has to be monotonic and slightly pessimistic: boxes end up a few pixels
 * wider than the text, never clipped.
 * @module dsh-context-map/text
 */

/** Ranges of characters drawn approximately one em wide (CJK, kana, hangul, fullwidth). */
const WIDE_RE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/u
/** Latin glyphs that occupy noticeably less than an average advance. */
const NARROW_RE = /[.,:;'`"!|iljI()[\]{}<>\u00B7\u2022\u2026\u2013\u2014]/u
/** Block-level markdown markers that should never reach a diagram label. */
const MARKDOWN_NOISE_RE = /(^\s*(?:[-*+\u2022]|\d+[.)])\s+)|(\*\*|__|`|~~)/gu

/**
 * Whether a character is drawn one em wide.
 * @param {string} char - single character.
 * @returns {boolean} true for CJK and other wide scripts.
 */
export function isWide(char) {
  return WIDE_RE.test(char)
}

/**
 * Approximate the rendered width of a single line.
 * @param {string} text - line content.
 * @param {number} fontSize - CSS pixels.
 * @returns {number} width in CSS pixels.
 */
export function measureText(text, fontSize) {
  let width = 0
  for (const char of text) {
    if (WIDE_RE.test(char)) width += fontSize
    else if (char === ' ' || char === '\t') width += fontSize * 0.28
    else if (NARROW_RE.test(char)) width += fontSize * 0.34
    else if (char >= 'A' && char <= 'Z') width += fontSize * 0.64
    else width += fontSize * 0.55
  }
  return width
}

/**
 * Split text into breakable segments: wide characters stand alone, latin runs
 * stay whole so words are never cut mid-way, trailing punctuation sticks to the
 * word it follows.
 * @param {string} text - one line of text.
 * @returns {string[]} segments.
 */
function segments(text) {
  /** @type {string[]} */
  const out = []
  let run = ''
  const flush = () => {
    if (run !== '') {
      out.push(run)
      run = ''
    }
  }
  for (const char of text) {
    if (WIDE_RE.test(char)) {
      flush()
      out.push(char)
    } else if (/\s/u.test(char)) {
      flush()
      out.push(' ')
    } else if (NARROW_RE.test(char)) {
      if (run !== '') run += char
      else if (out.length > 0) out[out.length - 1] += char
      else run = char
    } else {
      run += char
    }
  }
  flush()
  return out
}

/**
 * Greedy word wrap bounded by width.
 * @param {string} text - source text, may contain explicit newlines.
 * @param {number} fontSize - CSS pixels.
 * @param {number} maxWidth - available width in CSS pixels.
 * @returns {string[]} wrapped lines, never empty.
 */
export function wrapText(text, fontSize, maxWidth) {
  const limit = Math.max(maxWidth, fontSize * 2)
  /** @type {string[]} */
  const lines = []
  for (const paragraph of String(text ?? '').split(/\r?\n/u)) {
    let line = ''
    for (const segment of segments(paragraph)) {
      if (segment === ' ' && line === '') continue
      const candidate = line + segment
      if (measureText(candidate, fontSize) <= limit || line === '') {
        line = candidate
        continue
      }
      lines.push(line.trimEnd())
      line = segment === ' ' ? '' : segment
      // A single segment wider than the column is hard-split on character boundaries.
      while (measureText(line, fontSize) > limit) {
        let cut = 1
        let taken = ''
        for (const char of line) {
          if (measureText(taken + char, fontSize) > limit) break
          taken += char
          cut += 1
        }
        lines.push(taken)
        line = line.slice(Math.max(taken.length, 1))
        void cut
      }
    }
    lines.push(line.trimEnd())
  }
  const cleaned = lines.filter((entry) => entry !== '')
  return cleaned.length > 0 ? cleaned : ['']
}

/**
 * Collapse markdown noise and repeated whitespace into a single label line.
 * @param {string} value - raw label.
 * @param {number} [maxChars] - hard character cap.
 * @returns {string} cleaned label.
 */
export function cleanLabel(value, maxChars = 240) {
  const text = String(value ?? '')
    .replace(MARKDOWN_NOISE_RE, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
  if (text.length <= maxChars) return text
  return `${text.slice(0, Math.max(maxChars - 1, 1)).trimEnd()}\u2026`
}

/**
 * Escape a string for XML text or attribute content.
 * @param {string} value - raw value.
 * @returns {string} escaped value.
 */
export function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * Escape a string for a Mermaid quoted label.
 * @param {string} value - raw value.
 * @returns {string} escaped value.
 */
export function escapeMermaid(value) {
  return String(value ?? '')
    .replaceAll('"', '&quot;')
    .replaceAll('\n', ' ')
    .replaceAll('[', '(')
    .replaceAll(']', ')')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/**
 * Escape a string for use inside a `textContent` assignment in an inline script
 * payload (JSON is embedded in a `<script type="application/json">` block).
 * @param {string} value - raw value.
 * @returns {string} JSON text safe inside a script element.
 */
export function escapeScriptJson(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
}
