/**
 * RecursiveContext - 用于追踪递归查询的上下文
 * 
 * 在递归查询中维护当前的查询栈，用于：
 * 1. 检测循环引用
 * 2. 提供上下文数据给查询条件
 */
export const ROOT_LABEL = ':root'

export class RecursiveContext {
    constructor(
        public label: string, 
        public parent?: RecursiveContext, 
        public stack: unknown[] = []
    ) {}
    
    concat(value: unknown): RecursiveContext {
        return new RecursiveContext(this.label, this.parent, [...this.stack, value])
    }

    getStack(key: string): unknown[] {
        return [...this.stack]
    }

    /**
     * 创建一个新的子上下文
     */
    spawn(label: string): RecursiveContext {
        return new RecursiveContext(label, this)
    }
}

