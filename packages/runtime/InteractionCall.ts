import {EntityAttributive, GetAction, InteractionInstanceType} from "@shared/activity/Activity";
import { UserAttributive } from "@shared/user/User";
// import { Entity} from "@shared/entity/Entity";
import {System} from "./System";
import {InteractionEvent, InteractionEventArgs} from "../types/interaction";
import {Concept, ConceptAlias, ConceptInstance, DerivedConcept, EntityAttributiveAtom} from "@shared/attributive";
import {BoolExp, BoolExpressionData} from "@shared/BoolExp";
import { UserAttributives, UserAttributiveAtom} from '@shared/attributive'
import {assert, everyAsync, everyWithErrorAsync, indexBy} from "./util";
import {getInstance} from "@shared/createClass";
import {ActivityCall} from "./AcitivityCall";



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


export class LoginError{
    constructor(public type: string, public error: any) {
    }
}

export type InteractionCallResponse= {
    error?: any,
    data?: any,
    sideEffects?: {
        [k: string]: any
    }
}


type HandleAttributive = (attributive: UserAttributiveAtom) => boolean

type Attributive = {
    stringContent: string,
    name: string
}

export class InteractionCall {
    constructor(public interaction: InteractionInstanceType, public system: System, public activitySeqCall?: ActivityCall) {

    }
    async checkAttributive(inputAttributive: any, interactionEvent: InteractionEventArgs, attributiveTarget) {
        const  attributive = inputAttributive as unknown as Attributive
        assert(attributive, `can not find attributive: ${attributive.name}`)
        if (attributive.stringContent) {
            // CAUTION! 第一参数应该是 User 它描述的 User（其实就是 event.user） 然后才是 event! this 指向当前，用户可以用 this.system 里面的东西来做任何查询操作
            const testFn = new Function('attributiveTarget', 'event', `return (${attributive.stringContent}).call(this, attributiveTarget, event)`)
            let result
            try {
                result = await testFn.call(this, attributiveTarget, interactionEvent)
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
    async checkMixedAttributive(attributiveData: UserAttributiveAtom, instance: ConceptInstance) {
        // const attributiveByName = indexBy((UserAttributive.instances as any[]).concat(Entity.instances), 'name')
        return Promise.resolve(true)
    }
    createHandleAttributive(AttributiveClass, interactionEvent, target) {
        return (attributiveData: UserAttributiveAtom) => {
            const attributive = getInstance(AttributiveClass).find(i => i.name === attributiveData?.key)
            return this.checkAttributive(attributive, interactionEvent, target)
        }
    }
    async checkUser(interactionEvent: InteractionEventArgs) {
        let res: ConceptCheckResponse|true
        if (this.interaction.userRoleAttributive.isRef) {
            // CAUTION 这里让 activity 自己在外部 check
            res = true
        } else {

            let userAttributiveCombined = BoolExp.atom<UserAttributiveAtom>({
                key: this.interaction.userRoleAttributive.name as string
            })

            if (this.interaction.userAttributives.content) {
                userAttributiveCombined = userAttributiveCombined.and(this.interaction.userAttributives.content as BoolExpressionData<UserAttributiveAtom>)
            }

            // FIXME 目前是用名字做索引，因为这个表达是嵌套对象，之后要支持深度的序列化和反序列化才能得到不需要名字索引的数据。
            const handleAttributive = this.createHandleAttributive(UserAttributive, interactionEvent, interactionEvent.user)
            res =  await this.checkAttributives(userAttributiveCombined, handleAttributive, [])
        }

        if (res === true) return res

        throw new LoginError('check user failed', res)
    }
    // 用来check attributive 形容的后面的  target 到底是不是那个概念的实例。
    async checkConcept(instance: ConceptInstance, concept: Concept, attributives?: UserAttributives, stack: ConceptCheckStack[] = []): ConceptCheckResponse {
        const currentStack = stack.concat({type: 'concept', values: {attributives, concept}})

        const conceptRes = await this.isConcept(instance, concept, currentStack)
        if (conceptRes !== true) return conceptRes

        if (attributives) {
            const handleAttributives = (attributiveData) => this.checkMixedAttributive(attributiveData, instance)
            const attrMatchRes = await this.checkAttributives(new BoolExp<UserAttributiveAtom>(attributives), handleAttributives , currentStack)
            if (attrMatchRes !== true) return attrMatchRes
        }

        return true
    }
    async isConcept(instance: ConceptInstance, concept: Concept, stack: ConceptCheckStack[] = []): ConceptCheckResponse {
        const currentStack = stack.concat({type: 'isConcept', values: {concept}})

        if (this.isDerivedConcept(concept)) {
            return this.checkConcept(instance, (concept as DerivedConcept).base!, (concept as DerivedConcept).attributive!, currentStack)
        }

        if (this.isConceptAlias(concept)) {
            const errors: AtomError[] = []
            const somePassed = (concept as ConceptAlias).for.some((concept: Concept) => {
                const checkRes = this.isConcept(instance, concept)
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
                return (await this.checkAttributive(concept, {}, instance)) ? true : {name: concept.name, type: 'conceptCheck', stack: currentStack, error: 'role check error'}
            }

            // Entity 或者其他具备 check 能力的
            const constructorCheck = concept.constructor?.checkRawData
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
    async checkAttributives(attributives: BoolExp<UserAttributiveAtom>, handleAttributive: HandleAttributive, stack: ConceptCheckStack[]) : ConceptCheckResponse{
        const result =  await attributives.evaluateAsync(handleAttributive)
        return result === true ? true : {name: '', type: 'matchAttributives', stack, error: result}
    }
    async checkPayload(interactionEvent: InteractionEventArgs) {
        const payloadDefs = this.interaction.payload?.items || []
        for(let payloadDef of payloadDefs) {

            const payloadItem = interactionEvent.payload[payloadDef.name]
            if (payloadDef.required && !payloadItem) {
                throw new LoginError(`payload ${payloadDef.name} missing`, interactionEvent.payload)
            }

            if (!payloadItem) return


            if (payloadDef.isCollection && !Array.isArray(payloadItem)) {
                throw new LoginError(`${payloadDef.name} data is not array`, payloadItem)
            }

            if (payloadDef.isCollection) {
                if (payloadDef.isRef && !payloadItem.every(item => !!item.id)) {
                    throw new LoginError(`${payloadDef.name} data not every is ref`, payloadItem)
                }
            } else {
                if (payloadDef.isRef && !payloadItem.id) {
                    throw new LoginError(`${payloadDef.name} data is not a ref`, payloadItem)
                }
            }


            if (payloadDef.isCollection) {
                const result = await everyWithErrorAsync(payloadItem,(item => this.checkConcept(item, payloadDef.base)))
                if (result! == true) {
                    throw new LoginError(`${payloadDef.name} check concept failed`, result)
                }
            } else {
                const result = await this.checkConcept(payloadItem, payloadDef.base)
                if (result !== true) {
                    throw new LoginError(`${payloadDef.name} check concept failed`, result)
                }
            }

            const isPayloadUser = UserAttributive.is(payloadDef.base)


            if (payloadDef.attributives) {

                const attributives = isPayloadUser ?
                    new BoolExp<UserAttributiveAtom>(payloadDef.attributives.content as BoolExpressionData<UserAttributiveAtom>):
                    new BoolExp<EntityAttributiveAtom>(payloadDef.attributives.content as BoolExpressionData<EntityAttributiveAtom>)

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
                        throw new LoginError(`${payloadDef.name} not every item match attribute`, payloadItem)
                    }
                } else {
                    const handleAttribute = this.createHandleAttributive(
                        isPayloadUser? UserAttributive : EntityAttributive,
                        interactionEvent,
                        payloadItem
                    )
                    const result = await this.checkAttributives(attributives, handleAttribute)
                    if (result !== true ) {
                        throw new LoginError(`${payloadDef.name} not match attributive`, payloadItem)
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
        return await this.system.saveEvent(interactionEvent)
    }
    async retrieveData(interactionEvent: InteractionEventArgs) {
        // TODO
        // return this.system.storage.get(interactionEvent.payload, interactionEvent.query)
    }
    async call(interactionEventArgs: InteractionEventArgs, activityId?): InteractionCallResponse {
        const response: InteractionCallResponse = {
            sideEffects: {}
        }

        const interactionEvent = {
            interactionName: this.interaction.name,
            interactionId: this.interaction.uuid,
            args: interactionEventArgs,
            activityId
        }

        try {
            await this.checkCondition(interactionEventArgs)
            await this.checkUser(interactionEventArgs)
            await this.checkPayload(interactionEventArgs)
        } catch(e) {
            response.error = e
        }

        if (!response.error) {
            // 执行
            await this.saveEvent(interactionEvent)
            // effect
            await this.runEffect()
            if (this.isGetInteraction()) {
                await this.retrieveData(interactionEventArgs)
            }
        }

        return response
    }
}
