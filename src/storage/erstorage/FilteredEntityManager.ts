import { MatchExpressionData, MatchAtom, MatchExp } from "./MatchExp.js"
import { BoolExp } from "@core"
import { EntityToTableMap, MapData } from "./EntityToTableMap.js"
import { RecordQueryAgent } from "./RecordQueryAgent.js"
import { RecordQuery } from "./RecordQuery.js"
import { RecordMutationEvent } from "@runtime"

export interface FilteredEntityDependency {
    filteredEntityName: string
    baseEntityName: string
    matchExpression: MatchExpressionData
    dependencies: {
        entityName: string
        path: string[]  // 从 base entity 到依赖 entity 的路径
        attributes: string[]  // 依赖的属性列表
    }[]
}

// CAUTION 依赖分析结果只由不可变的 MapData 决定，按 MapData 缓存。
//  否则每次 new RecordQueryAgent / EntityQueryHandle（例如 migration 中的临时 handle）都会全量重算。
const dependenciesByMapData = new WeakMap<MapData, Map<string, FilteredEntityDependency[]>>()

/**
 * 管理 filtered entity 的所有功能，包括依赖分析、跨实体查询和级联事件处理
 */
export class FilteredEntityManager {
    private dependencies: Map<string, FilteredEntityDependency[]>

    constructor(private map: EntityToTableMap, private queryAgent: RecordQueryAgent) {
        const cached = dependenciesByMapData.get(map.data)
        if (cached) {
            this.dependencies = cached
        } else {
            this.dependencies = new Map()
            dependenciesByMapData.set(map.data, this.dependencies)
            this.initializeDependencies()
        }
    }

    /**
     * 初始化所有 filtered entity 的依赖关系（每个 MapData 只计算一次）
     */
    private initializeDependencies() {
        for (const [recordName, recordData] of Object.entries(this.map.data.records)) {
            // 统一判断：如果有 matchExpression 且 resolvedBaseRecordName 不指向自己，说明是 filtered entity
            // 普通 entity 没有 matchExpression 或 resolvedBaseRecordName 指向自己
            if (recordData.matchExpression && recordData.resolvedBaseRecordName && recordData.resolvedBaseRecordName !== recordName) {
                this.analyzeDependencies(
                    recordName,
                    recordData.resolvedBaseRecordName,
                    recordData.resolvedMatchExpression || recordData.matchExpression
                )
            }
        }
    }
    
    // ============ 依赖管理功能 ============
    
    /**
     * 分析 filtered entity 的过滤条件，提取所有依赖的实体和路径
     */
    analyzeDependencies(filteredEntityName: string, baseEntityName: string, matchExpression: MatchExpressionData): FilteredEntityDependency {
        const dependencies: FilteredEntityDependency['dependencies'] = []
        this.extractDependenciesFromExpression(baseEntityName, matchExpression, dependencies)
        
        const dependency: FilteredEntityDependency = {
            filteredEntityName,
            baseEntityName,
            matchExpression,
            dependencies
        }
        
        // 注册依赖关系。
        // CAUTION 同一个 dependency 在同一个实体名下只能注册一次。
        //  谓词包含 base 自身属性时 dependencies 里也会出现 baseEntityName，
        //  如果这里再无条件注册一次，update 时会对同一条记录做双倍的 membership 查询（结果幂等但白做）。
        const entityNamesToRegister = new Set<string>(dependencies.map(dep => dep.entityName))
        // 源实体自身也要注册（即使谓词没有直接引用它的属性）
        entityNamesToRegister.add(baseEntityName)
        for (const entityName of entityNamesToRegister) {
            if (!this.dependencies.has(entityName)) {
                this.dependencies.set(entityName, [])
            }
            const registered = this.dependencies.get(entityName)!
            if (!registered.includes(dependency)) {
                registered.push(dependency)
            }
        }

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
        const boolExp = BoolExp.fromValue(expression as any)
        
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

            const addDependency = (depEntityName: string, depPath: string[], attribute: string) => {
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

            // 如果路径只有一个部分，说明是源实体自身的属性
            if (pathParts.length === 1) {
                addDependency(entityName, [], pathParts[0])
            } else {
                // 路径包含多个部分（跨实体过滤）。这里要登记两类依赖：
                // 1. 末端值属性所在实体的该属性（例如 team.department.budget -> Department.budget）
                // 2. 路径上"每一段关系"本身。因为关系（link）的建立/解除同样会改变成员资格，
                //    而之前的实现只登记了末端属性，忽略了关系边，导致关系变更时 filtered entity
                //    的标记和事件不更新（脏状态）。
                const fullPath = [entityName].concat(pathParts)

                // 逐段登记关系依赖：owner 实体的关系属性变化会影响成员资格。
                // i 对应关系段在 pathParts 中的下标；owner 是该关系所属实体，ownerPath 是从 base 到 owner 的路径。
                let ownerEntity = entityName
                for (let i = 0; i < pathParts.length - 1; i++) {
                    const relationAttr = pathParts[i]
                    const ownerPath = pathParts.slice(0, i) // 从 base 到 owner 的关系路径
                    const info = this.map.getInfoByPath(fullPath.slice(0, i + 2))
                    // 关系段本身作为依赖：owner.relationAttr 变化 -> 需要反查回 base 重新求值
                    addDependency(ownerEntity, ownerPath, relationAttr)
                    if (info && info.isRecord) {
                        ownerEntity = info.recordName
                    }
                }

                // 末端值属性：所在实体是路径倒数第二段指向的实体（即上面循环结束时的 ownerEntity）
                const valueAttribute = pathParts[pathParts.length - 1]
                const valuePath = pathParts.slice(0, pathParts.length - 1)
                addDependency(ownerEntity, valuePath, valueAttribute)
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
     * 清除所有依赖关系（同时失效按 MapData 共享的缓存）
     */
    clear() {
        this.dependencies.clear()
        dependenciesByMapData.delete(this.map.data)
    }
    
    // ============ 跨实体查询功能 ============
    
    /**
     * 根据依赖关系和变更的记录，查找所有受影响的源记录
     */
    async findAffectedSourceRecords(
        dependency: FilteredEntityDependency,
        changedEntityName: string,
        changedRecordId: string,
        changedAttributes: string[]
    ): Promise<{ id: string }[]> {
        // 找到这个实体在依赖中的定义
        const depInfo = dependency.dependencies.find(d => d.entityName === changedEntityName)
        if (!depInfo) {
            return []
        }
        
        // 检查变更的属性是否在依赖的属性列表中
        const relevantAttributes = changedAttributes.filter(attr => depInfo.attributes.includes(attr))
        if (relevantAttributes.length === 0) {
            return []
        }
        
        if (depInfo.path.length === 0) {
            // 如果路径为空，说明变更的就是源实体本身
            return [{ id: changedRecordId }]
        }
        
        return this.findSourceRecordsByReversePath(dependency, depInfo, changedRecordId)
    }

    /**
     * 根据依赖路径反向查询受影响的源记录（path.length > 0 的跨实体场景）
     */
    private async findSourceRecordsByReversePath(
        dependency: FilteredEntityDependency,
        depInfo: FilteredEntityDependency['dependencies'][number],
        changedRecordId: string
    ): Promise<{ id: string }[]> {
        // 构建反向查询，从变更的实体查找到源实体
        // path 已经是从源实体到目标实体的关系路径
        // 例如：对于 User 依赖 Team.type，path = ['team']
        // 我们需要查找所有 team.id = targetRecordId 的 User
        
        // 构建查询条件：path.id = targetRecordId
        const matchKey = depInfo.path.concat('id').join('.')
        const matchCondition = MatchExp.atom({
            key: matchKey,
            value: ['=', changedRecordId]
        })
        
        // 执行查询
            const query = RecordQuery.create(dependency.baseEntityName, this.map, {
            matchExpression: matchCondition,
            attributeQuery: ['id']
        })
        
        return this.queryAgent.findRecords(query, `find affected source records for ${dependency.baseEntityName}`)
    }
    
    /**
     * 检查记录是否满足 filtered entity 的条件
     */
    async checkRecordMatchesFilter(
        recordId: string,
        entityName: string,
        matchExpression: MatchExpressionData
    ): Promise<boolean> {
        const matchedIds = await this.checkRecordsMatchFilter([recordId], entityName, matchExpression)
        return matchedIds.has(recordId)
    }

    /**
     * 批量检查记录是否满足 filtered entity 的条件，返回满足条件的 id 集合。
     * CAUTION 一次 membership 查询覆盖所有记录，避免每条记录一次查询的 N+1。
     */
    async checkRecordsMatchFilter(
        recordIds: string[],
        entityName: string,
        matchExpression: MatchExpressionData
    ): Promise<Set<string>> {
        if (!this.queryAgent) {
            throw new Error('QueryAgent not set in FilteredEntityManager')
        }
        if (!recordIds.length) return new Set()

        const query = RecordQuery.create(entityName, this.map, {
            matchExpression: matchExpression.and({
                key: 'id',
                value: ['in', recordIds]
            }),
            attributeQuery: ['id']
        })

        const results = await this.queryAgent.findRecords(
            query,
            `check if records [${recordIds.join(',')}] match filter condition`
        )

        return new Set(results.map(r => r.id))
    }
    
    // ============ 级联事件处理功能 ============
    
    /**
     * 获取基于指定源实体的所有 filtered entities（包括级联的）
     */
    getFilteredEntitiesForBase(baseEntityName: string): Array<{ name: string, matchExpression: any }> {
        const result: Array<{ name: string, matchExpression: any }> = [];
        const resultSet = new Set<string>();
        const visited = new Set<string>();
        
        const collectFiltered = (entityName: string) => {
            if (visited.has(entityName)) return;
            visited.add(entityName);
            
            const recordInfo = this.map.getRecordInfo(entityName);
            const directFiltered = recordInfo.filteredBy || [];
            
            for (const filtered of directFiltered) {
                // 避免重复添加
                if (!resultSet.has(filtered.name)) {
                    resultSet.add(filtered.name);
                    
                    // 使用预计算的值
                    const filteredRecordInfo = this.map.getRecordInfo(filtered.name);
                    const combinedExpression = filteredRecordInfo.data.resolvedMatchExpression;
                    
                    result.push({
                        name: filtered.name,
                        matchExpression: combinedExpression
                    });
                }
                // 递归收集基于这个 filtered entity 的其他 filtered entities
                collectFiltered(filtered.name);
            }
        };
        
        collectFiltered(baseEntityName);
        return result;
    }
    
    /**
     * 关系（link）建立/解除后，重新评估依赖该关系的 filtered entity。
     * CAUTION 关系的变化同样会改变成员资格（例如 filter 为 team.type='tech'，用户换了 team）。
     *  但关系变更不会经过实体的 update/create/delete，所以这里显式在 link 变更处传播。
     *  依赖 __filtered_entities 标记的幂等性：即使与实体 update 路径重复触发，也只会在标记真正变化时产生一次事件。
     * @param linkName 关系名
     * @param sourceId 关系 source 端实体 id
     * @param targetId 关系 target 端实体 id
     */
    async propagateLinkChange(
        linkName: string,
        sourceId: string | undefined,
        targetId: string | undefined,
        events: RecordMutationEvent[] = []
    ): Promise<void> {
        const link = this.map.data.links[linkName]
        if (!link) return
        // 虚拟 link（relation 与 entity 之间的）不承载真实关系语义，跳过。
        if (link.isSourceRelation) return

        // source 端：owner 实体是 sourceRecord，关系属性是 sourceProperty
        if (sourceId !== undefined && link.sourceRecord && link.sourceProperty) {
            await this.updateFilteredEntityFlags(link.sourceRecord, sourceId, events, undefined, false, [link.sourceProperty])
        }
        // target 端：owner 实体是 targetRecord，关系属性是 targetProperty（可能不存在）
        if (targetId !== undefined && link.targetRecord && link.targetProperty) {
            await this.updateFilteredEntityFlags(link.targetRecord, targetId, events, undefined, false, [link.targetProperty])
        }
    }

    /**
     * 更新记录的 filtered entity 标记（主入口方法）
     */
    async updateFilteredEntityFlags(
        entityName: string, 
        recordId: string, 
        events: RecordMutationEvent[] = [], 
        originalRecord?: any, 
        isCreation?: boolean, 
        changedFields?: string[]
    ): Promise<void> {
        // 对于创建操作，直接检查所有 filtered entities
        if (isCreation && originalRecord) {
            const filteredEntities = this.getFilteredEntitiesForBase(entityName);
            const flags: { [key: string]: boolean } = {};
            
            for (const filteredEntity of filteredEntities) {
                const matchesFilter = await this.checkRecordMatchesFilter(
                    recordId,
                    entityName,
                    filteredEntity.matchExpression
                );
                
                if (matchesFilter) {
                    flags[filteredEntity.name] = true;
                    events.push({
                        type: 'create',
                        recordName: filteredEntity.name,
                        record: { ...originalRecord, id: recordId }
                    });
                }
            }
            
            // 更新 __filtered_entities 字段
            if (Object.keys(flags).length > 0) {
                const recordInfo = this.map.getRecordInfo(entityName);
                const filteredEntitiesAttribute = recordInfo.data.attributes['__filtered_entities'];
                
                if (filteredEntitiesAttribute && (filteredEntitiesAttribute as any).field) {
                    const fieldName = (filteredEntitiesAttribute as any).field;
                    
                    await this.queryAgent.updateRecordDataById(
                        entityName,
                        { id: recordId },
                        [{
                            field: fieldName,
                            value: JSON.stringify(flags)
                        }]
                    );
                }
            }
            
            return;
        }
        
        // 获取所有依赖于这个实体的 filtered entity
        const dependencies = this.getAffectedFilteredEntities(entityName)
        
        if (dependencies.length === 0) {
            return
        }
        const changedAttributes = changedFields || (isCreation && originalRecord ? Object.keys(originalRecord) : []);
        
        // 处理每个受影响的 filtered entity
        for (const dependency of dependencies) {
            // 找到所有受影响的源记录
            const affectedSourceRecords = await this.findAffectedSourceRecords(
                dependency,
                entityName,
                recordId,
                changedAttributes
            )
            
            // 批量更新所有受影响的源记录的 filtered entity 标记
            await this.updateFilteredEntityFlagsForRecords(
                dependency,
                affectedSourceRecords.map(record => record.id),
                events
            )
        }
    }
    isFlagEqual(flag1: { [key: string]: boolean }, flag2: { [key: string]: boolean }): boolean {
        // 只检验 key 为 true 的是否完全相同。为 false 或者 undefined 的 key 不参与比较
        const keys1 = Object.keys(flag1).filter(key => flag1[key] === true);
        const keys2 = Object.keys(flag2).filter(key => flag2[key] === true);
        return keys1.length === keys2.length && keys1.every(key => flag2[key] === true);
    }
    
    /**
     * 批量更新单个依赖关系下多条记录的 filtered entity 标记。
     * CAUTION 批量化：每个依赖只做一次"取当前标记"查询和一次 membership 查询，
     *  只对标记真正变化的记录逐条 UPDATE（每条记录的 JSON 内容不同，无法合并成一条 UPDATE）。
     */
    private async updateFilteredEntityFlagsForRecords(
        dependency: FilteredEntityDependency,
        recordIds: string[],
        events: RecordMutationEvent[]
    ): Promise<void> {
        if (!recordIds.length) return

        const recordInfo = this.map.getRecordInfo(dependency.baseEntityName)
        // 获取所有记录当前的 __filtered_entities 状态
        const currentRecords = await this.queryAgent.findRecords(
            RecordQuery.create(dependency.baseEntityName, this.map, {
                matchExpression: MatchExp.atom({ key: 'id', value: ['in', recordIds] }),
                attributeQuery: recordInfo.isRelation ? 
                    ['*', ['target', {attributeQuery: ['*']}], ['source', {attributeQuery: ['*']}]] : 
                    ['*']
            }),
            `get current filtered entity flags for ${dependency.baseEntityName}`
        )

        if (currentRecords.length === 0) {
            return
        }

        // 批量 membership 查询：一次查出所有仍然满足条件的记录
        const matchedIds = await this.checkRecordsMatchFilter(
            currentRecords.map(record => record.id),
            dependency.baseEntityName,
            dependency.matchExpression
        )

        const filteredEntitiesAttribute = recordInfo.data.attributes['__filtered_entities']
        const flagFieldName = filteredEntitiesAttribute && (filteredEntitiesAttribute as any).field

        for (const record of currentRecords) {
            // CAUTION __filtered_entities 可能为 NULL（存量数据/手工迁移的行），也可能是未反序列化的字符串。
            //  这里必须归一化成对象，否则读取属性时会抛 TypeError。
            const rawFlags = record.__filtered_entities
            const currentFlags: { [key: string]: boolean } =
                (typeof rawFlags === 'string' ? JSON.parse(rawFlags) : rawFlags) || {}

            const matchesFilter = matchedIds.has(record.id)
            const previouslyBelonged = currentFlags[dependency.filteredEntityName] === true

            if (matchesFilter === previouslyBelonged) continue

            // 状态发生变化：生成相应的事件并更新标记
            events.push({
                type: matchesFilter ? 'create' : 'delete',
                recordName: dependency.filteredEntityName,
                record: { ...record }
            })
            currentFlags[dependency.filteredEntityName] = matchesFilter

            if (flagFieldName) {
                await this.queryAgent.updateRecordDataById(
                    dependency.baseEntityName,
                    { id: record.id },
                    [{
                        field: flagFieldName,
                        value: JSON.stringify(currentFlags)
                    }]
                )
            }
        }
    }
} 