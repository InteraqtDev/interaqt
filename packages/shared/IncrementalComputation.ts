import { createClass} from "./createClass";
import {Activity, Interaction} from "./activity/Activity";
import {Entity} from "./entity/Entity";

export const MapActivityToEntity = createClass({
    name: 'MapActivityToEntity',
    public: {
        sourceActivity: {
            type: Activity,
            collection: false,
            required: true
        },
        triggerInteraction: {
            type: Interaction,
            collection: true,
            required: false
        },
        handle: {
            type: 'string',
            collection: false,
            required: true
        }
    }
})

// CAUTION 修补 Entity computedData 里面的类型
Entity.public.computedData.type.push(MapActivityToEntity)

// TODO 其他几种类型