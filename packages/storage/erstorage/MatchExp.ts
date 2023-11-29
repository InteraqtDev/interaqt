import {BoolExp} from "@interaqt/shared";
import {EntityToTableMap} from "./EntityToTableMap";
import {assert} from "../utils";
import {RecordQueryTree} from "./RecordQuery";

export type MatchAtom = { key: string, value: [string, any], isReferenceValue?: boolean }
export type MatchExpressionData = BoolExp<MatchAtom>

export type FieldMatchAtom = MatchAtom & {
    isInnerQuery?: boolean,
    //  value 类型的
    fieldName?: [string, string],
    fieldValue?: string,
    // entity 类型的
    namePath?: string[],
    isFunctionMatch?: boolean,
}

export class MatchExp {
    public static atom(condition: MatchAtom) {
        assert(condition.key !== undefined, 'key cannot be undefined')
        assert(Array.isArray(condition.value) && condition.value.length === 2, 'value must be array')
        assert(condition.value[1] !== undefined, `${condition.key} value cannot be undefined`)
        return BoolExp.atom<MatchAtom>(condition)
    }
    // TODO 支持更复杂的格式
    public static fromObject(condition: Object) {
        let root: BoolExp<MatchAtom> | undefined
        Object.entries(condition).forEach(([key, value]) => {
              if (!root) {
                  root = MatchExp.atom({key, value: ['=', value]})
              }  else {
                  root = root.and({key, value: ['=', value]})
              }
        })
        return root!
    }

    public xToOneQueryTree: RecordQueryTree

    constructor(public entityName: string, public map: EntityToTableMap, public data?: MatchExpressionData, public contextRootEntity?: string, public fromRelation?: boolean) {
        this.xToOneQueryTree = new RecordQueryTree(this.entityName, this.map)
        if (this.data) {
            assert(this.data instanceof BoolExp, `match data is not a BoolExpression instance, you passed: ${this.data}`)
            this.buildQueryTree(this.data, this.xToOneQueryTree)
        }
    }

    buildQueryTree(matchData: MatchExpressionData, recordQueryTree: RecordQueryTree) {
        if (matchData.isExpression()) {
            if (matchData.left) {
                this.buildQueryTree(matchData.left, recordQueryTree)
            }

            if (matchData.right) {
                this.buildQueryTree(matchData.right, recordQueryTree)
            }
        } else {
            // variable
            const matchAttributePath = (matchData.data.key as string).split('.')
            const namePath = [this.entityName].concat(matchAttributePath)
            const attributeInfo = this.map.getInfoByPath(namePath)!

            // 直接就是 value 的情况不用管，没有 query 其他的实体。
            //  CAUTION 还有最后路径是 entity 但是  match 值是 EXIST 的不用管，因为会生成 exist 子句。只不过这里也不用特别处理，join 的表没用到会自动数据库忽略。
            if ((matchAttributePath.length === 1 && attributeInfo.isValue)) {
                return
            }

            const manyToManySymmetricPaths = this.map.spawnManyToManySymmetricPath(namePath)
            if (attributeInfo.isRecord) {
                if (manyToManySymmetricPaths) {
                    recordQueryTree.addRecord(manyToManySymmetricPaths[0].slice(1, Infinity))
                    recordQueryTree.addRecord(manyToManySymmetricPaths[1].slice(1, Infinity))
                } else {
                    recordQueryTree.addRecord(matchAttributePath)
                }

            } else {
                if (manyToManySymmetricPaths) {
                    recordQueryTree.addField(manyToManySymmetricPaths[0].slice(1, Infinity))
                    recordQueryTree.addField(manyToManySymmetricPaths[1].slice(1, Infinity))
                } else {
                    // 最后一个是 attribute，所以不在 recordQueryTree 上。
                    recordQueryTree.addField(matchAttributePath)
                }
            }
        }
    }


    getFinalFieldName(matchAttributePath: string[]): [string, string] {
        const namePath = [this.entityName].concat(matchAttributePath.slice(0, -1))
        return this.map.getTableAliasAndFieldName(namePath, matchAttributePath.at(-1)!).slice(0, 2) as [string, string]
    }

    getReferenceFieldValue(valueStr: string) {
        const matchAttributePath = valueStr.split('.')
        const [tableAlias, rawFieldName] = this.map.getTableAliasAndFieldName(
            [this.contextRootEntity || this.entityName].concat(matchAttributePath.slice(0, -1)),
            matchAttributePath.at(-1)!
        )
        return `${tableAlias}.${rawFieldName}`
    }

    getFinalFieldValue(isReferenceValue: boolean, value: [string, any]) {
        let fieldValue
        const simpleOp = ['=', '>', '<', '<=', '>=', 'like', 'not']

        if (simpleOp.includes(value[0])) {
            fieldValue = `${value[0]} ${isReferenceValue ? this.getReferenceFieldValue(value[1]) : JSON.stringify(value[1])}`
        } else if (value[0].toLowerCase() === 'in') {
            assert(!isReferenceValue, 'reference value cannot use IN to match')
            fieldValue = `IN (${value[1].map((x: any) => JSON.stringify(x)).join(',')})`
        } else if (value[0].toLowerCase() === 'between') {
            fieldValue = `BETWEEN ${isReferenceValue ? this.getReferenceFieldValue(value[1][0]) : JSON.stringify(value[1][0])} AND ${isReferenceValue ? this.getReferenceFieldValue(value[1][1]) : JSON.stringify(value[1][1])}]`
        } else {
            assert(false, `unknown value expression ${JSON.stringify(value)}`)
        }

        return fieldValue
    }

    buildFieldMatchExpression(): BoolExp<FieldMatchAtom> | null {
        if (!this.data) return null
        // 1. 所有 key 要 build 成 field
        // 2. x:n 关系中的 EXIST 要增加查询范围限制，要把 value 中对上层引用也 build 成 field。
        return this.data.map<FieldMatchAtom>((exp: MatchExpressionData) => {
            const matchAttributePath = (exp.data.key as string).split('.')
            const attributeInfo = this.map.getInfoByPath([this.entityName].concat(matchAttributePath))!

            const namePath = [this.entityName].concat(matchAttributePath)
            const symmetricPaths = this.map.spawnManyToManySymmetricPath(namePath)

            let sourcePath, targetPath
            if (symmetricPaths) {
                // 要去除 头部 的 entity
                sourcePath = symmetricPaths[0].slice(1, Infinity)
                targetPath = symmetricPaths[1].slice(1, Infinity)
            }


            // 如果结尾是 value
            // 如果极为是 entity，那么后面匹配条件目前只能支持 EXIST。
            //  CAUTION 针对关联实体的属性匹配，到这里已经被拍平了，所以结尾是  entity 的情况必定都是函数匹配。
            if (attributeInfo.isValue) {
                // CAUTION 路径中只可能有一个 n:n symmetric 关系。因为路径中有多个的在语义逻辑上就不正确。
                //  有一个的情况还是用在 findRelatedRecords 的时候才有意义。因为它会通过 id 限定关系，而即使是 n:n 的关系，任意两个实体中只会有一个关系数据。所以这个时候能找到唯一的数据，是有意义的。

                const fieldValue = this.getFinalFieldValue(exp.data.isReferenceValue!, exp.data.value)

                if (!symmetricPaths) {
                    return {
                        ...exp.data,
                        fieldName: this.getFinalFieldName(matchAttributePath),
                        fieldValue
                    }
                }

                // CAUTION 注意这里 length -2 是因为  namePath 里面有 this.entityName
                return BoolExp.atom<FieldMatchAtom>({
                    ...exp.data,
                    fieldName: this.getFinalFieldName(sourcePath!),
                    fieldValue
                }).or({
                    ...exp.data,
                    fieldName: this.getFinalFieldName(targetPath!),
                    fieldValue
                })

            } else {
                // CAUTION record 的情况只有可能 n:n 关系

                // CAUTION 函数匹配的情况不管了，因为可能未来涉及到使用 cursor 实现更强的功能，这就涉及到查询计划的修改了。统统扔到上层去做。
                //  注意，子查询中也可能对上层的引用，这个也放到上层好像能力有点重叠了。
                if (!symmetricPaths) {
                    return {
                        ...exp.data,
                        namePath,
                        isFunctionMatch: true,
                    }
                }

                const sourceNamePath = [this.entityName].concat(sourcePath!)
                const targetNamePath = [this.entityName].concat(targetPath!)
                assert(sourceNamePath!.length === namePath.length, `symmetric entity match can only be last, ${sourceNamePath} ${namePath}`)

                return BoolExp.atom<FieldMatchAtom>({
                    ...exp.data,
                    namePath:sourceNamePath!,
                    isFunctionMatch: true,
                }).or({
                    ...exp.data,
                    namePath:targetNamePath!,
                    isFunctionMatch: true,
                })

            }
        })

    }

    and(condition: MatchAtom|MatchExp): MatchExp {
        if (condition instanceof MatchExp) {
            return new MatchExp(this.entityName, this.map, this.data ? this.data.and(condition.data) : condition.data, this.contextRootEntity)
        } else {
            assert(condition.key !== undefined, 'key cannot be undefined')
            assert(Array.isArray(condition.value) && condition.value.length === 2, 'value must be array')
            assert(condition.value[1] !== undefined, `${condition.key} value cannot be undefined`)
            return new MatchExp(this.entityName, this.map, this.data ? this.data.and(condition) : BoolExp.atom<MatchAtom>(condition), this.contextRootEntity)
        }

    }
}