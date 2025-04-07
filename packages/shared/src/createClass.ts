import {assert, hasOwn, isObject, isPlainObject} from "./utils.js";

type PrimitivePropType = 'string'|'number'|'boolean'| 'object'|'function'|'null'
type DefaultValueType = (...args: any[]) => any
type ComputedValueType = (obj: KlassInstanceOfPublic<any>) => any

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

export function getInstance<T extends Klass<any>>(Type: T): KlassInstanceOfPublic<T["public"]>[]{
    return Type.instances as KlassInstanceOfPublic<T["public"]>[]
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
                            KlassProp<T[Key]["collection"],  KlassInstanceOfPublic<T[Key]['type']['public']>> :
                            T[Key]['type'] extends Klass<any>[] ?
                                KlassProp<T[Key]["collection"], KlassInstanceOfPublic<T[Key]['type'][number]["public"]> & UnknownInstance>:
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
                            KlassProp<T[Key]["collection"],  KlassInstanceOfPublic<T[Key]['type']['public']>> :
                            T[Key]['type'] extends Klass<any>[] ?
                                KlassProp<T[Key]["collection"], KlassInstanceOfPublic<T[Key]['type'][number]["public"]> & UnknownInstance>:
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
export type KlassInstanceProps<T extends NonNullable<KlassMeta["public"]>> = OptionalProps<T, false> & RequiredProps<T, false>
export type KlassInstanceOfPublic<T extends NonNullable<KlassMeta["public"]>> = KlassInstanceProps<T> & KlassInstancePrimitiveProps

export type KlassInstance<T extends Klass<any>> = KlassInstanceOfPublic<T["public"]>

export type Klass<T extends NonNullable<KlassMeta["public"]>> = {
    new(arg: object, options?: KlassOptions): KlassInstanceOfPublic<T>,
    create(arg: KlassInstanceArgs<T>, options?: KlassOptions): KlassInstanceOfPublic<T>,
    displayName: string,
    isKlass: true,
    public: T,
    constraints: KlassMeta['constraints'],
    instances: KlassInstanceOfPublic<T>[],
    display? : KlassMeta['display']
    stringify: (instance: KlassInstanceOfPublic<T>) => string
    parse: () => KlassInstanceOfPublic<T>
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
    const uuidToInstance = new Map<string, KlassInstanceOfPublic<any>>()
    const unsatisfiedInstances = new Map<KlassInstanceOfPublic<any>, object>()
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
        const Klass = instance.constructor as Klass<any>

        Object.entries(unsatisfiedProps).forEach(([rawPropName, uuid]) => {
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

export function stringifyInstance(obj: KlassInstanceOfPublic<any>) {
    const Klass = KlassByName.get(obj._type) as Klass<any>
    return Klass.stringify(obj)
}

export function stringifyAttribute(obj: any) {
    if (typeof obj === 'function') {
        return `func::${obj.toString()}`
    } else if((isObject(obj) && !isPlainObject(obj))) {
        return `uuid::${(obj as KlassInstanceOfPublic<any>).uuid}`
    } else {
        return obj
    }
}

export function rawStructureClone(obj: any, modifier?: (res: any) => any ): typeof obj{
    let result
    if (Array.isArray(obj)) {
      result = obj.map((i: any) => rawStructureClone(i, modifier))
    } else  if (obj instanceof Map) {
      result = new Map(Array.from(obj.entries(), ([key, value]: [string, any]) => [key, rawStructureClone(value, modifier)]))
    } else  if (obj instanceof Set) {
      result = new Set(Array.from(obj.values(), (x: any) => rawStructureClone(x, modifier)))
    } else if (isPlainObject(obj)) {
      result = Object.fromEntries(Object.entries(obj).map(([k,v]: [k: string, v: any]) => [k, rawStructureClone(v, modifier)]))
    } else {
      result = obj
    }
  
    // if (Array.isArray(result)) debugger
    return modifier? modifier(result) : result
  }


export function createClass<T extends KlassMeta>(metadata: T) : Klass<T['public']>{
    if (KlassByName.get(metadata.name)) throw new Error(`Class name must be global unique. ${metadata.name}`)

    function create(fieldValues: KlassInstanceOfPublic<T["public"]>, options?: KlassOptions): KlassInstanceOfPublic<typeof metadata.public> {
        return new KlassClass(deepClone(fieldValues), options) as KlassInstanceOfPublic<typeof metadata.public>;
    }

    function stringify(obj: KlassInstanceOfPublic<(typeof metadata)['public']>) {
        return JSON.stringify({
            type: metadata.name,
            options: obj._options,
            uuid: obj.uuid,
            public: Object.fromEntries(Object.entries(metadata.public).map(([key, propDef]) => {

                // CAUTION 任何 Klass 叶子结点都会被替换成 uuid
                return [key, rawStructureClone(obj[key as keyof typeof obj], stringifyAttribute)]
            })),
        } as KlassRawInstanceDataType)
    }

    function clone(obj: KlassInstanceOfPublic<T['public']>, deepCloneKlass: boolean){
        const arg = Object.fromEntries(Object.keys(metadata.public).map(k => [k, deepClone(obj[k as keyof typeof obj], deepCloneKlass)])) as KlassInstanceOfPublic<T['public']>
        return KlassClass.create(arg)
    }

    function is(obj: any) {
        return obj instanceof KlassClass
    }

    function check(data: KlassInstanceOfPublic<any>) {
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
        public static instances: KlassInstanceOfPublic<T["public"]>[] = []
        public uuid: string
        constructor(arg: KlassRawInstanceDataType["public"], options? :KlassOptions) {
            const self = this as KlassInstanceOfPublic<T["public"]>
            if (metadata.public) {
                Object.entries(metadata.public as T["public"]).forEach(([ propName, propDef]) => {
                    const initialValue = hasOwn(arg, propName) ? arg[propName as unknown as keyof typeof arg] : propDef.defaultValue?.()
                    
                    if (initialValue!==undefined) {
                        self[propName as keyof typeof self] = initialValue
                    }
                    // TODO 要不要再这里就验证？？？
                })
            }

            // computed value
            Object.entries(metadata.public).forEach(([ propName, propDef]: [string, ClassMetaPublicItem]) => {
                if (propDef.computed) {
                    Object.defineProperty(self, propName, {
                        get: () => propDef.computed!(self as KlassInstanceOfPublic<typeof metadata.public>),
                        enumerable: true,
                    })
                }
            })

            this._options = options || {}
            const uuid = this._options?.uuid || crypto.randomUUID()
            assert(!KlassClass.instances.find(i => i.uuid === uuid), `duplicate uuid in options ${this._options?.uuid}, ${metadata.name}`)
            this.uuid = uuid
            KlassClass.instances.push(self)
        }
    }

    KlassByName.set(metadata.name, KlassClass as  Klass<typeof metadata.public>)
    return KlassClass as Klass<typeof metadata.public>
}

export function getUUID(obj: KlassInstanceOfPublic<any>): string {
    return obj.uuid || ''
}

export function getDisplayValue(obj: KlassInstanceOfPublic<any>) {
    return (obj.constructor as Klass<any>).display?.(obj)
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

    if (typeof ((obj as any)?.constructor as Klass<any>)?.isKlass) return deepCloneKlass ? ((obj as KlassInstanceOfPublic<any>)?.constructor as Klass<any>)?.clone(obj as KlassInstanceOfPublic<any>, deepCloneKlass) as T: obj

    // TODO 支持其他类型，例如 Date/RegExp/Error
    throw new Error(`unknown type`)
}

export function removeAllInstance() {
    for( let [, Klass] of KlassByName ) {
        Klass.instances.splice(0, Infinity)
    }
}
