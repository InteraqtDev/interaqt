import { IInstance, SerializedData, generateUUID } from './interfaces.js';

const validNameFormatExp = /^[a-zA-Z0-9_]+$/;

export type ConstraintPredicateValue = string | number | boolean | null;

export type ConstraintPredicateOperator =
  | { op: 'isNull' }
  | { op: 'isNotNull' }
  | { op: 'equals'; value: ConstraintPredicateValue }
  | { op: 'notEquals'; value: ConstraintPredicateValue }
  | { op: 'in'; value: ConstraintPredicateValue[] }
  | { op: 'notIn'; value: ConstraintPredicateValue[] };

export type ConstraintPredicate = {
  [propertyName: string]: ConstraintPredicateOperator;
};

export interface UniqueConstraintInstance extends IInstance {
  name: string;
  properties: string[];
  where?: ConstraintPredicate;
  violationCode?: string;
}

export interface NonNullConstraintInstance extends IInstance {
  name: string;
  property: string;
  violationCode?: string;
}

export type ConstraintInstance = UniqueConstraintInstance | NonNullConstraintInstance;

export interface UniqueConstraintCreateArgs {
  name: string;
  properties: string[];
  where?: ConstraintPredicate;
  violationCode?: string;
}

export interface NonNullConstraintCreateArgs {
  name: string;
  property: string;
  violationCode?: string;
}

export class UniqueConstraint implements UniqueConstraintInstance {
  public uuid: string;
  public _type = 'UniqueConstraint';
  public _options?: { uuid?: string };
  public name: string;
  public properties: string[];
  public where?: ConstraintPredicate;
  public violationCode?: string;

  constructor(args: UniqueConstraintCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.name = args.name;
    this.properties = args.properties;
    this.where = args.where;
    this.violationCode = args.violationCode;
  }

  static isKlass = true as const;
  static displayName = 'UniqueConstraint';
  static instances: UniqueConstraintInstance[] = [];

  static public = {
    name: {
      type: 'string' as const,
      required: true as const,
      constraints: {
        nameFormat: ({name}: { name: string }) => validNameFormatExp.test(name)
      }
    },
    properties: {
      type: 'string' as const,
      collection: true as const,
      required: true as const,
      constraints: {
        nonEmpty: ({properties}: { properties: string[] }) => properties.length > 0,
        eachNameUnique: ({properties}: { properties: string[] }) => {
          const uniqueNames = new Set(properties);
          return uniqueNames.size === properties.length;
        }
      }
    },
    where: {
      type: 'object' as const,
      collection: false as const,
      required: false as const,
    },
    violationCode: {
      type: 'string' as const,
      collection: false as const,
      required: false as const,
    }
  };

  static create(args: UniqueConstraintCreateArgs, options?: { uuid?: string }): UniqueConstraintInstance {
    const instance = new UniqueConstraint(args, options);
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, UniqueConstraint`);
    }
    this.instances.push(instance);
    return instance;
  }

  static stringify(instance: UniqueConstraintInstance): string {
    const args: UniqueConstraintCreateArgs = {
      name: instance.name,
      properties: instance.properties,
      where: instance.where,
      violationCode: instance.violationCode,
    };

    const data: SerializedData<UniqueConstraintCreateArgs> = {
      type: 'UniqueConstraint',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }

  static clone(instance: UniqueConstraintInstance): UniqueConstraintInstance {
    return this.create({
      name: instance.name,
      properties: [...instance.properties],
      where: instance.where ? { ...instance.where } : undefined,
      violationCode: instance.violationCode,
    });
  }

  static is(obj: unknown): obj is UniqueConstraintInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'UniqueConstraint';
  }

  static check(data: unknown): boolean {
    return this.is(data);
  }

  static parse(json: string): UniqueConstraintInstance {
    const data: SerializedData<UniqueConstraintCreateArgs> = JSON.parse(json);
    return this.create(data.public, data.options);
  }
}

export class NonNullConstraint implements NonNullConstraintInstance {
  public uuid: string;
  public _type = 'NonNullConstraint';
  public _options?: { uuid?: string };
  public name: string;
  public property: string;
  public violationCode?: string;

  constructor(args: NonNullConstraintCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.name = args.name;
    this.property = args.property;
    this.violationCode = args.violationCode;
  }

  static isKlass = true as const;
  static displayName = 'NonNullConstraint';
  static instances: NonNullConstraintInstance[] = [];

  static public = {
    name: {
      type: 'string' as const,
      required: true as const,
      constraints: {
        nameFormat: ({name}: { name: string }) => validNameFormatExp.test(name)
      }
    },
    property: {
      type: 'string' as const,
      required: true as const,
    },
    violationCode: {
      type: 'string' as const,
      required: false as const,
    }
  };

  static create(args: NonNullConstraintCreateArgs, options?: { uuid?: string }): NonNullConstraintInstance {
    const instance = new NonNullConstraint(args, options);
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, NonNullConstraint`);
    }
    this.instances.push(instance);
    return instance;
  }

  static stringify(instance: NonNullConstraintInstance): string {
    const args: NonNullConstraintCreateArgs = {
      name: instance.name,
      property: instance.property,
      violationCode: instance.violationCode,
    };

    const data: SerializedData<NonNullConstraintCreateArgs> = {
      type: 'NonNullConstraint',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }

  static clone(instance: NonNullConstraintInstance): NonNullConstraintInstance {
    return this.create({
      name: instance.name,
      property: instance.property,
      violationCode: instance.violationCode,
    });
  }

  static is(obj: unknown): obj is NonNullConstraintInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'NonNullConstraint';
  }

  static check(data: unknown): boolean {
    return this.is(data);
  }

  static parse(json: string): NonNullConstraintInstance {
    const data: SerializedData<NonNullConstraintCreateArgs> = JSON.parse(json);
    return this.create(data.public, data.options);
  }
}
