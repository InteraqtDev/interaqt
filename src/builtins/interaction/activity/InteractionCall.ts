import {
    BoolExp,
    BoolExpressionRawData,
    Concept,
    ConceptAlias,
    ConceptInstance,
    DerivedConcept,
    Entity,
    EntityInstance,
    Relation,
    ExpressionData,
    EvaluateError
} from "@core";
import { AttributiveInstance, Attributive, Attributives } from '../Attributive.js';
import { ConditionInstance } from '../Condition.js';
import { Conditions } from '../Conditions.js';
import { GetAction } from '../Action.js';
import type { InteractionInstance } from '../Interaction.js';
import { MatchAtom, MatchExp, MatchExpressionData } from "@storage";
import { RecordMutationEvent, System } from "../../../runtime/System.js";
import { assert, everyWithErrorAsync, someAsync } from "../../../runtime/util.js";
import { ActivityCall } from "./ActivityCall.js";
import { Controller, InteractionContext } from "../../../runtime/Controller.js";
import { ConditionError } from "../../../runtime/errors/index.js";
import type { InteractionEventArgs, EventQuery, EventPayload, EventUser } from "../Interaction.js";

export type InteractionEvent  = {
    interactionName: string,
    interactionId: string,
    user: EventUser,
    query: EventQuery,
    payload: EventPayload,
    activity?: {
        id: string,
    },
    args: InteractionEventArgs,
}

export { InteractionEventArgs, EventQuery, EventPayload, EventUser };


type ConceptCheckStack = {
    type: string,
    values: {
        [k: string]: unknown
    }
}


export type ConceptCheckResponse = AtomError |true

type AtomError = {
    name: string,
    type: string,
    stack?: ConceptCheckStack[],
    content?: string,
    error?: unknown
}




type SideEffectResult = {
    result?: unknown,
    error?: unknown
}

export type InteractionCallResponse= {
    error?: unknown,
    data?: unknown,
    event?: InteractionEvent
    effects?: RecordMutationEvent[]
    sideEffects?: {
        [k: string]: SideEffectResult
    }
    context?: {
        [k: string]: unknown
    }
}


type HandleAttributive = (attributive: AttributiveInstance) => Promise<boolean>

type AttributiveType = {
    content: (attributiveTarget: unknown, event: InteractionEventArgs | undefined) => Promise<boolean> | boolean
    name: string
}

type CheckUserRef = (attributive: AttributiveInstance, eventUser: EventUser, activityId: string) => Promise<boolean>

export class InteractionCall {
    system: System
    constructor(public interaction: InteractionInstance, public controller: Controller, public activitySeqCall?: ActivityCall) {
        this.system = controller.system
    }
    async checkAttributive(inputAttributive: any, interactionEvent: InteractionEventArgs|undefined, attributiveTarget: any) {
        const  attributive = inputAttributive as unknown as AttributiveType
        if (attributive.content) {
            const testFn = attributive.content
            let result
            try {
                result = await testFn.call(this.controller, attributiveTarget, interactionEvent)
            } catch(e) {
                result = false
            }


            if ( result === undefined ) {
                console.warn(`attributive ${attributive.name} returned undefined, maybe not implemented, we will return true for now`)
                return true
            }
            return result
        } else {
            console.warn(`${attributive.name} not implemented`)
        }
        return true
    }
    async checkMixedAttributive(attributiveData: AttributiveInstance, instance: ConceptInstance) {
        return Promise.resolve(true)
    }
    createHandleAttributive(AttributiveClass: typeof Attributive| typeof Attributive, interactionEvent: InteractionEventArgs, target: any) {
        return (attributive: AttributiveInstance) => {
            return this.checkAttributive(attributive, interactionEvent, target)
        }
    }
    async checkUser(interactionEvent: InteractionEventArgs, activityId? :string, checkUserRef?:CheckUserRef) {
        let res: ConceptCheckResponse|true
        if (!this.interaction.userAttributives ) return true

        const userAttributiveCombined =
            Attributives.is(this.interaction.userAttributives) ?
                BoolExp.fromValue<AttributiveInstance>(
                    this.interaction.userAttributives!.content! as ExpressionData<AttributiveInstance>
                ) :
                BoolExp.atom<AttributiveInstance>(
                    this.interaction.userAttributives as AttributiveInstance
                )

        const checkHandle = (attributive: AttributiveInstance) => {
            if (attributive.isRef) {
                return checkUserRef!(attributive, interactionEvent.user, activityId!)
            } else {
                return this.checkAttributive(attributive, interactionEvent, interactionEvent.user)
            }
        }
        res =  await this.checkAttributives(userAttributiveCombined, checkHandle, [])

        if (res === true) return res

        throw ConditionError.userCheckFailed(res)
    }
    async checkConcept(instance: ConceptInstance, concept: Concept, attributives?: BoolExpressionRawData<AttributiveInstance>, stack: ConceptCheckStack[] = []): Promise<ConceptCheckResponse> {
        const currentStack = stack.concat({type: 'concept', values: {attributives, concept}})

        const conceptRes = await this.isConcept(instance, concept, currentStack)
        if (conceptRes !== true) return conceptRes

        if (attributives) {
            const handleAttributives = (attributive: AttributiveInstance) => this.checkMixedAttributive(attributive, instance)
            const attrMatchRes = await this.checkAttributives(BoolExp.fromValue<AttributiveInstance>(attributives as ExpressionData<AttributiveInstance>), handleAttributives , currentStack)
            if (attrMatchRes !== true) return attrMatchRes
        }

        return true
    }
    async isConcept(instance: ConceptInstance, concept: Concept, stack: ConceptCheckStack[] = []): Promise<ConceptCheckResponse> {
        const currentStack = stack.concat({type: 'isConcept', values: {concept}})

        if (this.isDerivedConcept(concept)) {
            const derivedConcept = concept as DerivedConcept;
            if (derivedConcept.attributive) {
                return this.checkConcept(instance, derivedConcept.base!, derivedConcept.attributive as BoolExpressionRawData<AttributiveInstance>, currentStack);
            } else {
                return this.isConcept(instance, derivedConcept.base!, currentStack);
            }
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
            if (Attributive.is(concept)) {
                return (await this.checkAttributive(concept, undefined, instance)) ? true : {name: concept.name, type: 'conceptCheck', stack: currentStack, error: 'role check error'}
            }

            const constructorCheck = (concept.constructor as any)?.check
            if (constructorCheck) {
                return constructorCheck(instance as object) ? true : {name: concept.name, type: 'conceptCheck', stack: currentStack, error: 'constructor check error'}
            }

            if (concept.constructor && typeof (concept.constructor as any).check === 'function') {
                const checkResult = (concept.constructor as any).check(instance)
                return checkResult ? true : {name: concept.name || '', type: 'conceptCheck', stack: currentStack, error: 'constructor check error'}
            }

            if (Entity.is(concept)) {
                if (instance && typeof instance === 'object' && 'id' in instance) {
                    return true
                }
                if (instance && typeof instance === 'object') {
                    return true
                }
                return {name: concept.name || '', type: 'conceptCheck', stack: currentStack, error: 'invalid entity data'}
            }

            if (instance && typeof instance === 'object') {
                return true
            }

            if (typeof concept === 'function') {
                return instance instanceof concept ? true : {name: (concept as Function).name, type: 'conceptCheck', stack: currentStack, error: 'instanceof check error'}
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

    async checkAttributives(attributives: BoolExp<AttributiveInstance>, handleAttributive: HandleAttributive, stack: ConceptCheckStack[] = []) : Promise<ConceptCheckResponse>{
        const result =  await attributives.evaluateAsync(handleAttributive)
        return result === true ? true : {name: '', type: 'matchAttributives', stack, error: result}
    }
    async checkPayload(interactionEvent: InteractionEventArgs) {
        const payload = interactionEvent.payload || {}
        const payloadDefs = this.interaction.payload?.items || []

        const payloadKeys = Object.keys(payload)
        for(let payloadKey of payloadKeys) {
            if (!payloadDefs.some(payloadDef => payloadDef.name === payloadKey)) {
                throw new Error(`${payloadKey} in payload is not defined in interaction ${this.interaction.name}`)
            }
        }
        
        for(let payloadDef of payloadDefs) {
            if (payloadDef.required && !(payloadDef.name in payload)) {
                throw ConditionError.payloadValidationFailed(payloadDef.name!, 'missing', payload)
            }

            const payloadItem = payload[payloadDef.name!]
            if (payloadItem===undefined) return

            if (payloadDef.isCollection && !Array.isArray(payloadItem)) {
                throw ConditionError.payloadValidationFailed(payloadDef.name!, 'data is not array', payloadItem)
            }

            if (payloadDef.isCollection) {
                if (payloadDef.isRef && !((payloadItem as unknown[]) as {id: string}[]).every(item => !!item.id)) {
                    throw ConditionError.payloadValidationFailed(payloadDef.name!, 'data not every is ref', payloadItem)
                }
            } else {
                if (payloadDef.isRef && !(payloadItem as {id: string}).id) {
                    throw ConditionError.payloadValidationFailed(payloadDef.name!, 'data is not a ref', payloadItem)
                }
            }

            if (payloadDef.base) {
                if (payloadDef.isCollection) {
                    const result = await everyWithErrorAsync(payloadItem as unknown[],(item => this.checkConcept(item, payloadDef.base as unknown as Concept)))
                    if (result !== true) {
                        throw ConditionError.conceptCheckFailed(payloadDef.name!, result)
                    }
                } else {
                    const result = await this.checkConcept(payloadItem, payloadDef.base as unknown as Concept)
                    if (result !== true) {
                        throw ConditionError.conceptCheckFailed(payloadDef.name!, result)
                    }
                }
            }

            let fullPayloadItem: unknown | unknown[] = payloadItem
            if (payloadDef.isRef) {
                const itemMatch = payloadDef.isCollection ?
                    MatchExp.atom({
                        key: 'id',
                        value: ['in', ((payloadItem as unknown[]) as {id: string}[]).map((item) => item.id)]
                    }) :
                    MatchExp.atom({
                        key: 'id',
                        value: ['=', (payloadItem as {id: string}).id]
                    })

                fullPayloadItem = payloadDef.isCollection ?
                    await this.system.storage.find(payloadDef.base!.name!, itemMatch, undefined, ['*']) :
                    await this.system.storage.findOne(payloadDef.base!.name!, itemMatch, undefined, ['*'])
            }
        }
    }

    async checkCondition(interactionEvent: InteractionEventArgs) {
        if (this.interaction.conditions ) {
            const conditions =  Conditions.is(this.interaction.conditions) ?
                new BoolExp<ConditionInstance>(this.interaction.conditions.content as BoolExpressionRawData<ConditionInstance>) :
                BoolExp.atom<ConditionInstance>(this.interaction.conditions as ConditionInstance)


            const handleAttribute = async (condition: ConditionInstance) => {
                if (!condition) return true

                if (condition.content) {
                    const testFn = condition.content
                    let result
                    try {
                        result = await testFn.call(this.controller, interactionEvent)
                    } catch(e) {
                        console.warn(`check function throw`, e)
                        const errorMessage = e instanceof Error ? e.message : String(e)
                        return `Condition '${condition.name}' threw exception: ${errorMessage}`
                    }

                    if ( result === undefined ) {
                        console.warn(`condition ${condition.name} returned undefined, maybe not implemented, we will return true for now`)
                        return true
                    }
                    return result
                } else {
                    console.warn(`${condition.name} not implemented`)
                }
                return true
            }

            const result =  await conditions.evaluateAsync(handleAttribute)
            if (result !== true ) {
                throw ConditionError.conditionCheckFailed(result)
            }
        }
    }
    isGetInteraction() {
        return this.interaction.action === GetAction
    }
    private static INTERACTION_RECORD = '_Interaction_'

    async saveEvent(interactionEvent: InteractionEvent) {
        return await this.system.storage.create(InteractionCall.INTERACTION_RECORD, interactionEvent)
    }
    async retrieveData(interactionEvent: InteractionEventArgs) {
        let data: any
        if (Entity.is(this.interaction.data) || Relation.is(this.interaction.data)) {
            const recordName = (this.interaction.data as EntityInstance).name!
            
            const fixedMatch = this.interaction.dataPolicy?.match
            const fixedModifier = this.interaction.dataPolicy?.modifier
            const allowedAttributeQuery = this.interaction.dataPolicy?.attributeQuery
            
            const modifier = {...(interactionEvent.query?.modifier||{}), ...(fixedModifier||{})}
            const attributeQuery = interactionEvent.query?.attributeQuery || []
            
            const matchValue : BoolExp<MatchAtom> | undefined = typeof fixedMatch === 'function' ? await fixedMatch.call(this.controller, interactionEvent) : fixedMatch
            const combinedMatch = BoolExp.and(matchValue, interactionEvent.query?.match)

            data = await this.system.storage.find(recordName, combinedMatch, modifier, attributeQuery)
        } else {
            assert(false,`unknown data type ${this.interaction.data}`)
        }

        return data
    }
    async check(interactionEventArgs: InteractionEventArgs, activityId?: string, checkUserRef?: CheckUserRef, context?: InteractionContext): Promise<InteractionCallResponse["error"]> {
        let error
        try {
            if (!this.controller.ignoreGuard) {
                await this.checkCondition(interactionEventArgs)
            }
            await this.checkUser(interactionEventArgs, activityId, checkUserRef)
            await this.checkPayload(interactionEventArgs)
        } catch(e) {
            error = e
        }
        return error
    }

    async call(interactionEventArgs: InteractionEventArgs, activityId?: string, checkUserRef?: CheckUserRef, context?: InteractionContext): Promise<InteractionCallResponse> {
        const response: InteractionCallResponse = {
            sideEffects: {},
        }

        response.error  = await this.check(interactionEventArgs, activityId, checkUserRef, context)

        if (!response.error) {
            const event: InteractionEvent = {
                interactionName: this.interaction.name,
                interactionId: this.interaction.uuid,
                user: interactionEventArgs.user,
                query: interactionEventArgs.query || {},
                payload: interactionEventArgs.payload||{},
                args: interactionEventArgs,
            }
            if(activityId && activityId !== undefined) {
                event.activity = {id: activityId}
            }

            await this.saveEvent(event)
            response.event = event
            if (this.isGetInteraction()) {
                response.data = await this.retrieveData(interactionEventArgs)
            }
        }

        return response
    }
}
