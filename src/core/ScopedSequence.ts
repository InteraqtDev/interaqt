import { generateUUID, IInstance, SerializedData } from './interfaces.js';
import { stringifyInstance } from './utils.js';
import { Entity, type EntityInstance } from './Entity.js';
import { BoolExp, type ExpressionData } from './BoolExp.js';

const validNameFormatExp = /^[a-zA-Z0-9_]+$/;

export type ScopedSequenceScopeItem =
  | {
      name: string;
      type: 'string' | 'number' | 'boolean';
      path: string;
    }
  | {
      name: string;
      type: 'ref';
      base: EntityInstance;
      path: string;
    };

export type ScopedSequenceInitializer = {
  record: EntityInstance;
  valuePath: string;
  scope: Array<{ name: string; path: string }>;
  aggregate: 'max';
  match?: ScopedSequenceMatchExpression;
};

export type ScopedSequenceMatchOperator =
  | '='
  | '!='
  | 'is null'
  | 'is not null'
  | 'in'
  | 'not in';

export type ScopedSequenceMatchAtom = {
  key: string;
  value: [ScopedSequenceMatchOperator, unknown];
};

export type ScopedSequenceMatchExpression =
  | ExpressionData<ScopedSequenceMatchAtom>
  | BoolExp<ScopedSequenceMatchAtom>;

export interface ScopedSequenceInstance extends IInstance {
  name: string;
  scope: ScopedSequenceScopeItem[];
  /**
   * 参与编号的记录过滤器——**create-time 语义**（与 scope 的不可变契约不同）：
   * 只在记录创建时求值一次，决定该记录是否分配序号。之后 match 字段的更新
   * **不会**重新编号、不会回收号码、也不被禁止（业务字段的正常流转，如
   * status: active → cancelled，已编号记录保留其号码）；创建时未命中的记录
   * 永远保持未编号（序号列为 null）。需要"持续成员资格"语义时，请把可变维度
   * 建模在 scope 之外、或以 filtered entity + 独立计算表达。
   * （scope 字段则相反：编号后不可变，运行期守卫直接拒绝——见 Scheduler 的
   * ScopedSequence scope guard。）
   */
  match?: ScopedSequenceMatchExpression;
  initialValue?: number;
  step?: number;
  allowManualValue?: boolean;
  initializeFrom?: ScopedSequenceInitializer;
}

export interface ScopedSequenceCreateArgs {
  name: string;
  scope: ScopedSequenceScopeItem[];
  match?: ScopedSequenceMatchExpression;
  initialValue?: number;
  step?: number;
  allowManualValue?: boolean;
  initializeFrom?: ScopedSequenceInitializer;
}

// 旧序列化格式；stringify 现在统一使用 stringifyAttribute 的 `uuid::` 编码，
// parse 保留对旧格式的解析能力。
type SerializedEntityRef = {
  _type: 'EntityRef';
  name: string;
  uuid?: string;
};

function deserializeEntityRef(ref: SerializedEntityRef | string | EntityInstance): EntityInstance {
  if (Entity.is(ref)) return ref;
  if (typeof ref === 'string') {
    if (!ref.startsWith('uuid::')) {
      throw new Error(`ScopedSequence cannot restore Entity reference "${ref}" during parse`);
    }
    const uuid = ref.substring(6);
    const entity = Entity.instances.find(item => item.uuid === uuid);
    if (!entity) {
      throw new Error(`ScopedSequence cannot restore Entity reference "uuid::${uuid}" during parse`);
    }
    return entity;
  }
  const entity = ref.uuid
    ? Entity.instances.find(item => item.uuid === ref.uuid)
    : Entity.instances.find(item => item.name === ref.name);
  if (!entity) {
    const identity = ref.uuid ? `${ref.name} (uuid: ${ref.uuid})` : ref.name;
    throw new Error(`ScopedSequence cannot restore Entity reference "${identity}" during parse`);
  }
  return entity;
}

function assertStablePath(path: unknown, label: string) {
  if (typeof path !== 'string' || !path || path.includes('..') || path.startsWith('.') || path.endsWith('.')) {
    throw new Error(`${label} must declare a stable path`);
  }
  const segments = path.split('.');
  if (segments.some(segment => !validNameFormatExp.test(segment))) {
    throw new Error(`${label} must declare a stable path`);
  }
}

function assertSupportedMatchPath(path: string, label: string) {
  const segments = path.split('.');
  if (segments.length === 1) return;
  if (segments.length === 2 && segments[1] === 'id') return;
  throw new Error(`${label} only supports top-level fields and ref id paths`);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function cloneNormalizedMatch<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function normalizeScopedSequenceMatchExpression(
  match: ScopedSequenceMatchExpression | undefined,
): ExpressionData<ScopedSequenceMatchAtom> | undefined {
  if (match === undefined) return undefined;
  const raw = match instanceof BoolExp ? match.raw : match;
  if (!BoolExp.isExpressionData(raw)) {
    throw new Error('ScopedSequence.match must be a BoolExp expression');
  }
  return cloneNormalizedMatch(raw as ExpressionData<ScopedSequenceMatchAtom>);
}

export function stableScopedSequenceMatchStringify(match: ScopedSequenceMatchExpression | undefined): string {
  return stableStringify(normalizeScopedSequenceMatchExpression(match));
}

export function getEffectiveScopedSequenceInitializerMatch(
  args: Pick<ScopedSequenceInstance, 'match' | 'initializeFrom'>,
): ExpressionData<ScopedSequenceMatchAtom> | undefined {
  return normalizeScopedSequenceMatchExpression(args.initializeFrom?.match ?? args.match);
}

function visitScopedSequenceMatchAtoms(
  match: ScopedSequenceMatchExpression | undefined,
  visitor: (atom: ScopedSequenceMatchAtom) => void,
) {
  const normalized = normalizeScopedSequenceMatchExpression(match);
  if (!normalized) return;
  const visit = (node: ExpressionData<ScopedSequenceMatchAtom>) => {
    if (node.type === 'atom') {
      visitor(node.data);
      return;
    }
    if (node.operator !== 'and' && node.operator !== 'or' && node.operator !== 'not') {
      throw new Error(`ScopedSequence.match has unsupported boolean operator "${String(node.operator)}"`);
    }
    visit(node.left);
    if (node.operator !== 'not') {
      if (!node.right) throw new Error(`ScopedSequence.match "${node.operator}" expression must declare a right operand`);
      visit(node.right);
    }
  };
  visit(normalized);
}

function validateScopedSequenceMatchExpression(
  match: ScopedSequenceMatchExpression | undefined,
  label: string,
) {
  visitScopedSequenceMatchAtoms(match, atom => {
    assertStablePath(atom.key, `${label} atom key`);
    assertSupportedMatchPath(atom.key, `${label} atom key`);
    if (!Array.isArray(atom.value) || atom.value.length !== 2) {
      throw new Error(`${label} atom value must be [operator, operand]`);
    }
    const [operator, operand] = atom.value;
    if (!['=', '!=', 'is null', 'is not null', 'in', 'not in'].includes(operator)) {
      throw new Error(`${label} has unsupported operator "${String(operator)}"`);
    }
    if (operand === undefined) {
      throw new Error(`${label} value cannot be undefined`);
    }
    if (operator === 'in' || operator === 'not in') {
      if (!Array.isArray(operand)) {
        throw new Error(`${label} ${operator} value must be an array`);
      }
      if (operand.some(item => item === undefined)) {
        throw new Error(`${label} ${operator} value cannot contain undefined`);
      }
    }
  });
}

function deserializeScopeItem(item: ScopedSequenceScopeItem | (Omit<Extract<ScopedSequenceScopeItem, { type: 'ref' }>, 'base'> & { base: SerializedEntityRef | string })) {
  return item.type === 'ref'
    ? { ...item, base: deserializeEntityRef(item.base as SerializedEntityRef | string | EntityInstance) }
    : item as ScopedSequenceScopeItem;
}

function deserializeInitializer(initializer: (Omit<ScopedSequenceInitializer, 'record'> & { record: SerializedEntityRef | string }) | undefined) {
  return initializer ? { ...initializer, record: deserializeEntityRef(initializer.record) } : undefined;
}

export class ScopedSequence implements ScopedSequenceInstance {
  public uuid: string;
  public _type = 'ScopedSequence';
  public _options?: { uuid?: string };
  public name: string;
  public scope: ScopedSequenceScopeItem[];
  public match?: ScopedSequenceMatchExpression;
  public initialValue?: number;
  public step?: number;
  public allowManualValue?: boolean;
  public initializeFrom?: ScopedSequenceInitializer;

  constructor(args: ScopedSequenceCreateArgs, options?: { uuid?: string }) {
    ScopedSequence.validate(args);
    this._options = options;
    this.uuid = generateUUID(options);
    this.name = args.name;
    this.scope = args.scope;
    this.match = normalizeScopedSequenceMatchExpression(args.match);
    this.initialValue = args.initialValue;
    this.step = args.step;
    this.allowManualValue = args.allowManualValue;
    this.initializeFrom = args.initializeFrom ? {
      ...args.initializeFrom,
      match: normalizeScopedSequenceMatchExpression(args.initializeFrom.match),
    } : undefined;
  }

  static isKlass = true as const;
  static displayName = 'ScopedSequence';
  static instances: ScopedSequenceInstance[] = [];

  static public = {
    name: {
      type: 'string' as const,
      required: true as const,
      constraints: {
        format: ({ name }: { name: string }) => validNameFormatExp.test(name),
      },
    },
    scope: {
      instanceType: {} as unknown as ScopedSequenceScopeItem,
      collection: true as const,
      required: true as const,
    },
    match: {
      instanceType: {} as unknown as ScopedSequenceMatchExpression,
      collection: false as const,
      required: false as const,
    },
    initialValue: {
      type: 'number' as const,
      required: false as const,
    },
    step: {
      type: 'number' as const,
      required: false as const,
    },
    allowManualValue: {
      type: 'boolean' as const,
      required: false as const,
    },
    initializeFrom: {
      instanceType: {} as unknown as ScopedSequenceInitializer,
      collection: false as const,
      required: false as const,
    },
  };

  static create(args: ScopedSequenceCreateArgs, options?: { uuid?: string }): ScopedSequenceInstance {
    const instance = new ScopedSequence(args, options);
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, ScopedSequence`);
    }
    this.instances.push(instance);
    return instance;
  }

  static validate(args: ScopedSequenceCreateArgs) {
    if (!validNameFormatExp.test(args.name)) {
      throw new Error(`ScopedSequence name "${args.name}" must match ${validNameFormatExp}`);
    }
    if (!Array.isArray(args.scope) || args.scope.length === 0) {
      throw new Error('ScopedSequence scope must be a non-empty array');
    }
    const names = new Set<string>();
    for (const item of args.scope) {
      if (!validNameFormatExp.test(item.name)) {
        throw new Error(`ScopedSequence scope item name "${item.name}" must match ${validNameFormatExp}`);
      }
      if (names.has(item.name)) {
        throw new Error(`ScopedSequence scope item name "${item.name}" is duplicated`);
      }
      names.add(item.name);
      assertStablePath(item.path, `ScopedSequence scope item "${item.name}"`);
      if (item.type === 'ref' && !item.base?.name) {
        throw new Error(`ScopedSequence ref scope item "${item.name}" must declare a base entity`);
      }
    }
    if (args.step !== undefined && (!Number.isInteger(args.step) || args.step <= 0)) {
      throw new Error('ScopedSequence step must be a positive integer');
    }
    if (args.initialValue !== undefined && !Number.isFinite(args.initialValue)) {
      throw new Error('ScopedSequence initialValue must be a finite number');
    }
    validateScopedSequenceMatchExpression(args.match, 'ScopedSequence.match');
    if (args.initializeFrom) {
      if (!args.initializeFrom.record?.name) {
        throw new Error('ScopedSequence initializeFrom.record must declare a source entity');
      }
      assertStablePath(args.initializeFrom.valuePath, 'ScopedSequence initializeFrom.valuePath');
      if (args.initializeFrom.aggregate !== 'max') {
        throw new Error('ScopedSequence initializeFrom currently supports only aggregate "max"');
      }
      if (!Array.isArray(args.initializeFrom.scope)) {
        throw new Error('ScopedSequence initializeFrom.scope must be an array');
      }
      const declaredScopeNames = new Set(args.scope.map(item => item.name));
      const initializerScopeNames = new Set<string>();
      for (const item of args.initializeFrom.scope) {
        if (!validNameFormatExp.test(item.name)) {
          throw new Error(`ScopedSequence initializeFrom.scope item name "${item.name}" must match ${validNameFormatExp}`);
        }
        if (initializerScopeNames.has(item.name)) {
          throw new Error(`ScopedSequence initializeFrom.scope item name "${item.name}" is duplicated`);
        }
        initializerScopeNames.add(item.name);
        if (!declaredScopeNames.has(item.name)) {
          throw new Error(`ScopedSequence initializeFrom.scope item "${item.name}" is not declared in scope`);
        }
        assertStablePath(item.path, `ScopedSequence initializeFrom.scope item "${item.name}"`);
      }
      for (const declaredName of declaredScopeNames) {
        if (!initializerScopeNames.has(declaredName)) {
          throw new Error(`ScopedSequence initializeFrom.scope is missing declared scope item "${declaredName}"`);
        }
      }
      validateScopedSequenceMatchExpression(args.initializeFrom.match, 'ScopedSequence initializeFrom.match');
      if (args.initializeFrom.match && !args.match) {
        throw new Error('ScopedSequence initializeFrom.match cannot be declared without ScopedSequence.match');
      }
      if (
        args.initializeFrom.match &&
        stableScopedSequenceMatchStringify(args.initializeFrom.match) !== stableScopedSequenceMatchStringify(args.match)
      ) {
        throw new Error('ScopedSequence initializeFrom.match must match ScopedSequence.match');
      }
    }
  }

  static stringify(instance: ScopedSequenceInstance): string {
    // match/initializeFrom.match 在构造时已 normalize，直接使用统一的实例编码
    // （Entity 引用 -> `uuid::<uuid>`）。
    return stringifyInstance(this, instance);
  }

  static clone(instance: ScopedSequenceInstance): ScopedSequenceInstance {
    return this.create({
      name: instance.name,
      scope: [...instance.scope],
      match: normalizeScopedSequenceMatchExpression(instance.match),
      initialValue: instance.initialValue,
      step: instance.step,
      allowManualValue: instance.allowManualValue,
      initializeFrom: instance.initializeFrom,
    });
  }

  static is(obj: unknown): obj is ScopedSequenceInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'ScopedSequence';
  }

  static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }

  static parse(json: string): ScopedSequenceInstance {
    const data: SerializedData<ScopedSequenceCreateArgs> = JSON.parse(json);
    return this.create({
      ...data.public,
      scope: data.public.scope.map(deserializeScopeItem),
      initializeFrom: deserializeInitializer(data.public.initializeFrom as unknown as (Omit<ScopedSequenceInitializer, 'record'> & { record: SerializedEntityRef | string }) | undefined),
    }, { ...data.options, uuid: data.uuid });
  }
}
