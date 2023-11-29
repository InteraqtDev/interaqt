import { parse as parseStr} from 'acorn'
import {BoolExpression, BoolExpressionNodeTypes, OperatorNames, VariableNode} from "./types/boolExpression";
import {assert, indexBy} from "./util";

 // @ts-ignore
function astNodeToAttrNode(astNode, optionsByName): BoolExpression {
    if (astNode.type === "LogicalExpression") {
        return {
            type: BoolExpressionNodeTypes.group,
            // @ts-ignore
            op: OperatorNames[astNode.operator],
            left: astNodeToAttrNode(astNode.left, optionsByName),
            right: astNodeToAttrNode(astNode.right, optionsByName)
        }
    } else if (astNode.type === "Identifier") {
        return {
            type: BoolExpressionNodeTypes.variable,
            name: astNode.name,
            uuid: optionsByName[astNode.name]?.uuid
        }
    } else if (astNode.type ==="UnaryExpression") {
        return {
            type: BoolExpressionNodeTypes.group,
            op: OperatorNames['!'],
            left: astNodeToAttrNode(astNode.argument, optionsByName)
        }
    } else {
        throw new Error('unknown ast node type')
    }
}

export function parse(exp: string, options: any[] = []) {
    const optionsByName = indexBy(options, 'name')
    const ast = parseStr(exp, {ecmaVersion: 2020})
    // @ts-ignore
    return astNodeToAttrNode(ast.body[0].expression, optionsByName)
}