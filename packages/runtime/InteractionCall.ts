import {GetAction, Interaction as InteractionClass} from "../shared/activity/Activity";
import { UserAttributive } from "../shared/user/User";
// import { Entity} from "../shared/entity/Entity";
import {System} from "./System";
import {interactionEvent, InteractionEventArgs} from "../types/interaction";
import {Attributives, Concept, ConceptAlias, ConceptInstance, DerivedConcept} from "../types/attributive";
import {BoolExpressionEvaluator} from "./boolExpression";
import {BoolExpression, BoolExpressionNodeTypes, OperatorNames} from "../types/boolExpression";
import {assert, indexBy} from "./util";
import {getInstance} from "../shared/createClass";


type Interaction = InstanceType<typeof InteractionClass>

function evaluate(expression: string, ...args: any[]) {
    const fn = new Function(expression)
    return fn(...args)
}


type ConceptCheckStack = {
    type: string,
    values: {
        [k: string]: any
    }
}

type HandleAttributive = (attributiveName: string) => boolean

type ConceptCheckResponse = AtomError |true

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


export class InteractionCall {
    constructor(public interaction: Interaction, public system: System) {

    }
    // TODO e pression 要改
    tryEvaluate(message: any, expression: string, ...args: any[]) {
        const result = evaluate(expression, ...args)
        if (!result) throw message
    }
    handleUserAttributive(attributiveName: string, interactionEvent: InteractionEventArgs) {
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
    handleMixedAttributive(attributiveName: string, instance: ConceptInstance) {
        // const attributiveByName = indexBy((UserAttributive.instances as any[]).concat(Entity.instances), 'name')
        return true
    }
    checkUser(interactionEvent: InteractionEventArgs) {
        // TODO
        // @ts-ignore
        const userAttributiveCombined: BoolExpression= {
            type: BoolExpressionNodeTypes.group,
            left: {
                type: BoolExpressionNodeTypes.variable,
                name:this.interaction.userRoleAttributive.name
            },
            op: OperatorNames['&&'],
            right: this.interaction.userAttributives.content as BoolExpression
        }

        const res =  this.matchAttributives(interactionEvent.user, userAttributiveCombined, (attributiveName: string) => this.handleUserAttributive(attributiveName, interactionEvent), [])
        if (res === true) return res
        throw new LoginError('role', res)
    }

    checkConcept(instance: ConceptInstance, attributives: Attributives, concept: Concept, stack: ConceptCheckStack[] = []): ConceptCheckResponse {
        const currentStack = stack.concat({type: 'concept', values: {attributives, concept}})

        const conceptRes = this.isConcept(instance, concept, currentStack)
        if (conceptRes !== true) return conceptRes

        const attrMatchRes = this.matchAttributives(instance, attributives, (attributiveName) => this.handleMixedAttributive(attributiveName, instance), currentStack)
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
    matchAttributives(instance: ConceptInstance, attributives: Attributives, handleAttributive: HandleAttributive, stack: ConceptCheckStack[]) : ConceptCheckResponse{
        const roleAttributiveExpression = new BoolExpressionEvaluator(attributives, handleAttributive)
        const result =  roleAttributiveExpression.evaluate()
        return result === true ? result : {name: '', type: 'matchAttributives', stack, error: result}
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
    saveEvent(interactionEvent: interactionEvent) {
        this.system.saveEvent(interactionEvent)
    }
    retrieveData(interactionEvent: InteractionEventArgs) {
        // TODO
        // return this.system.storage.get(interactionEvent.payload, interactionEvent.query)
    }
    call(interactionEventArgs: InteractionEventArgs) {
        const response: any = {
            error: null,
            data: null,
            sideEffects: {}
        }

        const interactionEvent = {
            interactionId: this.interaction.uuid,
            args: interactionEventArgs
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
