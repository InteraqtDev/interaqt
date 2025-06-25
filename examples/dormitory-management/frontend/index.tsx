import {createRoot, createElement} from "axii";
import { App } from './src/App'
import { install} from "axii-ui-theme-inc";
install()

createRoot(document.getElementById('root')!).render(<App/>)
