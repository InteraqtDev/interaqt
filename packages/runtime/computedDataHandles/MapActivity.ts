import {Entity, Interaction, KlassInstance, MapActivity, Activity, getInteractions, Relation} from "@interaqt/shared";
import {InteractionEventArgs} from "../types/interaction.js";
import {MatchExp} from '@interaqt/storage'
import {ComputedDataHandle} from "./ComputedDataHandle.js";
import {activityEntity, RecordMutationEvent} from "../System.js";
import {InteractionCallResponse} from "../InteractionCall.js";
import { assert} from "../util.js";

type MapSourceDataType = {
    interaction: KlassInstance<typeof Interaction, false>,
    data: InteractionEventArgs
}

export class MapActivityHandle extends ComputedDataHandle {
    data!: KlassInstance<typeof Entity, false>
    mapItems!: Map<KlassInstance<typeof Activity, false>, {
        computeTarget: (data: InteractionEventArgs, activityId?: string) => any
        handle: (data: MapSourceDataType[], args: InteractionEventArgs, activityId?: string) => any
        triggerInteractions: KlassInstance<typeof Interaction, false>[]
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
        const computedData = this.computedData as unknown as  KlassInstance<typeof MapActivity, false>
        this.mapItems = new Map(computedData.items.map(({activity, handle, computeTarget, triggerInteractions}) => {
            return [activity, {
                handle,
                computeTarget: (computeTarget as (data: InteractionEventArgs, activityId?: string) => any)?.bind(this.controller),
                triggerInteractions: triggerInteractions || getInteractions(activity!)
            }]
        }))

        this.defaultValue = computedData.defaultValue
    }
    setupSchema() {
        // 如果是 map to record，那么要记录一下关系，后面再触发的时候，自动判断是更新 record 还是
        if (this.computedDataType === 'entity' || this.computedDataType === 'relation') {
            const thisEntity = (this.dataContext.id as KlassInstance<typeof Entity, false>)

            this.controller.relations.push(Relation.create({
                source: thisEntity,
                sourceProperty: 'activity',
                target: activityEntity,
                relType: '1:1',
                targetProperty: thisEntity.name.toLowerCase(),
            }))
        }
    }
    addEventListener() {
        // 当是 state/property 的时候，仍然要监听变化，里面会自动创建 defaultValue
        super.addEventListener()

        this.mapItems.forEach(({triggerInteractions}, activity)=> {
            triggerInteractions.forEach(triggerInteraction => {
                this.controller.listen(triggerInteraction, (interaction: KlassInstance<typeof Interaction, false>, interactionEventArgs: InteractionEventArgs, effects: InteractionCallResponse["effects"], activityId?: string) => this.onCallInteraction(activity, interaction, interactionEventArgs, effects, activityId))
            })
        })
    }
    onCallInteraction = async (activity: KlassInstance<typeof Activity, false>, interaction: KlassInstance<typeof Interaction, false>, interactionEventArgs: InteractionEventArgs, effects: InteractionCallResponse["effects"], activityId?: string) => {
        assert(activityId !== undefined, 'activityId should not be undefined')

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
                interaction: getInteractions(activity!).find(i => i.uuid === event.interactionId)!,
                data: event.args
            }
        })

        const {handle} = this.mapItems.get(activity)!
        const value = await handle.call(this.controller, sourceData, interactionEventArgs, activityId)


        if (!value && (this.computedDataType === 'entity' || this.computedDataType === 'relation')) {
            // 说明没准备好
            return
        }


        if (this.computedDataType === 'global') {
            return this.updateState( value, effects)
        } else if (this.computedDataType === 'property') {
            return this.updateProperty(value, activity, interactionEventArgs, activityId,  effects)
        } else if (this.computedDataType === 'entity' || this.computedDataType === 'relation') {
            return this.createOrUpdateRecord(value, activityId!, effects)
        }

    }
    async updateProperty(newValue: any, activity: KlassInstance<typeof Activity, false>,interactionEventArgs: InteractionEventArgs, activityId: string|undefined, effects: InteractionCallResponse["effects"]) {
        const {computeTarget} = this.mapItems.get(activity)!

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
    async createOrUpdateRecord(newMappedItem: any, activityId: string, effects: InteractionCallResponse["effects"]) {
        if (newMappedItem !== undefined) {
            assert(!Array.isArray(newMappedItem), 'map activity to record should return one record')
                // CAUTION 注意，这里的增量计算语义是 map one interaction to one relation。所以不会有更新的情况，因为 Interaction 不会更新。
                //  如果有更复杂的 computed Relation 需求，应该用别的

            const match = MatchExp.atom({
                key: 'activity.id',
                value: ['=', activityId]
            })

            const oldData = await this.controller.system.storage.findOne(this.recordName!, match)

            const newMappedItemWithActivityId = {
                ...newMappedItem,
                activity: {
                    id: activityId
                }
            }

            let result
            if (this.computedDataType === 'entity'){
                if(oldData) {
                    const match = MatchExp.atom({key: 'id', value: ['=', oldData.id]})
                    result = await this.controller.system.storage.update( this.recordName!, match, newMappedItemWithActivityId)
                } else {
                    result = await this.controller.system.storage.create( this.recordName!, newMappedItemWithActivityId)
                }
            } else {
                if (oldData) {
                    const match = MatchExp.atom({key: 'id', value: ['=', oldData.id]})
                    result = await this.controller.system.storage.updateRelationByName( this.recordName!, match, newMappedItemWithActivityId)
                } else {
                    result = await this.controller.system.storage.addRelationByNameById( this.recordName!, newMappedItemWithActivityId.source.id, newMappedItemWithActivityId.target.id, newMappedItemWithActivityId)
                }
            }


            effects!.push({
                type: oldData ? 'update' : 'create',
                recordName: this.recordName!,
                record: result
            })
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

ComputedDataHandle.Handles.set(MapActivity, MapActivityHandle)