// @ts-ignore
import {atom, Atom, computed, isAtom, isReactive, rawStructureClone, reactive} from "rata";
import {isPlainObject, hasOwn, isObject, assert} from "./util";
import {toRaw, UnwrapReactive} from "rata";

type PrimitivePropType = 'string'|'number'|'boolean'| 'object'
type DefaultValueType = (...args: any[]) => any

type ClassPropType = {
    type?: Klass<any>|Klass<any>[]|PrimitivePropType,
    // 用来接触循环引用的
    instanceType?: Object,
    reactiveInstanceType?: KlassInstance<any, true>,
    computedType?: (...arg: any[]) => string|Function,
    options? : any[] | ((thisProp: any, thisEntity: object) => any[])
    constraints?: {
        [ruleName: string] : ((thisProp: any, thisEntity: object) => Atom<boolean>|boolean|any[]) | Function | string
    }
}

type OptionalRequiredType<T> = T&{required?:false} | T& { required: true}
type OptionalDefaultValueType<T> = T&{defaultValue?: undefined} | T& { defaultValue: DefaultValueType}
type OptionalCollectionType<T> = T&{collection?: false} | T& { collection: true}
// arg 是有 required 并且一定没有 defaultValue 才有
// prop 是有 required 或者有 defaultValue 就必有
export type RequireWithoutDefault<T extends ClassMetaPublicItem, IS_ARG extends true|false> =
    IS_ARG extends true ?
        (T["defaultValue"] extends DefaultValueType? false:  T["required"] extends true  ? true : false) :
        (T["defaultValue"] extends DefaultValueType? true:  T["required"] extends true  ? true : false)


type ClassMetaPublicItem = OptionalRequiredType<OptionalDefaultValueType<OptionalCollectionType<ClassPropType>>>

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


export function getInstance<T extends Klass<any>>(Type: T){
    return Type.instances
}

interface PrimitivePropertyMap {
    string: string
    number: number
    boolean: boolean
    object: object
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
        RequireWithoutDefault<T[Key], IS_ARG> extends true ?
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
        RequireWithoutDefault<T[Key], IS_ARG> extends true ?
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
    instances: (ReactiveKlassInstance<T>|InertKlassInstance<T>)[],
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
            const klassType = Klass.public[propName].type
            publicProps[propName] = propValue

            // 除了type 表明了不是 uuid 的情况，其他全部当成可能是 uuid 的情况
            if (!(typeof klassType === 'string' ||
                Array.isArray(klassType) && klassType.every(k => typeof k === 'string'))
            ) {
                unsatisfiedProps[propName] = propValue
            }
        })

        const instance = new Klass(publicProps, optionsWithUUID)
        // FIXME 根据 option + reactiveForce 共同判断
        uuidToInstance.set(uuid, instance)

        if (Object.keys(unsatisfiedProps).length) {
            unsatisfiedInstances.set(instance, unsatisfiedProps)
        }
    })

    for(let [instance, unsatisfiedProps] of unsatisfiedInstances) {
        Object.entries(unsatisfiedProps).forEach(([rawPropName, propValue]) => {
            const propName = rawPropName as keyof typeof instance
            // TODO 这里要不要做更加严格的校验，防止真的出现了 value 的值刚好就和 uuid 匹配上了？
            const refs = Array.isArray(propValue) ? propValue.map(maybeUUID => (uuidToInstance.get(maybeUUID)||maybeUUID)) : (uuidToInstance.get(propValue)||propValue)

            // CAUTION 这里如果是 reactive 的默认一定有 reactive 的值。那么用 reactive 的方式
            if (instance._options.isReactive) {
                if (Array.isArray(propValue)) {
                    // @ts-ignore
                    (instance[propName] as InertKlassInstance<any>[]).splice(0, Infinity, ...(refs as InertKlassInstance<any>[]))
                } else {
                    // @ts-ignore
                    (instance[propName] as Atom)(refs)
                }
            } else {
                // FIXME type
                // @ts-ignore
                instance[propName] = refs
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

function returnEntityUUID(obj: any) {
    return (isObject(obj) && !isPlainObject(obj)) ? (obj as InertKlassInstance<any>).uuid : obj
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
                // CAUTION 任何叶子结点都会被替换成 uuid
                return [key, rawStructureClone(obj[key as keyof typeof obj], returnEntityUUID)]
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
