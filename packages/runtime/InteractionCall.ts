import {
    Attributive,
    Attributives,
    BoolExp,
    BoolExpressionRawData,
    Concept,
    ConceptAlias,
    ConceptInstance, Condition, Conditions,
    DerivedConcept,
    Entity,
    Relation,
    ExpressionData,
    GetAction,
    InteractionInstanceType,
    Klass,
    KlassInstance, DataAttributives, DataAttributive, Computation,
} from "@interaqt/shared";
import {RecordMutationEvent, System} from "./System.js";
import {EventUser, InteractionEvent, InteractionEventArgs} from "./types/interaction.js";
import {assert, everyWithErrorAsync} from "./util.js";
import {ActivityCall} from "./ActivityCall.js";
import {someAsync} from "@interaqt/storage";
import {Controller, InteractionContext, USER_ENTITY} from "./Controller.js";

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

export class ConditionError {
    constructor(public type: string, public error: any) {
    }
}

type SideEffectResult = {
    result?: any,
    error?: any
}

export type InteractionCallResponse= {
    error?: any,
    // 获取数据的 interaction 返回的数据
    data?: any,
    event?: InteractionEvent
    // interaction 中产生的 record create/update 等行为
    effects? : any[]
    sideEffects?: {
        [k: string]: SideEffectResult
    }
    // interaction 附加产生的上下文，例如 activityId
    context?: {
        [k: string]: any
    }
}


type HandleAttributive = (attributive: KlassInstance<typeof Attributive>) => Promise<boolean>

type Attributive = {
    content: (...args: any[]) => any
    name: string
}

type CheckUserRef = (attributive: KlassInstance<typeof Attributive>, eventUser: EventUser, activityId: string) => Promise<boolean>

export class InteractionCall {
    system: System
    constructor(public interaction: InteractionInstanceType, public controller: Controller, public activitySeqCall?: ActivityCall) {
        this.system = controller.system
    }
    async checkAttributive(inputAttributive: any, interactionEvent: InteractionEventArgs|undefined, attributiveTarget: any) {
        const  attributive = inputAttributive as unknown as Attributive
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
                console.warn(`attributive ${attributive.name} returned undefined, maybe not implemented, we will return true for now`)
                return true
            }
            return result
        } else {
            console.warn(`${attributive.name} not implemented`)
        }
        return true
    }
    async checkMixedAttributive(attributiveData: KlassInstance<typeof Attributive>, instance: ConceptInstance) {
        // const attributiveByName = indexBy((UserAttributive.instances as any[]).concat(Entity.instances), 'name')
        return Promise.resolve(true)
    }
    createHandleAttributive(AttributiveClass: typeof Attributive| typeof Attributive, interactionEvent: InteractionEventArgs, target: any) {
        return (attributive: KlassInstance<typeof Attributive>) => {
            return this.checkAttributive(attributive, interactionEvent, target)
        }
    }
    async checkUser(interactionEvent: InteractionEventArgs, activityId? :string, checkUserRef?:CheckUserRef) {
        let res: ConceptCheckResponse|true
        if (!this.interaction.userAttributives ) return true

        const userAttributiveCombined =
            Attributives.is(this.interaction.userAttributives) ?
                BoolExp.fromValue<KlassInstance<typeof Attributive>>(
                    this.interaction.userAttributives!.content! as ExpressionData<KlassInstance<typeof Attributive>>
                ) :
                BoolExp.atom<KlassInstance<typeof Attributive>>(
                    this.interaction.userAttributives as KlassInstance<typeof Attributive>
                )

        const checkHandle = (attributive: KlassInstance<typeof Attributive>) => {
            if (attributive.isRef) {
                return checkUserRef!(attributive, interactionEvent.user, activityId!)
            } else {
                return this.checkAttributive(attributive, interactionEvent, interactionEvent.user)
            }
        }
        res =  await this.checkAttributives(userAttributiveCombined, checkHandle, [])

        if (res === true) return res

        throw new AttributeError('check user failed', res)
    }
    // 用来check attributive 形容的后面的  target 到底是不是那个概念的实例。
    async checkConcept(instance: ConceptInstance, concept: Concept, attributives?: BoolExpressionRawData<KlassInstance<typeof Attributive>>, stack: ConceptCheckStack[] = []): Promise<ConceptCheckResponse> {
        const currentStack = stack.concat({type: 'concept', values: {attributives, concept}})

        const conceptRes = await this.isConcept(instance, concept, currentStack)
        if (conceptRes !== true) return conceptRes

        if (attributives) {
            const handleAttributives = (attributive: KlassInstance<typeof Attributive>) => this.checkMixedAttributive(attributive, instance)
            const attrMatchRes = await this.checkAttributives(new BoolExp<KlassInstance<typeof Attributive>>(attributives), handleAttributives , currentStack)
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
            // TODO 好像废弃了，再检查一下，attributive 的check 直接就在 checkAttributive 做了
            // CAUTION 这里的 concept 是 Role/Entity 的实例. 例如 UserRole/AdminRole，实体例如 Post/Profile
            if (Attributive.is(concept)) {
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

    async checkAttributives(attributives: BoolExp<KlassInstance<typeof Attributive>>, handleAttributive: HandleAttributive, stack: ConceptCheckStack[] = []) : Promise<ConceptCheckResponse>{
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
                const result = await everyWithErrorAsync(payloadItem,(item => this.checkConcept(item, payloadDef.base as KlassInstance<typeof Entity>)))
                if (result! == true) {
                    throw new AttributeError(`${payloadDef.name} check concept failed`, result)
                }
            } else {
                const result = await this.checkConcept(payloadItem, payloadDef.base as KlassInstance<typeof Entity>)
                if (result !== true) {
                    throw new AttributeError(`${payloadDef.name} check concept failed`, result)
                }
            }

            let fullPayloadItem: any|any[] = payloadItem
            if (payloadDef.isRef) {
                const itemMatch = payloadDef.isCollection ?
                    BoolExp.atom({
                        key: 'id',
                        value: ['in', payloadItem.map((item: any) => item.id)]
                    }) :
                    BoolExp.atom({
                        key: 'id',
                        value: ['=', payloadItem.id]
                    })

                fullPayloadItem = payloadDef.isCollection ?
                    await this.system.storage.find(payloadDef.base.name, itemMatch, undefined, ['*']) :
                    await this.system.storage.findOne(payloadDef.base.name, itemMatch, undefined, ['*'])
            }

            if (payloadDef.attributives) {
                const attributives =  Attributives.is(payloadDef.attributives) ?
                    new BoolExp<KlassInstance<typeof Attributive>>(payloadDef.attributives.content as BoolExpressionRawData<KlassInstance<typeof Attributive>>) :
                    BoolExp.atom<KlassInstance<typeof Attributive>>(payloadDef.attributives as KlassInstance<typeof Attributive>)

                // 作为整体是否合法应该放到 condition 里面做
                if (payloadDef.isCollection) {
                    const result = await everyWithErrorAsync(fullPayloadItem, (item => {
                        const handleAttribute = this.createHandleAttributive(
                            Attributive,
                            interactionEvent,
                            item
                        )

                        return this.checkAttributives(attributives, handleAttribute)
                    }))

                    if (result !== true) {
                        throw new AttributeError(`${payloadDef.name} not every item match attribute`, fullPayloadItem)
                    }
                } else {
                    const handleAttribute = this.createHandleAttributive(
                        Attributive,
                        interactionEvent,
                        fullPayloadItem
                    )
                    const result = await this.checkAttributives(attributives, handleAttribute)
                    if (result !== true ) {
                        throw new AttributeError(`${payloadDef.name} not match attributive`, { payload: fullPayloadItem, result})
                    }
                }
            }
        }
    }

    async checkCondition(interactionEvent: InteractionEventArgs) {
        if (this.interaction.conditions ) {
            const conditions =  Conditions.is(this.interaction.conditions) ?
                new BoolExp<KlassInstance<typeof Condition>>(this.interaction.conditions.content as BoolExpressionRawData<KlassInstance<typeof Condition>>) :
                BoolExp.atom<KlassInstance<typeof Condition>>(this.interaction.conditions as KlassInstance<typeof Condition>)


            const handleAttribute = async (condition: KlassInstance<typeof Condition>) => {
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
                throw new ConditionError(`condition check failed`, result)
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
        return await this.system.saveEvent(interactionEvent, effects)
    }
    async savePayload(payload: InteractionEventArgs["payload"], effects: any[]){
        const payloadDefs = this.interaction.payload?.items || []
        const savedPayload: InteractionEventArgs["payload"] = {}
        for(let payloadDef of payloadDefs) {
            if (!payloadDef.isRef ) {
                const payloadItem = payload![payloadDef.name!]
                if (payloadItem) {
                    const recordName = (payloadDef.base as KlassInstance<typeof Entity>).name
                    if (payloadDef.isCollection) {
                        savedPayload[payloadDef.name!] = await Promise.all((payloadItem as any[]).map(async (item) => {
                            const events: RecordMutationEvent[] =[]
                            const result = await this.system.storage.create(recordName, item, events)
                            effects.push(...events)
                            return result
                        }))
                    } else {
                        const events: RecordMutationEvent[] =[]
                        savedPayload[payloadDef.name!] = await this.system.storage.create(recordName, payloadItem, events)
                        effects.push(...events)
                    }
                }
            }
        }


        return savedPayload
    }
    async retrieveData(interactionEvent: InteractionEventArgs) {
        const matchFn = this.interaction.dataAttributives ?
            (DataAttributives.is(this.interaction.dataAttributives) ?
                BoolExp.fromValue<KlassInstance<typeof DataAttributive>>(
                    this.interaction.dataAttributives!.content! as ExpressionData<KlassInstance<typeof DataAttributive>>
                ) :
                BoolExp.atom<KlassInstance<typeof DataAttributive>>(
                    this.interaction.dataAttributives as KlassInstance<typeof DataAttributive>
                )
            ) :
            undefined

        const match = matchFn?.map((dataAttributiveAtom) => {
            const { content: createMatch } = dataAttributiveAtom.toValue().data
            return createMatch.call(this.controller, interactionEvent)
        })

        let data: any
        if (Entity.is(this.interaction.data) || Relation.is(this.interaction.data)) {
            const recordName = (this.interaction.data as KlassInstance<typeof Entity>).name
            const {modifier: fixedModifier, attributeQuery: fixedAttributeQuery} = Object.fromEntries(
                this.interaction.query?.items?.map(item => [(item as any).name, (item as any).value as any]) || [])
            const modifier = {...(interactionEvent.query?.modifier||{}), ...(fixedModifier||{})}
            // TODO 怎么判断 attributeQuery 是在 fixed 的q范围里面？？？？
            const attributeQuery = interactionEvent.query?.attributeQuery || []
            const matchInQuery = interactionEvent.query?.match ? BoolExp.fromValue(interactionEvent.query?.match) : undefined
            const finalMatch = (matchInQuery && match) ? match.and(matchInQuery) : (match || matchInQuery)
            data = await this.system.storage.find(recordName, finalMatch, modifier, attributeQuery)
        } else if (Computation.is(this.interaction.data)){
            // computation
            const { content: computation } = this.interaction.data as KlassInstance<typeof Computation>
            data= await computation.call(this.controller, match, interactionEvent.query, interactionEvent )
        } else {
            assert(false,`unknown data type ${this.interaction.data}`)
        }

        return data
    }
    async check(interactionEventArgs: InteractionEventArgs, activityId?: string, checkUserRef?: CheckUserRef, context?: InteractionContext): Promise<InteractionCallResponse["error"]> {
        let error
        try {
            await this.checkCondition(interactionEventArgs)
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
            const savedPayload = await this.savePayload(interactionEventArgs.payload, response.effects!)
            const event = {
                interactionName: this.interaction.name,
                interactionId: this.interaction.uuid,
                user: interactionEventArgs.user,
                query: interactionEventArgs.query,
                payload: {
                    ...interactionEventArgs.payload,
                    ...savedPayload
                },

                args: {
                    ...interactionEventArgs,
                    payload: {
                        ...interactionEventArgs.payload,
                        ...savedPayload
                    },
                },
                activityId
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
