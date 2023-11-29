import {KlassInstance} from "@interaqt/shared";
import {InteractionEventArgs} from "../types/interaction";
import {Interaction} from "@interaqt/shared";
import {Entity} from "@interaqt/shared";
import {MapInteractionToProperty} from '@interaqt/shared'
import {MatchExp} from '@interaqt/storage'
import {ComputedDataHandle} from "./ComputedDataHandle";
import {RecordMutationEvent} from "../System";

export class MapInteractionToPropertyHandle extends ComputedDataHandle {
    data!: KlassInstance<typeof Entity, false>
    mapItems!: Map<KlassInstance<typeof Interaction, false>, {
        computeSource: (data: InteractionEventArgs) => any
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
                computeSource: this.parseMapItemFunction(computeSource!)
            }]
        }))
    }
    addEventListener() {
        this.mapItems.forEach((_, interaction)=> {
            this.controller.listen(interaction, (event) => this.onCallInteraction(interaction, event))
        })
    }
    parseMapItemFunction(stringContent: string) {
        const body = new Function('sourceData', `return (${stringContent})(sourceData)`)

        return (sourceData: InteractionEventArgs) => {
            return body(sourceData)
        }
    }
    onCallInteraction = async (interaction: KlassInstance<typeof Interaction, false>, interactionEventArgs: InteractionEventArgs) => {
        const {value, computeSource} = this.mapItems.get(interaction)!
        const source = computeSource(interactionEventArgs)
        if (source) {
            const sources = Array.isArray(source) ? source : [source]
            for (const source of sources) {
                const match = MatchExp.fromObject(source)
                const result = await this.controller.system.storage.update(this.recordName!, match, {[this.propertyName!]: value})

                console.log(result)
            }
        }
    }
}

ComputedDataHandle.Handles.set(MapInteractionToProperty, MapInteractionToPropertyHandle)