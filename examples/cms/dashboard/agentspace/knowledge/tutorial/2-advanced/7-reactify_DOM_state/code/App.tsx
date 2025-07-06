/* @jsx createElement */
import { RenderContext} from 'axii'
import {ScrollPosition} from "./ScrollPosition.js";
import {Size} from "./Size.js";
import {ReactiveDragPosition} from "./DragPosition.js";

export function App({}, { createElement }: RenderContext) {


    return <div style={{display:'flex', flexDirection:'column', alignItems:'center'}} >
        <h1>Drag Position</h1>
        <ReactiveDragPosition />
        <h1>Reactive Scroll Position</h1>
        <ScrollPosition />
        <h1>Reactive Size</h1>
        <Size />
    </div>
}