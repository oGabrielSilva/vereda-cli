import { cancel } from '@clack/prompts';
import { applyTheme } from '../theme/apply.js';
import type { CLIConfig } from '../types.js';
import { validateConfig } from '../validate/config.js';
import { createCtx } from './action-ctx.js';
import { navigateMenu } from './render-menu.js';
import { routeArgs } from './route-args.js';
import { detectMode, printPlainHelp } from './tty.js';

const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_CONFIG_ERROR = 2;
const EXIT_CANCELLED = 130;

/**
 * Entry point that ties everything together: validate → apply theme →
 * detect mode → render or route → return an exit code.
 *
 * Always restores the terminal on error so the parent shell does not get
 * stuck in raw mode with the cursor hidden.
 */
export async function run(config: CLIConfig, argv: readonly string[]): Promise<number> {
  const report = validateConfig(config);
  if (report.errors.length > 0) {
    process.stderr.write('Erro de configuração:\n');
    for (const err of report.errors) {
      const at = err.path.length > 0 ? ` em "${err.path.join(' > ')}"` : '';
      process.stderr.write(`  [${err.code}]${at}: ${err.message}\n`);
    }
    return EXIT_CONFIG_ERROR;
  }

  for (const warn of report.warnings) {
    const at = warn.path.length > 0 ? ` em "${warn.path.join(' > ')}"` : '';
    process.stderr.write(`Aviso [${warn.code}]${at}: ${warn.message}\n`);
  }

  const theme = applyTheme(config.theme);
  const decision = detectMode(config, argv);

  try {
    switch (decision.kind) {
      case 'render-menu': {
        const result = await navigateMenu({
          menu: config.menu,
          theme,
          ...(config.theme !== undefined ? { themeConfig: config.theme } : {}),
          rootMessage: config.name,
        });
        if (result.kind === 'cancelled') {
          cancel(theme.messages.cancel);
          return EXIT_CANCELLED;
        }
        return EXIT_OK;
      }

      case 'route-argv': {
        const routed = routeArgs(config, argv);
        switch (routed.kind) {
          case 'matched': {
            const ctx = createCtx({
              command: routed.command,
              args: routed.args,
              ...(config.theme !== undefined ? { theme: config.theme } : {}),
            });
            await routed.leaf.action(ctx);
            return EXIT_OK;
          }
          case 'unknown-command': {
            process.stderr.write(`Comando desconhecido: ${routed.command}\n`);
            printPlainHelp(config.name, config.menu, process.stderr);
            return EXIT_ERROR;
          }
          case 'arg-error': {
            process.stderr.write(`Erro em "${routed.command}" (--${routed.argName}): ${routed.reason}\n`);
            return EXIT_ERROR;
          }
          case 'empty-argv': {
            printPlainHelp(config.name, config.menu);
            return EXIT_OK;
          }
        }
        return EXIT_OK;
      }

      case 'print-help': {
        printPlainHelp(config.name, config.menu);
        return EXIT_OK;
      }

      case 'tty-required-error': {
        process.stderr.write('Esta CLI requer um terminal interativo (TTY).\n');
        return EXIT_CONFIG_ERROR;
      }
    }
  } catch (err) {
    restoreTerminal();
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${theme.messages.error}: ${message}\n`);
    return EXIT_ERROR;
  }
}

function restoreTerminal(): void {
  if (process.stdout.isTTY === true) {
    process.stdout.write('\x1B[?25h');
  }
  if (process.stdin.isTTY === true && typeof process.stdin.setRawMode === 'function') {
    process.stdin.setRawMode(false);
  }
}
