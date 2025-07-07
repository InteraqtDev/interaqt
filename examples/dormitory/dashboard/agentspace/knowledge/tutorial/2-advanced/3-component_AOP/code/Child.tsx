/* @jsx createElement */
import {RenderContext} from "axii";
import {GrandChild} from "./GrandChild.js";
export function Child({}, {createElement}: RenderContext) {
    return (
        <div as="root">
            <input as={"main"}></input>
            <button as={"trigger"}>Submit</button>
            <GrandChild as="grandChild"></GrandChild>
        </div>
    )
}
