# vereda

> Declarative interactive CLI builder. Define a menu config, get a navigable arrow-key UI with safe action execution and argv routing.

Built on top of [`@clack/core`](https://github.com/bombshell-dev/clack) for raw input and state machine. Adds:

- declarative menu tree (`defineCLI({ menu })`) with type inference for action args
- argv routing via [`mri`](https://github.com/lukeed/mri) so the same config works in CI / scripts
- safe action execution: `isCancel` propagation, terminal restore on throw, config validation at load
- pluggable theme (colors, symbols, messages) over a small custom renderer
- ESM-only, Node 18+, zero runtime config

## Status

In active development. v0.1 in progress.

## Install

```sh
yarn add vereda
```

## Quickstart

```ts
// cli-config.ts
import { defineCLI } from 'vereda';

export default defineCLI({
  name: 'mycli',
  menu: [
    {
      label: 'Build',
      command: 'build',
      args: { watch: { type: 'boolean' } },
      action: async (ctx) => {
        const s = ctx.spinner('Compiling...');
        try {
          await build(ctx.args.watch);
          s.success('Done.');
        } catch (e) {
          s.error('Failed.');
          throw e;
        }
      },
    },
  ],
});
```

```ts
#!/usr/bin/env node
// bin.ts
import config from './cli-config.js';
import { run } from 'vereda/run';
process.exit(await run(config, process.argv.slice(2)));
```

## License

MIT
