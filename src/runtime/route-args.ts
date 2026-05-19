import mri from 'mri';
import type { ArgDef, ArgsSchema, CLIConfig, MenuLeaf, MenuNode } from '../types.js';

export type RouteResult =
  | {
      readonly kind: 'matched';
      readonly leaf: MenuLeaf<ArgsSchema>;
      readonly path: readonly string[];
      readonly command: string;
      readonly args: Readonly<Record<string, unknown>>;
    }
  | { readonly kind: 'empty-argv' }
  | { readonly kind: 'unknown-command'; readonly command: string }
  | {
      readonly kind: 'arg-error';
      readonly command: string;
      readonly argName: string;
      readonly reason: string;
    };

/**
 * Parse `argv` against a CLI config, find the matching leaf, and coerce flags
 * against the leaf's declared args schema. Returns a discriminated result with
 * either the matched leaf+args or a structured failure.
 *
 * Global flags (`--help`, `--version`) are intentionally not handled here —
 * the orchestrator inspects raw argv before delegating to this routine.
 */
export function routeArgs(config: CLIConfig, argv: readonly string[]): RouteResult {
  if (argv.length === 0) return { kind: 'empty-argv' };

  const probe = mri([...argv]);
  const command = probe._[0];
  if (typeof command !== 'string' || command.length === 0) {
    return { kind: 'empty-argv' };
  }

  const found = findLeaf(config.menu, command, []);
  if (!found) return { kind: 'unknown-command', command };

  const { leaf, path } = found;
  return coerceArgs(leaf, argv, path, command);
}

function findLeaf(
  menu: readonly MenuNode[],
  command: string,
  parentPath: readonly string[],
): { leaf: MenuLeaf<ArgsSchema>; path: readonly string[] } | null {
  for (const node of menu) {
    if ('children' in node) {
      const inner = findLeaf(node.children, command, [...parentPath, node.label]);
      if (inner) return inner;
      continue;
    }
    if ('command' in node && node.command === command) {
      return { leaf: node, path: [...parentPath, node.label] };
    }
  }
  return null;
}

function coerceArgs(
  leaf: MenuLeaf<ArgsSchema>,
  argv: readonly string[],
  path: readonly string[],
  command: string,
): RouteResult {
  const schema: ArgsSchema = leaf.args ?? {};
  const entries = Object.entries(schema);

  const booleanKeys: string[] = [];
  const stringKeys: string[] = [];
  const defaults: Record<string, unknown> = {};

  for (const [name, def] of entries) {
    if (def.type === 'boolean') booleanKeys.push(name);
    else stringKeys.push(name);
    if (def.type === 'string' && def.default !== undefined) {
      defaults[name] = def.default;
    }
  }

  const parsed = mri<Record<string, unknown>>([...argv], {
    boolean: booleanKeys,
    string: stringKeys,
    default: defaults,
  });

  const args: Record<string, unknown> = {};
  const declared = new Set(entries.map(([name]) => name));

  for (const [name, def] of entries) {
    const raw: unknown = parsed[name];
    const value = coerceOne(name, def, raw);
    if ('error' in value) {
      return {
        kind: 'arg-error',
        command,
        argName: name,
        reason: value.error,
      };
    }
    if (value.value !== undefined) {
      args[name] = value.value;
    }
  }

  for (const key of Object.keys(parsed)) {
    if (key === '_' || declared.has(key)) continue;
    return {
      kind: 'arg-error',
      command,
      argName: key,
      reason: `Flag desconhecida: --${key}`,
    };
  }

  return {
    kind: 'matched',
    leaf,
    path,
    command,
    args,
  };
}

type CoerceOne = { value: unknown } | { error: string };

function coerceOne(name: string, def: ArgDef, raw: unknown): CoerceOne {
  const isRequired = 'required' in def && def.required === true;
  const isMissing = raw === undefined || raw === null || raw === '';

  if (isMissing) {
    if (isRequired) {
      return { error: `Argumento obrigatório ausente: --${name}.` };
    }
    if (def.type === 'string' && def.default !== undefined) {
      return { value: def.default };
    }
    return { value: undefined };
  }

  switch (def.type) {
    case 'boolean':
      return { value: Boolean(raw) };
    case 'string': {
      if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') {
        return { error: `Valor inválido para --${name}.` };
      }
      return { value: typeof raw === 'string' ? raw : String(raw) };
    }
    case 'enum': {
      if (typeof raw !== 'string') {
        return { error: `Valor inválido para --${name} (esperado string).` };
      }
      if (!def.options.includes(raw)) {
        return {
          error: `Valor "${raw}" não é permitido em --${name}. Use: ${def.options.join(', ')}.`,
        };
      }
      return { value: raw };
    }
  }
}
