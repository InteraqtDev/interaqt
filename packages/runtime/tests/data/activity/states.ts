import {friendRelation} from "./createFriendRelationActivity.js";
import {Any, Count, Every, Dictionary} from '@';
import {requestEntity} from "./requestEntity.js";

const totalFriendRelationState = Dictionary.create({
    name: 'totalFriendRelation',
    type: 'number',
    collection: false,
    computedData: Count.create({
        record: friendRelation,
        match: () => true
    })
})
const everyRequestHandledState = Dictionary.create({
    name: 'everyRequestHandled',
    type: 'boolean',
    collection: false,
    computedData: Every.create({
        record: requestEntity,
        match: (request) => {
            return request.handled
        }
    })
})
const anyRequestHandledState = Dictionary.create({
    name: 'anyRequestHandled',
    type: 'boolean',
    collection: false,
    computedData: Any.create({
        record: requestEntity,
        match: (request) => {
            return request.handled
        }
    })
})
export const dictionary = [
    totalFriendRelationState,
    everyRequestHandledState,
    anyRequestHandledState,
]