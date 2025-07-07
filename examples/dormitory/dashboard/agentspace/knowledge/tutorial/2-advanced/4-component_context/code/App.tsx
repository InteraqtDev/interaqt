/* @jsx createElement */
import {ContextProvider, RenderContext} from 'axii'
import {Child} from "./Child.js";
import {RootContext} from "./RootContext.js";

export function App({}, { createElement }: RenderContext) {
    return (
        <div>
            <ContextProvider contextType={RootContext} value={'red'}>
                <Child />
            </ContextProvider>
            <ContextProvider contextType={RootContext} value={'blue'}>
                <Child />
            </ContextProvider>
        </div>
    )
}