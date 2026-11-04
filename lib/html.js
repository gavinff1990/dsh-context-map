/**
 * Interactive HTML export.
 *
 * Wraps the SVG in a page that survives being emailed, opened offline, or
 * printed: zoom, fit, search, per-kind filtering, an outline rail, and a theme
 * toggle — all inline, no CDN, no network request, no build step.
 * @module dsh-context-map/html
 */

import { escapeXml } from './text.js'
import { KIND_STYLES, strings } from './theme.js'
import { diffSummary } from './diff.js'

/**
 * @param {unknown} value - raw value.
 * @returns {string} HTML-safe text.
 */
const esc = (value) => escapeXml(value)

/**
 * Outline rail entries in reading order.
 * @param {object} model - normalized model.
 * @returns {string} nested list markup.
 */
function outlineMarkup(model) {
  if (model.roots.length === 0) return ''
  /**
   * @param {object} node - subtree root.
   * @param {number} depth - nesting depth.
   * @returns {string} list markup.
   */
  const branch = (node, depth) => {
    const children = node.children.length === 0
      ? ''
      : `\n<ul class="branch">${node.children.map((child) => branch(child, depth + 1)).join('')}</ul>`
    return `\n<li class="leaf lvl-${depth}"><button type="button" class="jump" data-target="${esc(node.id)}"><span class="dot cm-n-${esc(node.kind)}"></span><span class="txt">${esc(node.label)}</span></button>${children}</li>`
  }
  return `<ul class="branch root">${model.roots.map((root) => branch(root, 0)).join('')}</ul>`
}

/**
 * Render the interactive page.
 * @param {object} model - normalized model.
 * @param {object} geo - layout geometry.
 * @param {string} svg - rendered SVG markup.
 * @param {object} [options] - render options.
 * @param {'light'|'dark'|'auto'} [options.theme] - requested theme.
 * @param {string} [options.version] - package version.
 * @param {object|null} [options.diff] - revision diff against the previous sidecar.
 * @returns {string} complete HTML document.
 */
export function renderHtml(model, geo, svg, options = {}) {
  const t = strings(model.locale)
  const theme = options.theme ?? model.theme ?? 'auto'
  const version = options.version ?? ''
  const diff = options.diff ?? null
  const hideRules = Object.keys(KIND_STYLES)
    .map((kind) => `  .cm-svg.hide-${kind} .cm-n-${kind}{display:none}`)
    .join('\n')
  const kindCounts = Object.keys(KIND_STYLES)
    .map((kind) => ({ kind, count: model.nodes.filter((node) => node.kind === kind).length }))
    .filter((entry) => entry.count > 0)
    .map((entry) => `<li><span class="dot cm-n-${entry.kind}"></span>${esc(entry.kind)}<b>${entry.count}</b></li>`)
    .join('')

  return `<!DOCTYPE html>
<html lang="${model.locale === 'en' ? 'en' : 'zh-CN'}" data-theme="${esc(theme)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="dsh-context-map${version === '' ? '' : ` ${esc(version)}`}">
<title>${esc(model.title)} · ${esc(t.mapLabel)}</title>
<style>
  :root{--bg:#f8fafc;--surface:#fff;--surface-alt:#f1f5f9;--ink:#0f172a;--muted:#64748b;--faint:#94a3b8;--line:#e2e8f0;--accent:#2563eb;--shadow:0 1px 2px rgba(15,23,42,.06),0 8px 24px rgba(15,23,42,.06);--radius:14px}
  html[data-theme="dark"]{--bg:#0b1220;--surface:#0f172a;--surface-alt:#111c31;--ink:#e2e8f0;--muted:#94a3b8;--faint:#64748b;--line:#1e293b;--accent:#60a5fa;--shadow:0 1px 2px rgba(2,6,23,.5),0 12px 32px rgba(2,6,23,.45)}
  @media (prefers-color-scheme:dark){html[data-theme="auto"]{--bg:#0b1220;--surface:#0f172a;--surface-alt:#111c31;--ink:#e2e8f0;--muted:#94a3b8;--faint:#64748b;--line:#1e293b;--accent:#60a5fa;--shadow:0 1px 2px rgba(2,6,23,.5),0 12px 32px rgba(2,6,23,.45)}}
  *{box-sizing:border-box}
  html,body{margin:0;height:100%}
  body{background:var(--bg);color:var(--ink);font:14px/1.5 'Inter','Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;display:flex;flex-direction:column}
  .dot{display:inline-block;width:8px;height:8px;border-radius:3px;background:var(--kind,#94a3b8);margin-right:8px;flex:none}
${Object.keys(KIND_STYLES).map((kind) => `  .cm-n-${kind}{--kind:${KIND_STYLES[kind].light}}`).join('\n')}
  html[data-theme="dark"] .cm-n-goal{--kind:${KIND_STYLES.goal.dark}} html[data-theme="dark"] .cm-n-context{--kind:${KIND_STYLES.context.dark}} html[data-theme="dark"] .cm-n-decision{--kind:${KIND_STYLES.decision.dark}} html[data-theme="dark"] .cm-n-action{--kind:${KIND_STYLES.action.dark}} html[data-theme="dark"] .cm-n-artifact{--kind:${KIND_STYLES.artifact.dark}} html[data-theme="dark"] .cm-n-risk{--kind:${KIND_STYLES.risk.dark}} html[data-theme="dark"] .cm-n-question{--kind:${KIND_STYLES.question.dark}} html[data-theme="dark"] .cm-n-note{--kind:${KIND_STYLES.note.dark}}
  .bar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:10px;padding:10px 16px;background:color-mix(in srgb,var(--surface) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
  .bar .name{font-weight:650;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:34vw}
  .bar .tag{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);border:1px solid color-mix(in srgb,var(--accent) 35%,transparent);border-radius:999px;padding:2px 8px}
  .bar .spacer{flex:1}
  .search{position:relative}
  .search input{width:min(260px,34vw);padding:7px 10px 7px 30px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink);font:inherit;font-size:13px}
  .search input:focus{outline:2px solid color-mix(in srgb,var(--accent) 40%,transparent);outline-offset:1px}
  .search svg{position:absolute;left:9px;top:50%;transform:translateY(-50%);opacity:.5}
  .group{display:flex;align-items:center;gap:2px;padding:2px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}
  .group button{border:0;background:transparent;color:var(--ink);font:inherit;font-size:13px;min-width:30px;height:28px;border-radius:7px;cursor:pointer;padding:0 8px}
  .group button:hover{background:var(--surface-alt)}
  .group .zoom{min-width:52px;font-variant-numeric:tabular-nums;color:var(--muted)}
  .wrap{flex:1;display:flex;min-height:0}
  .side{width:264px;flex:none;border-right:1px solid var(--line);background:var(--surface);overflow:auto;padding:14px 12px 40px}
  .side h2{margin:2px 0 10px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);font-weight:700}
  .side .stats{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px;padding:0;list-style:none;font-size:11px;color:var(--muted)}
  .side .stats li{display:flex;align-items:center;gap:4px;padding:3px 7px;border:1px solid var(--line);border-radius:999px}
  .side .stats b{font-weight:650;color:var(--ink)}
  ul.branch{list-style:none;margin:0;padding:0}
  ul.branch ul.branch{padding-left:12px;border-left:1px dashed var(--line);margin-left:5px}
  li.leaf{position:relative}
  button.jump{display:flex;align-items:flex-start;gap:0;width:100%;text-align:left;border:0;background:transparent;color:var(--ink);font:inherit;font-size:12.5px;line-height:1.45;padding:5px 6px;border-radius:8px;cursor:pointer}
  button.jump:hover{background:var(--surface-alt)}
  button.jump.active{background:color-mix(in srgb,var(--accent) 12%,transparent)}
  button.jump .txt{overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  button.jump .dot{margin-top:4px}
  .stage{flex:1;min-width:0;overflow:auto;position:relative;background-image:radial-gradient(var(--line) 1px,transparent 1px);background-size:22px 22px}
  .canvas{transform-origin:0 0;width:max-content;padding:18px}
  .canvas svg{display:block;border-radius:12px;box-shadow:var(--shadow);background:var(--bg)}
  .cm-node{transition:opacity .18s ease,filter .18s ease}
  .cm-node.hit{filter:drop-shadow(0 0 0.55rem color-mix(in srgb,var(--accent) 55%,transparent))}
  .cm-node.dim{opacity:.18}
  .cm-node.flash .cm-card{animation:flash 1.1s ease-out 2}
  .cm-svg.only-diff .cm-node:not(.cm-node-new):not(.cm-node-changed){opacity:.15}
  @keyframes flash{0%,100%{stroke-opacity:.42}30%{stroke-opacity:1;stroke-width:2.6px}}
  .cm-legend-item{cursor:pointer}
  .cm-legend-item.off{opacity:.35}
  .empty{position:absolute;inset:0;display:none;place-items:center;color:var(--muted);font-size:13px}
  .stage[data-empty="true"] .empty{display:grid}
  @media (max-width:820px){.side{display:none}.bar .name{max-width:40vw}}
  @media print{@page{size:A3 landscape;margin:8mm}.bar,.side,.empty{display:none}.wrap{display:block}.stage{overflow:visible;background:none}.canvas{transform:none!important;padding:0}.canvas svg{box-shadow:none}}
  @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
${hideRules}
</style>
</head>
<body>
<header class="bar">
  <span class="tag">${esc(t.mapLabel)}</span>
  <span class="name" title="${esc(model.title)}">${esc(model.title)}</span>
  ${diff === null ? '' : `<span class="tag" style="color:#f59e0b;border-color:#f59e0b55">${esc(diffSummary(diff, model.locale))}</span>`}
  <span class="spacer"></span>
  <label class="search" aria-label="${esc(t.search)}">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>
    <input id="q" type="search" placeholder="${esc(t.search)}" autocomplete="off" spellcheck="false">
  </label>
  <div class="group" role="group" aria-label="zoom">
    <button type="button" id="zoom-out" title="${esc(t.zoomOut)}" aria-label="${esc(t.zoomOut)}">−</button>
    <button type="button" class="zoom" id="zoom-reset" title="${esc(t.reset)}">100%</button>
    <button type="button" id="zoom-in" title="${esc(t.zoomIn)}" aria-label="${esc(t.zoomIn)}">+</button>
    <button type="button" id="fit" title="${esc(t.fit)}">${esc(t.fit)}</button>
  </div>
  <div class="group">
    <button type="button" id="theme" title="${esc(t.theme)}" aria-label="${esc(t.theme)}">◐</button>
    <button type="button" id="print" title="${esc(t.print)}" aria-label="${esc(t.print)}">⎙</button>
    ${diff === null ? '' : '<button type="button" id="diff" title="only changed nodes">±</button>'}
  </div>
</header>
<div class="wrap">
  <aside class="side">
    <h2>${esc(t.outline)}</h2>
    <ul class="stats">${kindCounts}</ul>
    ${outlineMarkup(model)}
  </aside>
  <section class="stage" id="stage">
    <div class="canvas" id="canvas">
${svg}
    </div>
    <p class="empty">${esc(t.empty)}</p>
  </section>
</div>
<script>
(function () {
  var stage = document.getElementById('stage')
  var canvas = document.getElementById('canvas')
  var svg = canvas.querySelector('svg')
  var zoomLabel = document.getElementById('zoom-reset')
  var q = document.getElementById('q')
  var scale = 1
  var min = 0.2
  var max = 4

  function apply(next) {
    scale = Math.min(max, Math.max(min, next))
    canvas.style.transform = 'scale(' + scale + ')'
    zoomLabel.textContent = Math.round(scale * 100) + '%'
  }
  function fit() {
    var pad = 48
    var sx = (stage.clientWidth - pad) / svg.width.baseVal.value
    var sy = (stage.clientHeight - pad) / svg.height.baseVal.value
    apply(Math.min(sx, sy, 1))
  }
  function themeToggle() {
    var root = document.documentElement
    var order = ['auto', 'light', 'dark']
    var next = order[(order.indexOf(root.getAttribute('data-theme')) + 1) % order.length]
    root.setAttribute('data-theme', next)
    svg.setAttribute('data-theme', next)
  }
  function nodes() {
    return Array.prototype.slice.call(svg.querySelectorAll('.cm-node'))
  }
  function search(value) {
    var needle = value.trim().toLowerCase()
    var hits = 0
    nodes().forEach(function (node) {
      var hit = needle !== '' && (node.getAttribute('data-search') || '').indexOf(needle) !== -1
      node.classList.toggle('hit', hit)
      node.classList.toggle('dim', needle !== '' && !hit)
      if (hit) hits += 1
    })
    stage.setAttribute('data-empty', String(needle !== '' && hits === 0))
  }
  function focusNode(id) {
    var target = nodes().filter(function (node) { return node.getAttribute('data-id') === id })[0]
    if (!target) return
    target.classList.add('flash')
    window.setTimeout(function () { target.classList.remove('flash') }, 2400)
    var box = target.getBoundingClientRect()
    var view = stage.getBoundingClientRect()
    stage.scrollBy({ left: box.left - view.left - view.width / 3, top: box.top - view.top - view.height / 3, behavior: 'smooth' })
    Array.prototype.forEach.call(document.querySelectorAll('button.jump'), function (button) {
      button.classList.toggle('active', button.getAttribute('data-target') === id)
    })
  }

  document.getElementById('zoom-in').addEventListener('click', function () { apply(scale * 1.2) })
  document.getElementById('zoom-out').addEventListener('click', function () { apply(scale / 1.2) })
  zoomLabel.addEventListener('click', function () { apply(1) })
  document.getElementById('fit').addEventListener('click', fit)
  document.getElementById('theme').addEventListener('click', themeToggle)
  document.getElementById('print').addEventListener('click', function () { window.print() })
  var diffButton = document.getElementById('diff')
  if (diffButton) diffButton.addEventListener('click', function () {
    svg.classList.toggle('only-diff')
    diffButton.classList.toggle('active')
  })

  q.addEventListener('input', function () { search(q.value) })
  q.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') { q.value = ''; search(''); q.blur() }
  })

  svg.addEventListener('click', function (event) {
    var legend = event.target.closest('.cm-legend-item')
    if (!legend) return
    var kind = legend.getAttribute('data-kind')
    var off = !svg.classList.contains('hide-' + kind)
    svg.classList.toggle('hide-' + kind, off)
    legend.classList.toggle('off', off)
  })

  document.addEventListener('click', function (event) {
    var jump = event.target.closest('button.jump')
    if (jump) focusNode(jump.getAttribute('data-target'))
  })

  document.addEventListener('keydown', function (event) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)
    if (event.key === '/' && !typing) { event.preventDefault(); q.focus() }
    if (typing) return
    if (event.key === '+' || event.key === '=') { event.preventDefault(); apply(scale * 1.2) }
    if (event.key === '-') { event.preventDefault(); apply(scale / 1.2) }
    if (event.key === '0') { event.preventDefault(); apply(1) }
    if (event.key === 'f' || event.key === 'F') { event.preventDefault(); fit() }
  })

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) fit()
})()
</script>
</body>
</html>
`
}
