/* @jsx createElement*/
import {createElement, createRoot} from "axii";
import "./index.css"
import {App} from "./src/App";

const root = createRoot(document.getElementById('root')!)
root.render(<App />)


