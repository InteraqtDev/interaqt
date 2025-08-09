import {DatabaseLogger} from "@runtime";

export default class TestLogger implements DatabaseLogger {
    constructor(public type: string = '', public disabled: boolean = false) {
    }
    disable() {
        this.disabled = true
    }
    enable() {
        this.disabled = false
    }
    only(type:string) {
        this.type = type
    }
    all() {
        this.type = ''
    }
    info(arg: { type: string; name: string; sql: string; params?: any[] }) {
        if (this.disabled || this.type && this.type !== arg.type) {
            return
        }
        console.log(`======type: ${arg.type}, name: ${arg.name}========`)
        console.log(arg.sql)
    }

    child(fixed: object): DatabaseLogger {
        return this
    }
    error(arg: { type: string; name: string; sql: string; params?: any[]; error: string }) {
        if (this.disabled || this.type && this.type !== arg.type) {
            return
        }
        console.error(`======type: ${arg.type}, name: ${arg.name}========`)
        console.error(arg.sql)
        console.error(arg.error)
    }
}