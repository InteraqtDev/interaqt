import {MatchExpression, MatchExpressionData} from "./MatchExpression";
import {AttributeQuery, AttributeQueryData} from "./AttributeQuery";
import {Modifier, ModifierData} from "./Modifier";
import {EntityToTableMap} from "./EntityToTableMap";

export type EntityQueryData = {
    matchExpression?: MatchExpressionData,
    attributeQuery?: AttributeQueryData,
    modifier?: ModifierData
}
// export type EntityQueryDerivedData = {
//     matchExpression?: MatchExpression,
//     attributeQuery?: AttributeQuery,
//     modifier?: Modifier
// }

export class RecordQuery {
    static create(entityName: string, map: EntityToTableMap, data: EntityQueryData, contextRootEntity?: string) {
        // CAUTION 因为合表后可能用关联数据匹配到行。
        const matchExpression = (new MatchExpression(entityName, map, data.matchExpression, contextRootEntity)).and({
            key: 'id',
            value: ['not', null]
        })
        return new RecordQuery(
            entityName,
            map,
            matchExpression,
            // new MatchExpression(entityName, map, data.matchExpression, contextRootEntity),
            new AttributeQuery(entityName, map, data.attributeQuery || []),
            new Modifier(entityName, map, data.modifier!),
            contextRootEntity,
        )
    }
    constructor(public entityName: string, public map: EntityToTableMap, public matchExpression: MatchExpression, public attributeQuery: AttributeQuery, public modifier: Modifier, public contextRootEntity?: string) {}
    // derive(derived: EntityQueryDerivedData) {
    //     return new RecordQuery(
    //         this.entityName,
    //         this.map,
    //         derived.matchExpression || this.matchExpression,
    //         derived.attributeQuery || this.attributeQuery,
    //         derived.modifier || this.modifier,
    //         this.contextRootEntity
    //     )
    // }

}

export type EntityQueryTree = {
    [k: string]: EntityQueryTree
}