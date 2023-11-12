import {describe, test, expect} from "vitest";
import {parse, EvaluateError} from "../../shared/BoolExp";

const handle = (data: AtomType) => /^true/i.test(data.key)

type AtomType = { key: string }

describe('bool expression', () => {
    test('simple variable', () => {

        const exp = `trueA`
        const evaluator = parse<AtomType>(exp)
        expect(evaluator.evaluate(handle)).toBe(true)
    })

    test('simple and op', () => {
        const evaluator = parse<AtomType>(`trueA && trueB`)
        expect(evaluator.evaluate(handle)).toBe(true)

        const evaluator2 = parse<AtomType>(`trueA && falseB`)
        const result = evaluator2.evaluate(handle) as EvaluateError


        expect(result).not.toBe(true)
        expect(result.data.key).toBe('falseB')
        expect(result.stack.length).toBe(1)
        expect(result.stack[0]).toMatchObject({type: 'expression', operator: 'and'})
    })

    test('simple or op', () => {

        const evaluator = parse<AtomType>(`trueA || trueB`)
        expect(evaluator.evaluate(handle)).toBe(true)

        const evaluator2 = parse<AtomType>(`trueA || falseB`)
        expect(evaluator2.evaluate(handle)).toBe(true)

        const evaluator3 = parse<AtomType>(`falseA || falseB`)
        const result = evaluator3.evaluate(handle) as EvaluateError

        expect(result).not.toBe(true)
        expect(result.data.key).toBe('falseB')
        expect(result.stack.length).toBe(1)
        expect(result.stack[0].operator).toBe('or')
    })

    test('group of or op', () => {

        const evaluator = parse<AtomType>(`trueA && (trueB || trueC)`)
        expect(evaluator.evaluate(handle)).toBe(true)

        const evaluator2 = parse<AtomType>(`trueA && (trueB || falseC)`)
        expect(evaluator2.evaluate(handle)).toBe(true)

        const evaluator3 = parse<AtomType>(`trueA  && (falseA || falseB)`)
        const result = evaluator3.evaluate(handle) as EvaluateError
        expect(result).not.toBe(true)
        expect(result.data.key).toBe('falseB')
        expect(result.stack.length).toBe(2)
        expect(result.stack[0]).toMatchObject({type: 'expression', operator: 'and'})
    })

    test('group of or op', () => {

        const evaluator = parse<AtomType>(`trueA && (trueB || trueC)`)
        expect(evaluator.evaluate(handle)).toBe(true)

        const evaluator2 = parse<AtomType>(`trueA && (trueB || falseC)`)
        expect(evaluator2.evaluate(handle)).toBe(true)

        const evaluator3 = parse<AtomType>(`trueA  && (falseA || falseB)`)
        const result = evaluator3.evaluate(handle) as EvaluateError
        expect(result).not.toBe(true)
        expect(result.data.key).toBe('falseB')
        expect(result.stack.length).toBe(2)
        expect(result.stack[0]).toMatchObject({type: 'expression', operator: 'and'})
    })

    test('simple not op', () => {
        const evaluator = parse<AtomType>(`!falseA`)
        expect(evaluator.evaluate(handle)).toBe(true)

        const evaluator2 = parse<AtomType>(`!trueA`)
        const result = evaluator2.evaluate(handle) as EvaluateError
        expect(result).not.toBe(true)
        expect(result.data.key).toBe('trueA')
        expect(result.inverse).toBe(true)
        expect(result.stack.length).toBe(1)
        expect(result.stack[0]).toMatchObject({operator: "not"})
    })
})
