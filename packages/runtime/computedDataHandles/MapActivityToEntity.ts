import {KlassInstance} from "@shared/createClass";
import {InteractionEvent, InteractionEventArgs} from "../../types/interaction";
import {Controller} from "../Controller";
import { getInteractions, Interaction} from "@shared/activity/Activity";
import {Entity, Property} from "@shared/entity/Entity";
import {ComputedData, MapActivityToEntity} from '@shared/IncrementalComputation'
import {MatchExp} from '@storage/erstorage/MatchExp'
import {ComputedDataHandle, DataContext} from "./ComputedDataHandle";
import {RecordMutationEvent} from "../System";

export type MapSourceDataType = {
    interaction: KlassInstance<typeof Interaction, false>,
    data: InteractionEventArgs
}

export class MapActivityToEntityHandle extends ComputedDataHandle {
    data!: KlassInstance<typeof Entity, false>
    mapItem: (data: MapSourceDataType[]) => any = () => undefined
    interactionsToListen: KlassInstance<typeof Interaction, false>[] = []
    constructor(controller: Controller , computedData: KlassInstance<typeof ComputedData, false> , dataContext:  DataContext) {
        super(controller, computedData, dataContext);
    }
    // FIXME 之后 从 listen interaction 也改成 监听 record 事件
    computeEffect(mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): any {

    }
    parseComputedData() {
        const computedData = this.computedData as unknown as  KlassInstance<typeof MapActivityToEntity, false>
        this.interactionsToListen = computedData.triggerInteraction || getInteractions(computedData.sourceActivity!)

        this.data = this.dataContext.id as KlassInstance<typeof Entity, false>
        this.mapItem = this.parseMapItemFunction(computedData.handle!)
    }
    setupSchema() {
        (this.dataContext.id as KlassInstance<typeof Entity, false>)!.properties!.push(Property.create({
            name: 'activityId',
            type: 'string',
            collection: false
        }))
    }
    addEventListener() {
        super.addEventListener()
        // FIXME 改成监听 record 事件
        this.interactionsToListen.forEach(interaction => {
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
        const eventMatch = MatchExp.atom({
            key: 'activityId',
            value: ['=', activityId]
        })
        const allInteractionEvents = await this.controller.system.getEvent(eventMatch)
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