# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Minimum supported Node bumped to **20** (`engines.node >= 20`). Node 18 is EOL since April 2025, and the test toolchain (Vitest 4 / Rolldown) requires `node:util.styleText`, which only exists on Node 20+. Build target is now `node20`.
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
