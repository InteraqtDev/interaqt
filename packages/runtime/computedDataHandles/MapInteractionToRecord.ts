import {KlassInstance} from "@interaqt/shared";
import {InteractionEvent, InteractionEventArgs} from "../types/interaction";
import {Controller} from "../Controller";
import { getInteractions, Interaction} from "@interaqt/shared";
import {Entity, Property} from "@interaqt/shared";
import {ComputedData, MapActivityToEntity, MapInteractionToRecord} from '@interaqt/shared'
import {MatchExp} from '@interaqt/storage'
import {ComputedDataHandle, DataContext} from "./ComputedDataHandle";
import {RecordMutationEvent} from "../System";

export class MapInteractionToRecordHandle extends ComputedDataHandle {
    data!: KlassInstance<typeof Entity, false>
    mapItem: (data: InteractionEventArgs) => any = () => undefined
    sourceInteraction!: KlassInstance<typeof Interaction, false>
    constructor(controller: Controller , computedData: KlassInstance<typeof ComputedData, false> , dataContext:  DataContext) {
        super(controller, computedData, dataContext);
    }
    // FIXME 之后 从 listen interaction 也改成 监听 record 事件
    computeEffect(mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): any {

    }
    parseComputedData() {
        const computedData = this.computedData as unknown as  KlassInstance<typeof MapInteractionToRecord, false>
        this.sourceInteraction = computedData.sourceInteraction

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
        this.controller.listen(this.sourceInteraction, this.onCallInteraction)
    }

    parseMapItemFunction(stringContent: string) {
        const body = new Function('sourceData', `return (${stringContent})(sourceData)`)

        return (sourceData: InteractionEventArgs) => {
            return body(sourceData)
        }
    }
    onCallInteraction = async (interactionEventArgs: InteractionEventArgs) => {
        const newMappedItem = this.mapItem(interactionEventArgs)
        // 只有 undefined 是被认为没准备好
        if (newMappedItem !== undefined) {
            // CAUTION 注意，这里的增量计算语义是 map one interaction to one relation。所以不会有更新的情况，因为 Interaction 不会更新。
            //  如果有更复杂的 computed Relation 需求，应该用别的
            if (this.data instanceof Entity) {
                await this.controller.system.storage.create( this.data.name, newMappedItem)
            } else {
                await this.controller.system.storage.addRelationByNameById( this.data.name, newMappedItem.source.id, newMappedItem.target.id, newMappedItem)
            }
        }
    }
}

ComputedDataHandle.Handles.set(MapInteractionToRecord, MapInteractionToRecordHandle)