export function assert(condition: unknown, message: string ) {
    if (!condition) {
        // if (__DEV__) debugger
        throw new Error(message)
    }
}

type ObjectContainer = {
    [k:string]: ObjectContainer|any
}

export function setByPath(root: ObjectContainer, inputPath: string[], value: any) {
    const path = [...inputPath]
    let pointer = root
    let nextAttr
    const lastAttr = path.pop()!
    while(nextAttr = path.shift()) {
        if (!pointer[nextAttr]) pointer[nextAttr] = {}
        pointer = pointer[nextAttr]
    }

    pointer[lastAttr] = value
    return true
}


export function mapTree(root: ObjectContainer, iteratorKeys: string[], fn: (object: any, context :string[]) => any, context: string[] = []) {
    const result = fn(root, context)
    iteratorKeys.forEach(key => {
        if (result[key]) result[key] = mapTree(result[key] as ObjectContainer, iteratorKeys, fn, context.concat(key))
    })

    return result
}


export function deepMerge(a: ObjectContainer, b: ObjectContainer) {
    const result: any = {}
    const keys = new Set(Object.keys(a).concat(Object.keys(b)))
    keys.forEach(k => {
        if (a[k] && b[k]) {
            assert(typeof a[k] === 'object' && typeof b[k]=== 'object', `${a[k]} or ${b[k]} is not object, cannot deep merge`)
            result[k] = deepMerge(a[k], b[k])
        } else if (a[k]) {
            result[k] = a[k]
        } else {
            result[k] = b[k]
        }
    })
    return result
}


export function indexBy(arr: Record<string, unknown>[], key: string) {
return Object.fromEntries(arr.map(o => [o[key], o]))
}

/**
 * 与 JSON.stringify 等价，但对象键按字典序排序（递归），产出规范形（canonical form）。
 *
 * json 列的写入与等值匹配都用这个序列化：文本型比较的驱动（SQLite 未实现 json 方言时的
 * 回退路径）对键序不再敏感，与 PG 系（::jsonb）/ MySQL（CAST AS JSON）的语义相等比较对齐。
 * 数组顺序是 JSON 语义的一部分，保持不变。
 */
export function canonicalJSONStringify(value: unknown): string {
    return JSON.stringify(sortObjectKeysDeep(value))
}

function sortObjectKeysDeep(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(item => sortObjectKeysDeep(item))
    if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
        const record = value as Record<string, unknown>
        return Object.fromEntries(Object.keys(record).sort().map(key => [key, sortObjectKeysDeep(record[key])]))
    }
    return value
}