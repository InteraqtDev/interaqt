
# 自定义 computed data

## ComputedDataHandle
所有的 computed data 都是通过 ComputedDataHandle 来实现的。你可以通过继承 ComputedDataHandle 来实现自己的 computed data。
它可以用在 Entity/Relation/State/Property 的 computedData 字段上。
ComputedDataHandle 中的 addEventListener 方法中监听系统中任何 Record 的数据变化，并调用子类中的 computeEffect
来计算是否有要更新的数据。如果有，就会调用子类中的 userFullCompute 方法来计算要更新的数据。


示例：前面的 Every 类型的 computed data 就是通过继承 ComputedDataHandle 来实现的：
```typescript
export class EveryHandle extends ComputedDataHandle {
    matchCountField: string = `${this.propertyName}_match_count`
    totalCountField: string= `${this.propertyName}_total_count`
    setupSchema() {
        const computedData = this.computedData as KlassInstance<typeof Every, false>
        const matchCountField = `${this.stateName}_match_count`
        const totalCountField = `${this.stateName}_total_count`
        // 新增两个 count，用来记录满足条件的数量和总数量，这样就可以判断是否是 Every 了
        const matchCountState = State.create({
            name: matchCountField,
            type: 'number',
            collection: false,
            computedData: Count.create({
                record: computedData.record,
                matchExpression: computedData.matchExpression
            })
        })
        this.controller.states.push(matchCountState)
        this.controller.addComputedDataHandle(matchCountState.computedData!, undefined, matchCountField)

        const totalCountState = State.create({
            name: totalCountField,
            type: 'number',
            collection: false,
            computedData: Count.create({
                record: computedData.record,
                matchExpression: ()=>true
            })
        })
        this.controller.states.push(totalCountState)
        this.controller.addComputedDataHandle(totalCountState.computedData!, undefined, totalCountField)
    }
    parseComputedData(){
        this.matchCountField = `${this.stateName}_match_count`
        this.totalCountField = `${this.stateName}_total_count`
        this.userComputeEffect = this.computeEffect
        this.userFullCompute = this.isMatchCountEqualTotalCount
    }

    getDefaultValue() {
        return true
    }

    computeEffect(mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): any {
        if (
            mutationEvent.recordName === SYSTEM_RECORD
            && mutationEvent.type === 'update'
            && mutationEvent.record!.concept === 'state'
            && mutationEvent.record!.key === this.totalCountField || mutationEvent.record!.key ===this.matchCountField
        ) {
            return true
        }
    }

    async isMatchCountEqualTotalCount(effect: string) {
        const matchCountFieldCount = await this.controller.system.storage.get('state',this.matchCountField)
        const totalCountFieldCount = await this.controller.system.storage.get('state',this.totalCountField)
        return matchCountFieldCount === totalCountFieldCount
    }
}
```


## IncrementalComputedDataHandle
IncrementalComputedDataHandle 是 ComputedDataHandle 的子类，它提供了一些增量计算的工具来帮助你实现 computed data。
我们可以通过继承 IncrementalComputedDataHandle 来实现自己的 computed data。
例如 MapInteractionHandle 就是通过继承它来实现的：

```typescript
type StatePatch = {
    type: 'create' | 'update' | 'delete',
    value: any,
    affectedId?: string
}

export class MapInteractionHandle extends IncrementalComputedDataHandle {
    data!: KlassInstance<typeof Entity, false>
    mapItem!: (mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[], lastValue: any) => any
    computeTarget?: (mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[], lastValue: any) => any
    constructor(controller: Controller , computedData: KlassInstance<typeof ComputedData, false> , dataContext:  DataContext) {
        super(controller, computedData, dataContext);
    }
    parseComputedData() {
        const computedData = this.computedData as unknown as  KlassInstance<typeof MapRecordMutation, false>
        this.data = this.dataContext.id as KlassInstance<typeof Entity, false>
        this.mapItem = (computedData.handle! as (mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]) => any ).bind(this.controller)
        this.computeTarget = computedData.computeTarget?.bind(this.controller)
    }
    computeEffect(mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): any {
        return true
    }

    async computePatch(effect: any, lastValue: any, mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): Promise<StatePatch | StatePatch[] | undefined> {
        const newValue = await this.mapItem.call(this.controller, mutationEvent, mutationEvents, lastValue)
        if (this.computedDataType === 'global') {
            return {
                type: 'update',
                value: newValue
            }
        } else if(this.computedDataType === 'property'){
            const affected = await this.computeTarget!.call(this.controller, mutationEvent, mutationEvents, lastValue)
            if (affected?.id) {
                return {
                    type: 'update',
                    value: newValue,
                    affectedId: affected.id
                }
            }

        } else if (this.computedDataType === 'entity' || this.computedDataType === 'relation') {
            if (newValue) {
                return {
                    type: newValue.id? 'update':'create',
                    value: newValue,
                    affectedId: newValue.id
                } as StatePatch
            }

        }
    }
}
```

用户在 mapItem 中可以拿到上一次的值进行增量计算。只要在继承的 computePatch 中返回 StatePatch 类型的 result，数据就会被自动更新或者创建。
