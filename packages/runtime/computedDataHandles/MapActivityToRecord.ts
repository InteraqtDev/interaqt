import {
    ComputedData,
    Entity,
    getInteractions,
    Interaction,
    KlassInstance,
    MapActivityToRecord,
    Relation
} from "@interaqt/shared";
import {InteractionEventArgs} from "../types/interaction.js";
import {Controller} from "../Controller.js";
import {MatchExp} from '@interaqt/storage'
import {ComputedDataHandle, DataContext} from "./ComputedDataHandle.js";
import {activityEntity, RecordMutationEvent} from "../System.js";
import {InteractionCallResponse} from "../InteractionCall.js";

export type MapSourceDataType = {
    interaction: KlassInstance<typeof Interaction, false>,
    data: InteractionEventArgs
}

export class MapActivityToRecordHandle extends ComputedDataHandle {
    data!: KlassInstance<typeof Entity, false>
    mapItem!: (data: MapSourceDataType[]) => any
    allInteractions!: KlassInstance<typeof Interaction, false>[]
    interactionsToListen!: KlassInstance<typeof Interaction, false>[]
    constructor(controller: Controller , computedData: KlassInstance<typeof ComputedData, false> , dataContext:  DataContext) {
        super(controller, computedData, dataContext);
    }
    computeEffect(mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): any {
        return undefined
    }
    parseComputedData() {
        const computedData = this.computedData as unknown as  KlassInstance<typeof MapActivityToRecord, false>
        this.allInteractions = getInteractions(computedData.sourceActivity!)
        this.interactionsToListen = computedData.triggerInteraction ||this.allInteractions

        this.data = this.dataContext.id as KlassInstance<typeof Entity, false>
        this.mapItem = (computedData.handle! as unknown as (data: MapSourceDataType[]) => any).bind(this.controller)
    }
    setupSchema() {
        const thisEntity = (this.dataContext.id as KlassInstance<typeof Entity, false>)

        this.controller.relations.push(Relation.create({
            source: thisEntity,
            sourceProperty: 'activity',
            target: activityEntity,
            relType: '1:1',
            targetProperty: thisEntity.name.toLowerCase(),
        }))
    }
    addEventListener() {
        super.addEventListener()
        this.interactionsToListen.forEach(interaction => {
            this.controller.listen(interaction, this.onCallInteraction)
        })
    }


    onCallInteraction = async (interaction: any, interactionEventArgs: InteractionEventArgs, effects: InteractionCallResponse["effects"], activityId:string) => {

        const match = MatchExp.atom({
            key: 'activity.id',
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
                interaction: this.allInteractions.find(i => i.uuid === event.interactionId)!,
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
                const result = await this.controller.system.storage.update(
                    this.data!.name!,
                    MatchExp.atom({ key: 'id', value: ['=', oldData.id]}),
                    {
                        ...newMappedItem,
                    },
                )

                effects!.push({
                    type: 'update',
                    recordName: this.data!.name!,
                    record: result
                })

            } else {
                const result = await this.controller.system.storage.create(this.data!.name!, {
                    ...newMappedItem,
                    activity: {
                        id: activityId
                    }
                })

                effects!.push({
                    type: 'create',
                    recordName: this.data!.name!,
                    record: result
                })
            }
        }
    }
}

ComputedDataHandle.Handles.set(MapActivityToRecord, MapActivityToRecordHandle)