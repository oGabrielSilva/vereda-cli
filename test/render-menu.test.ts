import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuNode } from '../src/types.js';

const cancelSym = Symbol.for('vereda.cancel');

const mocks = vi.hoisted(() => ({
  runMenuSelect: vi.fn(),
  isMenuCancel: vi.fn((v: unknown) => v === Symbol.for('vereda.cancel')),
  confirm: vi.fn(),
  text: vi.fn(),
  select: vi.fn(),
  isCancel: vi.fn((v: unknown) => v === Symbol.for('vereda.cancel')),
}));

vi.mock('../src/renderer/menu-select.js', () => ({
  runMenuSelect: mocks.runMenuSelect,
  isMenuCancel: mocks.isMenuCancel,
}));

vi.mock('@clack/prompts', () => ({
  confirm: mocks.confirm,
  text: mocks.text,
  select: mocks.select,
  isCancel: mocks.isCancel,
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    message: vi.fn(),
    error: vi.fn(),
  })),
}));

const { navigateMenu } = await import('../src/runtime/render-menu.js');
const { applyTheme } = await import('../src/theme/apply.js');

const baseTheme = applyTheme(undefined);

beforeEach(() => {
  Object.values(mocks).forEach((m) => {
    if ('mockReset' in m) m.mockReset();
  });
  mocks.isMenuCancel.mockImplementation((v: unknown) => v === cancelSym);
  mocks.isCancel.mockImplementation((v: unknown) => v === cancelSym);
});

describe('navigateMenu — root level', () => {
  it('runs the action when user picks a leaf', async () => {
    const action = vi.fn();
    const leaf: MenuNode = { label: 'Build', command: 'build', action };

    // First call returns the leaf node
    mocks.runMenuSelect.mockResolvedValueOnce(leaf);

    const result = await navigateMenu({ menu: [leaf], theme: baseTheme });

    expect(result).toEqual({ kind: 'completed', command: 'build' });
    expect(action).toHaveBeenCalledOnce();
  });

  it('returns "exited" when user picks the Sair option', async () => {
    const leaf: MenuNode = { label: 'X', command: 'x', action: vi.fn() };

    // mock returns the EXIT sentinel by capturing the last option's value
    mocks.runMenuSelect.mockImplementationOnce(({ options }: { options: { value: unknown }[] }) => {
      const exit = options[options.length - 1];
      return Promise.resolve(exit?.value);
    });

    const result = await navigateMenu({ menu: [leaf], theme: baseTheme });
    expect(result).toEqual({ kind: 'exited' });
  });

  it('returns "cancelled" when user cancels at root', async () => {
    const leaf: MenuNode = { label: 'X', command: 'x', action: vi.fn() };
    mocks.runMenuSelect.mockResolvedValueOnce(cancelSym);
    const result = await navigateMenu({ menu: [leaf], theme: baseTheme });
    expect(result).toEqual({ kind: 'cancelled' });
  });
});

describe('navigateMenu — submenu navigation', () => {
  it('descends into branch then runs the inner leaf', async () => {
    const innerAction = vi.fn();
    const innerLeaf: MenuNode = {
      label: 'Edit',
      command: 'config:edit',
      action: innerAction,
    };
    const branch: MenuNode = { label: 'Settings', children: [innerLeaf] };

    mocks.runMenuSelect
      .mockResolvedValueOnce(branch) // root: user picks branch
      .mockResolvedValueOnce(innerLeaf); // submenu: user picks inner leaf

    const result = await navigateMenu({ menu: [branch], theme: baseTheme });

    expect(result).toEqual({ kind: 'completed', command: 'config:edit' });
    expect(innerAction).toHaveBeenCalledOnce();
  });

  it('Voltar from submenu returns to root and continues', async () => {
    const action = vi.fn();
    const leafA: MenuNode = { label: 'A', command: 'a', action };
    const leafB: MenuNode = { label: 'B', command: 'b', action: vi.fn() };
    const branch: MenuNode = { label: 'Group', children: [leafB] };

    let call = 0;
    mocks.runMenuSelect.mockImplementation(({ options }: { options: { value: unknown }[] }) => {
      call++;
      switch (call) {
        case 1:
          return Promise.resolve(branch); // root: pick the branch
        case 2: {
          // submenu: pick the "Voltar" option (the last one, since depth>0)
          const back = options[options.length - 1];
          return Promise.resolve(back?.value);
        }
        case 3:
          return Promise.resolve(leafA); // root: pick leafA
        default:
          throw new Error('unexpected call');
      }
    });

    const result = await navigateMenu({ menu: [branch, leafA], theme: baseTheme });
    expect(result).toEqual({ kind: 'completed', command: 'a' });
    expect(action).toHaveBeenCalledOnce();
  });

  it('cancellation in submenu propagates to root as cancelled', async () => {
    const leafA: MenuNode = { label: 'A', command: 'a', action: vi.fn() };
    const branch: MenuNode = { label: 'Group', children: [leafA] };

    mocks.runMenuSelect.mockResolvedValueOnce(branch).mockResolvedValueOnce(cancelSym);
    const result = await navigateMenu({ menu: [branch], theme: baseTheme });
    expect(result).toEqual({ kind: 'cancelled' });
  });
});

describe('navigateMenu — args collection', () => {
  it('collects boolean arg before running action', async () => {
    const action = vi.fn();
    const leaf: MenuNode = {
      label: 'Build',
      command: 'build',
      args: { watch: { type: 'boolean' } },
      action,
    };

    mocks.runMenuSelect.mockResolvedValueOnce(leaf);
    mocks.confirm.mockResolvedValueOnce(true);

    const result = await navigateMenu({ menu: [leaf], theme: baseTheme });

    expect(result.kind).toBe('completed');
    expect(action).toHaveBeenCalledOnce();
    const ctx = action.mock.calls[0]?.[0] as { args: Record<string, unknown> };
    expect(ctx.args).toEqual({ watch: true });
  });

  it('collects required string arg', async () => {
    const action = vi.fn();
    const leaf: MenuNode = {
      label: 'Convert',
      command: 'convert',
      args: { file: { type: 'string', required: true } },
      action,
    };

    mocks.runMenuSelect.mockResolvedValueOnce(leaf);
    mocks.text.mockResolvedValueOnce('data.json');

    const result = await navigateMenu({ menu: [leaf], theme: baseTheme });

    expect(result.kind).toBe('completed');
    const ctx = action.mock.calls[0]?.[0] as { args: Record<string, unknown> };
    expect(ctx.args).toEqual({ file: 'data.json' });
  });

  it('cancels when user aborts arg prompt', async () => {
    const action = vi.fn();
    const leaf: MenuNode = {
      label: 'X',
      command: 'x',
      args: { foo: { type: 'string' } },
      action,
    };

    mocks.runMenuSelect.mockResolvedValueOnce(leaf);
    mocks.text.mockResolvedValueOnce(cancelSym);

    const result = await navigateMenu({ menu: [leaf], theme: baseTheme });

    expect(result).toEqual({ kind: 'cancelled' });
    expect(action).not.toHaveBeenCalled();
  });

  it('collects enum arg via select', async () => {
    const action = vi.fn();
    const leaf: MenuNode = {
      label: 'Deploy',
      command: 'deploy',
      args: { env: { type: 'enum', options: ['prod', 'staging'], required: true } },
      action,
    };

    mocks.runMenuSelect.mockResolvedValueOnce(leaf);
    mocks.select.mockResolvedValueOnce('prod');

    await navigateMenu({ menu: [leaf], theme: baseTheme });

    const ctx = action.mock.calls[0]?.[0] as { args: Record<string, unknown> };
    expect(ctx.args).toEqual({ env: 'prod' });
  });

  it('treats empty required string as cancellation', async () => {
    const action = vi.fn();
    const leaf: MenuNode = {
      label: 'X',
      command: 'x',
      args: { file: { type: 'string', required: true } },
      action,
    };

    mocks.runMenuSelect.mockResolvedValueOnce(leaf);
    mocks.text.mockResolvedValueOnce('');

    const result = await navigateMenu({ menu: [leaf], theme: baseTheme });
    expect(result).toEqual({ kind: 'cancelled' });
    expect(action).not.toHaveBeenCalled();
  });
});
