import {createElement} from "axii";
import {AttributiveInput} from "./AttributiveInput";
import {RoleInput} from "./RoleInput";
import {PayloadInput} from "./PayloadInput";
import {Select} from "../form/Select";
import {ActionInput} from "./ActionInput";
import {createDraftControl} from "../createDraftControl";
import {Input} from "../form/Input";
import {UserAttributive} from "../../../../shared/user/User";

export function InteractionNode({ interaction, roleAttributiveOptions, entities, userAttributiveOptions, entityAttributives, selectedAttributive }){

    const renderActionDraftControl = createDraftControl(ActionInput, {
        pushEvent: 'input:onBlur'
    })

    const aliasDraftControl = createDraftControl(Input)

    return (
        <div style={{border: '1px blue dashed', display: 'inline-block'}} classNames="overflow-visible">
            <div>
                <AttributiveInput
                    value={interaction.userAttributives}
                    options={userAttributiveOptions}
                    selectedAttributive={selectedAttributive}
                />
                <Select value={interaction.userRoleAttributive} options={roleAttributiveOptions} display={UserAttributive.display}></Select>
                {aliasDraftControl({
                    value: interaction.userRef()?.name,
                    placeholder: 'ref name'
                })}
            </div>
            <div>
                {renderActionDraftControl({ value: interaction.action().name})}
            </div>
            <div style={{ width: 200}}>
                <PayloadInput
                    value={interaction.payload}
                    roles={roleAttributiveOptions}
                    roleAttributives={userAttributiveOptions}
                    entities={entities}
                    entityAttributives={entityAttributives}
                    selectedAttributive={selectedAttributive}
                />
            </div>
        </div>
    )
}
