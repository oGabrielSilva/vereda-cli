import { describe, expectTypeOf, it } from 'vitest';
import { defineCLI, defineMenuItem } from '../src/define-cli.js';
import type { ActionContext, MenuLeaf } from '../src/types.js';

describe('defineCLI literal preservation', () => {
  it('preserves name and mode literal types', () => {
    const cfg = defineCLI({
      name: 'mycli',
      mode: 'auto',
      menu: [],
    });

    expectTypeOf(cfg.name).toEqualTypeOf<'mycli'>();
    expectTypeOf(cfg.mode).toEqualTypeOf<'auto'>();
  });

  it('preserves nested theme literals', () => {
    const cfg = defineCLI({
      name: 'x',
      theme: { messages: { cancel: 'Cancelado.' } },
      menu: [],
    });

    expectTypeOf(cfg.theme).toExtend<{ messages: { cancel: 'Cancelado.' } } | undefined>();
  });

  it('accepts a menu of plain leaves and branches', () => {
    const cfg = defineCLI({
      name: 'x',
      menu: [
        defineMenuItem({
          label: 'Leaf',
          command: 'leaf',
          action: () => undefined,
        }),
        {
          label: 'Branch',
          children: [
            defineMenuItem({
              label: 'Inner',
              command: 'branch:inner',
              action: () => undefined,
            }),
          ],
        },
      ],
    });

    expectTypeOf(cfg.menu).toExtend<readonly unknown[]>();
  });
});

describe('defineMenuItem args inference', () => {
  it('infers boolean arg as boolean | undefined (optional by default)', () => {
    defineMenuItem({
      label: 'Build',
      command: 'build',
      args: { watch: { type: 'boolean' } },
      action: (ctx) => {
        expectTypeOf(ctx.args.watch).toEqualTypeOf<boolean | undefined>();
        expectTypeOf(ctx.command).toEqualTypeOf<string>();
      },
    });
  });

  it('infers required string arg as string (no undefined)', () => {
    defineMenuItem({
      label: 'Convert',
      command: 'convert',
      args: { file: { type: 'string', required: true } },
      action: (ctx) => {
        expectTypeOf(ctx.args.file).toEqualTypeOf<string>();
      },
    });
  });

  it('infers optional string arg as string | undefined', () => {
    defineMenuItem({
      label: 'Convert',
      command: 'convert',
      args: { file: { type: 'string' } },
      action: (ctx) => {
        expectTypeOf(ctx.args.file).toEqualTypeOf<string | undefined>();
      },
    });
  });

  it('infers enum arg as union of literal options', () => {
    defineMenuItem({
      label: 'Convert',
      command: 'convert',
      args: {
        format: { type: 'enum', options: ['json', 'yaml', 'toml'], required: true },
      },
      action: (ctx) => {
        expectTypeOf(ctx.args.format).toEqualTypeOf<'json' | 'yaml' | 'toml'>();
      },
    });
  });

  it('infers optional enum arg as union | undefined', () => {
    defineMenuItem({
      label: 'Convert',
      command: 'convert',
      args: {
        format: { type: 'enum', options: ['json', 'yaml'] },
      },
      action: (ctx) => {
        expectTypeOf(ctx.args.format).toEqualTypeOf<'json' | 'yaml' | undefined>();
      },
    });
  });

  it('infers mixed args (required + optional) correctly', () => {
    defineMenuItem({
      label: 'Deploy',
      command: 'deploy',
      args: {
        env: { type: 'enum', options: ['prod', 'staging'], required: true },
        dry: { type: 'boolean' },
        tag: { type: 'string' },
      },
      action: (ctx) => {
        expectTypeOf(ctx.args.env).toEqualTypeOf<'prod' | 'staging'>();
        expectTypeOf(ctx.args.dry).toEqualTypeOf<boolean | undefined>();
        expectTypeOf(ctx.args.tag).toEqualTypeOf<string | undefined>();
      },
    });
  });

  it('handles leaves with no args', () => {
    defineMenuItem({
      label: 'Status',
      command: 'status',
      action: (ctx) => {
        expectTypeOf(ctx.command).toEqualTypeOf<string>();
      },
    });
  });
});

describe('ActionContext public surface', () => {
  it('exposes confirm, spinner, log, args, command, _ and rest', () => {
    type Ctx = ActionContext<{ flag: { type: 'boolean' } }>;

    expectTypeOf<Ctx>().toHaveProperty('confirm');
    expectTypeOf<Ctx>().toHaveProperty('spinner');
    expectTypeOf<Ctx>().toHaveProperty('log');
    expectTypeOf<Ctx>().toHaveProperty('args');
    expectTypeOf<Ctx>().toHaveProperty('command');
    expectTypeOf<Ctx>().toHaveProperty('_');
    expectTypeOf<Ctx>().toHaveProperty('rest');
  });

  it('types _ as readonly string[] and rest as a record', () => {
    type Ctx = ActionContext;
    expectTypeOf<Ctx['_']>().toEqualTypeOf<readonly string[]>();
    expectTypeOf<Ctx['rest']>().toEqualTypeOf<Readonly<Record<string, unknown>>>();
  });

  it('exposes text, select, multiselect and isCancel', () => {
    type Ctx = ActionContext;
    expectTypeOf<Ctx>().toHaveProperty('text');
    expectTypeOf<Ctx>().toHaveProperty('select');
    expectTypeOf<Ctx>().toHaveProperty('multiselect');
    expectTypeOf<Ctx>().toHaveProperty('isCancel');
  });

  it('infers select/multiselect value types from options generic', () => {
    defineMenuItem({
      label: 'X',
      command: 'x',
      action: async (ctx) => {
        const one = await ctx.select({
          message: 'pick',
          options: [{ value: 1 as const, label: 'one' }],
        });
        expectTypeOf(one).toEqualTypeOf<1 | symbol>();

        const many = await ctx.multiselect({
          message: 'pick',
          options: [{ value: 'a' as const, label: 'A' }],
        });
        expectTypeOf(many).toEqualTypeOf<'a'[] | symbol>();

        const t = await ctx.text({ message: 'name' });
        expectTypeOf(t).toEqualTypeOf<string | symbol>();
      },
    });
  });

  it('accepts prompt on ArgDef without changing ctx.args inference', () => {
    defineMenuItem({
      label: 'X',
      command: 'x',
      args: {
        path: { type: 'string', prompt: false },
        watch: { type: 'boolean', prompt: true },
      },
      action: (ctx) => {
        expectTypeOf(ctx.args.path).toEqualTypeOf<string | undefined>();
        expectTypeOf(ctx.args.watch).toEqualTypeOf<boolean | undefined>();
      },
    });
  });

  it('spinner returns an object with update, success, error, stop', () => {
    type Ctx = ActionContext;
    type Spinner = ReturnType<Ctx['spinner']>;

    expectTypeOf<Spinner>().toHaveProperty('update');
    expectTypeOf<Spinner>().toHaveProperty('success');
    expectTypeOf<Spinner>().toHaveProperty('error');
    expectTypeOf<Spinner>().toHaveProperty('stop');
  });
});

describe('MenuLeaf and MenuBranch shapes', () => {
  it('MenuLeaf requires command and action', () => {
    type Leaf = MenuLeaf<Record<string, never>>;

    expectTypeOf<Leaf>().toHaveProperty('command');
    expectTypeOf<Leaf>().toHaveProperty('action');
    expectTypeOf<Leaf>().toHaveProperty('label');
  });
});
