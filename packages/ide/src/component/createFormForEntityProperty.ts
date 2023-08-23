import {createForm, FormStaticFieldType} from "./createForm";
import {reactive} from "rata";


type FormFieldTypeOrGroup = FormStaticFieldType | { name: string, children: FormFieldTypeOrGroup[] } | FormFieldTypeOrGroup[]


type FormDefType = {
    fields: FormFieldTypeOrGroup[]
}


type EntityPropertyOptions = {
    single: boolean
}

type RenderFormOptions = {
    title: string,
    description: string
}

type FormOptions = {
    getConstraintArgs?: (...arg: any[]) => any,
    initialValues?: object,
    fixedValues?: object,
    fields? : string[]
}

export function createFormForEntityProperty<T>(EntityType: typeof T, propertyName: string, instance: T, renderOptions?: RenderFormOptions) {
    const PropertyDef = EntityType.public[propertyName]
    const PropertyType = PropertyDef.type

    const getConstraintArgs =  (fieldValues) => {
        // TODO 要不要其他字段一起？理论上需要
            return {
            [propertyName]: PropertyDef.collection ?
                reactive((instance[propertyName] as any[]).concat(fieldValues)) :
                fieldValues
        }
    }

    return createFormForEntity(PropertyType, { getConstraintArgs }, renderOptions)
}

export function createFormForEntity<T>(EntityType: typeof T, formOptions? : FormOptions, renderOptions?: RenderFormOptions) {
    const propertyNames = formOptions?.fields || Object.keys(EntityType.public)

    return createForm({
        title: renderOptions?.title,
        description: renderOptions?.description,
        // 写在 Entity 的对这个 Prop 的约束
        constraints: EntityType.constraints,
        getConstraintArgs: formOptions?.getConstraintArgs,
        fixedValues: formOptions?.fixedValues,
        initialValues: formOptions?.initialValues,
        // FIXME computedType 的情况还不知道怎么处理
        fields: propertyNames.map(propName => createField(EntityType, propName)).filter(x => x)
    })
}


export function createField(Klass, propName: string){
    if (
        typeof Klass.public[propName].type !== 'string' ||
        Array.isArray(Klass.public[propName].type) // or type 的情况
    ) {
        return null
    }


    if (!Klass.public[propName].type && Klass.public[propName].computedType) {
        // 如果没有 type 那么必须有 computedType，动态返回 type
        return (prop) => {
            const Type = Klass.public[propName].computedType(prop)
            if (!Type) return null

            const childPropNames = Object.keys(Type.public)
            // TODO 2. 如何是可识别的，如何自动往下递归的呢？哪些可以递归那些不能，怎么识别？？默认递归，除非是专门注册了渲染器的就不管了？
            return {
                name: propName,
                children: childPropNames.map(childPropName => createField(Type, childPropName))
            }
        }
    }


    // TODO shape，以后可能可以有复核结构的自动处理，例如地址？
    return {
        name: propName,
        required: Klass.public[propName].required,
        type: Klass.public[propName].type,
        defaultValue: Klass.public[propName].defaultValue,
        // constraints 参数怎么构建？
        constraints: Klass.public[propName].constraints,
        options: Klass.public[propName].options,
        runConstraints: () => {

        }
    }
}