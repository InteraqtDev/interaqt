type PlainObject = {
  [k: string] : any
}

export function each(obj: PlainObject, fn: (v: any, k: string) => any) {
  for(let k in obj) {
    fn(obj[k], k)
  }
}

export const isPlainObject = (val: unknown): val is object => val?.constructor === Object || val?.constructor === Array

const hasOwnProperty = Object.prototype.hasOwnProperty
export const hasOwn = (
    val: object,
    key: string | symbol
) => hasOwnProperty.call(val, key)

export function assert(condition: boolean, message: string ) {
  if (!condition) {
    // if (__DEV__) debugger
    throw new Error(message)
  }
}

export const isObject = (val: unknown): val is Record<any, any> =>
    val !== null && typeof val === 'object'


export function indexBy(arr: any[], key: string) {
  return Object.fromEntries(arr.map(o => [o[key], o]))
}
