import {KlassInstanceOf} from "@shared/createClass";
import {InteractionEvent, InteractionEventArgs} from "../../types/interaction";
import {Controller} from "../Controller";
import { getInteractions, Interaction} from "@shared/activity/Activity";
import {Entity, Property} from "@shared/entity/Entity";
import {ComputedData, MapActivityToEntity} from '@shared/IncrementalComputation'
import {MatchExp} from '@storage/erstorage/MatchExp'
import {ComputedDataHandle, DataContext} from "./ComputedDataHandle";
import {RecordMutationEvent} from "../System";

export type MapSourceDataType = {
    interaction: KlassInstanceOf<typeof Interaction, false>,
    data: InteractionEventArgs
}

export class MapActivityToEntityHandle extends ComputedDataHandle {
    data!: KlassInstanceOf<typeof Entity, false>
    mapItem: (data: MapSourceDataType[]) => any = () => undefined
    computedData: KlassInstanceOf<typeof MapActivityToEntity, false>
    constructor(controller: Controller , computedData: KlassInstanceOf<typeof ComputedData, false> , dataContext:  DataContext) {
        super(controller, computedData, dataContext);
        this.computedData = computedData as KlassInstanceOf<typeof MapActivityToEntity, false>
    }
    // FIXME 之后 从 listen interaction 也改成 监听 record 事件
    computeEffect(mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): any {

    }
    parseComputedData() {
        this.data = this.dataContext.id as KlassInstanceOf<typeof Entity, false>
        this.mapItem = this.parseMapItemFunction(this.computedData.handle!)
    }
    setupSchema() {
        (this.dataContext.id as KlassInstanceOf<typeof Entity, false>)!.properties!.push(Property.create({
            name: 'activityId',
            type: 'string',
            collection: false
        }))
    }
    addEventListener() {
        super.addEventListener()
        // FIXME 改成监听 record 事件
        // 监听的 interaction 变化
        const interactionsToListen = this.computedData.triggerInteraction || getInteractions(this.computedData.sourceActivity!)

        interactionsToListen.forEach(interaction => {
            this.controller.listen(interaction, this.onCallInteraction)
        })
    }

    parseMapItemFunction(stringContent: string) {
        const body = new Function('sourceData', `return (${stringContent})(sourceData)`)

        return (sourceData: MapSourceDataType[]) => {
            return body(sourceData)
        }
    }
    onCallInteraction = async (interactionEventArgs: InteractionEventArgs, activityId:string) => {
        const match = MatchExp.atom({
            key: 'activityId',
            value: ['=', activityId]
        })


        // 还没有数据，尝试执行 map 函数看能不能得到数据
        const allInteractionEvents = await this.controller.system.getEvent({activityId}) as InteractionEvent[]
        const sourceData: MapSourceDataType[] = allInteractionEvents.map(event => {
            return {
                interaction: this.controller.interactionCalls.get(event.interactionId)!.interaction,
                data: event.args
            }
        })


        const newMappedItem = this.mapItem(sourceData)


        // 只有 undefined 是被认为没准备好
        if (newMappedItem !== undefined) {
            const oldData = await this.controller.system.storage.findOne(this.data!.name!, match)
            if (oldData){
                // 已经有数据了。
                // TODO 未来有没有可能有不需要更新的情况？
                await this.controller.system.storage.update(
                    this.data!.name!,
                    MatchExp.atom({ key: 'id', value: ['=', oldData.id]}),
                    {
                        ...newMappedItem,
                        activityId
                    },
                )

            } else {
                await this.controller.system.storage.create(this.data!.name!, {
                    ...newMappedItem,
                    activityId
                })
            }


        }
    }
}

ComputedDataHandle.Handles.set(MapActivityToEntity, MapActivityToEntityHandle)