import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCtx } from '../src/runtime/action-ctx.js';

const clackMocks = vi.hoisted(() => {
  const cancelSymbol = Symbol('clack.cancel');
  return {
    cancelSymbol,
    confirm: vi.fn(),
    isCancel: vi.fn((v: unknown) => v === cancelSymbol),
    spinner: vi.fn(),
    text: vi.fn(),
    select: vi.fn(),
    multiselect: vi.fn(),
  };
});

vi.mock('@clack/prompts', () => ({
  confirm: clackMocks.confirm,
  isCancel: clackMocks.isCancel,
  spinner: clackMocks.spinner,
  text: clackMocks.text,
  select: clackMocks.select,
  multiselect: clackMocks.multiselect,
}));

describe('createCtx — args and command passthrough', () => {
  it('exposes command and args as given', () => {
    const ctx = createCtx({
      command: 'build',
      args: { watch: true, target: 'esm' },
    });
    expect(ctx.command).toBe('build');
    expect(ctx.args).toEqual({ watch: true, target: 'esm' });
  });

  it('exposes positionals on _ and undeclared flags on rest', () => {
    const ctx = createCtx({
      command: 'zip',
      args: { path: 'x' },
      positionals: ['Ingram/330'],
      rest: { verbose: true },
    });
    expect(ctx._).toEqual(['Ingram/330']);
    expect(ctx.rest).toEqual({ verbose: true });
  });

  it('defaults _ to [] and rest to {} when omitted', () => {
    const ctx = createCtx({ command: 'x', args: {} });
    expect(ctx._).toEqual([]);
    expect(ctx.rest).toEqual({});
  });
});

describe('createCtx.confirm', () => {
  beforeEach(() => {
    clackMocks.confirm.mockReset();
    clackMocks.isCancel.mockClear();
  });

  it('returns the resolved value when user confirms', async () => {
    clackMocks.confirm.mockResolvedValueOnce(true);
    const ctx = createCtx({ command: 'x', args: {} });
    const result = await ctx.confirm({ message: 'Proceed?' });
    expect(result).toBe(true);
    expect(clackMocks.confirm).toHaveBeenCalledWith({
      message: 'Proceed?',
      initialValue: undefined,
    });
  });

  it('returns false when user cancels (isCancel)', async () => {
    clackMocks.confirm.mockResolvedValueOnce(clackMocks.cancelSymbol);
    const ctx = createCtx({ command: 'x', args: {} });
    const result = await ctx.confirm({ message: 'Proceed?' });
    expect(result).toBe(false);
  });

  it('forwards initialValue', async () => {
    clackMocks.confirm.mockResolvedValueOnce(false);
    const ctx = createCtx({ command: 'x', args: {} });
    await ctx.confirm({ message: 'Cancel?', initialValue: false });
    expect(clackMocks.confirm).toHaveBeenCalledWith({
      message: 'Cancel?',
      initialValue: false,
    });
  });
});

describe('createCtx.text / select / multiselect / isCancel', () => {
  beforeEach(() => {
    clackMocks.text.mockReset();
    clackMocks.select.mockReset();
    clackMocks.multiselect.mockReset();
    clackMocks.isCancel.mockClear();
  });

  it('text returns the typed string and forwards options (validate adapts undefined→"")', async () => {
    clackMocks.text.mockResolvedValueOnce('hello');
    const ctx = createCtx({ command: 'x', args: {} });
    const validate = vi.fn(() => undefined);
    const result = await ctx.text({ message: 'Name?', placeholder: 'p', validate });
    expect(result).toBe('hello');

    const passed = clackMocks.text.mock.calls[0]?.[0] as {
      message: string;
      placeholder: string;
      validate: (v: string | undefined) => unknown;
    };
    expect(passed.message).toBe('Name?');
    expect(passed.placeholder).toBe('p');
    // adapter passes '' when clack gives undefined
    passed.validate(undefined);
    expect(validate).toHaveBeenCalledWith('');
  });

  it('select maps {value,label,hint} options and returns the chosen value', async () => {
    clackMocks.select.mockResolvedValueOnce('b');
    const ctx = createCtx({ command: 'x', args: {} });
    const result = await ctx.select({
      message: 'Pick',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B', hint: 'second' },
      ],
    });
    expect(result).toBe('b');
    const passed = clackMocks.select.mock.calls[0]?.[0] as {
      options: Array<{ value: string; label: string; hint?: string }>;
    };
    expect(passed.options).toEqual([
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B', hint: 'second' },
    ]);
  });

  it('multiselect returns an array and forwards required/initialValues', async () => {
    clackMocks.multiselect.mockResolvedValueOnce(['a', 'c']);
    const ctx = createCtx({ command: 'x', args: {} });
    const result = await ctx.multiselect({
      message: 'Pick many',
      options: [
        { value: 'a', label: 'A' },
        { value: 'c', label: 'C' },
      ],
      required: true,
      initialValues: ['a'],
    });
    expect(result).toEqual(['a', 'c']);
    const passed = clackMocks.multiselect.mock.calls[0]?.[0] as {
      required: boolean;
      initialValues: string[];
    };
    expect(passed.required).toBe(true);
    expect(passed.initialValues).toEqual(['a']);
  });

  it('isCancel recognizes the clack cancel sentinel', async () => {
    clackMocks.select.mockResolvedValueOnce(clackMocks.cancelSymbol);
    const ctx = createCtx({ command: 'x', args: {} });
    const result = await ctx.select({ message: 'Pick', options: [{ value: 'a', label: 'A' }] });
    expect(ctx.isCancel(result)).toBe(true);
    expect(ctx.isCancel('a')).toBe(false);
  });
});

describe('createCtx.spinner', () => {
  const clackSpinnerApi = {
    start: vi.fn(),
    stop: vi.fn(),
    message: vi.fn(),
    error: vi.fn(),
    cancel: vi.fn(),
    clear: vi.fn(),
    isCancelled: false,
  };

  beforeEach(() => {
    Object.values(clackSpinnerApi).forEach((v) => {
      if (typeof v === 'function' && 'mockReset' in v) v.mockReset();
    });
    clackMocks.spinner.mockReset();
    clackMocks.spinner.mockReturnValue(clackSpinnerApi);
  });

  it('starts with initial message when provided', () => {
    const ctx = createCtx({ command: 'x', args: {} });
    ctx.spinner('Loading...');
    expect(clackSpinnerApi.start).toHaveBeenCalledWith('Loading...');
  });

  it('does not start when no initial message', () => {
    const ctx = createCtx({ command: 'x', args: {} });
    ctx.spinner();
    expect(clackSpinnerApi.start).not.toHaveBeenCalled();
  });

  it('update calls clack message', () => {
    const ctx = createCtx({ command: 'x', args: {} });
    const s = ctx.spinner('Initial');
    s.update('Step 2');
    expect(clackSpinnerApi.message).toHaveBeenCalledWith('Step 2');
  });

  it('success calls clack stop with message', () => {
    const ctx = createCtx({ command: 'x', args: {} });
    const s = ctx.spinner('Initial');
    s.success('Done!');
    expect(clackSpinnerApi.stop).toHaveBeenCalledWith('Done!');
  });

  it('error calls clack error with message', () => {
    const ctx = createCtx({ command: 'x', args: {} });
    const s = ctx.spinner('Initial');
    s.error('Failed!');
    expect(clackSpinnerApi.error).toHaveBeenCalledWith('Failed!');
  });

  it('stop calls clack stop with no args', () => {
    const ctx = createCtx({ command: 'x', args: {} });
    const s = ctx.spinner('Initial');
    s.stop();
    expect(clackSpinnerApi.stop).toHaveBeenCalledTimes(1);
    expect(clackSpinnerApi.stop.mock.calls[0]).toEqual([]);
  });
});

describe('createCtx.log', () => {
  let stdoutWrite: ReturnType<typeof vi.spyOn>;
  let stderrWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();
  });

  it('info writes to stdout', () => {
    const ctx = createCtx({ command: 'x', args: {} });
    ctx.log.info('hello');
    expect(stdoutWrite).toHaveBeenCalled();
    const written = String(stdoutWrite.mock.calls[0]?.[0]);
    expect(written).toContain('hello');
  });

  it('warn writes to stdout', () => {
    const ctx = createCtx({ command: 'x', args: {} });
    ctx.log.warn('be careful');
    expect(stdoutWrite).toHaveBeenCalled();
  });

  it('error writes to stderr', () => {
    const ctx = createCtx({ command: 'x', args: {} });
    ctx.log.error('boom');
    expect(stderrWrite).toHaveBeenCalled();
    const written = String(stderrWrite.mock.calls[0]?.[0]);
    expect(written).toContain('boom');
  });

  it('applies theme.colors.primary to info via custom Colorizer fn', () => {
    const ctx = createCtx({
      command: 'x',
      args: {},
      theme: { colors: { primary: (s) => `<<${s}>>` } },
    });
    ctx.log.info('hi');
    const written = String(stdoutWrite.mock.calls[0]?.[0]);
    expect(written).toContain('<<i>>');
  });

  it('applies theme.colors.error to error via named color', () => {
    const ctx = createCtx({
      command: 'x',
      args: {},
      theme: { colors: { error: 'magenta' } },
    });
    ctx.log.error('oops');
    expect(stderrWrite).toHaveBeenCalled();
  });
});
