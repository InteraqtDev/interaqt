import { InjectHandles, Props } from "axii";
import { computed, incConcat, incMap, Atom } from "data0";
import {
    EntityAttributive,
    EntityAttributives,
    Payload,
    PayloadItem,
    UserAttributive,
    UserAttributives,
    KlassInstance,
    Entity,
} from "@interaqt/shared";
import '../code/useWorker';
import { AttributiveInput } from "./AttributiveInput";
import { Checkbox } from "../form/Checkbox";
import { Input } from "../form/Input";
import { createDraftControl } from "../createDraftControl";
import { Button } from "../form/Button";
import { Select } from "../form/Select";


type PayloadInputProps = {
    value: Atom<KlassInstance<typeof Payload, true>>,
    roleAttributiveOptions: KlassInstance<typeof UserAttributive, true>[],
    entities: KlassInstance<typeof Entity, true>[],
    userAttributiveOptions: KlassInstance<typeof UserAttributive, true>[],
    entityAttributives: KlassInstance<typeof EntityAttributive, true>[],
    selectedAttributive: Atom<any>
}

export function PayloadInput({ value, roleAttributiveOptions, entities, userAttributiveOptions, entityAttributives, selectedAttributive }: PayloadInputProps, { createElement }: InjectHandles) {
    const onAddClick = () => {
        value().items.push(PayloadItem.createReactive({ name: '', base: null, attributive: null, alias: '' }))
    }

    return <div>
        {incMap(value().items, (i) => {
            const item = i as unknown as ReturnType<typeof PayloadItem.createReactive>

            const renderNameDraftControl = createDraftControl(Input)
            const aliasDraftControl = createDraftControl(Input)

            const attributiveOptions = computed(() => {
                return UserAttributive.is(item.base()) ? userAttributiveOptions : entityAttributives
            })

            // FIXME attributive 是动态的，需要更好地表达方式 例如 item.attributive.fromComputed(computed(xxx))
            computed(() => {
                if (item.base()) {
                    if (!item.attributives()) {
                        item.attributives(
                            UserAttributive.is(item.base()) ? UserAttributives.createReactive({}) : EntityAttributives.createReactive({})
                        )
                    }

                    if (!item.itemRef()) {
                        item.itemRef(
                            UserAttributive.is(item.base()) ? UserAttributive.createReactive({}) : EntityAttributive.createReactive({})
                        )
                    }
                }
            })

            // CAUTION 对于没有实时变化的，没有校验规则的数据编辑，没有必要用 draftControl
            console.log(2222, item.uuid, item.name(), item.itemRef().name(), item.itemRef().uuid)

            return (
                <div>
                    {renderNameDraftControl({
                        value: item.name,
                        placeholder: 'key'
                    })}
                    <span>:</span>
                    <AttributiveInput value={item.attributives} options={attributiveOptions} selectedAttributive={selectedAttributive} />
                    <Select placeholder={'choose'}
                        value={item.base}
                        options={incConcat(roleAttributiveOptions, entities)}
                        display={(item) => item.name}
                    />
                    <Checkbox value={item.required} label={'required'} />
                    <Checkbox value={item.isRef} label={'isRef'} />
                    <Checkbox value={item.isCollection} label={'isCollection'} />
                    {() => item.itemRef() ? aliasDraftControl({
                        value: item.itemRef().name
                    }) : null}
                </div>
            )
        })}
        <Button onClick={onAddClick}>+</Button>
    </div>
}
