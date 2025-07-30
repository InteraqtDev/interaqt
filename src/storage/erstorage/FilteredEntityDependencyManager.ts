import { MatchExpressionData, MatchAtom } from "./MatchExp.js"
import { BoolExp } from "@shared"
import { EntityToTableMap } from "./EntityToTableMap.js"

export interface FilteredEntityDependency {
    filteredEntityName: string
    sourceEntityName: string
    filterCondition: MatchExpressionData
    dependencies: {
        entityName: string
        path: string[]  // 从 source entity 到依赖 entity 的路径
        attributes: string[]  // 依赖的属性列表
    }[]
}

export class FilteredEntityDependencyManager {
    private dependencies: Map<string, FilteredEntityDependency[]> = new Map()
    
    constructor(private map: EntityToTableMap) {}
    
    /**
     * 分析 filtered entity 的过滤条件，提取所有依赖的实体和路径
     */
    analyzeDependencies(filteredEntityName: string, sourceEntityName: string, filterCondition: MatchExpressionData): FilteredEntityDependency {
        const dependencies: FilteredEntityDependency['dependencies'] = []
        this.extractDependenciesFromExpression(sourceEntityName, filterCondition, dependencies)
        
        const dependency: FilteredEntityDependency = {
            filteredEntityName,
            sourceEntityName,
            filterCondition,
            dependencies
        }
        

        
        // 注册依赖关系
        for (const dep of dependencies) {
            if (!this.dependencies.has(dep.entityName)) {
                this.dependencies.set(dep.entityName, [])
            }
            this.dependencies.get(dep.entityName)!.push(dependency)
        }
        
        // 也注册源实体自身
        if (!this.dependencies.has(sourceEntityName)) {
            this.dependencies.set(sourceEntityName, [])
        }
        this.dependencies.get(sourceEntityName)!.push(dependency)
        
        return dependency
    }
    
    /**
     * 从匹配表达式中提取依赖关系
     */
    private extractDependenciesFromExpression(
        entityName: string, 
        expression: MatchExpressionData,
        dependencies: FilteredEntityDependency['dependencies']
    ) {
        // MatchExpressionData 是 BoolExp<MatchAtom> 的别名
        // 使用 BoolExp.fromValue 来获取正确的实例
        const boolExp = expression instanceof BoolExp ? expression : BoolExp.fromValue(expression)
        
        if (boolExp.isExpression()) {
            if (boolExp.left) {
                this.extractDependenciesFromExpression(entityName, boolExp.left.raw as MatchExpressionData, dependencies)
            }
            if (boolExp.right) {
                this.extractDependenciesFromExpression(entityName, boolExp.right.raw as MatchExpressionData, dependencies)
            }
        } else if (boolExp.isAtom()) {
            const matchAtom = boolExp.data as MatchAtom
            const key = matchAtom.key
            const pathParts = key.split('.')
            
            // 如果路径只有一个部分，说明是源实体自身的属性
            if (pathParts.length === 1) {
                const existing = dependencies.find(d => d.entityName === entityName && d.path.length === 0)
                if (existing) {
                    if (!existing.attributes.includes(pathParts[0])) {
                        existing.attributes.push(pathParts[0])
                    }
                } else {
                    dependencies.push({
                        entityName,
                        path: [],
                        attributes: [pathParts[0]]
                    })
                }
            } else {
                // 路径包含多个部分，需要解析关联实体
                const fullPath = [entityName].concat(pathParts)
                
                // 获取路径中每个节点的信息
                for (let i = 1; i < fullPath.length - 1; i++) {
                    const currentPath = fullPath.slice(0, i + 1)
                    const info = this.map.getInfoByPath(currentPath)
                    
                    if (info && info.isRecord) {
                        const depEntityName = info.recordName
                        const depPath = pathParts.slice(0, i)
                        const attribute = pathParts[pathParts.length - 1]
                        
                        const existing = dependencies.find(d => 
                            d.entityName === depEntityName && 
                            JSON.stringify(d.path) === JSON.stringify(depPath)
                        )
                        
                        if (existing) {
                            if (!existing.attributes.includes(attribute)) {
                                existing.attributes.push(attribute)
                            }
                        } else {
                            dependencies.push({
                                entityName: depEntityName,
                                path: depPath,
                                attributes: [attribute]
                            })
                        }
                    }
                }
            }
        }
    }
    
    /**
     * 获取某个实体变更时影响的所有 filtered entity
     */
    getAffectedFilteredEntities(entityName: string): FilteredEntityDependency[] {
        return this.dependencies.get(entityName) || []
    }
    
    /**
     * 清除所有依赖关系
     */
    clear() {
        this.dependencies.clear()
    }
} 