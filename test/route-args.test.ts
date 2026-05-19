import { describe, expect, it } from 'vitest';
import type { CLIConfig } from '../src/types.js';
import { routeArgs } from '../src/runtime/route-args.js';

const noop = () => undefined;

const flatConfig: CLIConfig = {
  name: 'mycli',
  menu: [
    {
      label: 'Build',
      command: 'build',
      args: { watch: { type: 'boolean' } },
      action: noop,
    },
    {
      label: 'Convert',
      command: 'convert',
      args: {
        file: { type: 'string', required: true },
        format: { type: 'enum', options: ['json', 'yaml'], required: true },
        pretty: { type: 'boolean' },
      },
      action: noop,
    },
    {
      label: 'Status',
      command: 'status',
      action: noop,
    },
  ],
};

const nestedConfig: CLIConfig = {
  name: 'mycli',
  menu: [
    {
      label: 'Settings',
      children: [
        {
          label: 'Edit',
          command: 'config:edit',
          args: { backup: { type: 'boolean' } },
          action: noop,
        },
        {
          label: 'Reset',
          command: 'config:reset',
          action: noop,
        },
      ],
    },
  ],
};

describe('routeArgs — empty argv', () => {
  it('returns empty-argv for []', () => {
    expect(routeArgs(flatConfig, []).kind).toBe('empty-argv');
  });

  it('returns empty-argv when only flags given (no positional)', () => {
    expect(routeArgs(flatConfig, ['--help']).kind).toBe('empty-argv');
  });
});

describe('routeArgs — unknown command', () => {
  it('returns unknown-command when first positional matches nothing', () => {
    const result = routeArgs(flatConfig, ['nonexistent']);
    expect(result.kind).toBe('unknown-command');
    if (result.kind === 'unknown-command') {
      expect(result.command).toBe('nonexistent');
    }
  });
});

describe('routeArgs — flat menu', () => {
  it('matches a leaf with no args', () => {
    const result = routeArgs(flatConfig, ['status']);
    expect(result.kind).toBe('matched');
    if (result.kind === 'matched') {
      expect(result.command).toBe('status');
      expect(result.args).toEqual({});
      expect(result.path).toEqual(['Status']);
    }
  });

  it('matches a leaf with boolean arg (present)', () => {
    const result = routeArgs(flatConfig, ['build', '--watch']);
    if (result.kind === 'matched') {
      expect(result.args).toEqual({ watch: true });
    } else {
      throw new Error('expected matched');
    }
  });

  it('matches a leaf with boolean arg (absent → undefined, skipped)', () => {
    const result = routeArgs(flatConfig, ['build']);
    if (result.kind === 'matched') {
      expect(result.args).toEqual({});
    } else {
      throw new Error('expected matched');
    }
  });

  it('matches a leaf with required string and enum', () => {
    const result = routeArgs(flatConfig, [
      'convert',
      '--file',
      'data.json',
      '--format',
      'yaml',
      '--pretty',
    ]);
    if (result.kind === 'matched') {
      expect(result.args).toEqual({
        file: 'data.json',
        format: 'yaml',
        pretty: true,
      });
    } else {
      throw new Error('expected matched');
    }
  });
});

describe('routeArgs — arg validation', () => {
  it('errors when required arg is missing', () => {
    const result = routeArgs(flatConfig, ['convert', '--format', 'json']);
    expect(result.kind).toBe('arg-error');
    if (result.kind === 'arg-error') {
      expect(result.argName).toBe('file');
      expect(result.reason).toContain('obrigatório');
    }
  });

  it('errors when enum value is not in options', () => {
    const result = routeArgs(flatConfig, [
      'convert',
      '--file',
      'data.json',
      '--format',
      'xml',
    ]);
    expect(result.kind).toBe('arg-error');
    if (result.kind === 'arg-error') {
      expect(result.argName).toBe('format');
      expect(result.reason).toContain('xml');
    }
  });

  it('errors on unknown flag', () => {
    const result = routeArgs(flatConfig, ['status', '--surprise']);
    expect(result.kind).toBe('arg-error');
    if (result.kind === 'arg-error') {
      expect(result.argName).toBe('surprise');
      expect(result.reason).toContain('desconhecida');
    }
  });
});

describe('routeArgs — nested menu', () => {
  it('finds a leaf nested in submenu by command', () => {
    const result = routeArgs(nestedConfig, ['config:edit']);
    expect(result.kind).toBe('matched');
    if (result.kind === 'matched') {
      expect(result.command).toBe('config:edit');
      expect(result.path).toEqual(['Settings', 'Edit']);
    }
  });

  it('finds a leaf nested in submenu with boolean arg', () => {
    const result = routeArgs(nestedConfig, ['config:edit', '--backup']);
    if (result.kind === 'matched') {
      expect(result.args).toEqual({ backup: true });
    } else {
      throw new Error('expected matched');
    }
  });
});

describe('routeArgs — string default values', () => {
  const cfg: CLIConfig = {
    name: 'x',
    menu: [
      {
        label: 'Deploy',
        command: 'deploy',
        args: {
          env: { type: 'string', default: 'staging' },
        },
        action: noop,
      },
    ],
  };

  it('falls back to default when string arg not provided', () => {
    const result = routeArgs(cfg, ['deploy']);
    if (result.kind === 'matched') {
      expect(result.args).toEqual({ env: 'staging' });
    } else {
      throw new Error('expected matched');
    }
  });

  it('uses provided value when string arg given', () => {
    const result = routeArgs(cfg, ['deploy', '--env', 'prod']);
    if (result.kind === 'matched') {
      expect(result.args).toEqual({ env: 'prod' });
    } else {
      throw new Error('expected matched');
    }
  });
});
