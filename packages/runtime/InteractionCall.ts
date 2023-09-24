import {GetAction, InteractionInstanceType} from "../shared/activity/Activity";
import { UserAttributive } from "../shared/user/User";
// import { Entity} from "../shared/entity/Entity";
import {System} from "./System";
import {InteractionEvent, InteractionEventArgs} from "../types/interaction";
import { Concept, ConceptAlias, ConceptInstance, DerivedConcept} from "../shared/attributive";
import {BoolExpression, BoolExpressionData} from "../shared/boolExpression";
import { Attributives, UserAttributiveAtom} from '../shared/attributive'
import {assert, indexBy} from "./util";
import {getInstance} from "../shared/createClass";
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

export class InteractionCall {
    constructor(public interaction: InteractionInstanceType, public system: System, public activitySeqCall?: ActivityCall) {

    }
    checkUserAttributive(attributiveData: UserAttributiveAtom, interactionEvent: InteractionEventArgs) {
        const attributiveName = attributiveData?.key
        const attributiveOptionsByName = indexBy(getInstance(UserAttributive), 'name')
        const attributive = attributiveOptionsByName[attributiveName]
        assert(attributive, `can not find attributive: ${attributiveName}`)
        if (attributive.stringContent) {
            // debugger
            const testFn = new Function('event', `return (${attributive.stringContent})(event)`)

            const result = testFn(interactionEvent)

            if ( result === undefined ) {
                console.warn(`attributive ${attributiveName} returned undefined, maybe not implemented, we will return true for temp`)
                return true
            }
            return result
        }
        console.warn(`${attributiveName} not implemented`)
        return true
    }
    checkMixedAttributive(attributiveData: UserAttributiveAtom, instance: ConceptInstance) {
        // const attributiveByName = indexBy((UserAttributive.instances as any[]).concat(Entity.instances), 'name')
        return true
    }
    checkUser(interactionEvent: InteractionEventArgs) {
        let res: ConceptCheckResponse|true
        if (this.interaction.userRoleAttributive.isRef) {
            // CAUTION 这里让 activity 自己在外部 check
            res = true
        } else {

            let userAttributiveCombined = BoolExpression.createFromAtom<UserAttributiveAtom>({
                key: this.interaction.userRoleAttributive.name as string
            })

            if (this.interaction.userAttributives.content) {
                userAttributiveCombined = userAttributiveCombined.and(this.interaction.userAttributives.content as BoolExpressionData<UserAttributiveAtom>)
            }



            res =  this.checkAttributives(interactionEvent.user, userAttributiveCombined, (attributive: UserAttributiveAtom) => this.checkUserAttributive(attributive, interactionEvent), [])
        }

        if (res === true) return res

        throw new LoginError('check user failed', res)
    }

    checkConcept(instance: ConceptInstance, attributives: Attributives, concept: Concept, stack: ConceptCheckStack[] = []): ConceptCheckResponse {
        const currentStack = stack.concat({type: 'concept', values: {attributives, concept}})

        const conceptRes = this.isConcept(instance, concept, currentStack)
        if (conceptRes !== true) return conceptRes

        const attrMatchRes = this.checkAttributives(instance, new BoolExpression<UserAttributiveAtom>(attributives), (attributiveData) => this.checkMixedAttributive(attributiveData, instance), currentStack)
        if (attrMatchRes !== true) return attrMatchRes

        return true
    }
    isConcept(instance: ConceptInstance, concept: Concept, stack: ConceptCheckStack[] = []): ConceptCheckResponse {
        const currentStack = stack.concat({type: 'isConcept', values: {concept}})

        if (this.isDerivedConcept(concept)) {
            return this.checkConcept(instance, (concept as DerivedConcept).attributive!, (concept as DerivedConcept).base!, currentStack)
        } else if (this.isConceptAlias(concept)) {
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
            // TODO
            return true
        }
    }
    isDerivedConcept(concept: Concept) {
        return !!(concept as DerivedConcept).base
    }
    isConceptAlias(concept: Concept) {
        return !!(concept as ConceptAlias).for
    }
    checkAttributives(instance: ConceptInstance, attributives: BoolExpression<UserAttributiveAtom>, handleAttributive: HandleAttributive, stack: ConceptCheckStack[]) : ConceptCheckResponse{
        const result =  attributives.evaluate(handleAttributive)
        return result === true ? true : {name: '', type: 'matchAttributives', stack, error: result}
    }
    checkPayload(interactionEvent: InteractionEventArgs) {
        // TODO
    }
    checkCondition(interactionEvent: InteractionEventArgs) {
        // TODO
        // if (this.interaction.condition ) {
        //     tryEvaluate("interaction condition error", interaction.condition, ...commonArgs)
        // }
    }
    runEffect() {

    }
    isGetInteraction() {
        return this.interaction.action === GetAction
    }
    saveEvent(interactionEvent: InteractionEvent) {
        this.system.saveEvent(interactionEvent)
    }
    retrieveData(interactionEvent: InteractionEventArgs) {
        // TODO
        // return this.system.storage.get(interactionEvent.payload, interactionEvent.query)
    }
    call(interactionEventArgs: InteractionEventArgs, activityId?): InteractionCallResponse {
        const response: InteractionCallResponse = {
            error: null,
            data: null,
            sideEffects: {}
        }

        const interactionEvent = {
            interactionId: this.interaction.uuid,
            args: interactionEventArgs,
            activityId
        }

        try {
            this.checkCondition(interactionEventArgs)
            this.checkUser(interactionEventArgs)
            this.checkPayload(interactionEventArgs)
        } catch(e) {
            response.error = e
        }

        if (!response.error) {
            // 执行
            this.saveEvent(interactionEvent)
            // effect
            this.runEffect()
            if (this.isGetInteraction()) {
                this.retrieveData(interactionEventArgs)
            }
        }

        return response
    }
}
