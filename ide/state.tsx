/* @jsx createElement*/
import {createElement, createRoot} from "axii";
import {StateMachine} from "./src/component/stateMachine/StateMachine";

import "./index.css"

const root = createRoot(document.getElementById('root')!)
root.render(<div>
    <h1>test</h1>
    <StateMachine />
</div>)


