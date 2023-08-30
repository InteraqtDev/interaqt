import {System} from "./System";
import { interactionEvent } from '../types/interaction'
import {createClass} from "../shared/createClass";

let id = 0

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
}
