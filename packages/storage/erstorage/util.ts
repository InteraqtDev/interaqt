export function flatten<T>(arr: (T|T[])[]) {
    const result: T[] = []
    arr.forEach(i => result.push(...(Array.isArray(i) ? i: [i])))
    return result
}
export async function someAsync<T>(arr: T[], handle: (t:T) => Promise<boolean>)
export async function someAsync(arr, handle) {
    for(let i of arr) {
        if (await handle(i)) return true
    }
    return false
}