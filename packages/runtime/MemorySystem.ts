
import * as crypto from "crypto";


export class MemorySystem implements System {
    state = new Map<string, Map<string, any>>()
    setState(stateName: string, index: string, nextState: any) {
        let stateMap = this.state.get(stateName)
        if (!stateMap) this.state.set(stateName, (stateMap = new Map<string, any>))

        stateMap.set(index, nextState)
    }
    getState(stateName: string, index: string){
        return this.state.get(stateName)!.get(index)
    }

    stack = {
        stackHistory: new Map<string, Event>(),
        activityStack: new Map<string, ActivityEvent>(),
        saveInteractionEvent(event: Event) {
            this.stackHistory.set(event.id ,event)
        },
        saveActivityEvent(id: string, interactionIndex: string[], event: Event) {
            let activityEvent = this.activityStack.get(id)
            if (!activityEvent) this.activityStack.set(id, (activityEvent = {}))
            let base = activityEvent
            const path = interactionIndex.slice(0, interactionIndex.length -1)
            for(let interactionName of path) {
                if (!base[interactionName]) {
                    base[interactionName] = {}
                }
                base = base[interactionName]
            }
            base[interactionIndex.at(-1)!] = event
        }
    }
    storage = {
        get(concept: ConceptType, attributives: BoolExpression[], queryArg?: QueryArg) {

        },
        set(concept: ConceptType, item: any) {

        }
    }
    util = {
        uuid() {
            return crypto.randomUUID()
        }
    }
}
