import {friendRelation} from "./createFriendRelationActivity.js";
import {Any, Count, Every, State} from "@interaqt/shared";
import {requestEntity} from "./requestEntity.js";

const totalFriendRelationState = State.create({
    name: 'totalFriendRelation',
    type: 'number',
    collection: false,
    computedData: Count.create({
        record: friendRelation,
        matchExpression: () => true
    })
})
const everyRequestHandledState = State.create({
    name: 'everyRequestHandled',
    type: 'boolean',
    collection: false,
    computedData: Every.create({
        record: requestEntity,
        matchExpression: (request) => {
            return request.handled
        }
    })
})
const anyRequestHandledState = State.create({
    name: 'anyRequestHandled',
    type: 'boolean',
    collection: false,
    computedData: Any.create({
        record: requestEntity,
        matchExpression: (request) => {
            return request.handled
        }
    })
})
export const states = [
    totalFriendRelationState,
    everyRequestHandledState,
    anyRequestHandledState,
]