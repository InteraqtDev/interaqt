import { describe, expect, test } from "vitest";
import { SQLiteDB, PostgreSQLDB, PGLiteDB, MysqlDB } from '@drivers';

/**
 * 驱动方言自洽契约(r25 I-1 的机制化,复盘落地项):
 *
 * 每个驱动的 `parseMatchExpression` 必须识别**自己的** `mapToDBFieldType` 对
 * json 语义声明产出的全部 fieldType 形态。json 语义有三种声明入口:
 *   - Property type:'json'(r23 白名单准入;PG/PGLite/MySQL 产出小写 'json')
 *   - Property type:'object'(产出大写 'JSON')
 *   - collection:true(产出大写 'JSON')
 * r25 I-1 的逃逸正是这三种形态在方言入口被区别对待:`fieldType === 'JSON'`
 * 大小写敏感比较漏掉 'json' → 回退文本比较 → 真实 PG 裸报
 * "operator does not exist: json = unknown",而 PGLite(toLowerCase)正常——
 * 同一声明在两个 PostgreSQL 语义驱动上答案分裂。
 *
 * 这是纯函数对的契约(无需数据库服务器),四驱动逐格断言:
 *   1. 同 json 语义的三种 fieldType 形态必须得到**完全相同**的方言处理
 *      (存在性 + SQL 文本 + 参数);
 *   2. PG 系 / MySQL 对 '='/'!='/'in' 必须返回方言处理器(否则回退路径
 *      在这些驱动上产出非法 SQL);全部四驱动对 'contains' 必须返回处理器。
 */

type DialectDriver = {
    parseMatchExpression?: (key: string, value: [string, unknown], fieldName: string, fieldType: string, isReferenceValue: boolean, getReferenceFieldValue: (v: string) => string, p: () => string) => { fieldValue: string, fieldParams?: unknown[] } | undefined
    mapToDBFieldType(type: string, collection?: boolean): string
}

function makePlaceholder() {
    let index = 0
    return () => {
        index++
        return `$${index}`
    }
}

function callDialect(driver: DialectDriver, fieldType: string, value: [string, unknown]) {
    return driver.parseMatchExpression?.(
        'meta',
        value,
        'tbl.meta_field',
        fieldType,
        false,
        (v: string) => v,
        makePlaceholder()
    )
}

const drivers: Array<[string, DialectDriver, { mustHandleEquality: boolean }]> = [
    // SQLite 的 =/!= 刻意走 MatchExp 的规范序列化文本回退(与写入路径一致),方言只接 contains。
    ['SQLite', new SQLiteDB() as unknown as DialectDriver, { mustHandleEquality: false }],
    ['PostgreSQL', new PostgreSQLDB('dialect_consistency_unused') as unknown as DialectDriver, { mustHandleEquality: true }],
    ['PGLite', new PGLiteDB() as unknown as DialectDriver, { mustHandleEquality: true }],
    ['MySQL', new MysqlDB('dialect_consistency_unused') as unknown as DialectDriver, { mustHandleEquality: true }],
]

// json 语义的三种声明形态 → 该驱动实际产出的 fieldType 字符串
function jsonFieldTypeForms(driver: DialectDriver): Array<[string, string]> {
    return [
        ["type:'json'", driver.mapToDBFieldType('json')],
        ["type:'object'", driver.mapToDBFieldType('object')],
        ['collection:true', driver.mapToDBFieldType('string', true)],
    ]
}

const operatorLoads: Array<[string, [string, unknown]]> = [
    ['=', ['=', { a: 1 }]],
    ['!=', ['!=', { a: 1 }]],
    ['in', ['in', [{ a: 1 }, { b: 2 }]]],
    ['contains', ['contains', 'x']],
]

describe('driver dialect self-consistency: parseMatchExpression must recognize every json fieldType its own mapToDBFieldType produces', () => {
    for (const [driverName, driver, expectations] of drivers) {
        test(`${driverName}: all json-semantic fieldType forms get identical dialect treatment`, () => {
            const forms = jsonFieldTypeForms(driver)
            for (const [opName, value] of operatorLoads) {
                const results = forms.map(([formName, fieldType]) => ({
                    formName,
                    fieldType,
                    result: callDialect(driver, fieldType, value),
                }))
                const [first, ...rest] = results
                for (const other of rest) {
                    // 存在性 + SQL 文本 + 参数逐一相等:任何一格分裂都意味着「同一声明语义、
                    // 不同 fieldType 拼写」在该驱动上产出不同 SQL(r25 I-1 的类)。
                    expect(other.result === undefined, `${driverName} ${opName}: form ${other.formName} (fieldType "${other.fieldType}") handled=${other.result !== undefined} but form ${first.formName} (fieldType "${first.fieldType}") handled=${first.result !== undefined}`)
                        .toBe(first.result === undefined)
                    if (first.result && other.result) {
                        expect(other.result.fieldValue).toBe(first.result.fieldValue)
                        expect(other.result.fieldParams).toEqual(first.result.fieldParams)
                    }
                }
            }
        })

        test(`${driverName}: dialect handles the operators its fallback cannot express`, () => {
            for (const [, fieldType] of jsonFieldTypeForms(driver)) {
                // contains 没有跨驱动可用的回退 SQL——四驱动都必须接。
                expect(callDialect(driver, fieldType, ['contains', 'x']),
                    `${driverName} must handle 'contains' for fieldType "${fieldType}"`).toBeDefined()
                if (expectations.mustHandleEquality) {
                    // PG 系的 json 类型没有 =/!= 操作符,MySQL 的 json 与文本比较按类型序——
                    // 回退文本比较在这些驱动上要么裸报错、要么语义错,方言必须接管。
                    for (const [opName, value] of operatorLoads.filter(([name]) => name !== 'contains')) {
                        expect(callDialect(driver, fieldType, value),
                            `${driverName} must handle '${opName}' for fieldType "${fieldType}"`).toBeDefined()
                    }
                }
            }
        })
    }
})
