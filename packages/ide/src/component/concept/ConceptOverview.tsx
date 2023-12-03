import { createElement} from "axii";
import {atom, computed, incMap, reactive} from "rata";
import {Code} from "../code/Code";
import {editor} from "monaco-editor";
import IStandaloneEditorConstructionOptions = editor.IStandaloneEditorConstructionOptions;
import {Entity} from "../../../../shared/lib/entity/Entity";
import {createFormForEntity} from "../createFormForEntityProperty";
import {createDialog, createDialogFooter} from "../createDialog";
import {RoleAttributive, EntityAttributive, Role} from "../../../../shared/lib/activity/InteractionClass";
import {Drawer} from "../util/Drawer";

type Concept = {
    name: string,
    content?: string
}

type Attributive = {
    content?: object,
    // 代码形式
    stringContent?: string
    base: any
}


// 测试数据
const User = Role.createReactive( {
    name: 'User'
})

const Admin = Role.createReactive( {
    name: 'Admin'
})

const Anonymous = Role.createReactive( {
    name: 'Anonymous'
})

const NewAttr = RoleAttributive.createReactive({
    name: 'New',
    stringContent: `function New(){}`
})

const OldAttr = RoleAttributive.createReactive({
    name: 'Old',
    stringContent: `function Old(){}`
})

export function ConceptOverview({ roles = reactive([User, Admin, Anonymous]), attributives = reactive([NewAttr, OldAttr])}) {
    const selected = atom(null)
    const codeVisible = atom(false)

    const options: IStandaloneEditorConstructionOptions = {
        language: "javascript",
        automaticLayout: true,
        theme: 'vs-dark',
        minimap: {
            enabled: false
        }
    }


    const { fieldValues: newRoleAttr, node: addEntityForm } = createFormForEntity(RoleAttributive, {fields: ['name']})
    const onSubmitClick = () => {
        console.log(newRoleAttr)
        attributives.push(RoleAttributive.createReactive(newRoleAttr))
        roleAttrCreateDialogVisible(false)
    }

    const [roleAttrCreateDialogVisible, attrCreateDialog] = createDialog(
        addEntityForm,
        createDialogFooter([{ text: 'Submit', onClick: onSubmitClick}, { text: 'Cancel', onClick: () => roleAttrCreateDialogVisible(false)}])
    )


    const title = computed(() => {
        return selected()?.name() ?? ''
    })


    return (<div className="flex gap-x-8 ">
        <div>
            <h1 className="text-lg font-bold">Roles</h1>
            <button type="button"
                    className="rounded bg-indigo-600 px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
                create
            </button>
            {incMap(roles, (role) => (
                <div>{role.name}</div>
            ))}

        </div>

        <div>
            <h1 className="text-lg font-bold">Role Attributives</h1>
            <button type="button"
                    onClick={() => roleAttrCreateDialogVisible(true)}
                    className="rounded bg-indigo-600 px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
                create
            </button>
            {attrCreateDialog}
            {incMap(attributives, attributive => {
                console.warn('rerender', attributive)
                return (
                    <div>
                        <a href="#" class="no-underline hover:underline" onClick={[() => selected(attributive), () => codeVisible(true)]}>{attributive.name}</a>
                    </div>
                )
            })}
        </div>

        <div>
            <h1 className="text-lg font-bold">Entities</h1>
        </div>

        <div>
            <h1 className="text-lg font-bold">Entities Attributives</h1>
        </div>


        <Drawer title={title} visible={codeVisible}>
            {() => selected() ?  <Code options={{value: selected().stringContent() || '', ...options}} />  : null}
        </Drawer>
    </div>)
}

