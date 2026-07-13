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

// ============ timestamp 归一化（r26 遗留收口，r24/r25 boolean/json 归一化家族的最后一格） ============
// 契约：type:'timestamp' 属性在 JS 面统一为 epoch 毫秒 number——
//  写入接受 Date | number(ms) | ISO 字符串；读取（find/atomic）恒返回 number。
//  物理列型保持既有映射（SQLite INT / PG 系 TIMESTAMP / MySQL TIMESTAMP，改列型会动 modelHash）。

export function normalizeTimestampInputToMs(value: unknown, context: string): number {
    if (value instanceof Date) {
        const ms = value.getTime()
        if (Number.isNaN(ms)) throw new Error(`Invalid Date for timestamp ${context}.`)
        return ms
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error(`Invalid number ${value} for timestamp ${context}; expected epoch milliseconds.`)
        return value
    }
    if (typeof value === 'string') {
        const ms = Date.parse(value)
        if (Number.isNaN(ms)) throw new Error(`Cannot parse "${value}" as a timestamp for ${context}; expected epoch milliseconds, Date, or an ISO-8601 string.`)
        return ms
    }
    throw new Error(`Unsupported timestamp value (${typeof value}) for ${context}; expected epoch milliseconds, Date, or an ISO-8601 string.`)
}

// 各方言的可绑定形态：TIMESTAMP 列（PG 系/MySQL）绑定 Date（驱动原生编码）；SQLite INT 列绑定毫秒数。
export function timestampParamForDialect(ms: number, dialectName: string): unknown {
    return dialectName === 'sqlite' ? ms : new Date(ms)
}

// 读侧归一化：PG 系/MySQL 驱动返回 Date；SQLite 返回 number；个别路径可能出现字符串。
export function normalizeTimestampReadValue(value: unknown): unknown {
    if (value === null || value === undefined) return value
    if (value instanceof Date) return value.getTime()
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
        const ms = Date.parse(value)
        return Number.isNaN(ms) ? value : ms
    }
    return value
}
