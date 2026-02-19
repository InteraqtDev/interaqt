import { EntityInstance, RelationInstance, PropertyInstance, Property, Entity, Relation, RefContainer } from "@core";
import { MatchExp } from "./MatchExp.js";
import { assert } from "../utils.js";

export type MergedItem = EntityInstance | RelationInstance;
export type InputItem = EntityInstance | RelationInstance;

export interface MergedItemConfig<T extends MergedItem> {
    name: string;
    inputItems: T[];
    inputFieldName: string;
}

/**
 * 统一处理 merged entity 和 merged relation 的处理器
 */
export function buildEntityTree(entities: EntityInstance[]) {
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
    
export function buildRelationTree(relations: RelationInstance[]) {
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
export function processMergedItems(
        entities: EntityInstance[],
        relations: RelationInstance[],
    ): { entities: EntityInstance[], relations: RelationInstance[] } {
        const refContainer = new RefContainer(entities, relations);
        const entityTree = buildEntityTree(entities);
        const relationTree = buildRelationTree(relations);
        
        // 处理 merged entities
        processMergedItemsOfType(
            entities,
            refContainer,
            entityTree,
            'entity'
        );
        
        // 处理 merged relations
        processMergedItemsOfType(
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
function processMergedItemsOfType<T extends MergedItem>(
        items: T[],
        refContainer: RefContainer,
        itemTree: Map<string, string[]>,
        itemType: 'entity' | 'relation'
    ): void {
        // 过滤出有 input items 的项
        const mergedItems = items.filter(item => {
            const inputItems = getInputItems(item);
            return inputItems !== undefined;
        });
        
        // 处理每个 merged item
        for (const mergedItem of mergedItems) {
            processSingleMergedItem(
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
function processSingleMergedItem<T extends MergedItem>(
        mergedItem: T,
        refContainer: RefContainer,
        itemType: 'entity' | 'relation',
        itemTree: Map<string, string[]>
    ): void {
        // 构建 leaf to input map

        const isEntity = itemType === 'entity';
        const itemName = getItemName(mergedItem);
        const inputTypeFieldName = `__${itemName}_input_${itemType}`;
        
        
        const itemToTransform = isEntity? refContainer.getEntityByName(mergedItem.name!) : refContainer.getRelationByName(mergedItem.name!);
      
        // 转换 merged item
        const [transformedItem, virtualBaseItem] = transformMergedItem(
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
        const inputItems = getInputItems(mergedItem) || [];
        // 如果 mergedItem 约定了 commonProperties，那么要检查是不是所有的 input item 都有 commonProperties，如果没有就报错。
        if( mergedItem.commonProperties) {
            const notValidItems = inputItems.filter(inputItem => {
                // inputItem.properties 是否全部包含了 mergedItem.commonProperties
                return mergedItem.commonProperties!.some(commonProperty => {
                    return !inputItem.properties.some(property => property.name === commonProperty.name && property.type === commonProperty.type );
                });
            });
            if(notValidItems.length > 0) {
                throw new Error(`Merged ${itemType} ${mergedItem.name} defined commonProperties, but these ${itemType}s do not have commonProperties: ${notValidItems.map(item => item.name).join(', ')}`);
            }
        }

        // 处理 input items。让所有 input item 都是 virtual base item 的 filtered item。
        if (inputItems) {
            for (const inputItem of inputItems) {
                processInputItem(
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
function processInputItem(
        inputItem: MergedItem,
        virtualBaseItem: MergedItem,
        inputTypeFieldName: string,
        refContainer: RefContainer,
        isEntity: boolean
    ): void {
        const [filteredItem, baseItem] = createFilteredItemFromInput(
            inputItem,
            virtualBaseItem,
            inputTypeFieldName
        );
        
        // Relation 特殊处理：检查是否就是 input 本身
        if (!isEntity && filteredItem === inputItem) {
            return;
        }
        
        // 获取 base item 的名称
        const baseItemName = getItemName(baseItem);
        
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
function buildLeafToInputMap<T extends MergedItem>(
        item: T,
        itemTree: Map<string, string[]>
    ): Map<string, string[]> {
        const leafToInputMap = new Map<string, string[]>();
        
        const inputItems = getInputItems(item);
        if (inputItems && inputItems.length > 0) {
            for (const inputItem of inputItems) {
                const itemName = getItemName(inputItem);
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
function createInputTypeProperty(
        inputFieldName: string,
        mergedItem: MergedItem,
        itemTree: Map<string, string[]>
    ): PropertyInstance {
        const leafToInputMap = buildLeafToInputMap(mergedItem, itemTree);
        
        return Property.create({
            name: inputFieldName,
            type: 'json',
            defaultValue: (record: any, entityName: string) => {
                const inputItems = getInputItems(mergedItem) || [];
                const inputCandidates = leafToInputMap.get(entityName) || [];
                const inputNames = inputCandidates.filter(name => 
                    inputItems.some(input => getItemName(input) === name)
                );
                return inputNames.length > 0 ? inputNames : [entityName];
            }
        });
    }
    
/**
 * 合并所有 input items 的 properties
 */
function mergeProperties(
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
        
        const inputItems = getInputItems(mergedItem) || [];
        const mergedProperties: PropertyInstance[] = [];
        const itemPropertyMap = new Map<string, {[key: string]: PropertyInstance}>();
        const mergedPropertyMap: {[k: string]: PropertyInstance} = Object.fromEntries(mergedItem.commonProperties?.map(prop => [prop.name, prop]) || []);
        
        // 收集所有同名 properties。
        // 如果这个 item 已经是 filtered item，那么就从 base item 获取 properties。
        for (const inputItem of inputItems) {
            let sourceItem = inputItem;
            
            // 如果是 filtered item，需要从 base item 获取 properties
            if (isEntity(sourceItem)) {
                while ((sourceItem as EntityInstance).baseEntity && sourceItem.properties.length === 0) {
                    sourceItem = (sourceItem as EntityInstance).baseEntity as EntityInstance;
                }
            } else if (isRelation(sourceItem)) {
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
function transformMergedItem<T extends MergedItem>(
        mergedItem: T,
        inputFieldName: string,
        itemTree: Map<string, string[]>,
        refContainer: RefContainer
    ): [T, T] {
        
        // 创建 input type property
        const inputTypeProperty = createInputTypeProperty(
            inputFieldName,
            mergedItem,
            itemTree
        );
        
        // 合并 properties。
        // 特别注意这里，虽然用户在创建 merged entity 或 relation 时，不能指定 properties，
        // 但是 computation 可能有往记录上绑定 state 的需求。
        const mergedProperties = [
            ...mergeProperties(
                mergedItem,
                itemTree,
                refContainer
            ),
            inputTypeProperty,
            ...mergedItem.properties,
        ]
        
        if (isEntity(mergedItem)) {
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
                        const inputRelationName = getItemName(inputRelation);
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
export function createFilteredItemFromInput<T extends MergedItem>(
        inputItem: T,
        baseItem: T,
        inputFieldName: string
    ): [T, T] {
        if (isEntity(inputItem)) {
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
            const inputRelationName = getItemName(inputRelation);
            
            // 如果 input relation 已经是 filtered relation，直接返回
            if (inputRelation.baseRelation) {
                return [inputRelation as T, getRootBaseRelation(inputRelation) as T];
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
function getRootBaseRelation(relation: RelationInstance): RelationInstance {
        let current = relation;
        while (current.baseRelation) {
            current = current.baseRelation;
        }
        return current;
    }
    
// 辅助方法
function isEntity(item: MergedItem): item is EntityInstance {
        return 'inputEntities' in item || !('sourceProperty' in item);
    }
    
function isRelation(item: MergedItem): item is RelationInstance {
        return 'sourceProperty' in item;
    }
    
function getInputItems(item: MergedItem): MergedItem[]|undefined {
        if (isEntity(item)) {
            return (item as EntityInstance).inputEntities;
        } else {
            return (item as RelationInstance).inputRelations;
        }
    }
    
function getItemName(item: MergedItem): string {
        if (isEntity(item)) {
            return (item as EntityInstance).name;
        } else {
            const relation = item as RelationInstance;
            return relation.name!
        }
    }
