import { expect, test, describe } from "bun:test";
import {EntityToTableMap, MapData} from "../erstorage/EntityToTableMap";
import {entityToTableMapData} from "./data/mapData";
import {MatchExp, MatchExpressionData} from "../erstorage/MatchExp.ts";
import {RecordQueryTree} from "../erstorage/RecordQuery.ts";


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

