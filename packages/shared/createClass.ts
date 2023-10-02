// @ts-ignore
import {atom, Atom, isAtom, isReactive, rawStructureClone, reactive} from "rata";
import {isPlainObject, hasOwn, isObject, assert} from "./util";
import {toRaw, UnwrapReactive} from "rata";

type PrimitivePropType = 'string'|'number'|'boolean'| 'object'

type ClassPropType = {
    type?: KlassType<any>|KlassType<any>[]|PrimitivePropType,
    collection?: false,
    computedType?: (...arg: any[]) => string|Function,
    defaultValue?: () => any,
    required?: boolean,
    options? : any[] | ((thisProp: any, thisEntity: object) => any[])
    constraints?: {
        [ruleName: string] : ((thisProp: any, thisEntity: object) => Atom<boolean>|boolean|any[]) | Function | string
    }
}

type ClassCollectionPropType<T extends ClassDef['public']> = Omit<ClassPropType, 'collection'> & {
    collection: true,
}

type ClassDefPublicItem = ClassPropType | ClassCollectionPropType<any>

export type ClassDef = {
    name: string,
    display? : (obj: KlassInstance<any>) => string,
    constraints?: {
        [ruleName: string] : (thisInstance: object, allInstance: object[]) => Atom<boolean>|boolean
    }

    public: {
        [key: string]: ClassDefPublicItem
    }
    // 检测一个实例是不是 Class，用户可以自定义规则，如果没有自定义就会用 instanceof
    is? : (obj: any) => boolean
    // TODO 完成 Private 等等其他
}


export function getInstance<T extends KlassType<any>>(Type: T){
    return Type.instances
}

interface PrimitivePropertyMap {
    string: string
    number: number
    boolean: boolean
    object: object
}

type KlassInstancePrimitives = {
    uuid: string,
    _options: KlassOptions,
}

type inferIfReactiveCollection<REACTIVE extends boolean, COLLECTION extends true|false|undefined, T> = REACTIVE extends true ?
    (
        COLLECTION extends true ?
            UnwrapReactive<T[]>:
            Atom<T>)
    :(
        COLLECTION extends true ?
            T[]:
            T
    )


export type KlassInstance<T extends NonNullable<ClassDef["public"]>> = {
    [Key in keyof T]:
        T[Key]['type'] extends KlassType<any> ?
            inferIfReactiveCollection<false, T[Key]["collection"], KlassInstance<T[Key]['type']['public']>> :
        T[Key]['type'] extends KlassType<any>[] ?
            inferIfReactiveCollection<false, T[Key]["collection"], KlassInstance<any>> :
        T[Key]['type'] extends PrimitivePropType ?
            inferIfReactiveCollection<false, T[Key]["collection"], PrimitivePropertyMap[T[Key]['type']]>:
        T[Key]['computedType'] extends Function ?
            (ReturnType<T[Key]['computedType']> extends KlassType<any> ?
                inferIfReactiveCollection<false, T[Key]["collection"], ReturnType<ReturnType<T[Key]['computedType']>["create"]>>:
                inferIfReactiveCollection<false, T[Key]["collection"], any>
            ):
        never
} & KlassInstancePrimitives


export type ReactiveKlassInstance<T extends NonNullable<ClassDef["public"]>> = {
    [Key in keyof T]:
        T[Key]['type'] extends KlassType<any> ?
            inferIfReactiveCollection<true, T[Key]["collection"], KlassInstance<T[Key]['type']['public']>>:
        T[Key]['type'] extends KlassType<any>[] ?
            inferIfReactiveCollection<true, T[Key]["collection"], KlassInstance<any>>:
        T[Key]['type'] extends PrimitivePropType ?
            inferIfReactiveCollection<true, T[Key]["collection"], PrimitivePropertyMap[T[Key]['type']]>:
        T[Key]['computedType'] extends Function ?
            (ReturnType<T[Key]['computedType']> extends KlassType<any> ?
                inferIfReactiveCollection<true, T[Key]["collection"], ReturnType<ReturnType<T[Key]['computedType']>["createReactive"]>>:
                inferIfReactiveCollection<true, T[Key]["collection"], any>
                ):
        never
} &  KlassInstancePrimitives



export type KlassType<T extends ClassDef["public"]> = {
    new<U extends KlassOptions|ReactiveKlassOptions>(arg: object, options?: U) : U extends ReactiveKlassOptions ? ReactiveKlassInstance<T> : KlassInstance<T>,
    create: (arg: object, options?: KlassOptions) => KlassInstance<T>,
    createReactive: (arg: object, options?: KlassOptions) => ReactiveKlassInstance<T>,
    displayName: string,
    isKlass: true,
    public: T,
    constraints: ClassDef['constraints'],
    instances: (ReactiveKlassInstance<T>|KlassInstance<T>)[],
    display? : ClassDef['display']
    stringify: (instance: KlassInstance<T>) => string
    parse: () => KlassInstance<T>
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
    public: {
        [k: string]: any
    }
}

export const KlassByName = new Map<string, KlassType<any>>()

// 遍历两次，建立所有关系。第一次把非对象值建立起来。第二次把那些引用的 uuid 的值替换出来。
export function createInstancesFromString(objStr: string) {
    const objects = JSON.parse(objStr)
    return createInstances(objects)
}

export function createInstances(objects: KlassRawInstanceDataType[], reactiveForce?: boolean) {
    const uuidToInstance = new Map<string, KlassInstance<any>>()
    const unsatisfiedInstances = new Map<KlassInstance<any>, object>()
    objects.forEach(({ type, options = {}, uuid, public: rawProps } :KlassRawInstanceDataType) => {
        assert(!uuidToInstance.get(uuid), `duplicate uuid ${uuid}, ${type}, ${JSON.stringify(rawProps)}`)
        const Klass = KlassByName.get(type)!
        const optionsWithUUID: ReactiveKlassOptions|KlassOptions = {...options, uuid}
        if (reactiveForce !== undefined) {
            // @ts-ignore
            optionsWithUUID.isReactive = reactiveForce
        }
        // 根据
        const publicProps: {[k:string]:any} = {}
        const unsatisfiedProps: {[k:string]:any} = {}
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

        uuidToInstance.set(uuid, instance)

        if (Object.keys(unsatisfiedProps).length) {
            unsatisfiedInstances.set(instance, unsatisfiedProps)
        }
    })

    for(let [instance, unsatisfiedProps] of unsatisfiedInstances) {
        Object.entries(unsatisfiedProps).forEach(([propName, propValue]) => {
            // TODO 这里要不要做更加严格的校验，防止真的出现了 value 的值刚好就和 uuid 匹配上了？
            const refs = Array.isArray(propValue) ? propValue.map(maybeUUID => (uuidToInstance.get(maybeUUID)||maybeUUID)) : (uuidToInstance.get(propValue)||propValue)

            // CAUTION 这里如果是 reactive 的默认一定有 reactive 的值。那么用 reactive 的方式
            if (instance._options.isReactive) {
                if (Array.isArray(propValue)) {
                    instance[propName].splice(0, Infinity, ...(refs as KlassInstance<any>[]))
                } else {
                    instance[propName](refs)
                }
            } else {
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

export function stringifyInstance(obj: KlassInstance<any>) {
    const Klass = KlassByName.get(obj._type) as KlassType<any>
    return Klass.stringify(obj)
}

function returnEntityUUID(obj: any) {
    return (isObject(obj) && !isPlainObject(obj)) ? (obj as KlassInstance<any>).uuid : obj
}

export function createClass<T extends ClassDef>(def: T) : KlassType<T['public']>{
// export function createClass(def){

    if (KlassByName.get(def.name)) throw new Error(`Class name must be global unique. ${def.name}`)

    function create(fieldValues: object, options?: KlassOptions): KlassInstance<typeof def.public> {
        return new Klass(rawStructureClone(fieldValues), options) as unknown as KlassInstance<typeof def.public>
    }

    function createReactive(fieldValues: object, options?: KlassOptions) : ReactiveKlassInstance<typeof def.public>{
        return new Klass(rawStructureClone(fieldValues), { ...(options||{}), isReactive: true}) as unknown as ReactiveKlassInstance<typeof def.public>
    }

    function stringify(obj: KlassInstance<(typeof def)['public']>) {
        return JSON.stringify({
            type: def.name,
            options: obj._options,
            uuid: obj.uuid,
            public: Object.fromEntries(Object.entries(def.public).map(([key, propDef]) => {
                // CAUTION 任何叶子结点都会被替换成 uuid
                return [key, rawStructureClone(obj[key], returnEntityUUID)]
            })),
        } as KlassRawInstanceDataType)
    }


    function clone(obj: KlassInstance<(typeof def)['public']>, deepCloneKlass: boolean){
        const arg = Object.fromEntries(Object.keys(def.public).map(k => [k, deepClone(obj[k], deepCloneKlass)]))
        return obj._options?.isReactive ? Klass.createReactive(arg): Klass.create(arg)
    }

    function is(obj: any) {
        return obj instanceof Klass
    }

    function check(data: KlassInstance<any>) {
        // TODO 要check 到底有没有
        if (data.uuid) return true
        // TODO check data is valid or not
        return true
    }

    class Klass {
        static create = create
        static createReactive = createReactive
        static stringify = stringify
        static is = def.is || is
        static clone = clone
        static check = check
        static isKlass = true
        public _options?: KlassOptions|ReactiveKlassOptions
        public _type = def.name
        public static displayName = def.name
        public static public = def.public
        public static constraints = def.constraints
        public static display = def.display
        public static instances:(KlassInstance<typeof def.public>|ReactiveKlassInstance<typeof def.public>)[] = reactive([])
        public uuid: string
        constructor(arg: KlassRawInstanceDataType["public"], options? :KlassOptions|ReactiveKlassOptions) {
            const self = this as unknown as KlassInstance<typeof def.public>

            const isReactive = options?.isReactive
            if (def.public) {
                Object.entries(def.public).forEach(([ propName, propDef]: [string, ClassDefPublicItem]) => {
                    const initialValue = hasOwn(arg, propName) ? arg[propName] : propDef.defaultValue?.()
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
            Klass.instances.push(self)
        }
    }


    KlassByName.set(def.name, Klass as unknown as KlassType<typeof def.public>)
    return Klass as unknown as KlassType<typeof def.public>
}

export function getUUID(obj: KlassInstance<any>): string {
    return (isAtom(obj) ? obj().uuid : obj.uuid) || ''
}


export function getDisplayValue( obj: KlassInstance<any>) {
    const rawObj: KlassInstance<any> = isAtom(obj) ? obj() : obj
    return (rawObj.constructor as KlassType<any>).display?.(rawObj)
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
    if (typeof obj?.constructor?.isKlass) return deepCloneKlass ? ((obj as KlassInstance<any>)?.constructor as KlassType<any>)?.clone(obj as KlassInstance<any>, deepCloneKlass) as T: obj

    // TODO 支持其他类型，例如 Date/RegExp/Error
    debugger
    throw new Error(`unknown type`)
}

export type KlassInstanceOf<T extends KlassType<any>, U extends boolean> = U extends true ? ReactiveKlassInstance<T["public"]> : KlassInstance<T["public"]>

export function removeAllInstance() {
    for( let [, Klass] of KlassByName ) {
        Klass.instances.splice(0, Infinity)
    }
}
