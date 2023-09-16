import { capitalize, reverseCapital } from '../../util.js'

export function walkFields (entityLike, compositeFieldTypes, context, callback, parents = []) {
  entityLike.fields.forEach(field => {
    const nextFields = Array.isArray(field.type)
      ? field.type
      : compositeFieldTypes[field.type]?.fields

    const nextContext = callback(field, nextFields, parents, context, entityLike.fields)
    // 没有显式地说要停止
    if (nextFields && nextContext !== false) {
      walkFields({ fields: nextFields }, compositeFieldTypes, nextContext, callback, parents.concat(field))
    }
  })
}

export function makeFieldEntityFieldName (entityName, inputNames) {
  return reverseCapital(makeFieldEntityName(entityName, inputNames))
}

export function makeFieldEntityName (entityName, inputNames) {
  return ([entityName]).concat(inputNames).map(capitalize).join('')
}

export function makeEntityAliasNameFromPath (fieldPathOfEntity) {
  // return fieldPathOfEntity.map(capitalize).join('')
  return fieldPathOfEntity.map(capitalize).join('_')
}

export function makeFieldColumnName (names) {
  return names.join('_')
}

export function makeExtractFieldTableName (entityName, names) {
  return `${entityName}_${names.join('_')}`
}

export function walkObject (obj, context, callback, parents = []) {
  for (const i in obj) {
    const result = callback(obj[i], i, context, parents)
    if (result && result.next) {
      walkObject(result.next, result.context, callback, parents.concat(i))
    }
  }
}

export async function walkObjectAsync (obj, context, callback, parents = []) {
  for (const i in obj) {
    const result = await callback(obj[i], i, context, parents)
    if (result && result.next) {
      await walkObject(result.next, result.context, callback, parents.concat(i))
    }
  }
}

export function makeRelationEntityName (relation) {
  return [relation.source.entity]
    .concat(relation.source.field)
    .concat(capitalize(relation.name))
    .concat(relation.target.entity)
    .concat(relation.target.field)
    .join('_')
}

export function getChildMapByPath (map, path) {
  let base = map
  path.forEach(p => {
    base = base.fieldsMap[p]
  })
  return base
}

export function getAllSelfLeafField (map) {
  const result = []
  walkObject(map.fieldsMap, null, (fieldMapValue, fieldName, context, parents) => {
    if (fieldMapValue.targetLink || fieldMapValue.sourceLink) return
    // 深度递归
    if (fieldMapValue.fieldsMap) return { next: fieldMapValue.fieldsMap }
    // 只剩叶子了
    result.push({ value: fieldMapValue, parents })
  })
  return result
}

export function getFieldsMapsByPath (map, path) {
  const result = []
  let base = map
  path.forEach(p => {
    base = base.fieldsMap[p]
    result.push(base)
  })
  return result
}

export function reduceDuplicateJoinTables (tables) {
  const result = []
  const savedKeysAndIndex = {}

  const createKey = table => `${table.table}|${table.alias}|${JSON.stringify(table.on)}`

  tables.forEach((table, i) => {
    // 对比 name, source.sourceFieldNames, on
    const currentKey = createKey(table)
    const indexOfSameKey = savedKeysAndIndex[currentKey]
    if (indexOfSameKey === undefined) {
      result.push(table)
      // 记录 index
      savedKeysAndIndex[currentKey] = result.length - 1
    } else {
      const record = result[indexOfSameKey]
      // 如果当前是 inner，那么更大，要替换掉之前的
      if (table.inner && !record.inner) {
        // 有 inner 的要更大。
        result.splice(indexOfSameKey, 1, table)
      }
    }
  })

  return result
}

function convertFieldName (name, entityName, reverseFieldPath) {
  const namePath = name.split('.')
  if (namePath[0] !== entityName) return name
  return reverseFieldPath.concat(namePath.slice(1)).join('.')
}

function convertFieldNameInWhere (rawWhere, entityName, reverseFieldPath) {
  if (!rawWhere) return rawWhere
  const where = []
  normalizeWhere(rawWhere).forEach((w) => {
    if (Array.isArray(w)) {
      where.push([convertFieldName(w[0], entityName, reverseFieldPath), ...w.slice(1)])
    } else {
      where.push({
        ...w,
        children: convertFieldNameInWhere(w.children, entityName, reverseFieldPath)
      })
    }
  })
  return where
}

function convertFieldNameInFields (rawFields, entityName, reverseFieldName) {
  if (!rawFields) return rawFields
  // 因为是树形结构，只需要转换第一层就够了
  const result = {}
  Object.keys(rawFields).forEach(fieldName => {
    result[convertFieldName(fieldName, entityName, reverseFieldName)] = rawFields[fieldName]
  })
  return result
}

export function convertQueryArguments (inputEntityName, rawWhere, rawFields, rawValue, allMaps) {
  const fieldPath = inputEntityName.split('.')
  const entityName = fieldPath[0]
  const fieldMapValue = getFieldsMapsByPath(allMaps[entityName], fieldPath.slice(1)).pop()

  const link = fieldMapValue.sourceLink || fieldMapValue.targetLink
  const realEntityName = link.entity
  const reverseFieldPath = link.field
  // 开始处理 rawFields 和 rawWhere
  return [
    realEntityName,
    convertFieldNameInWhere(rawWhere, entityName, reverseFieldPath),
    convertFieldNameInFields(rawFields, entityName, reverseFieldPath),
    convertFieldNameInFields(rawValue, entityName, reverseFieldPath)
  ]
}

export function normalizeWhere (rawWhere) {
  return Array.isArray(rawWhere)
    ? rawWhere
    : Object.entries(rawWhere).filter(([key, value]) => value !== undefined).map(([key, value]) => [key, value === null ? 'is' : '=', value])
}

export function isCompositeFieldRawValue (field, value) {
  if (field.id) return field.id.every(partialId => !Object.prototype.hasOwnProperty.call(value, partialId))
  return !Object.prototype.hasOwnProperty.call(value, 'id')
}

export async function getOrCreate (database, table, obj) {
  const where = Object.entries(obj).map(([key, value]) => [key, value === null ? 'is' : '=', value])
  let [result] = await applyWhere(database.select().from(table), where)

  if (!result) {
    const id = await database.insert(obj).into(table)
    result = (await database.select().from(table).where('id', '=', id))[0]
  }

  return result
}

/**
 *
 * @param {import('knex').Knex.QueryBuilder} builder
 * @param {*} where
 * @param {string} table
 * @returns
 */
export function applyWhere (builder, where, table) {
  let query = builder
  where.forEach(c => {
    const children = Array.isArray(c) ? null : c.children
    if (children) {
      query = query[c.method](subBuilder => {
        applyWhere(subBuilder, children)
      })
    } else {
      const whereField = table ? `${table}.${c[0]}` : c[0]
      if (Array.isArray(c[2])) {
        query = query.whereIn(whereField, c[2])
      } else {
        const matchMethod = c[2] === null ? 'is' : c[1]
        query = query.where(whereField, matchMethod, c[2])
      }
    }
  })
  return query
}
