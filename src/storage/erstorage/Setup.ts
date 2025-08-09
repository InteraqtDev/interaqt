import { LinkMapItem, MapData, RecordAttribute, RecordMapItem, ValueAttribute } from "./EntityToTableMap.js";
import { assert } from "../utils.js";
import { EntityInstance, RelationInstance, PropertyInstance, RefContainer } from "@shared";
import { ID_ATTR, ROW_ID_ATTR, Database } from "@runtime";
import { isRelation } from "./util.js";
import { MatchExpressionData, MatchExp } from "./MatchExp.js";
import { Entity, Property } from "@shared";

// Define the types we need

type ColumnData = {
    name:string,
    type:string,
    fieldType?:string,
    collection?:boolean,
    notNull?: boolean,
    defaultValue?: (record: any, recordName: string) => any
    attribute?: ValueAttribute
}


export type TableData = {
    [k:string]: {
        columns: {[k:string]: ColumnData},
        hasId?: boolean
    }
}

export type MergeLinks = string[]


export class DBSetup {
    private fieldNameMap: Map<string, string> = new Map()
    private usedFieldNames: Set<string> = new Set()
    private fieldCounter: number = 1
    public recordToTableMap = new Map<string,string>()
    public tableToRecordsMap = new Map<string, Set<string>>()
    public mergeLog: any[] = []
    public tables:TableData = {}
    public map: MapData = { links: {}, records: {}}
    constructor(
        public entities: EntityInstance[],
        public relations: RelationInstance[],
        public database?: Database,
        public mergeLinks: MergeLinks = []
    ) {
        this.buildMap()
        this.buildTables()
    }
    createRecordToTable(item:string, table:string) {
        this.recordToTableMap.set(item, table)
        assert(!this.tableToRecordsMap.get(table), `create table for ${item} ${table} failed, ${table} already exist.`)
        this.tableToRecordsMap.set(table, new Set([item]))
    }
    // CAUTION 把一个 item 拉过来，等于把它所有同表的 item 拉过来
    joinTables(joinTargetRecord:string, record:string, link: string): string[]| undefined {

        assert(joinTargetRecord !== record, `join entity should not equal, ${record}`)
        const moveTable = this.recordToTableMap.get(record)!
        const joinTargetTable = this.recordToTableMap.get(joinTargetRecord)!
        const joinTargetSameTableRecords = this.tableToRecordsMap.get(joinTargetTable)!
        assert(!!moveTable  && !!joinTargetTable, `table not exists for ${record} ${moveTable} to join ${joinTargetRecord} ${joinTargetTable}`)
        if (moveTable == joinTargetTable) return

        const sameTableRecordsToMove = this.tableToRecordsMap.get(moveTable)!

        // 0 检测是否有环。CAUTION 就是检测 joinTargetTable 里面是否已经有了重复的。

        const conflicts: string[] = []
        sameTableRecordsToMove.forEach(sameTableRecordToMove => {
            // TODO 还要提供 merge 的关系信息？
            if (joinTargetSameTableRecords.has(sameTableRecordToMove)) conflicts.push(sameTableRecordToMove)
        })

        if (conflicts.length) {
            this.mergeLog.push({ joinTargetRecord, record, link, conflicts })
            return conflicts
        }


        // 1. 清空原来 table 里的 records
        this.tableToRecordsMap.set(moveTable, new Set())
        // 2. 移除的 record 对 table 的指针也都修改过来
        sameTableRecordsToMove.forEach(sameTableRecord => this.recordToTableMap.set(sameTableRecord, joinTargetTable))

        // 3. 新 table 合并数据
        this.tableToRecordsMap.set(joinTargetTable, new Set(Array.from(joinTargetSameTableRecords).concat(Array.from(sameTableRecordsToMove))))

        // 4. 记录 log
        this.mergeLog.push({ joinTargetRecord, record, link })
    }
    combineRecordTable(mergeTarget: string, toMerge: string, link: string,) {
        let linkConflict
        // target/toMerge 一定是不同实体才能merge 所以这里可以用这个判断方向
        const virtualLinkName = (this.map.records[link].attributes.source as RecordAttribute).linkName
        linkConflict = this.joinTables(mergeTarget, link, virtualLinkName)

        if (linkConflict) return linkConflict

        return this.joinTables(mergeTarget, toMerge, link)
    }
    renameTableWithJoinedEntities(originTableName: string) {
        const records = Array.from(this.tableToRecordsMap.get(originTableName)!)
        if (!records.length) return

        // CAUTION 有合并的情况的话，里面一定有 entity，只用 entity 的名字。除非TableName 始终只用其中 的 entity 名字
        const entities = records.filter(recordName => !this.map.records[recordName].isRelation )
        const newTableName = entities.length ? entities.join('_') : originTableName

        this.tableToRecordsMap.delete(originTableName)
        this.tableToRecordsMap.set(newTableName, new Set(records))

        records.forEach(record => {
            this.recordToTableMap.set(record, newTableName)
        })
    }


    resolveBaseSourceEntityAndFilter(entity: EntityInstance) {
        const entityWithProps = entity
        let baseEntity = (entityWithProps as any).baseEntity
        let matchExpression = (entityWithProps as any).matchExpression
        assert((baseEntity && matchExpression) || (!baseEntity && !matchExpression), `matchExpression is required for ${entityWithProps.name}`)
        if (!(baseEntity && matchExpression)) return

        while(baseEntity.baseEntity) {
            baseEntity = baseEntity.baseEntity
            matchExpression = matchExpression.and(baseEntity.filter)
        }

        return { baseEntity, matchExpression }
    }

    /**
     * 验证 filtered entity 的过滤条件中的路径不包含 x:n 关系
     */
    private validateFilteredEntityPaths(entityName: string, matchExpression: MatchExpressionData) {
        const paths = MatchExp.extractPaths(matchExpression);
        
        for (const path of paths) {
            this.validateSinglePath(entityName, path);
        }
    }
    
    /**
     * 验证单个路径不包含 x:n 关系
     */
    private validateSinglePath(entityName: string, pathParts: string[]) {
        let currentEntity = entityName;
        
        // 遍历路径的每个部分（除了最后一个，最后一个是属性）
        for (let i = 0; i < pathParts.length - 1; i++) {
            const attribute = pathParts[i];
            
            // 获取这个属性的信息
            const entityData = this.map.records[currentEntity];
            if (!entityData) {
                throw new Error(`Entity ${currentEntity} not found in map`);
            }
            
            const attributeData = entityData.attributes[attribute];
            if (!attributeData || !(attributeData as any).isRecord) {
                throw new Error(`Attribute ${attribute} is not a relation in entity ${currentEntity}`);
            }
            
            // 检查关系类型
            const relType = (attributeData as any).relType;
            if (relType && (relType[1] === 'n')) {
                throw new Error(
                    `Filtered entity '${this.currentFilteredEntityName}' contains an invalid path: ` +
                    `'${pathParts.join('.')}'. The relation '${currentEntity}.${attribute}' is a ${relType[0]}:${relType[1]} relation. ` +
                    `Filtered entities do not support paths with 'x:n' relationships for performance reasons.`
                );
            }
            
            // 移动到下一个实体
            currentEntity = (attributeData as any).recordName;
        }
    }
    
    private currentFilteredEntityName?: string;
    /**
     * 递归收集所有依赖于给定实体的 filtered entities（包括级联的）
     */
    private collectAllFilteredEntities(entity: EntityInstance | RelationInstance): (EntityInstance | RelationInstance)[] {
        const directFiltered = [...this.entities, ...this.relations].filter(e => 
            (e as any).baseEntity === entity || (e as any).baseRelation === entity
        );
        
        const allFiltered: (EntityInstance | RelationInstance)[] = [...directFiltered];
        
        // 递归查找基于 filtered entity 的其他 filtered entities
        for (const filtered of directFiltered) {
            allFiltered.push(...this.collectAllFilteredEntities(filtered));
        }
        
        return allFiltered;
    }
    createRecord(entity: EntityInstance | RelationInstance, isRelation? :boolean) {
        const attributes: {[k:string]: Omit<ValueAttribute, 'field'>} = Object.fromEntries(entity.properties.map((property:PropertyInstance) => {
            const prop = property
            return [
                prop.name,
                {
                    name: prop.name,
                    type: prop.type,
                    computed: prop.computed as ((record: any) => any) | undefined,
                    collection: prop.collection,
                    defaultValue: prop.defaultValue as (() => any) | undefined,
                    fieldType: this.database!.mapToDBFieldType(prop.type, prop.collection)
                }
            ];
        }));


        if (isRelation) {
            assert(!attributes.source && !attributes.target, 'source and target is reserved name for relation attributes')
        }

        // 自动补充
        attributes[ID_ATTR] = {
            name: ID_ATTR,
            type: 'id',
            fieldType: this.database!.mapToDBFieldType('pk')
        }

        // 使用递归方法收集所有依赖的 filtered entities
        const filteredBy = this.collectAllFilteredEntities(entity);
        
        if (filteredBy.length) {
            attributes['__filtered_entities'] = {
                name: '__filtered_entities',
                type: 'json',
                fieldType: this.database!.mapToDBFieldType('json') || 'JSON',
                collection: false,
                computed: undefined,
                // JSON 字段的默认值应该返回对象，在写入数据库时会自动序列化
                defaultValue: () => ({})
            };
        }

        return {
            table: entity.name,
            attributes,
            isRelation,
            filteredBy: filteredBy.length ? filteredBy.map(e => e.name) : undefined,
        } as RecordMapItem
    }
    createFilteredEntityRecord(entity: EntityInstance) {
        // 使用递归方法收集所有依赖的 filtered entities
        const filteredBy = this.collectAllFilteredEntities(entity);
        const { baseEntity, matchExpression } = entity

        const { resolvedBaseRecordName, resolvedMatchExpression } = this.resolveRootBaseRecordNameAndMatchExpression(entity)
        
        // 获取实际的表名
        // 如果 base entity 已经在 map.records 中，使用它的 table
        // 否则使用 resolvedBaseRecordName
        let tableName = resolvedBaseRecordName;
        if (resolvedBaseRecordName && this.map.records[resolvedBaseRecordName]) {
            tableName = this.map.records[resolvedBaseRecordName].table || resolvedBaseRecordName;
        }

        return {
            table: tableName,
            isFilteredEntity: !!baseEntity,
            attributes: {},
            baseRecordName: baseEntity?.name,
            matchExpression: matchExpression,
            resolvedBaseRecordName,
            resolvedMatchExpression,
            filteredBy: filteredBy.length ? filteredBy.map(e => e.name) : undefined,
        } as RecordMapItem
    }
    createFilteredRelationRecord(relation: RelationInstance) {
        const attributes: {[k:string]: Omit<ValueAttribute, 'field'>} = Object.fromEntries(relation.properties.map((property:PropertyInstance) => {
            const prop = property
            return [
                prop.name,
                {
                    name: prop.name,
                    type: prop.type,
                    computed: prop.computed as ((record: any) => any) | undefined,
                    collection: prop.collection,
                    defaultValue: prop.defaultValue as (() => any) | undefined,
                    fieldType: this.database!.mapToDBFieldType(prop.type, prop.collection)
                }
            ];
        }));


        assert(!attributes.source && !attributes.target, 'source and target is reserved name for relation attributes')

        // 使用递归方法收集所有依赖的 filtered entities
        const filteredBy = this.collectAllFilteredEntities(relation);
        const { matchExpression, baseRelation } = relation
        const { resolvedBaseRecordName, resolvedMatchExpression } = this.resolveRootBaseRecordNameAndMatchExpression(relation)

        return {
            table: resolvedBaseRecordName,
            attributes,
            baseRecordName: baseRelation!.name,
            matchExpression: matchExpression,
            resolvedBaseRecordName,
            resolvedMatchExpression,
            filteredBy: filteredBy.length ? filteredBy.map(e => e.name) : undefined,
            // 添加 filtered relation 的标记
            isFilteredRelation:true,
            baseRelationName: baseRelation!.name
        } as RecordMapItem
    }
    resolveRootBaseRecordNameAndMatchExpression(entity: EntityInstance | RelationInstance) {
        const { baseEntity, baseRelation, matchExpression } = entity as any
        // 计算 resolved 字段
        let resolvedBaseRecordName: string | undefined;
        let resolvedMatchExpression: MatchExpressionData | undefined;
        
        // 递归查找最底层的源实体/关系
        let currentEntity = baseEntity! || baseRelation!;
        let currentMatchExpression = matchExpression || (entity as any).matchExpression;
        const matchExpressions: MatchExpressionData[] = [currentMatchExpression];
        
        while ((currentEntity as any).baseEntity || (currentEntity as any).baseRelation) {
            const nextEntity = (currentEntity as any).baseEntity || (currentEntity as any).baseRelation;
            const nextMatchExpression = (currentEntity as any).matchExpression;
            if (nextMatchExpression) {
                matchExpressions.push(nextMatchExpression);
            }
            currentEntity = nextEntity;
        }
        
        resolvedBaseRecordName = currentEntity.name;
        
        // 合并所有 matchExpression
        if (matchExpressions.length > 0) {
            resolvedMatchExpression = matchExpressions[0];
            for (let i = 1; i < matchExpressions.length; i++) {
                resolvedMatchExpression = resolvedMatchExpression.and(matchExpressions[i]);
            }
        }
        return { resolvedBaseRecordName, resolvedMatchExpression }
    }
    createLink(relationName: string, relation: RelationInstance) {

        return {
            table: relationName,
            relType: relation.type.split(':'),
            sourceRecord: relation.source.name,
            sourceProperty: relation.sourceProperty,
            targetRecord: relation.target.name,
            targetProperty: relation.targetProperty,
            recordName: relationName,
            isTargetReliance: relation.isTargetReliance,
            matchExpression: relation.matchExpression,
        } as LinkMapItem
    }
    createFilteredLink(relationName: string, relation: RelationInstance) {
        const { resolvedBaseRecordName, resolvedMatchExpression } = this.resolveRootBaseRecordNameAndMatchExpression(relation)

        return {
            table: relationName,
            relType: relation.type.split(':'),
            sourceRecord: relation.source.name,
            sourceProperty: relation.sourceProperty,
            targetRecord: relation.target.name,
            targetProperty: relation.targetProperty,
            recordName: relationName,
            isTargetReliance: relation.isTargetReliance,
            isFilteredRelation: !!relation.baseRelation,
            matchExpression: relation.matchExpression,
            baseLinkName: relation.baseRelation?.name,
            resolvedBaseRecordName,
            resolvedMatchExpression
        } as LinkMapItem
    }   
    //虚拟 link
    createLinkOfRelationAndEntity(relationEntityName: string, relationName: string, relation: RelationInstance, isSource: boolean) {
        const relationWithProps = relation 
        const [sourceRelType, targetRelType] = relationWithProps.type.split(':');
        return {
            table: undefined, // 虚拟 link 没有表
            attributes: {},
            sourceRecord: relationEntityName,
            sourceProperty: isSource ? 'source' : 'target',
            targetRecord: isSource ? relationWithProps.source.name: relationWithProps.target.name,
            // targetRecord: isSource ? relation.source.name: relation.target.name,
            targetProperty: undefined, // 不能从 entity 来获取关系表
            relType: [isSource ? targetRelType : sourceRelType,'1'],
            isSourceRelation: true,
            mergedTo: 'combined',
        } as LinkMapItem
    }
    getRelationNameOfRelationAndEntity(relationName: string, isSource: boolean) {
        return `${relationName}_${isSource? 'source' :'target'}`
    }

    buildEntityTree() {
        const tree = new Map<string, string[]>()
        for (const entity of this.entities) {
            if (entity.inputEntities) {
                tree.set(entity.name, entity.inputEntities.map(inputEntity => inputEntity.name))
            } else if(entity.baseEntity) {
                const leafSet = tree.get(entity.baseEntity.name!) || []
                leafSet.push(entity.name)
                tree.set(entity.baseEntity.name!, leafSet)
            }
        }
        // TODO relation 的 tree
        return tree
    }

    buildMap() {
        // 0. 预处理：将 merged entity 转化为 filtered entity
        const entityTree = this.buildEntityTree()
        this.processMergedEntities(entityTree);
        
        // 1. 按照范式生成基础 entity record
        this.entities.forEach(entity => {
            assert(!this.map.records[entity.name], `entity name ${entity.name} is duplicated`)
            this.map.records[entity.name] = entity.baseEntity ? this.createFilteredEntityRecord(entity) : this.createRecord(entity)
            // 记录一下 entity 和 表的关系。后面用于合并的时候做计算。
            if(!entity.baseEntity) {
                this.createRecordToTable(entity.name, this.map.records[entity.name].table)
            }
        })

        // 2. 生成 relation record 以及所有的 link
        this.relations.forEach(relation => {
            const sourceName = relation.source.name
            const targetName = relation.target.name
            const relationName = relation.name || `${sourceName}_${relation.sourceProperty}_${relation.targetProperty}_${targetName}`
            assert(!this.map.records[relationName], `relation name ${relationName} is duplicated`)
            this.map.records[relationName] = relation.baseRelation ? this.createFilteredRelationRecord(relation) : this.createRecord(relation, true)
            // 记录 relation 里面的  Entity 和 Entity 的关系
            this.map.links[relationName] = relation.baseRelation ? this.createFilteredLink(relationName, relation) : this.createLink(relationName, relation)
            // 记录 relation 和实体之间的关系。这个关系是单向的，只能从 relation 发起。
            const virtualSourceRelationName = this.getRelationNameOfRelationAndEntity(relationName, true)
            this.map.links[virtualSourceRelationName] = this.createLinkOfRelationAndEntity(relationName, virtualSourceRelationName, relation, true)
            const virtualTargetRelationName = this.getRelationNameOfRelationAndEntity(relationName, false)
            this.map.links[virtualTargetRelationName] = this.createLinkOfRelationAndEntity(relationName, virtualTargetRelationName, relation, false)
            if(!relation.baseRelation) {
                this.createRecordToTable(relationName, this.map.records[relationName].table)
            }
        })

        // 3. 根据 Link 补充 record attribute 到 record 里面。方便之后的查询。
        Object.entries(this.map.links).forEach(([relation, relationData]) => {
            assert(!relationData.isSourceRelation || (relationData.sourceProperty === 'source' || relationData.sourceProperty === 'target'), 'virtual relation sourceProperty should only be source/target')
            
            // 检查是否是 filtered relation
            const relationRecord = this.map.records[relation]
            const isFilteredRelation = relationRecord && !!relationRecord.baseRelationName
            const sourceLink = isFilteredRelation ? this.map.links[relationRecord.baseRelationName!]! : undefined
            

            this.map.records[relationData.sourceRecord].attributes[relationData.sourceProperty] = {
                type: 'id',
                isRecord:true,
                relType: relationData.relType,
                recordName: relationData.targetRecord,
                linkName: relation,
                attributeName: relationData.sourceProperty,
                isSource: true,
                // CAUTION 这里是表示这个 target 是 reliance
                isReliance: relationData.isTargetReliance,
                // 标记这是一个 filtered relation
                isFilteredRelation: isFilteredRelation,
                matchExpression: isFilteredRelation?relationData.matchExpression: undefined,
                baseRelationAttributeName: isFilteredRelation? sourceLink?.sourceProperty: undefined,
                resolvedMatchExpression: isFilteredRelation? relationRecord.resolvedMatchExpression: undefined,
                resolvedBaseRecordName: isFilteredRelation? relationRecord?.resolvedBaseRecordName: undefined
            } as RecordAttribute

            // CAUTION 关联查询时，不可能出现从实体来获取一个关系的情况，语义不正确。
            assert(!(relationData.isSourceRelation && relationData.targetProperty), 'virtual relation should not have targetProperty')
            if (relationData.targetProperty) {
                this.map.records[relationData.targetRecord].attributes[relationData.targetProperty] = {
                    type: 'id',
                    isRecord:true,
                    // CAUTION 这里翻转了！在 AttributeInfo 中方便判断。不能用 Array.reverse()，因为不会返回新数组。
                    relType: [relationData.relType[1], relationData.relType[0]],
                    recordName: relationData.sourceRecord,
                    linkName: relation,
                    attributeName: relationData.targetProperty,
                    isSource:false,
                    // 标记这是一个 filtered relation
                    isFilteredRelation: isFilteredRelation,
                    matchExpression: isFilteredRelation?relationData.matchExpression: undefined,
                    baseRelationAttributeName: isFilteredRelation? sourceLink?.targetProperty: undefined
                } as RecordAttribute
            }
        })

        // 4. 验证所有 filtered entity 的路径
        this.entities.forEach(entity => {
            const entityWithProps = entity as any;
            if (entityWithProps.baseEntity && entityWithProps.matchExpression) {
                this.currentFilteredEntityName = entityWithProps.name;
                this.validateFilteredEntityPaths(entityWithProps.baseEntity.name, entityWithProps.matchExpression);
            }
        });

        this.mergeRecords()
        this.assignTableAndField()

    }
    /**
     * 处理 merged entities，将它们转化为 filtered entity 的实现
     */
    private processMergedEntities(entityTree: Map<string, string[]>) {
        const toMergeEntitieNames: string[] = [];
        
        // 要构建一个 子孙 entity 到 input entity 的链接。
        // 这里 input entity 可以是 Merged entity，也可以是个具有 filtered entity 的普通 entity。

        // 首先识别所有的 merged entities 和它们的 input entities
        const leafEntityToInputEntityMap = new Map<string, string[]>()
        for (const entity of this.entities) {
            if (entity.inputEntities && entity.inputEntities.length > 0) {
                toMergeEntitieNames.push(entity.name);
                for(const inputEntity of entity.inputEntities!) {
                    const leafSet = entityTree.get(inputEntity.name) || []
                    const inputEntityNames = leafEntityToInputEntityMap.get(inputEntity.name) || []
                    inputEntityNames.push(inputEntity.name)
                    leafEntityToInputEntityMap.set(inputEntity.name, inputEntityNames)
                    while(leafSet.length) {
                        const leafEntity = leafSet.shift()!
                        const leafInputEntityNames = leafEntityToInputEntityMap.get(leafEntity) || []   
                        leafInputEntityNames.push(...inputEntityNames)
                        leafEntityToInputEntityMap.set(leafEntity, leafInputEntityNames)
                        const childSet = entityTree.get(leafEntity) || []
                        leafSet.push(...childSet)
                    }
                }
            }
        }
        
        const refContainer = new RefContainer(this.entities, this.relations)

        // 处理所有 entities
        for (const entityName of toMergeEntitieNames) {
            const entity = refContainer.getEntityByName(entityName)!
            // 这是一个 merged entity
            const inputTypeFieldName = `__${entity.name}_input_entity`
            const [transformedEntity, virtualBaseEntity] = this.transformMergedEntity(entity, inputTypeFieldName, leafEntityToInputEntityMap);
            refContainer.replaceEntity(transformedEntity, entity)
            if (virtualBaseEntity !== transformedEntity) {
                refContainer.addEntity(virtualBaseEntity)
            }
            
            // 将 input entities 转化为 merged entity 的 filtered entities
            for (const inputEntity of entity.inputEntities!) {
                // 创建一个指向 merged entity 的 filtered entity
                const [filteredEntity, baseEntity] = this.createFilteredEntityFromInput(inputEntity, virtualBaseEntity!, inputTypeFieldName);
                // 检查 baseEntity 是否在 RefContainer 中
                const existingEntity = refContainer.getEntityByName(baseEntity.name);
                if (existingEntity) {
                    // 如果存在，替换它
                    refContainer.replaceEntity(filteredEntity, existingEntity)
                } else {
                    throw new Error(`filtered entity ${baseEntity.name} not found`)
                    // 如果不存在，添加 filtered entity
                    refContainer.addEntity(filteredEntity)
                }
            }
        }
        const {entities, relations} = refContainer.getAll()
        this.entities = entities
        this.relations = relations
    }
    
    /**
     * 将 merged entity 转化，添加必要的 properties
     */
    private transformMergedEntity(mergedEntity: EntityInstance, inputTypeFieldName: string, leafEntityToInputEntityMap: Map<string, string[]>): [EntityInstance, EntityInstance] {
        const inputEntities = mergedEntity.inputEntities!;
        
        // 创建 __input_entity property
        // 重要：这个字段应该记录创建记录时使用的 entity name
        // 当通过 filtered entity（如 Customer）创建时，entityName 参数会是 'Customer'
        // 而不是 merged entity 的名字 'Contact'
        const inputEntityTypeProperty = Property.create({
            name: inputTypeFieldName,
            type: 'json',
            defaultValue: (record: any, entityName: string) => {
                // CAUTION 如果 input entity 是一个 merged entity，这里收到的 entityName 可能是它的子孙 input entity name。
                const inputEntityCandidates: string[] = leafEntityToInputEntityMap.get(entityName)||[]
                const inputEntityNames = inputEntityCandidates.filter(name => mergedEntity.inputEntities!.some(inputEntity => inputEntity.name === name))
                if (inputEntityNames) {
                    return inputEntityNames
                }
                // 使用创建时的 entity name
                return [entityName];
            }
        });
        
        // 合并所有 input entities 的 properties
        const mergedProperties: PropertyInstance[] = [inputEntityTypeProperty];
        const propertyNameMap = new Map<string, {property: PropertyInstance, inputEntity: EntityInstance}[]>();
        
        // 收集所有同名 properties
        for (const inputEntity of inputEntities) {
            // 如果 input entity 是 filtered entity，需要从它的 base entity 获取 properties
            let sourceEntity = inputEntity;
            while (sourceEntity.baseEntity && sourceEntity.properties.length === 0) {
                sourceEntity = sourceEntity.baseEntity as EntityInstance;
            }
            
            for (const prop of sourceEntity.properties) {
                if (!propertyNameMap.has(prop.name)) {
                    propertyNameMap.set(prop.name, []);
                }
                propertyNameMap.get(prop.name)!.push({property: prop, inputEntity: sourceEntity});
            }
        }
        
        // 为每个 property 创建合并版本
        for (const [propName, props] of propertyNameMap) {
            const mergedProp = Property.clone(props[0].property, true);
            if (props.length === 1) {
                mergedProperties.push(mergedProp)
                continue
            }

            // 检测所有的 props 的类型是否一致。不一致要报错。
            const types = props.map(p => p.property.type)
            assert(types.every(type => type === types[0]), `property ${propName} has different types: ${types.join(', ')}`)

            // 使用第一个 property 作为基础
            
            // 创建新的 defaultValue，根据 __input_entity 选择正确的原始 defaultValue
            mergedProp.defaultValue = (record: any, entityName: string) => {
                const inputEntityType = entityName;
                const entityProp = props.find(p => p.inputEntity.name === inputEntityType)?.property
                if (entityProp?.defaultValue) {
                    return entityProp.defaultValue(record, entityName);
                }
                
                return undefined;
            };

            mergedProperties.push(mergedProp);
        }
        
        // 创建转化后的 entity
        const transformedEntity = Entity.create({
            name: mergedEntity.name,
        });

        let virtualBaseEntity:undefined|EntityInstance = undefined
        // CAUTION 如果有 filtered input entity，则需要创建一个虚拟的 base entity
        //  mergedEntity 也是 virtual base entity 的 filterd entity。
        if (mergedEntity.inputEntities?.some(inputEntity => inputEntity.baseEntity)) {
            virtualBaseEntity = Entity.create({
                name: `${mergedEntity.name}_base`,
                properties: mergedProperties,
            })
            transformedEntity.baseEntity = virtualBaseEntity
            // 任意一个 input entity 都符合
            transformedEntity.matchExpression = MatchExp.fromArray(mergedEntity.inputEntities!.map(inputEntity => ({
                key: inputTypeFieldName,
                value: ['contains', inputEntity.name]
            })));
        } else {
            transformedEntity.properties = mergedProperties
        }
        
        return [transformedEntity, virtualBaseEntity||transformedEntity];
    }
    
    /**
     * 从 input entity 创建一个指向 merged entity 的 filtered entity
     * 注意，如果是 filtered entity，需要找到它的 root base entity。处理的也是 root base entity
     */
    private createFilteredEntityFromInput(inputEntity: EntityInstance, mergedEntity: EntityInstance, inputTypeFieldName: string): [EntityInstance, EntityInstance] {
        // 如果 input entity 已经是 filtered entity，需要找到它的 root base entity  
        let baseEntity = inputEntity;
        
        if (inputEntity.baseEntity) {
            // 递归找到 root base entity
            while (baseEntity.baseEntity) {
                baseEntity = baseEntity.baseEntity as EntityInstance;
            }
        }
        
        // 创建新的 filtered entity，指向 merged entity
        // 使用原始 input entity 的名字，这样用户可以通过原始名字来访问
        const filteredEntity = Entity.clone(baseEntity, true)
        filteredEntity.baseEntity = mergedEntity
        filteredEntity.matchExpression = MatchExp.atom({
            key: inputTypeFieldName,
            value: ['contains',inputEntity.name] // postgres 的 array 匹配
        });
        
        
        return [filteredEntity, baseEntity];
    }
    mergeRecords() {
        // 基本合表策略:
        // 1. 从用户指定的 mergeLinks 里面开始合并三表合一
        // 2. reliance 三表合一。这里有一个不能有链的检测。
        // 3. 剩余的 x:1 关系只合并关系表。

        // 合并后要做的事:
        // 1) 修改 links 里面的数据。以里面的 mergeTo 作为判断标准

        //  TODO 可能有 reliance 实体声明自己不合并。
        // 0. 做好数据准备，先把 reliance 关系和 非 reliance 的 xToOne 找出来等待处理。CAUTION oneToOneReliance 肯定不是 symmetric ？
        const oneToOneRelianceLinks = Object.fromEntries(Object.entries(this.map.links).filter(([, linkData]) => {
            return !linkData.isSourceRelation && linkData.relType[0] === '1' && linkData.relType[1] === '1' && linkData.isTargetReliance
        }))

        const xToOneNotRelianceLinks = Object.fromEntries(Object.entries(this.map.links).filter(([, linkData]) => {
            // CAUTION 一定要过滤掉虚拟 link
            return !linkData.isSourceRelation && !linkData.isTargetReliance &&
                (
                    (linkData.relType[0] === '1' && linkData.relType[1] === '1') ||
                    (linkData.relType[0] === 'n' && linkData.relType[1] === '1') ||
                    (linkData.relType[0] === '1' && linkData.relType[1] === 'n')
                )
        }))

        const mergedLinks: LinkMapItem[] = []

        // 1. 遍历用户指定的 merge 路径。
        this.mergeLinks.forEach(path => {
            const [rootRecord, ...attributePath] = path.split('.')
            let currentRecord = rootRecord
            for(let i = 0; i < attributePath.length; i++ ) {
                const currentAttribute = attributePath[i]
                const attributeData = (this.map.records[currentRecord].attributes[currentAttribute]! as RecordAttribute)
                const linkName = attributeData.linkName
                const linkData = this.map.links[linkName]
                const {relType, sourceRecord, targetRecord} = linkData
                assert(
                    relType[0] === '1' && relType[1] === '1' && sourceRecord !== targetRecord,
                    `only 1:1 can merge: ${rootRecord}.${attributePath.slice(0, i+1).join('.')}`
                )
                const recordToMove = sourceRecord === currentRecord ? targetRecord : sourceRecord
                const conflicts = this.combineRecordTable(currentRecord, recordToMove, linkName)
                if (conflicts) {
                    throw new Error(`conflict found when join ${linkName}, ${conflicts.join(',')} already merged with ${currentRecord}`)
                }

                // 成功要修改 map 的数据
                linkData.mergedTo = 'combined'
                mergedLinks.push(linkData)
                // 路径下一个
                currentRecord = attributeData.recordName
                // 处理完了 在上面的 links 里面删除这个 link
                delete oneToOneRelianceLinks[linkName]
                delete xToOneNotRelianceLinks[linkName]
            }
        })


        // 2. reliance 三表合一。这里有一个不能有链的检测。
        Object.values(oneToOneRelianceLinks).forEach(linkData => {
            if(linkData.isFilteredRelation) return
            const { sourceRecord, targetRecord, recordName: linkRecord} = linkData
            // 只是尝试。有冲突就不会处理
            const conflicts = this.combineRecordTable(sourceRecord, targetRecord, linkRecord!)
            if (!conflicts) {
                linkData.mergedTo = 'combined'
                mergedLinks.push(linkData)
            } else {
                // 改为 尝试 merge link
                const linkToRecordLinkName = (this.map.records[linkRecord!].attributes.source! as RecordAttribute).linkName
                const linkConflicts = this.joinTables(sourceRecord, linkRecord!, linkToRecordLinkName!)
                if (!linkConflicts) {
                    this.mergeLog.push(conflicts)
                    linkData.mergedTo = 'source'
                    mergedLinks.push(linkData)
                }
            }
        })

        // CAUTION 这些关系里面没有虚拟关系。上面过滤掉了。
        // FIXME 还要加上 reliance 不是 1:1 的？
        // 3. 剩余的 x:1 关系只合并关系表。
        Object.values(xToOneNotRelianceLinks).forEach(linkData => {
            if(linkData.isFilteredRelation) return
            const { relType, sourceRecord, targetRecord, recordName: linkRecord} = linkData
            const mergeWithSource = relType[1] !== 'n'
            const mergeTarget = mergeWithSource ? sourceRecord : targetRecord
            const linkToRecordLinkName = (this.map.records[linkRecord!].attributes[mergeWithSource ? 'source': 'target']! as RecordAttribute).linkName
            // 只是尝试。有冲突就不会处理
            const linkConflicts = this.joinTables(mergeTarget, linkRecord!, linkToRecordLinkName!)
            if (!linkConflicts) {
                linkData.mergedTo = mergeWithSource ? 'source' : 'target'
                mergedLinks.push(linkData)
            }
        })


        // 4. 先给所有的 virtualLink 赋予默认 的 mergeTo，下一步再按照实际情况修改该
        Object.values(this.map.links).forEach(linkData => {
            if(linkData.isFilteredRelation) return

            if (linkData.isSourceRelation) {
                linkData.mergedTo = 'source'
            }
        })

        // 4.1 给 virtualLink 也更新 map
        mergedLinks.forEach(mergedLinkData => {
            if (mergedLinkData.mergedTo === 'combined' || mergedLinkData.mergedTo === 'source') {
                const sourceLinkName = (this.map.records[mergedLinkData.recordName!].attributes.source as RecordAttribute).linkName
                this.map.links[sourceLinkName].mergedTo = 'combined'
            }

            if (mergedLinkData.mergedTo === 'combined' || mergedLinkData.mergedTo === 'target') {
                const sourceLinkName = (this.map.records[mergedLinkData.recordName!].attributes.target as RecordAttribute).linkName
                this.map.links[sourceLinkName].mergedTo = 'combined'
            }
        })


        // TODO  独立字段的处理
    }
    assignTableAndField() {
        // 1. 给所有的 record 分配表（表名重命名过了）
        const originTableNames = Array.from(this.tableToRecordsMap.keys())
        for(let originTableName of originTableNames) {
            this.renameTableWithJoinedEntities(originTableName)
        }

        // 2. 给所有 record 分配 table，给 value 字段分配 field
        Object.entries(this.map.records).forEach(([recordName, record]) => {
            // 对于 filtered entities，不要覆盖它们的 table
            // 因为它们不在 recordToTableMap 中
            if (!record.isFilteredEntity && !record.isFilteredRelation) {
                record.table = this.recordToTableMap.get(recordName)!
            }
            Object.entries(record.attributes).forEach(([attributeName, attributeData]) => {
                if ((attributeData as RecordAttribute).isRecord) return
                const valueAttributeData = attributeData as ValueAttribute
                valueAttributeData.field = this.generateShortFieldName(`${recordName}_${attributeName}`)
                valueAttributeData.fieldType = this.database!.mapToDBFieldType(valueAttributeData.type, valueAttributeData.collection)
            })
        })

        // 2.1 给所有 relation record 的 table 信息同步到 map.link 上
        Object.entries(this.map.links).forEach(([linkName, link]) => {
            if (link.isSourceRelation) return
            link.table = this.recordToTableMap.get(linkName)!
        })

        // 3. 开始决定合表后的 source/target 字段分配。这里只要处理作为 relation 的 record 的 source/target 字段
        //  CAUTION  因为后面无论是处理 join 还是其他的，都是从 record 上去找字段。不是从 link 中
        Object.entries(this.map.records).forEach(([recordName, record]) => {
            if( !record.isRelation) return
            const link = this.map.links[recordName]
            const sourceAttribute = record.attributes.source as ValueAttribute
            const targetAttribute = record.attributes.target as ValueAttribute
            if (!link.mergedTo ) {
                sourceAttribute.field = this.generateShortFieldName(`${recordName}_source`)
                sourceAttribute.fieldType = this.database!.mapToDBFieldType(sourceAttribute.type, false)

                targetAttribute.field = this.generateShortFieldName(`${recordName}_target`)
                targetAttribute.fieldType = this.database!.mapToDBFieldType(targetAttribute.type, false)
            } else if (link.mergedTo === 'source') {
                // field 名字以 sourceRecord 里面的称呼为主
                targetAttribute.field = this.generateShortFieldName(`${link.sourceRecord}_${link.sourceProperty}`)
                targetAttribute.fieldType = this.database!.mapToDBFieldType(targetAttribute.type, false)

            } else if (link.mergedTo === 'target') {
                sourceAttribute.field = this.generateShortFieldName(`${link.targetRecord}_${link.targetProperty}`)
                sourceAttribute.fieldType = this.database!.mapToDBFieldType(sourceAttribute.type, false)

            } else {
                // combined 情况
                // const sourceRecord = this.map.records[link.sourceRecord]
                // const targetRecord = this.map.records[link.targetRecord]
                // record.attributes.source.field = sourceRecord.attributes[ID_ATTR].field
                // record.attributes.target.field = targetRecord.attributes[ID_ATTR].field
            }
        })
    }
    buildTables() {
        // 先添加 valueAttributes 的字段。
        Object.entries(this.map.records).forEach(([recordName, record]) => {
            if (!this.tables[record.table]) {
                this.tables[record.table] = { columns: {
                    [ROW_ID_ATTR]: {
                        name: ROW_ID_ATTR,
                        type: 'pk',
                        fieldType: this.database!.mapToDBFieldType('pk'),
                    }
                }}
            }

            // 有分配 field 的都说明在这张表内
            Object.entries(record.attributes).forEach(([attributeName, attribute]) => {
                if (!attribute.field || this.tables[record.table].columns[attribute.field]) return
                if(!(attribute as ValueAttribute).fieldType) {
                    throw new Error(`fieldType not found for ${(attribute as ValueAttribute).field} ${(attribute as ValueAttribute).type}`)
                }
                const valueAttribute = attribute as ValueAttribute
                this.tables[record.table].columns[valueAttribute.field] = {
                    name: valueAttribute.field,
                    type: valueAttribute.type,
                    fieldType: valueAttribute.fieldType,
                    defaultValue: valueAttribute.defaultValue,
                    attribute: valueAttribute,
                }
            })
        })

    }

    createTableSQL() {
        return Object.keys(this.tables).map(tableName => {
            const sql = (
            `
CREATE TABLE "${tableName}" (
${Object.values(this.tables[tableName].columns).map(column => {
    let sql = `    "${column.name}" ${column.fieldType}`;
    // 移除 DEFAULT 子句生成，改为程序控制
    // defaultValue 将在创建记录时由程序处理
    return sql;
}).join(',')}
)
`)
            return sql
        })
    }
    createTables() {
        return Promise.all(this.createTableSQL().map(sql => {
            return this.database!.scheme(sql)
        }))
    }

    /**
     * Generate a shortened field name using auto-increment number
     * @param originalName The original long field name
     * @returns A shortened field name that is unique
     */
    private generateShortFieldName(originalName: string): string {
        // If already shortened, return the existing one
        if (this.fieldNameMap.has(originalName)) {
            return this.fieldNameMap.get(originalName)!
        }

        // Extract meaningful prefix from the original name
        const parts = originalName.split('_')
        let prefix = ''
        
        // Try to create a meaningful prefix from the first parts
        if (parts.length >= 2) {
            // Take first few characters from each part
            prefix = parts.slice(0, 2).map(p => p.substring(0, 3).toLowerCase()).join('_')
        } else {
            prefix = originalName.substring(0, 6).toLowerCase()
        }

        // Generate field name with auto-increment number
        const shortName = `${prefix}_${this.fieldCounter}`
        this.fieldCounter++

        this.fieldNameMap.set(originalName, shortName)
        this.usedFieldNames.add(shortName)
        
        return shortName
    }
}


