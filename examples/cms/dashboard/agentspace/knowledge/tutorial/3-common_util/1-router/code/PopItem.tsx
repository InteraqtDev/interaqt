/* @jsx createElement */
import {RenderContext} from 'axii'

type Props = {
    id:string
}
export function PopItem({ id }:Props, { createElement, createPortal, context }: RenderContext) {

    return <div style={{}}>
        {`pop item ${id}`}
    </div>
}