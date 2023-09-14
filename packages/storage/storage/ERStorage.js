/**
 * 表生成
 * 两个内容分开：
 * 1. 表结构
 * 2. 性能需求（索引、冗余字段等）
 *
 * 表结构生成：
 * 1. 简单 field 正常生成 column
 *   1.1 处理 column 的"集合"状态，创建新表？TODO
 * 2. rel field
 *   2.1 如果是 1:1 生成一个 relId column，如果支持多种 type，那么再加一个 relType。
 *   2.2 其他情况通通生成 "中间表"
 * 3. computed field TODO
 *
 *    COUNT 之类的函数怎么支持？可能会用在 computed field 里面，也可能用在 where 俩面 TODO
 *
 *
 * 对表结构产生影响的问题：
 * 需求：
 * 1. 需要混合排序的实体，比如A/B，都可以称为 C。有需求是按照 C 这个名字混在一起排序。
 *   正常情况是需要对要排序的字段再高一张表混在一起记录。
 * 性能：
 * 1. 对于 "非n:n" 关系，可以把关系和实体表合并，减少"表联结"操作。
 * 2. 非重要字段可以"拆表"。
 *
 * 索引生成： TODO
 */

/**
 * 支持的 field 设置：
 * 1. unique: scopeNAme   "global"/"entity"/"xxxx" TODO
 * 2. lazy: customGroupName TODO
 * 3. isCollection
 *
 * 这三者都会 mock 成 relation
 * unique: n:1
 * lazy: 1:1
 * isCollection & unique: n:n
 * isCollection: 1:n
 */

/**
 * compositeTypes 可以设置：
 * prepare: 通常是用来把简单字段变得结构化的
 * hooks: {
 *   create,
 *   update,
 *   remove
 * }
 * 用来做复杂的处理
 */

import {
  mapValues,
  now,
  filter,
  get,
  set,
  transform,
  reverseCapital,
  isObject,
  invariant
} from '../../util.js'
import {
  walkFields,
  makeFieldEntityName,
  makeFieldColumnName,
  convertQueryArguments,
  makeEntityAliasNameFromPath,
  walkObjectAsync,
  walkObject,
  getAllSelfLeafField,
  makeRelationEntityName,
  getChildMapByPath,
  reduceDuplicateJoinTables,
  getFieldsMapsByPath,
  applyWhere,
  normalizeWhere,
  isCompositeFieldRawValue
} from './util.js'

/**
 * 生成器的基本结构：
 * 1. 表创建。
 * 2. field 的处理规则
 *   2.1 TODO 还需要处理"迁移"数据。
 */

export const ID_COLUMN_NAME = 'id'
export const OWNER_COLUMN_NAME = 'owner'
export const ENTITY_COLUMN_NAME = 'entity'
export const FIELD_VALUE_COLUMN_NAME = 'value'
export const CREATED_AT_COLUMN_NAME = 'createdAt'
export const MODIFIED_AT_COLUMN_NAME = 'modifiedAt'
export const REL_FIELD_NAME = 'rel'
export const FIELD_RELATION_NAME = 'has'
export const RELY_RELATION_NAME = 'relyOn'

// TODO 还要处理集合状态的 数字、字符等。
const SIMPLE_FIELD_TO_COLUMN = {
  string (field) {
    return {
      name: field.name,
      type: (field.size && field.size < 255) ? 'string' : 'text',
      size: field.size,
      field
    }
  },
  number (field) {
    return {
      name: field.name,
      type: field.size > 10 ? 'bigInteger' : 'integer',
      field
    }
  },
  boolean (field) {
    return {
      name: field.name,
      type: 'boolean',
      field
    }
  },
  id (field) {
    return {
      name: field.name,
      type: 'id',
      auto: field.auto,
      field
    }
  }
}

function createFieldEntityAndRelation (field, type, path, sourceEntity, compositeFieldTypes, siblingFields) {
  const fieldEntityName = makeFieldEntityName(sourceEntity.name, path)
  // 如果是 inline composite，那就用自己的字段。
  // 如果是 compositeTypes，那就用 composite 的 fields。
  // 如果都不是，说明这是个简单字段，直接用 FIELD_VALUE_COLUMN_NAME: value
  let valueFields
  // 要标记一下，这样 parse where 的时候，可以用 xxx="yyy" 简单来匹配
  let simpleValueField = false
  if (Array.isArray(field.type)) {
    valueFields = field.type
  } else if (compositeFieldTypes[field.type]) {
    valueFields = compositeFieldTypes[field.type].fields
  } else {
    valueFields = [{ name: FIELD_VALUE_COLUMN_NAME, type: field.type }]
    simpleValueField = true
  }

  const fields = valueFields.concat({
    name: ENTITY_COLUMN_NAME,
    type: 'rel'
  }, {
    name: ID_COLUMN_NAME,
    type: 'id',
    auto: true
  })

  const entity = {
    internal: true,
    type: field.type,
    name: fieldEntityName,
    simpleValueField,
    fields
  }

  const relation = {
    name: FIELD_RELATION_NAME,
    type,
    source: {
      entity: sourceEntity.name,
      field: path
    },
    target: {
      entity: fieldEntityName,
      field: [ENTITY_COLUMN_NAME]
    }
  }

  const relations = []
  // TODO 处理 dependencies，其实也是存了一个 id？？搞个 增加 relation 就好了？
  if (field.dependencies?.length) {
    field.dependencies.forEach(dependency => {
      entity.fields.push({
        name: dependency,
        type: 'rel'
      })

      const dependField = siblingFields.find(f => f.name === dependency)
      const dependEntityName = makeFieldEntityName(sourceEntity.name, path.slice(0, path.length - 1).concat(dependField.name))
      relations.push({
        name: RELY_RELATION_NAME,
        type: 'n:1',
        source: {
          entity: entity.name,
          field: [dependency]
        },
        target: {
          entity: dependEntityName,
          // CAUTION 在 dependency 中没有指向的 column 反过来
          field: []
        }
      })
    })
  }

  return [entity, relation, relations]
}

function createRelationEntity (relation) {
  const relationEntityName = makeRelationEntityName(relation)
  return {
    internal: true,
    isRelation: true,
    relation,
    name: relationEntityName,
    fields: [{
      name: 'source',
      type: 'id'
    }, {
      name: 'target',
      type: 'id'
    },
    ...(relation.fields || [])
    ]
  }
}

/**
 *
 * @param {ER.RawEntity} entity
 * @param {import('../../util.js').FilesContent} compositeFieldTypes
 * @returns
 */
function createMapFromEntity (entity, compositeFieldTypes) {
  const map = {}

  const entityMap = {
    ...entity,
    fieldsMap: {
      deleted: {
        name: 'deleted',
        type: 'boolean'
      }
    }
  }

  delete entityMap.fields

  map[entity.name] = entityMap

  walkFields(entity, compositeFieldTypes, entityMap, (field, nextFields, parents, parentMap, siblingFields) => {
    parentMap.fieldsMap[field.name] = {
      ...field,
      fieldsMap: nextFields ? {} : null
    }
    // inline 的 compositeField, 继续递归
    if (!field.isCollection && !field.unique && !field.lazy) {
      return parentMap.fieldsMap[field.name]
    }

    const namePath = parents.map(p => p.name).concat(field.name)
    const relationType = field.isCollection
      ? (field.unique ? 'n:n' : '1:n')
      : (field.unique ? 'n:1' : '1:1')

    // 创建一个新的 entity
    const [collectionEntity, collectionRelation, dependencyRelations] = createFieldEntityAndRelation(field, relationType, namePath, entity, compositeFieldTypes, siblingFields)
    // 会递归
    const relationEntity = createRelationEntity(collectionRelation)
    const dependencyRelationEntities = dependencyRelations.map(createRelationEntity)
    Object.assign(map,
      createMapFromEntity(collectionEntity, compositeFieldTypes),
      createMapFromEntity(relationEntity, compositeFieldTypes),
      ...dependencyRelationEntities.map(dependencyRelationEntity => createMapFromEntity(dependencyRelationEntity, compositeFieldTypes))
    )

    // 阻止递归
    return false
  })

  return map
}

// 给有 relation 的 entity field 加上 targetLink，这样方便之后查找
function patchRelationLink (allMaps) {
  Object.values(allMaps).forEach(map => {
    if (!map.isRelation) return

    const { source, target } = map.relation
    if (source.field.length) {
      const fieldMapValue = getChildMapByPath(allMaps[source.entity], source.field)
      fieldMapValue.targetLink = {
        ...target,
        relation: map.name
      }
    }

    if (target.field.length) {
      const fieldMapValue = getChildMapByPath(allMaps[target.entity], target.field)
      fieldMapValue.sourceLink = {
        ...source,
        relation: map.name
      }
    }
  })
}

function createMergeTarget (allMaps) {
  Object.values(allMaps).forEach(map => {
    if (!map.isRelation) return
    const { source, target, type } = map.relation
    if (type === 'n:n') return

    // 来判断往那边，只有 n:1 往 source merge, 其他都往 target merge。
    const mergeSide = type === 'n:1' ? source : target
    map.mergeTarget = {
      entity: mergeSide.entity,
      isSource: mergeSide === source,
      field: mergeSide.field
    }
  })
}

function createTableFromMap (map) {
  const tableName = map.name
  const columns = []
  walkObject(map.fieldsMap, null, (fieldMapValue, fieldName, context, parents) => {
    // 有 link 说明不是存在自己这里了
    if (fieldMapValue.type === 'rel' || fieldMapValue.sourceLink || fieldMapValue.targetLink) return
    // 还有子 field，说明是 composite field，继续递归
    if (fieldMapValue.fieldsMap) return { next: fieldMapValue.fieldsMap }
    // 剩下都是叶子节点了
    const column = SIMPLE_FIELD_TO_COLUMN[fieldMapValue.type](fieldMapValue)
    column.name = makeFieldColumnName(parents.concat(fieldName))

    columns.push(column)

    fieldMapValue.storage = {
      table: tableName,
      column: column.name
    }
  })

  map.storage = {
    table: tableName
  }

  return {
    name: tableName,
    columns
  }
}

function createTablesFromMap (allMaps) {
  const entityMaps = []
  const relationMaps = []
  const entityTables = {}
  const relationTables = {}
  // TODO 这里有个问题， relation map 其实也是当做 entity 处理的，会不会有深度依赖的问题。
  //  虽然暂时没有 relation 没有 field，所以其实没有深度递归，但未来可能有
  Object.values(allMaps).forEach(map => {
    if (map.isRelation) {
      relationMaps.push(map)
    } else {
      entityMaps.push(map)
    }
  })

  entityMaps.forEach(map => {
    const table = createTableFromMap(map)
    entityTables[table.name] = table
  })

  relationMaps.forEach(map => {
    if (!map.mergeTarget) {
      // 和 entity 一样
      const table = createTableFromMap(map)
      relationTables[table.name] = table
    } else {
      // 有 mergeTarget
      const mergeTargetMap = allMaps[map.mergeTarget.entity]
      const mergeTargetTable = entityTables[mergeTargetMap.storage.table]
      // CAUTION 可能会出共用 column 的情况！！！例如 comment.target 既可以指向 Post 也可以指向 Comment!
      //  如果这两个关系 fields 不同，那么就不能合表！！！
      // 1. 先把 related field 变成真实的 column,
      const column = {
        name: makeFieldColumnName(map.mergeTarget.field),
        type: 'id'
      }

      mergeTargetTable.columns.push(column)
      const fieldMapValue = getChildMapByPath(mergeTargetMap, map.mergeTarget.field)
      fieldMapValue.storage = {
        table: mergeTargetMap.storage.table,
        column: column.name
      }

      // 2. TODO 增加 relation 上的 field column
    }
  })

  return [...Object.values(entityTables), ...Object.values(relationTables)]
}

/**
 * 1. 将所有 lazy/unique/collection 转换成 entity/relation
 * 2. x:1 relation 生成 mergeTarget
 * 3. 生成表
 * 4. 生成 api
 *
 * @export
 * @param {{ entities: ER.RawEntity[], relations: ER.ReplaceIdWithNameRelation[]}} { entities = [], relations = [] }
 * @param {import('../../util.js').FilesContent} [compositeFieldTypes={}]
 * @return {*}
 */
export function createERTables ({ entities = [], relations = [] }, compositeFieldTypes = {}) {
  const allMaps = {}

  entities.forEach(rawEntity => {
    const map = createMapFromEntity(rawEntity, compositeFieldTypes)
    Object.assign(allMaps, map)
  })

  Object.assign(allMaps, ...relations.map(relation => createMapFromEntity(createRelationEntity(relation), compositeFieldTypes)))

  patchRelationLink(allMaps)
  createMergeTarget(allMaps)

  return {
    tables: createTablesFromMap(allMaps),
    map: allMaps
  }
}

const DEFAULT_LIMIT = 20
const DEFAULT_COLLECTION_LIMIT = 100

function makeColumnNameFromEntityStop (entityFullFieldPath, fieldPath) {
  return `${makeEntityAliasNameFromPath(entityFullFieldPath)}.${makeFieldColumnName(fieldPath)}`
}

function createTablesToJoinFromEntityMaps (entityMapsToJoin, allMaps) {
  const tablesToJoin = []
  entityMapsToJoin.forEach(({ from, to }) => {
    // 算一下 join 规则
    const relationMap = allMaps[to.relation]
    const lastRelationField = to.fullFieldPath[to.fullFieldPath.length - 1]
    // CAUTION 这里的规则比较负载，要考虑自己和自己产生利息的情况，这时候 entity 都相同
    const isFromSource = (relationMap.relation.source.entity === from.map.name) &&
      (relationMap.relation.source.field[relationMap.relation.source.field.length - 1] === lastRelationField)

    const fromField = relationMap.relation[isFromSource ? 'source' : 'target'].field
    const toField = relationMap.relation[isFromSource ? 'target' : 'source'].field

    /**
     * n:n 需要 join 两张表
     * 剩下的需要 join 一张表
     */
    if (relationMap.relation.type !== 'n:n') {
      // CAUTION 1:n 永远向 n merge。1:1 永远向 target merge
      const typeArr = relationMap.relation.type.split(':')
      if (!isFromSource) typeArr.reverse()
      const [fromType, toType] = typeArr
      // 如果自己是 n 或者自己虽然是 1:1 ，但自己是 target
      const isMergedToFrom = fromType === 'n' || !isFromSource

      const on = [
        [
          makeEntityAliasNameFromPath(from.fullFieldPath.length ? from.fullFieldPath : [from.map.name]),
          makeFieldColumnName(isMergedToFrom ? fromField : [ID_COLUMN_NAME])
        ],
        [
          makeEntityAliasNameFromPath(to.fullFieldPath),
          makeFieldColumnName(isMergedToFrom ? [ID_COLUMN_NAME] : toField)
        ]
      ]
      tablesToJoin.push({
        table: to.map.storage.table,
        alias: makeEntityAliasNameFromPath(to.fullFieldPath),
        on
      })
    } else {
      // n:n
      const fromRelationOn = [
        [
          makeEntityAliasNameFromPath(from.fullFieldPath.length ? from.fullFieldPath : [from.map.name]),
          ID_COLUMN_NAME
        ],
        [
          relationMap.storage.table,
          isFromSource ? 'source' : 'target'
        ]
      ]
      tablesToJoin.push({
        table: relationMap.storage.table,
        alias: relationMap.storage.table,
        on: fromRelationOn,
        inner: true
      })

      const toRelationOn = [
        [
          relationMap.storage.table,
          isFromSource ? 'target' : 'source'
        ],
        [
          makeEntityAliasNameFromPath(to.fullFieldPath),
          ID_COLUMN_NAME
        ]
      ]
      tablesToJoin.push({
        table: to.map.storage.table,
        alias: makeEntityAliasNameFromPath(to.fullFieldPath),
        on: toRelationOn,
        inner: true
      })
    }
  })
  return tablesToJoin
}

function collectEntityMapsToJoin (fieldName, parents, entityMapsToJoin, allMaps, context) {
  /*
   * 有以下情况：
   * 1. fieldMapValue: true。需要下面所有的字段，或者自己就已经是一个叶子节点了。
   * 2. fieldMapValue: Object。下面还有筛选。
   */
  const lastMap = context.parentMaps[context.parentMaps.length - 1]
  const currentMap = lastMap.fieldsMap[fieldName]
  const link = currentMap.targetLink || currentMap.sourceLink
  // 这是个中间节点，需要处理 tablesToJoin
  if (link || currentMap.fieldsMap) {
    let nextEntityStop
    let nextEntityMap
    let fieldPathFromLastEntity = context.fieldPathFromLastEntity.concat(fieldName)
    if (link) {
      // 1. 要跳转了，更新 nextEntityStop
      nextEntityMap = allMaps[link.entity]
      nextEntityStop = {
        map: nextEntityMap,
        relation: link.relation,
        fullFieldPath: parents.concat(fieldName)
      }
      // 2. 更新 fieldPathFromLastEntity
      fieldPathFromLastEntity = []

      // 3. 外部记录一下，最后用来做 tablesToJoin
      entityMapsToJoin.push({
        from: context.lastEntityStop,
        to: nextEntityStop
      })
    }

    return {
      // 如果是个跳转了到了 entity的节点, parentMap 要同样记录一下，这样后面的节点才能正确从 parentMaps 的最后一个读到自己。
      parentMaps: context.parentMaps.concat(nextEntityMap ? [currentMap, nextEntityMap] : currentMap),
      lastEntityStop: nextEntityStop || context.lastEntityStop,
      fieldPathFromLastEntity
    }
  }
  // 叶子节点，不是 link，不是复合字段。
}

async function parseSingleWhereItem (w, where, entityMapsToJoin, startContext, apiContext) {
  const { allMaps, compositeFieldTypes, createUtils } = apiContext
  const [rawFieldName, matchType, valueToMatch] = w
  const fieldPath = rawFieldName.split('.')
  let context = startContext

  const lastMap = context.parentMaps[context.parentMaps.length - 1]
  const parentLink = lastMap.targetLink || lastMap.sourceLink
  const parentMap = parentLink ? allMaps[parentLink.entity] : lastMap

  for (let i = 0; i < fieldPath.length; i++) {
    const parents = fieldPath.slice(0, i)
    const fieldName = fieldPath[i]
    const isLast = (i === fieldPath.length - 1)

    const currentMap = parentMap.fieldsMap[fieldName]
    invariant(currentMap, `Cannot find map for field: ${fieldName}. Field path: ${fieldPath.join('.')}. Where phrase: [${w.join(', ')}].`)

    const link = currentMap.targetLink || currentMap.sourceLink
    const realCurrentMap = link ? allMaps[link.entity] : currentMap
    // 这是个中间节点(包括 link 和 composite 的，都是要继续递归的)，可能需要处理 tablesToJoin
    let realValueToMatch
    if (isLast) {
      if (compositeFieldTypes[currentMap.type]?.prepare) {
        const subMaps = { ...realCurrentMap.fieldsMap, ...allMaps }
        realValueToMatch = await compositeFieldTypes[currentMap.type].prepare(createUtils(subMaps), valueToMatch)
      } else if (realCurrentMap.simpleValueField) {
        realValueToMatch = { [FIELD_VALUE_COLUMN_NAME]: valueToMatch }
      } else if (link && !isObject(valueToMatch)) {
        // 直接出入了 id 进行 match 的 情况
        realValueToMatch = { [ID_COLUMN_NAME]: valueToMatch }
      } else {
        realValueToMatch = valueToMatch
      }
    }
    // 1. 如果是中间节点
    if (!isLast) continue
    // 2. 虽然是最后一个但是还有子节点。或者是个 link，那么就要递归处理
    if (currentMap.fieldsMap || link) {
      // 1. 这里面收集了 entityMapsToJoin
      // 修改一下 context, 让递归继续。
      context = collectEntityMapsToJoin(fieldName, parents, entityMapsToJoin, allMaps, context)
      if (!isObject(realValueToMatch)) {
        throw new Error('match a complex field with a simple value')
      }

      for (const valueKey in realValueToMatch) {
        // CAUTION parse 出来可能有 undefined 的值，在这里统一丢掉，我们只能接受 null 的空值匹配。
        if (realValueToMatch[valueKey] === undefined) continue
        await parseSingleWhereItem(
          [valueKey, matchType, realValueToMatch[valueKey]],
          where,
          entityMapsToJoin,
          context,
          apiContext
        )
      }
      continue // 跳出循环
    }

    // TODO 注意这里可能是 link，我们这里因为前面处理了，并且刚好 merge 到了这个字段，所以没有出问题！！！，应该要重写！！！
    // 不是中间节点 并且不是 composite field，可以往 where 里面收集了。那就是真正的叶子节点了
    const entityPath = context.lastEntityStop.fullFieldPath.length ? context.lastEntityStop.fullFieldPath : [context.lastEntityStop.map.name]
    const fieldPathFromLastEntity = context.fieldPathFromLastEntity.concat(fieldName)
    // TODO entityPath 得到的是取的别名，这没问题。但是 path.site === xxx 要转换成 yyy.value 这里的 fieldName 是 site，但是从
    //  yyy 中去取的时候就叫做 value 了。
    where.push([makeColumnNameFromEntityStop(entityPath, fieldPathFromLastEntity), matchType, realValueToMatch])
  }
}

function parseSelectFields (entityName, rawFields, allMaps) {
  const entityMap = allMaps[entityName]
  if (!rawFields) {
    const fieldsValueAndParents = getAllSelfLeafField(entityMap)
    const columns = fieldsValueAndParents.map(({ value, parents: parentNames }) => {
      return makeColumnNameFromEntityStop([entityName], parentNames.concat(value.name))
    })

    return [columns, []]
  }

  // 如果有用户指定的 rawFields，就要开始考虑要 join 的 table 了
  const columns = []
  const entityMapsToJoin = []
  const relatedCollections = []

  // 这里是当创建 util 的时候有可能一进来的 entity 就是 link 到别的地方的。
  const entityLink = entityMap.targetLink || entityMap.sourceLink
  const startMap = entityLink ? allMaps[entityLink.entity] : entityMap

  const startContext = {
    parentMaps: [startMap],
    lastEntityStop: {
      map: startMap,
      fullFieldPath: []
    },
    fieldPathFromLastEntity: []
  }

  walkObject(rawFields, startContext, (value, fieldName, context, parents) => {
    /**
     * 有以下情况：
     * 1. fieldMapValue: true。需要下面所有的字段，或者自己就已经是一个叶子节点了。
     * 2. fieldMapValue: Object。下面还有筛选。
     */
    const lastMap = context.parentMaps[context.parentMaps.length - 1]
    const currentMap = lastMap.fieldsMap[fieldName]
    const link = currentMap.targetLink || currentMap.sourceLink

    if (link) {
      const relationMap = allMaps[link.relation]
      const isSelfSource = link === currentMap.targetLink
      const isOppositeOne = relationMap.relation.type.split(':')[isSelfSource ? 1 : 0] === '1'
      // 如果要取的关联字段和自己的关系不是 x:1, 说明取到了一个 collection，立刻停掉，让外面处理
      if (!isOppositeOne) {
        relatedCollections.push(relationMap)
        return
      }
    }

    // 这是个中间节点(包括 link 和 composite 的，都是要继续递归的)，可能需要处理 tablesToJoin
    if (value !== true || link || currentMap.fieldsMap) {
      // 1. 这里面收集了 entityMapsToJoin
      const nextContext = collectEntityMapsToJoin(fieldName, parents, entityMapsToJoin, allMaps, context)

      // 2. 更新 nextValue。value === true，但又是个外部关联的字段或者复合字段，说明要获取下面的所有自己字段。
      let nextValue = value
      if (value === true) {
        const mapToFindNextValue = link ? allMaps[link.entity] : currentMap
        const nonLinkFieldsMaps = filter(mapToFindNextValue.fieldsMap, (fieldMapValue) => !(fieldMapValue.targetLink || fieldMapValue.sourceLink))
        nextValue = mapValues(nonLinkFieldsMaps, () => true)
      }

      return { next: nextValue, context: nextContext }
    }

    // 纯粹叶子节点，不是 link，不是复合字段。
    const entityPath = context.lastEntityStop.fullFieldPath.length ? context.lastEntityStop.fullFieldPath : [context.lastEntityStop.map.name]
    const fieldPathFromLastEntity = context.fieldPathFromLastEntity.concat(fieldName)
    columns.push(makeColumnNameFromEntityStop(entityPath, fieldPathFromLastEntity))
  })

  return [columns, createTablesToJoinFromEntityMaps(entityMapsToJoin, allMaps), relatedCollections]
}

/**
 * 支持的 where 结构：
 * [
 *  ['id', '=', '111'],
 *  {
 *    method: 'orWhere',
 *    children: [
 *      ...
 *    ]
 *  }
 * ]
 * 在 parseWhere 中要做两件事:
 * 1. prepare composite 字段
 * 2. 找到要 join 的表
 */
async function parseWhere (entityName, rawWhere, context) {
  const { allMaps } = context
  const entityMap = allMaps[entityName]
  const inputWhere = normalizeWhere(rawWhere)
  const where = []
  const entityMapsToJoin = []
  const tablesToJoin = []

  for (const w of inputWhere) {
    if (!Array.isArray(w)) {
      const [subWhere, subTablesToJoin] = await parseWhere(entityName, w.children, context)
      where.push({
        method: w.method,
        children: subWhere
      })
      tablesToJoin.push(...subTablesToJoin)
      continue
    }

    const entityLink = entityMap.targetLink || entityMap.sourceLink
    const startMap = entityLink ? allMaps[entityLink.entity] : entityMap

    const startContext = {
      parentMaps: [startMap],
      lastEntityStop: {
        map: startMap,
        fullFieldPath: []
      },
      fieldPathFromLastEntity: []
    }
    await parseSingleWhereItem(w, where, entityMapsToJoin, startContext, context)
  }

  tablesToJoin.push(...createTablesToJoinFromEntityMaps(entityMapsToJoin, allMaps))
  return [where, tablesToJoin]
}

async function walkValueCollection (collection, callback) {
  const ids = {}
  // 先排序啊，注意这是不稳定的排序。
  const sortedCollection = []
  const collectionKeysToSort = Object.keys(collection)

  function handleDependencies (item, key) {
    if (item.dependencies) {
      // 还有依赖
      item.dependencies.forEach(dependency => {
        const index = collectionKeysToSort.indexOf(dependency)
        // 处理过了，不管了
        if (index === -1) return
        // 还没处理，需要放到前面去
        collectionKeysToSort.splice(index, 1)
        handleDependencies(collection[dependency], dependency)
      })
    }
    sortedCollection.push({ key, item })
  }

  while (collectionKeysToSort.length) {
    const key = collectionKeysToSort.shift()
    const item = collection[key]
    handleDependencies(item, key)
  }

  for (let index = 0; index < sortedCollection.length; index++) {
    const { key: columnName, item } = sortedCollection[index]
    const { value } = item
    if (Array.isArray(value)) {
      ids[columnName] = []
      for (const singleValueItemIndex in value) {
        const singleValueItem = value[singleValueItemIndex]
        if (singleValueItem === undefined) continue

        const valueToCallback = (typeof singleValueItem === 'object') ? singleValueItem : { [FIELD_VALUE_COLUMN_NAME]: singleValueItem }
        if (item.dependencies) {
          item.dependencies.forEach(depPath => {
            // 注意这里 columnName 是 path 字符串形式
            const insertedDep = ids[depPath.join('.')]
            set(valueToCallback, depPath, { id: insertedDep.id })
          })
        }

        ids[columnName].push(await callback(item, valueToCallback, singleValueItemIndex))
      }
    } else {
      if (value === undefined) continue

      const valueToCallback = (typeof value === 'object') ? value : { [FIELD_VALUE_COLUMN_NAME]: value }
      if (item.dependencies) {
        item.dependencies.forEach(depPath => {
          // 注意这里 columnName 是 path 字符串形式
          const insertedDep = ids[depPath.join('.')]
          set(valueToCallback, depPath, { id: insertedDep.id })
        })
      }

      ids[columnName] = await callback(item, valueToCallback)
    }
  }
  return ids
}

async function getOrCreateUniqueValue (entityName, inputValue, context, database, contextParentFields) {
  const [record] = await context.methods.find(entityName, inputValue, undefined, { id: true })
  if (!record) {
    const newRecord = await recursiveCreate(entityName, inputValue, context, database, contextParentFields)
    return { isNew: true, id: newRecord.id }
  }
  return { isNew: false, id: record.id }
}

async function separateValuesToInsertOrUpdate (inputValue, hookName, entityMap, context) {
  const { allMaps, compositeFieldTypes, createUtils } = context
  const startContext = {
    map: entityMap
  }
  // 当前实体自己的值
  const selfFieldValues = {}
  // 1:1 或者 n:1 的关系，自己要存对方的 id
  const needIdValues = {}
  // 1:n 关系，对方实体要存我的 id 值
  const needMyIdValues = {}
  // n:n 关系，双方 id 存到
  const noMergeValues = {}
  const fieldHooks = {}

  await walkObjectAsync(inputValue, startContext, async (rawValue, fieldName, walkContext, parents) => {
    const currentMap = walkContext.map.fieldsMap[fieldName]
    console.log(fieldName)
    const link = currentMap.targetLink || currentMap.sourceLink
    const currentFieldPath = parents.concat(fieldName)
    const currentFieldPathStr = currentFieldPath.join('.')

    // 在这里 prepare ？
    const compositeFieldType = compositeFieldTypes[currentMap.type]
    let value = rawValue
    if (compositeFieldType) {
      // TODO prepare 没考虑数组的情况
      if (compositeFieldType.prepare) {
        const subMapRoot = link ? allMaps[link.entity] : currentMap
        const subAllMaps = { ...subMapRoot.fieldsMap, ...allMaps }
        value = await compositeFieldType.prepare(createUtils(subAllMaps), rawValue)
      }

      // 这里只是记录一下。
      if (compositeFieldType.hooks && compositeFieldType.hooks[hookName]) {
        fieldHooks[currentFieldPathStr] = compositeFieldType.hooks[hookName]
      }
    }

    if (link) {
      // 判断 relation 类型
      const relationMap = allMaps[link.relation]
      const isSource = link === currentMap.targetLink
      const typeArr = relationMap.relation.type.split(':')
      if (!isSource) typeArr.reverse()
      const [sourceType, targetType] = typeArr
      // 需要先创建对方的
      if (sourceType === 'n') {
        if (targetType === '1') {
          if (isSource) {
            needIdValues[currentFieldPathStr] = {
              entity: link.entity,
              path: currentFieldPath,
              // 记录同级的 dependency，之后创建的时候要带上
              dependencies: currentMap.dependencies?.map(dependency => parents.concat(dependency)),
              value
            }
          } else {
            // 自己是 target 的话，source 应该已经存在了，这里外面应该传入的是 id。
            selfFieldValues[currentFieldPathStr] = value
          }
        } else {
          // 双方都是 n
          noMergeValues[currentFieldPathStr] = {
            entity: link.entity,
            path: currentFieldPath,
            value
          }
        }
      } else {
        // sourceType === 1
        // 1：1， 但是自己是 target, 外部应该传入了 id
        if (targetType === '1' && !isSource) {
          selfFieldValues[currentFieldPathStr] = value
        } else {
          // 1：n 或者 1:1 &&对方是 target，需要我的 id
          needMyIdValues[currentFieldPathStr] = {
            isOneToOne: targetType === '1',
            entity: link.entity,
            path: currentFieldPath,
            oppositeField: relationMap.relation[isSource ? 'target' : 'source'].field,
            value
          }
        }
      }

      // 不递归了
      return
    }

    // 普通字段
    if (!currentMap.fieldsMap) {
      selfFieldValues[currentFieldPathStr] = value
      return
    }

    // 复合字段，继续递归
    return { next: value, context: { map: currentMap } }
  })

  return {
    selfFieldValues,
    needIdValues,
    needMyIdValues,
    noMergeValues,
    fieldHooks
  }
}

function mapColumnWithAlias (columns, entityName) {
  return columns.map(name => {
    const [prefix, field] = name.split('.')
    const aliasName = prefix === entityName
      ? field
      : `${reverseCapital(prefix)}_${field}`
    return { [aliasName]: name }
  })
}

async function recursiveCreate (entityName, inputRawValue, context, database, contextParentFields = []) {
  /**
   * 递归处理 inputValue，只要到第一层就够了，然后递归，
   *  1. 对于 n:1 或者 n:n 的需要先建立 1 的那一边拿到 id recursiveCreate
   *  对于 1:1 并且自己是 target 的，那么一定外面传入了 id，不用处理
   *  2. 创建自己
   *  3. 对于 1:1 并且自己是 source 的，最后写入 recursiveCreate
   *  4. 对于 1:n 的情况，
   *  4. 对于 n:n 的，createRelation
   */
  const { allMaps } = context

  const entityMap = allMaps[entityName]
  let inputValue = inputRawValue
  if (typeof inputRawValue !== 'object') {
    // TODO 这种情况只有可能是 value 独立了，有没有别的情况？
    inputValue = {
      [FIELD_VALUE_COLUMN_NAME]: inputRawValue
    }
  }

  const {
    selfFieldValues,
    needIdValues,
    needMyIdValues,
    noMergeValues,
    fieldHooks
  } = await separateValuesToInsertOrUpdate(inputValue, 'create', entityMap, context)

  // 1. 先创建哪些 needIdValues
  const needIds = await walkValueCollection(needIdValues, async (item, singleValueItem, singleValueItemIndex) => {
    // if (entityMap.storage.table === 'PageUrl') debugger
    if (!singleValueItem) return { id: null }
    const nextContextParentFields = contextParentFields.concat(item.path, singleValueItemIndex === undefined ? [] : singleValueItemIndex)
    return await getOrCreateUniqueValue(item.entity, singleValueItem, context, database, nextContextParentFields)
  })

  const noMergeValueIds = await walkValueCollection(noMergeValues, async (item, singleValueItem, singleValueItemIndex) => {
    const nextContextParentFields = contextParentFields.concat(item.path, singleValueItemIndex === undefined ? [] : singleValueItemIndex)
    return await getOrCreateUniqueValue(item.entity, singleValueItem, context, database, nextContextParentFields)
  })

  // 2. 再创建自己
  const valuesToInsert = {
    ...transform(selfFieldValues, (key, value) => {
      return [makeFieldColumnName(key.split('.')), value]
    }),
    ...mapValues(needIds, ({ id }) => id)
  }

  if (entityMap.fieldsMap[CREATED_AT_COLUMN_NAME]?.auto) {
    valuesToInsert[CREATED_AT_COLUMN_NAME] = now()
  }

  // console.log("insert ==>", valuesToInsert, entityMap.storage.table)
  const [entityId] = await database.insert(valuesToInsert).into(entityMap.storage.table)

  // 3. 创建需要我的 id 的对象
  const relierIds = await walkValueCollection(needMyIdValues, async (item, singleValueItem, singleValueItemIndex) => {
    const valueToInsert = {
      ...(typeof singleValueItem !== 'object' ? { [FIELD_VALUE_COLUMN_NAME]: singleValueItem } : singleValueItem)
    }
    set(valueToInsert, item.oppositeField, entityId)
    const nextContextParentFields = contextParentFields.concat(item.path, singleValueItemIndex === undefined ? [] : singleValueItemIndex)
    return await recursiveCreate(item.entity, valueToInsert, context, database, nextContextParentFields)
  })

  // 4. 多对多，noMergeValues 建立 relation
  for (const columnName in noMergeValues) {
    // 由于是对多对关系，这里一定是个数组。
    for (const noMergeValueId of noMergeValueIds[columnName]) {
      await context.methods.createRelation([entityName].concat(noMergeValues[columnName].path).join('.'), entityId, noMergeValueId.id)
    }
  }

  // 5. 调用 hooks
  for (const fieldPath in fieldHooks) {
    // TODO 没考虑 prepare 的情况，前面 prepare 的值要记录一下，写会 inputValue 也不合适。cloneDeep 碰到大数据又有问题。
    const valueInInput = get(inputValue, fieldPath)
    let effectValue
    if (!Array.isArray(valueInInput)) {
      effectValue = await fieldHooks[fieldPath]({ ...valueInInput, id: needIds[fieldPath] || entityId })
    } else {
      effectValue = []
      for (const valueItem of valueInInput) {
        // collection 一定有自己的 id
        effectValue.push(await fieldHooks[fieldPath](valueItem, entityId, contextParentFields))
      }
    }

    context.requestContext.effects.push({ path: contextParentFields.concat(fieldPath.split('.')), value: effectValue })
  }

  // console.log("insert success:", valuesToInsert, entityMap.storage.table, entityId, needIds, needIdValues)
  // TODO 没 id 的情况？如 lazy 的字段
  const result = { id: entityId }
  Object.entries(needIds).forEach(([fieldPath, fieldIds]) => {
    set(result, fieldPath, fieldIds)
  })
  Object.entries(relierIds).forEach(([fieldPath, fieldIds]) => {
    set(result, fieldPath, fieldIds)
  })
  return result
}

/**
 * 整体流程更 recursiveCreate 类似：
 * 1. 找到自己的字段，更新自己
 * 2. 对于我需要的 id 的字段(n:1)更新了，要重新 getOrCreate 来得到 id, 除非更新的值就是 id。
 * 3. 对于 n:n 字段更新了，也要 getOrCreate 得到 id。删除原来 relation 表中字段。
 * 4. 对于 1:n 字段更新了，TODO 要删掉原来的 n 吗？？？要看是否存在"存在性"依赖。这里先不删，只修改字段。
 * 5. 对于 1:1 字段更新了。getOrCreate。然后修改关系字段。
 */
async function recursiveUpdate (entityName, idsToUpdate, inputRawValue, context, database, contextParentFields = []) {
  const { allMaps } = context

  const entityMap = allMaps[entityName]
  let inputValue = inputRawValue
  if (typeof inputRawValue !== 'object') {
    // TODO 这种情况只有可能是 value 独立了，有没有别的情况？
    inputValue = {
      [FIELD_VALUE_COLUMN_NAME]: inputRawValue
    }
  }

  const {
    selfFieldValues,
    needIdValues,
    needMyIdValues,
    noMergeValues,
    fieldHooks
  } = await separateValuesToInsertOrUpdate(inputValue, 'update', entityMap, context)

  // 1. 先创建哪些 needIdValues
  const needIds = await walkValueCollection(needIdValues, async (item, singleValueItem, singleValueItemIndex) => {
    // if (entityMap.storage.table === 'PageUrl') debugger
    // 支持使用 null 来断开 1:1 或者 n:1 的联系
    if (singleValueItem === null) {
      return { id: null }
    } else {
      const nextContextParentFields = contextParentFields.concat(item.path, singleValueItemIndex === undefined ? [] : singleValueItemIndex)
      return await getOrCreateUniqueValue(item.entity, singleValueItem, context, database, nextContextParentFields)
    }
  })

  const noMergeValueIds = await walkValueCollection(noMergeValues, async (item, singleValueItem, singleValueItemIndex) => {
    const nextContextParentFields = contextParentFields.concat(item.path, singleValueItemIndex === undefined ? [] : singleValueItemIndex)
    return await getOrCreateUniqueValue(item.entity, singleValueItem, context, database, nextContextParentFields)
  })

  // 2. 再更新自己
  const valuesToUpdate = {
    ...transform(selfFieldValues, (key, value) => {
      return [makeFieldColumnName(key.split('.')), value]
    }),
    ...mapValues(needIds, ({ id }) => id)
  }
  if (entityMap.fieldsMap[MODIFIED_AT_COLUMN_NAME]?.auto) {
    valuesToUpdate[MODIFIED_AT_COLUMN_NAME] = now()
  }

  // console.log("update ==>", valuesToUpdate, entityMap.storage.table, idsToUpdate)
  await database(entityMap.storage.table).update(valuesToUpdate).whereIn('id', idsToUpdate)

  for (const entityId of idsToUpdate) {
    // 3. 更新或者创建需要我的 id 的对象
    await walkValueCollection(needMyIdValues, async (item, singleValueItem, singleValueItemIndex) => {
      const valueToInsertOrUpdate = {
        ...(typeof singleValueItem !== 'object' ? { [FIELD_VALUE_COLUMN_NAME]: singleValueItem } : singleValueItem)
      }

      const nextContextParentFields = contextParentFields.concat(item.path, singleValueItemIndex === undefined ? [] : singleValueItemIndex)

      // 有 id 的不用重复创建了
      // TODO: 也可能是更新，暂时不管
      // if (valueToInsertOrUpdate.id) return
      if (!item.isOneToOne) {
        set(valueToInsertOrUpdate, item.oppositeField, entityId)
        await recursiveCreate(item.entity, valueToInsertOrUpdate, context, database, nextContextParentFields)
        // TODO: 暂时只用于新建，先不删了
        // 要把原来的有我的 id 的字段删掉
        const relationFieldStr = [entityName].concat(item.path).join('.')
        await context.methods.removeRelation(relationFieldStr, entityId)
        // TODO 还要删除真正的字段
      } else {
        const [opposite] = await context.methods.find(item.entity, { [item.oppositeField]: entityId }, { limit: 1 }, { id: true })
        await recursiveUpdate(item.entity, [opposite.id], valueToInsertOrUpdate, context, database, nextContextParentFields)
      }
    })

    // 4. 多对多，noMergeValues 建立 relation
    for (const fieldName in noMergeValues) {
      // 由于是对多对关系，这里一定是个数组。
      for (const noMergeValueId of noMergeValueIds[fieldName]) {
        const relationFieldStr = [entityName].concat(noMergeValues[fieldName].path).join('.')
        // CAUTION: 先删后建，不然会把刚建的删掉
        // 删掉原来的 relation
        await context.methods.removeRelation(relationFieldStr, entityId)
        await context.methods.createRelation(relationFieldStr, entityId, noMergeValueId.id)
      }
    }

    // 5. 调用 hooks
    for (const fieldPath in fieldHooks) {
      // TODO 没考虑 prepare 的情况，前面 prepare 的值要记录一下，写会 inputValue 也不合适。cloneDeep 碰到大数据又有问题。
      const valueInInput = get(inputValue, fieldPath)
      let effectValue
      if (!Array.isArray(valueInInput)) {
        effectValue = await fieldHooks[fieldPath]({ ...valueInInput, id: needIds[fieldPath] || entityId })
      } else {
        effectValue = []
        for (const valueItem of valueInInput) {
          // collection 一定有自己的 id
          effectValue.push(await fieldHooks[fieldPath](valueItem))
        }
      }

      context.requestContext.effects.push({ path: contextParentFields.concat(fieldPath.split('.')), value: effectValue })
    }

    // console.log("update success:", valuesToUpdate, entityMap.storage.table, entityId, needIds, needIdValues)
  }

  return idsToUpdate
}

/**
 * Create ER APIs
 *
 * @param {import('@/dependence/bootstrap/bootstrap.js').SystemAPIs} systemHandle
 * @param {import('../../util.js').FilesContent} compositeFieldTypes
 * @param {*} allMaps
 * @returns
 */
export function createAPIs (systemHandle, compositeFieldTypes, allMaps) {
  const { database } = systemHandle

  const createCompositeFieldUtils = (requestContext) => (subAllMaps) => {
    const rawAPIs = createAPIs({ database }, compositeFieldTypes, subAllMaps)
    return mapValues(rawAPIs, api => api.bind(requestContext))
  }

  const methods = {
    find,
    count,
    create,
    update,
    createOrUpdate,
    remove,
    createRelation,
    findRelation,
    updateRelation,
    removeRelation,
    database
  }

  const context = { compositeFieldTypes, allMaps, methods, createCompositeFieldUtils }

  function createMethodContext (requestContext) {
    return {
      ...context,
      createUtils: createCompositeFieldUtils(requestContext),
      requestContext: requestContext
    }
  }

  /**
   * CAUTION 由于 ajax 过程中会把 undefined 转船成
   *
   * @param {string} entityName
   * @param {string | object} rawWhere
   * @param {{ limit: number, offset: number}} viewPort
   * @param {object} rawFields
   * @param {[
   *  string,
   *  'asc' | 'desc',
   *  'first' | 'last'
   * ][]} [orders=[]]
   * @param {unknown} groupBy
   * @returns
   */
  async function find (entityName, rawWhere, viewPort = {}, rawFields, orders = [], groupBy) {
    const { limit = DEFAULT_LIMIT, offset = 0 } = viewPort
    // 因为 find 也用作内部 api，composite field 可能创造出 string 形式的 entity, 所以要支持这种形式
    /** @type {object} */
    const inputWhere = typeof rawWhere === 'string' ? { [FIELD_VALUE_COLUMN_NAME]: rawWhere } : rawWhere
    // 因为我们把 collection field 也伪装成了 relation+entity，创建了 FieldEntity，所以查的时候根据名字需要处理一下。
    if (entityName.indexOf('.') !== -1) {
      // CAUTION 注意，我们并不支持关联关系的深层查询，这里支持的是 collection 的查询，因为 collection 用户找不到 entity 名字。
      const [realEntityName, realWhere, realFields] = convertQueryArguments(entityName, rawWhere, rawFields, {}, allMaps)
      // 批量转换 rawWhere 中的匹配条件
      // 支持 n:n 的查询条件，有这个需要，例如 page.keywords，collection+unique 产生的 n:n
      return await find(realEntityName, realWhere, { limit, offset }, realFields, orders, groupBy)
    }

    const entityMap = allMaps[entityName]
    const [columnsToSelect, tablesToJoinInSelect, relatedCollections] = parseSelectFields(entityName, rawFields, allMaps)
    // debugger
    const [where, tablesToJoinInWhere] = await parseWhere(entityName, inputWhere, { ...context, createUtils: createCompositeFieldUtils(this) })
    const link = entityMap.targetLink || entityMap.sourceLink
    const realMap = link ? allMaps[link.entity] : entityMap
    let query = database(realMap.storage.table)

    const combineTablesToJoin = reduceDuplicateJoinTables([...tablesToJoinInSelect, ...tablesToJoinInWhere])
    // debugger
    // 处理 unique/lazy 独立出去的表的 join
    if (combineTablesToJoin.length) {
      // select 中 和 where 中其他表的字段要合并一下，还要去重。
      combineTablesToJoin.forEach(({ table: tableNameToJoin, alias: currentTableAliasName, on: joinOn, inner: joinInner }) => {
        query = query.joinRaw(`${joinInner ? 'inner' : 'left'} join \`${tableNameToJoin}\` as \`${currentTableAliasName}\` on \`${joinOn[0][0]}\`.\`${joinOn[0][1]}\` = \`${joinOn[1][0]}\`.\`${joinOn[1][1]}\``)
      })
    }

    const columnsWithAlias = combineTablesToJoin.length ? mapColumnWithAlias(columnsToSelect, entityName) : columnsToSelect

    query = query.column(columnsWithAlias)
    // TODO 因为 delete 是软删除，所以这里增加了这项。目前有问题
    // const deletedWhere = [
    // [combineTablesToJoin.length ? `${entityName}.deleted` : 'deleted', 'is', null]
    // [`${entityName}.deleted`, 'is', null]
    // ]
    // const result = await applyWhere(query, where.concat(deletedWhere)).limit(limit).offset(offset)
    let qb = applyWhere(query, where)
    if (orders?.length) {
      // TODO: join的时候order字段会出现ambiguous的情况
      qb = qb.orderBy(orders.map(order => ({
        column: order?.[0],
        order: order?.[1],
        nulls: order?.[2]
      })))
    }
    const result = await qb
      .limit(limit)
      .offset(offset)

    if (relatedCollections?.length) {
      for (const relatedCollection of relatedCollections) {
        const relation = relatedCollection.relation
        const isSelfSource = relation.source.entity === entityName
        for (const resultItem of result) {
          const collectionEntityPath = [entityName].concat(relation[isSelfSource ? 'source' : 'target'].field)
          const collectionWhere = { [entityName]: { id: resultItem.id } }
          const fieldResult = await find(collectionEntityPath.join('.'), collectionWhere, { limit: DEFAULT_COLLECTION_LIMIT })
          set(resultItem, relation[isSelfSource ? 'source' : 'target'].field, fieldResult)
        }
      }
    }

    return result
  }

  async function count (entityName, rawWhere) {
    // 因为 find 也用作内部 api，composite field 可能创造出 string 形式的 entity, 所以要支持这种形式
    const inputWhere = typeof rawWhere === 'string' ? { [FIELD_VALUE_COLUMN_NAME]: rawWhere } : rawWhere
    // 因为我们把 collection field 也伪装成了 relation+entity，创建了 FieldEntity，所以查的时候根据名字需要处理一下。
    if (entityName.indexOf('.') !== -1) {
      // CAUTION 注意，我们并不支持关联关系的深层查询，这里支持的是 collection 的查询，因为 collection 用户找不到 entity 名字。
      const [realEntityName, realWhere] = convertQueryArguments(entityName, rawWhere, {}, {}, allMaps)
      // 批量转换 rawWhere 中的匹配条件
      // 支持 n:n 的查询条件，有这个需要，例如 page.keywords，collection+unique 产生的 n:n
      return await count(realEntityName, realWhere)
    }

    const entityMap = allMaps[entityName]
    const [columnsToSelect, tablesToJoinInSelect, relatedCollections] = parseSelectFields(entityName, {}, allMaps)
    // debugger
    const [where, tablesToJoinInWhere] = await parseWhere(entityName, inputWhere, { ...context, createUtils: createCompositeFieldUtils(this) })
    const link = entityMap.targetLink || entityMap.sourceLink
    const realMap = link ? allMaps[link.entity] : entityMap
    let query = database(realMap.storage.table)

    const combineTablesToJoin = reduceDuplicateJoinTables([...tablesToJoinInSelect, ...tablesToJoinInWhere])
    // debugger
    // 处理 unique/lazy 独立出去的表的 join
    if (combineTablesToJoin.length) {
      // select 中 和 where 中其他表的字段要合并一下，还要去重。
      combineTablesToJoin.forEach(({ table: tableNameToJoin, alias: currentTableAliasName, on: joinOn, inner: joinInner }) => {
        query = query.joinRaw(`${joinInner ? 'inner' : 'left'} join ${tableNameToJoin} as ${currentTableAliasName} on \`${joinOn[0][0]}\`.\`${joinOn[0][1]}\` = \`${joinOn[1][0]}\`.\`${joinOn[1][1]}\``)
      })
    }

    const columnsWithAlias = combineTablesToJoin.length ? mapColumnWithAlias(columnsToSelect, entityName) : columnsToSelect

    query = query.column(columnsWithAlias)

    const result = await applyWhere(query, where).count()

    if (relatedCollections?.length) {
      for (const relatedCollection of relatedCollections) {
        const relation = relatedCollection.relation
        const isSelfSource = relation.source.entity === entityName
        for (const resultItem of result) {
          const collectionEntityPath = [entityName].concat(relation[isSelfSource ? 'source' : 'target'].field)
          const collectionWhere = { [entityName]: { id: resultItem.id } }
          const fieldResult = await find(collectionEntityPath.join('.'), collectionWhere, { limit: DEFAULT_COLLECTION_LIMIT })
          set(resultItem, relation.source.field, fieldResult)
        }
      }
    }

    return result
  }

  async function create (entityName, rawValue) {
    const currentContext = createMethodContext(this)
    if (entityName.indexOf('.') !== -1) {
      const [realEntityName, realWhere, realFields, realValue] = convertQueryArguments(entityName, {}, {}, rawValue, allMaps)
      return recursiveCreate(realEntityName, realValue, currentContext, database)
    }

    return recursiveCreate(entityName, rawValue, currentContext, database)
  }

  async function update (entityName, idOrRawWhere, rawValue) {
    const currentContext = createMethodContext(this)
    const isWhereId = typeof idOrRawWhere !== 'object'

    if (entityName.indexOf('.') !== -1) {
      const whereToConvert = isWhereId ? {} : idOrRawWhere
      const [realEntityName, realWhere, realFields, realValue] = convertQueryArguments(entityName, whereToConvert, {}, rawValue, allMaps)
      return recursiveUpdate(realEntityName, isWhereId ? [idOrRawWhere] : realWhere, realValue, currentContext, database)
    }

    const ids = isWhereId
      ? [idOrRawWhere]
      : (await find(entityName, idOrRawWhere, { id: true })).map(r => r.id)

    return recursiveUpdate(entityName, ids, rawValue, currentContext, database)
  }

  async function createOrUpdate (entityName, rawWhere, values) {
    if (Object.keys(rawWhere).length === 0) {
      throw new Error('[createOrUpdate] rawWhere = {} ')
    }

    const [item] = await find(entityName, rawWhere, { limit: 1 })
    if (item) return await update(entityName, item.id, values)

    return await create(entityName, values)
  }

  async function remove (entityName, id) {
    if (typeof id === 'object') {
      throw new Error('[remove] id only support number')
    }
    // TODO 增加软删除
    // TODO 关联删除，还要删除 field 上面所有的字段。
    // return await update(entityName, id, {deleted: 1})
    return database(entityName)
      .where(ID_COLUMN_NAME, '=', id)
      .del()
  }

  async function findRelation (entityField, selfId, oppositeId, fields = {}) {
    const [entityName, ...fieldsNames] = entityField.split('.')
    const maps = getFieldsMapsByPath(allMaps[entityName], fieldsNames)
    const fieldMapValue = maps[maps.length - 1]
    const relationMap = allMaps[(fieldMapValue.targetLink || fieldMapValue.sourceLink).relation]
    const isSelfSource = relationMap.relation.source.entity === entityName

    if (relationMap.relation.type === 'n:n') {
      return (await find(relationMap.name, {
        ...fields,
        source: isSelfSource ? selfId : oppositeId,
        target: isSelfSource ? oppositeId : selfId
      })).map(item => ({
        ...item,
        self: isSelfSource ? item.source : item.target,
        opposite: isSelfSource ? item.target : item.source
      }))
    }

    // TODO 验证
    // 有 mergeTarget 了。一定是往 n 的那边 merge 的。
    const mergeTargetMap = allMaps[relationMap.mergeTarget.entity]
    const isMergeToSelf = relationMap.mergeTarget.entity === entityName

    const findWhere = {
      [ID_COLUMN_NAME]: isMergeToSelf ? selfId : oppositeId
    }
    set(findWhere, relationMap.mergeTarget.field, isMergeToSelf ? oppositeId : selfId)
    return find(mergeTargetMap.storage.table, findWhere)
  }

  async function createRelation (entityField, selfId, oppositeId, fields = {}) {
    // 来找 relation。
    const [entityName, ...fieldsNames] = entityField.split('.')
    const maps = getFieldsMapsByPath(allMaps[entityName], fieldsNames)
    const fieldMapValue = maps[maps.length - 1]
    const relationMap = allMaps[(fieldMapValue.targetLink || fieldMapValue.sourceLink).relation]
    const isSelfSource = relationMap.relation.source.entity === entityName

    if (relationMap.relation.type === 'n:n') {
      return database(relationMap.storage.table).insert({
        ...fields,
        source: isSelfSource ? selfId : oppositeId,
        target: isSelfSource ? oppositeId : selfId
      })
    }

    // 有 mergeTarget 了。一定是往 n 的那边 merge 的。
    const mergeTargetMap = allMaps[relationMap.mergeTarget.entity]
    const isMergeToSelf = relationMap.mergeTarget.entity === entityName

    // TODO 增加 field 前缀
    // TODO 返回值要和前面统一一下，前面返回的是 id。
    return database(mergeTargetMap.storage.table)
      .where(ID_COLUMN_NAME, '=', isMergeToSelf ? selfId : oppositeId)
      .update({
        [makeFieldColumnName(relationMap.mergeTarget.field)]: (isMergeToSelf ? oppositeId : selfId)
      })
  }

  async function updateRelation () {

  }

  async function removeRelation (entityField, selfId, oppositeId) {
    const [entityName, ...fieldsNames] = entityField.split('.')
    const maps = getFieldsMapsByPath(allMaps[entityName], fieldsNames)
    const fieldMapValue = maps[maps.length - 1]
    const relationMap = allMaps[(fieldMapValue.targetLink || fieldMapValue.sourceLink).relation]
    const isSelfSource = relationMap.relation.source.entity === entityName

    if (relationMap.relation.type === 'n:n') {
      let query = database(relationMap.storage.table)
        .where(isSelfSource ? 'source' : 'target', '=', selfId)
      if (oppositeId) {
        query = query.where(isSelfSource ? 'target' : 'source', '=', oppositeId)
      }
      return query.del()
    }

    // 有 mergeTarget 了。一定是往 n 的那边 merge 的。
    const mergeTargetMap = allMaps[relationMap.mergeTarget.entity]
    const isMergeToSelf = relationMap.mergeTarget.entity === entityName

    // TODO relation field 也要清空。
    // TODO 返回值要和前面统一一下，前面返回的是 id。
    return database(mergeTargetMap.storage.table)
      .where(ID_COLUMN_NAME, '=', isMergeToSelf ? selfId : oppositeId)
      .update({
        [makeFieldColumnName(relationMap.mergeTarget.field)]: null
      })
  }

  return methods
}
