/**
 * TODO: Need to improve
 * @typedef {{
 *  name: string
 *  columns: {
 *    name: string
 *    type: string
 *    size: number
 *    auto?: boolean
 *  }[]
 * }} TableConfig
 */

/**
 * TODO: 支持 diff
 * Create tables according to the tables configuration
 *
 * @param {import('knex').Knex} database
 * @param {TableConfig[]} tables
 * @param {unknown} migrate
 * @returns {void}
 */
export async function setupTables (database, tables, migrate) {
  for (const table of tables) {
    if (await database.schema.hasTable(table.name)) {
      const columns = await database(table.name).columnInfo()
      const newColumns = Object.values(table.columns).filter(
        (column) => !(column.name in columns)
      )
      if (!newColumns.length) {
        continue
      }
      await database.schema.alterTable(table.name, async (physicalTable) => {
        for (const column of newColumns) {
          const type = column.type !== 'id' ? column.type : column.auto ? 'increments' : 'integer'
          physicalTable[type](column.name, column.size)
        }
      })
    } else {
      await database.schema.createTable(table.name, (physicalTable) => {
        Object.values(table.columns).forEach((column) => {
          // 1. 处理 id 字段。
          if (column.type === 'id') {
            if (column.auto) {
              physicalTable.increments(column.name)
            } else {
              // CAUTION 目前是使用 integer 做 ID，理论上应该用 uuid 分配器。
              physicalTable.integer(column.name)
            }
          } else {
            // 2. 其他类型
            // TODO size 的问题
            physicalTable[column.type](column.name, column.size)
          }
        })

        // 处理 primaryKey。目前 increments 会自动 primaryKey，所以 type === id && auto 就是 pk。
        const comboPrimaryColumns = Object.values(table.columns).find(
          (c) => c.type === 'id' && c.auto
        )
          ? null
          : Object.values(table.columns)
            .filter((c) => c.primaryKey)
            .map((c) => c.name)

        if (comboPrimaryColumns?.length) {
          physicalTable.primary(comboPrimaryColumns)
        }
      })
    }
  }
}
