import {KlassInstanceOf, KlassType} from "../../shared/createClass";
import {Entity, Relation} from "../../shared/entity/Entity";
import {Controller} from "../Controller";

export class IncrementalComputationHandle {
    constructor(public controller: Controller) {

    }
}


export class EntityIncrementalComputationHandle extends IncrementalComputationHandle{
    public static Handles = new Map<KlassType<any>, typeof EntityIncrementalComputationHandle>()
    constructor(public controller: Controller, public data: KlassInstanceOf<typeof Entity, false>) {
        super(controller);
    }
}




export class RelationIncrementalComputationHandle extends IncrementalComputationHandle {
    public static Handles = new Map<KlassType<any>, typeof RelationIncrementalComputationHandle>()
    constructor(public controller: Controller, public data: KlassInstanceOf<typeof Relation, false>) {
        super(controller);
    }
}

