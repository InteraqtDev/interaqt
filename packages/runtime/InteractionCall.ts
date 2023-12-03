import {EntityAttributive, EntityAttributives, GetAction, InteractionInstanceType} from "@interaqt/shared";
import {UserAttributive} from "@interaqt/shared";
import {System} from "./System.js";
import {InteractionEvent, InteractionEventArgs} from "./types/interaction";
import {Concept, ConceptAlias, ConceptInstance, DerivedConcept,} from "@interaqt/shared";
import {BoolExp, BoolExpressionRawData} from "@interaqt/shared";
import {assert, everyWithErrorAsync} from "./util.js";
import {Klass, KlassInstance} from "@interaqt/shared";
import {ActivityCall} from "./ActivityCall.js";
import {someAsync} from "@interaqt/storage";
import {Entity} from "@interaqt/shared";
import {Controller} from "./Controller";

type ConceptCheckStack = {
    type: string,
    values: {
        [k: string]: any
    }
}



export type ConceptCheckResponse = AtomError |true

type AtomError = {
    name: string,
    type: string,
    stack?: ConceptCheckStack[],
    content?: string,
    error?: any
}


export class AttributeError {
    constructor(public type: string, public error: any) {
    }
}

export type InteractionCallResponse= {
    error?: any,
    data?: any,
    event?: InteractionEvent
    sideEffects?: {
        [k: string]: any
    }
}


type UserAttributiveAtom = KlassInstance<typeof UserAttributive, false>
/// FIXME EntityAttributiveAtom 没有 isRole 字段
type EntityAttributiveAtom =  UserAttributiveAtom

type HandleAttributive = (attributive: KlassInstance<typeof UserAttributive, false>) => Promise<boolean>

type Attributive = {
    content: (...args: any[]) => any
    name: string
}

export class InteractionCall {
    system: System
    constructor(public interaction: InteractionInstanceType, public controller: Controller, public activitySeqCall?: ActivityCall) {
        this.system = controller.system
    }
    async checkAttributive(inputAttributive: any, interactionEvent: InteractionEventArgs|undefined, attributiveTarget: any) {
        const  attributive = inputAttributive as unknown as Attributive
        assert(attributive, `can not find attributive: ${attributive.name}`)
        if (attributive.content) {
            // CAUTION! 第一参数应该是 User 它描述的 User（其实就是 event.user） 然后才是 event! this 指向当前，用户可以用 this.system 里面的东西来做任何查询操作
            // const testFn = new Function('attributiveTarget', 'event', `return (${attributive.content}).call(this, attributiveTarget, event)`)
            const testFn = attributive.content
            let result
            try {
                result = await testFn.call(this.controller, attributiveTarget, interactionEvent)
            } catch(e) {
                console.warn(`check function throw`, e)
                result = false
            }


            if ( result === undefined ) {
                console.warn(`attributive ${attributive.name} returned undefined, maybe not implemented, we will return true for temp`)
                return true
            }
            return result
        }
        console.warn(`${attributive.name} not implemented`)
        return true
    }
    async checkMixedAttributive(attributiveData: KlassInstance<typeof UserAttributive, false>, instance: ConceptInstance) {
        // const attributiveByName = indexBy((UserAttributive.instances as any[]).concat(Entity.instances), 'name')
        return Promise.resolve(true)
    }
    createHandleAttributive(AttributiveClass: typeof UserAttributive| typeof EntityAttributive, interactionEvent: InteractionEventArgs, target: any) {
        return (attributive: KlassInstance<typeof UserAttributive, false>) => {
            return this.checkAttributive(attributive, interactionEvent, target)
        }
    }
    async checkUser(interactionEvent: InteractionEventArgs) {
        let res: ConceptCheckResponse|true
        if (this.interaction.userRoleAttributive!.isRef) {
            // CAUTION 这里让 activity 自己在外部 check
            res = true
        } else {

            let userAttributiveCombined = BoolExp.atom<KlassInstance<typeof UserAttributive, false>>(
                this.interaction.userRoleAttributive!
            )

            if (this.interaction.userAttributives!.content) {
                userAttributiveCombined = userAttributiveCombined.and(this.interaction.userAttributives!.content)
            }

            const checkHandle = (attributive: KlassInstance<typeof UserAttributive, false>) => {
                return this.checkAttributive(attributive, interactionEvent, interactionEvent.user)
            }
            res =  await this.checkAttributives(userAttributiveCombined, checkHandle, [])
        }

        if (res === true) return res

        throw new AttributeError('check user failed', res)
    }
    // 用来check attributive 形容的后面的  target 到底是不是那个概念的实例。
    async checkConcept(instance: ConceptInstance, concept: Concept, attributives?: BoolExpressionRawData<KlassInstance<typeof UserAttributive, false>>, stack: ConceptCheckStack[] = []): Promise<ConceptCheckResponse> {
        const currentStack = stack.concat({type: 'concept', values: {attributives, concept}})

        const conceptRes = await this.isConcept(instance, concept, currentStack)
        if (conceptRes !== true) return conceptRes

        if (attributives) {
            const handleAttributives = (attributive: KlassInstance<typeof UserAttributive, false>) => this.checkMixedAttributive(attributive, instance)
            const attrMatchRes = await this.checkAttributives(new BoolExp<KlassInstance<typeof UserAttributive, false>>(attributives), handleAttributives , currentStack)
            if (attrMatchRes !== true) return attrMatchRes
        }

        return true
    }
    async isConcept(instance: ConceptInstance, concept: Concept, stack: ConceptCheckStack[] = []): Promise<ConceptCheckResponse> {
        const currentStack = stack.concat({type: 'isConcept', values: {concept}})

        if (this.isDerivedConcept(concept)) {
            return this.checkConcept(instance, (concept as DerivedConcept).base!, (concept as DerivedConcept).attributive!, currentStack)
        }

        if (this.isConceptAlias(concept)) {
            const errors: AtomError[] = []

            const somePassed = await someAsync((concept as ConceptAlias).for, async (concept: Concept) => {
                const checkRes = await this.isConcept(instance, concept)
                if (checkRes === true) {
                    return true
                } else {
                    errors.push(checkRes as AtomError)
                    return false
                }
            })

            if (somePassed) {
                return true
            } else {
                return {name: concept.name, type: 'conceptAlias', stack: currentStack, error: errors}
            }
        } else {
            // CAUTION 这里的 concept 是 Role/Entity 的实例. 例如 UserRole/AdminRole，实体例如 Post/Profile
            if (UserAttributive.is(concept)) {
                // Role
                return (await this.checkAttributive(concept, undefined, instance)) ? true : {name: concept.name, type: 'conceptCheck', stack: currentStack, error: 'role check error'}
            }

            // Entity 或者其他具备 check 能力的
            const constructorCheck = (concept.constructor as Klass<any>)?.check
            if (constructorCheck) {
                return constructorCheck(instance) ? true : {name: concept.name, type: 'conceptCheck', stack: currentStack, error: 'constructor check error'}
            }

            // instanceCheck
            if (typeof concept === 'function') {
                return instance instanceof concept ? true : {name: concept.name, type: 'conceptCheck', stack: currentStack, error: 'instanceof check error'}
            }

            console.warn(`unknown concept ${concept}, cannot check ${instance}. pass.`)
            return true
        }
    }
    isDerivedConcept(concept: Concept) {
        return !!(concept as DerivedConcept).base
    }
    isConceptAlias(concept: Concept) {
        return !!(concept as ConceptAlias).for
    }
    async checkAttributives(attributives: BoolExp<KlassInstance<typeof UserAttributive, false>>, handleAttributive: HandleAttributive, stack: ConceptCheckStack[] = []) : Promise<ConceptCheckResponse>{
        const result =  await attributives.evaluateAsync(handleAttributive)
        return result === true ? true : {name: '', type: 'matchAttributives', stack, error: result}
    }
    async checkPayload(interactionEvent: InteractionEventArgs) {
        const payloadDefs = this.interaction.payload?.items || []
        for(let payloadDef of payloadDefs) {

            const payloadItem = interactionEvent.payload![payloadDef.name!]
            if (payloadDef.required && !payloadItem) {
                throw new AttributeError(`payload ${payloadDef.name} missing`, interactionEvent.payload)
            }

            if (!payloadItem) return


            if (payloadDef.isCollection && !Array.isArray(payloadItem)) {
                throw new AttributeError(`${payloadDef.name} data is not array`, payloadItem)
            }

            if (payloadDef.isCollection) {
                if (payloadDef.isRef && !(payloadItem as {id: string}[]).every(item => !!item.id)) {
                    throw new AttributeError(`${payloadDef.name} data not every is ref`, payloadItem)
                }
            } else {
                if (payloadDef.isRef && !payloadItem.id) {
                    throw new AttributeError(`${payloadDef.name} data is not a ref`, payloadItem)
                }
            }


            if (payloadDef.isCollection) {
                const result = await everyWithErrorAsync(payloadItem,(item => this.checkConcept(item, payloadDef.base as KlassInstance<typeof Entity, false>)))
                if (result! == true) {
                    throw new AttributeError(`${payloadDef.name} check concept failed`, result)
                }
            } else {
                const result = await this.checkConcept(payloadItem, payloadDef.base as KlassInstance<typeof Entity, false>)
                if (result !== true) {
                    throw new AttributeError(`${payloadDef.name} check concept failed`, result)
                }
            }

            const isPayloadUser = UserAttributive.is(payloadDef.base)


            if (payloadDef.attributives) {
                const rawAttributives = (payloadDef.attributives as KlassInstance<typeof EntityAttributives, false>).content
                const attributives = isPayloadUser ?
                    new BoolExp<UserAttributiveAtom>(rawAttributives  as BoolExpressionRawData<UserAttributiveAtom>):
                    new BoolExp<EntityAttributiveAtom>(rawAttributives as BoolExpressionRawData<EntityAttributiveAtom>)

                if (payloadDef.isCollection) {
                    const result = await everyWithErrorAsync(payloadItem, (item => {
                        const handleAttribute = this.createHandleAttributive(
                            isPayloadUser? UserAttributive : EntityAttributive,
                            interactionEvent,
                            item
                        )

                        return this.checkAttributives(attributives, handleAttribute)
                    }))

                    if (result !== true) {
                        throw new AttributeError(`${payloadDef.name} not every item match attribute`, payloadItem)
                    }
                } else {
                    const handleAttribute = this.createHandleAttributive(
                        isPayloadUser? UserAttributive : EntityAttributive,
                        interactionEvent,
                        payloadItem
                    )
                    const result = await this.checkAttributives(attributives, handleAttribute)
                    if (result !== true ) {
                        throw new AttributeError(`${payloadDef.name} not match attributive`, { payload: payloadItem, result})
                    }
                }
            }

        }
    }
    async checkCondition(interactionEvent: InteractionEventArgs) {
        // TODO
        // if (this.interaction.condition ) {
        //     tryEvaluate("interaction condition error", interaction.condition, ...commonArgs)
        // }
    }
    async runEffect() {

    }
    isGetInteraction() {
        return this.interaction.action === GetAction
    }
    async saveEvent(interactionEvent: InteractionEvent) {
        // 为 payload 里面的新数据保存起来
        return await this.system.saveEvent(interactionEvent)
    }
    async savePayload(payload: InteractionEventArgs["payload"]){
        const payloadDefs = this.interaction.payload?.items || []
        const savedPayload: InteractionEventArgs["payload"] = {}
        for(let payloadDef of payloadDefs) {
            const isPayloadUser = UserAttributive.is(payloadDef.base)
            if (!payloadDef.isRef && !isPayloadUser) {
                const payloadItem = payload![payloadDef.name!]
                if (payloadItem) {
                    const recordName = (payloadDef.base as KlassInstance<typeof Entity, false>).name
                    if (payloadDef.isCollection) {
                        savedPayload[payloadDef.name!] = await Promise.all((payloadItem as any[]).map(item => this.system.storage.create(recordName, item)))
                    } else {
                        savedPayload[payloadDef.name!] = await this.system.storage.create(recordName, payloadItem)
                    }
                }
            }
        }
        return savedPayload
    }
    async retrieveData(interactionEvent: InteractionEventArgs) {
        // TODO
        // return this.system.storage.get(interactionEvent.payload, interactionEvent.query)
    }
    async call(interactionEventArgs: InteractionEventArgs, activityId?: string): Promise<InteractionCallResponse> {
        const response: InteractionCallResponse = {
            sideEffects: {},
        }

        try {
            await this.checkCondition(interactionEventArgs)
            await this.checkUser(interactionEventArgs)
            await this.checkPayload(interactionEventArgs)
        } catch(e) {
            response.error = e
        }

        if (!response.error) {
            const savedPayload = await this.savePayload(interactionEventArgs.payload)
            const event = {
                interactionName: this.interaction.name,
                interactionId: this.interaction.uuid,
                args: {
                    ...interactionEventArgs,
                    payload: {
                        ...interactionEventArgs.payload,
                        ...savedPayload
                    },
                    // savedPayload: savedPayload
                },
                activityId
            }
            await this.saveEvent(event)
            response.event = event
            // effect
            await this.runEffect()
            if (this.isGetInteraction()) {
                await this.retrieveData(interactionEventArgs)
            }
        }

        return response
    }
}
