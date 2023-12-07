import {
    Attributive,
    Attributives,
    BoolExp,
    BoolExpressionRawData,
    Concept,
    ConceptAlias,
    ConceptInstance,
    DerivedConcept,
    Entity,
    ExpressionData,
    GetAction,
    InteractionInstanceType,
    Klass,
    KlassInstance,
} from "@interaqt/shared";
import {System} from "./System.js";
import {EventUser, InteractionEvent, InteractionEventArgs} from "./types/interaction.js";
import {assert, everyWithErrorAsync} from "./util.js";
import {ActivityCall} from "./ActivityCall.js";
import {someAsync} from "@interaqt/storage";
import {Controller, USER_ENTITY} from "./Controller.js";

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

type SideEffectResult = {
    result: any,
    error: any
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
}


type UserAttributiveAtom = KlassInstance<typeof Attributive, false>
/// FIXME EntityAttributiveAtom 没有 isRole 字段
type EntityAttributiveAtom =  UserAttributiveAtom

type HandleAttributive = (attributive: KlassInstance<typeof Attributive, false>) => Promise<boolean>

type Attributive = {
    content: (...args: any[]) => any
    name: string
}

type CheckUserRef = (attributive: KlassInstance<typeof Attributive, false>, eventUser: EventUser, activityId: string) => Promise<boolean>

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
    async checkMixedAttributive(attributiveData: KlassInstance<typeof Attributive, false>, instance: ConceptInstance) {
        // const attributiveByName = indexBy((UserAttributive.instances as any[]).concat(Entity.instances), 'name')
        return Promise.resolve(true)
    }
    createHandleAttributive(AttributiveClass: typeof Attributive| typeof Attributive, interactionEvent: InteractionEventArgs, target: any) {
        return (attributive: KlassInstance<typeof Attributive, false>) => {
            return this.checkAttributive(attributive, interactionEvent, target)
        }
    }
    async checkUser(interactionEvent: InteractionEventArgs, activityId? :string, checkUserRef?:CheckUserRef) {
        let res: ConceptCheckResponse|true
        if (!this.interaction.userAttributives ) return true

        const userAttributiveCombined =
            Attributives.is(this.interaction.userAttributives) ?
                BoolExp.fromValue<KlassInstance<typeof Attributive, false>>(
                    this.interaction.userAttributives!.content! as ExpressionData<KlassInstance<typeof Attributive, false>>
                ) :
                BoolExp.atom<KlassInstance<typeof Attributive, false>>(
                    this.interaction.userAttributives as KlassInstance<typeof Attributive, false>
                )

        const checkHandle = (attributive: KlassInstance<typeof Attributive, false>) => {
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
    async checkConcept(instance: ConceptInstance, concept: Concept, attributives?: BoolExpressionRawData<KlassInstance<typeof Attributive, false>>, stack: ConceptCheckStack[] = []): Promise<ConceptCheckResponse> {
        const currentStack = stack.concat({type: 'concept', values: {attributives, concept}})

        const conceptRes = await this.isConcept(instance, concept, currentStack)
        if (conceptRes !== true) return conceptRes

        if (attributives) {
            const handleAttributives = (attributive: KlassInstance<typeof Attributive, false>) => this.checkMixedAttributive(attributive, instance)
            const attrMatchRes = await this.checkAttributives(new BoolExp<KlassInstance<typeof Attributive, false>>(attributives), handleAttributives , currentStack)
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
    async checkAttributives(attributives: BoolExp<KlassInstance<typeof Attributive, false>>, handleAttributive: HandleAttributive, stack: ConceptCheckStack[] = []) : Promise<ConceptCheckResponse>{
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

            const itemMatch = BoolExp.atom({
                key: 'id',
                value: ['=', payloadItem.id]
            })

            const fullPayloadItem = payloadDef.isRef ?
                await this.system.storage.findOne(payloadDef.base.name, itemMatch, undefined, ['*']) :
                payloadItem

            if (payloadDef.isCollection) {
                const result = await everyWithErrorAsync(fullPayloadItem,(item => this.checkConcept(item, payloadDef.base as KlassInstance<typeof Entity, false>)))
                if (result! == true) {
                    throw new AttributeError(`${payloadDef.name} check concept failed`, result)
                }
            } else {
                const result = await this.checkConcept(fullPayloadItem, payloadDef.base as KlassInstance<typeof Entity, false>)
                if (result !== true) {
                    throw new AttributeError(`${payloadDef.name} check concept failed`, result)
                }
            }

            const isPayloadUser = payloadDef.base.name === USER_ENTITY


            if (payloadDef.attributives) {
                const attributives =  Attributives.is(payloadDef.attributives) ?
                    new BoolExp<KlassInstance<typeof Attributive, false>>(payloadDef.attributives.content as BoolExpressionRawData<KlassInstance<typeof Attributive, false>>) :
                    BoolExp.atom<KlassInstance<typeof Attributive, false>>(payloadDef.attributives as KlassInstance<typeof Attributive, false>)

                // CAUTION 特别注意，这里不再区分是不是 collection，Attributive 永远是基于整体校验。
                //  如果这里里面嗨哟校验单个，应该用户自己在 Attributive 里面做。

                const handleAttribute = this.createHandleAttributive(
                    isPayloadUser? Attributive : Attributive,
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
    async checkCondition(interactionEvent: InteractionEventArgs) {
        // TODO
        // if (this.interaction.condition ) {
        //     tryEvaluate("interaction condition error", interaction.condition, ...commonArgs)
        // }
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
    async saveEvent(interactionEvent: InteractionEvent) {
        // 为 payload 里面的新数据保存起来
        return await this.system.saveEvent(interactionEvent)
    }
    async savePayload(payload: InteractionEventArgs["payload"]){
        const payloadDefs = this.interaction.payload?.items || []
        const savedPayload: InteractionEventArgs["payload"] = {}
        for(let payloadDef of payloadDefs) {
            const isPayloadUser = payloadDef.base.name === USER_ENTITY
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
    async call(interactionEventArgs: InteractionEventArgs, activityId?: string, checkUserRef?: CheckUserRef): Promise<InteractionCallResponse> {
        const response: InteractionCallResponse = {
            sideEffects: {},
        }

        try {
            await this.checkCondition(interactionEventArgs)
            await this.checkUser(interactionEventArgs, activityId, checkUserRef)
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
                },
                activityId
            }
            await this.saveEvent(event)
            response.event = event
            // effect
            await this.runEffects(interactionEventArgs, activityId, response)
            if (this.isGetInteraction()) {
                await this.retrieveData(interactionEventArgs)
            }
        }

        return response
    }
}
