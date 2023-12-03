import {createElement} from "axii";
import {AttributiveInput} from "./AttributiveInput";
import {PayloadInput} from "./PayloadInput";
import {Select} from "../form/Select";
import {ActionInput} from "./ActionInput";
import {createDraftControl} from "../createDraftControl";
import {Input} from "../form/Input";
import {UserAttributive} from "../../../../shared/lib/user/User";
import {Atom} from "rata";
import {EntityAttributive, Interaction} from "../../../../shared/lib/activity/Activity";
import {Entity} from "../../../../shared/lib/entity/Entity";


type InteractionNodeProps = {
    interaction: ReturnType<typeof Interaction.createReactive>,
    roleAttributiveOptions: ReturnType<typeof UserAttributive.createReactive>[],
    entities: ReturnType<typeof Entity.createReactive>[],
    userAttributiveOptions: ReturnType<typeof UserAttributive.createReactive>[],
    entityAttributives: ReturnType<typeof EntityAttributive.createReactive>[],
    selectedAttributive: Atom<any>
}

export function InteractionNode({ interaction, roleAttributiveOptions, entities, userAttributiveOptions, entityAttributives, selectedAttributive } : InteractionNodeProps){

    const renderActionDraftControl = createDraftControl(ActionInput, {
        pushEvent: 'input:onBlur'
    })

    const aliasDraftControl = createDraftControl(Input)

    console.log(interaction.payload().uuid)
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
                    roleAttributiveOptions={roleAttributiveOptions}
                    userAttributiveOptions={userAttributiveOptions}
                    entities={entities}
                    entityAttributives={entityAttributives}
                    selectedAttributive={selectedAttributive}
                />
            </div>
        </div>
    )
}
