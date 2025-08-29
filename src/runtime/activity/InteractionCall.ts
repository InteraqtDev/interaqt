import {
    AttributiveInstance, ConditionInstance, EntityInstance,
    Attributive,
    Attributives,
    BoolExp,
    BoolExpressionRawData,
    Concept,
    ConceptAlias,
    ConceptInstance, Conditions,
    DerivedConcept,
    Entity,
    Relation,
    ExpressionData,
    GetAction,
    InteractionInstanceType,
    EvaluateError
} from "@shared";
import { MatchAtom, MatchExp, MatchExpressionData } from "@storage";
import { RecordMutationEvent, System } from "../System.js";
import { assert, everyWithErrorAsync, someAsync } from "../util.js";
import { ActivityCall } from "./ActivityCall.js";
import { Controller, InteractionContext } from "../Controller.js";
import { ConditionError } from "../errors/index.js";

export type EventQuery = {
    match?: MatchExpressionData,
    modifier?: Record<string, unknown>,
    attributeQuery?: string[],
}


export type EventPayload = {
    [k: string]: unknown
}

export type InteractionEvent  = {
    interactionName: string,
    interactionId: string,
    user: EventUser,
    query: EventQuery,
    payload: EventPayload,
    activityId?: string,
}

export type InteractionEventArgs = {
    user: EventUser,
    query?: EventQuery,
    payload?: EventPayload,
    activityId?: string,
}

export type EventUser = {
    id: string,
    [k: string]: unknown
}


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
    // 获取数据的 interaction 返回的数据
    data?: unknown,
    event?: InteractionEvent
    // interaction 中产生的 record create/update 等行为
    effects?: RecordMutationEvent[]
    sideEffects?: {
        [k: string]: SideEffectResult
    }
    // interaction 附加产生的上下文，例如 activityId
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
    constructor(public interaction: InteractionInstanceType, public controller: Controller, public activitySeqCall?: ActivityCall) {
        this.system = controller.system
    }
    async checkAttributive(inputAttributive: any, interactionEvent: InteractionEventArgs|undefined, attributiveTarget: any) {
        const  attributive = inputAttributive as unknown as AttributiveType
        if (attributive.content) {
            // CAUTION! 第一参数应该是 User 它描述的 User（其实就是 event.user） 然后才是 event! this 指向当前，用户可以用 this.system 里面的东西来做任何查询操作
            // const testFn = new Function('attributiveTarget', 'event', `return (${attributive.content}).call(this, attributiveTarget, event)`)
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
        // const attributiveByName = indexBy((UserAttributive.instances as any[]).concat(Entity.instances), 'name')
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
    // 用来check attributive 形容的后面的  target 到底是不是那个概念的实例。
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
                // 如果没有 attributive，只检查 base
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
            // TODO 好像废弃了，再检查一下，attributive 的check 直接就在 checkAttributive 做了
            // CAUTION 这里的 concept 是 Role/Entity 的实例. 例如 UserRole/AdminRole，实体例如 Post/Profile
            if (Attributive.is(concept)) {
                // Role
                return (await this.checkAttributive(concept, undefined, instance)) ? true : {name: concept.name, type: 'conceptCheck', stack: currentStack, error: 'role check error'}
            }

            // Entity 或者其他具备 check 能力的
            const constructorCheck = (concept.constructor as any)?.check
            if (constructorCheck) {
                return constructorCheck(instance as object) ? true : {name: concept.name, type: 'conceptCheck', stack: currentStack, error: 'constructor check error'}
            }

            // 对于重构后的代码，检查是否是 Entity 或其他具有静态 check 方法的类
            if (concept.constructor && typeof (concept.constructor as any).check === 'function') {
                const checkResult = (concept.constructor as any).check(instance)
                return checkResult ? true : {name: concept.name || '', type: 'conceptCheck', stack: currentStack, error: 'constructor check error'}
            }

            // 对于 Entity 实例，检查传入的数据是否匹配
            if (Entity.is(concept)) {
                // 简单检查：确保 instance 至少有 id 属性
                if (instance && typeof instance === 'object' && 'id' in instance) {
                    return true
                }
                // 如果没有 id，检查是否是新创建的数据
                if (instance && typeof instance === 'object') {
                    return true
                }
                return {name: concept.name || '', type: 'conceptCheck', stack: currentStack, error: 'invalid entity data'}
            }

            // 对于 Entity 实例，简单检查数据是否有效
            if (instance && typeof instance === 'object') {
                // 基本的检查：确保对象至少有一些属性
                return true
            }

            // instanceCheck
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
        const payloadDefs = this.interaction.payload?.items || []

        // 检查是否存在传了没定义的字段的情况。
        const payloadKeys = Object.keys(interactionEvent.payload || {})
        for(let payloadKey of payloadKeys) {
            if (!payloadDefs.some(payloadDef => payloadDef.name === payloadKey)) {
                throw new Error(`${payloadKey} in payload is not defined in interaction ${this.interaction.name}`)
            }
        }
        
        for(let payloadDef of payloadDefs) {

            const payloadItem = interactionEvent.payload![payloadDef.name!]
            if (payloadDef.required && !payloadItem) {
                throw ConditionError.payloadValidationFailed(payloadDef.name!, 'missing', interactionEvent.payload)
            }

            if (!payloadItem) return


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


            // Only check concept if base is defined (for entity references)
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

            // TODO deprecate
            if (payloadDef.attributives) {
                const attributives =  Attributives.is(payloadDef.attributives) ?
                    new BoolExp<AttributiveInstance>(payloadDef.attributives.content as BoolExpressionRawData<AttributiveInstance>) :
                    BoolExp.atom<AttributiveInstance>(payloadDef.attributives as AttributiveInstance)

                // 作为整体是否合法应该放到 condition 里面做
                if (payloadDef.isCollection) {
                    const result = await everyWithErrorAsync(fullPayloadItem as unknown[], (item => {
                        const handleAttribute = this.createHandleAttributive(
                            Attributive,
                            interactionEvent,
                            item
                        )

                        return this.checkAttributives(attributives, handleAttribute)
                    }))

                    if (result !== true) {
                        throw ConditionError.attributiveCheckFailed(payloadDef.name!, 'not every item match attribute', fullPayloadItem, result)
                    }
                } else {
                    const handleAttribute = this.createHandleAttributive(
                        Attributive,
                        interactionEvent,
                        fullPayloadItem
                    )
                    const result = await this.checkAttributives(attributives, handleAttribute)
                    if (result !== true ) {
                        throw ConditionError.attributiveCheckFailed(payloadDef.name!, 'not match attributive', fullPayloadItem, result)
                    }
                }
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
                        result = false
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
    // CAUTION sideEffect 是并行的。如果要串行，用户应该自己写在一个里面
    async runEffects(eventArgs: InteractionEventArgs, activityId: string|undefined, response: InteractionCallResponse) {
        const sideEffects = this.interaction.sideEffects || []

        const sideEffectsPromise = sideEffects.map(sideEffect => (async () => {
            let result
            let error
            try {
                result  = await sideEffect.handle.call(this.controller, eventArgs, activityId)
            } catch (e) {
                error = e
            }
            return [sideEffect.name, {result, error}] as [string, SideEffectResult]
        })())

        const results = await Promise.all(sideEffectsPromise)
        for (let [name, {result, error}] of results) {
            assert(!response.sideEffects![name], `sideEffect ${name} already exists`)
            response.sideEffects![name] = {result, error}
        }
    }
    isGetInteraction() {
        return this.interaction.action === GetAction
    }
    async saveEvent(interactionEvent: InteractionEvent, effects: any[]) {
        // 为 payload 里面的新数据保存起来
        return await this.controller.activityManager.saveEvent(interactionEvent, effects)
    }
    async retrieveData(interactionEvent: InteractionEventArgs) {
        let data: any
        if (Entity.is(this.interaction.data) || Relation.is(this.interaction.data)) {
            const recordName = (this.interaction.data as EntityInstance).name!
            const {modifier: fixedModifier, attributeQuery: fixedAttributeQuery} = Object.fromEntries(
                this.interaction.query?.items?.map(item => [(item as any).name, (item as any).value as any]) || [])
            const modifier = {...(interactionEvent.query?.modifier||{}), ...(fixedModifier||{})}
            // TODO 怎么判断 attributeQuery 是在 fixed 的q范围里面？？？？
            const attributeQuery = interactionEvent.query?.attributeQuery || []
            data = await this.system.storage.find(recordName, interactionEvent.query?.match, modifier, attributeQuery)
        // } else if (Computation.is(this.interaction.data)){
        //     const { content: computation } = this.interaction.data as KlassInstance<typeof Computation>
        //     data= await computation.call(this.controller, match, interactionEvent.query, interactionEvent )
        } else {
            assert(false,`unknown data type ${this.interaction.data}`)
        }

        return data
    }
    async check(interactionEventArgs: InteractionEventArgs, activityId?: string, checkUserRef?: CheckUserRef, context?: InteractionContext): Promise<InteractionCallResponse["error"]> {
        let error
        try {
            if (!this.controller.ignorePermission) {
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
            effects: []
        }

        response.error  = await this.check(interactionEventArgs, activityId, checkUserRef, context)

        if (!response.error) {
            const event = {
                interactionName: this.interaction.name,
                interactionId: this.interaction.uuid,
                user: interactionEventArgs.user,
                query: interactionEventArgs.query || {},
                payload: interactionEventArgs.payload||{},
                args: interactionEventArgs,
                activity: {
                    id: activityId,
                }
            }

            await this.saveEvent(event, response.effects!)
            response.event = event
            // effect
            await this.runEffects(interactionEventArgs, activityId, response)
            if (this.isGetInteraction()) {
                response.data = await this.retrieveData(interactionEventArgs)
            }
        }

        return response
    }
}
