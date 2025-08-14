#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';

// 定义类型
interface PropertyComputation {
  propertyName: string;
  computationDecision: string;
  dependencies?: string[];
  reasoning?: string;
  calculationMethod?: string;
}

interface EntityComputation {
  type: string;
  source?: string;
  dependencies?: string[];
  reasoning?: string;
  calculationMethod?: string;
}

interface Entity {
  name: string;
  propertyAnalysis: PropertyComputation[];
  entityComputationDecision?: EntityComputation;
}

interface RelationComputation {
  computationDecision: string;
  dependencies?: string[];
  reasoning?: string;
  calculationMethod?: string;
}

interface Relation {
  name: string;
  relationAnalysis: RelationComputation;
}

interface Dictionary {
  name: string;
  computation?: {
    type: string;
    dependencies?: string[];
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
  dependencies: string[];
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
function buildComputationGraph(analysis: ComputationAnalysis): { nodes: ComputationNode[], edges: { from: string; to: string }[] } {
  const nodes: ComputationNode[] = [];
  const edges: { from: string; to: string }[] = [];
  
  // 处理实体级别的计算
  for (const entity of analysis.entities) {
    if (entity.entityComputationDecision && entity.entityComputationDecision.type !== 'None') {
      const nodeId = createComputationId('entity', entity.name);
      const deps = entity.entityComputationDecision.dependencies || [];
      const parsedDeps = deps.map(parseDependency);
      
      nodes.push({
        id: nodeId,
        type: 'entity',
        entityName: entity.name,
        computationType: entity.entityComputationDecision.type,
        dependencies: parsedDeps,
        reasoning: entity.entityComputationDecision.reasoning,
        calculationMethod: entity.entityComputationDecision.calculationMethod,
        completed: false
      });
    }
    
    // 处理属性级别的计算
    for (const prop of entity.propertyAnalysis) {
      if (prop.computationDecision && prop.computationDecision !== 'None') {
        const nodeId = createComputationId('property', entity.name, prop.propertyName);
        const deps = prop.dependencies || [];
        const parsedDeps = deps.map(parseDependency);
        
        nodes.push({
          id: nodeId,
          type: 'property',
          entityName: entity.name,
          propertyName: prop.propertyName,
          computationType: prop.computationDecision,
          dependencies: parsedDeps,
          reasoning: prop.reasoning,
          calculationMethod: prop.calculationMethod,
          completed: false
        });
      }
    }
  }
  
  // 处理关系级别的计算
  for (const relation of analysis.relations) {
    if (relation.relationAnalysis.computationDecision && relation.relationAnalysis.computationDecision !== 'None') {
      const nodeId = createComputationId('relation', undefined, undefined, relation.name);
      const deps = relation.relationAnalysis.dependencies || [];
      const parsedDeps = deps.map(parseDependency);
      
      nodes.push({
        id: nodeId,
        type: 'relation',
        relationName: relation.name,
        computationType: relation.relationAnalysis.computationDecision,
        dependencies: parsedDeps,
        reasoning: relation.relationAnalysis.reasoning,
        calculationMethod: relation.relationAnalysis.calculationMethod,
        completed: false
      });
    }
  }
  
  // 处理字典级别的计算
  for (const dict of analysis.dictionaries) {
    if (dict.computation && dict.computation.type !== 'None') {
      const nodeId = createComputationId('dictionary', undefined, undefined, undefined, dict.name);
      const deps = dict.computation.dependencies || [];
      const parsedDeps = deps.map(parseDependency);
      
      nodes.push({
        id: nodeId,
        type: 'dictionary',
        dictionaryName: dict.name,
        computationType: dict.computation.type,
        dependencies: parsedDeps,
        reasoning: '',
        calculationMethod: '',
        completed: false
      });
    }
  }
  
  // 在所有节点创建完成后，处理边
  for (const node of nodes) {
    for (const dep of node.dependencies) {
      // 检查是否是交互或系统依赖
      const isInteractionOrSystem = isInteractionDependency(dep) || isSystemDependency(dep);
      
      if (!isInteractionOrSystem) {
        // 尝试找到依赖对应的节点ID
        const fromNodeId = findNodeIdByDependency(dep, nodes);
        if (fromNodeId) {
          edges.push({ from: fromNodeId, to: node.id });
        } else {
          // 依赖不是计算节点（例如普通属性或没有计算的关系）
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
        const missingDeps = node.dependencies.filter(d => 
          !isInteractionDependency(d) && 
          !isSystemDependency(d) && 
          !nodes.some(n => n.id === d)
        );
        if (missingDeps.length > 0) {
          console.log(`  - ${node.id} depends on: ${missingDeps.join(', ')}`);
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
    const parts = [];
    
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
    const outputPath = path.join(process.cwd(), 'docs', 'computation-implemention-plan.json');
    
    if (!fs.existsSync(inputPath)) {
      console.error(`Error: Input file not found at ${inputPath}`);
      process.exit(1);
    }
    
    const analysisData = JSON.parse(fs.readFileSync(inputPath, 'utf-8')) as ComputationAnalysis;
    
    // 构建计算图
    const { nodes, edges } = buildComputationGraph(analysisData);
    
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
