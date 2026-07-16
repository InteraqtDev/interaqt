/**
 * 迁移 kill-resume 故障注入助手（从 migrationGenerativeFuzz 抽取的唯一实现）：
 * 包装 Database，在第 N 次 DB 调用处抛错模拟进程崩溃。arm() 后开始计数；
 * 触发一次后自动解除（恢复路径不再受扰）。
 */
import type { Database } from '@runtime';

export function createFaultInjectedDb(inner: Database, faultAtCall: number): Database & { arm: () => void } {
    let armed = false
    let calls = 0
    const interceptable = new Set(['scheme', 'query', 'insert', 'update', 'delete'])
    const wrapper = new Proxy(inner as object, {
        get(target, prop, receiver) {
            const value = Reflect.get(target, prop, receiver)
            if (prop === 'arm') return () => { armed = true; calls = 0 }
            if (typeof value === 'function' && interceptable.has(String(prop))) {
                return (...args: unknown[]) => {
                    if (armed && ++calls >= faultAtCall) {
                        armed = false
                        throw new Error(`[fault-injection] simulated crash at db call #${calls} (${String(prop)})`)
                    }
                    return (value as (...a: unknown[]) => unknown).apply(target, args)
                }
            }
            return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value
        }
    })
    return wrapper as Database & { arm: () => void }
}
