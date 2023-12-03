import {KlassInstance} from "@interaqt/shared";
import {InteractionEventArgs} from "../types/interaction";
import {Interaction} from "@interaqt/shared";
import {Entity} from "@interaqt/shared";
import {MapInteractionToProperty} from '@interaqt/shared'
import {MatchExp} from '@interaqt/storage'
import {ComputedDataHandle} from "./ComputedDataHandle.js";
import {RecordMutationEvent} from "../System.js";

export class MapInteractionToPropertyHandle extends ComputedDataHandle {
    data!: KlassInstance<typeof Entity, false>
    mapItems!: Map<KlassInstance<typeof Interaction, false>, {
        computeSource: (data: InteractionEventArgs, activityId?: string) => any
        value: any
    }>
    // FIXME 之后 从 listen interaction 也改成 监听 record 事件??
    computeEffect(mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): any {

    }
    parseComputedData() {
        const computedData = this.computedData as unknown as  KlassInstance<typeof MapInteractionToProperty, false>
        this.mapItems = new Map(computedData.items.map(({interaction, value, computeSource}) => {
            return [interaction, {
                value,
                // computeSource: this.parseMapItemFunction(computeSource!)
                computeSource: (computeSource as (data: InteractionEventArgs, activityId?: string) => any).bind(this.controller)
            }]
        }))
    }
    addEventListener() {
        this.mapItems.forEach((_, interaction)=> {
            this.controller.listen(interaction, (event, activityId) => this.onCallInteraction(interaction, event, activityId))
        })
    }
    parseMapItemFunction(content: string) {
        const body = new Function('sourceData', 'activityId',  `return (${content})(sourceData, activityId)`)

        return (sourceData: InteractionEventArgs, activityId?: string) => {
            return body.call(this.controller, sourceData, activityId)
        }
    }
    onCallInteraction = async (interaction: KlassInstance<typeof Interaction, false>, interactionEventArgs: InteractionEventArgs, activityId?: string) => {
        const {value, computeSource} = this.mapItems.get(interaction)!
        const source = await computeSource(interactionEventArgs, activityId)
        if (source) {
            const sources = Array.isArray(source) ? source : [source]
            for (const source of sources) {
                const match = MatchExp.fromObject(source)
                const result = await this.controller.system.storage.update(this.recordName!, match, {[this.propertyName!]: value})
            }
        }
    }
}

ComputedDataHandle.Handles.set(MapInteractionToProperty, MapInteractionToPropertyHandle)