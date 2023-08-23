/* @jsx createElement*/
import {createElement, createRoot} from "axii";
import "./index.css"
import {ActivityGraph} from "./src/component/activity/ActivityGraph";
import {
    Action, Activity, forEachInteraction,
    Interaction,
    InteractionGroup,
    Payload, PayloadItem,
    Role,
    RoleAttributive, Transfer
} from "../shared/activity/InteractionClass";
import {atom, computed, reactive} from "rata";
import {Entity} from "../shared/entity/Entity";
import {Code} from "./src/component/code/Code";
import {Drawer} from "./src/component/util/Drawer";
import {editor} from "monaco-editor";
import IStandaloneEditorConstructionOptions = editor.IStandaloneEditorConstructionOptions;


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
        items: [PayloadItem.createReactive({
            name: 'to',
            attributive: OtherAttr,
            base: globalUserRole,
            isRef: true,
            itemRef: Role.createReactive({name: 'B', isRef: true})
        }), PayloadItem.createReactive({
            name: 'message',
            base: Message,
            itemRef: Entity.createReactive({name: '', isRef: true}),
        })]
    })
})



const approveInteraction = Interaction.createReactive({
    name: 'approve',
    roleAttributive: RoleAttributive.createReactive({}),
    role: sendInteraction.payload().items[0].itemRef(),
    // TODO draft 改成 futureValue 的形式后就不需要了。
    roleRef: Role.createReactive({name: '', isRef: true}),
    action: Action.createReactive({ name: 'approve'}),
    payload: Payload.createReactive({})
})

const rejectInteraction = Interaction.createReactive({
    name: 'reject',
    roleAttributive: RoleAttributive.createReactive({}),
    role: sendInteraction.payload().items[0].itemRef(),
    roleRef: Role.createReactive({name: '', isRef: true}),
    action: Action.createReactive({ name: 'reject'}),
    payload: Payload.createReactive({
        items: [
            PayloadItem.createReactive({
                name: 'reason',
                base: Message,
                itemRef: Entity.createReactive({name: '', isRef: true}),
            })
        ]
    })
})

const cancelInteraction = Interaction.createReactive({
    name: 'cancel',
    roleAttributive: RoleAttributive.createReactive({}),
    role: sendInteraction.roleRef(),
    roleRef: Role.createReactive({name: '', isRef: true}),
    action: Action.createReactive({ name: 'cancel'}),
    payload: Payload.createReactive({})
})

const responseGroup = InteractionGroup.createReactive({
    type: 'or',
    interactions: [
        approveInteraction,
        rejectInteraction,
        cancelInteraction
    ]
})


const activity= Activity.createReactive({
    interactions: [
        sendInteraction
    ],
    groups: [
        responseGroup
    ],
    transfers: [
        Transfer.createReactive({
            name: 'fromSendToResponse',
            source: sendInteraction,
            target: responseGroup
        })
    ]
})

// TODO refRoles
const rolesAndRefRoles = computed(() => {
    const refRoles = []
    forEachInteraction(activity, (interaction: ReturnType<typeof Interaction.createReactive>) => {
        if (interaction.roleRef()?.name() ) {
            refRoles.push(interaction.roleRef())
        }
        // TODO 支持深层嵌套的 payload 格式
        interaction.payload().items.forEach(item => {
            if (item.itemRef()?.name() && Role.is(item.base())) {
                refRoles.push(item.itemRef())
            }
        })
    })
    return roles.concat(refRoles)
})


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

const root = createRoot(document.getElementById('root')!)
root.render(<div>
    <ActivityGraph
        value={activity}
        roles={rolesAndRefRoles}
        roleAttributives={roleAttributives}
        entities={entities}
        entityAttributives={entityAttributives}
        selectedAttributive={selected}
    />
    <Drawer title={title} visible={codeVisible}>
        {() => selected() ?  <Code options={{value: selected().stringContent() || '', ...options}} />  : null}
    </Drawer>
</div>)

