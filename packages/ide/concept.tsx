/* @jsx createElement*/
import {createElement, createRoot} from "axii";
import "./index.css"
import {ConceptOverview} from "./src/component/concept/ConceptOverview";


const root = createRoot(document.getElementById('root')!)
root.render(<ConceptOverview />)


