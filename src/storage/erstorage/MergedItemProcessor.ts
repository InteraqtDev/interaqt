import { EntityInstance, RelationInstance, PropertyInstance, Property, Entity, Relation, RefContainer } from "@core";
import { MatchExp, MatchExpressionData } from "./MatchExp.js";

export type MergedItem = EntityInstance | RelationInstance;
export type InputItem = EntityInstance | RelationInstance;

/**
 * merged entity/relation 的判别列（discriminator column）名。
 *
 * merged item 本质是单表继承（Single Table Inheritance）：所有 input 的记录存放在同一张
 * 物理表中，用一个字符串判别列记录"记录以哪个具体类型创建"。
 * - 记录创建时 `__type` = 创建所用实体的具体类型名（filtered entity 取其 root base 名）。
 * - 普通 input 的成员条件：`__type = 'X'`（等值匹配，可索引，无跨 driver JSON 兼容问题）。
 * - filtered input 的成员条件：`__type = '根 base 名' AND 谓词`（谓词声明式，随数据变化自然进出）。
 * - merged item 的成员条件：各 input 成员条件的 OR。
 */
export const MERGED_TYPE_ATTR = '__type';

export interface ProcessMergedItemsResult {
    entities: EntityInstance[];
    relations: RelationInstance[];
    /**
     * 抽象名集合：不允许以这些名字直接创建记录。
     * 包括所有 merged item 名、以 merged item 为（传递）base 的 filtered item 名，
     * 以及内部生成的虚拟 base 名。
     */
    abstractNames: Set<string>;
    /**
     * 持有 `__type` 判别列的物理 base 名集合（merged item 自身或其虚拟 base）。
     * 判别列由框架管理（记录创建时按使用的名字写入），公共写入口据此拒绝显式覆写。
     */
    discriminatorHostNames: Set<string>;
    /**
     * 各 input 视图名（含 filtered input 的 root base 名）→ 该名字下可写的 value 属性名集合。
     * merged 编译把所有 input 的属性合并进同一张物理表，属性命名空间因此被共享——
     * 以 input A 的名义写入 input B 的特有属性会静默落库（跨视图列污染）。
     * 公共写入口据此拒绝写入不属于该 input 声明面的属性（explicit control）。
     */
    inputWritablePropertyNames: Map<string, string[]>;
}

function isEntity(item: MergedItem): item is EntityInstance {
    return !('sourceProperty' in item);
}

function getItemName(item: MergedItem): string {
    if (isEntity(item)) return item.name;
    const relation = item as RelationInstance;
    return relation.name || `${relation.source.name}_${relation.sourceProperty}_${relation.targetProperty}_${relation.target.name}`;
}

function getInputItems(item: MergedItem): MergedItem[] | undefined {
    return isEntity(item) ? item.inputEntities : (item as RelationInstance).inputRelations;
}

function getBaseItem(item: MergedItem): MergedItem | undefined {
    return isEntity(item) ? (item.baseEntity as MergedItem | undefined) : (item as RelationInstance).baseRelation;
}

/**
 * 沿（原始图的）base 链走到根，累积沿途谓词。
 */
function collectBaseChain(item: MergedItem): { root: MergedItem, match: MatchExpressionData | undefined } {
    let current: MergedItem = item;
    let match: MatchExpressionData | undefined = undefined;
    while (getBaseItem(current)) {
        const currentMatch = (current as { matchExpression?: MatchExpressionData }).matchExpression;
        if (currentMatch) {
            match = match ? match.and(currentMatch) : currentMatch;
        }
        current = getBaseItem(current)!;
    }
    return { root: current, match };
}

/**
 * 单个 merged item 编译后的信息。
 */
type CompiledMergedInfo = {
    // 成员条件：各 input 成员条件的 OR（以 __type 判别列 + 声明式谓词表达）。
    // inputItems 为空的退化 merged item（空联合）没有成员条件。
    memberCondition: MatchExpressionData | undefined,
    // 该 merged item 的物理 base（虚拟 base 或 merged item 自身）所承载的所有具体类型名。
    // 用于嵌套 merge 时 rebase 内层 base 的成员条件。
    hostedTypes: Set<string>,
    // 物理 base 的名字
    physicalBaseName: string,
}

/**
 * 按依赖关系拓扑排序 merged items：被用作 input 的 merged item 先处理。
 */
function sortMergedItemsByDependency<T extends MergedItem>(mergedItems: T[]): T[] {
    const mergedByName = new Map(mergedItems.map(item => [getItemName(item), item]));
    const sorted: T[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (item: T) => {
        const name = getItemName(item);
        if (visited.has(name)) return;
        if (visiting.has(name)) {
            throw new Error(`Circular merged item dependency detected at "${name}"`);
        }
        visiting.add(name);
        for (const input of getInputItems(item) || []) {
            const inputName = getItemName(input);
            const inputMerged = mergedByName.get(inputName);
            if (inputMerged) visit(inputMerged);
        }
        visiting.delete(name);
        visited.add(name);
        sorted.push(item);
    };

    mergedItems.forEach(visit);
    return sorted;
}

/**
 * 统一处理所有 merged items (entities 和 relations)。
 *
 * merged item 被"编译"为 filtered item 视图：
 * 1. 物理 base（merged item 自身或虚拟 base）持有合并后的 properties + `__type` 判别列。
 * 2. 每个 input 变成物理 base 上的 filtered item，成员条件用 `__type` 表达。
 * 3. filtered input 的 root base（如 CustomerBase）同样 rebase 为 filtered item，保持可查询性。
 * 之后查询重写与事件（membership diff）完全复用 filtered entity 的统一机制，无需独立代码路径。
 */
export function processMergedItems(
    entities: EntityInstance[],
    relations: RelationInstance[],
): ProcessMergedItemsResult {
    const refContainer = new RefContainer(entities, relations);
    const abstractNames = new Set<string>();
    const discriminatorHostNames = new Set<string>();
    const inputWritablePropertyNames = new Map<string, string[]>();

    // 1. 基于原始（克隆前的）图计算每个名字的具体类型值：
    //    typeValue(name) = 沿 base 链走到根的名字；根是 merged item 时该名字是抽象的（不可创建）。
    const allItems: MergedItem[] = [...entities, ...relations];
    const typeValueByName = new Map<string, string>();
    for (const item of allItems) {
        const name = getItemName(item);
        const { root } = collectBaseChain(item);
        if (getInputItems(root)) {
            // merged item 自身，或（传递）base 是 merged item 的 filtered item：无法确定具体 __type。
            abstractNames.add(name);
        } else {
            typeValueByName.set(name, getItemName(root));
        }
    }

    const compiledByName = new Map<string, CompiledMergedInfo>();

    const mergedEntities = sortMergedItemsByDependency(entities.filter(entity => entity.inputEntities));
    const mergedRelations = sortMergedItemsByDependency(relations.filter(relation => relation.inputRelations));

    const entityTree = buildItemTree(entities);
    const relationTree = buildItemTree(relations);

    for (const mergedEntity of mergedEntities) {
        processSingleMergedItem(mergedEntity, refContainer, 'entity', entityTree, typeValueByName, compiledByName, abstractNames, discriminatorHostNames, inputWritablePropertyNames);
    }
    for (const mergedRelation of mergedRelations) {
        processSingleMergedItem(mergedRelation, refContainer, 'relation', relationTree, typeValueByName, compiledByName, abstractNames, discriminatorHostNames, inputWritablePropertyNames);
    }

    const result = refContainer.getAll();
    return { ...result, abstractNames, discriminatorHostNames, inputWritablePropertyNames };
}

/**
 * 构建 base/input 树（name -> 直接子孙 names），用于 mergeProperties 的 defaultValue 分发。
 */
export function buildItemTree(items: MergedItem[]) {
    const tree = new Map<string, string[]>();
    for (const item of items) {
        const name = getItemName(item);
        const inputItems = getInputItems(item);
        if (inputItems) {
            const children = tree.get(name) || [];
            children.push(...inputItems.map(getItemName));
            tree.set(name, children);
        } else {
            const base = getBaseItem(item);
            if (base) {
                const baseName = getItemName(base);
                const children = tree.get(baseName) || [];
                children.push(name);
                tree.set(baseName, children);
            }
        }
    }
    return tree;
}

/**
 * 计算单个 input 的成员条件与其承载的具体类型集合。
 */
function resolveInputMembership(
    inputItem: MergedItem,
    typeValueByName: Map<string, string>,
    compiledByName: Map<string, CompiledMergedInfo>,
): { memberCondition: MatchExpressionData, hostedTypes: Set<string>, rootToRebase?: MergedItem } {
    const inputName = getItemName(inputItem);

    // 嵌套 merged input：成员条件与承载类型来自其编译结果。
    const compiled = compiledByName.get(inputName);
    if (compiled) {
        if (!compiled.memberCondition) {
            throw new Error(`Merged item "${inputName}" has no input items (empty union) and cannot be used as an input of another merged item.`);
        }
        return { memberCondition: compiled.memberCondition, hostedTypes: new Set(compiled.hostedTypes) };
    }

    if (getBaseItem(inputItem)) {
        // filtered input：root base 的类型条件 AND 自身完整谓词链。
        const { root, match } = collectBaseChain(inputItem);
        const rootName = getItemName(root);
        const rootCompiled = compiledByName.get(rootName);
        if (rootCompiled) {
            if (!rootCompiled.memberCondition) {
                throw new Error(`Merged item "${rootName}" has no input items (empty union) and cannot be used as the base of a filtered input.`);
            }
            // root 是（已编译的）merged item：成员条件 = merged 成员条件 AND 谓词。
            const memberCondition = match ? rootCompiled.memberCondition.and(match) : rootCompiled.memberCondition;
            return { memberCondition, hostedTypes: new Set(rootCompiled.hostedTypes) };
        }
        const typeAtom = MatchExp.atom({ key: MERGED_TYPE_ATTR, value: ['=', rootName] });
        return {
            memberCondition: match ? typeAtom.and(match) : typeAtom,
            hostedTypes: new Set([rootName]),
            rootToRebase: root,
        };
    }

    // 普通 input：等值判别。
    return {
        memberCondition: MatchExp.atom({ key: MERGED_TYPE_ATTR, value: ['=', typeValueByName.get(inputName) || inputName] }),
        hostedTypes: new Set([inputName]),
    };
}

/**
 * 处理单个 merged item：编译成员条件、生成物理 base、把 inputs 与 root bases rebase 为 filtered items。
 */
function processSingleMergedItem<T extends MergedItem>(
    mergedItem: T,
    refContainer: RefContainer,
    itemType: 'entity' | 'relation',
    itemTree: Map<string, string[]>,
    typeValueByName: Map<string, string>,
    compiledByName: Map<string, CompiledMergedInfo>,
    abstractNames: Set<string>,
    discriminatorHostNames: Set<string>,
    inputWritablePropertyNames: Map<string, string[]>,
): void {
    const isEntityType = itemType === 'entity';
    const itemName = getItemName(mergedItem);
    const inputItems = getInputItems(mergedItem) || [];

    // 校验 commonProperties（约定：所有 input 必须包含同名同类型的 property）
    if (mergedItem.commonProperties) {
        const notValidItems = inputItems.filter(inputItem => {
            return mergedItem.commonProperties!.some(commonProperty => {
                return !inputItem.properties.some(property => property.name === commonProperty.name && property.type === commonProperty.type);
            });
        });
        if (notValidItems.length > 0) {
            throw new Error(`Merged ${itemType} ${itemName} defined commonProperties, but these ${itemType}s do not have commonProperties: ${notValidItems.map(item => getItemName(item)).join(', ')}`);
        }
    }

    // 用户属性不允许与判别列同名。
    for (const inputItem of inputItems) {
        if (inputItem.properties.some(property => property.name === MERGED_TYPE_ATTR)) {
            throw new Error(`Property name "${MERGED_TYPE_ATTR}" on ${itemType} "${getItemName(inputItem)}" conflicts with the merged ${itemType} discriminator column. Please rename the property.`);
        }
    }

    // 1. 逐 input 计算成员条件
    const inputMemberships = inputItems.map(inputItem => ({
        inputItem,
        ...resolveInputMembership(inputItem, typeValueByName, compiledByName),
    }));

    const hostedTypes = new Set<string>();
    inputMemberships.forEach(m => m.hostedTypes.forEach(t => hostedTypes.add(t)));

    // inputItems 为空是退化情况（空联合，无任何成员），只承载 commonProperties 定义。
    let memberCondition: MatchExpressionData | undefined = inputMemberships[0]?.memberCondition;
    for (let i = 1; i < inputMemberships.length; i++) {
        memberCondition = memberCondition!.or(inputMemberships[i].memberCondition);
    }

    // 2. 合并 properties + 判别列。
    // CAUTION 属性合并必须基于 refContainer 中的克隆（its input references 已指向先前处理过的
    //  transformed item）：嵌套 merge 时内层 merged item 的 properties 只存在于 transformed 版本上。
    const itemToTransform = isEntityType ? refContainer.getEntityByName(itemName)! : refContainer.getRelationByName(itemName)!;
    const mergedProperties = [
        ...mergeProperties(itemToTransform, itemTree, refContainer),
        createTypeProperty(typeValueByName),
        ...mergedItem.properties,
    ];
    const hasFilteredInput = inputItems.some(inputItem => getBaseItem(inputItem));
    const [transformedItem, physicalBaseItem] = transformMergedItem(
        itemToTransform as T,
        mergedProperties,
        hasFilteredInput ? memberCondition : undefined,
    );

    refContainer.replace(transformedItem, itemToTransform);
    let registeredBaseItem: MergedItem = physicalBaseItem;
    if (physicalBaseItem !== transformedItem) {
        // CAUTION RefContainer.add 会克隆传入实例，后续 rebase 必须引用容器中注册的克隆，
        //  否则图中会残留"同名不同身份"的悬挂引用。
        registeredBaseItem = refContainer.add(physicalBaseItem) as MergedItem;
        if (isEntity(transformedItem)) {
            (transformedItem as EntityInstance).baseEntity = registeredBaseItem as EntityInstance;
        } else {
            (transformedItem as RelationInstance).baseRelation = registeredBaseItem as RelationInstance;
        }
        abstractNames.add(getItemName(registeredBaseItem));
    }

    compiledByName.set(itemName, {
        memberCondition,
        hostedTypes,
        physicalBaseName: getItemName(registeredBaseItem),
    });
    discriminatorHostNames.add(getItemName(registeredBaseItem));

    // 4. 把每个 input 替换成物理 base 上的 filtered item
    //    rootBaseName -> 该 root base 承载的类型集合，用于保持 root base 的可查询性（IS-A 语义）。
    const rootsToRebase = new Map<string, MergedItem>();
    for (const { inputItem, memberCondition: inputCondition } of inputMemberships) {
        const inputName = getItemName(inputItem);
        // rebase 之前记录该 input 名下可写的属性集合：pre-rebase 的 base 链上全部声明属性
        //（plain input = 自身；filtered input = 自身 + root base；嵌套 merged input = 其合并后的全集）。
        inputWritablePropertyNames.set(inputName, collectWritablePropertyNames(inputName, refContainer, isEntityType));
        rebaseAsFilteredItem(inputName, registeredBaseItem, inputCondition, refContainer, isEntityType);
    }
    for (const { rootToRebase } of inputMemberships) {
        if (rootToRebase && getItemName(rootToRebase) !== getItemName(registeredBaseItem)) {
            rootsToRebase.set(getItemName(rootToRebase), rootToRebase);
        }
    }

    // 5. filtered input 的 root base（例如 CustomerBase）保持自身身份与可查询性：
    //    rebase 为物理 base 上的 filtered item，成员条件就是自己的类型判别（IS-A：包含所有子 input 的记录）。
    for (const [rootName] of rootsToRebase) {
        const rootCondition = MatchExp.atom({ key: MERGED_TYPE_ATTR, value: ['=', rootName] });
        inputWritablePropertyNames.set(rootName, collectWritablePropertyNames(rootName, refContainer, isEntityType));
        rebaseAsFilteredItem(rootName, registeredBaseItem, rootCondition, refContainer, isEntityType);
    }
}

/**
 * 收集 name（pre-rebase）的可写属性名：沿 base 链向上取全部声明属性的并集。
 * - plain input：自身属性（含 commonProperties 的同名再声明、bound-state 注入列）。
 * - filtered input：自身（通常为空）∪ root base 的属性。
 * - 嵌套 merged input：其 transform 后的属性全集（自身或虚拟 base 上的 mergedProperties）。
 */
function collectWritablePropertyNames(name: string, refContainer: RefContainer, isEntityType: boolean): string[] {
    let current: MergedItem | undefined = isEntityType ? refContainer.getEntityByName(name) : refContainer.getRelationByName(name);
    const names = new Set<string>();
    while (current) {
        for (const property of current.properties || []) {
            names.add(property.name);
        }
        current = getBaseItem(current);
    }
    return [...names];
}

/**
 * 把名为 name 的 item（若已注册）替换为 baseItem 上的 filtered item，成员条件为 matchExpression。
 */
function rebaseAsFilteredItem(
    name: string,
    baseItem: MergedItem,
    matchExpression: MatchExpressionData,
    refContainer: RefContainer,
    isEntityType: boolean,
): void {
    if (isEntityType) {
        const existing = refContainer.getEntityByName(name);
        if (!existing) return;
        const filtered = Entity.clone(existing, true);
        filtered.name = name;
        filtered.baseEntity = baseItem as EntityInstance;
        filtered.matchExpression = matchExpression;
        filtered.inputEntities = undefined;
        refContainer.replace(filtered, existing);
    } else {
        const existing = refContainer.getRelationByName(name);
        if (!existing) return;
        const baseRelation = baseItem as RelationInstance;
        const filtered = Relation.create({
            name,
            baseRelation,
            sourceProperty: existing.sourceProperty,
            targetProperty: existing.targetProperty,
            matchExpression,
        });
        refContainer.replace(filtered, existing);
    }
}

/**
 * 创建判别列 property。
 * defaultValue 只捕获 name -> 具体类型名 的纯字符串映射（可序列化、可调试），
 * 不再捕获实体实例或 leafToInputMap 闭包。
 */
function createTypeProperty(typeValueByName: Map<string, string>): PropertyInstance {
    // CAUTION 复制成普通对象，避免闭包持有整个 Map（也便于调试时直接查看）。
    const valueByName = Object.fromEntries(typeValueByName);
    return Property.create({
        name: MERGED_TYPE_ATTR,
        type: 'string',
        defaultValue: (_record: any, creatingName: string) => valueByName[creatingName],
    });
}

/**
 * 合并所有 input items 的 properties。
 * 同名 property 取合并版本，defaultValue 按"创建时使用的名字"分发到对应 input 的原始 defaultValue。
 */
function mergeProperties(
    mergedItem: MergedItem,
    itemTree: Map<string, string[]>,
    refContainer: RefContainer
): PropertyInstance[] {
    // 收到的 itemName 有三种：
    // 1. 就是当前的 input item 的 name。
    // 2. 如果当前 input item 被 filtered 了，那么可能是 filtered item 的 name。
    // 3. 如果当前 input item 是 merged item，那么一定是子 input item 的 name。
    const inputItems = getInputItems(mergedItem) || [];
    const mergedProperties: PropertyInstance[] = [];
    const itemPropertyMap = new Map<string, { [key: string]: PropertyInstance }>();
    const mergedPropertyMap: { [k: string]: PropertyInstance } = Object.fromEntries(mergedItem.commonProperties?.map(prop => [prop.name, prop]) || []);
    // CAUTION 同名 property 在 union 合并下共享同一物理列。类型（或 collection 形态）冲突时
    //  绝不能静默 last-wins：后处理的 input 会改写先处理 input 的列类型（先者的 number 列
    //  变 TEXT，数据以错误类型读回——零告警的 schema 损坏）。commonProperties 已按
    //  name+type 校验自身与各 input 的一致性；这里把同一约束推广到**全部**同名合并点。
    const mergeCompatiblePropertyMap = (target: { [k: string]: PropertyInstance }, source: { [k: string]: PropertyInstance }, sourceItemName: string) => {
        for (const [propName, prop] of Object.entries(source)) {
            const existing = target[propName];
            if (existing && (existing.type !== prop.type || !!existing.collection !== !!prop.collection)) {
                throw new Error(
                    `Merged ${isEntity(mergedItem) ? 'entity' : 'relation'} "${getItemName(mergedItem)}": property "${propName}" of input "${sourceItemName}" ` +
                    `(type: ${prop.type}${prop.collection ? ', collection' : ''}) conflicts with the already-merged declaration ` +
                    `(type: ${existing.type}${existing.collection ? ', collection' : ''}). Same-name properties across merged inputs share one physical column ` +
                    `and must declare the identical type (and collection shape) — rename one of them or align the types.`
                );
            }
            target[propName] = prop;
        }
    };

    // 收集所有同名 properties。
    // 如果这个 item 已经是 filtered item，那么就从 base item 获取 properties。
    for (const inputItem of inputItems) {
        let sourceItem: MergedItem = inputItem;
        while (getBaseItem(sourceItem) && sourceItem.properties.length === 0) {
            sourceItem = getBaseItem(sourceItem)!;
        }

        const propertyMap = Object.fromEntries(
            sourceItem.properties
                .filter(prop => prop.name !== MERGED_TYPE_ATTR)
                .map(prop => [prop.name, prop])
        );
        itemPropertyMap.set(getItemName(inputItem), propertyMap);

        // 合并 property map（同名冲突 fail-fast，见上方 CAUTION）
        mergeCompatiblePropertyMap(mergedPropertyMap, propertyMap, getItemName(inputItem));

        const isInputItemMergedItem = !!getInputItems(inputItem);
        // 递归处理所有子孙节点
        const childItemNames = [...(itemTree.get(getItemName(inputItem)) || [])];
        while (childItemNames.length) {
            const childItemName = childItemNames.shift()!;
            if (!isInputItemMergedItem) {
                // 如果不是 merged item，就只有 filtered item 了，所有 filtered item 的 property map 都是继承自 source item 的。
                itemPropertyMap.set(childItemName, propertyMap);
            } else {
                // merged item 的 sub 是自己的。
                const childItem = refContainer.getEntityByName(childItemName) || refContainer.getRelationByName(childItemName);
                const isChildInputItemMergedItem = childItem && !!getInputItems(childItem);
                if (childItem && !isChildInputItemMergedItem) {
                    const childItemPropertyMap = Object.fromEntries(
                        childItem.properties
                            .filter(prop => prop.name !== MERGED_TYPE_ATTR)
                            .map(prop => [prop.name, prop])
                    );
                    itemPropertyMap.set(childItemName, childItemPropertyMap);
                    // 继续合并（同名冲突 fail-fast，见上方 CAUTION）
                    mergeCompatiblePropertyMap(mergedPropertyMap, childItemPropertyMap, childItemName);
                }
            }
            childItemNames.push(...(itemTree.get(childItemName) || []));
        }
    }

    // 为每个 property 创建合并版本
    for (const propName of Object.keys(mergedPropertyMap)) {
        const mergedProp = Property.clone(mergedPropertyMap[propName], true);

        // 创建新的 defaultValue：按创建时使用的名字分发
        mergedProp.defaultValue = (record: any, itemName: string) => {
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
 * 转换 merged item（entity 或 relation）本体。
 * - 有 filtered input：生成虚拟物理 base（持有 properties），merged item 成为其 filtered 视图。
 * - 全部是普通 input：merged item 自身就是物理 base（不生成虚拟 base）。
 */
function transformMergedItem<T extends MergedItem>(
    mergedItem: T,
    mergedProperties: PropertyInstance[],
    memberCondition: MatchExpressionData | undefined,
): [T, T] {
    if (isEntity(mergedItem)) {
        const transformedEntity = Entity.create({ name: mergedItem.name });

        if (memberCondition) {
            const virtualBaseEntity = Entity.create({
                name: `${mergedItem.name}_base`,
                properties: mergedProperties,
            });
            transformedEntity.baseEntity = virtualBaseEntity;
            transformedEntity.matchExpression = memberCondition;
            return [transformedEntity as T, virtualBaseEntity as T];
        }

        transformedEntity.properties = mergedProperties;
        return [transformedEntity as T, transformedEntity as T];
    } else {
        const relation = mergedItem as RelationInstance;
        const relationName = getItemName(relation);
        const transformedRelation = Relation.create({
            name: relation.name,
            source: relation.source,
            sourceProperty: relation.sourceProperty,
            target: relation.target,
            targetProperty: relation.targetProperty,
            type: relation.type,
            isTargetReliance: relation.isTargetReliance
        });

        if (memberCondition) {
            const virtualBaseRelation = Relation.create({
                name: `__${relationName}_base`,
                source: relation.source,
                sourceProperty: `__${relation.sourceProperty}_base`,
                target: relation.target,
                targetProperty: `__${relation.targetProperty}_base`,
                type: relation.type,
                isTargetReliance: relation.isTargetReliance,
                properties: mergedProperties
            });

            transformedRelation.baseRelation = virtualBaseRelation;
            transformedRelation.matchExpression = memberCondition;
            return [transformedRelation as T, virtualBaseRelation as T];
        }

        transformedRelation.properties = mergedProperties;
        return [transformedRelation as T, transformedRelation as T];
    }
}
