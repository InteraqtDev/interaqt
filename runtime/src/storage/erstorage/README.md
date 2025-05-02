# 表结构和 map 的生成

map 基本结构：

```ts
[fieldName]: {
    target: {
        table,
        column  // 如果还是复合结构，就没有 column
    },
    fields: [], // 复合结构的话
    map: {},   // 复合结构的话
    useRef: bool  // 如果是 ref，那么 source 表中会记录 id
    lazy: bool  // 如果是 lazy，那么 target 表中会记录 entity id。
}
```

Field Table 的名字: `${entityName}_${fieldName}`

由于把 Composite Field 也使用了 `entity` 的方法来处理，所以会得到 `tables` 和 `map`:
可能的 table name: Page_url // 和上面一样
如果 url 还有 `extract` ，那么会继续得到: Page_url_path

针对当前的 field 进行 parse

1. 当前 field 是个 Composite Field。它的结构: compositeField.fields。
2. 它的真实存储地址：

   2.1. 如果 `field` 标记为 `useRef` 或者 `lazy`，那么它在 Field Table 里，名字：`${entityName}_${fieldName}`，信息记录在对应的 `fieldMapValue` 里面。有 `target.table`、 `fields`、`map`。

   2.2 如果没有标记为 `useRef` 或者 `lazy`，那么它就在当前表里。信息记录在对应的 `fieldMapValue` 里面。有 `target.table` 、`fields` 、`map`
