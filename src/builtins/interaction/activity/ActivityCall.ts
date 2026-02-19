import {
    ActivityGroup,
    ActivityGroupInstance as ActivityGroupInstanceType,
    ActivityInstance as ActivityInstanceType,
    Attributive,
    AttributiveInstance,
    Gateway,
    GatewayInstance as GatewayInstanceType,
    InteractionInstance as InteractionInstanceType,
    TransferInstance as TransferInstanceType
} from "@core";
import { assert } from "../../../runtime/util.js";
import { System } from "../../../runtime/System.js";
import { InteractionCall, InteractionCallResponse, EventUser, InteractionEventArgs } from "./InteractionCall.js";
import { MatchExp } from "@storage";
import { Controller } from "../../../runtime/Controller.js";


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
    content: InteractionInstanceType,
    parentGroup?: ActivityGroupNode
} & InteractionLikeNodeBase


export type ActivityGroupNode = {
    content: ActivityGroupInstanceType,
    parentGroup?: ActivityGroupNode
    childSeqs?: Seq[],
} & InteractionLikeNodeBase



export type GatewayNode = {
    uuid: string
    content: GatewayInstanceType,
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
        return (this.current!.children as ActivitySeqState[])?.find(child => child.findStateNode(uuid))?.current
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
        const stateNode = this.root.findStateNode(uuid)!
        stateNode.complete()
        return true
    }
    toJSON() {
        return this.root.toJSON()
    }
}



export class ActivityCall {
    static cache = new Map<ActivityInstanceType, ActivityCall>()
    static from = (activity: ActivityInstanceType, controller: Controller) => {
        let graph = ActivityCall.cache.get(activity)
        if (!graph) {
            graph = new ActivityCall(activity, controller)
            ActivityCall.cache.set(activity, graph)
        }
        return graph
    }
    graph:Seq
    uuidToNode = new Map<string, GraphNode>()
    uuidToInteractionCall = new Map<string, InteractionCall>()
    interactionCallByName = new Map<string, InteractionCall>()
    rawToNode = new Map<InteractionInstanceType|ActivityGroupInstanceType|GatewayInstanceType, GraphNode>()
    system: System
    constructor(public activity: ActivityInstanceType, public controller: Controller) {
        this.system = controller.system
        this.graph = this.buildGraph(activity)
    }
    buildGraph(activity: ActivityInstanceType, parentGroup?: ActivityGroupNode) : Seq {
        const rawGatewayToNode = new Map<GatewayInstanceType, GatewayNode>()
        const seq = {}

        for(let interaction of activity.interactions!) {
            const node: InteractionNode = { content: interaction, next: null, uuid: interaction.uuid, parentGroup, parentSeq: seq as Seq, }
            this.uuidToNode.set(interaction.uuid, node)
            this.rawToNode.set(interaction, node)
            const interactionCall = new InteractionCall(interaction, this.controller, this)
            this.uuidToInteractionCall.set(interaction.uuid, interactionCall)
            if (interaction.name!) {
                this.interactionCallByName.set(interaction.name, interactionCall)
            }
        }

        for(let gateway of activity.gateways!) {
            const node: GatewayNode = { content: gateway, next: [], prev: [], uuid: gateway.uuid }
            this.uuidToNode.set(gateway.uuid, node)
            this.rawToNode.set(gateway, node)
        }

        for(let group of activity.groups!) {
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

        const candidateStart = new Set<InteractionInstanceType|ActivityGroupInstanceType>([...Object.values(activity.interactions!), ...Object.values(activity.groups!)])
        const candidateEnd = new Set<InteractionInstanceType|ActivityGroupInstanceType>([...Object.values(activity.interactions!), ...Object.values(activity.groups!)])

        activity.transfers?.forEach((transfer:TransferInstanceType) => {
            const sourceNode = (this.rawToNode.get(transfer.source as InteractionInstanceType) || rawGatewayToNode.get(transfer.source as InteractionInstanceType))!
            const targetNode = (this.rawToNode.get(transfer.target as InteractionInstanceType) || rawGatewayToNode.get(transfer.target as GatewayInstanceType))!

            assert(!!sourceNode, `cannot find source ${(transfer.source as InteractionInstanceType).name!}`)
            assert(!!targetNode, `cannot find target ${(transfer.source as InteractionInstanceType).name!}`)
            if (Gateway.is(sourceNode)) {
                (sourceNode as GatewayNode).next.push(targetNode)
            } else {
                sourceNode.next = targetNode
            }

            if (Gateway.is(targetNode)) {
                (targetNode as GatewayNode).prev.push(sourceNode)
            } else {
                targetNode.prev = sourceNode
            }

            candidateEnd.delete(transfer.source as InteractionInstanceType)
            candidateStart.delete(transfer.target as InteractionInstanceType)
        })

        if (candidateStart.size !== 1 ) throw new Error(`start node must one, current: ${candidateStart.size}`)
        if (candidateEnd.size !== 1 ) throw new Error(`end node must be one, current: ${candidateEnd.size}`)

        Object.assign((seq as Seq), {
            head :  this.rawToNode.get([...candidateStart.values()][0]!) as InteractionNode|ActivityGroupNode,
            tail : this.rawToNode.get([...candidateEnd.values()][0]!)  as InteractionNode|ActivityGroupNode
        })

        return seq as Seq
    }
    async create() {
        const initialStateData = ActivityState.createInitialState(this.graph.head)

        const activity = await this.controller.activityManager.createActivity({
            name: this.activity.name,
            uuid: this.activity.uuid,
            state: initialStateData,
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
    async getState(activityId: string) {
        return (await this.getActivity(activityId))?.state
    }
    async getActivity(activityId: string) {
        const match = MatchExp.atom({
            key: 'id',
            value: ['=', activityId],
        })
        return (await this.controller.activityManager.getActivity(match))[0]
    }
    async setActivity(activityId: string, value: any) {
        const match = MatchExp.atom({
            key: 'id',
            value: ['=', activityId],
        })
        return await this.controller.activityManager.updateActivity(match, value)
    }
    async setState(activityId: string, state: any) {
        const match = MatchExp.atom({
            key: 'id',
            value: ['=', activityId],
        })
        return await this.controller.activityManager.updateActivity(match, {state: state})
    }
    isStartNode(uuid: string) {
        const node = this.uuidToNode.get(uuid) as InteractionLikeNodeBase
        return node.parentSeq.head === node
    }
    isEndNode(uuid: string) {
        const node = this.uuidToNode.get(uuid) as InteractionLikeNodeBase
        return node.parentSeq.tail === node
    }

    isActivityHead(interaction: InteractionInstanceType, head: InteractionLikeNodeBase = this.graph.head): boolean {
        if (ActivityGroup.is(this.graph.head.content)) {
            return !!(this.graph.head as ActivityGroupNode).childSeqs?.some(seq => this.isActivityHead(interaction, seq.head))
        } else {
            return interaction === this.graph.head.content
        }
    }

    async callInteraction(inputActivityId: string|undefined, uuid: string, interactionEventArgs: InteractionEventArgs) : Promise<InteractionCallResponse>{
        const interactionCall = this.uuidToInteractionCall.get(uuid)!

        let activityId = inputActivityId

        if (this.isActivityHead(interactionCall.interaction) ) {
            if ( !activityId){
                const error = await interactionCall.check(interactionEventArgs, inputActivityId, this.checkUserRef)
                if (error) return { error }

                activityId = (await this.create()).activityId
            }
        } else {
            if(!inputActivityId) return { error: 'activityId must be provided for non-head interaction of an activity'}
        }

        const state = new ActivityState(await this.getState(activityId!), this)
        if(!state.isInteractionAvailable(uuid)) return { error: `interaction ${uuid} not available`}

        const result = await interactionCall.call(interactionEventArgs, activityId!, this.checkUserRef)
        if (result.error) {
            return result
        }

        await this.saveUserRefs(activityId!, interactionCall, interactionEventArgs)

        const stateCompleteResult = state.completeInteraction(uuid)
        assert(stateCompleteResult, 'change activity state failed')
        const nextState = state.toJSON()
        await this.setActivity( activityId!, {'state':nextState})


        return {
            ...result,
            context: {
                activityId,
                nextState
            }
        }
    }
    async saveUserRefs(activityId: string, interactionCall: InteractionCall, interactionEventArgs: InteractionEventArgs) {
        const refs = (await this.getActivity(activityId))?.refs! || {}
        if (interactionCall.interaction.userRef?.name) {
            refs[interactionCall.interaction.userRef?.name] = interactionEventArgs.user.id
        }

        interactionCall.interaction.payload?.items!.forEach((payloadDef) => {
            if (Attributive.is(payloadDef.itemRef) && payloadDef.itemRef?.name && interactionEventArgs.payload![payloadDef.name!]) {
                const payloadItem = interactionEventArgs.payload![payloadDef.name!]
                if (payloadDef.isCollection) {
                    if(!refs[payloadDef.itemRef!.name!]) refs[payloadDef.itemRef!.name!] = []

                    refs[payloadDef.itemRef!.name!].push((payloadItem as {id: string}).id)
                } else {
                    refs[payloadDef.itemRef!.name!] = (payloadItem as {id: string}).id
                }
            }
        })

        await this.setActivity( activityId, {refs})
    }

    checkUserRef = async (attributive: AttributiveInstance, eventUser: EventUser, activityId: string): Promise<boolean> => {
        assert(attributive.isRef, 'attributive must be ref')
        const refs = (await this.getActivity(activityId))?.refs
        return refs[attributive.name!] === eventUser.id
    }
}


class AnyActivityStateNode extends InteractionState{
    onChange(childPrevUUID: string, childNextUUID? : string) {
        if (this.graph.isStartNode(childPrevUUID)) {
            if (childNextUUID) {
                return {
                    children: this.children!.filter(childSeq => childSeq.current?.node!.uuid === childNextUUID)
                }
            } else {
                this.complete()
            }
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
