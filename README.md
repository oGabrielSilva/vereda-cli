# vereda

> Declarative interactive CLI builder for Node. Define a menu config; get a navigable arrow-key UI with safe action execution, argv routing, and a typed action context.

Built on top of [`@clack/core`](https://github.com/bombshell-dev/clack). Adds:

- declarative menu tree via `defineCLI({ menu })` with per-leaf type inference for `ctx.args`
- argv routing via [`mri`](https://github.com/lukeed/mri) so the same config works in CI and one-shot scripts
- safe action execution: `isCancel` propagation, terminal restore on throw, config validation at load
- pluggable theme (colors, symbols, messages) via a small custom renderer over `@clack/core`
- ESM-only, Node 20+, three runtime dependencies

## Install

```sh
yarn add vereda
# or
npm install vereda
```

## Quickstart

```ts
// cli-config.ts
import { defineCLI, defineMenuItem } from 'vereda';

export default defineCLI({
  name: 'mycli',
  menu: [
    defineMenuItem({
      label: 'Build',
      command: 'build',
      args: { watch: { type: 'boolean' } },
      action: async (ctx) => {
        //                ^? ctx.args.watch: boolean | undefined
        const s = ctx.spinner('Compiling...');
        try {
          await build(ctx.args.watch);
          s.success('Done.');
        } catch (e) {
          s.error('Failed.');
          throw e;
        }
      },
    }),
    {
      label: 'Settings',
      children: [
        defineMenuItem({
          label: 'Edit config',
          command: 'config:edit',
          action: (ctx) => editConfig(),
        }),
      ],
    },
  ],
});
```

```ts
// bin.ts
#!/usr/bin/env node
import config from './cli-config.js';
import { run } from 'vereda';

process.exit(await run(config, process.argv.slice(2)));
```

Run it:

```sh
$ mycli              # interactive menu
$ mycli build        # routes directly, no menu
$ mycli build --watch
```

## API

### `defineCLI(config)`

Identity helper with `const` generic — preserves literal types in `name`, `mode`, `theme`, and the menu shape without `as const` at the call site.

### `defineMenuItem(leaf)`

Opt-in helper for **per-leaf inference** of `ctx.args`. Wrap a leaf node to get the action's `ctx.args` typed against the declared `args` schema:

```ts
defineMenuItem({
  command: 'deploy',
  args: {
    env: { type: 'enum', options: ['prod', 'staging'], required: true },
    dry: { type: 'boolean' },
  },
  action: (ctx) => {
    ctx.args.env; // 'prod' | 'staging'
    ctx.args.dry; // boolean | undefined
  },
});
```

Plain (unwrapped) leaves work too, but their `ctx.args` falls back to the wide schema type.

### `run(config, argv): Promise<number>`

Validates the config, applies the theme, picks a mode, executes, and returns an exit code:

| Code | Meaning                                  |
| ---- | ---------------------------------------- |
| `0`  | Action ran (or help printed)             |
| `1`  | Action threw, unknown command, arg error |
| `2`  | Config invalid or TTY required           |
| `130`| User cancelled (Ctrl+C)                  |

### `interactive: 'loop' | 'one-shot'`

Controls what happens after an action finishes in the menu. Default `'loop'`.

- **`'loop'`** (default) — the menu redraws and waits for the next pick; the only ways to exit are `Sair` at root or `Ctrl+C`. Use this for dashboards / repl-style helpers.
- **`'one-shot'`** — the CLI terminates after the first action (success or failure). Use this for wizards that do one thing and exit.

```ts
defineCLI({ interactive: 'one-shot', /* … */ });
```

### `onActionError(error, ctx)`

The library **never prints raw error messages to end-users**. When an action throws:

- If `onActionError` is provided, it is called with the original error and `{ command, args }`. You decide whether to log, retry, send to telemetry, or show a friendly message via `ctx.log`.
- If not provided, the library prints `theme.messages.error` (a generic, translatable string — defaults to `"Algo deu errado."`) and continues per `interactive` mode.

```ts
defineCLI({
  onActionError: (err, { command }) => {
    log.warn(`Comando ${command} falhou; tente de novo.`);
    sendToTelemetry(err);
  },
  /* … */
});
```

In loop mode, the menu continues; in one-shot mode (or argv routing), the CLI exits with code `1`.

### `ctx`

Each action receives a context:

```ts
type ActionContext<TArgs> = {
  args: InferArgs<TArgs>;     // typed against the leaf's args schema
  command: string;
  confirm(opts: { message: string; initialValue?: boolean }): Promise<boolean>;
  spinner(message?: string): {
    update(msg: string): void;
    success(msg?: string): void;
    error(msg?: string): void;
    stop(): void;
  };
  log: {
    info(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
  };
};
```

## Modes

```ts
defineCLI({ mode: 'auto', /* … */ });             // default
defineCLI({ mode: 'interactive-only', /* … */ }); // refuse non-TTY
defineCLI({ mode: 'argv-only', /* … */ });        // never open the menu
```

| Mode               | TTY + no argv | TTY + argv  | non-TTY + no argv | non-TTY + argv |
| ------------------ | ------------- | ----------- | ----------------- | -------------- |
| `auto`             | menu          | menu        | plain help        | route argv     |
| `interactive-only` | menu          | menu        | exit 2 (TTY req.) | exit 2         |
| `argv-only`        | plain help    | route argv  | plain help        | route argv     |

Non-TTY detection respects `CI=1` and `FORCE_NO_TTY=1`.

## Theme

```ts
defineCLI({
  theme: {
    messages: { cancel: 'Operação cancelada.', error: 'Algo deu errado.' },
    keyAliases: { w: 'up', s: 'down' },
    colors: {
      primary: 'cyan',                        // named ANSI color
      success: 'green',
      error: 'red',
      warning: 'yellow',
      dimmed: (text) => `\x1b[2;3m${text}\x1b[0m`,  // or a custom function
    },
    symbols: {
      active: '▸',
      inactive: '·',
      bar: '│',
      barStart: '╭',
      barEnd: '╰',
      success: '✔',
      error: '✖',
    },
  },
  /* … */
});
```

`colors.*` accepts either a named ANSI color (`black | red | green | yellow | blue | magenta | cyan | white | gray`) or a `(text: string) => string` function. `NO_COLOR=1` short-circuits all colors to identity. `VEREDA_NO_UNICODE=1` or `TERM=dumb` falls back symbols to ASCII.

`messages` and `keyAliases` flow to `@clack/prompts.updateSettings`, so secondary prompts (text / confirm / select-of-enum used for arg collection) pick up the same overrides.

## Comparison

|                                  | vereda | citty | cac    | @clack/prompts |
| -------------------------------- | ------ | ----- | ------ | -------------- |
| declarative config               | ✔      | ✔     | ✔      | ✘ (imperative) |
| interactive navigable menu       | ✔      | ✘     | ✘      | ✔ (manual)     |
| argv routing                     | ✔      | ✔     | ✔      | ✘              |
| per-leaf `ctx.args` inference    | ✔      | ✔     | partial| n/a            |
| pluggable theme                  | ✔      | ✘     | ✘      | partial        |
| safe TTY/non-TTY fallback        | ✔      | ✘     | ✘      | ✘              |
| zero-config CI mode              | ✔      | ✘     | ✘      | ✘              |
| ESM-only, < 5 runtime deps       | ✔      | ✔     | ✔      | ✘              |

vereda is the only one that bundles config → menu → argv → safe execution as one product.

## Limitations (v0.1)

- Theme covers the menu select prompt. Secondary prompts for arg collection (text, confirm, select-of-enum) use `@clack/prompts` defaults — only `messages` and `keyAliases` cross over via `updateSettings`.
- No auto-generated `--help` per leaf; the lib prints a flat command list in non-TTY contexts.
- Single-command-string identifiers (`deploy`, `config:edit`). No nested namespacing like `aws s3 cp`.
- Optional `node-pty` dependency for E2E tests is unreliable on Windows and is skipped there.

## License

MIT
