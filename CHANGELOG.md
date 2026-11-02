# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] — 2026-11-02

First version available on npm. No code change from 0.1.0: the version was
bumped because npm reserves the name through a staged publish, so 0.1.0 could
not be published directly.

### Added

- Published to the npm registry as `dsh-context-map`, so `dsh plugin --profile web add dsh-context-map`
  installs a tarball instead of cloning the repository.

## [0.1.0] — 2026-11-02

First release.

### Added

- `context_map` tool: turns a conversation outline into a layered information
  architecture map, registered as a raw `ToolDefinition` with no runtime
  dependency on the harness packages.
- Deterministic tree layout: per-depth column widths, parents centered on their
  children's subtree band, sibling stacking with no overlap, and a canvas that
  grows for cross-link labels.
- SVG export: single file, both themes inline as CSS variables, `auto` follows
  `prefers-color-scheme`, accessible `<title>`/`<desc>`, kind-colored cards and
  legend.
- Interactive HTML export: zoom, fit, search, per-kind filtering, outline rail,
  theme toggle, A3 landscape print styles — all inline, no CDN.
- Markdown export: Mermaid `flowchart LR` with class definitions matching the
  SVG palette, nested outline, kind counts and a node inventory.
- Cross links (`links`) for dependencies a tree cannot express, routed around
  the right edge when both ends share a column.
- Seven node kinds (`goal`, `context`, `decision`, `action`, `artifact`,
  `risk`, `question`, plus `note`) and four status dots.
- `dsh-context-map` CLI sharing the same renderer: `--out`, `--formats`,
  `--theme`, `--locale`, `--slug`, `--stdout`, `--json`.
- Output guard that refuses the filesystem root and credential/config
  directories.
- 50 unit tests covering validation messages, layout invariants, escaping,
  plugin registration, disk output and packaging metadata.

[0.1.0]: https://github.com/gavinff1990/dsh-context-map/releases/tag/v0.1.0
