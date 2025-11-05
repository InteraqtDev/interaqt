/**
 * FieldAliasMap - 管理字段路径到别名的映射
 * 
 * 用于处理超长字段名的问题（例如 PGLite 限制为 63 个字符）
 */
export class FieldAliasMap {
    aliasToPath: Map<string, string[]> = new Map()
    pathStrToAlias: Map<string, string> = new Map()
    aliasPlaceholder: number = 0
    
    /**
     * 获取路径对应的别名
     * @param path 字段路径数组
     * @param forceCreate 如果不存在是否强制创建
     */
    getAlias(path: string[], forceCreate = false): string | undefined {
        const pathStr = path.join('.')
        const alias = this.pathStrToAlias.get(pathStr)
        if (alias || !forceCreate) return alias

        const newAlias = `FIELD_${this.aliasPlaceholder++}`
        this.pathStrToAlias.set(pathStr, newAlias)
        this.aliasToPath.set(newAlias, path)
        return newAlias
    }
    
    /**
     * 通过别名获取原始路径
     * @param alias 别名
     */
    getPath(alias: string): string[] | undefined {
        return this.aliasToPath.get(alias)
    }
}

