import {atom, Atom, computed, isAtom, isReactive, rawStructureClone, reactive} from "data0";
import {isPlainObject, hasOwn, isObject, assert} from "./utils.js";
import {toRaw, UnwrapReactive} from "rata";

type PrimitivePropType = 'string'|'number'|'boolean'| 'object'|'function'
type DefaultValueType = (...args: any[]) => any
// FIXME return type 应该是个 Prop ?
type ComputedValueType = (obj: KlassInstance<any, any>) => any

type ClassPropType = {
    type?: Klass<any>|Klass<any>[]|PrimitivePropType,
    // 用来接触循环引用的
    instanceType?: Object,
    // FIXME 有用吗？
    reactiveInstanceType?: KlassInstance<any, true>,
    // FIXME 去掉
    computedType?: (...arg: any[]) => string|Function,
    options? : any[] | ((thisProp: any, thisEntity: object) => any[])
    constraints?: {
        [ruleName: string] : ((thisProp: any, thisEntity: object) => Atom<boolean>|boolean|any[]) | Function | string
    }
}

type OptionalRequiredType<T> = T&{required?:false} | T& { required: true}
type OptionalDefaultValueType<T> = T&{defaultValue?: undefined} | T& { defaultValue: DefaultValueType}
type OptionalComputedValueType<T> = T&{computed?: undefined} | T& { computed: ComputedValueType}
type OptionalCollectionType<T> = T&{collection?: false} | T& { collection: true}
// arg 是有 required 并且一定没有 defaultValue并且一定没有 computed 才有
// prop 是有 required 或者有 defaultValue 或者有 computed 就必有
// FIXME 还要判断有没有 defaultValue 和 computed value

export type RequireWithoutDefaultAndComputed<T extends ClassMetaPublicItem, IS_ARG extends true|false> =
    IS_ARG extends true ?
        (T["defaultValue"] extends DefaultValueType? false: T["computed"] extends ComputedValueType? false:  T["required"] extends true  ? true : false) :
        (T["defaultValue"] extends DefaultValueType? true:  T["computed"] extends ComputedValueType? true: T["required"] extends true  ? true : false)


type ClassMetaPublicItem = OptionalComputedValueType<OptionalRequiredType<OptionalDefaultValueType<OptionalCollectionType<ClassPropType>>>>

export type KlassMeta = {
    name: string,
    display? : (obj:any) => string,
    constraints?: {
        [ruleName: string] : (thisInstance: object, allInstance: object[]) => Atom<boolean>|boolean
    }

    public: {
        [key: string]: ClassMetaPublicItem
    }
    // 检测一个实例是不是 Class，用户可以自定义规则，如果没有自定义就会用 instanceof
    is? : (obj: any) => boolean
    // TODO 完成 Private 等等其他
}


export function getInstance<T extends Klass<any>>(Type: T): KlassInstance<T, any >[]{
    return Type.instances as  KlassInstance<T, any >[]
}

interface PrimitivePropertyMap {
    string: string
    number: number
    boolean: boolean
    object: object
    function: (...arg: any[]) => any
}

export type KlassInstancePrimitiveProps = {
    uuid: string,
    _options: KlassOptions,
    _type: string
}


export type KlassProp<REACTIVE extends boolean, COLLECTION extends true|false|undefined, T> = IfReactiveCollectionProp<REACTIVE, COLLECTION, T>

type IfReactiveCollectionProp<REACTIVE extends boolean, COLLECTION extends true|false|undefined, T> = REACTIVE extends true ?
    (
        COLLECTION extends true ?
            UnwrapReactive<T[]>:
            Atom<T>)
    :(
        COLLECTION extends true ?
            T[]:
            T
        )


type OmitNever<T> = Omit<T, { [K in keyof T]: T[K] extends never ? K : never }[keyof T]>

export type UnwrapCollectionType<T extends Klass<any>[]> = {
    [Key in keyof T]: T[Key]["public"]
}[keyof T][number]

type ExtractKlassTypes<REACTIVE extends boolean, COLLECTION extends true|false|undefined, T extends Klass<any>[] > =
    T extends Array<infer SUB_KLASS> ?
        SUB_KLASS extends Klass<any> ?
            KlassProp<REACTIVE, COLLECTION,InertKlassInstance<SUB_KLASS["public"]>> : never : never

export type RequiredProps<T extends NonNullable<KlassMeta["public"]>, REACTIVE extends true|false, IS_ARG extends true|false> = OmitNever<{
    [Key in keyof T]:
        RequireWithoutDefaultAndComputed<T[Key], IS_ARG> extends true ?
            (
                // 这个类型是用来解决循环引用的
                T[Key]["instanceType"] extends Object?
                    KlassProp<REACTIVE, T[Key]["collection"],  T[Key]["instanceType"]>:
                    (
                        T[Key]['type'] extends Klass<any> ?
                            KlassProp<REACTIVE, T[Key]["collection"],  InertKlassInstance<T[Key]['type']['public']>> :
                            T[Key]['type'] extends Klass<any>[] ?
                                ExtractKlassTypes<REACTIVE, T[Key]["collection"], T[Key]['type']>:
                                T[Key]['type'] extends PrimitivePropType ?
                                    KlassProp<REACTIVE, T[Key]["collection"],  PrimitivePropertyMap[T[Key]['type']]> :
                                    never
                    )
            ):
            never
}>


export type OptionalProps<T extends NonNullable<KlassMeta["public"]>, REACTIVE extends true|false, IS_ARG  extends true|false> = Partial<OmitNever<{
    [Key in keyof T]:
        RequireWithoutDefaultAndComputed<T[Key], IS_ARG> extends true ?
            never:
            (
                // 这个类型是用来解决循环引用的
                T[Key]["instanceType"] extends Object ?
                    KlassProp<REACTIVE, T[Key]["collection"],  T[Key]["instanceType"]>:
                    (
                        T[Key]['type'] extends Klass<any> ?
                            KlassProp<REACTIVE, T[Key]["collection"],  InertKlassInstance<T[Key]['type']['public']>> :
                            T[Key]['type'] extends Klass<any>[] ?
                                ExtractKlassTypes<REACTIVE, T[Key]["collection"], T[Key]['type']>:
                                T[Key]['type'] extends PrimitivePropType ?
                                    KlassProp<REACTIVE, T[Key]["collection"],  PrimitivePropertyMap[T[Key]['type']]> :
                                    never
                    )
            )
}>>


// 参数和返回值是两码事
//  参数是有 required 但是没有 defaultValue 的就必填
//  返回值是有 required 或者有 defaultValue 的就必有
export type KlassInstanceArgs<T extends NonNullable<KlassMeta["public"]>> = OptionalProps<T, false, true> & RequiredProps<T,false, true>
export type InertKlassInstanceProps<T extends NonNullable<KlassMeta["public"]>> = OptionalProps<T, false, false> & RequiredProps<T, false, false>
export type InertKlassInstance<T extends NonNullable<KlassMeta["public"]>> = InertKlassInstanceProps<T> & KlassInstancePrimitiveProps

export type ReactiveKlassInstanceProps<T extends NonNullable<KlassMeta["public"]>> = OptionalProps<T, true, false> & RequiredProps<T, true, false>
export type ReactiveKlassInstance<T extends NonNullable<KlassMeta["public"]>> = ReactiveKlassInstanceProps<T> &  KlassInstancePrimitiveProps

export type Klass<T extends NonNullable<KlassMeta["public"]>> = {
    new<U extends KlassOptions|ReactiveKlassOptions>(arg: object, options?: U) : U extends ReactiveKlassOptions ? ReactiveKlassInstance<T> : InertKlassInstance<T>,
    create: (arg: KlassInstanceArgs<T>, options?: KlassOptions) => InertKlassInstance<T>,
    createReactive: (arg: KlassInstanceArgs<T>, options?: KlassOptions) => ReactiveKlassInstance<T>,
    displayName: string,
    isKlass: true,
    public: T,
    constraints: KlassMeta['constraints'],
    instances: KlassInstance<Klass<T>, any>[],
    display? : KlassMeta['display']
    stringify: (instance: InertKlassInstance<T>|ReactiveKlassInstance<T>) => string
    parse: () => InertKlassInstance<T>
    check: (data: object) => boolean
    is: (arg: any) => boolean
    clone: <V>(obj: V, deep: boolean) => V
}

export type KlassOptions = {
    isReactive?: false,
    uuid?: string,
}

export type ReactiveKlassOptions = Omit<KlassOptions, 'isReactive'> &{
    isReactive: true
}

type KlassRawInstanceDataType = {
    type: string,
    uuid: string,
    options?: KlassOptions|ReactiveKlassOptions,
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


export function createInstances(objects: KlassRawInstanceDataType[], reactiveForce?: boolean) {
    const uuidToInstance = new Map<string, InertKlassInstance<any>|ReactiveKlassInstance<any>>()
    const unsatisfiedInstances = new Map<InertKlassInstance<any>|ReactiveKlassInstance<any>, object>()
    objects.forEach(({ type, options = {}, uuid, public: rawProps } :KlassRawInstanceDataType) => {
        assert(!uuidToInstance.get(uuid), `duplicate uuid ${uuid}, ${type}, ${JSON.stringify(rawProps)}`)
        const Klass = KlassByName.get(type)!
        const optionsWithUUID: ReactiveKlassOptions|KlassOptions = {...options, uuid}
        if (reactiveForce !== undefined) {
            // @ts-ignore
            optionsWithUUID.isReactive = reactiveForce
        }
        // 根据
        const publicProps:{[k:string]: any} = {}
        const unsatisfiedProps: {[k:string]: any} = {}
        Object.entries(rawProps).forEach(([propName, propValue]) => {

            const propType = Klass.public[propName].type

            const hasStringValue =  (typeof propValue === 'string'|| Array.isArray(propValue) && (propValue as any[]).some(i => typeof i === 'string'))
            // 不应该是 string 类型，但是却是 string 类型的情况，说名是被序列化了。
            if (propType !== 'string' && hasStringValue) {
                if(Array.isArray(propValue)) {
                    publicProps[propName] = [] as any[]

                    (propValue as any[]).forEach((propValueItem, index) => {
                        if (typeof propValueItem === 'string') {
                            const { type, value } = parseInstanceProp(propValueItem, propType, propName)
                            publicProps[propName][index] = value
                            if (type === 'uuid') {
                                unsatisfiedProps[`${propName}.${index}`] = value
                            }
                        } else {
                            publicProps[propName][index] = propValueItem
                        }
                    })
                } else {
                    const { type, value } = parseInstanceProp(propValue, propType, propName)
                    publicProps[propName] = value
                    if (type === 'uuid') {
                        unsatisfiedProps[propName] = value
                    }
                }
            } else {
                publicProps[propName] = propValue
            }

            if (propName === 'transfers' && typeof propValue == 'string' && /^uuid/.test(propValue)  ) debugger
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

            // CAUTION 这里如果是 reactive 的默认一定有 reactive 的值。那么用 reactive 的方式
            const  ref = uuidToInstance.get(uuid)!
            assert(!!ref, `can not find instance ${uuid} for ${instance.constructor.name}.${propName as string}`)

            if (isCollection) {
                (instance[propName]! as any[])[parseInt(indexStr, 10)] = ref
            } else {
                if (instance._options.isReactive) {
                    (instance[propName] as Atom)(ref)
                } else {
                    // @ts-ignore
                    instance[propName] = ref
                }
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

// FIXME 增加类型提示
//  之前测试数据也都要改成这种格式
export function stringifyAttribute(obj: any) {
    if (typeof obj === 'function') {
        return `func::${obj.toString()}`
        // return `${obj.toString()}`
    } else if((isObject(obj) && !isPlainObject(obj))) {
        return `uuid::${(obj as InertKlassInstance<any>).uuid}`
        // return `${(obj as InertKlassInstance<any>).uuid}`
    } else {
        return obj
    }
}
export function createClass<T extends KlassMeta>(metadata: T) : Klass<T['public']>{
// export function createClass(def){

    if (KlassByName.get(metadata.name)) throw new Error(`Class name must be global unique. ${metadata.name}`)

    function create(fieldValues: InertKlassInstance<T["public"]>, options?: KlassOptions): InertKlassInstance<typeof metadata.public> {
        return new KlassClass(rawStructureClone(fieldValues), options) as unknown as InertKlassInstance<typeof metadata.public>
    }

    function createReactive(fieldValues: InertKlassInstance<T["public"]>, options?: KlassOptions) : ReactiveKlassInstance<typeof metadata.public>{
        return new KlassClass(rawStructureClone(fieldValues), { ...(options||{}), isReactive: true}) as unknown as ReactiveKlassInstance<typeof metadata.public>
    }

    function stringify(obj: InertKlassInstance<(typeof metadata)['public']>) {
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


    function clone(obj: InertKlassInstance<T['public']>, deepCloneKlass: boolean){
        const arg = Object.fromEntries(Object.keys(metadata.public).map(k => [k, deepClone(obj[k as keyof typeof obj], deepCloneKlass)])) as InertKlassInstance<T['public']>
        return obj._options?.isReactive ? KlassClass.createReactive(arg): KlassClass.create(arg)
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
        static createReactive = createReactive
        static stringify = stringify
        static is = metadata.is || is
        static clone = clone
        static check = check
        static isKlass = true
        public _options?: KlassOptions|ReactiveKlassOptions
        public _type = metadata.name
        public static displayName = metadata.name
        public static public = metadata.public
        public static constraints = metadata.constraints
        public static display = metadata.display
        public static instances:(InertKlassInstance<typeof metadata.public>|ReactiveKlassInstance<typeof metadata.public>)[] = reactive([])
        public uuid: string
        constructor(arg: KlassRawInstanceDataType["public"], options? :KlassOptions|ReactiveKlassOptions) {
            const self = this as unknown as InertKlassInstance<typeof metadata.public>

            const isReactive = options?.isReactive
            if (metadata.public) {
                Object.entries(metadata.public).forEach(([ propName, propDef]: [string, ClassMetaPublicItem]) => {
                    const initialValue = hasOwn(arg, propName) ? arg[propName as unknown as keyof typeof arg] : propDef.defaultValue?.()
                    // CAUTION 所有值都有

                    if (initialValue!==undefined) {
                        if (!isReactive) {
                            // TODO
                            // @ts-ignore
                            self[propName] = initialValue
                        } else {
                            // 目前属性只有 array，其他的情况就都是 atom 了。因为目前没有复合结构。
                            // @ts-ignore
                            self[propName] = propDef.collection ? reactive(initialValue) : atom(initialValue)
                        }
                    } else {
                        // reactive 的情况，所有值都要有，不然之后难以触发 reactive。parseStringToInstances 的时候也是难。
                        if (isReactive) {
                            // @ts-ignore
                            self[propName] = propDef.collection ? reactive([]) : atom(null)
                        }
                    }

                    // TODO 要不要再这里就验证？？？
                })
            }

            // computed value
            Object.entries(metadata.public).forEach(([ propName, propDef]: [string, ClassMetaPublicItem]) => {
                if (propDef.computed) {
                    if(isReactive) {
                        // @ts-ignore
                        self[propName] = computed(() => propDef.computed(self))
                    } else {
                        Object.defineProperty(self, propName, {
                            get: () => propDef.computed!(self),
                            enumerable: true,
                        })
                    }
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
    return (isAtom(obj) ? obj().uuid : obj.uuid) || ''
}


export function getDisplayValue( obj: InertKlassInstance<any>) {
    const rawObj: InertKlassInstance<any> = isAtom(obj) ? obj() : obj
    return (rawObj.constructor as Klass<any>).display?.(rawObj)
}

// FIXME 这里没法指定要不要 clone Klass 里面的 引用，现在默认就是不 copy
export function deepClone<T>(obj: T, deepCloneKlass?: boolean): T{
    // 优先处理 reactive 节点，因为下面的 instance 判断会覆盖
    if (isAtom(obj)) return atom(deepClone(obj()))
    if (isReactive(obj)) return reactive(deepClone(toRaw(obj)) as object) as T


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
    debugger
    throw new Error(`unknown type`)
}

export type KlassInstance<T extends Klass<any>, U extends boolean> = U extends true ? ReactiveKlassInstance<T["public"]> : InertKlassInstance<T["public"]>

export function removeAllInstance() {
    for( let [, Klass] of KlassByName ) {
        Klass.instances.splice(0, Infinity)
    }
}
