import { ScopedSequence, type ScopedSequenceInstance } from "@core";
import { Controller } from "../Controller.js";
import { DataBasedComputation, DataDep, PropertyDataContext } from "./Computation.js";
import { resolveScopedSequenceScope } from "../scopedSequenceScope.js";
import { matchesScopedSequenceRecord, scopedSequenceMatchTopLevelKeys } from "../scopedSequenceMatch.js";

export class PropertyScopedSequenceHandle implements DataBasedComputation {
    static computationType = ScopedSequence
    static contextType = 'property' as const

    useLastValue = false
    dataDeps: { [key: string]: DataDep } = {}
    state = {}

    constructor(public controller: Controller, public args: ScopedSequenceInstance, public dataContext: PropertyDataContext) {
        if (dataContext.id.type !== 'number') {
            throw new Error(`ScopedSequence property ${dataContext.host.name}.${dataContext.id.name} must have type "number"`)
        }
        this.validateMatchInputFields()
        const db = (controller.system.storage as unknown as { db?: { atomicSequenceCapability?: unknown; setupScopedSequenceState?: unknown } }).db
        if (!db?.atomicSequenceCapability || typeof db.setupScopedSequenceState !== 'function') {
            throw new Error(`ScopedSequence is not supported by the current storage driver`)
        }
    }

    private validateMatchInputFields() {
        const propertyName = this.dataContext.id.name
        const keys = new Set([
            ...scopedSequenceMatchTopLevelKeys(this.args.match),
            ...scopedSequenceMatchTopLevelKeys(this.args.initializeFrom?.match),
        ])
        const hostProperties = (this.dataContext.host as { properties?: Array<{ name?: string; computation?: unknown; computed?: unknown }> }).properties || []
        for (const key of keys) {
            if (key === propertyName) {
                throw new Error(`ScopedSequence.match for ${this.dataContext.host.name}.${propertyName} can only read create-time stable input fields and cannot read the target computed property`)
            }
            const property = hostProperties.find(item => item.name === key)
            if (property?.computation || property?.computed) {
                throw new Error(`ScopedSequence.match for ${this.dataContext.host.name}.${propertyName} can only read create-time stable input fields and cannot read computed property "${key}"`)
            }
        }
    }

    async getInitialValue(initialRecord: Record<string, unknown>) {
        const hostName = this.dataContext.host.name
        const propertyName = this.dataContext.id.name
        const existingValue = initialRecord[propertyName]
        if (!matchesScopedSequenceRecord(this.args.match, initialRecord)) {
            return undefined
        }
        if (existingValue !== undefined && !this.args.allowManualValue) {
            throw new Error(`ScopedSequence property ${hostName}.${propertyName} cannot be set manually`)
        }
        if (existingValue !== undefined) {
            if (typeof existingValue !== 'number' || !Number.isFinite(existingValue)) {
                throw new Error(`ScopedSequence property ${hostName}.${propertyName} manual value must be a finite number`)
            }
            return existingValue
        }
        return this.controller.system.storage.atomic.nextSequenceValue({
            sequenceName: this.args.name,
            scope: resolveScopedSequenceScope(this.args.scope, initialRecord),
            initialValue: this.args.initialValue ?? 0,
            step: this.args.step ?? 1,
        })
    }

}

export const ScopedSequenceHandles = [PropertyScopedSequenceHandle]
