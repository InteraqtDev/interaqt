
export const OperatorNames = {
    '||': '||',
    '&&': '&&',
    '!': '!',
}

export const enum BoolExpressionNodeTypes {
    group= 'group',
    variable = 'variable'
}

export type BoolExpression = GroupNode|VariableNode

export type GroupNode = {
    type: BoolExpressionNodeTypes.group,
    op: string,
    left: BoolExpression,
    right?: BoolExpression
}


export type VariableNode = {
    type: BoolExpressionNodeTypes.variable
    name: string,
    [k: string]: any
}