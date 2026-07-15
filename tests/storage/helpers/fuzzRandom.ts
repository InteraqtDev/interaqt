/**
 * 生成式测试共用的确定性随机源（mulberry32）与抽样助手。
 * 各 fuzzer（写路径结构化 / 驱动差分 / 计算层 / 迁移）共享同一实现，
 * 保证「种子 ⇒ 决策流」跨套件可复现。
 */
export type Rng = () => number

export function mulberry32(seed: number): Rng {
    let a = seed >>> 0
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

export const pick = <T,>(rng: Rng, items: T[]): T => items[Math.floor(rng() * items.length)]
export const chance = (rng: Rng, p: number) => rng() < p
export const int = (rng: Rng, max: number) => Math.floor(rng() * max)
