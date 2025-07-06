/* @jsx createElement */
import {RenderContext, RxDOMScrollPosition} from 'axii'

export function ScrollPosition({}, { createElement }: RenderContext) {

    const innerScrollPosition = new RxDOMScrollPosition()

    return <div style={{display:'flex', flexDirection:'column', alignItems:'center'}} >
        <div>{() => `position: ${innerScrollPosition.value()?.scrollLeft}, ${innerScrollPosition.value()?.scrollTop}`}</div>
        <div  ref={innerScrollPosition.ref} style={{height:100, width:100, overflow:'scroll', border:'1px solid #fff'}}>
            <div style={{height:200, width:100, background:'gray'}}> scroll this </div>
        </div>
    </div>
}