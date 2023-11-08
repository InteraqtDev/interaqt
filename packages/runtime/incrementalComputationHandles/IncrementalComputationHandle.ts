import {KlassInstanceOf, KlassType} from "../../shared/createClass";
import {Entity, Property, Relation} from "../../shared/entity/Entity";
import {Controller} from "../Controller";

export class IncrementalComputationHandle {
    constructor(public controller: Controller) {
    }
    // 初始值
    async recoverComputedData() {

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

export class PropertyIncrementalComputationHandle extends IncrementalComputationHandle{
    public static Handles = new Map<KlassType<any>, typeof PropertyIncrementalComputationHandle>()
    constructor(public controller: Controller, public entity: KlassInstanceOf<typeof Entity, false>, public property: KlassInstanceOf<typeof Property, false>) {
        super(controller);
    }
}

export class GlobalIncrementalComputationHandle extends IncrementalComputationHandle{
    public static Handles = new Map<KlassType<any>, typeof GlobalIncrementalComputationHandle>()
}



