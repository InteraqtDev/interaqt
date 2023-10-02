

type PlainObject = {
  [k: string] : any
}

export function each(obj: PlainObject, fn: (v: any, k: string) => any) {
  for(let k in obj) {
    fn(obj[k], k)
  }
}

export function nextJob(fn: Function) {
  Promise.resolve().then(() => fn())
}

export function debounce(fn: Function, delay: number) {
  let timeoutHandle: number | null
  return (...argv: any[]) => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
      timeoutHandle = null
    }

    timeoutHandle = window.setTimeout(() => {
      fn(...argv)
    }, delay)
  }
}

export function idleThrottle(fn: Function, timeout = 100) {
  let hasCallback: number | null
  let lastArgv : any[]
  return (...argv: any[]) => {
    if (!hasCallback) {
      hasCallback = window.requestIdleCallback(() => {
        fn(...lastArgv)
        hasCallback = null
      }, {timeout})
    }
    lastArgv = argv
  }
}

export function removeNodesBetween(start: ChildNode, endNode: ChildNode|Comment, includeEnd = false) {
  if (start.parentElement !== endNode.parentElement) {
    throw new Error('placeholder and element parentElement not same')
  }

  let pointer = start
  while(pointer !== endNode) {
    const current = pointer
    pointer = current.nextSibling!
    if(!pointer) throw new Error('can not find nextSibling')
    current.remove()
  }

  if (includeEnd) endNode.remove()
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

export function mapClassNameToObject(className: string) {
  return Object.fromEntries(className.split(' ').map(c => [c, true]))
}
export const isObject = (val: unknown): val is Record<any, any> =>
    val !== null && typeof val === 'object'


export function indexBy(arr: any[], key: string) {
  return Object.fromEntries(arr.map(o => [o[key], o]))
}
