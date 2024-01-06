import {Entity, KlassInstance, MapInteraction} from "@interaqt/shared";
import {InteractionEventArgs} from "../types/interaction.js";
import {MatchExp} from '@interaqt/storage'
import {ComputedDataHandle} from "./ComputedDataHandle.js";
import {EVENT_RECORD, InteractionEventRecord, RecordMutationEvent} from "../System.js";


export class MapInteractionHandle extends ComputedDataHandle {
    data!: KlassInstance<typeof Entity, false>
    mapItems!: Map<string, {
        computeTarget: (data: InteractionEventArgs, activityId?: string) => any
        handle: (data: InteractionEventArgs, activityId?: string) => any
    }>
    defaultValue: any
    getDefaultValue(): any {
        if (this.computedDataType === 'global'|| this.computedDataType === 'property') {
            return this.defaultValue
        }
    }

    computeEffect(mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): any {
        // 阻止默认的行为。默认行为是监听的当前 Record 的变化，然后更新自己的值。这里不需要。
        return undefined
    }
    parseComputedData() {
        const computedData = this.computedData as unknown as  KlassInstance<typeof MapInteraction, false>
        this.mapItems = new Map(computedData.items.map(({interaction, map, computeTarget}) => {
            return [interaction.uuid, {
                handle: map,
                computeTarget: (computeTarget as (data: InteractionEventArgs, activityId?: string) => any)?.bind(this.controller)
            }]
        }))

        this.defaultValue = computedData.defaultValue
    }
    addEventListener() {
        super.addEventListener()

        this.controller.system.storage.listen(async (mutationEvents) => {
            const events: RecordMutationEvent[] = []
            for(let mutationEvent of mutationEvents){

                if (mutationEvent.type==='create'&& mutationEvent.recordName === EVENT_RECORD) {
                    // 是不是监听的 interaction 的变化
                    const item = this.mapItems.get(mutationEvent.record!.interactionId)
                    if (item) {
                        const {handle} = item
                        const eventRecord = mutationEvent.record! as InteractionEventRecord
                        const value = await handle.call(this.controller, eventRecord, mutationEvent.record!.activityId)

                        let innerMutationEvents: RecordMutationEvent[]
                        if (this.computedDataType === 'global') {
                            innerMutationEvents = await this.updateGlobalState( value)
                        } else if (this.computedDataType === 'property') {
                            innerMutationEvents = await this.updateProperty(value, mutationEvent.record!.interactionId, eventRecord, mutationEvent.record!.activityId)
                        } else if (this.computedDataType === 'entity' || this.computedDataType === 'relation') {
                            innerMutationEvents = await this.createOrUpdateRecord(value)
                        }
                        events.push(...innerMutationEvents!)
                    }
                }
            }

            return { events }
        })
    }
    async updateProperty(newValue: any, interactionUUID: string,interactionEventArgs: InteractionEventArgs, activityId: string|undefined) {
        const events: RecordMutationEvent[] = []
        const {computeTarget} = this.mapItems.get(interactionUUID)!

        const source = await computeTarget(interactionEventArgs, activityId)
        if (source) {
            const sources = Array.isArray(source) ? source : [source]
            for (const source of sources) {
                const match = MatchExp.fromObject(source)
                const innerEvents : RecordMutationEvent[] = []
                await this.controller.system.storage.update(this.recordName!, match, {[this.propertyName!]: newValue}, innerEvents)
                events.push(...innerEvents)
            }
        }

        return events
    }
    async createOrUpdateRecord(newMappedItemResult: any) {
        const events: RecordMutationEvent[] = []

        if (newMappedItemResult !== undefined) {
            const newMappedItems = Array.isArray(newMappedItemResult) ? newMappedItemResult : [newMappedItemResult]
            for(const newMappedItem of newMappedItems) {
                // CAUTION 注意，这里的增量计算语义是 map one interaction to one relation。所以不会有更新的情况，因为 Interaction 不会更新。
                //  如果有更复杂的 computed Relation 需求，应该用别的
                const innerEvents : RecordMutationEvent[] = []

                if (this.computedDataType === 'entity') {
                    if(newMappedItem.id) {
                        const match = MatchExp.atom({key: 'id', value: ['=', newMappedItem.id]})
                        await this.controller.system.storage.update( this.recordName!, match, newMappedItem,  innerEvents)
                    } else {
                        await this.controller.system.storage.create( this.recordName!, newMappedItem,  innerEvents)
                    }
                } else {
                    if (newMappedItem.id) {
                        const match = MatchExp.atom({key: 'id', value: ['=', newMappedItem.id]})
                        await this.controller.system.storage.updateRelationByName( this.recordName!, match, newMappedItem,  innerEvents)
                    } else {
                        if (events.length === 2) debugger
                        await this.controller.system.storage.addRelationByNameById( this.recordName!, newMappedItem.source.id, newMappedItem.target.id, newMappedItem,  innerEvents)
                    }
                }
                events.push(...innerEvents)
            }
        }

        return events
    }
    async updateGlobalState(newValue: any) {
        const events: RecordMutationEvent[] = []
        await this.controller.system.storage.set('state', this.dataContext.id as string, newValue, events)
        return events
    }
}

ComputedDataHandle.Handles.set(MapInteraction, MapInteractionHandle)