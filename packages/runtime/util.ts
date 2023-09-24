export function assert(condition: boolean, message: string ) {
    if (!condition) {
        // if (__DEV__) debugger
        throw new Error(message)
    }
}

export function filterMap(map: Map<any, any>, handle: (key: any, value: any) => boolean) {
    return new Map(Array.from(map.entries()).map(([key, value]) => [key, handle(key, value)]))
}


export function indexBy(arr: any[], key: string) {
    return Object.fromEntries(arr.map(o => [o[key], o]))
}

export function mapObject(a: object, fn: (k: string, v: any) => any) {
    return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, fn(k, v)]))
}