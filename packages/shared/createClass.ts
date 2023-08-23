import {atom, Atom, isAtom, isReactivableType, isReactive, rawStructureClone, reactive} from "rata";
import {isPlainObject, hasOwn, isObject} from "../ide/src/util";
import {toRaw, UnwrapReactive} from "rata";

type AcceptablePropType<T> = 'string'|'number'|'boolean'| 'object'| KlassType<T>

type ClassPropType<T extends ClassDef['public']> = {
    type?: AcceptablePropType<T>|AcceptablePropType<T>[] ,
    collection?: false,
    computedType?: (...arg: any[]) => string|Function,
    defaultValue?: () => any,
    required?: boolean,
    options? : any[] | ((thisProp: any, thisEntity: object) => any[])
    constraints?: {
        [ruleName: string] : ((thisProp: any, thisEntity: object) => Atom<boolean>|boolean|any[]) | Function | string
    }
}

type ClassCollectionPropType<T> = Omit<ClassPropType<T>, 'collection'> & {
    collection: true,
}

type ClassDef = {
    name: string,
    display? : (obj: KlassInstance<any>) => string,
    constraints?: {
        [ruleName: string] : (thisInstance: object, allInstance: object[]) => Atom<boolean>|boolean
    }

    public?: {
        [key: string]: ClassPropType<any> | ClassCollectionPropType<any>
    }
    // TODO 完成 Private 等等其他
}


export function getInstance<T>(Type: typeof T): T[]{
    return Type.instances
}

interface PrimitivePropertyMap {
    string: string,
    number: number
    boolean: boolean
}


type KlassInstance<T> = {
    [Key in keyof T]: T[Key]['type'] extends KlassType<T[Key]['type']['public']> ?
        (T[Key] extends ClassCollectionPropType<T[Key]['type']['public']> ?
            KlassInstance<T[Key]['type']['public']>[]:
            KlassInstance<T[Key]['type']['public']>
        ) :
        (T[Key] extends ClassCollectionPropType<T[Key]['type']['public']> ?
            PrimitivePropertyMap[T[Key]['type']][]:
            PrimitivePropertyMap[T[Key]['type']]
        )
}

type ReactiveKlassInstance<T> = {
    [Key in keyof T]: T[Key]['type'] extends KlassType<T[Key]['type']['public']> ?
        (T[Key] extends ClassCollectionPropType<T[Key]['type']['public']> ?
            UnwrapReactive<KlassInstance<T[Key]['type']['public']>[]>:  // 对象数组
            Atom<KlassInstance<T[Key]['type']['public']>> // 对象 单一值
        ) :
        (T[Key] extends ClassCollectionPropType<T[Key]['type']['public']> ?
            UnwrapReactive<PrimitivePropertyMap[T[Key]['type']][]>: // primitive 的数组 reactive()
            Atom<PrimitivePropertyMap[T[Key]['type']]>  // primitive 单一值
        )
}


export type KlassType<T> = {
    new(arg: object, options?: KlassOptions) : KlassInstance<T>,
    create: (arg: object, options?: KlassOptions) => KlassInstance<T>,
    createReactive: (arg: object, options?: KlassOptions) => ReactiveKlassInstance<T>,
    displayName: string,
    isKlass: true,
    public: T,
    constraints: ClassDef['constraints'],
    instances: any[],
    display? : ClassDef['display']
    stringify: (instance: KlassInstance<T>) => string
    parse: () => KlassInstance<T>
    is: (arg: any) => boolean
}

type KlassOptions = {
    isReactive?: boolean,
    uuid?: string,
}

type KlassInstanceStringifyType = {
    type: string,
    uuid: string,
    options?: KlassOptions,
    public: object
}

const KlassByName = new Map<string, KlassType<any>>()

// 遍历两次，建立所有关系。第一次把非对象值建立起来。第二次把那些引用的 uuid 的值替换出来。
export function createInstancesFromString(objStr: string) {
    const uuidToInstance = new Map<string, KlassInstance<any>>()
    const unsatisfiedInstances = new Map<KlassInstance<any>, object>()
    const objects = JSON.parse(objStr)
    objects.forEach(({ type, options = {}, uuid, public: rawProps } :KlassInstanceStringifyType) => {
        const Klass = KlassByName.get(type)
        const optionsWithUUID = {...options, uuid}
        // 根据
        const publicProps = {}
        const unsatisfiedProps = {}
        Object.entries(rawProps).forEach(([propName, propValue]) => {
            if (typeof Klass.public[propName].type === 'function') {
                // 对象应用，这时候 PropValue 是该对象的 uuid
                const ref =uuidToInstance.get(propValue as string)
                if (ref) {
                    publicProps[propName] = ref
                } else {
                    unsatisfiedProps[propName] = propValue
                }
            } else if (typeof Klass.public[propName].type === 'string'){
                // 普通
                publicProps[propName] = propValue
            } else if (typeof Klass.public[propName].computedType){
                // 计算属性？
                if (propValue) {
                    const type = Klass.public[propName].computedType(rawProps)
                    // FIXME 这里有大问题，如果 computedType 依赖了  instance 怎么办？好像 computedType 要放到最后？
                    //  computedType 里面也有引用怎么办？？？
                    if (!type) throw new Error('computedValue not ready')
                }

            } else {
                throw new Error('unknown prop type')
            }
        })

        const instance = Klass.create(publicProps, optionsWithUUID)
        uuidToInstance.set(uuid, instance)

        if (Object.keys(unsatisfiedProps).length) {
            unsatisfiedInstances.set(instance, unsatisfiedProps )
        }
    })

    for(let [instance, unsatisfiedProps] of unsatisfiedInstances) {
        Object.entries(unsatisfiedProps).forEach(([propName, propValue]) => {
            // CAUTION 这里如果是 reactive 的默认一定有 reactive 的值。那么用 reactive 的方式
            if (instance._options.isReactive) {
                if (Array.isArray(propValue)) {
                    instance[propName].push(...propValue.map(uuid => uuidToInstance.get(uuid)))
                } else {
                    instance[propName](uuidToInstance.get(propValue))
                }
            } else {
                if (Array.isArray(propValue)) {
                    instance[propName] = propValue.map(uuid => uuidToInstance.get(uuid))
                } else {
                    instance[propName] = uuidToInstance.get(propValue)
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

export function stringifyInstance(obj: KlassInstance<any>) {
    const Klass = KlassByName.get(obj._type) as KlassType<any>
    return Klass.stringify(obj)
}

function returnEntityUUID(obj: any) {
    return (isObject(obj) && !isPlainObject(obj)) ? obj.uuid : obj
}

export function createClass<T extends ClassDef>(def: T) : KlassType<T['public']>
export function createClass(def){

    if (KlassByName.get(def.name)) throw new Error(`Class name must be global unique. ${def.name}`)

    function create(fieldValues: object, options?: KlassOptions) {
        return new Klass(rawStructureClone(fieldValues), options)
    }

    function createReactive(fieldValues: object, options?: KlassOptions) {
        return new Klass(rawStructureClone(fieldValues), { ...(options||{}), isReactive: true})
    }

    function stringify(obj: Klass) {
        return JSON.stringify({
            type: def.name,
            options: obj._options,
            uuid: obj.uuid,
            public: Object.fromEntries(Object.entries(def.public).map(([key, propDef]) => {
                // CAUTION 任何叶子结点都会被替换成 uuid
                return [key, rawStructureClone(obj[key], returnEntityUUID)]
            })),
        } as KlassInstanceStringifyType)
    }


    function clone(obj: Klass, deepCloneKlass) : Klass{
        const arg = Object.fromEntries(Object.keys(def.public).map(k => [k, deepClone(obj[k]), deepCloneKlass]))
        return obj._options?.isReactive ? Klass.createReactive(arg) : Klass.create(arg)
    }

    function is(obj: any) {
        return obj instanceof Klass
    }

    class Klass {
        static create = create
        static createReactive = createReactive
        static stringify = stringify
        static is = is
        static clone = clone
        static isKlass = true
        public _options?: KlassOptions
        public _type = def.name
        public static displayName = def.name
        public static public = def.public
        public static constraints = def.constraints
        public static display = def.display
        public static instances:Klass[] = reactive([])
        public uuid: string
        constructor(arg: object, options? :KlassOptions) {
            const isReactive = options?.isReactive
            if (def.public) {
                Object.entries(def.public).forEach(([ propName, propDef]: [string, ClassPropType<(typeof def)['public']>]) => {

                    const initialValue = hasOwn(arg, propName) ? arg[propName] : propDef.defaultValue?.()
                    // CAUTION 所有值都有

                    if (initialValue!==undefined) {
                        if (!isReactive) {
                            this[propName] = initialValue
                        } else {
                            // 目前属性只有 array，其他的情况就都是 atom 了。因为目前没有复合结构。
                            this[propName] = propDef.collection ? reactive(initialValue) : atom(initialValue)
                        }
                    } else {
                        // reactive 的情况，所有值都要有，不然之后难以触发 reactive。parseStringToInstances 的时候也是难。
                        if (isReactive) {
                            this[propName] = propDef.collection ? reactive([]) : atom(null)
                        }
                    }

                    // TODO 要不要再这里就验证？？？
                })
            }


            this._options = options

            this.uuid = this._options?.uuid || crypto.randomUUID()
            Klass.instances.push(this)
        }
    }


    KlassByName.set(def.name, Klass as KlassType<typeof def.public>)
    return Klass
}

export function getUUID(obj: object): string {
    return (isAtom(obj) ? obj().uuid : obj.uuid) || ''
}


export function getDisplayValue<T>( obj: KlassInstance<T>) {
    const rawObj: KlassInstance<any> = isAtom(obj) ? obj() : obj
    return (rawObj.constructor as KlassType<T>).display?.(rawObj)
}

// FIXME 这里没法指定要不要 clone Klass 里面的 引用，现在默认就是不 copy
export function deepClone(obj: any, deepCloneKlass?: boolean){
    // 优先处理 reactive 节点，因为下面的 instance 判断会覆盖
    if (isAtom(obj)) return atom(deepClone(obj()))
    if (isReactive(obj)) return reactive(deepClone(toRaw(obj)))


    if (obj === undefined || obj === null || typeof obj !== 'object') return obj
    if (Array.isArray(obj)) return obj.map(v => deepClone(v))
    if (isPlainObject(obj)) {
        return Object.fromEntries(Object.entries(obj).map(([key, value]) => deepClone(value)))
    }

    if (obj instanceof Set) {
        return new Set(Array.from(obj.values()).map(v => deepClone(v)))
    }

    if (obj instanceof Map) {
        return new Map(Array.from(obj.entries()).map(([k, v]) => deepClone(v)))
    }


    if (typeof obj?.constructor?.isKlass) return deepCloneKlass ? obj?.constructor?.clone(obj, deepCloneKlass) : obj

    // TODO 支持其他类型，例如 Date/RegExp/Error
    debugger
    throw new Error(`unknown type`)
}