import { atom, Atom, computed } from "data0";
import {
    Entity,
    Property,
    MapActivityToEntity,
    KlassInstance,
    Klass,
    ReactiveKlassInstance,
    Activity
} from "@interaqt/shared";
import { Select } from "../form/Select";
import { createDraftControl } from "../createDraftControl";
import { Code } from "../code/Code";

type DetailProps = {
    target: Atom<typeof Entity | typeof Property>
}

export function Detail({ target, activities }: DetailProps, { createElement }) {
    return () => Entity.is(target()) ? <EntityDetail entity={target()} activities={activities} /> : <div>请选中</div>
}

// TODO
// 2. 选择 关联 activity
// 3. 写代码
type EntityDetailProp = {
    entity: KlassInstance<typeof Entity, true>
    activities: (typeof Activity)[]
}

export function EntityDetail({ entity, activities }: EntityDetailProp, { createElement }) {

    const incrementalForms = new Map([[MapActivityToEntity, MapActivityToEntityForm]])

    const incrementalComputationOptions = [MapActivityToEntity]
    // TODO 如果已经有数据的话 type 就已经是确定的了，
    const selectedComputedType = atom(entity.computedData()?.constructor)
    const renderControl = createDraftControl(Select)

    //
    computed(() => {
        if (selectedComputedType() && !selectedComputedType().is(entity.computedData())) {
            entity.computedData((selectedComputedType() as Klass<any>)!.createReactive({}))
        }
    })

    const Form: Atom = computed(() => {
        return incrementalForms.get(selectedComputedType())
    })

    return <div>
        <h1>{entity.name}</h1>

        <h2>computed data</h2>
        <div>
            {renderControl({
                value: selectedComputedType,
                options: incrementalComputationOptions,
                display: (value) => value?.displayName
            })}
        </div>
        <div>{() => selectedComputedType()?.displayName}</div>

        <div>
            {() => {
                const FormCom = Form()
                const data = entity.computedData()

                if (!FormCom || !data) return null

                // TODO 这里不同的 form 需要不同的 prop，怎么处理？？？？
                return <FormCom data={data} activities={activities} />
            }}
        </div>

    </div>
}

export function MapActivityToEntityForm({ data, activities }, { createElement }) {
    return (
        <div>
            <div>computed data </div>
            <div>
                <Select value={data.source} options={activities} display={(activity) => activity?.name()} />
            </div>
            <div>
                <Code value={data.handle} options={{ language: 'javascript' }} />
            </div>
        </div>
    )
}