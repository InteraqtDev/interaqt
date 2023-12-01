import {EntityToTableMap} from "./EntityToTableMap.js";

export type ModifierData = {
    orderBy?: {
        [k: string]: string
    },
    limit?: number,
    offset?: number
}

export class Modifier {
    constructor(public entityName: string, public map: EntityToTableMap, public data: ModifierData, public fromRelation?: boolean) {
    }

    // derive(overwrite: ModifierData) {
    //     return new Modifier(this.entityName, this.map, {...this.data, ...overwrite})
    // }
}