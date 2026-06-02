# vereda-cli

> Declarative interactive CLI builder for Node. Define a menu config; get a navigable arrow-key UI with safe action execution, argv routing, and a typed action context.

Built on top of [`@clack/core`](https://github.com/bombshell-dev/clack). Adds:

- declarative menu tree via `defineCLI({ menu })` with per-leaf type inference for `ctx.args`
- argv routing via [`mri`](https://github.com/lukeed/mri) so the same config works in CI and one-shot scripts
- safe action execution: `isCancel` propagation, terminal restore on throw, config validation at load
- pluggable theme (colors, symbols, messages) via a small custom renderer over `@clack/core`
- ESM-only, Node 20+, three runtime dependencies

## Install

```sh
yarn add vereda-cli
# or
npm install vereda-cli
```

## Quickstart

```ts
// cli-config.ts
import { defineCLI, defineMenuItem } from 'vereda-cli';

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
import { run } from 'vereda-cli';

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
  _: readonly string[];                 // raw positionals (command token dropped)
  rest: Readonly<Record<string, unknown>>; // undeclared flags (only when strict: false)
  confirm(opts: { message: string; initialValue?: boolean }): Promise<boolean>;
  text(opts: {
    message: string;
    placeholder?: string;
    initialValue?: string;
    defaultValue?: string;
    validate?: (value: string) => string | void;
  }): Promise<string | symbol>;
  select<T>(opts: {
    message: string;
    options: { value: T; label: string; hint?: string }[];
    initialValue?: T;
    maxItems?: number;
  }): Promise<T | symbol>;
  multiselect<T>(opts: {
    message: string;
    options: { value: T; label: string; hint?: string }[];
    initialValues?: T[];
    required?: boolean;
    maxItems?: number;
  }): Promise<T[] | symbol>;
  isCancel(value: unknown): value is symbol;
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

`text` / `select` / `multiselect` run through vereda's own `@clack/prompts` instance, so theme `messages` / `keyAliases` carry over — no need to import `@clack/prompts` yourself. They return either the value **or** a cancel sentinel (Ctrl+C / Esc); check it with `ctx.isCancel`:

```ts
action: async (ctx) => {
  const name = await ctx.text({ message: 'Project name?' });
  if (ctx.isCancel(name)) return; // name is now narrowed away
  ctx.log.info(`Hello ${name}`);
},
```

## Args

A leaf declares typed args via `args`. How an arg behaves in each entry point:

```ts
args: {
  path:   { type: 'string' },                          // optional
  file:   { type: 'string', required: true },          // required
  env:    { type: 'enum', options: ['prod', 'dev'] },
  watch:  { type: 'boolean' },                         // toggled by --watch
  region: { type: 'string', default: 'us-east-1' },    // silent default
  token:  { type: 'string', required: true, prompt: false }, // never prompted
}
```

- **From argv** (`mycli file=... --watch`): values are coerced against the schema. A missing `required` arg is an error; a missing optional `string` with a `default` falls back to it.
- **In the interactive menu**: an arg is prompted **only when it is `required` and not already supplied via argv**. Optional args and booleans are not prompted by default.
  - `prompt: true` — always prompt (unless already provided via argv).
  - `prompt: false` — never prompt; fall back to `default` (string) or leave undefined.
  - A `string` `default` is applied **silently** (no prompt) when the arg is optional, absent and not prompted.
- When argv targets a leaf (same `command`), the menu pre-fills that leaf's declared args from argv and skips prompting them. This is the fix for "accepted via argv but never prompted": declare the arg optional and pass `--arg` — it's used, never asked.

### `strict` and raw argv

```ts
defineCLI({ strict: false, /* … */ });
```

By default (`strict: true`) a flag not declared in the matched leaf's `args` is an error. With `strict: false`, undeclared flags are accepted and exposed on `ctx.rest`; raw positionals are always on `ctx._` (after the command token). Use them to read argv the schema doesn't model, instead of touching `process.argv` yourself.

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

|                                  | vereda-cli | citty | cac    | @clack/prompts |
| -------------------------------- | ---------- | ----- | ------ | -------------- |
| declarative config               | ✔      | ✔     | ✔      | ✘ (imperative) |
| interactive navigable menu       | ✔      | ✘     | ✘      | ✔ (manual)     |
| argv routing                     | ✔      | ✔     | ✔      | ✘              |
| per-leaf `ctx.args` inference    | ✔      | ✔     | partial| n/a            |
| pluggable theme                  | ✔      | ✘     | ✘      | partial        |
| safe TTY/non-TTY fallback        | ✔      | ✘     | ✘      | ✘              |
| zero-config CI mode              | ✔      | ✘     | ✘      | ✘              |
| ESM-only, < 5 runtime deps       | ✔      | ✔     | ✔      | ✘              |

vereda-cli is the only one that bundles config → menu → argv → safe execution as one product.

## Limitations

- Theme covers the menu select prompt. The custom colors/symbols apply to the navigable menu; the `ctx` prompts (`text` / `select` / `multiselect` / `confirm`) and arg-collection prompts use `@clack/prompts` rendering — only `messages` and `keyAliases` cross over via `updateSettings`.
- No auto-generated `--help` per leaf; the lib prints a flat command list in non-TTY contexts.
- Positional args can be read raw via `ctx._`, but cannot yet be *declared* (`positional: true`) — planned.
- Single-command-string identifiers (`deploy`, `config:edit`). No nested namespacing like `aws s3 cp`.
- The optional `node-pty` dependency drives the E2E smoke tests; it is reliable in CI only on Linux, so those tests run there and are skipped on Windows and macOS. Unit and integration tests cover behavior on all platforms.

## License

MIT
