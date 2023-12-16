import {Entity, Interaction, KlassInstance, MapInteraction} from "@interaqt/shared";
import {InteractionEventArgs} from "../types/interaction.js";
import {MatchExp} from '@interaqt/storage'
import {ComputedDataHandle} from "./ComputedDataHandle.js";
import {RecordMutationEvent} from "../System.js";
import {InteractionCallResponse} from "../InteractionCall.js";

export class MapInteractionHandle extends ComputedDataHandle {
    data!: KlassInstance<typeof Entity, false>
    mapItems!: Map<KlassInstance<typeof Interaction, false>, {
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
            return [interaction, {
                handle: map,
                computeTarget: (computeTarget as (data: InteractionEventArgs, activityId?: string) => any)?.bind(this.controller)
            }]
        }))

        this.defaultValue = computedData.defaultValue
    }
    addEventListener() {
        super.addEventListener()

        this.mapItems.forEach((_, interaction)=> {
            this.controller.listen(interaction, this.onCallInteraction)
        })
    }
    onCallInteraction = async (interaction: KlassInstance<typeof Interaction, false>, interactionEventArgs: InteractionEventArgs, effects: InteractionCallResponse["effects"],activityId?: string) => {
        const {handle} = this.mapItems.get(interaction)!
        const value = await handle.call(this.controller, interactionEventArgs, activityId)

        if (this.computedDataType === 'global') {
            return this.updateState( value, effects)
        } else if (this.computedDataType === 'property') {
            return this.updateProperty(value, interaction, interactionEventArgs, activityId,  effects)
        } else if (this.computedDataType === 'entity' || this.computedDataType === 'relation') {
            return this.createOrUpdateRecord(value, effects)
        }

    }
    async updateProperty(newValue: any, interaction: KlassInstance<typeof Interaction, false>,interactionEventArgs: InteractionEventArgs, activityId: string|undefined, effects: InteractionCallResponse["effects"]) {
        const {computeTarget} = this.mapItems.get(interaction)!

        const source = await computeTarget(interactionEventArgs, activityId)
        if (source) {
            const sources = Array.isArray(source) ? source : [source]
            for (const source of sources) {
                const match = MatchExp.fromObject(source)
                const result = await this.controller.system.storage.update(this.recordName!, match, {[this.propertyName!]: newValue})
                effects!.push({
                    type: 'update',
                    recordName: this.recordName!,
                    record: result
                })
            }
        }
    }
    async createOrUpdateRecord(newMappedItemResult: any, effects: InteractionCallResponse["effects"]) {
        if (newMappedItemResult !== undefined) {
            const newMappedItems = Array.isArray(newMappedItemResult) ? newMappedItemResult : [newMappedItemResult]
            for(const newMappedItem of newMappedItems) {
                // CAUTION 注意，这里的增量计算语义是 map one interaction to one relation。所以不会有更新的情况，因为 Interaction 不会更新。
                //  如果有更复杂的 computed Relation 需求，应该用别的
                let result
                if (this.computedDataType === 'entity') {
                    if(newMappedItem.id) {
                        const match = MatchExp.atom({key: 'id', value: ['=', newMappedItem.id]})
                        result = await this.controller.system.storage.update( this.recordName!, match, newMappedItem)
                    } else {
                        result = await this.controller.system.storage.create( this.recordName!, newMappedItem)
                    }
                } else {
                    if (newMappedItem.id) {
                        const match = MatchExp.atom({key: 'id', value: ['=', newMappedItem.id]})
                        result = await this.controller.system.storage.updateRelationByName( this.recordName!, match, newMappedItem)
                    } else {
                        result = await this.controller.system.storage.addRelationByNameById( this.recordName!, newMappedItem.source.id, newMappedItem.target.id, newMappedItem)
                    }
                }


                effects!.push({
                    type: newMappedItem.id ? 'update' : 'create',
                    recordName: this.recordName!,
                    record: result
                })

            }

        }
    }
    updateState(newValue: any, effects: InteractionCallResponse["effects"]) {
        effects!.push({
            type: 'update',
            stateName: this.dataContext.id!,
            value: newValue
        })
        return this.controller.system.storage.set('state', this.dataContext.id as string, newValue)
    }
}

ComputedDataHandle.Handles.set(MapInteraction, MapInteractionHandle)