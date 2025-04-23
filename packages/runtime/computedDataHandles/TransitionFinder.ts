import { Controller } from "../Controller.js";
import { KlassInstance } from "@interaqt/shared";
import { StateMachine } from "@interaqt/shared";

function shallowEqual(a: {[key:string]:any}, b: {[key:string]:any}) {
    for (const key in b) {
        if (a[key] !== b[key]) {
            return false
        }
    }
    return true
}


export class TransitionFinder {
    map: {[stateName: string]: any} = {}
    constructor(public data: KlassInstance<typeof StateMachine>) {
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

    findNextState(currentState: string, trigger: any) {
        const transitions = this.map[currentState]
        if (transitions) {
            for (const transition of transitions) {
                if (shallowEqual(transition.trigger, trigger)) {
                    return transition.next
                }
            }
        }
        return null
    }

    findTransfer(trigger:any) {
        return this.data.transfers.find(transfer => shallowEqual(transfer.trigger, trigger))
    }
}