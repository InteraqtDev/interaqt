/* @jsx createElement*/
import {createElement, createRoot} from "axii";
import {ConceptOverview} from "./src/component/concept/ConceptOverview";

import "./index.css"

const root = createRoot(document.getElementById('root')!)
root.render(<ConceptOverview />)


