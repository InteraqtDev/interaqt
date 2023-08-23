import '../code/useWorker';
import {InjectHandles, Props} from "axii";
import {computed, incConcat, incMap} from "rata";
import {AttributiveInput} from "./AttributiveInput";
import {Checkbox} from "../form/Checkbox";
import {Input} from "../form/Input";
import {createDraftControl} from "../createDraftControl";
import {EntityAttributive, PayloadItem, Role, RoleAttributive} from "../../../../shared/activity/InteractionClass";
import {Button} from "../form/Button";
import {Select} from "../form/Select";

export function PayloadInput({ value, errors, roles, entities, roleAttributives, entityAttributives, selectedAttributive}: Props, { createElement }: InjectHandles) {

    const onAddClick = () => {
        value().items.push(PayloadItem.createReactive({ name: '', base: null, attributive: null, alias: '' }))
    }

    return <div>
        {incMap(value().items, (item) => {

            const renderNameDraftControl = createDraftControl(Input)
            const aliasDraftControl = createDraftControl(Input)

            const attributiveOptions = computed(() => {
                return Role.is(item.base()) ? roleAttributives : entityAttributives
            })

            // FIXME attributive 是动态的，需要更好地表达方式 例如 item.attributive.fromComputed(computed(xxx))
            computed(() => {
                if (item.base()) {
                    item.attributive(
                        Role.is(item.base()) ? RoleAttributive.createReactive({}) : EntityAttributive.createReactive({})
                    )
                }
            })

            // CAUTION 对于没有实时变化的，没有校验规则的数据编辑，没有必要用 draftControl
            return (
                <div>
                    {renderNameDraftControl({
                        value: item.name,
                        placeholder: 'key'
                    })}
                    <span>:</span>
                    <AttributiveInput value={item.attributive} options={attributiveOptions} selectedAttributive={selectedAttributive}/>
                    <Select placeholder={ 'choose'}
                        value={item.base}
                        options={incConcat(roles, entities)}
                        display={(item) => item.name}
                    />
                    <Checkbox value={item.isRef} label={'isRef'} />
                    <Checkbox value={item.isCollection} label={'isCollection'} />
                    {aliasDraftControl({
                        value: item.itemRef().name
                    })}
                </div>
            )
        })}
        <Button onClick={onAddClick}>+</Button>
    </div>
}
