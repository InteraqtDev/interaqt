
type AtomData<T> = {
    type: 'atom',
    data: T
}

type BoolExpressionData<T> = {
    type: 'expression',
    operator: 'and'|'not'|'or',
    left: ExpressionData<T>
    right? : ExpressionData<T>
}

export type ExpressionData<T> = BoolExpressionData<T> | AtomData<T>

export class BoolExpression<T> {
    public static createFromAtom<U>(data: U) {
        return new BoolExpression<U>({ type: 'atom', data })
    }
    constructor(public raw: ExpressionData<T>) {}
    isAtom() {
        return this.raw.type === 'atom'
    }
    get left() {
        return new BoolExpression<T>((this.raw as BoolExpressionData<T>).left)
    }
    get right() {
        return new BoolExpression<T>((this.raw as BoolExpressionData<T>).right)
    }
    get data() {
        return (this.raw as AtomData<T>).data
    }
    isExpression() {
        return this.raw.type === 'expression'
    }
    and(atomValueOrExp: any) {
        return new BoolExpression<T>({
            type: 'expression',
            operator: 'and',
            left: this.raw,
            right: atomValueOrExp instanceof BoolExpression<T> ? atomValueOrExp.raw : { type: 'atom', data: atomValueOrExp}
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
        return new BoolExpression<T>({
            type: 'expression',
            operator: 'or',
            left: this.raw,
            right: atomValueOrExp instanceof BoolExpression<T> ? atomValueOrExp.raw : { type: 'atom', data: atomValueOrExp}
        })
    }
    // 取反
    not() {
        return new BoolExpression<T>({
            type: 'expression',
            operator: 'not',
            left: this.raw,
        })
    }
    map(fn: MapFn<T> , context: string[] =[]): BoolExpression<T> {
        if (this.isExpression()) {
            const newLeft = this.left.map(fn, ['left'])
            if (this.isNot()) {
                return newLeft.not()
            } else {
                const newRight = this.right.map(fn, ['right'])
                return this.isAnd() ? newLeft.and(newRight) : newLeft.or(newRight)
            }
        } else {
            return BoolExpression.createFromAtom<T>(fn(this, context))
        }
    }
}


type MapFn<T> = (object: BoolExpression<T>, context :string[]) => T