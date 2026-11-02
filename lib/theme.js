/**
 * Visual language: kind colors, theme tokens and UI strings.
 *
 * One map must read the same whether it is printed, opened in the app, or
 * embedded in a README, so every color lives here and nowhere else.
 * @module dsh-context-map/theme
 */

/**
 * Kind presentation: accent color per theme, tint behind the card, and the
 * short label drawn in the kind pill.
 */
export const KIND_STYLES = {
  goal: { zh: '目标', en: 'Goal', light: '#2563eb', dark: '#60a5fa', fillLight: '#eff6ff', fillDark: '#12233f' },
  context: { zh: '背景', en: 'Context', light: '#64748b', dark: '#94a3b8', fillLight: '#f8fafc', fillDark: '#17203a' },
  decision: { zh: '决策', en: 'Decision', light: '#7c3aed', dark: '#a78bfa', fillLight: '#f5f3ff', fillDark: '#1d1a3a' },
  action: { zh: '动作', en: 'Action', light: '#059669', dark: '#34d399', fillLight: '#ecfdf5', fillDark: '#0d2a24' },
  artifact: { zh: '产物', en: 'Artifact', light: '#d97706', dark: '#fbbf24', fillLight: '#fffbeb', fillDark: '#2b2110' },
  risk: { zh: '风险', en: 'Risk', light: '#e11d48', dark: '#fb7185', fillLight: '#fff1f2', fillDark: '#2e1420' },
  question: { zh: '待确认', en: 'Open question', light: '#0891b2', dark: '#22d3ee', fillLight: '#ecfeff', fillDark: '#0c2a33' },
  note: { zh: '备注', en: 'Note', light: '#475569', dark: '#94a3b8', fillLight: '#f1f5f9', fillDark: '#1a2438' },
}

/** Progress marker colors, identical across themes so status never shifts meaning. */
export const STATUS_STYLES = {
  done: { zh: '已完成', en: 'Done', color: '#16a34a' },
  active: { zh: '进行中', en: 'Active', color: '#2563eb' },
  planned: { zh: '计划中', en: 'Planned', color: '#94a3b8' },
  blocked: { zh: '受阻', en: 'Blocked', color: '#e11d48' },
  unknown: { zh: '未标注', en: 'Unmarked', color: '' },
}

/**
 * Resolve the color role for one theme.
 * @param {'light'|'dark'} theme - concrete theme.
 * @param {string} kind - node kind.
 * @returns {{accent: string, fill: string}} colors for this theme.
 */
export function kindColors(theme, kind) {
  const style = KIND_STYLES[kind] ?? KIND_STYLES.note
  return theme === 'dark'
    ? { accent: style.dark, fill: style.fillDark }
    : { accent: style.light, fill: style.fillLight }
}

/**
 * Page-level tokens for one theme.
 * @param {'light'|'dark'} theme - concrete theme.
 * @returns {Record<string, string>} CSS-ready tokens.
 */
export function tokens(theme) {
  return theme === 'dark'
    ? {
        bg: '#0b1220',
        surface: '#0f172a',
        surfaceAlt: '#111c31',
        ink: '#e2e8f0',
        inkSoft: '#cbd5e1',
        muted: '#94a3b8',
        faint: '#64748b',
        edge: '#334155',
        edgeStrong: '#475569',
        pill: '#1e293b',
        shadow: 'rgba(2, 6, 23, 0.55)',
        grid: 'rgba(148, 163, 184, 0.08)',
      }
    : {
        bg: '#f8fafc',
        surface: '#ffffff',
        surfaceAlt: '#f1f5f9',
        ink: '#0f172a',
        inkSoft: '#1e293b',
        muted: '#64748b',
        faint: '#94a3b8',
        edge: '#cbd5e1',
        edgeStrong: '#94a3b8',
        pill: '#e2e8f0',
        shadow: 'rgba(15, 23, 42, 0.08)',
        grid: 'rgba(15, 23, 42, 0.04)',
      }
}

/**
 * Resolve `auto` against the export target.
 * @param {'light'|'dark'|'auto'} theme - requested theme.
 * @param {'light'|'dark'} [fallback] - concrete theme for `auto`.
 * @returns {'light'|'dark'} concrete theme.
 */
export function resolveTheme(theme, fallback = 'light') {
  return theme === 'dark' || theme === 'light' ? theme : fallback
}

/**
 * UI strings for one locale.
 * @param {'zh'|'en'} locale - requested locale.
 * @returns {Record<string, string>} strings.
 */
export function strings(locale) {
  if (locale === 'en') {
    return {
      legend: 'Legend',
      generated: 'Generated',
      nodes: 'nodes',
      depth: 'levels',
      links: 'cross links',
      openQuestion: 'Open question',
      search: 'Search labels…',
      fit: 'Fit',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      reset: 'Reset',
      theme: 'Theme',
      print: 'Print',
      empty: 'No node matches this search.',
      outline: 'Structure',
      inventory: 'Nodes',
      kinds: 'Kinds',
      files: 'Files',
      emptyMap: 'This map has no nodes yet.',
      mapLabel: 'Context information architecture map',
      status: 'Status',
      legendHint: 'Click a kind to hide or show it.',
    }
  }
  return {
    legend: '图例',
    generated: '生成于',
    nodes: '个节点',
    depth: '层',
    links: '条关联',
    openQuestion: '待确认',
    search: '搜索节点…',
    fit: '适配',
    zoomIn: '放大',
    zoomOut: '缩小',
    reset: '还原',
    theme: '主题',
    print: '打印',
    empty: '没有匹配的节点。',
    outline: '结构',
    inventory: '节点清单',
    kinds: '类型分布',
    files: '输出文件',
    emptyMap: '这张图还没有节点。',
    mapLabel: '上下文信息架构图',
    status: '状态',
    legendHint: '点击图例可显示或隐藏该类节点。',
  }
}

/**
 * Locale-aware kind label.
 * @param {string} kind - node kind.
 * @param {'zh'|'en'} locale - requested locale.
 * @returns {string} short label.
 */
export function kindLabel(kind, locale) {
  const style = KIND_STYLES[kind] ?? KIND_STYLES.note
  return locale === 'en' ? style.en : style.zh
}

/**
 * Locale-aware status label.
 * @param {string} status - node status.
 * @param {'zh'|'en'} locale - requested locale.
 * @returns {string} short label.
 */
export function statusLabel(status, locale) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.unknown
  return locale === 'en' ? style.en : style.zh
}
