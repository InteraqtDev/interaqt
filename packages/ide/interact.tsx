/* @jsx createElement*/
import {createElement, createRoot} from "axii";
import "./index.css"
import {InteractionNode} from "./src/component/activity/InteractionNode";
import {Action, Interaction, Payload} from "../shared/activity/Activity";
import {UserAttributive, UserAttributives, createUserRoleAttributive} from '../shared/user/User'
import {atom, computed, reactive} from "rata";
import {Code} from "./src/component/code/Code";
import {Drawer} from "./src/component/util/Drawer";
import {editor} from "monaco-editor";
import IStandaloneEditorConstructionOptions = editor.IStandaloneEditorConstructionOptions;
import {KlassInstanceOf, stringifyAllInstances} from "../shared/createClass";
import {
    NewAttr, New2Attr, New3Attr, OldAttr, Old2Attr, Old3Attr, OtherAttr,
    User,Admin,Anonymous,
    Message
} from './testdata/interaction'

export const globalUserRole = createUserRoleAttributive({ name: 'user'}, {isReactive: true})

const sendInteraction = Interaction.createReactive({
    name: 'sendRequest',
    userAttributives: UserAttributives.createReactive({
        // TODO 写个 attributive
    }),
    userRoleAttributive: globalUserRole,
    userRef: createUserRoleAttributive({name: 'A', isRef: true}, {isReactive:true}),
    action: Action.createReactive({ name: 'sendRequest'}),
    payload: Payload.createReactive({
        items: []
    })
})


const userAttributiveOptions = reactive([NewAttr, New2Attr, New3Attr, OldAttr, Old2Attr, Old3Attr, OtherAttr])
const roleAttributiveOptions = reactive([User, Admin, Anonymous]) as KlassInstanceOf<typeof UserAttributive, true>[]
// TODO entities and entity attributives

const entities = reactive([Message])
const entityAttributives = reactive([])

const root = createRoot(document.getElementById('root')!)


// 如果我们想在 root 上注册事件，应该怎么写？
const codeVisible = atom(false)
const selected = atom(null)
const title = computed(() => selected()?.name?.() || '')
const options: IStandaloneEditorConstructionOptions = {
    language: "javascript",
    automaticLayout: true,
    theme: 'vs-dark',
    minimap: {
        enabled: false
    }
}

root.on('selectConcept',(concept) => {
    selected(concept)
    codeVisible(true)
})


root.render(<div>
    <InteractionNode
        interaction={sendInteraction}
        roleAttributiveOptions={roleAttributiveOptions}
        userAttributiveOptions={userAttributiveOptions}
        entities={entities}
        entityAttributives={entityAttributives}
        selectedAttributive={selected}
    />
    <Drawer title={title} visible={codeVisible}>
        {() => selected() ?  <Code options={{value: selected().stringContent() || '', ...options}} />  : null}
    </Drawer>
</div>)


// import { data as testData} from '../runtime/tests/data/simpleInteraction'
// createInstances(testData)


window.interaction = sendInteraction
window.stringifyAllInstance = stringifyAllInstances