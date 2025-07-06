/* @jsx createElement */
import {atom, autorun, once, RenderContext, RxList, RxSet} from 'axii'
import {MixedSelections} from "./MixedSelections.js";
export function App({}, { createElement, createPortal }: RenderContext) {

    const list = new RxList<{id:number, name:string}>([
        {id:1, name: 'a'},
        {id:2, name: 'b'},
        {id:3, name: 'c'},
        {id:4, name: 'd'}
    ])

    const singleSelected = atom<{id:number, name:string} | null>(null)
    const multiSelected = new RxSet<{id:number, name:string}>([])

    const itemBaseStyle = {
        display:'inline-block',
        padding: 4,
        margin:4,
        cursor:'pointer',
    }

    return <div style={{}}>
        <div>
            <h1>Single Selection</h1>
            <div>
                <div>selected: {() => singleSelected()?.name}</div>
                <div>
                    {list.createSelection(singleSelected).map(([item, selected]) => {
                        return (
                            <span
                                style={[
                                    itemBaseStyle,
                                    () => ({border: `1px solid ${selected() ? 'lightblue' : 'black' }`})
                                ]}
                                onClick={() => singleSelected(item)}
                            >
                                {item.name}
                            </span>
                        )
                    })}
                </div>

            </div>
        </div>
        <div>
            <h1>Multiple Selection</h1>
            <div>
                <div>
                    selected: {() => multiSelected.toList().toArray().map(item => item.name).join(',')}
                </div>
                <div>
                    {list.createSelection(multiSelected).map(([item, selected]) => {
                        return (
                            <span
                                style={[
                                    itemBaseStyle,
                                    () => ({border: `1px solid ${selected() ? 'lightblue' : 'black' }`})
                                ]}
                                onClick={() => {
                                    if (selected()) {
                                        multiSelected.delete(item)
                                    } else {
                                        multiSelected.add(item)
                                    }
                                }}
                            >
                            <span>{item.name}</span>
                        </span>
                        )
                    })}
                </div>

            </div>
        </div>
        <MixedSelections/>
    </div>
}