import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { stringifyAttribute, indexBy } from './utils.js';
import { parse as parseStr } from 'acorn';

// BoolAtomData
export interface BoolAtomDataInstance extends IInstance {
  type: string;
  data: { content?: Function; [key: string]: unknown };
}

export interface BoolAtomDataCreateArgs {
  type?: string;
  data: { content?: Function; [key: string]: unknown };
}

export class BoolAtomData implements BoolAtomDataInstance {
  public uuid: string;
  public _type = 'BoolAtomData';
  public _options?: { uuid?: string };
  public type: string;
  public data: { content?: Function; [key: string]: unknown };
  
  constructor(args: BoolAtomDataCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.type = args.type || 'atom';
    this.data = args.data;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'BoolAtomData';
  static instances: BoolAtomDataInstance[] = [];
  
  static public = {
    type: {
      type: 'string' as const,
      required: true as const,
      collection: false as const,
      defaultValue: () => 'atom'
    },
    data: {
      instanceType: {} as unknown as { content?: Function; [key: string]: unknown },
      required: true as const,
      collection: false as const,
    }
  };
  
  static create(args: BoolAtomDataCreateArgs, options?: { uuid?: string }): BoolAtomDataInstance {
    const instance = new BoolAtomData(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, BoolAtomData`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: BoolAtomDataInstance): string {
    const args: BoolAtomDataCreateArgs = {
      type: instance.type,
      data: stringifyAttribute(instance.data) as { content?: Function; [key: string]: unknown }
    };
    
    const data: SerializedData<BoolAtomDataCreateArgs> = {
      type: 'BoolAtomData',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: BoolAtomDataInstance, deep: boolean): BoolAtomDataInstance {
    const args: BoolAtomDataCreateArgs = {
      data: instance.data
    };
    if (instance.type !== 'atom') args.type = instance.type;
    
    return this.create(args);
  }
  
  static is(obj: unknown): obj is BoolAtomDataInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'BoolAtomData';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): BoolAtomDataInstance {
    const data: SerializedData<BoolAtomDataCreateArgs> = JSON.parse(json);
    return this.create(data.public, data.options);
  }
}

// BoolExpressionData
export interface BoolExpressionDataInstance extends IInstance {
  type: string;
  operator: 'and' | 'or' | 'not';
  left: BoolAtomDataInstance | BoolExpressionDataInstance;
  right?: BoolAtomDataInstance | BoolExpressionDataInstance;
}

export interface BoolExpressionDataCreateArgs {
  type?: string;
  operator?: 'and' | 'or' | 'not';
  left: BoolAtomDataInstance | BoolExpressionDataInstance;
  right?: BoolAtomDataInstance | BoolExpressionDataInstance;
}

export class BoolExpressionData implements BoolExpressionDataInstance {
  public uuid: string;
  public _type = 'BoolExpressionData';
  public _options?: { uuid?: string };
  public type: string;
  public operator: 'and' | 'or' | 'not';
  public left: BoolAtomDataInstance | BoolExpressionDataInstance;
  public right?: BoolAtomDataInstance | BoolExpressionDataInstance;
  
  constructor(args: BoolExpressionDataCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.type = args.type || 'expression';
    this.operator = args.operator || 'and';
    this.left = args.left;
    this.right = args.right;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'BoolExpressionData';
  static instances: BoolExpressionDataInstance[] = [];
  
  static public = {
    type: {
      type: 'string' as const,
      required: false as const,
      collection: false as const,
      defaultValue: () => 'expression'
    },
    operator: {
      type: 'string' as const,
      required: true as const,
      collection: false as const,
      options: ['and', 'or', 'not'],
      defaultValue: () => 'and'
    },
    left: {
      instanceType: {} as unknown as { content?: Function; [key: string]: unknown },
      required: true as const,
      collection: false as const,
    },
    right: {
      instanceType: {} as unknown as { content?: Function; [key: string]: unknown },
      required: false as const,
      collection: false as const,
    }
  };
  
  static create(args: BoolExpressionDataCreateArgs, options?: { uuid?: string }): BoolExpressionDataInstance {
    const instance = new BoolExpressionData(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, BoolExpressionData`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: BoolExpressionDataInstance): string {
    const args: BoolExpressionDataCreateArgs = {
      type: instance.type,
      operator: instance.operator,
      left: stringifyAttribute(instance.left) as BoolAtomDataInstance | BoolExpressionDataInstance,
      right: instance.right ? stringifyAttribute(instance.right) as BoolAtomDataInstance | BoolExpressionDataInstance : undefined
    };
    
    const data: SerializedData<BoolExpressionDataCreateArgs> = {
      type: 'BoolExpressionData',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: BoolExpressionDataInstance, deep: boolean): BoolExpressionDataInstance {
    const args: BoolExpressionDataCreateArgs = {
      left: instance.left
    };
    if (instance.type !== 'expression') args.type = instance.type;
    if (instance.operator !== 'and') args.operator = instance.operator;
    if (instance.right !== undefined) args.right = instance.right;
    
    return this.create(args);
  }
  
  static is(obj: unknown): obj is BoolExpressionDataInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'BoolExpressionData';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): BoolExpressionDataInstance {
    const data: SerializedData<BoolExpressionDataCreateArgs> = JSON.parse(json);
    return this.create(data.public, data.options);
  }
}

// 兼容性类 - 提供原始的 BoolExp API
export type AtomData<T> = {
  type: 'atom',
  data: T
}

export type BoolExpressionRawData<T> = {
  type: 'expression',
  operator: 'and'|'not'|'or',
  left: ExpressionData<T>
  right? : ExpressionData<T>
}

export type EvaluateError<T> = {
  data:T,
  stack: ExpressionData<T>[],
  error: any,
  inverse: boolean
}

export type ExpressionData<T> = BoolExpressionRawData<T> | AtomData<T>

export type AtomHandle<T> = (arg:T) => boolean|string|Promise<boolean|string>

type MapFn<T, U> = (object: BoolExp<T>, context :string[]) => U | BoolExp<U>

export class BoolExp<T> {
  public static atom<U>(data: U) {
    return new BoolExp<U>({ type: 'atom', data })
  }
  
  public static and<U>(...atomValues:U[]) {
    const atomValueWithoutUndefined = atomValues.filter(v => !!v)
    const [first, ...rest] = atomValueWithoutUndefined
    return rest.reduce((acc, cur) => acc.and(cur), BoolExp.atom(first))
  }
  
  public static or<U>(...atomValues:U[]) {
    const atomValueWithoutUndefined = atomValues.filter(v => !!v)
    const [first, ...rest] = atomValueWithoutUndefined
    return rest.reduce((acc, cur) => acc.or(cur), BoolExp.atom(first))
  }
  
  constructor(public raw: ExpressionData<T>) {
    if (!raw) {
      throw new Error('BoolExp raw data cannot be undefined')
    }
  }
  
  isAtom() {
    return this.raw.type === 'atom'
  }
  
  get type() {
    return this.raw.type
  }
  
  get left() {
    return new BoolExp<T>((this.raw as BoolExpressionRawData<T>).left)
  }
  
  get right(): BoolExp<T>|undefined {
    return (this.raw as BoolExpressionRawData<T>).right ? new BoolExp<T>((this.raw as BoolExpressionRawData<T>).right!) : undefined
  }
  
  get data() {
    return (this.raw as AtomData<T>).data
  }
  
  // 支持序列化和反序列化
  toValue() {
    return this.raw as AtomData<T>
  }
  
  static fromValue<T>(value: ExpressionData<T>) {
    return new BoolExp<T>(value)
  }

  toJSON() {
    return this.raw
  }
  static fromJSON<T>(json: ExpressionData<T>) {
    return new BoolExp<T>(json)
  }
  
  isExpression() {
    return this.raw.type === 'expression'
  }
  
  and(atomValueOrExp: unknown) {
    return new BoolExp<T>({
      type: 'expression',
      operator: 'and',
      left: this.raw,
      right: atomValueOrExp instanceof BoolExp ?
        atomValueOrExp.raw :
        (atomValueOrExp && typeof atomValueOrExp === 'object' && 
         (atomValueOrExp as any).type === 'atom' || (atomValueOrExp as any).type === 'expression') ?
          atomValueOrExp as ExpressionData<T>:
          { type: 'atom', data: atomValueOrExp as T}
    })
  }
  
  isAnd() {
    return (this.raw as BoolExpressionRawData<T>).operator === 'and'
  }
  
  isOr() {
    return (this.raw as BoolExpressionRawData<T>).operator === 'or'
  }
  
  isNot() {
    return (this.raw as BoolExpressionRawData<T>).operator === 'not'
  }
  
  or(atomValueOrExp: unknown) {
    return new BoolExp<T>({
      type: 'expression',
      operator: 'or',
      left: this.raw,
      right: (atomValueOrExp instanceof BoolExp) ? atomValueOrExp.raw : { type: 'atom', data: atomValueOrExp as T}
    })
  }
  
  // 取反
  not() {
    return new BoolExp<T>({
      type: 'expression',
      operator: 'not',
      left: this.raw,
    })
  }
  
  map<U>(fn: MapFn<T, U> , context: string[] =[]): BoolExp<U> {
    if (this.isExpression()) {
      const newLeft = this.left.map(fn, ['left'])
      if (this.isNot()) {
        return newLeft.not()
      } else {
        const newRight = this.right!.map(fn, ['right'])
        return this.isAnd() ? newLeft.and(newRight) : newLeft.or(newRight)
      }
    } else {
      const newAtomData = fn(this, context)
      // 可以返回一个新的 expression
      return newAtomData instanceof BoolExp ? newAtomData : BoolExp.atom<U>(newAtomData)
    }
  }
  
  find(matchFn: (atom: T, context:string[]) => boolean, context: unknown[]): T|undefined {
    if(this.isAtom()) {
      const matched = matchFn(this.data, context as string[])
      if (matched) {
        return this.data
      }
    } else {
      const leftMatched = this.left.find(matchFn, context.concat(this))
      if (leftMatched) {
        return leftMatched
      }
      if (this.right) {
        return this.right.find(matchFn, context.concat(this))
      }
    }
  }
  
  evaluate(atomHandle: AtomHandle<T>, stack :ExpressionData<T>[] = [], inverse: boolean = false): true|EvaluateError<T> {
    const currentStack = stack.concat(this.raw)

    if (this.isAtom()) {
      const data = (this.raw as AtomData<T>).data
      const resultOrErrorMessage = atomHandle(data)
      if (typeof resultOrErrorMessage === 'string') {
        return { data, inverse, stack, error: resultOrErrorMessage }
      }
      const result = resultOrErrorMessage
      const error: EvaluateError<T> = { data, inverse, stack, error: 'atom evaluate error' }
      return (result && !inverse || !result && inverse) ? true : error
    }

    if (this.isOr()) {
      const leftResult = this.left.evaluate(atomHandle, currentStack)
      if (leftResult === true) return true
      return this.right!.evaluate(atomHandle, currentStack)
    }

    if (this.isAnd()) {
      const leftResult = this.left.evaluate(atomHandle, currentStack)
      if (leftResult !== true) return leftResult

      return this.right!.evaluate(atomHandle, currentStack)
    }

    if (this.isNot()) {
      return this.left.evaluate(atomHandle, currentStack, !inverse)
    }

    throw new Error(`invalid bool expression type: ${JSON.stringify(this.raw)}`)
  }
  
  async evaluateAsync(atomHandle: AtomHandle<T>, stack :ExpressionData<T>[] = [], inverse: boolean = false): Promise<true|EvaluateError<T>> {
    const currentStack = stack.concat(this.raw)

    if (this.isAtom()) {
      const data = (this.raw as AtomData<T>).data
      const result = await atomHandle(data)
      const error: EvaluateError<T> = { data, inverse, stack, error: 'atom evaluate error' }
      return (result && !inverse || !result && inverse) ? true : error
    }

    if (this.isOr()) {
      const leftResult = await this.left.evaluateAsync(atomHandle, currentStack)
      if (leftResult === true) return true
      return this.right!.evaluateAsync(atomHandle, currentStack)
    }

    if (this.isAnd()) {
      const leftResult = await this.left.evaluateAsync(atomHandle, currentStack)
      if (leftResult !== true) return leftResult

      return this.right!.evaluateAsync(atomHandle, currentStack)
    }

    if (this.isNot()) {
      return this.left.evaluateAsync(atomHandle, currentStack, !inverse)
    }

    throw new Error(`invalid bool expression type: ${JSON.stringify(this.raw)}`)
  }
}

// Parse 相关的功能
const OperatorNames = {
  '&&': 'and',
  '||': 'or', 
  '!': 'not'
} as const;

type ParseAtomNameToObjectType = (name:string) => unknown;

function defaultParse(key:string) {
  return {key}
}

function astNodeToBoolExpressionNode<T>(astNode: any, optionsByName: {[k:string]: any}, parseAtomNameToObject: ParseAtomNameToObjectType): ExpressionData<T> {
  if (astNode.type === "LogicalExpression") {
    return {
      type: 'expression',
      operator: OperatorNames[astNode.operator as keyof typeof OperatorNames],
      left: astNodeToBoolExpressionNode(astNode.left, optionsByName, parseAtomNameToObject),
      right: astNodeToBoolExpressionNode(astNode.right, optionsByName, parseAtomNameToObject)
    } as BoolExpressionRawData<T>
  }

  if (astNode.type === "Identifier") {
    return {
      type: 'atom',
      data: parseAtomNameToObject(astNode.name) as T
    }
  }

  if (astNode.type ==="UnaryExpression") {
    return {
      type: 'expression',
      operator: 'not',
      left: astNodeToBoolExpressionNode(astNode.argument, optionsByName, parseAtomNameToObject),
    } as BoolExpressionRawData<T>
  }

  throw new Error('unknown ast node type')
}

export function parse<T>(exp: string, options: unknown[] = [], parseAtomNameToObject: ParseAtomNameToObjectType = defaultParse): BoolExp<T> {
  const optionsByName = indexBy(options as any[], 'name')
  const ast = parseStr(exp, {ecmaVersion: 2020} as any)
  return new BoolExp<T>(
    astNodeToBoolExpressionNode<T>((ast.body[0] as any).expression, optionsByName, parseAtomNameToObject)
  )
} 