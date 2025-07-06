/* @jsx createElement */
import {atom, autorun, once, RenderContext, RxList, RxSet} from 'axii'
export function MixedSelections({}, { createElement, createPortal }: RenderContext) {

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
        border: '1px solid black'
    }

    return <div style={{}}>
        <div>
            <h1>Mixed Selections</h1>
            <div>
                <div>single selected: {() => singleSelected()?.name}</div>
                <div>
                    multiple selected: {() => multiSelected.toList().toArray().map(item => item.name).join(',')}
                </div>
                <div>
                    {list.createSelections([singleSelected], [multiSelected]).map(([item, isSingleSelected, isMultipleSelected]) => {
                        const toggleSingleSelected = () => {
                            if (isSingleSelected()) {
                                singleSelected(null)
                            } else {
                                singleSelected(item)
                            }
                        }
                        const toggleMultipleSelected = () => {
                            if (isMultipleSelected()) {
                                multiSelected.delete(item)
                            } else {
                                multiSelected.add(item)
                            }
                        }

                        return (
                            <div style={itemBaseStyle}>
                                <div>
                                    <input type={'checkbox'} value={isSingleSelected}
                                           onChange={toggleSingleSelected}/>
                                </div>
                                <div>
                                    {item.name}
                                </div>
                                <div>
                                    <input type={'checkbox'} value={isMultipleSelected}
                                           onChange={toggleMultipleSelected}/>
                                </div>
                            </div>
                        )
                    })}
                </div>

            </div>
        </div>
    </div>
}