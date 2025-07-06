/* @jsx createElement */
import {atom, autorun, once, RenderContext} from 'axii'
export function App({}, { createElement, useEffect, useLayoutEffect, createRef, createRxRef }: RenderContext) {

    const title = atom('world')
    // autorun executes in the next micro task by default
    autorun(() => {
        // modify browser title
        document.title = `hello ${title()}`
    })

    once(() => {
        // when returning true, it will not execute again
    })

    useEffect(() => {
        // executes at the beginning
        return () => {
            // executes when unmounted
        }
    })

    useLayoutEffect(() => {
        // executes after mounting
        return () => {
            // executes when unmounted
        }
    });

    return <div style={{}}>
        <input value={title} onInput={(e: InputEvent) => title((e.target as HTMLInputElement)!.value)}/>
    </div>
}