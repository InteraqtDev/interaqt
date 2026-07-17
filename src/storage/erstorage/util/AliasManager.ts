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
     * EXISTS 子查询前缀的长度预算（r36）：最终标识符 = `<前缀>___<路径别名>`，
     * 前缀经 registerSubqueryPrefix 一律 token 化（`Q<n>`，含 `___` 分隔符 ≤ 8 字节），
     * 所以路径别名的上限必须让出这份预算——否则 55~63 字节的路径别名在子查询作用域内
     * 拼上前缀后仍会越过 63 字节（见 registerSubqueryPrefix 的截断遮蔽机理）。
     */
    private readonly SUBQUERY_PREFIX_BUDGET = 8

    /**
     * 注册一个表路径，如果需要会生成别名
     * @param path 表的完整路径（如 "User" 或 "User_posts_Post"）
     * @returns 安全的别名
     */
    registerTablePath(path: string): string {
        // 如果已经注册过，直接返回
        const existing = this.tablePathToAlias.get(path)
        if (existing) return existing
        
        // 如果路径本身（含子查询前缀预算）不超过限制，直接使用
        if (path.length <= this.MAX_IDENTIFIER_LENGTH - this.SUBQUERY_PREFIX_BUDGET) {
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
     * 注册 EXISTS 子查询的别名前缀（r36）。
     *
     * 与 registerTablePath 的「超长才缩短」不同，这里**一律**返回短 token（Q1, Q2...）：
     * 子查询内的每个别名 = `前缀___路径别名`，前缀是逐层串联的（嵌套 exist 的前缀包含
     * 全部外层前缀链），原始形态随嵌套深度/名字长度线性增长。PostgreSQL 把超过 63 字节
     * 的标识符**静默截断**——内层 FROM 别名的前 63 字节恰好等于外层子查询别名时，
     * 截断形在内层作用域遮蔽外层别名，关联引用解析到错误的表（`column ... does not exist`
     * 或更糟的静默错列）。token 固定 2-4 字节，把前缀对总长的贡献压到常数。
     * 同一原始前缀恒返回同一 token（确定性）；token 命名空间（Q#）与超长表路径的 T#
     * 分离，互不碰撞。
     */
    registerSubqueryPrefix(path: string): string {
        const existing = this.subqueryPrefixToAlias.get(path)
        if (existing) return existing
        const alias = `Q${this.subqueryPrefixCounter++}`
        this.subqueryPrefixToAlias.set(path, alias)
        return alias
    }
    private subqueryPrefixCounter = 1
    private subqueryPrefixToAlias = new Map<string, string>()

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

