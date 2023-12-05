import {KlassInstance} from "@interaqt/shared";
import {InteractionEventArgs} from "../types/interaction";
import {Interaction} from "@interaqt/shared";
import {Entity} from "@interaqt/shared";
import {MapInteractionToProperty} from '@interaqt/shared'
import {MatchExp} from '@interaqt/storage'
import {ComputedDataHandle} from "./ComputedDataHandle.js";
import {RecordMutationEvent} from "../System.js";
import {InteractionCallResponse} from "../InteractionCall";

export class MapInteractionToPropertyHandle extends ComputedDataHandle {
    data!: KlassInstance<typeof Entity, false>
    mapItems!: Map<KlassInstance<typeof Interaction, false>, {
        computeSource: (data: InteractionEventArgs, activityId?: string) => any
        handle: (data: InteractionEventArgs, activityId?: string) => any
    }>
    // FIXME 之后 从 listen interaction 也改成 监听 record 事件??
    computeEffect(mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): any {

    }
    parseComputedData() {
        const computedData = this.computedData as unknown as  KlassInstance<typeof MapInteractionToProperty, false>
        this.mapItems = new Map(computedData.items.map(({interaction, handle, computeSource}) => {
            return [interaction, {
                handle,
                computeSource: (computeSource as (data: InteractionEventArgs, activityId?: string) => any).bind(this.controller)
            }]
        }))
    }
    addEventListener() {
        this.mapItems.forEach((_, interaction)=> {
            this.controller.listen(interaction, this.onCallInteraction)
        })
    }
    onCallInteraction = async (interaction: KlassInstance<typeof Interaction, false>, interactionEventArgs: InteractionEventArgs, effects: InteractionCallResponse["effects"],activityId?: string) => {
        const {handle, computeSource} = this.mapItems.get(interaction)!
        const source = await computeSource(interactionEventArgs, activityId)
        const value = await handle.call(this.controller, interactionEventArgs, activityId)
        if (source) {
            const sources = Array.isArray(source) ? source : [source]
            for (const source of sources) {
                const match = MatchExp.fromObject(source)
                const result = await this.controller.system.storage.update(this.recordName!, match, {[this.propertyName!]: value})
                effects!.push({
                    type: 'update',
                    recordName: this.recordName!,
                    record: result
                })
            }
        }
    }
}

ComputedDataHandle.Handles.set(MapInteractionToProperty, MapInteractionToPropertyHandle)