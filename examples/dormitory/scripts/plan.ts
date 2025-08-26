#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';

// 定义类型
interface PropertyComputation {
  propertyName: string;
  computationDecision: string;
  dependencies?: string[];
  interactionDependencies?: string[];
  reasoning?: string;
  calculationMethod?: string;
}

interface EntityAnalysis {
  purpose: string;
  lifecycle: {
    creation: {
      type: string;
      parent: string | null;
      creationInteractions: string[];
    };
    deletion?: {
      canBeDeleted: boolean;
      deletionType: string;
      deletionInteractions?: string[];
    };
  };
  computationDecision?: string;
  reasoning?: string;
  calculationMethod?: string;
}

interface Entity {
  name: string;
  entityAnalysis: EntityAnalysis;
  propertyAnalysis: PropertyComputation[];
}

interface RelationAnalysis {
  purpose: string;
  lifecycle: {
    creation: {
      type: string;
      parent: string | null;
      creationInteractions: string[];
    };
    deletion?: {
      canBeDeleted: boolean;
      deletionType: string;
      deletionInteractions?: string[];
    };
  };
  computationDecision?: string;
  reasoning?: string;
  calculationMethod?: string;
}

interface Relation {
  name: string;
  relationAnalysis: RelationAnalysis;
  propertyAnalysis?: PropertyComputation[];
}

interface Dictionary {
  name: string;
  computation?: {
    type: string;
    dependencies?: string[];
    interactionDependencies?: string[];
  };
}

interface ComputationAnalysis {
  entities: Entity[];
  relations: Relation[];
  dictionaries: Dictionary[];
}

interface ComputationNode {
  id: string;
  type: 'entity' | 'property' | 'relation' | 'dictionary';
  entityName?: string;
  propertyName?: string;
  relationName?: string;
  dictionaryName?: string;
  computationType: string;
  dependencies: string[];  // 原始的直接计算依赖
  expandedDependencies: string[];  // 展开后的所有依赖（包括实体创建依赖）
  interactionDependencies?: string[];
  reasoning?: string;
  calculationMethod?: string;
  completed: boolean;
}

interface ImplementationPlan {
  totalComputations: number;
  implementationOrder: {
    phase: number;
    computations: ComputationNode[];
    description: string;
  }[];
}

// 创建计算节点的唯一ID（不带类型前缀）
function createComputationId(type: string, entityName?: string, propertyName?: string, relationName?: string, dictionaryName?: string): string {
  switch (type) {
    case 'entity':
      return entityName!;
    case 'property':
      return `${entityName}.${propertyName}`;
    case 'relation':
      return relationName!;
    case 'dictionary':
      return dictionaryName!;
    default:
      throw new Error(`Unknown computation type: ${type}`);
  }
}

// 解析依赖项，直接返回原始依赖名称（不添加类型前缀）
function parseDependency(dep: string): string {
  // 直接返回原始依赖名称，不添加任何前缀
  return dep;
}

// 检查是否是交互依赖
function isInteractionDependency(dep: string): boolean {
  return dep.includes('Interaction') || 
    ['CreateUser', 'CreateDormitory', 'DeductPoints', 'RequestEviction', 
     'AssignUserToDormitory', 'AssignUserToBed', 'RemoveFromDormitory', 
     'ApproveEviction', 'RejectEviction', 'UpdateUser', 'UpdateUserRole',
     'UpdateDormitory'].includes(dep);
}

// 检查是否是系统依赖
function isSystemDependency(dep: string): boolean {
  return dep === 'InteractionEventEntity';
}

// 根据依赖名称查找对应的节点ID
function findNodeIdByDependency(dep: string, nodes: ComputationNode[]): string | undefined {
  // 如果包含点号，可能是关系或实体的属性引用
  if (dep.includes('.')) {
    const parts = dep.split('.');
    if (parts.length === 2) {
      // 如果是 Relation.property 格式，先尝试找关系节点
      if (parts[0].includes('Relation')) {
        // 尝试找关系节点本身（去掉 .property 部分）
        if (nodes.some(n => n.id === parts[0])) {
          return parts[0];
        }
      }
      // 尝试作为完整的属性ID (Entity.property)
      if (nodes.some(n => n.id === dep)) {
        return dep;
      }
    }
  }
  
  // 直接查找匹配的节点
  if (nodes.some(n => n.id === dep)) {
    return dep;
  }
  
  return undefined;
}

// 构建计算节点和依赖图
function buildComputationGraph(analysis: ComputationAnalysis, dataDesign?: any): { nodes: ComputationNode[], edges: { from: string; to: string }[] } {
  const nodes: ComputationNode[] = [];
  const edges: { from: string; to: string }[] = [];
  
  // Step 1: 创建所有实体节点（无论有没有 computation，只要有 dependencies 或有 property 依赖它）
  for (const entity of analysis.entities) {
    const interactionDeps = entity.entityAnalysis?.lifecycle?.creation?.creationInteractions || [];
    const hasDependencies = interactionDeps.length > 0;
    const hasComputation = entity.entityAnalysis?.computationDecision && entity.entityAnalysis.computationDecision !== 'None';
    const hasComputedProperties = entity.propertyAnalysis.some(p => 
      p.computationDecision && p.computationDecision !== 'None' && p.computationDecision !== '_owner'
    );
    
    // 如果实体有依赖、有计算、或有需要计算的属性，就创建节点
    if (hasDependencies || hasComputation || hasComputedProperties) {
      const nodeId = createComputationId('entity', entity.name);
      // 实体级别的 dependencies 通常为空，因为实体创建主要依赖于 interactions
      const deps: string[] = [];
      const parsedDeps = deps.map(parseDependency);
      
      nodes.push({
        id: nodeId,
        type: 'entity',
        entityName: entity.name,
        computationType: entity.entityAnalysis?.computationDecision || 'Creation',
        dependencies: parsedDeps,  // 保持原始依赖
        expandedDependencies: parsedDeps,  // 实体节点的展开依赖与原始依赖相同
        interactionDependencies: interactionDeps,
        reasoning: entity.entityAnalysis?.reasoning || 'Entity creation/setup',
        calculationMethod: entity.entityAnalysis?.calculationMethod || 'Entity must exist before its properties',
        completed: false
      });
    }
  }
  
  // Step 2: 创建所有关系节点（同样的逻辑）
  for (const relation of analysis.relations) {
    const interactionDeps = relation.relationAnalysis?.lifecycle?.creation?.creationInteractions || [];
    const hasDependencies = interactionDeps.length > 0;
    const hasComputation = relation.relationAnalysis?.computationDecision && relation.relationAnalysis.computationDecision !== 'None';
    
    // 如果关系有依赖或有计算，就创建节点
    if (hasDependencies || hasComputation) {
      const nodeId = createComputationId('relation', undefined, undefined, relation.name);
      // 关系级别的 dependencies 通常为空，因为关系创建主要依赖于 interactions
      const deps: string[] = [];
      const parsedDeps = deps.map(parseDependency);
      
      // 构建展开的依赖，包括 source 和 target 实体
      const expandedDeps = [...parsedDeps];
      
      // 从 dataDesign 中查找 relation 的 source 和 target 实体
      if (dataDesign && dataDesign.relations && dataDesign.relations[relation.name]) {
        const relationDesign = dataDesign.relations[relation.name];
        
        // 添加 sourceEntity 到展开依赖（如果不在原始依赖中）
        if (relationDesign.sourceEntity && !expandedDeps.includes(relationDesign.sourceEntity)) {
          expandedDeps.push(relationDesign.sourceEntity);
        }
        
        // 添加 targetEntity 到展开依赖（如果不在原始依赖中）
        if (relationDesign.targetEntity && !expandedDeps.includes(relationDesign.targetEntity)) {
          expandedDeps.push(relationDesign.targetEntity);
        }
      }
      
      nodes.push({
        id: nodeId,
        type: 'relation',
        relationName: relation.name,
        computationType: relation.relationAnalysis?.computationDecision || 'Creation',
        dependencies: parsedDeps,  // 保持原始依赖
        expandedDependencies: expandedDeps,  // 包含 source/target 的展开依赖
        interactionDependencies: interactionDeps,
        reasoning: relation.relationAnalysis?.reasoning || 'Relation creation/setup',
        calculationMethod: relation.relationAnalysis?.calculationMethod || 'Relation must exist',
        completed: false
      });
    }
  }
  
  // Step 3: 创建所有属性计算节点
  for (const entity of analysis.entities) {
    for (const prop of entity.propertyAnalysis) {
      if (prop.computationDecision && prop.computationDecision !== 'None') {
        const nodeId = createComputationId('property', entity.name, prop.propertyName);
        const deps = prop.dependencies || [];
        
        // 处理 _self. 前缀的依赖，转换为实际的属性引用
        const parsedDeps = deps.map(dep => {
          if (dep.startsWith('_self.')) {
            // 将 _self.propertyName 转换为 EntityName.propertyName
            const propertyName = dep.substring(6); // 移除 '_self.' 前缀
            return `${entity.name}.${propertyName}`;
          }
          return parseDependency(dep);
        });
        
        // 构建展开的依赖
        const expandedDeps: string[] = [];
        
        // 1. 属性必须依赖于其所在的实体
        expandedDeps.push(entity.name);
        
        // 2. 添加处理后的依赖
        for (const dep of parsedDeps) {
          if (!expandedDeps.includes(dep)) {
            expandedDeps.push(dep);
          }
          
          // 3. 如果依赖 Entity.property，也要依赖 Entity
          if (dep.includes('.')) {
            const entityOrRelationName = dep.split('.')[0];
            if (!expandedDeps.includes(entityOrRelationName)) {
              expandedDeps.push(entityOrRelationName);
            }
          }
        }
        
        nodes.push({
          id: nodeId,
          type: 'property',
          entityName: entity.name,
          propertyName: prop.propertyName,
          computationType: prop.computationDecision,
          dependencies: deps,  // 保持原始的依赖（带 _self. 前缀）
          expandedDependencies: expandedDeps,  // 展开的所有依赖（_self. 已转换）
          interactionDependencies: prop.interactionDependencies,
          reasoning: prop.reasoning,
          calculationMethod: prop.calculationMethod,
          completed: false
        });
      }
    }
  }
  
  // Step 4: 处理字典级别的计算
  for (const dict of analysis.dictionaries) {
    if (dict.computation && dict.computation.type !== 'None') {
      const nodeId = createComputationId('dictionary', undefined, undefined, undefined, dict.name);
      const deps = dict.computation.dependencies || [];
      const parsedDeps = deps.map(parseDependency);
      
      // 构建展开的依赖
      const expandedDeps: string[] = [];
      for (const dep of parsedDeps) {
        expandedDeps.push(dep);
        
        // 如果依赖 Entity.property，也要依赖 Entity
        if (dep.includes('.')) {
          const entityOrRelationName = dep.split('.')[0];
          if (!expandedDeps.includes(entityOrRelationName)) {
            expandedDeps.push(entityOrRelationName);
          }
        }
      }
      
      nodes.push({
        id: nodeId,
        type: 'dictionary',
        dictionaryName: dict.name,
        computationType: dict.computation.type,
        dependencies: parsedDeps,  // 保持原始的计算依赖
        expandedDependencies: expandedDeps,  // 展开的所有依赖
        interactionDependencies: dict.computation.interactionDependencies,
        reasoning: '',
        calculationMethod: '',
        completed: false
      });
    }
  }
  
  // Step 5: 构建边（依赖关系）- 使用 expandedDependencies 构建完整的依赖图
  for (const node of nodes) {
    for (const dep of node.expandedDependencies) {
      // 检查是否是交互或系统依赖
      const isInteractionOrSystem = isInteractionDependency(dep) || isSystemDependency(dep);
      
      if (!isInteractionOrSystem) {
        // 尝试找到依赖对应的节点ID
        const fromNodeId = findNodeIdByDependency(dep, nodes);
        if (fromNodeId) {
          // 避免重复边
          if (!edges.some(e => e.from === fromNodeId && e.to === node.id)) {
            edges.push({ from: fromNodeId, to: node.id });
          }
        }
      }
    }
  }
  
  return { nodes, edges };
}

// 拓扑排序
function topologicalSort(nodes: ComputationNode[], edges: { from: string; to: string }[]): ComputationNode[][] {
  // 创建邻接表和入度表
  const adjacencyList: Map<string, string[]> = new Map();
  const inDegree: Map<string, number> = new Map();
  
  // 初始化
  for (const node of nodes) {
    adjacencyList.set(node.id, []);
    inDegree.set(node.id, 0);
  }
  
  // 构建邻接表和入度表
  for (const edge of edges) {
    // 只处理存在的节点之间的边
    if (inDegree.has(edge.to)) {
      const fromList = adjacencyList.get(edge.from) || [];
      fromList.push(edge.to);
      adjacencyList.set(edge.from, fromList);
      
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    }
  }
  
  // 分层处理
  const levels: ComputationNode[][] = [];
  const visited = new Set<string>();
  
  while (visited.size < nodes.length) {
    // 找出当前层（入度为0的节点）
    const currentLevel: ComputationNode[] = [];
    
    for (const node of nodes) {
      if (!visited.has(node.id) && inDegree.get(node.id) === 0) {
        currentLevel.push(node);
        visited.add(node.id);
      }
    }
    
    if (currentLevel.length === 0 && visited.size < nodes.length) {
      // 找出未处理的节点（可能依赖于不存在的计算节点）
      const remaining = nodes.filter(n => !visited.has(n.id));
      console.log('\nNote: Some computations depend on non-computed properties/relations:');
      for (const node of remaining) {
        // 检查展开依赖中缺失的节点
        const missingExpandedDeps = node.expandedDependencies.filter(d => 
          !isInteractionDependency(d) && 
          !isSystemDependency(d) && 
          !nodes.some(n => n.id === d)
        );
        
        // 但显示原始依赖，这样更清晰
        const missingOriginalDeps = node.dependencies.filter(d => 
          !isInteractionDependency(d) && 
          !isSystemDependency(d) && 
          !nodes.some(n => n.id === d)
        );
        
        if (missingExpandedDeps.length > 0) {
          console.log(`  - ${node.id} has missing dependencies in graph: ${missingExpandedDeps.join(', ')}`);
          if (missingOriginalDeps.length > 0) {
            console.log(`    (original computation dependencies: ${missingOriginalDeps.join(', ')})`);
          }
        }
      }
      currentLevel.push(...remaining);
      remaining.forEach(n => visited.add(n.id));
    }
    
    if (currentLevel.length > 0) {
      levels.push(currentLevel);
      
      // 更新入度
      for (const node of currentLevel) {
        const neighbors = adjacencyList.get(node.id) || [];
        for (const neighbor of neighbors) {
          inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
        }
      }
    }
  }
  
  return levels;
}

// 生成实现计划
function generateImplementationPlan(levels: ComputationNode[][], totalNodes: number): ImplementationPlan {
  const phases = levels.map((level, index) => {
    // 按类型分组
    const entityComputations = level.filter(n => n.type === 'entity');
    const propertyComputations = level.filter(n => n.type === 'property');
    const relationComputations = level.filter(n => n.type === 'relation');
    const dictionaryComputations = level.filter(n => n.type === 'dictionary');
    
    let description = `Phase ${index + 1}: `;
    const parts: string[] = [];
    
    if (entityComputations.length > 0) {
      parts.push(`${entityComputations.length} entity computation(s)`);
    }
    if (propertyComputations.length > 0) {
      parts.push(`${propertyComputations.length} property computation(s)`);
    }
    if (relationComputations.length > 0) {
      parts.push(`${relationComputations.length} relation computation(s)`);
    }
    if (dictionaryComputations.length > 0) {
      parts.push(`${dictionaryComputations.length} dictionary computation(s)`);
    }
    
    description += parts.join(', ');
    
    return {
      phase: index + 1,
      computations: level,
      description
    };
  });
  
  return {
    totalComputations: totalNodes,
    implementationOrder: phases
  };
}

// 主函数
function main() {
  try {
    // 读取输入文件
    const inputPath = path.join(process.cwd(), 'docs', 'computation-analysis.json');
    const dataDesignPath = path.join(process.cwd(), 'docs', 'data-design.json');
    const outputPath = path.join(process.cwd(), 'docs', 'computation-implementation-plan.json');
    
    if (!fs.existsSync(inputPath)) {
      console.error(`Error: Input file not found at ${inputPath}`);
      process.exit(1);
    }
    
    if (!fs.existsSync(dataDesignPath)) {
      console.error(`Error: Data design file not found at ${dataDesignPath}`);
      process.exit(1);
    }
    
    const analysisData = JSON.parse(fs.readFileSync(inputPath, 'utf-8')) as ComputationAnalysis;
    const dataDesignData = JSON.parse(fs.readFileSync(dataDesignPath, 'utf-8'));
    
    // 构建计算图
    const { nodes, edges } = buildComputationGraph(analysisData, dataDesignData);
    
    console.log(`Found ${nodes.length} computations to analyze`);
    console.log(`Found ${edges.length} dependency edges`);
    
    // 拓扑排序
    const levels = topologicalSort(nodes, edges);
    
    console.log(`Organized into ${levels.length} implementation phases`);
    
    // 生成实现计划
    const plan = generateImplementationPlan(levels, nodes.length);
    
    // 输出结果
    fs.writeFileSync(outputPath, JSON.stringify(plan, null, 2));
    
    console.log(`\n✅ Implementation plan generated successfully!`);
    console.log(`📄 Output written to: ${outputPath}`);
    
    console.log(`\n📊 Total computations: ${plan.totalComputations}`);
    
    console.log(`\n📋 Implementation Phases:`);
    for (const phase of plan.implementationOrder) {
      console.log(`\n  ${phase.description}`);
      console.log(`  Computations:`);
      for (const comp of phase.computations) {
        let name = '';
        if (comp.type === 'entity') {
          name = `Entity: ${comp.entityName}`;
        } else if (comp.type === 'property') {
          name = `Property: ${comp.entityName}.${comp.propertyName}`;
        } else if (comp.type === 'relation') {
          name = `Relation: ${comp.relationName}`;
        } else if (comp.type === 'dictionary') {
          name = `Dictionary: ${comp.dictionaryName}`;
        }
        console.log(`    - ${name} (${comp.computationType}) [completed: ${comp.completed}]`);
      }
    }
    
  } catch (error) {
    console.error('Error generating implementation plan:', error);
    process.exit(1);
  }
}

// 运行主函数
main();
