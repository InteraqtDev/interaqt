import { expect, test, describe } from "vitest";
import {EntityToTableMap, MapData} from "../erstorage/EntityToTableMap.js";
import {entityToTableMapData} from "./data/mapData";
import {MatchExp, MatchExpressionData} from "../erstorage/MatchExp.js";
import {RecordQueryTree} from "../erstorage/RecordQuery.js";


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

