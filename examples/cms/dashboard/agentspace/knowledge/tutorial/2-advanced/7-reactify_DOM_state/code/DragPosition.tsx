/* @jsx createElement */
import {atom, computed, DragPosition, RenderContext, RxDOMDragPosition, RxDOMScrollPosition} from 'axii'

export function ReactiveDragPosition({}, { createElement, createRef }: RenderContext) {

    const containerRef = createRef()
    const rxDragPosition = new RxDOMDragPosition(atom<DragPosition>(null), containerRef)
    const containerStyle = {
        position:'relative',
        height: 200,
        width: 200,
        border: '1px solid white',
        overflow: 'hidden',
    }

    const itemStyle = computed(({lastValue}) => {
        const dragPosition = rxDragPosition.value()
        return {
            position: 'absolute',
            cursor: 'pointer',
            userSelect:'none',
            top: dragPosition ? (dragPosition.clientY-dragPosition.startY-dragPosition.containerRect!.top) : lastValue.raw?.top||0,
            left: dragPosition ? (dragPosition.clientX-dragPosition.startX-dragPosition.containerRect!.left) : lastValue.raw?.left||0,
        }
    })

    return <div style={containerStyle} ref={containerRef} >
        <div style={itemStyle} ref={rxDragPosition.ref}>drag me</div>
    </div>
}