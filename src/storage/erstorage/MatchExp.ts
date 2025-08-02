import {BoolExp, BoolExpressionRawData, ExpressionData} from "@shared";
import {EntityToTableMap, RecordAttribute} from "./EntityToTableMap.js";
import {assert} from "../utils.js";
import {RecordQueryTree} from "./RecordQuery.js";
import {Database} from "@runtime";
import {PlaceholderGen} from "./RecordQueryAgent.js";

export type MatchAtom = { key: string, value: [string, any], isReferenceValue?: boolean }
export type MatchExpressionData = BoolExp<MatchAtom>

export type FieldMatchAtom = MatchAtom & {
    isInnerQuery?: boolean,
    //  value 类型的
    fieldName?: [string, string],
    fieldValue?: string,
    fieldParams? :any[]
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
    
    /**
     * 从 MatchExpressionData 中提取所有路径
     * @returns 路径数组，每个路径是一个字符串数组
     */
    public static extractPaths(expression: MatchExpressionData): string[][] {
        const paths: string[][] = [];
        
        // MatchExpressionData 是 BoolExp<MatchAtom> 的别名
        const boolExp = expression instanceof BoolExp ? expression : BoolExp.fromValue(expression);
        
        if (boolExp.isExpression()) {
            if (boolExp.left) {
                paths.push(...MatchExp.extractPaths(boolExp.left.raw as MatchExpressionData));
            }
            if (boolExp.right) {
                paths.push(...MatchExp.extractPaths(boolExp.right.raw as MatchExpressionData));
            }
        } else if (boolExp.isAtom()) {
            const matchAtom = boolExp.data as MatchAtom;
            const key = matchAtom.key;
            const pathParts = key.split('.');
            
            // 如果路径包含多个部分（即有关联查询），需要验证
            if (pathParts.length > 1) {
                paths.push(pathParts);
            }
        }
        
        return paths;
    }

    public xToOneQueryTree: RecordQueryTree

    constructor(public entityName: string, public map: EntityToTableMap, public data?: MatchExpressionData, public contextRootEntity?: string, public fromRelation?: boolean) {
        this.xToOneQueryTree = new RecordQueryTree(this.entityName, this.map)
        if (this.data) {
            assert(this.data instanceof BoolExp, `match data is not a BoolExpression instance, you passed: ${this.data}`)
            this.data = this.convertFilteredRelation(this.data)
            this.buildQueryTree(this.data, this.xToOneQueryTree)
        }
    }
    convertFilteredRelation(matchData: MatchExpressionData): MatchExpressionData {
        if (matchData.isExpression()) {
            const newLeft = this.convertFilteredRelation(matchData.left)
            const newRight = matchData.right ? this.convertFilteredRelation(matchData.right) : undefined
            const matchExpRawData = matchData.raw as BoolExpressionRawData<MatchAtom>
            return new BoolExp<MatchAtom>({
                type: 'expression',
                operator: matchExpRawData.operator,
                left: newLeft.raw,
                right: newRight?.raw
            })
        } else {
            // variable
            const matchAttributePath = (matchData.data.key as string).split('.')
            const namePath = [this.entityName].concat(matchAttributePath)
            const attributeInfo = this.map.getInfoByPath(namePath)!
            if (!attributeInfo.isRecord) {
                return matchData
            }

            const linkInfo = attributeInfo.getLinkInfo()
            if (!attributeInfo.isLinkFiltered()) {
                return matchData
            }

            // filtered relation 的情况
            const sourceAttributeInfo = attributeInfo.getSourceAttributeInfo()
            // 1. 条件中的 attribute 要替换成 原本的名称。

            const baseNamePath = [this.entityName].concat(matchAttributePath.slice(0, -1), sourceAttributeInfo.attributeName)
            const baseMatchExpAtom = MatchExp.atom({key:baseNamePath.join('.'), value: matchData.data.value})
            // 2. 条件要和 inkMatchExpression 合并
            const linkMatchExpression = attributeInfo.getMatchExpression()
            const linkMatchExp = new MatchExp(linkInfo.name, this.map, linkMatchExpression)
            // FIXME 还要不要递归地处理有多个 filtered relation 的情况？linkMatchExp 里面也有可能存在 filtered relation。
            const rebasedMatchExp = linkMatchExp.rebase(linkInfo.isFromSource ? 'source' : 'target')

            return baseMatchExpAtom.and(rebasedMatchExp.data)
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

    getFinalFieldValue(isReferenceValue: boolean, key: string, value: [string, any], fieldName:string, fieldType: string|undefined, p: PlaceholderGen, db?: Database): [string, any[]] {
        let fieldValue =''
        let fieldParams:any[] = []
        const simpleOp = ['=', '>', '<', '<=', '>=', 'like', '!=']

        if (simpleOp.includes(value[0]) || (value[0] === 'not' && value[1] !== null)) {
            fieldValue = `${value[0]} ${p()}`
            fieldParams = [isReferenceValue ? this.getReferenceFieldValue(value[1]) : value[1]]
        } else if((value[0] === 'not' && value[1] === null)) {
            fieldValue = `IS NOT NULL`
        } else if (value[0].toLowerCase() === 'in') {
            assert(!isReferenceValue, 'reference value cannot use IN to match')
            fieldValue = `IN (${value[1].map((x: any) => p()).join(',')})`
            fieldParams = value[1]
        } else if (value[0].toLowerCase() === 'between') {
            fieldValue = `BETWEEN ${p()} AND ${p()}`
            fieldParams = [
                isReferenceValue ? this.getReferenceFieldValue(value[1][0]) : value[1][0],
                isReferenceValue ? this.getReferenceFieldValue(value[1][1]) : value[1][1]
            ]
        } else {
            let result
            if (db) {
                // JSON 操作符写法等由外部具体 db 实现
                // FIXME 如果外部不知 value 的具体格式，又怎么知道这是一个 referenceValue ？？？这里要重新设计
                result = db.parseMatchExpression?.(key, value, fieldName, fieldType!, isReferenceValue, this.getReferenceFieldValue.bind(this), p)
            }

            if (result) {
                fieldValue = result.fieldValue
                fieldParams = result.fieldParams || []
            } else{
                assert(result, `unknown value expression ${JSON.stringify(value)}`)

            }

        }

        return [fieldValue, fieldParams!]
    }

    buildFieldMatchExpression(p: PlaceholderGen, db?: Database): BoolExp<FieldMatchAtom> | null {
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

                const fieldNamePath = this.getFinalFieldName(matchAttributePath)
                const [fieldValue, fieldParams] = this.getFinalFieldValue(exp.data.isReferenceValue!, exp.data.key,  exp.data.value, fieldNamePath.join('.'), attributeInfo.fieldType, p, db)

                if (!symmetricPaths) {
                    return {
                        ...exp.data,
                        fieldName: fieldNamePath,
                        fieldValue,
                        fieldParams
                    }
                }

                // 这里一定要再生成一次，应为需要不同的 placeholder。
                const [fieldValue2, fieldParams2] = this.getFinalFieldValue(exp.data.isReferenceValue!, exp.data.key,  exp.data.value, fieldNamePath.join('.'), attributeInfo.fieldType, p, db)

                // CAUTION 注意这里 length -2 是因为  namePath 里面有 this.entityName
                return BoolExp.atom<FieldMatchAtom>({
                    ...exp.data,
                    fieldName: this.getFinalFieldName(sourcePath!),
                    fieldValue,
                    fieldParams
                }).or({
                    ...exp.data,
                    fieldName: this.getFinalFieldName(targetPath!),
                    fieldValue: fieldValue2,
                    fieldParams: fieldParams2
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

    rebase(attributeName: string) {
        // 验证属性是否存在且是实体关联
        const attributeInfo = this.map.getInfo(this.entityName, attributeName);
        assert(attributeInfo.isRecord, `attribute ${attributeName} is not an entity relation`);

        
        const targetEntityName = attributeInfo.recordName;
        const reverseAttribute = this.map.getReverseAttribute(this.entityName, attributeName);
        
        // 统一的路径转换函数
        const transformData = (data: MatchExpressionData | undefined): MatchExpressionData | undefined => {
            if (!data) return undefined;
            
            if (data.isExpression()) {
                const left = transformData(data.left);
                const right = transformData(data.right);
                
                if (!left && !right) return undefined;
                if (!left) return right;
                if (!right) return left;
                
                const operator = (data.raw as any).operator;
                if (operator === 'and') {
                    return left.and(right);
                } else if (operator === 'or') {
                    return left.or(right);
                } else if (operator === 'not') {
                    return left.not();
                }
            } else if (data.isAtom()) {
                const atom = data.data as MatchAtom;
                const keyParts = atom.key.split('.');
                
                // 路径缩短：如果条件以目标属性开头，移除前缀
                if (keyParts[0] === attributeName) {
                    const newKey = keyParts.slice(1).join('.');
                    return BoolExp.atom<MatchAtom>({
                        key: newKey,
                        value: atom.value,
                        isReferenceValue: atom.isReferenceValue
                    });
                }
                
                // 路径增长：为所有其他条件添加反向属性前缀
                const newKey = this.map.getShrinkedAttribute(targetEntityName, `${reverseAttribute}.${atom.key}`)
                return BoolExp.atom<MatchAtom>({
                    key: newKey,
                    value: atom.value,
                    isReferenceValue: atom.isReferenceValue
                });
            }
            
            return undefined;
        };
        
        const transformedData = this.data ? transformData(this.data) : undefined;
        return new MatchExp(targetEntityName, this.map, transformedData, this.contextRootEntity, this.fromRelation);
    }
}