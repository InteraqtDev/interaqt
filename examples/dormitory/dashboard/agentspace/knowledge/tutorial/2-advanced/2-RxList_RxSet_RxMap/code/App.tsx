/* @jsx createElement */
import {atom, RenderContext, RxList} from 'axii'
export function App({}, { createElement }: RenderContext) {

    const source = new RxList([1, 2, 3])
    const doubleMapRuns = atom(0)
    const double = new RxList(() => source.map(i => {
        doubleMapRuns(doubleMapRuns.raw + 1)
        return i * 2
    }).toArray())

    const incrementalDoubleMapRuns = atom(0)
    const incrementalDouble = source.map(i => {
        incrementalDoubleMapRuns(incrementalDoubleMapRuns.raw + 1)
        return i * 2
    })


    return <div>
        <div>
            <button onClick={() => source.push(source.length() + 1)}>add</button>
        </div>
        <div>
            <div>{() => `double map runs: ${doubleMapRuns()}`}</div>
            {double.map((item) => <div>{item}</div>)}
        </div>
        <div>
            <div>{() => `incremental double map runs: ${incrementalDoubleMapRuns}`}</div>
            {incrementalDouble.map((item) => <div>{item}</div>)}
        </div>
    </div>
}