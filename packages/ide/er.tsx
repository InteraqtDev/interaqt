/* @jsx createElement*/
import {createElement, createRoot} from "axii";
import {atom, reactive} from "rata";
import {EREditor} from "./src/component/entity/EREditor";
import {Entity, Property, PropertyTypes, Relation} from "../shared/entity/Entity";
import "./index.css"
import {createInstancesFromString, stringifyAllInstances} from "../shared/createClass";

const cache = '[{"type":"Property","options":{"isReactive":true},"uuid":"829409ac-0da1-4ce1-b669-fcde668c1d79","public":{"name":"name","type":"string","collection":false,"args":null}},{"type":"Property","options":{"isReactive":true},"uuid":"d3bfe681-9057-4dc8-abe0-c51921e2e7c5","public":{"name":"name","type":"string","collection":false,"args":null}},{"type":"Property","options":{"isReactive":true},"uuid":"09544f8a-022c-468b-a1d8-e12a2866f68f","public":{"name":"name","type":"string","collection":false,"args":null}},{"type":"Entity","options":{"isReactive":true},"uuid":"86db284f-d284-4045-a0bc-2050903bdecf","public":{"name":"User"}},{"type":"Entity","options":{"isReactive":true},"uuid":"a0bc898b-1d6c-4c7f-a165-f27700fe0d34","public":{"name":"File"}},{"type":"Entity","options":{"isReactive":true},"uuid":"575ebcb7-7002-46d1-86d5-ea3f5cb48d91","public":{"name":"Machine"}},{"type":"Relation","options":{"isReactive":true},"uuid":"761d421d-6195-4977-a164-10d4e6d904b7","public":{"entity1":"a0bc898b-1d6c-4c7f-a165-f27700fe0d34","targetName1":"owner","entity2":"86db284f-d284-4045-a0bc-2050903bdecf","targetName2":"file"}}]'
const entities: Entity[] = reactive([])
const relations: Relation[] = reactive([])

if (cache) {
    const instanceByUUID = createInstancesFromString(cache)
    for(let [, instance] of instanceByUUID) {
        if (instance.constructor === Entity) {
            entities.push(instance)
        } else if (instance.constructor === Relation){
            relations.push(instance)
        } else {
            // 不用管，可能是 Property 之类的被其他引用的。
        }
    }
} else {
    const userEntity = Entity.createReactive({ name: 'User' })
    const nameProperty = Property.createReactive({ name: 'name', type: PropertyTypes.String })
    userEntity.properties.push(nameProperty)

    const fileEntity = Entity.createReactive({ name: 'File'})
    const filenameProperty = Property.createReactive({ name: 'name', type: PropertyTypes.String })

    fileEntity.properties.push(filenameProperty)


    const machineEntity = Entity.createReactive({ name: 'Machine' })
    const machineNameProperty = Property.createReactive({ name: 'name', type: PropertyTypes.String})
    machineEntity.properties.push(machineNameProperty)

    const fileUserRelation = Relation.createReactive({
        entity1: fileEntity,
        targetName1: 'owner',
        entity2: userEntity,
        targetName2: 'file'
    })

    entities.push(userEntity, fileEntity, machineEntity)
    relations.push(fileUserRelation)

    window.cache = stringifyAllInstances()
    console.log(window.cache)
}


const root = createRoot(document.getElementById('root')!)
root.render(<EREditor entities={entities} relations={relations}/>)


