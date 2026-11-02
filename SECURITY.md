# Security policy

## Scope

`dsh-context-map` runs inside the DeepSeek Harness host process. Its whole
surface is one tool that validates an outline and writes three text files.

What it does **not** do:

- no network access of any kind (no `fetch`, no socket, no telemetry);
- no subprocess spawning, no `eval`, no `Function`, no dynamic `import` of
  remote code;
- no reading of `~/.dsh`, session logs, credentials or any path outside the
  directory it was asked to write;
- no install-time scripts (`preinstall`/`postinstall`/`prepare` are absent).

## Filesystem guard

`lib/files.js` resolves `outDir`, then refuses:

- the filesystem root;
- `~/.dsh`, `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.config`;
- `%SystemRoot%` and `%SystemRoot%\System32` on Windows;
- `/etc`, `/usr`, `/bin`, `/sbin`, `/boot`, `/dev`, `/proc`, `/sys`, `/var/lib`
  elsewhere.

Only three filenames are ever written: `<slug>.svg`, `<slug>.html`,
`<slug>.md`, with `<slug>` reduced to `[a-z0-9-]`, so a crafted title cannot
escape the directory.

## Untrusted input

Labels and details come from a conversation and are untrusted. They are escaped
for XML (`lib/text.js` → `escapeXml`), for Mermaid, and for Markdown angle
brackets. Tests cover `<script>`, `&`, quotes and tag-shaped details.

## Reporting

Open a private security advisory on the repository, or mail the maintainer
listed in `package.json`. Please do not file a public issue for a vulnerability.
Expect an acknowledgement within a week.
