import { StateMachineInstance } from "@shared";

// Deep partial matching function for RecordMutationEvent patterns
function deepPartialMatch(event: any, pattern: any): boolean {
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
    
    // Check all properties in the pattern
    for (const key in pattern) {
        if (!(key in event)) {
            return false;
        }
        
        // Recursively check nested objects
        if (!deepPartialMatch(event[key], pattern[key])) {
            return false;
        }
    }
    
    return true;
}


export class TransitionFinder {
    map: {[stateName: string]: any} = {}
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

    findNextState(currentState: string, event: any) {
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

    findTransfers(event: any) {
        return this.data.transfers.filter(transfer => deepPartialMatch(event, transfer.trigger))
    }
}