/* @jsx createElement*/
import { createElement } from "axii";
import { Atom, incMap } from 'data0'
import { Entity, Property, PropertyTypes, Relation } from "@interaqt/shared";
import { createDialog, createDialogFooter } from "../createDialog";
import { createFormForEntity, createFormForEntityProperty } from "../createFormForEntityProperty";
import { RelationEntityMap } from "./EREditor";
import { IconAddProperty } from "../icons/Add";


type columnProp = {
    entity: Entity,
    index: Atom<number>,
    opener?: { entity: Entity, prop: Property }
    openRelatedEntity: (relationName: string) => void,
    selected: Atom<Property>,
    relationsByEntity: RelationEntityMap
    addRelation: (relation: Relation) => any
}



export function Column({ entity, opener, selected, openRelatedEntity, relationsByEntity, addRelation }: columnProp) {


    const { fieldValues: newProperty, node: addPropertyForm } = createFormForEntityProperty(Entity, 'properties', entity)
    const onAddProperty = () => {
        entity.properties.push(Property.createReactive(newProperty))
        propertyAddDialogVisible(false)
    }
    const [propertyAddDialogVisible, propertyAddDialog] = createDialog(
        addPropertyForm,
        createDialogFooter([{ text: 'Submit', onClick: onAddProperty }, { text: 'Cancel', onClick: () => propertyAddDialogVisible(false) }])
    )
    const showPropertyAddDialog = () => propertyAddDialogVisible(true)
    // setTimeout(() => showPropertyAddDialog())



    const { fieldValues: newEntity, node: addRelationForm } = createFormForEntity(Relation, { fixedValues: { entity1: entity } })
    const onAddRelation = () => {
        addRelation(Relation.createReactive(newEntity))
    }
    const [relationAddDialogVisible, relationAddDialog] = createDialog(
        addRelationForm,
        createDialogFooter([{ text: 'Submit', onClick: onAddRelation }, { text: 'Cancel', onClick: () => relationAddDialogVisible(false) }])
    )
    const showRelationAddDialog = () => relationAddDialogVisible(true)

    // setTimeout(() => {
    //     showRelationAddDialog()
    // }, 1)



    return (
        <div className="basis-32 shrink-0 border-r-2 border-slate-200">
            {propertyAddDialog}
            {relationAddDialog}
            <div className="border-b-2 border-slate-300 p-6 text-lg">
                <div>[{entity.name}]</div>
                <button
                    type="button"
                    className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    onClick={showPropertyAddDialog}
                >
                    add property
                </button>

                <button
                    type="button"
                    className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    onClick={showRelationAddDialog}
                >
                    add relation
                </button>
            </div>
            <div className="">
                {incMap(entity.properties, (property: Property) => (
                    <div className={() => `p-6 border-b-2 cursor-pointer ${property === selected() ? 'border-indigo-500 ' : 'border-slate-200'}`}>
                        <span>{property.name}</span>
                        <span>{property.type === PropertyTypes.Relation ? `[${(property.args).entity.name}]` : ''}</span>
                    </div>
                ))}
                {() => Array.from(relationsByEntity.get(entity).entries()).map(([relationName, [targetName, targetEntity]]) => (
                    <div onClick={() => openRelatedEntity(relationName)} className={() => `p-6 border-b-2 cursor-pointer ${relationName === selected() ? 'border-indigo-500 ' : 'border-slate-200'}`}>
                        <span>{relationName}</span>
                        <span>[{targetEntity.name}.{targetName}]</span>
                    </div>
                ))}
            </div>

        </div>
    )

}