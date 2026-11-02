# Contributing

Thanks for taking a look. This package is deliberately small: no build step, no
runtime dependencies, no bundler.

## Setup

```sh
git clone https://github.com/gavinff1990/dsh-context-map
cd dsh-context-map
npm test
```

Node 20 or newer. There is nothing to install — `npm test` runs the suites
straight from source.

## What a good change looks like

- **Keep it dependency-free.** A feature that needs a package needs a strong
  argument; text measurement, layout and rendering are all hand-written on
  purpose.
- **Keep layout deterministic.** No `Math.random`, no clock in coordinates, no
  `Intl` formatting that varies by locale. Regenerating a map must not produce a
  diff.
- **Test the invariant, not the pixel.** Assert that siblings do not overlap,
  that a parent sits on its children's band, that hostile labels are escaped —
  not that a card is exactly 213.4 px wide.
- **Escape at the boundary.** Anything that came from a conversation goes
  through `lib/text.js` before it reaches SVG, HTML or Markdown.
- **Keep the upload contract green.** `test/package.test.js` encodes what the
  plugin directories require (slug-safe name, `dsh.bundle.patch`, SPDX licence,
  install command in the README, `dsh-plugin` keyword, zero dependencies). If
  you change packaging on purpose, change that test in the same commit.

## Adding a node kind

1. Add the entry to `KIND_STYLES` in `lib/theme.js` (both theme colors).
2. Add it to `KINDS` in `lib/spec.js` and to the `kind` enum in
   `lib/tool.js` — the model has to know it exists.
3. Teach the model what it means: update `DESCRIPTION` and the `kind`
   description in `lib/tool.js`.
4. Run `npm run demo` and look at `docs/context-map-example.svg`.

## Reporting a bug

Include the spec that produced it (redact anything private), the dsh version
(`dsh --version`), and whether the SVG, the HTML or the Markdown was wrong.
