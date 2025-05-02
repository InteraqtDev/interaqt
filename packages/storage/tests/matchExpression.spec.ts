import {describe, expect, test} from "vitest";
import {EntityToTableMap} from "../src/erstorage/EntityToTableMap.js";
import {entityToTableMapData} from "./data/mapData";
import {MatchExp, MatchExpressionData} from "../src/erstorage/MatchExp.js";
import {RecordQueryTree} from "../src/erstorage/RecordQuery.js";


const entityToTableMap = new EntityToTableMap(entityToTableMapData)

describe('match expression test', () => {
    test("basic match query", () => {

        const queryData:MatchExpressionData = MatchExp.atom({
            key: 'leader.name',
            value: ['=', 'A']
        }).and({
            key: 'leader.profile.title',
            value: ['=' , 'classified']
        })

        const matchExpression = new MatchExp('User', entityToTableMap , queryData)
        expect(matchExpression.xToOneQueryTree.records.leader).toBeInstanceOf(RecordQueryTree)
        expect(matchExpression.xToOneQueryTree.records.leader.records.profile).toBeInstanceOf(RecordQueryTree)
    });
})

