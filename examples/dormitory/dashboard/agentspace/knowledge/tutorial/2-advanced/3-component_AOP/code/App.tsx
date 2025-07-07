/* @jsx createElement */
import {atom, RenderContext} from 'axii'
import { Child } from "./Child.js";

export function App({}, { createElement }: RenderContext) {
    const name = atom('world')


    return (
        <Child
            $root:style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}
            $main:value ={name}
            $main:style_={() => ({border: '1px solid black', padding: '10px'})}
            $grandChild={{'$root:style': {color: 'cyan'}}}
        />
    )
}