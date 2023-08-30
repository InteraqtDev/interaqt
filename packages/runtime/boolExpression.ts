import { parse as parseStr} from 'acorn'
import {BoolExpression, BoolExpressionNodeTypes, OperatorNames, VariableNode} from "../types/boolExpression";
import {assert, indexBy} from "./util";

export type VariableHandle = (...arg: any[]) => boolean
export type BoolExpressionError = {
    name: string,
    type: string,
    stack: BoolExpression[],
    error: any,
    inverse: boolean
}

export class BoolExpressionEvaluator{
    constructor(public expression: BoolExpression, public variableHandle: VariableHandle) {

    }
    evaluate(expression = this.expression, stack: BoolExpression[] = [], inverse: boolean = false) :  BoolExpressionError| true{
        const currentStack = stack.concat(expression)
        if (expression.type === 'variable') {
            const result = this.variableHandle(expression.name)
            const error = { type: expression.type, name: (expression as VariableNode).name, inverse, stack, error: 'variable evaluate error' }
            return (result && !inverse || !result && inverse) ? true : error

        } else if (expression.type === 'group') {
            if (expression.op === OperatorNames['||'] || (expression.op === OperatorNames['&&'] && inverse)) {
                const leftRes = this.evaluate(expression.left, currentStack)
                if (leftRes === true) return true
                const rightRes = this.evaluate(expression.right, currentStack)
                return rightRes === true ? true : { name: expression.op, type: expression.type, stack, error: [leftRes, rightRes], inverse }

                // TODO
                // @ts-ignore
            } else if (expression.op === OperatorNames['&&'] || (expression.op === OperatorNames['||'] && inverse)) {
                const leftRes = this.evaluate(expression.left, currentStack)
                if (leftRes !== true) return leftRes

                return this.evaluate(expression.right, currentStack)
            } else if (expression.op === OperatorNames['!']) {
                return this.evaluate(expression.left, currentStack, !inverse)
            }
        } else {
            // 这里的数据由于是 浏览器端 acorn 解析出来的，所以确实可能出问题。
            // @ts-ignore
            assert(false, `invalid bool expression type: ${expression!.type}`)
        }
        return true
    }
}

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
        debugger
        throw new Error('unknown ast node type')
    }
}

export function parse(exp: string, options: any[] = []) {
    const optionsByName = indexBy(options, 'name')
    const ast = parseStr(exp, {ecmaVersion: 2020})
    // @ts-ignore
    return astNodeToAttrNode(ast.body[0].expression, optionsByName)
}