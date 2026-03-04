export function assert(condition: unknown, message: string ) {
    if (!condition) {
        // if (__DEV__) debugger
        throw new Error(message)
    }
}

export function filterMap<K, V>(map: Map<K, V>, handle: (key: K, value: V) => boolean) {
    return new Map(Array.from(map.entries()).map(([key, value]) => [key, handle(key, value)]))
}


export function indexBy(arr: Record<string, unknown>[], key: string) {
    return Object.fromEntries(arr.map(o => [o[key], o]))
}

export function mapObject(a: object, fn: (k: string, v: unknown) => unknown) {
    return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, fn(k, v)]))
}

export async function everyAsync<T>(items: T[], check: (arg:T) => Promise<boolean>) {
    for(let item of items) {
        const result = await check(item)
        if (!result) return false
    }
    return true
}

export async function someAsync<T>(arr: T[], handle: (t: T) => Promise<boolean>): Promise<boolean> {
    for(let i of arr) {
        if (await handle(i)) return true
    }
    return false
}

export async function everyWithErrorAsync<T, U>(items: T[], check: (arg:T) => Promise<true|U>) : Promise<true|U> {
    for(let item of items) {
        const result = await check(item)
        if (result!== true) return result
    }
    return true
}