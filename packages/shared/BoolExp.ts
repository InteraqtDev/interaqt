import { parse as parseStr} from 'acorn'
import {assert, indexBy} from "./util";

type AtomData<T> = {
    type: 'atom',
    data: T
}

export type BoolExpressionData<T> = {
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

export type ExpressionData<T> = BoolExpressionData<T> | AtomData<T>

export type AtomHandle<T> = (arg:T) => boolean|Promise<boolean>

export class BoolExp<T> {
    public static atom<U>(data: U) {
        return new BoolExp<U>({ type: 'atom', data })
    }
    constructor(public raw: ExpressionData<T>) {}
    isAtom() {
        return this.raw.type === 'atom'
    }
    get left() {
        return new BoolExp<T>((this.raw as BoolExpressionData<T>).left)
    }
    get right() {
        return new BoolExp<T>((this.raw as BoolExpressionData<T>).right!)
    }
    get data() {
        return (this.raw as AtomData<T>).data
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
        return (this.raw as BoolExpressionData<T>).operator === 'and'
    }
    isOr() {
        return (this.raw as BoolExpressionData<T>).operator === 'or'
    }
    isNot() {
        return (this.raw as BoolExpressionData<T>).operator === 'not'
    }
    or(atomValueOrExp: any) {
        return new BoolExp<T>({
            type: 'expression',
            operator: 'or',
            left: this.raw,
            right: atomValueOrExp instanceof BoolExp<T> ? atomValueOrExp.raw : { type: 'atom', data: atomValueOrExp}
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
    map(fn: MapFn<T> , context: string[] =[]): BoolExp<T> {
        if (this.isExpression()) {
            const newLeft = this.left.map(fn, ['left'])
            if (this.isNot()) {
                return newLeft.not()
            } else {
                const newRight = this.right.map(fn, ['right'])
                return this.isAnd() ? newLeft.and(newRight) : newLeft.or(newRight)
            }
        } else {
            return BoolExp.atom<T>(fn(this, context))
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
            return this.right.evaluate(atomHandle, currentStack)
        }

        if (this.isAnd()) {
            const leftResult = this.left.evaluate(atomHandle, currentStack)
            if (leftResult !== true) return leftResult

            return this.right.evaluate(atomHandle, currentStack)
        }

        if (this.isNot()) {
            return this.left.evaluate(atomHandle, currentStack, !inverse)
        }

        assert(false, `invalid bool expression type: ${JSON.stringify(this.raw)}`)
    }
    async evaluateAsync(atomHandle: AtomHandle<T>, stack :any[] = [], inverse: boolean = false): true|EvaluateError {

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
            return this.right.evaluateAsync(atomHandle, currentStack)
        }

        if (this.isAnd()) {
            const leftResult = await this.left.evaluateAsync(atomHandle, currentStack)
            if (leftResult !== true) return leftResult

            return this.right.evaluateAsync(atomHandle, currentStack)
        }

        if (this.isNot()) {
            return this.left.evaluateAsync(atomHandle, currentStack, !inverse)
        }

        assert(false, `invalid bool expression type: ${JSON.stringify(this.raw)}`)
    }
}


type MapFn<T> = (object: BoolExp<T>, context :string[]) => T


const OperatorNames = {
    '&&': 'and',
    '||': 'or',
    '!': 'not'
}

type ParseAtomNameToObjectType = (name:string) => any
function defaultParse(key:string) {
    return {key}
}

function astNodeToBoolExpressionNode<T>(astNode, optionsByName, parseAtomNameToObject: ParseAtomNameToObjectType): ExpressionData<T> {
    if (astNode.type === "LogicalExpression") {
        return {
            type: 'expression',
            operator: OperatorNames[astNode.operator],
            left: astNodeToBoolExpressionNode(astNode.left, optionsByName, parseAtomNameToObject),
            right: astNodeToBoolExpressionNode(astNode.right, optionsByName, parseAtomNameToObject)
        }
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
        astNodeToBoolExpressionNode<T>(ast.body[0].expression, optionsByName, parseAtomNameToObject)
    )
}