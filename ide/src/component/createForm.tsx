import { createElement, onDestroy } from "axii";
import { Atom, computed, destroyComputed, incEvery, incIndexBy, incMap, reactive } from "data0";
import { getDisplayValue, getUUID } from "@interaqt/shared";

type ConstraintsType = {
    [k: string]: (...arg: any[]) => boolean
}

export type FormStaticFieldType = {
    name: string,
    type: 'string' | 'number',
    required: boolean
    multiple?: boolean
    defaultValue?: () => any
    options?: any[] | any
    constraints?: ConstraintsType
    runConstraints?: any
}

export type FormGroupFieldType = {
    name: string,
    children: FormFieldType[]
}

export type FormComputedFieldType = (...arg: any[]) => FormFieldType

export type FormFieldType = FormStaticFieldType | FormComputedFieldType | FormGroupFieldType


export type FormDef = {
    title?: string
    description?: string
    constraints?: ConstraintsType,
    getConstraintArgs?: (fieldValues: object) => object,
    runConstraints?: any
    fields: FormFieldType[],
    fixedValues: object,
    initialValues: object
}


function Input({ value, touched }) {
    const onChange = (e) => {
        touched(true)
        value(e.target.value)
    }
    return <input autocomplete="off" value={value} onChange={onChange} className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6" />
}

function NumberInput() {
    return <input type='number' className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6" />
}

function Checkbox({ value, touched }) {
    const onChange = () => {
        touched(true)
        value(!value())
        console.log(value())
    }
    return <input type="checkbox" onChange={onChange} value={value} className="" />
}


type SelectPropType = {
    value: any,
    name: string,
    options: any[],
    touched: Atom<boolean>,
    required: boolean,
    fixed: boolean,
}

function isEmpty(val: any) {
    return val === null || val === undefined || val === ''
}

function hasValue(val: any) {
    return !isEmpty(val)
}


function Select({ value, options, touched, required, name, fixed }: SelectPropType) {

    const currentValueString = computed(() => {
        const rawValue = value()
        return (typeof rawValue === 'object' ? getUUID(rawValue) : rawValue) || ''
    })

    const mapStringValueToObject = incIndexBy(options, (o) => {
        return typeof o === 'object' ? getUUID(o) : o.toString()
    })

    const onChange = (e) => {
        touched(true)
        const newValue = (mapStringValueToObject as Map<any, any>).get(e.target.value)
        value(newValue)
    }

    // TODO fixed 化就显示一个假的
    // TODO 根据 required 情况看看要不要提供空的选项
    return <select name={name} disabled={fixed} value={currentValueString} onChange={onChange} className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:max-w-xs sm:text-sm sm:leading-6">
        {required ? null : <option value=''></option>}
        {incMap(options, (o) => {
            if (typeof o === 'object') {
                return (<option value={computed(() => getUUID(o))}>{getDisplayValue(o)}</option>)
            } else {
                return (<option value={o}>{o}</option>)
            }
        })}
    </select>
}

function InputSelect() {
    return <select className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:max-w-xs sm:text-sm sm:leading-6"></select>
}



function createDefaultValue(field) {
    if (field.defaultValue) {
        return field.defaultValue()
    }

    // CAUTION  string 是没有 undefined 的情况的，空值就是 ''
    if (field.type === 'string') return ''

    // TODO 有没有其他情况，例如使用 Null?
    return undefined
}

const enum ConstraintResult {
    Success = 'success',
    Error = 'error',
    Unknown = 'unknown',
    Unrelated = 'unrelated'
}


type FieldComponentProps = {
    field: FormFieldType
    fieldValues: object,
    fieldTouchedStatus: object,
    fieldNames: string[],
    constraintDepsAndComputeds: ConstraintDepsAndComputeds
}

function StaticField({ field, fieldValues, fieldTouchedStatus, fieldNames, constraintDepsAndComputeds, initialValues, fixedValues }: FieldComponentProps) {
    const staticField = field as FormStaticFieldType
    let formControl

    // initialize formValue
    // CAUTION 这里默认 createDefaultValue 不会有 plainObject
    const getFinalInitialValue = () => fixedValues?.[staticField.name] ?? initialValues?.[staticField.name] ?? createDefaultValue(staticField)
    fieldValues[staticField.name] = getFinalInitialValue()
    fieldTouchedStatus[staticField.name] = false

    const commonProp = {
        name: staticField.name,
        // CAUTION 通过 $ 显式地 取它的 leaf atom
        value: fieldValues[`$${staticField.name}`],
        touched: fieldTouchedStatus[`$${staticField.name}`],
        required: staticField.required,
        fixed: fixedValues?.[staticField.name] !== undefined
    }

    if (staticField.options) {
        if (Array.isArray(staticField.options)) {
            // Select
            formControl = <Select {...commonProp} options={staticField.options} />
        } else if (typeof staticField.options === 'function') {
            // FIXME type
            // @ts-ignore
            const options = computed.as.options(() => {
                // FIXME 这里在 options 变化时候需要重置自己。但写法有三个问题：
                //  1. 重置的这种逻辑语义写成这样太晦涩了。
                //  2. 这里在初始的时候就使得 fieldValues 执行了两次
                fieldValues[staticField.name] = getFinalInitialValue()
                return staticField.options(fieldValues)
            })

            formControl = <Select {...commonProp} options={options} />
        } else if (typeof staticField.options === 'object') {
            // TODO 远程提示
            formControl = <InputSelect value={fieldValues[staticField.name]} />
        } else {
            throw new Error('unknown option type')
        }
    } else if (staticField.type === 'string' || staticField.type === 'number') {
        // 自由输入的情况
        formControl = staticField.type === 'number' ?
            <NumberInput {...commonProp} /> :
            <Input {...commonProp} />
    } else if (staticField.type === 'boolean') {
        formControl = <Checkbox {...commonProp} />
    } else {
        throw new Error(`${staticField.type} is not supported yet`)
    }

    onDestroy(() => {
        delete fieldValues[staticField.name]
        delete fieldTouchedStatus[staticField.name]
    })

    const { constraints = {} } = staticField

    const depMap = Object.fromEntries(Object.entries(constraints).map(([constraintName, createConstraintComputed]) => {
        const formValueProxy = getFormValueProxy(fieldValues, fieldNames)
        const proxyComputed = createConstraintComputed(formValueProxy)
        const fieldDep = flashFieldDep()
        // CAUTION 这个 computed 我们只是用来获取 dep 的
        destroyComputed(proxyComputed)
        return [constraintName, fieldDep]
    }))

    const constraintsResults = Object.entries(constraints).map(([constraintName, createConstraintComputed]) => {
        const constraintComputed = createConstraintComputed(fieldValues) as Atom<boolean>
        const depTouchComputed = computed(() => {
            // CAUTION 注意这里必须全部 touch 一遍才能保证正确的 reactive，不能用 every。想想后面又没有更好的方式
            const results = depMap[constraintName].map(depFieldName => fieldTouchedStatus[depFieldName])
            return results.every(v => v)
        }) as Atom<boolean>

        return {
            name: constraintName,
            result: computed(() => {
                // FIXME 重复执行太多次了！！！！

                const constraintResult = constraintComputed()

                const allTouchedResult = depTouchComputed()
                return !(hasValue(fieldValues[staticField.name]) || allTouchedResult) ? // 如果有值并且没 touch，说明是 initialValue 的
                    ConstraintResult.Unknown :
                    constraintResult ?
                        ConstraintResult.Success :
                        ConstraintResult.Error
            })
        }
    })

    // 跟自己相关的
    const formConstraintsResults = Object.entries(constraintDepsAndComputeds).map(([constraintName, depsAndComputed]) => {
        const { deps, computed: constraintComputed } = depsAndComputed
        const isRelated = computed.as[`${constraintName}_${staticField.name}_related`](() => {
            return deps.has(staticField.name)
        })

        // CAUTION 注意这里取 leaf atom
        const depTouchedSet = incMap(deps, depFieldName => fieldTouchedStatus[`$${depFieldName}`])
        const isAllDepTouchComputed = incEvery(depTouchedSet, (touched) => touched()) as Atom<boolean>

        return {
            name: constraintName,
            result: computed(() => {
                return (!isRelated()) ?
                    ConstraintResult.Unrelated :
                    (!(hasValue(fieldValues[staticField.name]) || isAllDepTouchComputed())) ? // 如果有值并且没 touch，说明是 initialValue 的
                        ConstraintResult.Unknown :
                        constraintComputed() ?
                            ConstraintResult.Success :
                            ConstraintResult.Error
            })
        }
    })




    return <div className="sm:col-span-4">
        <label htmlFor="username"
            className="block text-sm font-medium leading-6 text-gray-900">{staticField.name}</label>
        <div className="mt-2">
            {formControl}
        </div>
        <div>
            {constraintsResults.map(({ name, result }) => (
                <div>
                    <span>{name}:</span>
                    <span>{result}</span>
                </div>
            ))}
            {formConstraintsResults.map(({ name, result }) => (
                <div>
                    <span>{name}:</span>
                    <span>{result}</span>
                </div>
            ))}
        </div>
    </div>

}


function GroupField(props: RenderFieldType) {
    const { field, fieldValues, fieldTouchedStatus, initialValues, fixedValues } = props
    const groupField = field as FormGroupFieldType
    // initialize formValue
    fieldValues[groupField.name] = {}
    fieldTouchedStatus[groupField.name] = {}

    onDestroy(() => {
        delete fieldValues[groupField.name]
        delete fieldTouchedStatus[groupField.name]
    })
    return (
        <div className="sm:col-span-4">
            <div className="relative">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-start">
                    <span className="bg-white  pr-2 text-sm font-medium leading-6 text-gray-900">{groupField.name}</span>
                </div>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-6">
                {incMap(groupField.children, (field: FormFieldType) => {
                    const childInitialValues = initialValues?.[groupField.name]
                    const childFixedValues = fixedValues?.[groupField.name]
                    renderFieldType({ ...props, field, initialValues: childInitialValues, fixedValues: childFixedValues })
                })}
            </div>
        </div>
    )
}

type RenderFieldType = {
    field: FormFieldType,
    fieldValues: object,
    fieldTouchedStatus: object,
    constraintDepsAndComputeds: ConstraintDepsAndComputeds,
    fixedValues?: object,
    initialValues?: object,
    fieldNames: string[]
}

function renderFieldType(arg: RenderFieldType) {
    const {
        field,
        fieldValues,
    } = arg

    if (!field) return null

    if ((field as FormGroupFieldType).children) {
        return <GroupField {...arg} />
    }

    if (typeof field === 'function') {
        // 这里会由 FunctionHost 接手，一旦发生变化就会重算，destroy 其中的 static/group，回收注册的 fieldValues 等信息
        return () => {
            const computedField = field(fieldValues)
            if (!computedField) return null
            // 这里不需要 destroy，因为 Static 和 Group 会 destroy
            return renderFieldType({ ...arg, field: computedField })
        }
    }

    return <StaticField {...arg} />
}


/**
 * createForm
 * 主要负责渲染
 */
export function createForm({ title, description, fields, constraints, getConstraintArgs, fixedValues, initialValues }: FormDef) {
    const fieldNames = fields.map(f => f.name)
    // CAUTION 不要把 initialValue/fixedValue 放在这里，因为在 renderFieldType 是要用到 asLeaf 的，而且可能有嵌套结构
    const fieldValues = reactive({})

    const fieldTouchedStatus = reactive({})

    // 这个时候正确的 fieldValues 都还没有生成啊。所以这个时候根本就没有访问到正确的 fieldValue atom，所以注册不正确
    // TODO 这里的 fieldName 不正确啊，因为 field 可能是函数，要改
    const constraintDepsAndComputeds = createFormConstraintsAndDepComputed(constraints, getConstraintArgs, fieldValues, fieldNames)
    // 这里应该也是生成一个 proxy，在 render 里面根据自己的 fieldName 得到一个 reactive 对象。
    const node = (
        <form>
            <div className="">
                <h2 className="text-base font-semibold leading-7 text-gray-900">{title}</h2>
                <p className="mt-1 text-sm leading-6 text-gray-600">{description}</p>
                <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-6">
                    {incMap(fields, (field: Atom<FormStaticFieldType>) => renderFieldType({ field, fieldValues, fixedValues, initialValues, fieldTouchedStatus, constraintDepsAndComputeds, fieldNames }))}
                </div>
            </div>
        </form>
    )

    return { node, fieldValues }
}


const globalFieldDepTmp: string[] = []
let globalFieldDepCollectorInUse: boolean = false
function resetHasUntouchedMark() {
    globalFieldDepTmp.splice(0, Infinity)
}

function flashFieldDep() {
    const result = [...globalFieldDepTmp]
    resetHasUntouchedMark()
    globalFieldDepCollectorInUse = false
    return result
}

const formValueProxyCache = new WeakMap<any, any>()

function getFormValueProxy(fieldValues: object, fieldNames: string[]) {
    if (globalFieldDepCollectorInUse) throw new Error('proxy is still in use')
    if (globalFieldDepTmp.length) throw new Error('hasUntouched is already true before using')

    globalFieldDepCollectorInUse = true

    let proxy = formValueProxyCache.get(fieldValues)
    if (!proxy) {
        formValueProxyCache.set(fieldValues, (proxy = new Proxy(fieldValues, {
            get(target, fieldName: string) {
                if (!globalFieldDepCollectorInUse) throw new Error('proxy is not in use')
                if (fieldNames.includes(fieldName)) globalFieldDepTmp.push(fieldName)
                return fieldValues[fieldName]
            }
        })))
    }

    return proxy
}

type ConstraintDepsAndComputed = {
    deps: Set<string>,
    computed: Atom<boolean>
}

type ConstraintDepsAndComputeds = {
    [k: string]: ConstraintDepsAndComputed
}

// CAUTION constraints 可能第一次运行时候不会读取所有属性，例如其中有根据 fieldValue 的某个值进行的条件判断，那么就会有些语句没被执行到。
//  但是这里又不能像 field constraint 一样约定用户把有可能要读的值通过结构的方式获取，因为可能是 collection。
//  所以这里吧 deps 做成只加不减的 reactive。
function createFormConstraintsAndDepComputed(constraints: FormDef['constraints'], getConstraintArgs: FormDef['getConstraintArgs'], fieldValues = {}, fieldNames: string[]): ConstraintDepsAndComputeds {
    if (!constraints) return {}

    return Object.fromEntries(Object.entries(constraints).map(([fieldName, createConstraintComputed]) => {
        const [deps, fieldValuesProxy] = createReactiveDep(createConstraintComputed, fieldValues, fieldNames)
        const source = getConstraintArgs!(fieldValuesProxy)
        const constraintComputed = createConstraintComputed(source) as Atom<boolean>


        return [fieldName, { deps, computed: constraintComputed }]
    }))
}


function createReactiveDep(createConstraintComputed: (arg: any[]) => boolean, fieldValues: object, fieldNames: string[]): [Set<string>, object] {
    const fieldDeps = reactive(new Set<string>())
    const proxy = new Proxy(fieldValues, {
        get(target, fieldName: string) {
            if (fieldNames.includes(fieldName)) fieldDeps.add(fieldName)
            return fieldValues[fieldName]
        }
    })
    return [fieldDeps, proxy]
}