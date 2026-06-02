/**
 * Declarative argument definition for a menu leaf.
 *
 * Boolean args are always optional (`required?: false`); presence in argv toggles them on.
 * String and enum args may be marked `required: true`.
 *
 * `prompt` controls whether the interactive menu asks for this arg:
 * - omitted (default): prompt only when `required: true` and the value did not come from argv.
 * - `true`: always prompt (when not already provided via argv).
 * - `false`: never prompt; fall back to `default` (string) or leave undefined.
 * Booleans default to never prompting (set `prompt: true` to opt in).
 */
export type ArgDef =
  | { readonly type: 'boolean'; readonly required?: false; readonly prompt?: boolean }
  | {
      readonly type: 'string';
      readonly required?: boolean;
      readonly default?: string;
      readonly prompt?: boolean;
    }
  | {
      readonly type: 'enum';
      readonly options: readonly string[];
      readonly required?: boolean;
      readonly prompt?: boolean;
    };

export type ArgsSchema = Readonly<Record<string, ArgDef>>;

type InferArg<A extends ArgDef> =
  [A] extends [{ type: 'boolean' }] ? boolean :
  [A] extends [{ type: 'enum'; options: readonly (infer O)[] }] ? O :
  [A] extends [{ type: 'string' }] ? string :
  never;

type RequiredKeys<T extends ArgsSchema> = {
  [K in keyof T]: T[K] extends { required: true } ? K : never;
}[keyof T];

type OptionalKeys<T extends ArgsSchema> = Exclude<keyof T, RequiredKeys<T>>;

export type InferArgs<T extends ArgsSchema> =
  & { readonly [K in RequiredKeys<T>]: InferArg<T[K]> }
  & { readonly [K in OptionalKeys<T>]?: InferArg<T[K]> };

export interface ActionSpinner {
  update(message: string): void;
  success(message?: string): void;
  error(message?: string): void;
  stop(): void;
}

export interface ActionLog {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Sentinel returned by `ctx.text` / `ctx.select` / `ctx.multiselect` when the
 * user cancels (Ctrl+C / Esc). Detect it with `ctx.isCancel(value)` — this is
 * the same cancel value `@clack/prompts` uses, re-exported so actions don't have
 * to import `@clack/prompts` just to check for cancellation.
 */
export type CancelValue = symbol;

export interface SelectOption<T> {
  readonly value: T;
  readonly label: string;
  readonly hint?: string;
}

export interface TextPromptOptions {
  readonly message: string;
  readonly placeholder?: string;
  readonly initialValue?: string;
  readonly defaultValue?: string;
  readonly validate?: (value: string) => string | void;
}

export interface SelectPromptOptions<T> {
  readonly message: string;
  readonly options: ReadonlyArray<SelectOption<T>>;
  readonly initialValue?: T;
  readonly maxItems?: number;
}

export interface MultiselectPromptOptions<T> {
  readonly message: string;
  readonly options: ReadonlyArray<SelectOption<T>>;
  readonly initialValues?: readonly T[];
  readonly required?: boolean;
  readonly maxItems?: number;
}

export interface ActionContext<TArgs extends ArgsSchema = Record<string, never>> {
  readonly args: InferArgs<TArgs>;
  readonly command: string;
  /**
   * Raw positional arguments from argv (after the command token). Empty when the
   * action was reached through the interactive menu without argv.
   */
  readonly _: readonly string[];
  /**
   * Flags present in argv but not declared in the leaf's `args` schema. Always
   * empty unless `defineCLI({ strict: false })`; otherwise undeclared flags are
   * rejected before the action runs.
   */
  readonly rest: Readonly<Record<string, unknown>>;
  confirm(opts: { message: string; initialValue?: boolean }): Promise<boolean>;
  /** Free-text prompt. Returns the string, or a cancel sentinel — check `ctx.isCancel`. */
  text(opts: TextPromptOptions): Promise<string | CancelValue>;
  /** Single-choice prompt. Returns the chosen value, or a cancel sentinel. */
  select<T>(opts: SelectPromptOptions<T>): Promise<T | CancelValue>;
  /** Multi-choice prompt. Returns the chosen values, or a cancel sentinel. */
  multiselect<T>(opts: MultiselectPromptOptions<T>): Promise<T[] | CancelValue>;
  /** True when a prompt value is the cancel sentinel (user pressed Ctrl+C / Esc). */
  isCancel(value: unknown): value is CancelValue;
  spinner(message?: string): ActionSpinner;
  readonly log: ActionLog;
}

export type ColorName =
  | 'black'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'gray';

export type Colorizer = ColorName | ((text: string) => string);

export type KeyAction = 'up' | 'down' | 'left' | 'right' | 'space' | 'enter' | 'cancel';

export interface ThemeColors {
  primary?: Colorizer;
  success?: Colorizer;
  error?: Colorizer;
  warning?: Colorizer;
  dimmed?: Colorizer;
}

export interface ThemeSymbols {
  active?: string;
  inactive?: string;
  bar?: string;
  barStart?: string;
  barEnd?: string;
  success?: string;
  error?: string;
}

export interface ThemeConfig {
  messages?: { cancel?: string; error?: string };
  keyAliases?: Readonly<Record<string, KeyAction>>;
  colors?: ThemeColors;
  symbols?: ThemeSymbols;
}

export type CliMode = 'auto' | 'interactive-only' | 'argv-only';

export type InteractiveBehavior = 'loop' | 'one-shot';

export interface ActionErrorContext {
  readonly command: string;
  readonly args: Readonly<Record<string, unknown>>;
}

export type ActionErrorHandler = (error: unknown, ctx: ActionErrorContext) => void | Promise<void>;

/**
 * Leaf node: terminates with an action callback.
 *
 * `args` and `action` types co-vary so `ctx.args` is inferred per-leaf.
 * `action` is declared with method syntax so TypeScript treats its parameter
 * as bivariant — a leaf with a narrow args schema remains assignable to the
 * broader `MenuNode` union used inside `menu` arrays.
 */
export interface MenuLeaf<A extends ArgsSchema = ArgsSchema> {
  readonly label: string;
  readonly hint?: string;
  readonly command: string;
  readonly args?: A;
  action(ctx: ActionContext<A>): Promise<void> | void;
}

/**
 * Branch node: groups other nodes. No action, no command, no args.
 */
export interface MenuBranch {
  readonly label: string;
  readonly hint?: string;
  readonly children: readonly MenuNode[];
}

export type MenuNode = MenuLeaf<ArgsSchema> | MenuBranch;

export interface CLIConfig {
  readonly name: string;
  readonly menu: readonly MenuNode[];
  readonly mode?: CliMode;
  /**
   * How the interactive menu behaves after an action finishes.
   * - `'loop'` (default): return to the same menu level; only Sair or Ctrl+C terminates.
   * - `'one-shot'`: terminate after the first action (success or failure).
   */
  readonly interactive?: InteractiveBehavior;
  /**
   * Called when an action throws. Receives the error and the command/args context.
   *
   * The library never prints `err.message` to end-users; provide this handler to
   * surface a friendly message (typically via your own logging) or to send the
   * error to telemetry. Without a handler, the library logs `theme.messages.error`
   * (a generic, translatable string) and continues per the `interactive` mode.
   */
  readonly onActionError?: ActionErrorHandler;
  /**
   * Argv parsing strictness. Default `true`: a flag not declared in the matched
   * leaf's `args` schema is an error. Set `false` to accept undeclared flags and
   * expose them on `ctx.rest` (and positionals on `ctx._`) for the action to read.
   */
  readonly strict?: boolean;
  readonly theme?: ThemeConfig;
}
