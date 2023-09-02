import {System} from "./System";
import { interactionEvent } from '../types/interaction'
import {createClass} from "../shared/createClass";

let id = 0


class Storage {
    data = new Map<string, Map<string, any>>()
    get(conceptName: string, id: string, initialValue?: any) {
        let res = this.data.get(conceptName)!.get(id)
        if (initialValue && !res) this.data.get(conceptName)!.set(id, (res = initialValue))
        return res
    }
    set(conceptName: string, id: string, value:any) {
        let conceptData = this.data.get(conceptName)
        if (!conceptData) this.data.set(conceptName, (conceptData = new Map()))
        conceptData.set(id, value)
    }
}

export class MemorySystem implements System {
    eventStack: interactionEvent[] = []
    conceptClass: Map<string, ReturnType<typeof createClass>> = new Map()
    saveEvent(event: interactionEvent) {
        this.eventStack.push(event)
        return true
    }
    util = {
        uuid() {
            return (++id).toString()
        }
    }
    storage = new Storage()
}
