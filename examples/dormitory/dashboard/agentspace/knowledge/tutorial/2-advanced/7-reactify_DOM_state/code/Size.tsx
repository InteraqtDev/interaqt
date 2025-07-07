/* @jsx createElement */
import {atom, RenderContext, RxDOMScrollPosition, RxDOMSize} from 'axii'

export function Size({}, { createElement }: RenderContext) {

    const innerText = atom('inner text')
    const rxSize = new RxDOMSize()

    return <div style={{display:'flex', flexDirection:'column', alignItems:'center'}} >
        <div>{() => JSON.stringify(rxSize.value())}</div>
        <div ref={rxSize.ref}>
            {innerText}
        </div>
        <button onClick={()=>innerText(innerText.raw+' more')}>change text</button>
    </div>
}