/* @jsx createElement*/
import {createElement, createRoot} from "axii";
import "./index.css"
import {StateMachine} from "./src/component/stateMachine/StateMachine";


const root = createRoot(document.getElementById('root')!)
root.render(<div>
    <h1>test</h1>
    <StateMachine />
</div>)


