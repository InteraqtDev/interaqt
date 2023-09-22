/* @jsx createElement*/
import {createElement, createRoot} from "axii";
import {atom, reactive} from "rata";
import {EREditor} from "./src/component/entity/EREditor";
import {Entity, Property, PropertyTypes, Relation} from "../shared/entity/Entity";
import "./index.css"
import {createInstances, createInstancesFromString, stringifyAllInstances} from "../shared/createClass";

import { data } from '../runtime/tests/data/simpleActivityWithER'
import {Activity} from "../shared/activity/Activity";
// const cache = '[{"type":"Property","options":{"isReactive":true},"uuid":"829409ac-0da1-4ce1-b669-fcde668c1d79","public":{"name":"name","type":"string","collection":false,"args":null}},{"type":"Property","options":{"isReactive":true},"uuid":"d3bfe681-9057-4dc8-abe0-c51921e2e7c5","public":{"name":"name","type":"string","collection":false,"args":null}},{"type":"Property","options":{"isReactive":true},"uuid":"09544f8a-022c-468b-a1d8-e12a2866f68f","public":{"name":"name","type":"string","collection":false,"args":null}},{"type":"Entity","options":{"isReactive":true},"uuid":"86db284f-d284-4045-a0bc-2050903bdecf","public":{"name":"User"}},{"type":"Entity","options":{"isReactive":true},"uuid":"a0bc898b-1d6c-4c7f-a165-f27700fe0d34","public":{"name":"File"}},{"type":"Entity","options":{"isReactive":true},"uuid":"575ebcb7-7002-46d1-86d5-ea3f5cb48d91","public":{"name":"Machine"}},{"type":"Relation","options":{"isReactive":true},"uuid":"761d421d-6195-4977-a164-10d4e6d904b7","public":{"entity1":"a0bc898b-1d6c-4c7f-a165-f27700fe0d34","targetName1":"owner","entity2":"86db284f-d284-4045-a0bc-2050903bdecf","targetName2":"file"}}]'

window.cache = data

if (window.cache) {
    // createInstancesFromString(cache)
    createInstances(window.cache, true)
} else {
    const userEntity = Entity.createReactive({ name: 'User' })
    const nameProperty = Property.createReactive({ name: 'name', type: PropertyTypes.String })
    const ageProperty = Property.createReactive({ name: 'age', type: PropertyTypes.Number })
    userEntity.properties.push(nameProperty)
    userEntity.properties.push(ageProperty)


    Relation.createReactive({
        entity1: userEntity,
        targetName1: 'friends',
        entity2: userEntity,
        targetName2: 'friends',
        relType: 'n:n'
    })


    const messageEntity = Entity.createReactive({ name: 'Message'})
    const contentProperty = Property.createReactive({ name: 'content', type: PropertyTypes.String })
    messageEntity.properties.push(contentProperty)

    const requestEntity = Entity.createReactive({ name: 'Request'})

    Relation.createReactive({
        entity1: requestEntity,
        targetName1: 'from',
        entity2: userEntity,
        targetName2: 'request',
        relType: 'n:1'
    })

    Relation.createReactive({
        entity1: requestEntity,
        targetName1: 'to',
        entity2: userEntity,
        targetName2: 'receivedRequest',
        relType: 'n:1'
    })


    Relation.createReactive({
        entity1: requestEntity,
        targetName1: 'message',
        entity2: messageEntity,
        targetName2: 'request',
        relType: '1:1'
    })


}

window.stringifyAllInstances = stringifyAllInstances

const root = createRoot(document.getElementById('root')!)
root.render(<EREditor entities={reactive([...Entity.instances])} relations={reactive([...Relation.instances])} activities={Activity.instances}/>)


