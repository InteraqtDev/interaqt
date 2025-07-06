/* @jsx createElement */
import {atom, autorun, ContextProvider, once, RenderContext} from 'axii'
import { Router, createMemoryHistory } from 'router0'
import { Music} from "./Music.js";
import { Sport } from "./Sport.js";
import {RouterContext} from "./RouterContext.js";



export function App({}, { createElement, createPortal }: RenderContext) {

    const router = new Router([{
        path: '/music',
        handler: Music,
    }, {
        path: '/sport',
        handler: Sport,
    }, {
        path: '/',
        redirect: '/music',
    }],  createMemoryHistory() )

    const path = atom(router.history.location.pathname)
    router.history.listen((event) => {
        path(event.location.pathname)
    })

    return <div style={{}}>
        <div>{() => `current path: ${path()}`}</div>
        <div style={{display:'flex', gap:10}}>
            <button onClick={() => router.push('/music')}>music</button>
            <button onClick={() => router.push('/sport')}>sport</button>
        </div>
        <h1>Content</h1>
        <div>
            {() => {
                const Content = router.handler()
                if (!Content) {
                    return <div>not found</div>
                }

                const SubRouter = router.derive(router.path())
                return <ContextProvider contextType={RouterContext} value={SubRouter}>
                    <Content />
                </ContextProvider>
            }}
        </div>
    </div>
}