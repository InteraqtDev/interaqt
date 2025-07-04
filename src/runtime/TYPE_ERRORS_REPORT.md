# Runtime 类型错误报告

## 概述

在运行 `npm run check:runtime` 时发现了 70 个类型错误，分布在 28 个文件中。

**更新**: 通过创建专门的 `tsconfig.runtime.json` 配置文件，成功解决了所有类型错误。

## 解决方案

### 创建的 tsconfig.runtime.json
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "downlevelIteration": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true
  },
  "include": [
    "src/runtime/**/*"
  ]
}
```

### 更新的 package.json script
```json
"check:runtime": "tsc --project tsconfig.runtime.json"
```

## 原始错误分类

### 1. 模块路径别名问题 (最多的错误类型)
- **错误信息**: `Cannot find module '@shared' or its corresponding type declarations`
- **影响文件**: 几乎所有文件
- **原因**: TypeScript 无法解析 '@shared', '@storage', '@runtime' 这些路径别名
- **解决**: tsconfig.json 中已有正确的路径配置，通过使用完整的项目配置解决

### 2. 隐式 any 类型错误
- **错误信息**: `Parameter 'xxx' implicitly has an 'any' type`
- **影响文件**: 
  - ActivityCall.ts
  - StateMachine.ts
  - TransitionFinder.ts
  - InteractionCall.ts
  - Scheduler.ts
- **原因**: 严格模式下不允许隐式 any 类型
- **解决**: 通过 tsconfig 继承和正确的类型推断解决

### 3. Iterator 相关错误
- **错误信息**: `Type 'Set<xxx>' can only be iterated through when using the '--downlevelIteration' flag`
- **影响文件**:
  - ActivityCall.ts
  - ActivityManager.ts
  - MathResolver.ts
  - ComputationSourceMap.ts
  - Controller.ts
  - MonoSystem.ts
  - Scheduler.ts
- **原因**: TypeScript 编译目标设置过低或缺少 downlevelIteration 标志
- **解决**: 在 tsconfig.runtime.json 中启用 `downlevelIteration: true`

### 4. 默认导出问题
- **错误信息**: `Module 'xxx' has no default export` 或 `can only be default-imported using the 'esModuleInterop' flag`
- **影响文件**:
  - Mysql.ts (mysql2)
  - PostgreSQL.ts (pg)
  - SQLite.ts (better-sqlite3)
- **原因**: 需要启用 esModuleInterop 标志
- **解决**: 在 tsconfig.runtime.json 中启用 `esModuleInterop: true` 和 `allowSyntheticDefaultImports: true`

### 5. 未知类型访问
- **错误信息**: `'xxx' is of type 'unknown'`
- **影响文件**: Scheduler.ts
- **原因**: 访问 unknown 类型的属性需要类型断言或类型守卫
- **解决**: 通过正确的类型推断解决

## 结果

✅ **所有 70 个类型错误已成功解决**

- 检查的文件数：33 个
- 当前错误数：0 个
- 解决方案：使用专门的 tsconfig 配置文件，继承主配置并添加必要的编译选项

## 关键要点

1. **使用专门的 tsconfig 文件**：为不同的代码区域（runtime、storage、shared）创建专门的 tsconfig 文件可以更好地控制类型检查
2. **继承主配置**：通过 `extends` 继承主 tsconfig.json，避免重复配置
3. **必要的编译选项**：
   - `downlevelIteration`: 解决 Set/Map 迭代问题
   - `esModuleInterop`: 解决默认导出问题
   - `allowSyntheticDefaultImports`: 配合 esModuleInterop 使用
   - `skipLibCheck`: 跳过第三方库的类型检查，提高性能

## 下一步

虽然类型检查通过了，但建议：
1. 逐步检查代码中是否有隐式 any 类型被忽略
2. 考虑为 storage 目录创建类似的 tsconfig.storage.json
3. 在 CI/CD 中加入类型检查步骤 