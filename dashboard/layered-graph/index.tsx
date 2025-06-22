import {createRoot, createElement} from "axii";
import { App } from './src/App'
import { entities, relations } from '@social-content-network';
createRoot(document.getElementById('root')!).render(<App entities={entities} relations={relations}/>)
