/**
 * AliasManager - 统一管理所有别名生成
 * 
 * 在 Setup 阶段生成所有需要的别名，避免运行时动态生成
 * 使用简单的计数器策略，保证稳定性和可预测性
 */
export class AliasManager {
    private tableAliasCounter = 1
    private fieldAliasCounter = 1
    
    /** 表别名映射：完整路径 -> 简短别名 */
    private tablePathToAlias = new Map<string, string>()
    private tableAliasToPath = new Map<string, string>()
    
    /** 字段别名映射：完整路径字符串 -> 简短别名 */
    private fieldPathToAlias = new Map<string, string>()
    /** 字段别名映射：简短别名 -> 路径数组 */
    private fieldAliasToPath = new Map<string, string[]>()
    
    /** PostgreSQL 标识符的最大长度 */
    private readonly MAX_IDENTIFIER_LENGTH = 63
    
    /**
     * 注册一个表路径，如果需要会生成别名
     * @param path 表的完整路径（如 "User" 或 "User_posts_Post"）
     * @returns 安全的别名
     */
    registerTablePath(path: string): string {
        // 如果已经注册过，直接返回
        const existing = this.tablePathToAlias.get(path)
        if (existing) return existing
        
        // 如果路径本身不超过限制，直接使用
        if (path.length <= this.MAX_IDENTIFIER_LENGTH) {
            this.tablePathToAlias.set(path, path)
            this.tableAliasToPath.set(path, path)
            return path
        }
        
        // 生成简短别名 T1, T2, T3...
        const alias = `T${this.tableAliasCounter++}`
        this.tablePathToAlias.set(path, alias)
        this.tableAliasToPath.set(alias, path)
        return alias
    }
    
    /**
     * 获取表别名（必须先注册）
     */
    getTableAlias(path: string): string | undefined {
        return this.tablePathToAlias.get(path)
    }
    
    /**
     * 通过别名获取原始表路径
     */
    getTablePath(alias: string): string | undefined {
        return this.tableAliasToPath.get(alias)
    }
    
    /**
     * 注册一个字段路径，生成别名
     * @param path 字段的完整路径数组（如 ["User", "posts", "title"]）
     * @returns 字段别名
     */
    registerFieldPath(path: string[]): string {
        const pathStr = path.join('.')
        
        // 如果已经注册过，直接返回
        const existing = this.fieldPathToAlias.get(pathStr)
        if (existing) return existing
        
        // 生成简短别名 F1, F2, F3...
        const alias = `FIELD_${this.fieldAliasCounter++}`
        this.fieldPathToAlias.set(pathStr, alias)
        this.fieldAliasToPath.set(alias, path)
        return alias
    }
    
    /**
     * 获取字段别名（必须先注册）
     */
    getFieldAlias(path: string[]): string | undefined {
        return this.fieldPathToAlias.get(path.join('.'))
    }
    
    /**
     * 通过别名获取原始字段路径
     */
    getFieldPath(alias: string): string[] | undefined {
        return this.fieldAliasToPath.get(alias)
    }
    
    /**
     * 批量预生成表别名
     * @param paths 所有可能的表路径
     */
    preregisterTablePaths(paths: string[]): void {
        paths.forEach(path => this.registerTablePath(path))
    }
    
    /**
     * 获取所有表别名映射（用于调试）
     */
    getTableAliasMap(): Map<string, string> {
        return new Map(this.tablePathToAlias)
    }
    
    /**
     * 获取所有字段别名映射（用于调试）
     * 返回路径字符串到别名的映射
     */
    getFieldAliasMap(): Map<string, string> {
        return new Map(this.fieldPathToAlias)
    }
    
    /**
     * 获取所有字段路径映射（用于调试）
     * 返回别名到路径数组的映射
     */
    getFieldPathMap(): Map<string, string[]> {
        return new Map(this.fieldAliasToPath)
    }
    
    /**
     * 清空所有别名（仅用于测试）
     */
    clear(): void {
        this.tableAliasCounter = 1
        this.fieldAliasCounter = 1
        this.tablePathToAlias.clear()
        this.tableAliasToPath.clear()
        this.fieldPathToAlias.clear()
        this.fieldAliasToPath.clear()
    }
}

