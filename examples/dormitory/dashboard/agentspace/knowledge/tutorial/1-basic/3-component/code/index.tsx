/*@jsx createElement*/
import {createRoot, createElement, atom} from 'axii'
import { App } from './App.js'
const root = document.getElementById('root')!
const appRoot = createRoot(root)
appRoot.render(<App/>)