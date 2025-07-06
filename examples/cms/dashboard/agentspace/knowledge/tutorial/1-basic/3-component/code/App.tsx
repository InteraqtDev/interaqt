/* @jsx createElement */
import {atom, RenderContext} from 'axii'
import {Advanced} from "./Advanced.js";
import {Simple} from "./Simple.js";

export function App({}, { createElement }: RenderContext) {
    const name = atom('world')
    return <div>
        <Simple foo={name}>children from parent</Simple>
        <Advanced/>
    </div>
}