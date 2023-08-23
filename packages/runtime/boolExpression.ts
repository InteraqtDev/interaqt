import {AND, BoolExpression, FunctionBool, InteractionStackComputation, NOT, OR} from "../../base/types";

type Evaluator = (expression: BoolExpression, ...args: any[]) => boolean

export const BoolExpressionEvaluator = new Map<string, Evaluator>()


BoolExpressionEvaluator.set('interactionStackComputation', (expression, evaluate, ...args) => {
    return evaluate((expression as InteractionStackComputation<any>).body, ...args)
})

BoolExpressionEvaluator.set('functionBool', (expression, evaluate, ...args) => {
    return (expression as FunctionBool<any>).body(...args)
})

BoolExpressionEvaluator.set('and', (expression, evaluate, ...args) => {
    return evaluate((expression as AND).left, ...args) && evaluate((expression as AND).right, ...args)
})

BoolExpressionEvaluator.set('or', (expression, evaluate, ...args) => {
    return evaluate((expression as OR).left, ...args) || evaluate((expression as AND).right, ...args)
})

BoolExpressionEvaluator.set('not', (expression, evaluate, ...args) => {
    return !evaluate((expression as NOT).body, ...args)
})

// TODO comparable


export function evaluate(expression: BoolExpression, ...args: any[]) {
    return (BoolExpressionEvaluator.get(expression.type)!)(expression, evaluate, ...args)
}