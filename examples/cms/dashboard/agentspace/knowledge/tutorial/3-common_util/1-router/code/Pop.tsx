/* @jsx createElement */
import {Component, RenderContext} from 'axii'
import {Router} from 'router0'
import {RouterContext} from "./RouterContext.js";
import {PopItem} from "./PopItem.js";

export function Pop({}, { createElement, createPortal, context }: RenderContext) {

    const SubRouter = context.get(RouterContext) as typeof Router<Component>
    const router = new SubRouter([{
        path: '/:id',
        handler: PopItem
    }, {
        path: '/',
        redirect: '/1'
    }])

    return <div style={{}}>
        <button onClick={() => router.push('/1')}>1</button>
        <button onClick={() => router.push('/2')}>2</button>
        <button onClick={() => router.push('/3')}>3</button>
        <button onClick={() => router.push('/4')}>4</button>
        <button onClick={() => router.push('/5')}>5</button>
        {() => {
            const Content = router.handler()
            if (!Content) {
                return <div>not found</div>
            }
            return <Content {...router.params()}/>
        }}
    </div>
}