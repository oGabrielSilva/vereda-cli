import {
  confirm,
  isCancel,
  multiselect as clackMultiselect,
  select as clackSelect,
  spinner as clackSpinner,
  text as clackText,
} from '@clack/prompts';
import pc from 'picocolors';
import type {
  ActionContext,
  ActionLog,
  ActionSpinner,
  ArgsSchema,
  Colorizer,
  InferArgs,
  MultiselectPromptOptions,
  SelectPromptOptions,
  TextPromptOptions,
  ThemeConfig,
} from '../types.js';

export interface CreateCtxOpts {
  readonly command: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly positionals?: readonly string[];
  readonly rest?: Readonly<Record<string, unknown>>;
  readonly theme?: ThemeConfig;
}

/**
 * Build the `ctx` object passed to an action callback.
 *
 * `args` is trusted to have been coerced by `route-args` against the leaf's schema —
 * the type assertion to `InferArgs<TArgs>` reflects that contract.
 */
export function createCtx<TArgs extends ArgsSchema>(opts: CreateCtxOpts): ActionContext<TArgs> {
  const colors = resolveLogColors(opts.theme);

  return {
    args: opts.args as InferArgs<TArgs>,
    command: opts.command,
    _: opts.positionals ?? [],
    rest: opts.rest ?? {},

    confirm: async ({ message, initialValue }) => {
      const result = await confirm(
        initialValue === undefined ? { message } : { message, initialValue },
      );
      if (isCancel(result)) return false;
      return result;
    },

    text: (opts) => clackText(toTextOpts(opts)),

    select: <T>(opts: SelectPromptOptions<T>) => clackSelect<T>(toSelectOpts(opts)),

    multiselect: <T>(opts: MultiselectPromptOptions<T>) =>
      clackMultiselect<T>(toMultiselectOpts(opts)),

    isCancel: (value): value is symbol => isCancel(value),

    spinner: (initialMessage) => buildSpinner(initialMessage),

    log: buildLog(colors),
  };
}

function toTextOpts(opts: TextPromptOptions): Parameters<typeof clackText>[0] {
  const out: Parameters<typeof clackText>[0] = { message: opts.message };
  if (opts.placeholder !== undefined) out.placeholder = opts.placeholder;
  if (opts.initialValue !== undefined) out.initialValue = opts.initialValue;
  if (opts.defaultValue !== undefined) out.defaultValue = opts.defaultValue;
  if (opts.validate !== undefined) {
    const validate = opts.validate;
    out.validate = (value) => validate(value ?? '') ?? undefined;
  }
  return out;
}

// @clack/prompts types `options` as a conditional `Option<Value>` that doesn't
// unify with a plain object literal under a generic `Value` + exactOptionalPropertyTypes,
// so we build the option objects and cast the array to the param type.
type SelectOpts<T> = Parameters<typeof clackSelect<T>>[0];
type MultiselectOpts<T> = Parameters<typeof clackMultiselect<T>>[0];

function toClackOptions<T>(
  options: SelectPromptOptions<T>['options'],
): SelectOpts<T>['options'] {
  return options.map((o) => {
    const opt: { value: T; label: string; hint?: string } = { value: o.value, label: o.label };
    if (o.hint !== undefined) opt.hint = o.hint;
    return opt;
  }) as SelectOpts<T>['options'];
}

function toSelectOpts<T>(opts: SelectPromptOptions<T>): SelectOpts<T> {
  const out: SelectOpts<T> = {
    message: opts.message,
    options: toClackOptions(opts.options),
  };
  if (opts.initialValue !== undefined) out.initialValue = opts.initialValue;
  if (opts.maxItems !== undefined) out.maxItems = opts.maxItems;
  return out;
}

function toMultiselectOpts<T>(opts: MultiselectPromptOptions<T>): MultiselectOpts<T> {
  const out: MultiselectOpts<T> = {
    message: opts.message,
    options: toClackOptions(opts.options),
  };
  if (opts.initialValues !== undefined) out.initialValues = [...opts.initialValues];
  if (opts.required !== undefined) out.required = opts.required;
  if (opts.maxItems !== undefined) out.maxItems = opts.maxItems;
  return out;
}

function buildSpinner(initialMessage?: string): ActionSpinner {
  const s = clackSpinner();
  if (initialMessage !== undefined) s.start(initialMessage);
  return {
    update: (msg) => s.message(msg),
    success: (msg) => s.stop(msg),
    error: (msg) => s.error(msg),
    stop: () => s.stop(),
  };
}

interface LogColors {
  info: (text: string) => string;
  warn: (text: string) => string;
  error: (text: string) => string;
}

function buildLog(colors: LogColors): ActionLog {
  return {
    info: (msg) => {
      process.stdout.write(`${colors.info('i')} ${msg}\n`);
    },
    warn: (msg) => {
      process.stdout.write(`${colors.warn('!')} ${msg}\n`);
    },
    error: (msg) => {
      process.stderr.write(`${colors.error('x')} ${msg}\n`);
    },
  };
}

function resolveLogColors(theme?: ThemeConfig): LogColors {
  const c = theme?.colors;
  return {
    info: resolveColorizer(c?.primary, pc.cyan),
    warn: resolveColorizer(c?.warning, pc.yellow),
    error: resolveColorizer(c?.error, pc.red),
  };
}

function resolveColorizer(
  c: Colorizer | undefined,
  fallback: (text: string) => string,
): (text: string) => string {
  if (c === undefined) return fallback;
  if (typeof c === 'function') return c;
  switch (c) {
    case 'black':
      return pc.black;
    case 'red':
      return pc.red;
    case 'green':
      return pc.green;
    case 'yellow':
      return pc.yellow;
    case 'blue':
      return pc.blue;
    case 'magenta':
      return pc.magenta;
    case 'cyan':
      return pc.cyan;
    case 'white':
      return pc.white;
    case 'gray':
      return pc.gray;
  }
}
