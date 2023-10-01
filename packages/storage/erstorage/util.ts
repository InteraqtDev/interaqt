export function flatten<T>(arr: (T|T[])[]) {
    const result: T[] = []
    arr.forEach(i => result.push(...(Array.isArray(i) ? i: [i])))
    return result
}