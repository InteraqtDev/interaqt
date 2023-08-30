/* @jsx createElement*/
import {createElement} from "axii";
import {Entity, Property, PropertyTypes, Relation} from "../../../../shared/entity/Entity";
import {reactive, incMap, Atom, atom, computed} from 'rata'
import {Column} from "./Column";
import {IconAddProperty} from "../icons/Add";
import {createFormForEntity, createFormForEntityProperty} from "../createFormForEntityProperty";
import {createDialog, createDialogFooter} from "../createDialog";
import {createClass} from "../../../../shared/createClass";

type EREditorProps = {
    entities: Entity[],
    relations: Relation[]
}

export type RelationEntityMap = Map<Entity, Map<string, [string, Entity][]>>

type ColumnData = {
    entity: Entity,
    opener?: { entity: Entity, relationName: string }
    relationsByEntity: RelationEntityMap
    selected: Atom<Property>
}


export function EREditor({ entities, relations }: EREditorProps) {
    const columns: ColumnData[] = reactive([])

    // TODO 如何实现 patch ? 并且能把生成好的 reactive relations 给 column，不用 column 自己取。
    //  需要深度 patch 的能力
    const relationsByEntity = computed(() => {
        const map: RelationEntityMap = new Map()
        entities.forEach(entity =>  {
            map.set(entity, new Map())
        })
        relations.forEach(relation => {
            const entity1Map = map.get(relation.entity1())
            entity1Map.set(relation.targetName1(),  [relation.targetName2(), relation.entity2()])
            const entity2Map = map.get(relation.entity2())
            entity2Map.set(relation.targetName2(),  [relation.targetName1(), relation.entity1()])
        })
        return map
    }) as RelationEntityMap


    setTimeout(() => {
        onChooseEntity(entities[1])
    })

    const onChooseEntity = (entity: Entity) => {
        columns.splice(0, Infinity, {
            entity,
            selected: atom(null),
            relationsByEntity
        })
    }

    const openRelatedEntity = (sourceTarget: Entity, relationName: string,  index: Atom<number>) => {
        columns[index].selected(relationName)
        const [, targetEntity] = relationsByEntity.get(sourceTarget).get(relationName)
        columns.splice(index+1, Infinity, {
            entity: targetEntity,
            opener: {
                entity: sourceTarget,
                relationName
            },
            selected: atom(null),
            relationsByEntity
        })
    }

    const addRelation = (relation: Relation) => {
        relations.push(relation)
    }

    // TODO 怎么把 global constraints 搞进去？？
    const { fieldValues: newEntity, node: addEntityForm } = createFormForEntity(Entity, {fields: ['name']})
    const onAddEntity = () => {
        console.log(newEntity)
        entities.push(Entity.createReactive(newEntity))
        entityAddDialogVisible(false)
    }

    const [entityAddDialogVisible, entityAddDialog] = createDialog(
        addEntityForm,
        createDialogFooter([{ text: 'Submit', onClick: onAddEntity}, { text: 'Cancel', onClick: () => entityAddDialogVisible(false)}])
    )


    return <div className="flex flex-grow h-full">
        {entityAddDialog}
        <div className="flex-initial basis-32 shrink-0  w-32 overflow-y-scroll border-r-2 border-slate-300">
            <div className="py-4 text-center border-b-2 border-slate-200 cursor-pointer" >
                <button
                    type="button"
                    className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    onClick={() => entityAddDialogVisible(true)}
                >
                    add entity
                </button>
            </div>


            {incMap(entities, (entity: Entity) => (
                <div className="py-4 text-center border-b-2 border-slate-200 cursor-pointer" onClick={() => onChooseEntity(entity)}>{entity.name}</div>
            ))}
        </div>

        <div className="flex flex-grow overflow-x-scroll items-stretch">
            {incMap(columns, (data: Atom<ColumnData>, index) => {
                return (
                    <Column {...data} openRelatedEntity={(relationName) => openRelatedEntity(data.entity, relationName, index!)} addRelation={addRelation}/>
                )
            })}
        </div>
    </div>
}