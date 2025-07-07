/* @jsx createElement */
import {atom, RenderContext} from 'axii'
export function App({}, { createElement }: RenderContext) {
    const name = atom('world')
    const onInput = (e:any) => name(e.target.value)
    return <div>
        <div><input value={name} onInput={onInput}/></div>
        <div>hello <span>{name}</span></div>
    </div>
}