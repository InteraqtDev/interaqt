import {EntityToTableMap} from "./EntityToTableMap.js";

export type ModifierData = {
    orderBy?: {
        [k: string]: 'ASC'|'DESC'
    },
    limit?: number,
    offset?: number
}

export class Modifier {
    constructor(public recordName: string, public map: EntityToTableMap, public data: ModifierData, public fromRelation?: boolean) {
    }

    get limit() {
        return this.data?.limit
    }

    get offset() {
        return this.data?.offset
    }

    get orderBy() {
        return Object.entries(this.data?.orderBy || {}).map(([k, v]) => {
            return {
                attribute: k,
                recordName: this.recordName,
                order: v
            }
        })
    }
}