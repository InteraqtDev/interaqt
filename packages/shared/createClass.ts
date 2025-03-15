import {assert, hasOwn, isObject, isPlainObject} from "./utils.js";

type PrimitivePropType = 'string'|'number'|'boolean'| 'object'|'function'|'null'
type DefaultValueType = (...args: any[]) => any
type ComputedValueType = (obj: KlassInstance<any>) => any

type ClassPropType = {
    type?: Klass<any>|Klass<any>[]|PrimitivePropType|PrimitivePropType[],
    // 用来接触循环引用的
    instanceType?: Object,
    options? : any[] | ((thisProp: any, thisEntity: object) => any[])
    constraints?: {
        [ruleName: string] : ((thisProp: any, thisEntity: object) => boolean|any[]) | Function | string
    }
}

export type RequireWithoutDefaultAndComputed<T extends ClassMetaPublicItem, IS_ARG extends true|false> =
    IS_ARG extends true ?
        (T["defaultValue"] extends DefaultValueType? false: T["computed"] extends ComputedValueType? false:  T["required"] extends true  ? true : false) :
        (T["defaultValue"] extends DefaultValueType? true:  T["computed"] extends ComputedValueType? true: T["required"] extends true  ? true : false)

type ClassMetaPublicItem = ClassPropType & {
    collection?: true|false,
    computed?: ComputedValueType,
    defaultValue?:DefaultValueType,
    required?: true|false,
}

export type KlassMeta = {
    name: string,
    display? : (obj:any) => string,
    constraints?: {
        [ruleName: string] : (thisInstance: object, allInstance: object[]) => boolean
    }

    public: {
        [key: string]: ClassMetaPublicItem
    }
    // 检测一个实例是不是 Class，用户可以自定义规则，如果没有自定义就会用 instanceof
    is? : (obj: any) => boolean
    // TODO 完成 Private 等等其他
}

export function getInstance<T extends Klass<any>>(Type: T): KlassInstance<T>[]{
    return Type.instances as KlassInstance<T>[]
}

interface PrimitivePropertyMap {
    string: string
    number: number
    boolean: boolean
    object: object
    null: null
    function: (...arg: any[]) => any
}

export type KlassInstancePrimitiveProps = {
    uuid: string,
    _options: KlassOptions,
    _type: string
}

type OmitNever<T> = Omit<T, { [K in keyof T]: T[K] extends never ? K : never }[keyof T]>

export type UnwrapCollectionType<T extends Klass<any>[]> = {
    [Key in keyof T]: T[Key]["public"]
}[keyof T][number]

export type KlassProp<COLLECTION extends true|false|undefined, T> = 
    COLLECTION extends true ? T[] : T

type ExtractPrimitiveTypes<COLLECTION extends true|false|undefined, T extends PrimitivePropType[] > =
    T extends Array<infer SUB_KLASS> ?
        SUB_KLASS extends PrimitivePropType ?
            KlassProp<COLLECTION, PrimitivePropertyMap[SUB_KLASS]> : never : never

export type RequiredProps<T extends NonNullable<KlassMeta["public"]>, IS_ARG extends true|false> = OmitNever<{
    [Key in keyof T]:
        RequireWithoutDefaultAndComputed<T[Key], IS_ARG> extends true ?
            (
                // 这个类型是用来解决循环引用的
                T[Key]["instanceType"] extends Object?
                    KlassProp<T[Key]["collection"],  T[Key]["instanceType"]>:
                    (
                        T[Key]['type'] extends Klass<any> ?
                            KlassProp<T[Key]["collection"],  InertKlassInstance<T[Key]['type']['public']>> :
                            T[Key]['type'] extends Klass<any>[] ?
                                KlassProp<T[Key]["collection"], KlassInstance<Klass<any>> & UnknownInstance>:
                                T[Key]['type'] extends PrimitivePropType ?
                                    KlassProp<T[Key]["collection"],  PrimitivePropertyMap[T[Key]['type']]> :
                                        T[Key]['type'] extends PrimitivePropType[] ?
                                            ExtractPrimitiveTypes<T[Key]["collection"],  T[Key]['type']> :
                                            never
                    )
            ):
            never
}>

type UnknownInstance ={ [key: string]: any}

export type OptionalProps<T extends NonNullable<KlassMeta["public"]>, IS_ARG  extends true|false> = Partial<OmitNever<{
    [Key in keyof T]:
        RequireWithoutDefaultAndComputed<T[Key], IS_ARG> extends true ?
            never:
            (
                // 这个类型是用来解决循环引用的
                T[Key]["instanceType"] extends Object ?
                    KlassProp<T[Key]["collection"],  T[Key]["instanceType"]>:
                    (
                        T[Key]['type'] extends Klass<any> ?
                            KlassProp<T[Key]["collection"],  InertKlassInstance<T[Key]['type']['public']>> :
                            T[Key]['type'] extends Klass<any>[] ?
                                KlassProp<T[Key]["collection"], KlassInstance<Klass<any>> & UnknownInstance>:
                                T[Key]['type'] extends PrimitivePropType ?
                                    KlassProp<T[Key]["collection"],  PrimitivePropertyMap[T[Key]['type']]> :
                                    T[Key]['type'] extends PrimitivePropType[] ?
                                        ExtractPrimitiveTypes<T[Key]["collection"],  T[Key]['type']> :
                                        never
                    )
            )
}>>

// 参数和返回值是两码事
//  参数是有 required 但是没有 defaultValue 的就必填
//  返回值是有 required 或者有 defaultValue 的就必有
export type KlassInstanceArgs<T extends NonNullable<KlassMeta["public"]>> = OptionalProps<T, true> & RequiredProps<T, true>
export type InertKlassInstanceProps<T extends NonNullable<KlassMeta["public"]>> = OptionalProps<T, false> & RequiredProps<T, false>
export type InertKlassInstance<T extends NonNullable<KlassMeta["public"]>> = InertKlassInstanceProps<T> & KlassInstancePrimitiveProps

export type KlassInstance<T extends Klass<any>> = InertKlassInstance<T["public"]>

export type Klass<T extends NonNullable<KlassMeta["public"]>> = {
    new(arg: object, options?: KlassOptions): InertKlassInstance<T>,
    create(arg: KlassInstanceArgs<T>, options?: KlassOptions): InertKlassInstance<T>,
    displayName: string,
    isKlass: true,
    public: T,
    constraints: KlassMeta['constraints'],
    instances: KlassInstance<Klass<T>>[],
    display? : KlassMeta['display']
    stringify: (instance: InertKlassInstance<T>) => string
    parse: () => InertKlassInstance<T>
    check: (data: object) => boolean
    is: (arg: any) => boolean
    clone: <V>(obj: V, deep: boolean) => V
}

export type KlassOptions = {
    uuid?: string,
}

type KlassRawInstanceDataType = {
    type: string,
    uuid: string,
    options?: KlassOptions,
    public: KlassInstanceArgs<any>
}

export const KlassByName = new Map<string, Klass<any>>()

// 遍历两次，建立所有关系。第一次把非对象值建立起来。第二次把那些引用的 uuid 的值替换出来。
export function createInstancesFromString(objStr: string) {
    const objects = JSON.parse(objStr)
    return createInstances(objects)
}

function parseInstanceProp(propValue: string, propType: string, propName: string) {
    const propValueType = (propValue as string).slice(0, 6)
    const propValueStr = (propValue as string).slice(6, Infinity)
    if( propValueType === 'func::') {
        assert(propType === 'function', `prop ${propName} should be ${propType}, but got ${propValue}`)
        return {
            type: 'function',
            value: (new Function(`return (${propValueStr})`))()
        }
    } else if(propValueType === 'uuid::'){
        // uuid 的情况
        return {
            type: 'uuid',
            value: propValueStr
        }
    } else {
        throw new Error(`unknown data type ${propValueType}`)
    }
}

export function createInstances(objects: KlassRawInstanceDataType[]) {
    const uuidToInstance = new Map<string, InertKlassInstance<any>>()
    const unsatisfiedInstances = new Map<InertKlassInstance<any>, object>()
    objects.forEach(({ type, options = {}, uuid, public: rawProps } :KlassRawInstanceDataType) => {
        assert(!uuidToInstance.get(uuid), `duplicate uuid ${uuid}, ${type}, ${JSON.stringify(rawProps)}`)
        const Klass = KlassByName.get(type)!
        const optionsWithUUID: KlassOptions = {...options, uuid}
        
        // 根据
        const publicProps:{[k:string]: any} = {}
        const unsatisfiedProps: {[k:string]: any} = {}
        Object.entries(rawProps || {}).forEach(([propName, propValue]) => {
            const propDef = Klass.public[propName];
            if (!propDef) {
                console.warn(`Property ${propName} not defined in class ${type}`);
                return;
            }
            
            const propType = propDef.type

            // Check if it's a function string
            if (typeof propValue === 'string' && (propValue as string).startsWith('func::') && propType === 'function') {
                try {
                    const funcStr = (propValue as string).slice(6);
                    publicProps[propName] = (new Function(`return ${funcStr}`))();
                } catch (e) {
                    console.error(`Error parsing function for ${propName}:`, e);
                    publicProps[propName] = function() { return null; };
                }
                return;
            }

            const hasStringValue = typeof propValue === 'string' || 
                (Array.isArray(propValue) && (propValue as any[]).some(i => typeof i === 'string'))
                
            // 不应该是 string 类型，但是却是 string 类型的情况，说名是被序列化了。
            if (propType !== 'string' && hasStringValue) {
                if(Array.isArray(propValue)) {
                    publicProps[propName] = [] as any[]

                    (propValue as any[]).forEach((propValueItem, index) => {
                        if (typeof propValueItem === 'string') {
                            try {
                                const { type, value } = parseInstanceProp(propValueItem, propType, propName)
                                publicProps[propName][index] = value
                                if (type === 'uuid') {
                                    unsatisfiedProps[`${propName}.${index}`] = value
                                }
                            } catch (e) {
                                console.error(`Error parsing property ${propName}[${index}]:`, e);
                                publicProps[propName][index] = null;
                            }
                        } else {
                            publicProps[propName][index] = propValueItem
                        }
                    })
                } else {
                    try {
                        const { type, value } = parseInstanceProp(propValue, propType, propName)
                        publicProps[propName] = value
                        if (type === 'uuid') {
                            unsatisfiedProps[propName] = value
                        }
                    } catch (e) {
                        console.error(`Error parsing property ${propName}:`, e);
                        publicProps[propName] = null;
                    }
                }
            } else {
                publicProps[propName] = propValue
            }
        })

        const instance = new Klass(publicProps, optionsWithUUID)
        uuidToInstance.set(uuid, instance)

        if (Object.keys(unsatisfiedProps).length) {
            unsatisfiedInstances.set(instance, unsatisfiedProps)
        }
    })

    for(let [instance, unsatisfiedProps] of unsatisfiedInstances) {
        Object.entries(unsatisfiedProps).forEach(([rawPropName, uuid]) => {
            const Klass = instance.constructor as Klass<any>
            const [propNameStr, indexStr] = rawPropName.split('.')
            const propName = propNameStr as keyof typeof instance
            const isCollection = Klass.public[propName].collection

            const ref = uuidToInstance.get(uuid)!
            assert(!!ref, `can not find instance ${uuid} for ${instance.constructor.name}.${propName as string}`)

            if (isCollection) {
                (instance[propName]! as any[])[parseInt(indexStr, 10)] = ref
            } else {
                // @ts-ignore
                instance[propName] = ref
            }
        })
    }

    return uuidToInstance
}

export function stringifyAllInstances() {
    const result = []
    for( let [, Klass] of KlassByName ) {
        result.push(...Klass.instances.map(instance => Klass.stringify(instance)))
    }
    return `[${result.join(',')}]`
}

export function stringifyInstance(obj: InertKlassInstance<any>) {
    const Klass = KlassByName.get(obj._type) as Klass<any>
    return Klass.stringify(obj)
}

export function stringifyAttribute(obj: any) {
    if (typeof obj === 'function') {
        return `func::${obj.toString()}`
    } else if((isObject(obj) && !isPlainObject(obj))) {
        return `uuid::${(obj as InertKlassInstance<any>).uuid}`
    } else {
        return obj
    }
}

export function createClass<T extends KlassMeta>(metadata: T) : Klass<T['public']>{
    if (KlassByName.get(metadata.name)) throw new Error(`Class name must be global unique. ${metadata.name}`)

    function create(fieldValues: InertKlassInstance<T["public"]>, options?: KlassOptions): InertKlassInstance<typeof metadata.public> {
        return new KlassClass(structureClone(fieldValues), options) as unknown as InertKlassInstance<typeof metadata.public>;
    }

    function stringify(obj: InertKlassInstance<(typeof metadata)['public']>) {
        try {
            const publicProps: Record<string, any> = {};
            
            // Process each property separately to handle functions correctly
            for (const [key, propDef] of Object.entries(metadata.public)) {
                try {
                    const propValue = obj[key as keyof typeof obj];
                    
                    // Special handling for functions
                    if (typeof propValue === 'function' && propDef.type === 'function') {
                        publicProps[key] = `func::${propValue.toString()}`;
                    } else if (isObject(propValue) && !isPlainObject(propValue) && propValue !== null) {
                        // Handle reference to another instance
                        try {
                            publicProps[key] = `uuid::${(propValue as InertKlassInstance<any>).uuid}`;
                        } catch (e) {
                            console.error(`Error getting UUID for property ${key}:`, e);
                            publicProps[key] = null;
                        }
                    } else {
                        // Handle regular values
                        publicProps[key] = propValue;
                    }
                } catch (e) {
                    console.error(`Error stringifying property ${key}:`, e);
                    publicProps[key] = null;
                }
            }
            
            return JSON.stringify({
                type: metadata.name,
                options: obj._options,
                uuid: obj.uuid,
                public: publicProps
            } as KlassRawInstanceDataType);
        } catch (e) {
            console.error("Error in stringify:", e);
            return JSON.stringify({
                type: metadata.name,
                options: obj._options,
                uuid: obj.uuid,
                public: {}
            });
        }
    }

    function clone(obj: InertKlassInstance<T['public']>, deepCloneKlass: boolean){
        const arg = Object.fromEntries(Object.keys(metadata.public).map(k => [k, deepClone(obj[k as keyof typeof obj], deepCloneKlass)])) as InertKlassInstance<T['public']>
        return KlassClass.create(arg)
    }

    function is(obj: any) {
        return obj instanceof KlassClass
    }

    function check(data: InertKlassInstance<any>) {
        // TODO 要check 到底有没有
        if (data.uuid) return true
        // TODO check data is valid or not
        return true
    }

    class KlassClass {
        static create = create
        static stringify = stringify
        static is = metadata.is || is
        static clone = clone
        static check = check
        static isKlass = true
        public _options?: KlassOptions
        public _type = metadata.name
        public static displayName = metadata.name
        public static public = metadata.public
        public static constraints = metadata.constraints
        public static display = metadata.display
        public static instances: InertKlassInstance<typeof metadata.public>[] = []
        public uuid: string
        constructor(arg: KlassRawInstanceDataType["public"], options? :KlassOptions) {
            const self = this as unknown as InertKlassInstance<typeof metadata.public>

            if (metadata.public) {
                Object.entries(metadata.public).forEach(([ propName, propDef]: [string, ClassMetaPublicItem]) => {
                    const initialValue = hasOwn(arg, propName) ? arg[propName as unknown as keyof typeof arg] : propDef.defaultValue?.()
                    
                    if (initialValue!==undefined) {
                        // @ts-ignore
                        self[propName] = initialValue
                    }
                    // TODO 要不要再这里就验证？？？
                })
            }

            // computed value
            Object.entries(metadata.public).forEach(([ propName, propDef]: [string, ClassMetaPublicItem]) => {
                if (propDef.computed) {
                    Object.defineProperty(self, propName, {
                        get: () => propDef.computed!(self),
                        enumerable: true,
                    })
                }
            })

            this._options = options
            this.uuid = this._options?.uuid || crypto.randomUUID()
            KlassClass.instances.push(self)
        }
    }

    KlassByName.set(metadata.name, KlassClass as unknown as Klass<typeof metadata.public>)
    return KlassClass as unknown as Klass<typeof metadata.public>
}

export function getUUID(obj: InertKlassInstance<any>): string {
    return obj.uuid || ''
}

export function getDisplayValue(obj: InertKlassInstance<any>) {
    return (obj.constructor as Klass<any>).display?.(obj)
}

// Helper function to replace rawStructureClone from data0
function structureClone<T>(obj: T, replacer?: (value: any) => any): T {
    if (replacer) {
        return JSON.parse(JSON.stringify(obj, (key, value) => {
            return replacer(value);
        }));
    }
    
    // Use try-catch to safely check for structureClone
    try {
        // @ts-ignore - structureClone might not be recognized in all TS versions
        if (typeof structureClone === 'function') {
            // @ts-ignore
            return structureClone(obj);
        }
    } catch (e) {
        // Function not available, fall through to JSON method
    }
    
    // Fallback to JSON serialization
    return JSON.parse(JSON.stringify(obj));
}

export function deepClone<T>(obj: T, deepCloneKlass?: boolean): T{
    if (obj === undefined || obj === null || typeof obj !== 'object') return obj
    if (Array.isArray(obj)) return (obj as any[]).map(v => deepClone(v)) as T
    if (isPlainObject(obj)) {
        return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, deepClone(value)])) as T
    }

    if ((obj as object) instanceof Set) {
        return new Set(Array.from((obj as Set<any>).values()).map(v => deepClone(v))) as T
    }

    if ((obj as object) instanceof Map) {
        return new Map(Array.from((obj as Map<any, any>).entries()).map(([k, v]) => [k, deepClone(v)])) as T
    }

    // @ts-ignore
    if (typeof obj?.constructor?.isKlass) return deepCloneKlass ? ((obj as InertKlassInstance<any>)?.constructor as Klass<any>)?.clone(obj as InertKlassInstance<any>, deepCloneKlass) as T: obj

    // TODO 支持其他类型，例如 Date/RegExp/Error
    throw new Error(`unknown type`)
}

export function removeAllInstance() {
    for( let [, Klass] of KlassByName ) {
        Klass.instances.splice(0, Infinity)
    }
}
