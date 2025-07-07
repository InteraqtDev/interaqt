/* @jsx createElement */
import {RenderContext} from 'axii'
import {ParallelActions} from "./ParallelActions.js";
import {SerialActions} from "./SerialActions.js";
import {SingleActions} from "./SingleActions.js";

export function App({}, { createElement }: RenderContext) {
    return <div>
        <ParallelActions/>
        <SerialActions/>
        <SingleActions/>
    </div>
}