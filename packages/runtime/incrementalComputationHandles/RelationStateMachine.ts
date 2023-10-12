import {KlassInstanceOf, KlassType} from "../../shared/createClass";
import {Entity, Relation} from "../../shared/entity/Entity";
import {RelationIncrementalComputationHandle} from "./IncrementalComputationHandle";
import {MapActivityToEntity, RelationStateMachine, RelationStateTransfer} from '../../shared/IncrementalComputation'
import {Controller} from "../Controller";
import {InteractionEventArgs} from "../../types/interaction";
import {assert} from "../util";
import { EntityIdRef} from '../System'
import { MatchExp } from '../../storage/erstorage/MatchExp'


type SourceTargetPair = [EntityIdRef, EntityIdRef][]
type ComputeSourceResult = SourceTargetPair | {source: EntityIdRef[] | EntityIdRef, target: EntityIdRef[]|EntityIdRef} | undefined
type TransferHandleFn = (this: Controller,interactionEventArgs: InteractionEventArgs, activityId?:string ) =>  Promise<ComputeSourceResult>

export class RelationStateMachineHandle extends RelationIncrementalComputationHandle {
    computedData: KlassInstanceOf<typeof RelationStateMachine, false>
    transferHandleFn: Map<KlassInstanceOf<typeof RelationStateTransfer, false>, TransferHandleFn> = new Map()

    constructor(public controller: Controller, public data: KlassInstanceOf<typeof Relation, false>) {
        super(controller, data);
        this.computedData = data.computedData as KlassInstanceOf<typeof RelationStateMachine, false>

        this.parseTransferHandle()
        this.listenInteractions()
        this.validateState()
    }
    validateState() {
        // FIXME 理论上在一个状态机中，任何状态都应该是能用属性完全独立区别开的。最好在这里验证一下。
    }
    parseTransferHandle() {
        this.computedData.transfers.forEach(transfer => {
            const parsedHandle = new Function('arg', 'activityId', `return (${transfer.handle}).call(this, arg, activityId)`) as TransferHandleFn
            this.transferHandleFn.set(transfer, parsedHandle)
        })
    }
    listenInteractions() {
        // 遍历 transfer 来监听 interaction
        this.computedData.transfers.forEach(transfer => {
            this.controller.listen(transfer.triggerInteraction, (...arg) => {
                return this.onCallInteraction(transfer, ...arg)
            })
        })
    }
    getSourceTargetPairs(handleFnResult: ComputeSourceResult): SourceTargetPair {
        if (!handleFnResult) return []

        if (Array.isArray(handleFnResult)) {
            return handleFnResult as SourceTargetPair
        }

        assert(!!handleFnResult.source && !!handleFnResult.target, `source and target must not be undefined ${handleFnResult.source}, ${handleFnResult.target}`)

        if (!Array.isArray(handleFnResult.source) && !Array.isArray(handleFnResult.target)) {
            return [[handleFnResult.source, handleFnResult.target]]
        }

        if (Array.isArray(handleFnResult.source)) {
            return handleFnResult.source.map(oneSource => ([oneSource, handleFnResult.target])) as SourceTargetPair
        }

        if (Array.isArray(handleFnResult.target)) {
            return handleFnResult.target.map(oneTarget => ([handleFnResult.source, oneTarget ])) as SourceTargetPair
        }

        return []

    }
    onCallInteraction = async (transfer: KlassInstanceOf<typeof RelationStateTransfer, false>, interactionEventArgs: InteractionEventArgs, activityId?: string) => {
        // CAUTION 不能房子啊 constructor 里面因为它实在 controller 里面调用的，controller 还没准备好。
        const relationName = this.controller.system.storage.getRelationName(this.data.entity1.name, this.data.targetName1)
        const handleFn = this.transferHandleFn.get(transfer)!
        if (transfer.handleType === 'computeSource') {
            // 1. 执行 handle 来计算  source 和 target
            const sourceAndTargetPairs = this.getSourceTargetPairs(await handleFn.call(this.controller, interactionEventArgs, activityId))
            // TODO 继续过滤掉 符合当前 relation 状态的 pair 。
            for(let sourceAndTargetPair of sourceAndTargetPairs) {

                const [sourceRef, targetRef] = sourceAndTargetPair
                const currentState = transfer.fromState
                const nextState = transfer.toState

                const baseRelationMatch =  MatchExp.atom({
                    key: 'source.id',
                    value: ['=', sourceRef.id]
                }).and({
                    key: 'target.id',
                    value: ['=', targetRef.id]
                })

                // 如果当前状态是有的情况，那么要准确的判断是不是和 currentState 完全 match，这里要用 fixedProperties 来 match.
                if (currentState.hasRelation) {
                    let relationMatch = baseRelationMatch

                    currentState.fixedProperties?.forEach(fixedProperty => {
                        relationMatch = relationMatch.and({
                            key: fixedProperty.name,
                            value: ['=', fixedProperty.value]
                        })
                    })

                    const matchedRelation = await this.controller.system.storage.findOneRelationByName(relationName, relationMatch)
                    if (matchedRelation) {
                        const matchExp = {
                            key: 'id',
                            value: ['=', matchedRelation.id]
                        } as MatchAtom

                        if(!nextState.hasRelation) {
                            // 转移成删除

                            await this.controller.system.storage.removeRelationByName(relationName, MatchExp.atom(matchExp))
                        } else {
                            // TODO 除了 fixedProperties 还有 propertyHandle 来计算 动态的 property
                            const nextAttributes = Object.fromEntries(nextState.fixedProperties.map(p => ([p.name, p.value])))
                            await this.controller.system.storage.updateRelationByName(relationName, MatchExp.atom(matchExp), nextAttributes)
                        }
                    }

                } else {
                    // 这是 currentState 是没有的状态。应该没有关系才算匹配
                    const matchedRelation = await this.controller.system.storage.findOneRelationByName(relationName, baseRelationMatch)
                    if (!matchedRelation) {
                        // 没有数据才说明匹配
                        // 转移 变成有
                        const nextAttributes = Object.fromEntries(nextState.fixedProperties.map(p => ([p.name, p.value])))
                        await this.controller.system.storage.addRelationByNameById(relationName, sourceRef.id, targetRef.id, nextAttributes)
                    } else {
                    }


                }
            }

        } else {
            assert(false, 'not implemented yet')
        }
    }
}
RelationIncrementalComputationHandle.Handles.set(RelationStateMachine, RelationStateMachineHandle)