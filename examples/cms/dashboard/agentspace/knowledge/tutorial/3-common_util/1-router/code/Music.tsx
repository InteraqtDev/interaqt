/* @jsx createElement */
import {atom, autorun, Component, ContextProvider, once, RenderContext} from 'axii'
import { Router } from 'router0'
import {RouterContext} from "./RouterContext.js";
import {Pop} from "./Pop.js";
import {Jazz} from "./Jazz.js";
export function Music({}, { createElement, createPortal, context }: RenderContext) {

    const SubRouter = context.get(RouterContext) as typeof Router<Component>
    const router = new SubRouter([{
        path: '/pop',
        handler: Pop
    }, {
        path: '/jazz',
        handler: Jazz
    }, {
        path: '/',
        redirect: '/pop',
    }])


    return <div style={{}}>
        <div style={{display: 'flex', gap: 10}}>
            <button onClick={() => router.push('/pop')}>pop</button>
            <button onClick={() => router.push('/jazz')}>jazz</button>
        </div>
        {() => {
            const Content = router.handler()
            if (!Content) {
                return <div>not found</div>
            }

            const subRouter = router.derive(router.path())
            return <ContextProvider contextType={RouterContext} value={subRouter}>
                <Content />
            </ContextProvider>
        }}
    </div>
}