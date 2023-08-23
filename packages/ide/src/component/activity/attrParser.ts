import * as acorn from 'acorn'


export const enum OperatorNames {
    '||' = '||',
    '&&' = '&&',
    '!' = '!',
}

export const enum AttrNodeTypes {
    group= 'group',
    variable = 'variable'
}

export type AttrNode = GroupNode|VariableNode

export type GroupNode = {
    type: AttrNodeTypes
    op: OperatorNames,
    left: AttrNode,
    right?: AttrNode
}


export type VariableNode = {
    type: 'variable'
    name: string
}

function astNodeToAttrNode(astNode): AttrNode {
    if (astNode.type === "LogicalExpression") {
        return {
            type: AttrNodeTypes.group,
            op: OperatorNames[astNode.operator],
            left: astNodeToAttrNode(astNode.left),
            right: astNodeToAttrNode(astNode.right)
        }
    } else if (astNode.type === "Identifier") {
        return {
            type: AttrNodeTypes.variable,
            name: astNode.name
        }
    } else if (astNode.type ==="UnaryExpression") {
        return {
            type: AttrNodeTypes.group,
            op: OperatorNames['!'],
            left: astNodeToAttrNode(astNode.argument)

        }
    } else {
        debugger
        throw new Error('unknown ast node type')
    }
}

export function parse(exp: string) {
    const ast = acorn.parse(exp, {ecmaVersion: 2020})
    return astNodeToAttrNode(ast.body[0].expression)
}



