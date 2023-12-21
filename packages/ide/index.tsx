/* @jsx createElement*/
import {createElement, createRoot} from "axii";
import {App} from "./src/App";

import "./index.css"

const root = createRoot(document.getElementById('root')!)
root.render(<App />)


