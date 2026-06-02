# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-06-01

### Added

- `ctx.text`, `ctx.select<T>` and `ctx.multiselect<T>` — themed prompt helpers on
  the action context, so actions no longer need to import `@clack/prompts`
  directly for richer input. Options use `{ value, label, hint? }`; results are
  the value (or array) **or** a cancel sentinel.
- `ctx.isCancel(value)` — re-exported cancel check (a type guard) so actions can
  detect Ctrl+C / Esc on `text` / `select` / `multiselect` without depending on
  `@clack/prompts`.

This resolves the last of the three real-world workarounds: navigation/input that
previously required a nested `@clack/prompts` import (which also caused the
terminal-freeze in `loop` mode) is now first-class on `ctx`.

## [0.2.0] - 2026-06-01

Resolves the interactive↔argv "catch-22" from real-world feedback: an arg can now
be accepted via argv yet not prompted in the menu.

### Changed

- **Interactive menu only prompts what's missing.** Previously every declared arg
  was prompted regardless of `required`. Now the menu prompts an arg only when it
  is `required` and was not supplied via argv. This is a behavior change for
  consumers who relied on optional args being prompted — opt back in per-arg with
  `prompt: true`.
- **Boolean args are no longer prompted by default** (matching the documented
  "presence in argv toggles them on"). Opt in with `prompt: true`.
- **`default` on a string arg is now applied silently** when the arg is not
  provided and not prompted, instead of pre-filling a prompt that still asked.

### Added

- `prompt?: boolean` on `ArgDef`: `true` always prompts, `false` never prompts
  (falls back to `default`/undefined); omitted keeps the new default behavior.
- `defineCLI({ strict?: boolean })` (default `true`). With `strict: false`,
  undeclared argv flags are accepted instead of rejected and surface on `ctx.rest`.
- `ctx._` (raw positional arguments, command token dropped) and `ctx.rest`
  (undeclared flags) on the action context, so actions can read argv the schema
  doesn't model — no more manual `process.argv` parsing.
- Interactive menu now pre-fills a leaf's args from argv when the argv command
  matches that leaf; pre-filled args are never prompted.
- Terminal state (cursor + raw mode) is now restored around every action in
  `loop` mode, so an action that opens its own prompts can't leave the terminal
  stuck for the next menu render.
- Config validation warns (`required_never_prompted`) when an arg is `required`
  with `prompt: false` and no `default` — it could never be filled interactively.

## [0.1.0] - 2026-06-01

### Changed

- Minimum supported Node bumped to **20** (`engines.node >= 20`). Node 18 is EOL since April 2025, and the test toolchain (Vitest 4 / Rolldown) requires `node:util.styleText`, which only exists on Node 20+. Build target is now `node20`.
- The `node-pty` E2E smoke test now runs only on Linux (skipped on Windows and macOS), where the native addon is reliable in CI. Unit and integration tests still run on all three OSes.
- Interactive menu now **loops** after each action (returns to the same menu level instead of exiting). The CLI terminates only on `Sair` at root or `Ctrl+C`. Opt out with `interactive: 'one-shot'` for wizard-style flows.
- Raw `err.message` is no longer printed to end-users when an action throws. The library shows a generic `theme.messages.error` string. Use `onActionError(err, ctx)` to handle errors programmatically.

### Added

- `interactive: 'loop' | 'one-shot'` field on `defineCLI` config.
- `onActionError` callback on `defineCLI` config — robust error API: receives `(err, { command, args })` so consumers can route errors to logging / telemetry / user-friendly messages without exposing internals.
- `defineCLI` and `defineMenuItem` with per-leaf inference of `ctx.args`.
- Config validation at load: duplicate commands, empty submenus, reserved commands, theme color/symbol checks, deep nesting warnings.
- Argv routing via `mri` with boolean / string / enum coercion and required-arg checks.
- Action context with `confirm`, `spinner`, and themed `log.{info,warn,error}` wrappers over `@clack/prompts`.
- TTY detection with three modes (`auto`, `interactive-only`, `argv-only`) and a plain-text help fallback for non-TTY.
- Custom `MenuSelectPrompt` over `@clack/core` with pluggable colors and symbols, scroll window for long lists, Unicode/ASCII fallback, and `NO_COLOR` support.
- Recursive menu navigation with Voltar / Sair entries and `isCancel` propagation.
- `run()` orchestrator with structured exit codes (0 / 1 / 2 / 130) and terminal restore on throw.
- Examples: `basic`, `with-spinner`, `argv-router`, `themed`.
- Smoke E2E tests via `node-pty` (skipped on Windows).
