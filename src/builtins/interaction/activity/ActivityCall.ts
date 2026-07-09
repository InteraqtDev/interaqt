import { ActivityGroup, ActivityGroupInstance, ActivityInstance, TransferInstance } from '../Activity.js';
import { Attributive, AttributiveInstance } from '../Attributive.js';
import { Gateway, GatewayInstance } from '../Gateway.js';
import { InteractionInstance, InteractionEventArgs, EventUser, runInteractionGuard } from '../Interaction.js';
import { assert } from "@runtime";
import { BoolExp } from "@core";


export type Seq = {
    head: InteractionNode|ActivityGroupNode,
    tail: InteractionNode|ActivityGroupNode
}

export type InteractionLikeNodeBase = {
    uuid: string
    next: GraphNode|null,
    prev?: GraphNode,
    parentSeq: Seq
}

export type InteractionNode = {
    content: InteractionInstance,
    parentGroup?: ActivityGroupNode
} & InteractionLikeNodeBase


export type ActivityGroupNode = {
    content: ActivityGroupInstance,
    parentGroup?: ActivityGroupNode
    childSeqs?: Seq[],
} & InteractionLikeNodeBase



export type GatewayNode = {
    uuid: string
    content: GatewayInstance,
    prev: GraphNode[],
    next: GraphNode[],
}

export type GraphNode = InteractionNode|ActivityGroupNode|GatewayNode


export type ActivitySeqStateData = {
    current?: InteractionStateData
}

export type InteractionStateData = {
    uuid: string,
    children?: ActivitySeqStateData[]
}


interface StorageAccess {
    system: {
        storage: {
            create(name: string, data: any): Promise<any>
            find(name: string, match?: any, modifier?: any, attributeQuery?: any): Promise<any[]>
            update(name: string, match: any, data: any): Promise<any>
            atomic: {
                compareAndSet(target: { recordName: string, id: string, field: string }, expected: unknown, next: unknown, options?: { defaultValue?: unknown }): Promise<boolean>
            }
        }
    }
    ignoreGuard: boolean
}


class ActivitySeqState {
    public static createInitialState(headNode: InteractionLikeNodeBase) :ActivitySeqStateData {
        return {
            current: InteractionState.createInitialState(headNode)
        }
    }
    public current?: InteractionState
    public static create(data:ActivitySeqStateData, graph: ActivityCall, parent?: InteractionState) {
        const seqState = new ActivitySeqState(graph, parent)
        if (data.current) seqState.current = InteractionState.create(data.current, graph, seqState)
        return seqState
    }

    constructor(public graph: ActivityCall, public parent?: InteractionState) {}
    isInteractionAvailable(uuid: string) : boolean{
        if (!this.current) return false
        if (this.current?.children) {
            return Object.values(this.current.children).some(child => child.isInteractionAvailable(uuid))
        } else {
            return this.current.node!.uuid === uuid
        }
    }
    findStateNode(uuid:string) : InteractionState|undefined{
        if (!this.current) return undefined

        if (this.current?.node!.uuid === uuid) return this.current!
        // CAUTION 必须返回子树中命中的节点本身，而不是子序列的 current：
        //  嵌套 group 时命中的节点可能在更深层，`.current` 会拿到错误的节点。
        for (const child of (this.current!.children as ActivitySeqState[]) || []) {
            const found = child.findStateNode(uuid)
            if (found) return found
        }
        return undefined
    }
    transferToNext(uuid: string) {
        const node = this.graph.getNodeByUUID(uuid) as InteractionLikeNodeBase
        delete this.current
        if (node.next) {
            const nextState = InteractionState.createInitialState(node.next as InteractionLikeNodeBase)
            this.current = InteractionState.create(nextState, this.graph, this)
        }

        this.parent?.onChange(uuid, node.next?.uuid)
    }
    toJSON() {
        return {
            current: this.current?.toJSON()
        }
    }
}



class InteractionState {
    public static GroupStateNodeType = new Map<string, typeof InteractionState>()
    public isGroup?: boolean

    public children?: ActivitySeqState[]
    public static createInitialState(node: InteractionLikeNodeBase) {
        const state : InteractionStateData = {uuid: node.uuid}
        if (ActivityGroup.is((node as ActivityGroupNode).content)) {
            state.children = (node as ActivityGroupNode).childSeqs!.map(seqNode =>  ActivitySeqState.createInitialState(seqNode.head))
        }
        return state
    }
    public static create(data:InteractionStateData, graph: ActivityCall, parent?: ActivitySeqState) {
        const node = graph.getNodeByUUID(data.uuid)! as ActivityGroupNode
        const isGroup = ActivityGroup.is((node as ActivityGroupNode).content)

        if (isGroup) {
            const GroupStateNode = InteractionState.GroupStateNodeType.get(node!.content.type!)!
            // buildGraph 已在定义期校验 group type，这里理论上不会缺失。
            assert(!!GroupStateNode, `unknown ActivityGroup type "${node!.content.type}"`)
            const groupState = new GroupStateNode(node!, graph, parent)

            groupState.isGroup = true
            groupState.children = data?.children?.map((v) => {
                return ActivitySeqState.create(v, graph, groupState)
            })
            return groupState
        } else {
            return new InteractionState(node!, graph, parent)
        }
    }
    constructor(public node:InteractionLikeNodeBase|null, public graph: ActivityCall, public parent?: ActivitySeqState) {}
    toJSON(): any {
        return {
            uuid: this.node!.uuid,
            children: this.children?.map((child) => child.toJSON())
        }
    }
    onChange(childPrevUUID: string, childNextUUID?: string) {}
    isGroupCompleted() {
        return this.children?.every((childSeq) => !childSeq.current)
    }
    complete() {
        this.parent!.transferToNext(this.node!.uuid)
    }

}


class ActivityState{
    public root: ActivitySeqState
    public static createInitialState(headNode: InteractionLikeNodeBase) {
        return ActivitySeqState.createInitialState(headNode)
    }
    constructor(data: ActivitySeqStateData, public graph: ActivityCall) {
        this.root = ActivitySeqState.create(data, this.graph)
    }
    isInteractionAvailable(uuid:string) {
        return this.root.isInteractionAvailable(uuid)
    }
    completeInteraction(uuid: string) {
        const stateNode = this.root.findStateNode(uuid)
        if (!stateNode) {
            throw new Error(`interaction ${uuid} is not available in the current activity state; it may have been completed by a concurrent dispatch`)
        }
        stateNode.complete()
        return true
    }
    toJSON() {
        return this.root.toJSON()
    }
}



export class ActivityCall {
    graph:Seq
    uuidToNode = new Map<string, GraphNode>()
    rawToNode = new Map<InteractionInstance|ActivityGroupInstance|GatewayInstance, GraphNode>()
    constructor(public activity: ActivityInstance) {
        this.graph = this.buildGraph(activity)
    }
    buildGraph(activity: ActivityInstance, parentGroup?: ActivityGroupNode) : Seq {
        // CAUTION Gateway control flow (fork/join/conditional branching) is not implemented
        //  by the activity runtime: the state machine tracks a single `current` node per
        //  sequence, and Gateway definitions carry no branching conditions. Building a graph
        //  through a Gateway would silently produce a broken state machine (the activity
        //  gets stuck on a node that can never be dispatched), so reject the definition
        //  explicitly. Use ActivityGroup (type 'any' / 'every' / 'race') to model branches.
        if (activity.gateways?.length || activity.transfers?.some(t => Gateway.is(t.source) || Gateway.is(t.target))) {
            throw new Error(`Activity "${activity.name}" uses Gateway nodes, which are not supported by the activity runtime. Model branching with ActivityGroup (type 'any'/'every'/'race') instead.`)
        }

        const seq = {}

        for(let interaction of activity.interactions!) {
            const node: InteractionNode = { content: interaction, next: null, uuid: interaction.uuid, parentGroup, parentSeq: seq as Seq, }
            this.uuidToNode.set(interaction.uuid, node)
            this.rawToNode.set(interaction, node)
        }

        for(let group of activity.groups!) {
            // fail-fast: an unknown group type would otherwise crash at dispatch time
            // with `new undefined()` deep inside the state machine.
            if (!InteractionState.GroupStateNodeType.has(group.type!)) {
                const supported = Array.from(InteractionState.GroupStateNodeType.keys()).map(t => `'${t}'`).join(', ')
                throw new Error(`ActivityGroup type "${group.type}" in activity "${activity.name}" is not supported. Supported types: ${supported}.`)
            }
            const node: ActivityGroupNode = {
                uuid: group.uuid,
                content: group,
                next: null,
                parentSeq: seq as Seq,
                parentGroup
            }
            node.childSeqs = group.activities?.map(sub => this.buildGraph(sub, node))
            this.uuidToNode.set(group.uuid, node)
            this.rawToNode.set(group, node)
        }

        const candidateStart = new Set<InteractionInstance|ActivityGroupInstance>([...Object.values(activity.interactions!), ...Object.values(activity.groups!)])
        const candidateEnd = new Set<InteractionInstance|ActivityGroupInstance>([...Object.values(activity.interactions!), ...Object.values(activity.groups!)])

        activity.transfers?.forEach((transfer:TransferInstance) => {
            const sourceNode = this.rawToNode.get(transfer.source as InteractionInstance)! as InteractionNode|ActivityGroupNode
            const targetNode = this.rawToNode.get(transfer.target as InteractionInstance)! as InteractionNode|ActivityGroupNode

            assert(!!sourceNode, `cannot find source ${(transfer.source as InteractionInstance).name!}`)
            assert(!!targetNode, `cannot find target ${(transfer.target as InteractionInstance).name!}`)
            sourceNode.next = targetNode
            targetNode.prev = sourceNode

            candidateEnd.delete(transfer.source as InteractionInstance)
            candidateStart.delete(transfer.target as InteractionInstance)
        })

        if (candidateStart.size !== 1 ) throw new Error(`start node must one, current: ${candidateStart.size}`)
        if (candidateEnd.size !== 1 ) throw new Error(`end node must be one, current: ${candidateEnd.size}`)

        Object.assign((seq as Seq), {
            head :  this.rawToNode.get([...candidateStart.values()][0]!) as InteractionNode|ActivityGroupNode,
            tail : this.rawToNode.get([...candidateEnd.values()][0]!)  as InteractionNode|ActivityGroupNode
        })

        return seq as Seq
    }
    private static ACTIVITY_RECORD = '_Activity_'

    async create(storage: StorageAccess) {
        const initialStateData = ActivityState.createInitialState(this.graph.head)

        const activity = await storage.system.storage.create(ActivityCall.ACTIVITY_RECORD, {
            name: this.activity.name,
            uuid: this.activity.uuid,
            state: initialStateData,
            stateVersion: 0,
            refs: {},
        })
        return {
            activityId: activity.id,
            state: initialStateData
        }
    }
    getNodeByUUID(uuid: string) {
        return this.uuidToNode.get(uuid)
    }
    async getState(storage: StorageAccess, activityId: string) {
        return (await this.getActivity(storage, activityId))?.state
    }
    async getActivity(storage: StorageAccess, activityId: string) {
        // CAUTION builtins 不允许直接依赖 @storage（分层：builtins → runtime → storage → core）。
        //  storage 的 MatchExpressionData 就是 BoolExp<MatchAtom>，直接用 @core 的 BoolExp 构造。
        const match = BoolExp.atom({
            key: 'id',
            value: ['=', activityId],
        })
        const results = await storage.system.storage.find(ActivityCall.ACTIVITY_RECORD, match, undefined, ['*'])
        return results.map((a: any) => ({ ...a, state: a.state, refs: a.refs }))[0]
    }
    async setActivity(storage: StorageAccess, activityId: string, value: any) {
        const match = BoolExp.atom({
            key: 'id',
            value: ['=', activityId],
        })
        const data = { ...value }
        delete data.state
        delete data.refs
        if (value.state) data.state = value.state
        if (value.refs) data.refs = value.refs
        return await storage.system.storage.update(ActivityCall.ACTIVITY_RECORD, match, data)
    }
    async setState(storage: StorageAccess, activityId: string, state: any) {
        return this.setActivity(storage, activityId, { state })
    }
    isStartNode(uuid: string) {
        const node = this.uuidToNode.get(uuid) as InteractionLikeNodeBase
        return node.parentSeq.head === node
    }
    isEndNode(uuid: string) {
        const node = this.uuidToNode.get(uuid) as InteractionLikeNodeBase
        return node.parentSeq.tail === node
    }

    isActivityHead(interaction: InteractionInstance, head: InteractionLikeNodeBase = this.graph.head): boolean {
        // CAUTION 必须使用参数 head（递归时传入的是子序列的 head），
        //  误用 this.graph.head 会在「group 作为流程起点」时无限递归（构造期栈溢出）。
        const headNode = head as InteractionNode | ActivityGroupNode
        if (ActivityGroup.is(headNode.content)) {
            return !!(headNode as ActivityGroupNode).childSeqs?.some(seq => this.isActivityHead(interaction, seq.head))
        } else {
            return interaction === headNode.content
        }
    }

    async checkActivityState(storage: StorageAccess, activityId: string, interactionUuid: string) {
        // fail-closed：activityId 是 API 边界输入，查不到记录必须给出业务级错误，
        //  否则 new ActivityState(undefined) 会在深处抛 "Cannot read properties of undefined" 的裸 TypeError。
        const stateData = await this.getState(storage, activityId)
        if (!stateData) {
            throw new Error(`activity ${activityId} not found for activity "${this.activity.name}"`)
        }
        const state = new ActivityState(stateData, this)
        if (!state.isInteractionAvailable(interactionUuid)) {
            throw new Error(`interaction ${interactionUuid} not available`)
        }
    }

    // 与独立 interaction 的 guard 共用同一个 runner（runInteractionGuard），
    // 仅额外提供 activity refs 的 isRef 解析。
    async fullGuardWithUserRef(controller: StorageAccess, interaction: InteractionInstance, args: InteractionEventArgs) {
        await runInteractionGuard(controller, interaction, args, {
            checkUserRef: (attributive: AttributiveInstance) => this.checkUserRef(controller, attributive, args.user, args.activityId!)
        })
    }

    async completeInteractionState(storage: StorageAccess, activityId: string, interactionUuid: string) {
        const activity = await this.getActivity(storage, activityId)
        if (!activity) {
            throw new Error(`activity ${activityId} not found for activity "${this.activity.name}"`)
        }
        const state = new ActivityState(activity.state, this)
        state.completeInteraction(interactionUuid)
        const nextState = state.toJSON()

        // CAUTION optimistic concurrency control: state advancement is a read-modify-write.
        //  storage.update(match) is find-then-update-by-id and therefore NOT an atomic
        //  compare-and-set under READ COMMITTED (both concurrent transactions can pass the
        //  non-locking find). Use the atomic CAS primitive (single conditional UPDATE, whose
        //  WHERE clause is re-evaluated after lock waits) to advance the version; a loser
        //  gets zero rows and aborts this transaction — including its saveUserRefs write —
        //  instead of silently losing an update.
        const currentVersion = activity.stateVersion ?? 0
        const won = await storage.system.storage.atomic.compareAndSet(
            { recordName: ActivityCall.ACTIVITY_RECORD, id: activityId, field: 'stateVersion' },
            currentVersion,
            currentVersion + 1,
            { defaultValue: 0 }
        )
        if (!won) {
            throw new Error(`activity ${activityId} state was modified concurrently while completing interaction ${interactionUuid}; the dispatch has been aborted and can be retried`)
        }
        await this.setActivity(storage, activityId, { state: nextState })
    }

    async saveUserRefs(storage: StorageAccess, activityId: string, interaction: InteractionInstance, interactionEventArgs: InteractionEventArgs) {
        const refs = (await this.getActivity(storage, activityId))?.refs! || {}
        if (interaction.userRef?.name) {
            refs[interaction.userRef?.name] = interactionEventArgs.user.id
        }

        interaction.payload?.items!.forEach((payloadDef) => {
            if (Attributive.is(payloadDef.itemRef) && payloadDef.itemRef?.name && interactionEventArgs.payload![payloadDef.name!]) {
                const payloadItem = interactionEventArgs.payload![payloadDef.name!]
                if (payloadDef.isCollection) {
                    // collection payload 是数组，必须逐项取 id，否则 refs 里存的是 undefined
                    if(!refs[payloadDef.itemRef!.name!]) refs[payloadDef.itemRef!.name!] = []

                    refs[payloadDef.itemRef!.name!].push(...(payloadItem as {id: string}[]).map(item => item.id))
                } else {
                    refs[payloadDef.itemRef!.name!] = (payloadItem as {id: string}).id
                }
            }
        })

        await this.setActivity(storage, activityId, {refs})
    }

    checkUserRef = async (storage: StorageAccess, attributive: AttributiveInstance, eventUser: EventUser, activityId: string): Promise<boolean> => {
        assert(attributive.isRef, 'attributive must be ref')
        const refs = (await this.getActivity(storage, activityId))?.refs
        const ref = refs?.[attributive.name!]
        // collection itemRef 保存的是 id 数组：按成员资格判断
        if (Array.isArray(ref)) {
            return ref.includes(eventUser.id)
        }
        return ref === eventUser.id
    }
}


class AnyActivityStateNode extends InteractionState{
    onChange(childPrevUUID: string, childNextUUID? : string) {
        if (this.graph.isStartNode(childPrevUUID)) {
            if (childNextUUID) {
                // 'any' is an exclusive choice: once one branch advances past its head,
                // the sibling branches must be pruned so they can no longer be dispatched.
                this.children = this.children!.filter(childSeq => childSeq.current?.node!.uuid === childNextUUID)
            } else {
                // single-step branch completed: the whole group completes immediately
                this.complete()
                return
            }
        }
        // multi-step branch: after pruning, the group completes when the surviving
        // branch runs to its end.
        if (this.isGroupCompleted()) {
            this.complete()
        }
    }
}

InteractionState.GroupStateNodeType.set('any', AnyActivityStateNode)



class EveryActivityStateNode extends InteractionState{
    onChange(childPrevUUID: string, childNextUUID? : string) {
        if (this.isGroupCompleted()) {
            this.complete()
        }
    }
}
InteractionState.GroupStateNodeType.set('every', EveryActivityStateNode)




class RaceActivityStateNode extends InteractionState{
    onChange(childPrevUUID: string, childNextUUID? : string)  {
        if (this.graph.isEndNode(childPrevUUID)) {
            this.complete()
        }
    }
}
InteractionState.GroupStateNodeType.set('race', RaceActivityStateNode)


class ProgrammaticActivityStateNode extends InteractionState{
}
InteractionState.GroupStateNodeType.set('program', ProgrammaticActivityStateNode)
