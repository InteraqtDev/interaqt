import {MatchExp, MatchExpressionData} from "./MatchExp.js";
import {AttributeQuery, AttributeQueryData} from "./AttributeQuery.js";
import {Modifier, ModifierData} from "./Modifier.js";
import {EntityToTableMap} from "./EntityToTableMap.js";
import {AttributeInfo} from "./AttributeInfo.js";
import {assert} from "../utils.js";
import {RecursiveContext} from "./RecordQueryAgent.js";

export type RecordQueryData = {
    matchExpression?: MatchExpressionData,
    attributeQuery?: AttributeQueryData,
    modifier?: ModifierData,
    label?: string,
    goto?: string
    exit? : (data:RecursiveContext) => Promise<any>
}


export class RecordQuery {
    static create(
        recordName: string,
        map: EntityToTableMap,
        data: RecordQueryData,
        contextRootEntity?: string,
        parentRecord?:string,
        attributeName?:string,
        onlyRelationData?: boolean,
        allowNull = false,
        alias?: string
    ) {
        const recordInfo = map.getRecordInfo(recordName)
        const isFiltered = recordInfo.isFilteredEntity || recordInfo.isFilteredRelation
        
        // 使用预计算的值
        let baseRecordName = recordName;
        if (isFiltered ) {
            baseRecordName = recordInfo.data.resolvedBaseRecordName!;
        } 

        
        // CAUTION 因为合表后可能用关联数据匹配到行。
        const inputMatch = new MatchExp(baseRecordName, map, data.matchExpression, contextRootEntity)
        let matchExpression = allowNull ? inputMatch: inputMatch.and({
            key: 'id',
            value: ['not', null]
        })

        // 使用预计算的合并后的 matchExpression
        let resolvedMatchExpression = matchExpression;
        if (isFiltered) {
            resolvedMatchExpression = matchExpression.and(new MatchExp(baseRecordName, map, recordInfo.data.resolvedMatchExpression));
        }

        return new RecordQuery(
            baseRecordName,
            map,
            resolvedMatchExpression,
            new AttributeQuery(baseRecordName, map, data.attributeQuery || [], parentRecord, attributeName),
            new Modifier(baseRecordName, map, data.modifier!),
            contextRootEntity,
            parentRecord,
            attributeName,
            onlyRelationData,
            allowNull,
            data.label,
            data.goto,
            data.exit,
            alias
        )
    }

    constructor(
        public recordName: string,
        public map: EntityToTableMap,
        public matchExpression: MatchExp,
        public attributeQuery: AttributeQuery,
        public modifier: Modifier,
        public contextRootEntity?: string,
        public parentRecord?:string,
        public attributeName?:string,
        public onlyRelationData?:boolean,
        public allowNull = false,
        public label?: string,
        public goto?: string,
        public exit? : (context: RecursiveContext) => Promise<boolean>,
        // 返回时在父节点中的名字，这是针对使用 filtered relation 名称查询时需要的。
        public alias?: string
    ) {}
    getData(): RecordQueryData {
        return {
            matchExpression: this.matchExpression.data,
            attributeQuery: this.attributeQuery.data,
            modifier: this.modifier.data
        }
    }
    // CAUTION 特别注意这里的参数，不能让用取用原本的 matchExpression, attributeQuery, modifier 里面的 data 传进来。
    //   因为  data 不能代表一切配置，例如 attributeQuery 里面 还有个 shouldQueryParentLinkData 就是保存在 this 上的。
    derive({ matchExpression, attributeQuery, modifier } : { matchExpression?: MatchExp, attributeQuery?: AttributeQuery, modifier?: Modifier}) {
        return new RecordQuery(
            this.recordName,
            this.map,
matchExpression||this.matchExpression,
attributeQuery||this.attributeQuery,
     modifier||this.modifier,
            this.contextRootEntity,
            this.parentRecord,
            this.attributeName,
            this.onlyRelationData,
            this.allowNull,
            this.label,
            this.goto,
            this.exit
        )
    }
}


export class RecordQueryTree {
    public fields: string[] =[]
    public records: {[k:string]: RecordQueryTree}
    public info? :AttributeInfo
    // 父节点和自己这个几点 link 上的 query

    constructor(
        public recordName: string,
        public map: EntityToTableMap,
        public parentRecord?:string,
        public attributeName?: string,
        public data?: {fields: string[], records: {[k:string]: RecordQueryTree}},
        public parent?: RecordQueryTree,
        public parentLinkQueryTree? : RecordQueryTree
    ) {
        assert(!!recordName, 'recordName cannot be empty')
        this.fields = data?.fields || []
        this.records = data?.records || {}
        if (parentRecord) {
            this.info = this.map.getInfo(this.parentRecord!, this.attributeName!)
        }
    }

    addField(namePath:string[]) {
        const [name, ...rest] = namePath
        if (namePath.length === 1) {
            this.fields.push(name)
        } else if(name === LINK_SYMBOL){
            if (!this.parentLinkQueryTree) {
                this.parentLinkQueryTree = new RecordQueryTree(this.info!.linkName, this.map)
            }

            this.parentLinkQueryTree.addField(rest)
        } else {
            const info = this.map.getInfo(this.recordName, name)
            if (!this.records[name]) this.records[name] = new RecordQueryTree(info.recordName, this.map, this.recordName, name, undefined, this)
            this.records[name].addField(rest)
        }
    }
    addRecord(namePath: string[], subTree?: RecordQueryTree) {
        const [name, ...rest] = namePath
        if (namePath.length === 1) {
            if (name === LINK_SYMBOL) {
                if (!this.parentLinkQueryTree) {
                    this.parentLinkQueryTree = new RecordQueryTree(this.info!.linkName, this.map)
                }

                if (subTree) this.parentLinkQueryTree = this.parentLinkQueryTree.merge(subTree)
            } else {
                const info = this.map.getInfo(this.recordName, name)
                const newTree = subTree || new RecordQueryTree(info.recordName, this.map, this.recordName, name, undefined, this)
                this.records[name] = this.records[name] ? this.records[name].merge(newTree) : newTree
            }
        } else if(name === LINK_SYMBOL) {
            if (!this.parentLinkQueryTree) {
                this.parentLinkQueryTree = new RecordQueryTree(this.info!.linkName, this.map)
            }
            this.parentLinkQueryTree.addRecord(rest, subTree)
        } else {
            const info = this.map.getInfo(this.recordName, name)
            this.records[name] = new RecordQueryTree(info.recordName, this.map, this.recordName, name, undefined, this)
            this.records[name].addRecord(rest, subTree)
        }
    }
    forEachRecords(handle: (t:RecordQueryTree) => any) {
        Object.values(this.records).forEach(r => handle(r))
    }
    onlyIdField() {
        return this.fields.length === 1 && this.fields[0] === 'id' && !Object.keys(this.records).length
    }
    merge(otherTree: RecordQueryTree): RecordQueryTree {
        // 合并两个 tree，返回一个新的 tree
        const fields = Array.from(new Set([...this.fields, ...otherTree.fields]))
        // 合并 records
        const keys = Array.from(new Set([...Object.keys(this.records), ...Object.keys(otherTree.records)]))
        const records: Record<string, RecordQueryTree> = {}

        keys.forEach(key => {
            if (this.records[key] && otherTree.records[key]) {
                records[key] = this.records[key].merge(otherTree.records[key])
            } else if (this.records[key]) {
                records[key] = this.records[key]
            } else {
                records[key] = otherTree.records[key]
            }
        })

        let parentLinkQueryTree
        if (this.parentLinkQueryTree && otherTree.parentLinkQueryTree) {
            parentLinkQueryTree = this.parentLinkQueryTree.merge(otherTree.parentLinkQueryTree)
        } else {
            parentLinkQueryTree = this.parentLinkQueryTree || otherTree.parentLinkQueryTree
        }

        return new RecordQueryTree(this.recordName, this.map, this.parentRecord, this.attributeName, { fields, records }, this.parent, parentLinkQueryTree)
    }
    getData() {
        const result: {[k:string]: any} = {
            __fields: this.fields
        }


        this.forEachRecords(record => {
            result[record.attributeName!] = record.getData()
        })

        if (this.parentLinkQueryTree) {
            result[LINK_SYMBOL] = this.parentLinkQueryTree.getData()
        }
        return result
    }

}

export const LINK_SYMBOL = '&'
export const ALL_ATTR_SYMBOL = '*'

// export type RecordQueryTree = {
//     _fields?: string[],
//     [k: string]: RecordQueryTree
// }