export function assert(condition: any, message: string ) {
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
