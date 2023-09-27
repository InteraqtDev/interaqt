import {KlassInstanceOf, KlassType} from "../shared/createClass";
import {Entity, Property} from "../shared/entity/Entity";
import { getInteractions, Interaction} from "../shared/activity/Activity";
import { MapActivityToEntity } from '../shared/IncrementalComputation'
import {Controller} from "./Controller";
import {InteractionEvent, InteractionEventArgs} from "../types/interaction";
import { MatchExpression } from '../storage/erstorage/ERStorage'

export class IncrementalComputationHandle {
    constructor(public controller: Controller) {

    }
}


export class EntityIncrementalComputationHandle extends IncrementalComputationHandle{
    public static Handles = new Map<KlassType<any>, typeof EntityIncrementalComputationHandle>()
    constructor(public controller: Controller, public data: KlassInstanceOf<Entity, false>) {
        super(controller);
    }
}


type MapSourceDataType = {
    interaction: KlassInstanceOf<typeof Interaction, false>,
    data: InteractionEventArgs
}

class MapActivityToEntityHandle extends EntityIncrementalComputationHandle {
    mapItem: (data: MapSourceDataType[]) => any
    computedData: KlassInstanceOf<MapActivityToEntity, false>
    constructor(public controller: Controller, public data: KlassInstanceOf<Entity, false>) {
        super(controller, data);
        this.computedData = data.computedData as KlassInstanceOf<MapActivityToEntity, false>
        this.addActivityIdFieldToEntity()

        this.mapItem = this.parseFunction(this.computedData.handle)
        this.listenInteractionInActivity()
    }

    addActivityIdFieldToEntity() {
        this.data.properties.push(Property.create({
            name: 'activityId',
            type: 'string',
            collection: false
        }))
    }

    parseFunction(stringContent: string) {
        const body = new Function('sourceData', `return (${stringContent})(sourceData)`)

        return (sourceData: MapSourceDataType[]) => {
            return body(sourceData)
        }
    }

    listenInteractionInActivity(){
        // 监听的 interaction 变化
        const interactionsToListen = this.computedData.triggerInteraction || getInteractions(this.data.sourceActivity)

        interactionsToListen.forEach(interaction => {
            this.controller.listen(interaction, this.onCallInteraction)
        })
    }
    onCallInteraction = async (interactionEventArgs: InteractionEventArgs, activityId) => {
        const match = MatchExpression.createFromAtom({
            key: 'activityId',
            value: ['=', activityId]
        })


        // 还没有数据，尝试执行 map 函数看能不能得到数据
        const allInteractionEvents = this.controller.system.getEvent({activityId}) as InteractionEvent[]
        const sourceData: MapSourceDataType[] = allInteractionEvents.map(event => {
            return {
                interaction: this.controller.interactionCalls.get(event.interactionId).interaction,
                data: event.args
            }
        })


        const newMappedItem = this.mapItem(sourceData)


        // 只有 undefined 是被认为没准备好
        if (newMappedItem !== undefined) {
            const oldData = await this.controller.system.storage.findOne(this.data.name, match)
            console.log(111, oldData)
            if (oldData){
                // 已经有数据了。
                // TODO 未来有没有可能有不需要更新的情况？
                await this.controller.system.storage.update(
                    this.data.name,
                    MatchExpression.createFromAtom({ key: 'id', value: ['=', oldData.id]}),
                    {
                        ...newMappedItem,
                        activityId
                    },
                )

            } else {
                await this.controller.system.storage.create(this.data.name, {
                    ...newMappedItem,
                    activityId
                })
            }


        }
    }
}

EntityIncrementalComputationHandle.Handles.set(MapActivityToEntity, MapActivityToEntityHandle)
