import {MatchExpression, MatchExpressionData} from "./MatchExpression";
import {AttributeQuery, AttributeQueryData} from "./AttributeQuery";
import {Modifier, ModifierData} from "./Modifier";
import {EntityToTableMap} from "./EntityToTableMap";

export type RecordQueryData = {
    matchExpression?: MatchExpressionData,
    attributeQuery?: AttributeQueryData,
    modifier?: ModifierData
}


export class RecordQuery {
    static create(recordName: string, map: EntityToTableMap, data: RecordQueryData, contextRootEntity?: string) {
        // CAUTION 因为合表后可能用关联数据匹配到行。
        const matchExpression = (new MatchExpression(recordName, map, data.matchExpression, contextRootEntity)).and({
            key: 'id',
            value: ['not', null]
        })
        return new RecordQuery(
            recordName,
            map,
            matchExpression,
            // new MatchExpression(recordName, map, data.matchExpression, contextRootEntity),
            new AttributeQuery(recordName, map, data.attributeQuery || []),
            new Modifier(recordName, map, data.modifier!),
            contextRootEntity,
        )
    }
    constructor(public recordName: string, public map: EntityToTableMap, public matchExpression: MatchExpression, public attributeQuery: AttributeQuery, public modifier: Modifier, public contextRootEntity?: string) {}
}

export type RecordQueryTree = {
    [k: string]: RecordQueryTree
}