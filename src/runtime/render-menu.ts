import { confirm, isCancel, select, text } from '@clack/prompts';
import { isMenuCancel, runMenuSelect, type MenuOption } from '../renderer/menu-select.js';
import type { ResolvedTheme } from '../theme/apply.js';
import type { ArgDef, ArgsSchema, MenuLeaf, MenuNode, ThemeConfig } from '../types.js';
import { createCtx } from './action-ctx.js';

export type NavigationResult =
  | { readonly kind: 'completed'; readonly command: string }
  | { readonly kind: 'exited' }
  | { readonly kind: 'cancelled' };

type LevelResult =
  | { readonly kind: 'completed'; readonly command: string }
  | { readonly kind: 'exited' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'back' };

const BACK = Symbol('vereda.back');
const EXIT = Symbol('vereda.exit');

type PickValue = MenuNode | typeof BACK | typeof EXIT;

export interface NavigateMenuOptions {
  readonly menu: readonly MenuNode[];
  readonly theme: ResolvedTheme;
  readonly themeConfig?: ThemeConfig;
  readonly rootMessage?: string;
}

export async function navigateMenu(opts: NavigateMenuOptions): Promise<NavigationResult> {
  const result = await navigateLevel(opts.menu, opts, 0);
  if (result.kind === 'back') return { kind: 'exited' };
  return result;
}

async function navigateLevel(
  level: readonly MenuNode[],
  opts: NavigateMenuOptions,
  depth: number,
): Promise<LevelResult> {
  while (true) {
    const options = buildOptions(level, depth);
    const picked = await runMenuSelect<PickValue>({
      options,
      message: depth === 0 ? opts.rootMessage ?? 'Menu principal' : 'Submenu',
      theme: opts.theme,
    });

    if (isMenuCancel(picked)) return { kind: 'cancelled' };
    if (picked === BACK) return { kind: 'back' };
    if (picked === EXIT) return { kind: 'exited' };

    const node = picked;
    if ('children' in node) {
      const inner = await navigateLevel(node.children, opts, depth + 1);
      if (inner.kind === 'back') continue;
      return inner;
    }

    const collected = await collectArgs(node);
    if (collected === 'cancelled') return { kind: 'cancelled' };

    const cliCtx = createCtx({
      command: node.command,
      args: collected,
      ...(opts.themeConfig !== undefined ? { theme: opts.themeConfig } : {}),
    });
    await node.action(cliCtx);
    return { kind: 'completed', command: node.command };
  }
}

function buildOptions(level: readonly MenuNode[], depth: number): MenuOption<PickValue>[] {
  const opts: MenuOption<PickValue>[] = level.map((n) => {
    const opt: MenuOption<PickValue> = { value: n, label: n.label };
    if (n.hint !== undefined) {
      return { ...opt, hint: n.hint };
    }
    return opt;
  });

  if (depth > 0) {
    opts.push({ value: BACK, label: '↩ Voltar' });
  } else {
    opts.push({ value: EXIT, label: '✖ Sair' });
  }
  return opts;
}

type ArgPromptResult =
  | { readonly kind: 'ok'; readonly value: unknown }
  | { readonly kind: 'cancelled' };

async function collectArgs(
  leaf: MenuLeaf<ArgsSchema>,
): Promise<Record<string, unknown> | 'cancelled'> {
  if (leaf.args === undefined) return {};
  const collected: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(leaf.args)) {
    const result = await promptForArg(name, def);
    if (result.kind === 'cancelled') return 'cancelled';
    if (result.value !== undefined) collected[name] = result.value;
  }
  return collected;
}

async function promptForArg(name: string, def: ArgDef): Promise<ArgPromptResult> {
  switch (def.type) {
    case 'boolean': {
      const r = await confirm({ message: name });
      if (isCancel(r)) return { kind: 'cancelled' };
      return { kind: 'ok', value: r };
    }
    case 'string': {
      const isRequired = def.required === true;
      const baseOpts: Parameters<typeof text>[0] = { message: name };
      if (def.default !== undefined) baseOpts.initialValue = def.default;
      const r = await text(baseOpts);
      if (isCancel(r)) return { kind: 'cancelled' };
      if (typeof r === 'string' && r.length === 0 && isRequired) return { kind: 'cancelled' };
      return { kind: 'ok', value: r };
    }
    case 'enum': {
      const r = await select({
        message: name,
        options: def.options.map((o) => ({ value: o, label: o })),
      });
      if (isCancel(r)) return { kind: 'cancelled' };
      return { kind: 'ok', value: r };
    }
  }
}
