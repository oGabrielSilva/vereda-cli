import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CLIConfig } from '../src/types.js';

const mocks = vi.hoisted(() => ({
  navigateMenu: vi.fn(),
  cancel: vi.fn(),
  confirm: vi.fn(),
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    message: vi.fn(),
    error: vi.fn(),
  })),
  updateSettings: vi.fn(),
  isCancel: vi.fn(() => false),
}));

vi.mock('../src/runtime/render-menu.js', () => ({
  navigateMenu: mocks.navigateMenu,
}));

vi.mock('@clack/prompts', () => ({
  cancel: mocks.cancel,
  confirm: mocks.confirm,
  spinner: mocks.spinner,
  updateSettings: mocks.updateSettings,
  isCancel: mocks.isCancel,
  text: vi.fn(),
  select: vi.fn(),
}));

const { run } = await import('../src/runtime/run.js');

const noop = () => undefined;

let stderr: ReturnType<typeof vi.spyOn>;
let stdout: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  Object.values(mocks).forEach((m) => {
    if (typeof m === 'function' && 'mockReset' in m) m.mockReset();
  });
  stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  stderr.mockRestore();
  stdout.mockRestore();
});

describe('run — config validation', () => {
  it('returns 2 with explanation on invalid config (duplicate command)', async () => {
    const cfg: CLIConfig = {
      name: 'mycli',
      menu: [
        { label: 'A', command: 'a', action: noop },
        { label: 'B', command: 'a', action: noop },
      ],
    };
    const code = await run(cfg, []);
    expect(code).toBe(2);
    const stderrCalls = stderr.mock.calls.map((c: unknown[]) => String(c[0])).join('');
    expect(stderrCalls).toContain('duplicate_command');
  });
});

describe('run — argv routing (argv-only mode forces this path even in TTY)', () => {
  it('runs matched leaf action and returns 0', async () => {
    const action = vi.fn();
    const cfg: CLIConfig = {
      name: 'mycli',
      mode: 'argv-only',
      menu: [{ label: 'Build', command: 'build', action }],
    };
    const code = await run(cfg, ['build']);
    expect(code).toBe(0);
    expect(action).toHaveBeenCalledOnce();
  });

  it('returns 1 on unknown command', async () => {
    const cfg: CLIConfig = {
      name: 'mycli',
      mode: 'argv-only',
      menu: [{ label: 'X', command: 'x', action: noop }],
    };
    const code = await run(cfg, ['bogus']);
    expect(code).toBe(1);
  });

  it('returns 1 on arg error (required missing)', async () => {
    const cfg: CLIConfig = {
      name: 'mycli',
      mode: 'argv-only',
      menu: [
        {
          label: 'Convert',
          command: 'convert',
          args: { file: { type: 'string', required: true } },
          action: noop,
        },
      ],
    };
    const code = await run(cfg, ['convert']);
    expect(code).toBe(1);
    const stderrCalls = stderr.mock.calls.map((c: unknown[]) => String(c[0])).join('');
    expect(stderrCalls).toContain('obrigatório');
  });

  it('prints help and returns 0 on empty argv (argv-only mode)', async () => {
    const cfg: CLIConfig = {
      name: 'mycli',
      mode: 'argv-only',
      menu: [{ label: 'X', command: 'x', action: noop }],
    };
    const code = await run(cfg, []);
    expect(code).toBe(0);
    const stdoutCalls = stdout.mock.calls.map((c: unknown[]) => String(c[0])).join('');
    expect(stdoutCalls).toContain('Uso: mycli');
  });
});

describe('run — interactive-only without TTY', () => {
  it('returns 2 with TTY error', async () => {
    const cfg: CLIConfig = {
      name: 'mycli',
      mode: 'interactive-only',
      menu: [{ label: 'X', command: 'x', action: noop }],
    };
    // process.stdin.isTTY likely false in vitest environment
    const code = await run(cfg, []);
    expect(code).toBe(2);
    const stderrCalls = stderr.mock.calls.map((c: unknown[]) => String(c[0])).join('');
    expect(stderrCalls).toContain('TTY');
  });
});

describe('run — interactive menu mode', () => {
  it('returns 130 when navigateMenu resolves cancelled', async () => {
    const cfg: CLIConfig = {
      name: 'mycli',
      mode: 'interactive-only',
      menu: [{ label: 'X', command: 'x', action: noop }],
    };
    // Force interactive: stub process.stdin.isTTY and process.stdout.isTTY
    const origStdin = process.stdin.isTTY;
    const origStdout = process.stdout.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

    mocks.navigateMenu.mockResolvedValueOnce({ kind: 'cancelled' });
    const code = await run(cfg, []);

    expect(code).toBe(130);
    expect(mocks.cancel).toHaveBeenCalled();

    Object.defineProperty(process.stdin, 'isTTY', { value: origStdin, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: origStdout, configurable: true });
  });

  it('returns 0 when navigateMenu resolves completed', async () => {
    const cfg: CLIConfig = {
      name: 'mycli',
      mode: 'interactive-only',
      menu: [{ label: 'X', command: 'x', action: noop }],
    };
    const origStdin = process.stdin.isTTY;
    const origStdout = process.stdout.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

    mocks.navigateMenu.mockResolvedValueOnce({ kind: 'completed', command: 'x' });
    const code = await run(cfg, []);

    expect(code).toBe(0);

    Object.defineProperty(process.stdin, 'isTTY', { value: origStdin, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: origStdout, configurable: true });
  });
});

describe('run — action throws', () => {
  it('returns 1 and writes error to stderr when action throws', async () => {
    const cfg: CLIConfig = {
      name: 'mycli',
      mode: 'argv-only',
      menu: [
        {
          label: 'Boom',
          command: 'boom',
          action: () => {
            throw new Error('kaboom');
          },
        },
      ],
    };
    const code = await run(cfg, ['boom']);
    expect(code).toBe(1);
    const stderrCalls = stderr.mock.calls.map((c: unknown[]) => String(c[0])).join('');
    expect(stderrCalls).toContain('kaboom');
  });
});

describe('run — theme is applied (updateSettings called)', () => {
  it('forwards messages and aliases when theme is set', async () => {
    const cfg: CLIConfig = {
      name: 'mycli',
      mode: 'argv-only',
      theme: { messages: { cancel: 'Pare!' } },
      menu: [{ label: 'X', command: 'x', action: noop }],
    };
    await run(cfg, ['x']);
    expect(mocks.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ messages: { cancel: 'Pare!' } }),
    );
  });
});
