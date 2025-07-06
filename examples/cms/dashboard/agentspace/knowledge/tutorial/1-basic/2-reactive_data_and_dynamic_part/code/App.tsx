/* @jsx createElement */
import {atom, AtomComputed, computed, RenderContext, RxList} from 'axii'
export function App({}, { createElement }: RenderContext) {
    const newItem = atom('')
    const items = new RxList<{name:string}>([])
    const onClickAdd = (e:any) => {
        items.unshift({name:newItem()})
        newItem('')
    }
    return (
        <div>
            <div>
                <input value={newItem} onInput={(e:any) => newItem(e.target.value)}/>
                <button onClick={onClickAdd}>add</button>
            </div>
            <div>
                {items.map((item, index) => {
                    return <div>
                        <span>{index}:</span>
                        <span>{item.name}</span>
                        <span><button onClick={() => items.splice(index(), 1)}>delete</button></span>
                    </div>
                })}
            </div>
            <div style={computed(()=> items.length()>3 ? {color:'red'} : {})}>
                {() => items.length() > 3 ? 'too many' : ''}
            </div>
        </div>
    )
}