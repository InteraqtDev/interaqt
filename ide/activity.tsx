/* @jsx createElement*/
import { createElement, createRoot } from "axii";
import { atom, computed, reactive } from "data0";
import { editor } from "monaco-editor";
import {
    Action,
    Activity,
    Interaction,
    ActivityGroup,
    Payload,
    PayloadItem,
    Transfer,
    forEachInteraction,
    Entity,
    KlassInstance,
    stringifyAllInstances,
    createUserRoleAttributive,
    UserAttributive,
    UserAttributives,
} from "@interaqt/shared";
import { ActivityGraph } from "./src/component/activity/ActivityGraph";
import { Code } from "./src/component/code/Code";
import { Drawer } from "./src/component/util/Drawer";
import IStandaloneEditorConstructionOptions = editor.IStandaloneEditorConstructionOptions;
import {
    NewAttr, New2Attr, New3Attr, OldAttr, Old2Attr, Old3Attr, OtherAttr,
    User, Admin, Anonymous,
    Message
} from './testdata/interaction'

import "./index.css"


const userAttributiveOptions = reactive([NewAttr, New2Attr, New3Attr, OldAttr, Old2Attr, Old3Attr, OtherAttr])
const roleAttributiveOptions = reactive([User, Admin, Anonymous])
// TODO entities and entity attributives

const entities = reactive([Message])
const entityAttributives = reactive([])
export const globalUserRole = createUserRoleAttributive({ name: 'user' }, { isReactive: true })

const userRefA = createUserRoleAttributive({ name: 'A', isRef: true }, { isReactive: true })
const userRefB = createUserRoleAttributive({ name: 'B', isRef: true }, { isReactive: true })



const sendInteraction = Interaction.createReactive({
    name: 'sendRequest',
    userAttributives: UserAttributives.createReactive({}),
    userRoleAttributive: globalUserRole,
    userRef: userRefA,
    action: Action.createReactive({ name: 'sendRequest' }),
    payload: Payload.createReactive({
        items: [
            PayloadItem.createReactive({
                name: 'to',
                attributive: OtherAttr,
                base: globalUserRole,
                isRef: true,
                itemRef: userRefB
            }),
            PayloadItem.createReactive({
                name: 'message',
                base: Message,
                itemRef: Entity.createReactive({ name: '', isRef: true }),
            })
        ]
    })
})

console.log(1111, sendInteraction.payload().items[0].uuid, sendInteraction.payload().items[0].name(), sendInteraction.payload().items[0].itemRef() === userRefB, userRefB.name(), userRefB.uuid)


const approveInteraction = Interaction.createReactive({
    name: 'approve',
    userAttributives: UserAttributives.createReactive({}),
    userRoleAttributive: userRefB,
    userRef: createUserRoleAttributive({ name: '', isRef: true }, { isReactive: true }),
    action: Action.createReactive({ name: 'approve' }),
    payload: Payload.createReactive({})
})

const rejectInteraction = Interaction.createReactive({
    name: 'reject',
    userAttributives: UserAttributives.createReactive({}),
    userRoleAttributive: userRefB,
    userRef: createUserRoleAttributive({ name: '', isRef: true }, { isReactive: true }),
    action: Action.createReactive({ name: 'reject' }),
    payload: Payload.createReactive({
        items: [
            PayloadItem.createReactive({
                name: 'reason',
                base: Message,
                itemRef: Entity.createReactive({ name: '', isRef: true }),
            })
        ]
    })
})

const cancelInteraction = Interaction.createReactive({
    name: 'cancel',
    userAttributives: UserAttributives.createReactive({}),
    userRoleAttributive: userRefA,
    userRef: createUserRoleAttributive({ name: '', isRef: true }, { isReactive: true }),
    action: Action.createReactive({ name: 'cancel' }),
    payload: Payload.createReactive({})
})

const responseGroup = ActivityGroup.createReactive({
    type: 'any',
    activities: [
        Activity.createReactive({
            interactions: [
                approveInteraction
            ]
        }),
        Activity.createReactive({
            interactions: [
                rejectInteraction
            ]
        }),
        Activity.createReactive({
            interactions: [
                cancelInteraction
            ]
        })
    ],
})


const activity = Activity.createReactive({
    name: "createFriendRelation",
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
const userRolesAndUserRefs = computed(() => {
    const refRoles = []
    forEachInteraction(activity, (interaction: ReturnType<typeof Interaction.createReactive>) => {
        if (interaction.userRef()?.name()) {
            refRoles.push(interaction.userRef())
        }
        // TODO 支持深层嵌套的 payload 格式
        interaction.payload().items.forEach(item => {
            if (item.itemRef()?.name() && UserAttributive.is(item.base())) {
                refRoles.push(item.itemRef())
            }
        })
    })
    return roleAttributiveOptions.concat(refRoles)
}) as KlassInstance<typeof UserAttributive, true>[]


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
        roleAttributiveOptions={userRolesAndUserRefs}
        userAttributiveOptions={userAttributiveOptions}
        entities={entities}
        entityAttributives={entityAttributives}
        selectedAttributive={selected}
    />
    <Drawer title={title} visible={codeVisible}>
        {() => selected() ? <Code options={{ value: selected().stringContent() || '', ...options }} /> : null}
    </Drawer>
</div>)

window.activity = activity
window.stringifyAllInstance = stringifyAllInstances