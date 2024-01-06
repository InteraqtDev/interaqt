import {Activity, Entity, getInteractions, Interaction, KlassInstance, MapActivity, Relation} from "@interaqt/shared";
import {InteractionEvent, InteractionEventArgs} from "../types/interaction.js";
import {MatchExp} from '@interaqt/storage'
import {ComputedDataHandle} from "./ComputedDataHandle.js";
import {activityEntity, EVENT_RECORD, InteractionEventRecord, RecordMutationEvent} from "../System.js";
import {assert} from "../util.js";


export class MapActivityHandle extends ComputedDataHandle {
    data!: KlassInstance<typeof Entity, false>
    mapItems!: Map<string, {
        activity: KlassInstance<typeof Activity, false>
        interaction: KlassInstance<typeof Interaction, false>
        computeTarget: (data: InteractionEventArgs, activityId?: string) => any
        handle: (interactionEvents: InteractionEvent[], args: InteractionEventArgs, activityId?: string) => any
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
        this.mapItems = new Map()

        computedData.items.forEach(({activity, map, computeTarget, triggerInteractions}) => {
            const interactions = triggerInteractions || getInteractions(activity!)
            interactions.forEach(triggerInteraction => {
                this.mapItems.set(triggerInteraction.uuid, {
                    activity,
                    interaction: triggerInteraction,
                    handle: map,
                    computeTarget: (computeTarget as (data: InteractionEventArgs, activityId?: string) => any)?.bind(this.controller),
                })
            })

        })

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


        this.controller.system.storage.listen(async (mutationEvents) => {
            const events: RecordMutationEvent[] = []
            for(let mutationEvent of mutationEvents){
                if (mutationEvent.type==='create'&& mutationEvent.recordName === EVENT_RECORD) {
                    // 是不是监听的 interaction 的变化
                    const item = this.mapItems.get(mutationEvent.record!.interactionId)
                    if (item) {
                        const {interaction} = item
                        const eventRecord = mutationEvent.record! as InteractionEventRecord

                        const newEvents = await this.onCallInteraction(interaction, eventRecord, mutationEvent.record!.activityId)
                        events.push(...(newEvents||[]))
                    }
                }

            }

            return { events }
        })

        // this.mapItems.forEach(({triggerInteractions}, activity)=> {
        //     triggerInteractions.forEach(triggerInteraction => {
        //         this.controller.listen(triggerInteraction, (interaction: KlassInstance<typeof Interaction, false>, interactionEventArgs: InteractionEventArgs, effects: InteractionCallResponse["effects"], activityId?: string) => this.onCallInteraction(activity, interaction, interactionEventArgs, effects, activityId))
        //     })
        // })
    }
    onCallInteraction = async (interaction: KlassInstance<typeof Interaction, false>, interactionEventArgs: InteractionEventArgs, activityId?: string) => {
        assert(activityId !== undefined, 'activityId should not be undefined')

        // 还没有数据，尝试执行 map 函数看能不能得到数据
        const eventMatch = MatchExp.atom({
            key: 'activityId',
            value: ['=', activityId]
        })
        const allInteractionEvents = await this.controller.system.getEvent(eventMatch)

        const {handle} = this.mapItems.get(interaction.uuid)!

        const value = await handle.call(this.controller, allInteractionEvents, interactionEventArgs, activityId)

        if (!value && (this.computedDataType === 'entity' || this.computedDataType === 'relation')) {
            // 说明没准备好
            return
        }

        let events!: RecordMutationEvent[]

        if (this.computedDataType === 'global') {
            events = await this.updateGlobalState( value)
        } else if (this.computedDataType === 'property') {
            events = await this.updateProperty(value, interaction, interactionEventArgs, activityId)
        } else if (this.computedDataType === 'entity' || this.computedDataType === 'relation') {
            events = await this.createOrUpdateRecord(value, activityId!)
        }

        return events

    }
    async updateProperty(newValue: any, interaction: KlassInstance<typeof Interaction, false>,interactionEventArgs: InteractionEventArgs, activityId: string|undefined) {
        const {computeTarget} = this.mapItems.get(interaction.uuid)!

        const events: RecordMutationEvent[] = []
        const source = await computeTarget(interactionEventArgs, activityId)
        if (source) {
            const sources = Array.isArray(source) ? source : [source]
            for (const source of sources) {
                const match = MatchExp.fromObject(source)
                const innerMutationEvents: RecordMutationEvent[] =[]
                await this.controller.system.storage.update(this.recordName!, match, {[this.propertyName!]: newValue}, innerMutationEvents)
                events.push(...innerMutationEvents)
            }
        }
        return events
    }
    async createOrUpdateRecord(newMappedItem: any, activityId: string) {
        const events: RecordMutationEvent[] = []

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

            const innerMutationEvents: RecordMutationEvent[] =[]

            if (this.computedDataType === 'entity'){
                if(oldData) {
                    const match = MatchExp.atom({key: 'id', value: ['=', oldData.id]})
                    await this.controller.system.storage.update( this.recordName!, match, newMappedItemWithActivityId, innerMutationEvents)
                } else {
                    await this.controller.system.storage.create( this.recordName!, newMappedItemWithActivityId, innerMutationEvents)
                }
            } else {
                if (oldData) {
                    const match = MatchExp.atom({key: 'id', value: ['=', oldData.id]})
                    await this.controller.system.storage.updateRelationByName( this.recordName!, match, newMappedItemWithActivityId, innerMutationEvents)
                } else {
                    await this.controller.system.storage.addRelationByNameById( this.recordName!, newMappedItemWithActivityId.source.id, newMappedItemWithActivityId.target.id, newMappedItemWithActivityId, innerMutationEvents)
                }
            }
            events.push(...innerMutationEvents)
        }
        return events
    }
    async updateGlobalState(newValue: any) {
        const events: RecordMutationEvent[] = []
        await this.controller.system.storage.set('state', this.dataContext.id as string, newValue, events)
        return events
    }
}

ComputedDataHandle.Handles.set(MapActivity, MapActivityHandle)