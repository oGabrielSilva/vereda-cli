import { describe, expect, it } from 'vitest';

const skipReason = process.platform === 'win32' ? 'node-pty unreliable on win32' : '';

// node-pty is an optional dep; skip everything if it failed to install.
const ptyModule = await (async () => {
  if (skipReason !== '') return null;
  try {
    return await import('node-pty');
  } catch {
    return null;
  }
})();

const describeOrSkip = ptyModule === null ? describe.skip : describe;

// The pty gives us a real TTY, so we want the interactive menu path. Strip the
// CI / FORCE_NO_TTY flags the runner injects, otherwise the lib (correctly)
// detects a non-interactive environment and falls back to plain help text.
function interactiveEnv(): NodeJS.ProcessEnv {
  const { CI: _ci, FORCE_NO_TTY: _noTty, ...rest } = process.env;
  return rest;
}

describeOrSkip('e2e — interactive navigation (smoke)', () => {
  const pty = ptyModule;

  it('selects the second item with one DOWN press then ENTER and runs its action', async () => {
    if (pty === null) return;

    const term = pty.spawn(
      process.execPath,
      ['--import', 'tsx', 'examples/basic.ts'],
      {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: process.cwd(),
        env: interactiveEnv(),
      },
    );

    let output = '';
    term.onData((data) => {
      output += data;
    });

    const finished = new Promise<void>((resolve) => {
      term.onExit(() => resolve());
    });

    // Wait for first render
    await new Promise((r) => setTimeout(r, 700));

    // Navigate down once (cursor → Test) and confirm
    term.write('\x1b[B');
    await new Promise((r) => setTimeout(r, 200));
    term.write('\r');

    // Give the action a moment, then ensure exit
    await new Promise((r) => setTimeout(r, 500));
    term.kill();
    await finished;

    expect(output).toContain('Running tests');
  }, 15_000);

  it('Ctrl-C cancels at the menu and does not run any action', async () => {
    if (pty === null) return;

    const term = pty.spawn(
      process.execPath,
      ['--import', 'tsx', 'examples/basic.ts'],
      {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: process.cwd(),
        env: interactiveEnv(),
      },
    );

    let output = '';
    term.onData((data) => {
      output += data;
    });

    const finished = new Promise<void>((resolve) => {
      term.onExit(() => resolve());
    });

    await new Promise((r) => setTimeout(r, 700));
    term.write('\x03'); // Ctrl-C
    await new Promise((r) => setTimeout(r, 500));
    term.kill();
    await finished;

    expect(output).not.toContain('Building');
    expect(output).not.toContain('Running tests');
  }, 15_000);
});
