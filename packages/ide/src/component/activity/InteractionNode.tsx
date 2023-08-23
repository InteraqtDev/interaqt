import {createElement} from "axii";
import {AttributiveInput} from "./AttributiveInput";
import {RoleInput} from "./RoleInput";
import {PayloadInput} from "./PayloadInput";
import {Select} from "../form/Select";
import {ActionInput} from "./ActionInput";
import {createDraftControl} from "../createDraftControl";
import {Role} from "../../../../shared/activity/InteractionClass";
import {incConcat} from "rata";
import {Input} from "../form/Input";

export function InteractionNode({ interaction, roles, entities, roleAttributives, entityAttributives, selectedAttributive }){

    const renderActionDraftControl = createDraftControl(ActionInput, {
        pushEvent: 'input:onBlur'
    })

    const aliasDraftControl = createDraftControl(Input)

window.interaction = interaction

    return (
        <div style={{border: '1px blue dashed', display: 'inline-block'}} classNames="overflow-visible">
            <div>
                <AttributiveInput
                    value={interaction.roleAttributive}
                    options={roleAttributives}
                    selectedAttributive={selectedAttributive}
                />
                <Select value={interaction.role} options={roles} display={Role.display}></Select>
                {aliasDraftControl({
                    value: interaction.roleRef()?.name,
                    placeholder: 'ref name'
                })}
            </div>
            <div>
                {renderActionDraftControl({ value: interaction.action().name})}
            </div>
            <div style={{ width: 200}}>
                <PayloadInput
                    value={interaction.payload}
                    roles={roles}
                    roleAttributives={roleAttributives}
                    entities={entities}
                    entityAttributives={entityAttributives}
                    selectedAttributive={selectedAttributive}
                />
            </div>
        </div>
    )
}
