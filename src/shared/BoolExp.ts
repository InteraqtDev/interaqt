import {Expression, ExpressionStatement, parse as parseStr} from 'acorn'
import {assert, indexBy} from "./utils.js";
import {createClass, Klass, KlassInstance, KlassInstancePrimitiveProps, KlassMeta} from "./createClass.js";
//
type AtomData<T> = {
    type: 'atom',
    data: T
}

export type BoolExpressionRawData<T> = {
    type: 'expression',
    operator: 'and'|'not'|'or',
    left: ExpressionData<T>
    right? : ExpressionData<T>
}

export type EvaluateError = {
    data:any,
    stack: any[],
    error: any,
    inverse: boolean
}

export type ExpressionData<T> = BoolExpressionRawData<T> | AtomData<T>

export type AtomHandle<T> = (arg:T) => boolean|Promise<boolean>

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
            debugger
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
    static fromValue<T>(value:  ExpressionData<T>) {
        return new BoolExp<T>(value)
    }
    isExpression() {
        return this.raw.type === 'expression'
    }
    and(atomValueOrExp: any) {
        return new BoolExp<T>({
            type: 'expression',
            operator: 'and',
            left: this.raw,
            right: atomValueOrExp instanceof BoolExp ?
                atomValueOrExp.raw :
                (atomValueOrExp.type === 'atom' || atomValueOrExp.type === 'expression') ?
                    atomValueOrExp:
                    { type: 'atom', data: atomValueOrExp}
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
    or(atomValueOrExp: any) {
        return new BoolExp<T>({
            type: 'expression',
            operator: 'or',
            left: this.raw,
            right: (atomValueOrExp instanceof BoolExp) ? atomValueOrExp.raw : { type: 'atom', data: atomValueOrExp}
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
    find(matchFn: (atom: T, context:string[]) => boolean, context: any[]): T|undefined {
        if(this.isAtom()) {
            const matched = matchFn(this.data, context)
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
    evaluate(atomHandle: AtomHandle<T>, stack :any[] = [], inverse: boolean = false): true|EvaluateError {

        const currentStack = stack.concat(this.raw)

        if (this.isAtom()) {
            const data = (this.raw as AtomData<T>).data
            const result = atomHandle(data)
            const error = { data, inverse, stack, error: 'atom evaluate error' }
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

        assert(false, `invalid bool expression type: ${JSON.stringify(this.raw)}`)
        return true
    }
    async evaluateAsync(atomHandle: AtomHandle<T>, stack :any[] = [], inverse: boolean = false): Promise<true|EvaluateError> {

        const currentStack = stack.concat(this.raw)

        if (this.isAtom()) {
            const data = (this.raw as AtomData<T>).data
            const result = await atomHandle(data)
            const error = { data, inverse, stack, error: 'atom evaluate error' }
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

        assert(false, `invalid bool expression type: ${JSON.stringify(this.raw)}`)
        return true
    }
}


type MapFn<T, U> = (object: BoolExp<T>, context :string[]) => U | BoolExp<U>


const OperatorNames = {
    '&&': 'and',
    '||': 'or',
    '!': 'not'
}

type ParseAtomNameToObjectType = (name:string) => any
function defaultParse(key:string) {
    return {key}
}

function astNodeToBoolExpressionNode<T>(astNode: Expression, optionsByName: {[k:string]: any}, parseAtomNameToObject: ParseAtomNameToObjectType): ExpressionData<T> {
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
            data: parseAtomNameToObject(astNode.name)
        }
    }

    if (astNode.type ==="UnaryExpression") {
        return {
            type: 'expression',
            operator: 'not',
            left: astNodeToBoolExpressionNode(astNode.argument, optionsByName, parseAtomNameToObject),
        }
    }

    throw new Error('unknown ast node type')
}

export function parse<T>(exp: string, options: any[] = [], parseAtomNameToObject: ParseAtomNameToObjectType = defaultParse) {
    const optionsByName = indexBy(options, 'name')
    const ast = parseStr(exp, {ecmaVersion: 2020})
    return new BoolExp<T>(
        astNodeToBoolExpressionNode<T>((ast.body[0] as ExpressionStatement).expression, optionsByName, parseAtomNameToObject)
    )
}

type CommonAtomPublic = {
    content: {
        type: 'function',
        required: true,
        collection: false
    }
}

export type BoolAtomPublic = {
    type: {
        type: 'string',
        required: true,
    },
    data: {
        type: Klass<CommonAtomPublic>,
        required: true,
    }
}

export const  BoolAtomData: Klass<BoolAtomPublic> = createClass({
    name: 'BoolAtomData',
    public: {
        type: {
            type: 'string',
            required: true,
            collection: false,
            defaultValue: () => 'atom'
        },
        data: {
            type: {} as unknown as Klass<CommonAtomPublic>,
            instanceType: {} as unknown as KlassInstance<Klass<CommonAtomPublic>>,
            required: true,
            collection: false,
        }
    }
})



export type UnwrappedBoolExpressionInstanceType<T extends NonNullable<KlassMeta["public"]>>  = {
    type: string,
    operator: string,
    left: UnwrappedBoolExpressionInstanceType<T> | KlassInstance<typeof BoolAtomData>,
    right?: UnwrappedBoolExpressionInstanceType<T> | KlassInstance<typeof BoolAtomData>,
} & KlassInstancePrimitiveProps

export const BoolExpressionData = createClass({
    name: 'BoolExpressionData',
    public: {
        type: {
            type: 'string',
            required: false,
            collection: false,
            defaultValue: () => 'expression'
        },
        operator: {
            type: 'string',
            required: true,
            collection: false,
            options: ['and', 'or', 'not'],
            defaultValue: () => 'and'
        },
        left: {
            instanceType: {} as unknown as (KlassInstance<Klass<BoolAtomPublic>> | UnwrappedBoolExpressionInstanceType<any>),
            required: true,
            collection: false,
        },
        right: {
            instanceType: {} as unknown as (KlassInstance<Klass<BoolAtomPublic>> | UnwrappedBoolExpressionInstanceType<any>),
            required: false,
            collection: false,
        }
    }
})


