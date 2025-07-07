/* @jsx createElement */
import {atom, autorun, once, RenderContext} from 'axii'
export function App({}, { createElement, createPortal }: RenderContext) {

    const portalVisible = atom(false)
    const portalNode = createPortal(() => {
        const containerStyle = {
            position: 'fixed',
            top:0,
            bottom:0,
            left:0,
            right:0,
            background: 'black',
            color: 'white',
            display:'flex',
            justifyContent: 'center',
            alignItems: 'center',
        }
        return (
            <div style={containerStyle} onClick={() => portalVisible(false)}>
                <div>content</div>
            </div>
        )
    }, document.body)

    return <div style={{}}>
        <button onClick={() => portalVisible(true)}>open portal</button>
        {() => portalVisible() ? portalNode : null}
    </div>
}