import { EntityInstance, RelationInstance, PropertyInstance, Property, Entity, Relation, RefContainer } from "@shared";
import { MatchExp } from "./MatchExp.js";
import { assert } from "../utils.js";

export type MergedItem = EntityInstance | RelationInstance;
export type InputItem = EntityInstance | RelationInstance;

export interface MergedItemConfig<T extends MergedItem> {
    name: string;
    inputItems: T[];
    inputFieldName: string;
    inputFieldType: 'json' | 'string-collection';
}

/**
 * 统一处理 merged entity 和 merged relation 的处理器
 */
export class MergedItemProcessor {
    static buildEntityTree(entities: EntityInstance[]) {
        const tree = new Map<string, string[]>()
        for (const entity of entities) {
            if (entity.inputEntities) {
                tree.set(entity.name, entity.inputEntities.map(inputEntity => inputEntity.name))
            } else if(entity.baseEntity) {
                const leafSet = tree.get(entity.baseEntity.name!) || []
                leafSet.push(entity.name)
                tree.set(entity.baseEntity.name!, leafSet)
            }
        }
        return tree
    }
    
    static buildRelationTree(relations: RelationInstance[]) {
        const tree = new Map<string, string[]>()
        for (const relation of relations) {
            const relationName = relation.name || 
                `${relation.source.name}_${relation.sourceProperty}_${relation.targetProperty}_${relation.target.name}`;
            if (relation.inputRelations) {
                const inputRelationNames = relation.inputRelations.map(inputRelation => {
                    return inputRelation.name!
                });
                tree.set(relationName, inputRelationNames)
            } else if(relation.baseRelation) {
                const baseRelationName = relation.baseRelation.name || 
                    `${relation.baseRelation.source.name}_${relation.baseRelation.sourceProperty}_${relation.baseRelation.targetProperty}_${relation.baseRelation.target.name}`;
                const leafSet = tree.get(baseRelationName) || []
                leafSet.push(relationName)
                tree.set(baseRelationName, leafSet)
            }
        }
        return tree
    }
    /**
     * 统一处理所有 merged items (entities 和 relations)
     */
    static processMergedItems(
        entities: EntityInstance[],
        relations: RelationInstance[],
    ): { entities: EntityInstance[], relations: RelationInstance[] } {
        const refContainer = new RefContainer(entities, relations);
        const entityTree = MergedItemProcessor.buildEntityTree(entities);
        const relationTree = MergedItemProcessor.buildRelationTree(relations);
        
        // 处理 merged entities
        this.processMergedItemsOfType(
            entities,
            refContainer,
            entityTree,
            'entity'
        );
        
        // 处理 merged relations
        this.processMergedItemsOfType(
            relations,
            refContainer,
            relationTree,
            'relation'
        );
        
        return refContainer.getAll();
    }
    
    /**
     * 处理特定类型的 merged items
     */
    private static processMergedItemsOfType<T extends MergedItem>(
        items: T[],
        refContainer: RefContainer,
        itemTree: Map<string, string[]>,
        itemType: 'entity' | 'relation'
    ): void {
        // 过滤出有 input items 的项
        const mergedItems = items.filter(item => {
            const inputItems = this.getInputItems(item);
            return inputItems && inputItems.length > 0;
        });
        
        if (mergedItems.length === 0) {
            return;
        }
        
        
        
        // 处理每个 merged item
        for (const mergedItem of mergedItems) {
            this.processSingleMergedItem(
                mergedItem,
                refContainer,
                itemType,
                itemTree
            );
        }
    }
    
    /**
     * 处理单个 merged item
     */
    private static processSingleMergedItem<T extends MergedItem>(
        mergedItem: T,
        refContainer: RefContainer,
        itemType: 'entity' | 'relation',
        itemTree: Map<string, string[]>
    ): void {
        // 构建 leaf to input map

        const isEntity = itemType === 'entity';
        const itemName = this.getItemName(mergedItem);
        const inputTypeFieldName = `__${itemName}_input_${itemType}`;
        
        
        const itemToTransform = isEntity? refContainer.getEntityByName(mergedItem.name!) : refContainer.getRelationByName(mergedItem.name!);
      
        // 转换 merged item
        const [transformedItem, virtualBaseItem] = this.transformMergedItem(
            itemToTransform!,
            inputTypeFieldName,
            itemTree,
            refContainer
        );
        
        // 替换原 item
        refContainer.replace(transformedItem, mergedItem);
        if (virtualBaseItem !== transformedItem) {
            refContainer.add(virtualBaseItem);
        }

        // 获取 input items（对于 entity 需要更新）
        const inputItems = this.getInputItems(mergedItem);
        // 处理 input items。让所有 input item 都是 virtual base item 的 filtered item。
        if (inputItems) {
            for (const inputItem of inputItems) {
                this.processInputItem(
                    inputItem,
                    virtualBaseItem!,
                    inputTypeFieldName,
                    refContainer,
                    isEntity
                );
            }
        }
    }
    
    /**
     * 处理单个 input item
     */
    private static processInputItem(
        inputItem: MergedItem,
        virtualBaseItem: MergedItem,
        inputTypeFieldName: string,
        refContainer: RefContainer,
        isEntity: boolean
    ): void {
        const [filteredItem, baseItem] = this.createFilteredItemFromInput(
            inputItem,
            virtualBaseItem,
            inputTypeFieldName
        );
        
        // Relation 特殊处理：检查是否就是 input 本身
        if (!isEntity && filteredItem === inputItem) {
            return;
        }
        
        // 获取 base item 的名称
        const baseItemName = this.getItemName(baseItem);
        
        // 查找并替换已存在的 item
        const existingItem = isEntity 
            ? refContainer.getEntityByName(baseItemName)
            : refContainer.getRelationByName(baseItemName);
            
        if (existingItem) {
            refContainer.replace(filteredItem, existingItem);
        }
    }
    
    /**
     * 构建从子孙 item 到 input item 的映射关系
     * 用于处理嵌套的 merged/filtered items
     */
    static buildLeafToInputMap<T extends MergedItem>(
        item: T,
        itemTree: Map<string, string[]>
    ): Map<string, string[]> {
        const leafToInputMap = new Map<string, string[]>();
        
        const inputItems = this.getInputItems(item);
        if (inputItems && inputItems.length > 0) {
            for (const inputItem of inputItems) {
                const itemName = this.getItemName(inputItem);
                const leafSet = [...(itemTree.get(itemName) || [])];
                const inputItemNames = leafToInputMap.get(itemName) || [];
                inputItemNames.push(itemName);
                leafToInputMap.set(itemName, inputItemNames);
                
                // 递归处理所有子孙 items
                while (leafSet.length) {
                    const leafItem = leafSet.shift()!;
                    const leafInputItemNames = leafToInputMap.get(leafItem) || [];
                    leafInputItemNames.push(...inputItemNames);
                    leafToInputMap.set(leafItem, leafInputItemNames);
                    const childSet = itemTree.get(leafItem) || [];
                    leafSet.push(...childSet);
                }
            }
        }
        
        return leafToInputMap;
    }
    
    /**
     * 创建用于记录 input type 的特殊字段
     */
    static createInputTypeProperty(
        inputFieldName: string,
        mergedItem: MergedItem,
        itemTree: Map<string, string[]>
    ): PropertyInstance {
        const leafToInputMap = this.buildLeafToInputMap(mergedItem, itemTree);
        
        return Property.create({
            name: inputFieldName,
            type: 'json',
            defaultValue: (record: any, entityName: string) => {
                const inputItems = this.getInputItems(mergedItem);
                const inputCandidates = leafToInputMap.get(entityName) || [];
                const inputNames = inputCandidates.filter(name => 
                    inputItems.some(input => this.getItemName(input) === name)
                );
                return inputNames.length > 0 ? inputNames : [entityName];
            }
        });
    }
    
    /**
     * 合并所有 input items 的 properties
     */
    static mergeProperties(
        mergedItem: MergedItem,
        itemTree: Map<string, string[]>,
        refContainer: RefContainer
    ): PropertyInstance[] {
        // 收到的 itemName 有三种：
        // 1. 就是当前的 input item 的 name。
        // 2. 如果当前 input item 被 filtered 了，那么可能是 filtered item 的 name。
        // 3. 如果当前 input item 是 merged item，那么一定子 input entity 的 name。

        // defaultValue 的取值情况：
        // 1. inputEntity 是个普通 entity，那就在当前 record 上获取 defaultValue。
        // 2. inputEntity 是个 filtered entity，那就在 root base entity 上获取 defaultValue。
        // 3. inputEntity 是个 merged entity，那就在子孙 input entity 的 root base entity（可能就是子孙自己，取决于它是不是 filtered） 上获取 defaultValue。
        // 4. inputEntity 如果是个 merged entity，并且 prop 是用来区分 input item 的，那 defaultValue 就是应该是 transform 时构造出来的。
        
        const inputItems = this.getInputItems(mergedItem);
        const mergedProperties: PropertyInstance[] = [];
        const itemPropertyMap = new Map<string, {[key: string]: PropertyInstance}>();
        const mergedPropertyMap: {[k: string]: PropertyInstance} = {};
        
        // 收集所有同名 properties。
        // 如果这个 item 已经是 filtered item，那么就从 base item 获取 properties。
        for (const inputItem of inputItems) {
            let sourceItem = inputItem;
            
            // 如果是 filtered item，需要从 base item 获取 properties
            if (this.isEntity(sourceItem)) {
                while ((sourceItem as EntityInstance).baseEntity && sourceItem.properties.length === 0) {
                    sourceItem = (sourceItem as EntityInstance).baseEntity as EntityInstance;
                }
            } else if (this.isRelation(sourceItem)) {
                while ((sourceItem as RelationInstance).baseRelation && sourceItem.properties.length === 0) {
                    sourceItem = (sourceItem as RelationInstance).baseRelation as RelationInstance;
                }
            }

            const propertyMap = Object.fromEntries(sourceItem.properties.map(prop => [prop.name, prop]));
            itemPropertyMap.set(inputItem.name!, propertyMap);

            // 合并 property map
            Object.assign(mergedPropertyMap, propertyMap);

            const isInputItemMergedItem = (inputItem as EntityInstance).inputEntities || (inputItem as RelationInstance).inputRelations;
            // 递归处理所有子孙节点 
            const childItemNames = [...(itemTree.get(inputItem.name!) || [])];
            while(childItemNames.length) {
                const childItemName = childItemNames.shift()!;
                if (!isInputItemMergedItem) {
                    // 如果不是 merged item， 就只有 filtered item 了，所有 filtered item 的 property map 都是继承自 source item 的。
                    itemPropertyMap.set(childItemName, propertyMap);
                } else {
                    // merged item 的 sub 是自己的。
                    const childItem = refContainer.getEntityByName(childItemName) || refContainer.getRelationByName(childItemName);
                    const isChildInputItemMergedItem = (childItem as EntityInstance).inputEntities || (childItem as RelationInstance).inputRelations;
                    if (!isChildInputItemMergedItem) {
                        const childItemPropertyMap = Object.fromEntries(childItem!.properties.map(prop => [prop.name, prop]));
                        itemPropertyMap.set(childItemName, childItemPropertyMap);
                        // 继续合并
                        Object.assign(mergedPropertyMap, childItemPropertyMap);
                    }
                }
                childItemNames.push(...(itemTree.get(childItemName) || []));
            }
        }
        
        // 为每个 property 创建合并版本
        for (const propName of Object.keys(mergedPropertyMap)) {
            
            const mergedProp = Property.clone(mergedPropertyMap[propName], true);
            
            // 创建新的 defaultValue
            mergedProp.defaultValue = (record: any, itemName: string) => {
                // 从 itemPropertyMap 中找 defaultValue
                const property = itemPropertyMap.get(itemName)?.[propName];
                if (property?.defaultValue) {
                    return property.defaultValue(record, itemName);
                }
                
                return undefined;
            };
            
            mergedProperties.push(mergedProp);
        }
        
        return mergedProperties;
    }
    
    /**
     * 转换 merged item（entity 或 relation）
     */
    static transformMergedItem<T extends MergedItem>(
        mergedItem: T,
        inputFieldName: string,
        itemTree: Map<string, string[]>,
        refContainer: RefContainer
    ): [T, T] {
        
        // 创建 input type property
        const inputTypeProperty = this.createInputTypeProperty(
            inputFieldName,
            mergedItem,
            itemTree
        );
        
        // 合并 properties。
        // 特别注意这里，虽然用户在创建 merged entity 或 relation 时，不能指定 properties，
        // 但是 computation 可能有往记录上绑定 state 的需求。
        const mergedProperties = [
            ...this.mergeProperties(
                mergedItem,
                itemTree,
                refContainer
            ),
            inputTypeProperty,
            ...mergedItem.properties,
        ]
        
        if (this.isEntity(mergedItem)) {
            // Entity 的处理
            const entity = refContainer.getEntityByName(mergedItem.name!)!;
            const transformedEntity = Entity.create({
                name: entity.name,
            });
            
            let virtualBaseEntity: undefined | EntityInstance = undefined;
            
            // 如果有 filtered input entity，则需要创建虚拟的 base entity
            if (entity.inputEntities?.some(inputEntity => inputEntity.baseEntity)) {
                virtualBaseEntity = Entity.create({
                    name: `${entity.name}_base`,
                    properties: mergedProperties,
                });
                transformedEntity.baseEntity = virtualBaseEntity;
                // 任意一个 input entity 都符合
                transformedEntity.matchExpression = MatchExp.fromArray(
                    entity.inputEntities!.map(inputEntity => ({
                        key: inputFieldName,
                        value: ['contains', inputEntity.name]
                    }))
                );
            } else {
                transformedEntity.properties = mergedProperties;
            }
            
            return [transformedEntity as T, (virtualBaseEntity || transformedEntity) as T];
        } else {
            // Relation 的处理
            const relation = refContainer.getRelationByName(mergedItem.name!)!;
            const transformedRelation = Relation.create({
                name: relation.name,
                source: relation.source,
                sourceProperty: relation.sourceProperty,
                target: relation.target,
                targetProperty: relation.targetProperty,
                type: relation.type,
                isTargetReliance: relation.isTargetReliance
            });
            
            let virtualBaseRelation: undefined | RelationInstance = undefined;
            
            // 如果有 filtered input relation，则需要创建虚拟的 base relation
            if (relation.inputRelations?.some(inputRelation => inputRelation.baseRelation)) {
                const baseRelationName = relation.name || 
                    `${relation.source.name}_${relation.sourceProperty}_${relation.targetProperty}_${relation.target.name}`;
                    
                virtualBaseRelation = Relation.create({
                    name: `__${baseRelationName}_base`,
                    source: relation.source,
                    sourceProperty: `__${relation.sourceProperty}_base`,
                    target: relation.target,
                    targetProperty: `__${relation.targetProperty}_base`,
                    type: relation.type,
                    isTargetReliance: relation.isTargetReliance,
                    properties: mergedProperties
                });
                
                transformedRelation.baseRelation = virtualBaseRelation;
                transformedRelation.sourceProperty = relation.sourceProperty;
                transformedRelation.targetProperty = relation.targetProperty;
                
                // 任意一个 input relation 都符合
                transformedRelation.matchExpression = MatchExp.fromArray(
                    relation.inputRelations!.map(inputRelation => {
                        const inputRelationName = this.getItemName(inputRelation);
                        return {
                            key: inputFieldName,
                            value: ['contains', inputRelationName]
                        };
                    })
                );
            } else {
                transformedRelation.properties = mergedProperties;
            }
            
            return [transformedRelation as T, (virtualBaseRelation || transformedRelation) as T];
        }
    }
    
    /**
     * 从 input item 创建 filtered item
     */
    static createFilteredItemFromInput<T extends MergedItem>(
        inputItem: T,
        baseItem: T,
        inputFieldName: string
    ): [T, T] {
        if (this.isEntity(inputItem)) {
            // Entity 的处理
            const inputEntity = inputItem as EntityInstance;
            const baseEntity = baseItem as EntityInstance;
            
            // 如果 input entity 已经是 filtered entity，需要找到它的 root base entity
            let rootBase = inputEntity;
            if (inputEntity.baseEntity) {
                while ((rootBase as EntityInstance).baseEntity) {
                    rootBase = (rootBase as EntityInstance).baseEntity as EntityInstance;
                }
            }
            
            // 创建新的 filtered entity
            const filteredEntity = Entity.clone(rootBase as EntityInstance, true);
            filteredEntity.baseEntity = baseEntity;
            filteredEntity.matchExpression = MatchExp.atom({
                key: inputFieldName,
                value: ['contains', inputEntity.name]
            });
            
            return [filteredEntity as T, rootBase as T];
        } else {
            // Relation 的处理
            const inputRelation = inputItem as RelationInstance;
            const baseRelation = baseItem as RelationInstance;
            const inputRelationName = this.getItemName(inputRelation);
            
            // 如果 input relation 已经是 filtered relation，直接返回
            if (inputRelation.baseRelation) {
                return [inputRelation as T, this.getRootBaseRelation(inputRelation) as T];
            } else {
                // 创建一个 filtered relation
                const filteredRelation = Relation.create({
                    name: inputRelationName,
                    baseRelation: baseRelation,
                    sourceProperty: inputRelation.sourceProperty,
                    targetProperty: inputRelation.targetProperty,
                    matchExpression: MatchExp.atom({
                        key: inputFieldName,
                        value: ['contains', inputRelationName]
                    })
                });
                
                return [filteredRelation as T, inputRelation as T];
            }
        }
    }
    
    /**
     * 获取 relation 的根 base relation
     */
    private static getRootBaseRelation(relation: RelationInstance): RelationInstance {
        let current = relation;
        while (current.baseRelation) {
            current = current.baseRelation;
        }
        return current;
    }
    
    // 辅助方法
    private static isEntity(item: MergedItem): item is EntityInstance {
        return 'inputEntities' in item || !('sourceProperty' in item);
    }
    
    private static isRelation(item: MergedItem): item is RelationInstance {
        return 'sourceProperty' in item;
    }
    
    private static getInputItems(item: MergedItem): MergedItem[] {
        if (this.isEntity(item)) {
            return (item as EntityInstance).inputEntities || [];
        } else {
            return (item as RelationInstance).inputRelations || [];
        }
    }
    
    private static getItemName(item: MergedItem): string {
        if (this.isEntity(item)) {
            return (item as EntityInstance).name;
        } else {
            const relation = item as RelationInstance;
            return relation.name || 
                `${relation.source.name}_${relation.sourceProperty}_${relation.targetProperty}_${relation.target.name}`;
        }
    }
}
