import { generateUUID, IInstance, SerializedData } from './interfaces.js';
import { Entity, type EntityInstance } from './Entity.js';

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
  match?: unknown;
};

export interface ScopedSequenceInstance extends IInstance {
  name: string;
  scope: ScopedSequenceScopeItem[];
  initialValue?: number;
  step?: number;
  allowManualValue?: boolean;
  initializeFrom?: ScopedSequenceInitializer;
}

export interface ScopedSequenceCreateArgs {
  name: string;
  scope: ScopedSequenceScopeItem[];
  initialValue?: number;
  step?: number;
  allowManualValue?: boolean;
  initializeFrom?: ScopedSequenceInitializer;
}

type SerializedEntityRef = {
  _type: 'EntityRef';
  name: string;
  uuid?: string;
};

function serializeEntityRef(entity: EntityInstance): SerializedEntityRef {
  return { _type: 'EntityRef', name: entity.name!, uuid: entity.uuid };
}

function deserializeEntityRef(ref: SerializedEntityRef): EntityInstance {
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

function serializeScopeItem(item: ScopedSequenceScopeItem) {
  return item.type === 'ref' ? { ...item, base: serializeEntityRef(item.base) } : item;
}

function deserializeScopeItem(item: ScopedSequenceScopeItem | (Omit<Extract<ScopedSequenceScopeItem, { type: 'ref' }>, 'base'> & { base: SerializedEntityRef })) {
  return item.type === 'ref' && (item.base as SerializedEntityRef)._type === 'EntityRef'
    ? { ...item, base: deserializeEntityRef(item.base as SerializedEntityRef) }
    : item as ScopedSequenceScopeItem;
}

function serializeInitializer(initializer: ScopedSequenceInitializer | undefined) {
  return initializer ? { ...initializer, record: serializeEntityRef(initializer.record) } : undefined;
}

function deserializeInitializer(initializer: (Omit<ScopedSequenceInitializer, 'record'> & { record: SerializedEntityRef }) | undefined) {
  return initializer ? { ...initializer, record: deserializeEntityRef(initializer.record) } : undefined;
}

export class ScopedSequence implements ScopedSequenceInstance {
  public uuid: string;
  public _type = 'ScopedSequence';
  public _options?: { uuid?: string };
  public name: string;
  public scope: ScopedSequenceScopeItem[];
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
    this.initialValue = args.initialValue;
    this.step = args.step;
    this.allowManualValue = args.allowManualValue;
    this.initializeFrom = args.initializeFrom;
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
    }
  }

  static stringify(instance: ScopedSequenceInstance): string {
    const data: SerializedData<ScopedSequenceCreateArgs> = {
      type: 'ScopedSequence',
      options: instance._options,
      uuid: instance.uuid,
      public: {
        name: instance.name,
        scope: instance.scope.map(serializeScopeItem) as ScopedSequenceScopeItem[],
        initialValue: instance.initialValue,
        step: instance.step,
        allowManualValue: instance.allowManualValue,
        initializeFrom: serializeInitializer(instance.initializeFrom) as ScopedSequenceInitializer | undefined,
      },
    };
    return JSON.stringify(data);
  }

  static clone(instance: ScopedSequenceInstance): ScopedSequenceInstance {
    return this.create({
      name: instance.name,
      scope: [...instance.scope],
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
      initializeFrom: deserializeInitializer(data.public.initializeFrom as unknown as (Omit<ScopedSequenceInitializer, 'record'> & { record: SerializedEntityRef }) | undefined),
    }, data.options);
  }
}
