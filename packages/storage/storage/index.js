import path from 'path'
import { setupTables } from '../common.js'
import { loadJSON } from '../../util.js'
import {
  createERTables,
  createAPIs as createERAPIs,
  ID_COLUMN_NAME,
  MODIFIED_AT_COLUMN_NAME,
  CREATED_AT_COLUMN_NAME
} from './ERStorage.js'
import {
  createAPIs as createObjectStorageApis
} from './objectStorage.js'

// const isERRegexp = /\.er\.json$/
// const isFieldRegexp = /\.field\.js$/

// async function loadEntityAndRelationData (erFiles, readFile, storagePath) {
//   const allEntities = []
//   const allRelations = []
//   for (const file of erFiles) {
//     const { entities, relations } = JSON.parse(await readFile(new URL(path.join(storagePath, file), import.meta.url)))
//     allEntities.push(...entities)
//     allRelations.push(...relations)
//   }
//   return { entities: allEntities, relations: allRelations }
// }

/**
 * 1. 对"实体"增加通用字段："时间"、"归属"
 * 2. 把 relation 字段直接记录到 field 上。方便后面计算
 *
 * @param {ER.RawEntity} entity
 * @param {ER.ReplaceIdWithNameRelation[]} relations
 * @returns {ER.RawEntity}
 */
export function completeFields (entity, relations) {
  const fields = [...entity.fields]

  if (!fields.some(f => f.name === ID_COLUMN_NAME)) {
    fields.push({
      name: ID_COLUMN_NAME,
      type: 'id',
      auto: true
    })
  }

  fields.push({
    name: CREATED_AT_COLUMN_NAME,
    auto: true,
    type: 'number',
    size: 10
  })

  fields.push({
    name: MODIFIED_AT_COLUMN_NAME,
    auto: true,
    type: 'number',
    size: 10
  })

  return {
    ...entity,
    fields
  }
}

/**
 * `entity` and `field` of `source` and `target` are replace with corresponding name.
 *
 * @param {ER.RawRelation} relation
 * @param {ER.RawEntity[]} entities
 * @returns {ER.ReplaceIdWithNameRelation}
 */
export function replaceIdWithNamePath (relation, entities) {
  const { source, target } = relation
  const sourceEntity = entities.find(e => e.id === source.entity)
  const sourceField = sourceEntity.fields.find(f => f.id === source.field)
  const targetEntity = entities.find(e => e.id === target.entity)
  const targetField = targetEntity.fields.find(f => f.id === target.field)

  try {
    sourceField.name
    targetField.name
  } catch (e) {
    console.log('match error', source, target)
  }

  return {
    ...relation,
    source: {
      entity: sourceEntity.name,
      field: [sourceField.name]
    },
    target: {
      entity: targetEntity.name,
      field: [targetField.name]
    }
  }
}

/**
 *
 * @param {ER.RawEntity[]} rawEntities
 * @param {ER.ReplaceIdWithNameRelation[]} relations
 * @returns
 */
function prepareEntitiesAndRelations (rawEntities, relations) {
  // 先换成名字，在 client 中使用 id，是为了标识唯一性。因为可能在界面上删了又创建同名的。
  const entities = rawEntities.map(e => completeFields(e, relations))
  return { entities, relations }
}

/**
 * @param {import('@/dependence/bootstrap/bootstrap.js').SystemAPIs} systemHandle
 * @returns
 */
export async function setup (systemHandle) {
  const { database, fs, dir, useEffect, moduleConfig, attach = {}, versionTable } = systemHandle
  const { apis = {}, allMap = {}, allTables = [], compositeFieldTypes } = attach

  // service self configuration
  const config = moduleConfig.storage

  /** @type {{entities: ER.RawEntity[], relations: ER.RawRelation[]}} */
  let { entities, relations } = await loadJSON(path.join(dir.app, '/', config.options?.storageData))

  const versionER = await loadJSON(path.join(dir.runtime, '/', versionTable.versionJSON))
  const versionHistoryER = await loadJSON(path.join(dir.runtime, '/', versionTable.versionHistoryJSON))

  entities = entities.concat(versionER.entities).concat(versionHistoryER.entities)
  relations = relations.concat(versionHistoryER.relations)

  /** @type {ER.ReplaceIdWithNameRelation[]} */
  const storageRelations = relations.map(relation => replaceIdWithNamePath(relation, entities))

  // 生成 table
  const { tables, map } = createERTables(prepareEntitiesAndRelations(entities, storageRelations), compositeFieldTypes)
  Object.assign(allMap, map)
  allTables.push(...tables)

  // setup 的 effect
  useEffect(async () => {
    await fs.writeFile(path.join(dir.runtime, './storage.table.json'), JSON.stringify(allTables, null, 4))
    await fs.writeFile(path.join(dir.runtime, './storage.map.json'), JSON.stringify(allMap, null, 4))
    await setupTables(database, allTables)
  })

  const storageApis = createAPIs(systemHandle, compositeFieldTypes, config.options?.objects, allMap)
  Object.assign(apis, storageApis)
  return {
    allMap,
    allTables
  }
}

/**
 *
 * @param {import('@/dependence/bootstrap/bootstrap.js').SystemAPIs} systemHandle
 * @param {import('../../util.js').FilesContent} compositeFieldTypes
 * @param {import('@/config/config.dev.js').ModuleConfig['']['options']['objects']} objects
 * @param {*} allMap
 * @returns
 */
export function createAPIs (systemHandle, compositeFieldTypes, objects, allMap) {
  const objectStorageApis = createObjectStorageApis(systemHandle, { objects })
  // field methods 也作为 api 暴露出去
  const erAPIs = createERAPIs(systemHandle, compositeFieldTypes, allMap)
  return {
    ...erAPIs,
    ...objectStorageApis
  }
}

// 可以提供给其他的 service 用
export { createERTables, createAPIs as createERAPIs } from './ERStorage.js'
export { setupTables } from '../common.js'
