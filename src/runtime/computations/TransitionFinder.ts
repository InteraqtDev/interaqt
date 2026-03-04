import { StateMachineInstance, StateNodeInstance } from "@core";

function deepPartialMatch(event: unknown, pattern: unknown): boolean {
    if (pattern === undefined || pattern === null) return true;
    if (event === pattern) return true;
    
    // If pattern is not an object, do simple equality check
    if (typeof pattern !== 'object' || pattern === null) {
        return event === pattern;
    }
    
    // If event is not an object, it doesn't match the pattern
    if (typeof event !== 'object' || event === null) {
        return false;
    }
    
    const eventObj = event as Record<string, unknown>;
    const patternObj = pattern as Record<string, unknown>;
    for (const key in patternObj) {
        if (!(key in eventObj)) {
            return false;
        }
        if (!deepPartialMatch(eventObj[key], patternObj[key])) {
            return false;
        }
    }
    
    return true;
}


type TransitionEntry = { trigger: unknown; next: StateNodeInstance };

export class TransitionFinder {
    map: {[stateName: string]: TransitionEntry[]} = {}
    constructor(public data: StateMachineInstance) {
        for(const transfer of data.transfers) {
            if(!this.map[transfer.current.name]) {
                this.map[transfer.current.name] = []
            }
            this.map[transfer.current.name].push({
                trigger: transfer.trigger,
                next: transfer.next
            })
        }
    }

    findNextState(currentState: string, event: unknown) {
        const transitions = this.map[currentState]
        if (transitions) {
            for (const transition of transitions) {
                if (deepPartialMatch(event, transition.trigger)) {
                    return transition.next
                }
            }
        }
        return null
    }

    findTransfers(event: unknown) {
        return this.data.transfers.filter(transfer => deepPartialMatch(event, transfer.trigger))
    }
}