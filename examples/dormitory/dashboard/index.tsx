import {createRoot, createElement} from "axii";
import { Dashboard } from './Dashboard';
import { entities, relations, interactions } from '../backend';

createRoot(document.getElementById('root')!).render(<Dashboard entities={entities} relations={relations} interactions={interactions}/>)
