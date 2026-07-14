import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { stringifyInstance, decodeFunctionValues } from './utils.js';

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
    return stringifyInstance(this, instance);
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
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid });
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
    // static.public.operator.options 此前从未接线（r26 I-3 / r16#4 家族）：
    //  非法 operator 被声明期静默接受，直到首次 dispatch 求值才以 "invalid bool expression type" 暴露。
    //  and/or 缺 right 是既有合法写法（单边包装），不在此收紧。
    const operator = args.operator ?? 'and'
    if (operator !== 'and' && operator !== 'or' && operator !== 'not') {
      throw new Error(`BoolExpressionData operator "${String(operator)}" is invalid. Supported operators: 'and', 'or', 'not'.`)
    }
    if (operator === 'not' && args.right !== undefined) {
      throw new Error(`BoolExpressionData operator 'not' takes only a left operand; do not provide right.`)
    }

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
    return stringifyInstance(this, instance);
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
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid });
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
  error: string,
  inverse: boolean
}

export type ExpressionData<T> = BoolExpressionRawData<T> | AtomData<T>

export type AtomHandle<T> = (arg:T) => boolean|string|Promise<boolean|string>

type MapFn<T, U> = (object: BoolExp<T>, context :string[]) => U | BoolExp<U>

export class BoolExp<T> {
  public static atom<U>(data: U) {
    return new BoolExp<U>({ type: 'atom', data })
  }
  
  // CAUTION only null/undefined are treated as "no atom": falsy values like 0/false/''
  //  are legal atom data and must be kept.
  public static and<U>(...atomValues:U[]) {
    const atomValueWithoutEmpty = atomValues.filter(v => v != null)
    if (atomValueWithoutEmpty.length === 0) {
      return undefined
    }
    const [first, ...rest] = atomValueWithoutEmpty
    return rest.reduce((acc, cur) => acc.and(cur), first instanceof BoolExp ? first : new BoolExp<U>(BoolExp.standardizeData<U>(first)))
  }
  
  public static or<U>(...atomValues:U[]) {
    const atomValueWithoutEmpty = atomValues.filter(v => v != null)
    if (atomValueWithoutEmpty.length === 0) {
      return undefined
    }
    const [first, ...rest] = atomValueWithoutEmpty
    return rest.reduce((acc, cur) => acc.or(cur), first instanceof BoolExp ? first : new BoolExp<U>(BoolExp.standardizeData<U>(first)))
  }
  
  constructor(public raw: ExpressionData<T>) {
    if (!raw) {
      throw new Error('BoolExp raw data cannot be undefined')
    }
    if (raw.type !== 'atom' && raw.type !== 'expression') {
      throw new Error(`invalid bool expression type: ${JSON.stringify(raw)}`)
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
  
  static fromValue<T>(value: ExpressionData<T> | BoolExp<T>) {
    if (value instanceof BoolExp) {
      return value
    }
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

  static isExpressionData(value: unknown): value is ExpressionData<unknown> {
    return value !== null && typeof value === 'object' && 'type' in value &&
      ((value as { type: unknown }).type === 'atom' || (value as { type: unknown }).type === 'expression')
  }

  static standardizeData<T>(atomValueOrExp: unknown) :ExpressionData<T> {
    if (atomValueOrExp instanceof BoolExp) return atomValueOrExp.raw
    if (BoolExp.isExpressionData(atomValueOrExp)) return atomValueOrExp as ExpressionData<T>
    return { type: 'atom', data: atomValueOrExp as T}
  }
  
  and(atomValueOrExp: unknown) {
    return new BoolExp<T>({
      type: 'expression',
      operator: 'and',
      left: this.raw,
      right: BoolExp.standardizeData<T>(atomValueOrExp)
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
    // CAUTION 与 and() 保持一致：raw ExpressionData 必须保留为子表达式，
    //  而不是整棵包成一个 atom（否则组合条件被静默当作单个原子求值）。
    return new BoolExp<T>({
      type: 'expression',
      operator: 'or',
      left: this.raw,
      right: BoolExp.standardizeData<T>(atomValueOrExp)
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
        // 单边 and/or（缺 right）＝左透传（与 evaluate/evaluateAsync 同一契约）。
        if (!this.right) return newLeft
        const newRight = this.right.map(fn, ['right'])
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
      // fail-closed: an async handler passed to the sync entry point would otherwise be
      // evaluated as a truthy Promise and silently make every atom pass.
      if (resultOrErrorMessage instanceof Promise) {
        throw new Error('BoolExp.evaluate received a Promise from the atom handler. Use evaluateAsync for async handlers.')
      }
      if (typeof resultOrErrorMessage === 'string') {
        return { data, inverse, stack, error: resultOrErrorMessage }
      }
      // fail-closed: atom handler 的契约是显式返回 boolean（或错误字符串）。按 truthiness 求值
      //  会让类型错误的返回值静默决定判定方向——falsy 的 null/0/'' 在 not(...) 下被取反成"通过"
      //  （与 r19 F-1 同族的 fail-open 形态，只是发生在 handler 协议层）。协议违规按错误处理，
      //  无论处于什么极性下都判失败。
      if (typeof resultOrErrorMessage !== 'boolean') {
        return { data, inverse, stack, error: `atom handler returned ${resultOrErrorMessage === undefined ? 'undefined' : JSON.stringify(resultOrErrorMessage)} (${typeof resultOrErrorMessage}); it must explicitly return a boolean or an error string (did you forget a return statement, or a !! coercion?)` }
      }
      const result = resultOrErrorMessage
      const error: EvaluateError<T> = { data, inverse, stack, error: 'atom evaluate error' }
      return (result && !inverse || !result && inverse) ? true : error
    }

    // CAUTION `inverse` 必须贯穿 and/or 子树（De Morgan），而不仅仅作用于 atom 与 not 的直接子节点。
    //  历史实现里 and/or 分支丢弃 inverse、以原义求值 —— `NOT(A OR B)` 于是退化成 `A OR B`，
    //  在 Interaction 守卫（Conditions 用 BoolExp 组合 + not）下是权限 fail-open：本应「A、B 皆不成立才放行」
    //  却在 A 成立时静默放行。取反下算子按 De Morgan 翻转：NOT(A OR B) ≡ (NOT A) AND (NOT B)，
    //  NOT(A AND B) ≡ (NOT A) OR (NOT B)。短路与错误透传语义保持不变。
    if (this.isOr() || this.isAnd()) {
      const evaluatesAsAnd = inverse ? this.isOr() : this.isAnd()
      // CAUTION 单边 and/or（缺 right）是声明期合法形态（BoolExpressionData.create({ left }) 的
      //  单边包装，r26 I-3 明确不收紧）——求值语义 = 左操作数直接透传（and/or 的幺元语义）。
      //  此前这里抛 "missing the right operand"：声明期合法的 Conditions 让每次 dispatch
      //  都以内部错误失败，而不是按守卫语义求值。inverse 随左子树正常传播。
      const right = this.right
      const leftResult = this.left.evaluate(atomHandle, currentStack, inverse)
      if (!right) return leftResult
      if (evaluatesAsAnd) {
        if (leftResult !== true) return leftResult
        return right.evaluate(atomHandle, currentStack, inverse)
      }
      if (leftResult === true) return true
      return right.evaluate(atomHandle, currentStack, inverse)
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
      const resultOrErrorMessage = await atomHandle(data)
      
      // If atomHandle returns a string, treat it as an error message
      if (typeof resultOrErrorMessage === 'string') {
        return { data, inverse, stack, error: resultOrErrorMessage }
      }
      // fail-closed：与同步 evaluate 同一契约（handler 必须显式返回 boolean），
      //  防止 falsy 的协议违规值在 not(...) 下被取反成"通过"。
      if (typeof resultOrErrorMessage !== 'boolean') {
        return { data, inverse, stack, error: `atom handler returned ${resultOrErrorMessage === undefined ? 'undefined' : JSON.stringify(resultOrErrorMessage)} (${typeof resultOrErrorMessage}); it must explicitly return a boolean or an error string (did you forget a return statement, or a !! coercion?)` }
      }
      
      const result = resultOrErrorMessage
      const error: EvaluateError<T> = { data, inverse, stack, error: 'atom evaluate error' }
      return (result && !inverse || !result && inverse) ? true : error
    }

    // CAUTION 与同步 evaluate 保持同一套 De Morgan 语义：inverse 必须贯穿 and/or 子树。
    //  这是守卫链（evaluateAsync）实际走的路径，NOT 组合的权限判定正确性依赖于此。
    if (this.isOr() || this.isAnd()) {
      const evaluatesAsAnd = inverse ? this.isOr() : this.isAnd()
      // 单边 and/or 透传左操作数（与同步 evaluate 同一契约，见其 CAUTION）。
      const right = this.right
      const leftResult = await this.left.evaluateAsync(atomHandle, currentStack, inverse)
      if (!right) return leftResult
      if (evaluatesAsAnd) {
        if (leftResult !== true) return leftResult
        return right.evaluateAsync(atomHandle, currentStack, inverse)
      }
      if (leftResult === true) return true
      return right.evaluateAsync(atomHandle, currentStack, inverse)
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

type AstNode = {
  type: string;
  operator?: string;
  name?: string;
  left?: AstNode;
  right?: AstNode;
  argument?: AstNode;
}

function astNodeToBoolExpressionNode<T>(astNode: AstNode, optionsByName: Record<string, unknown>, parseAtomNameToObject: ParseAtomNameToObjectType): ExpressionData<T> {
  if (astNode.type === "LogicalExpression") {
    return {
      type: 'expression',
      operator: OperatorNames[astNode.operator as keyof typeof OperatorNames],
      left: astNodeToBoolExpressionNode(astNode.left!, optionsByName, parseAtomNameToObject),
      right: astNodeToBoolExpressionNode(astNode.right!, optionsByName, parseAtomNameToObject)
    } as BoolExpressionRawData<T>
  }

  if (astNode.type === "Identifier") {
    return {
      type: 'atom',
      data: parseAtomNameToObject(astNode.name!) as T
    }
  }

  if (astNode.type ==="UnaryExpression") {
    return {
      type: 'expression',
      operator: 'not',
      left: astNodeToBoolExpressionNode(astNode.argument!, optionsByName, parseAtomNameToObject),
    } as BoolExpressionRawData<T>
  }

  throw new Error('unknown ast node type')
}
