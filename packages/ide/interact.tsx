/* @jsx createElement*/
import {createElement, createRoot} from "axii";
import "./index.css"
import {InteractionNode} from "./src/component/activity/InteractionNode";
import {Action, Interaction, Payload, Role, RoleAttributive, EntityAttributive} from "../shared/activity/InteractionClass";
import {Entity} from "../shared/entity/Entity";
import {atom, computed, reactive} from "rata";
import {Code} from "./src/component/code/Code";
import {Drawer} from "./src/component/util/Drawer";
import {editor} from "monaco-editor";
import IStandaloneEditorConstructionOptions = editor.IStandaloneEditorConstructionOptions;

const globalUserRole = Role.createReactive({ name: 'User'})

const sendInteraction = Interaction.createReactive({
    name: 'sendRequest',
    roleAttributive: RoleAttributive.createReactive({
        // TODO 写个 attributive
    }),
    role: globalUserRole,
    roleRef: Role.createReactive({name: 'A', isRef: true}),
    action: Action.createReactive({ name: 'sendRequest'}),
    payload: Payload.createReactive({
        items: []
    })
})

const NewAttr = RoleAttributive.createReactive({
    name: 'New',
    stringContent: `function New(){}`
})

const New2Attr = RoleAttributive.createReactive({
    name: 'New2',
    stringContent: `function New2(){}`
})

const New3Attr = RoleAttributive.createReactive({
    name: 'New3',
    stringContent: `function New3(){}`
})


const OldAttr = RoleAttributive.createReactive({
    name: 'Old',
    stringContent: `function Old(){}`
})

const Old2Attr = RoleAttributive.createReactive({
    name: 'Old2',
    stringContent: `function Old2(){}`
})

const Old3Attr = RoleAttributive.createReactive({
    name: 'Old3',
    stringContent: `function Old3(){}`
})

const OtherAttr = RoleAttributive.createReactive({
    name: 'Other',
    stringContent: `function Other(){}`
})


const roleAttributives = reactive([NewAttr, New2Attr, New3Attr, OldAttr, Old2Attr, Old3Attr, OtherAttr])

const User = Role.createReactive( {
    name: 'User'
})

const Admin = Role.createReactive( {
    name: 'Admin'
})

const Anonymous = Role.createReactive( {
    name: 'Anonymous'
})

const roles = reactive([User, Admin, Anonymous])
// TODO entities and entity attributives

const Message = Entity.createReactive({
    name: 'Message',
    properties: [{
        name: 'content',
        type: 'string',
        collection: false,
    }]
})

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
        roles={roles}
        roleAttributives={roleAttributives}
        entities={entities}
        entityAttributives={entityAttributives}
        selectedAttributive={selected}
    />
    <Drawer title={title} visible={codeVisible}>
        {() => selected() ?  <Code options={{value: selected().stringContent() || '', ...options}} />  : null}
    </Drawer>
</div>)


