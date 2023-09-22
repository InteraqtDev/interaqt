import {describe, test, expect} from "bun:test";
import {BoolExpressionError, BoolExpressionEvaluator, parse} from "../boolExpression";

describe('bool expression', () => {
    test('simple variable', () => {
        const handle = (name: string) => /^true/i.test(name)
        const exp = `trueA`
        const evaluator = new BoolExpressionEvaluator(parse(exp), handle)
        expect(evaluator.evaluate()).toBe(true)
    })

    test('simple and op', () => {
        const handle = (name: string) => /^true/i.test(name)

        const evaluator = new BoolExpressionEvaluator(parse(`trueA && trueB`), handle)
        expect(evaluator.evaluate()).toBe(true)

        const evaluator2 = new BoolExpressionEvaluator(parse(`trueA && falseB`), handle)
        const result = evaluator2.evaluate() as BoolExpressionError
        expect(result).not.toBe(true)
        expect(result.name).toBe('falseB')
        expect(result.stack.length).toBe(1)
        expect(result.stack[0]).toMatchObject({type: 'group', op: '&&'})
    })

    test('simple or op', () => {
        const handle = (name: string) => /^true/i.test(name)

        const evaluator = new BoolExpressionEvaluator(parse(`trueA || trueB`), handle)
        expect(evaluator.evaluate()).toBe(true)

        const evaluator2 = new BoolExpressionEvaluator(parse(`trueA || falseB`), handle)
        expect(evaluator2.evaluate()).toBe(true)

        const evaluator3 = new BoolExpressionEvaluator(parse(`falseA || falseB`), handle)
        const result = evaluator3.evaluate() as BoolExpressionError

        expect(result).not.toBe(true)
        expect(result.name).toBe('||')
        expect(result.stack.length).toBe(0)
        expect(result.error.length).toBe(2)
        expect(result.error[0]).toMatchObject({type: 'variable', name: 'falseA'})
        expect(result.error[1]).toMatchObject({type: 'variable', name: 'falseB'})
    })

    test('group of or op', () => {
        const handle = (name: string) => /^true/i.test(name)

        const evaluator = new BoolExpressionEvaluator(parse(`trueA && (trueB || trueC)`), handle)
        expect(evaluator.evaluate()).toBe(true)

        const evaluator2 = new BoolExpressionEvaluator(parse(`trueA && (trueB || falseC)`), handle)
        expect(evaluator2.evaluate()).toBe(true)

        const evaluator3 = new BoolExpressionEvaluator(parse(`trueA  && (falseA || falseB)`), handle)
        const result = evaluator3.evaluate() as BoolExpressionError
        expect(result).not.toBe(true)
        expect(result.name).toBe('||')
        expect(result.stack.length).toBe(1)
        expect(result.stack[0]).toMatchObject({type: 'group', op: '&&'})
        expect(result.error.length).toBe(2)
        expect(result.error[0]).toMatchObject({type: 'variable', name: 'falseA'})
        expect(result.error[1]).toMatchObject({type: 'variable', name: 'falseB'})
    })

    test('group of or op', () => {
        const handle = (name: string) => /^true/i.test(name)

        const evaluator = new BoolExpressionEvaluator(parse(`trueA && (trueB || trueC)`), handle)
        expect(evaluator.evaluate()).toBe(true)

        const evaluator2 = new BoolExpressionEvaluator(parse(`trueA && (trueB || falseC)`), handle)
        expect(evaluator2.evaluate()).toBe(true)

        const evaluator3 = new BoolExpressionEvaluator(parse(`trueA  && (falseA || falseB)`), handle)
        const result = evaluator3.evaluate() as BoolExpressionError
        expect(result).not.toBe(true)
        expect(result.name).toBe('||')
        expect(result.stack.length).toBe(1)
        expect(result.stack[0]).toMatchObject({type: 'group', op: '&&'})
        expect(result.error.length).toBe(2)
        expect(result.error[0]).toMatchObject({type: 'variable', name: 'falseA'})
        expect(result.error[1]).toMatchObject({type: 'variable', name: 'falseB'})
    })

    test('simple not op', () => {
        const handle = (name: string) => /^true/i.test(name)
        const evaluator = new BoolExpressionEvaluator(parse(`!falseA`), handle)
        expect(evaluator.evaluate()).toBe(true)

        const evaluator2 = new BoolExpressionEvaluator(parse(`!trueA`), handle)
        const result = evaluator2.evaluate() as BoolExpressionError
        expect(result).not.toBe(true)
        expect(result.name).toBe('trueA')
        expect(result.inverse).toBe(true)
        expect(result.stack.length).toBe(1)
        expect(result.stack[0]).toMatchObject({op: "!"})
    })
})
