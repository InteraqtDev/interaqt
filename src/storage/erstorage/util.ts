export function flatten<T>(arr: (T|T[])[]) {
    const result: T[] = []
    arr.forEach(i => result.push(...(Array.isArray(i) ? i: [i])))
    return result
}
export async function someAsync<T>(arr: T[], handle: (t:T) => Promise<boolean>): Promise<boolean>
export async function someAsync(arr: unknown[], handle: (t: unknown) => Promise<boolean>): Promise<boolean> {
    for(let i of arr) {
        if (await handle(i)) return true
    }
    return false
}

export function isRelation(relation: unknown): boolean {
    return relation !== null && typeof relation === 'object' && 'source' in relation && 'target' in relation
}



export function indexBy(arr: Record<string, unknown>[], key: string) {
    return Object.fromEntries(arr.map(o => [o[key], o]))
}

export function assert(condition: unknown, message: string ) {
    if (!condition) {
        // if (__DEV__) debugger
        throw new Error(message)
    }
}