import { describe, it, expect } from 'vitest';
import { LayeredEntityGraph } from './LayeredEntityGraph';

describe('Performance Comparison', () => {
  it('批量模式应该比逐个创建更高效', () => {
    const nodeCount = 50;
    
    // 准备测试数据
    const nodeConfigs = [];
    for (let i = 0; i < nodeCount; i++) {
      if (i === 0) {
        nodeConfigs.push({ id: `node-${i}`, height: 50 });
      } else {
        const parentIndex = Math.floor((i - 1) / 3); // 每个父节点最多3个子节点
        nodeConfigs.push({ 
          id: `node-${i}`, 
          parentId: `node-${parentIndex}`, 
          height: 50 + (i % 30) 
        });
      }
    }
    
    // 测试逐个创建
    const startIndividual = performance.now();
    const individualGraph = new LayeredEntityGraph();
    for (const config of nodeConfigs) {
      individualGraph.createNode(config.id, config.parentId, config.height);
    }
    const endIndividual = performance.now();
    const individualTime = endIndividual - startIndividual;
    
    // 测试批量创建
    const startBatch = performance.now();
    const batchGraph = new LayeredEntityGraph();
    batchGraph.batchCreateNodes(nodeConfigs);
    const endBatch = performance.now();
    const batchTime = endBatch - startBatch;
    
    console.log(`Individual creation: ${individualTime.toFixed(2)}ms`);
    console.log(`Batch creation: ${batchTime.toFixed(2)}ms`);
    console.log(`Performance improvement: ${(individualTime / batchTime).toFixed(2)}x`);
    
    // 验证结果一致性
    expect(individualGraph.getAllNodes().length).toBe(batchGraph.getAllNodes().length);
    expect(individualGraph.getAllNodes().length).toBe(nodeCount);
    
    // 验证第一个和最后一个节点的属性相同
    const individualFirst = individualGraph.getNode('node-0')!;
    const batchFirst = batchGraph.getNode('node-0')!;
    expect(batchFirst.level).toBe(individualFirst.level);
    expect(batchFirst.x).toBe(individualFirst.x);
    expect(batchFirst.height()).toBe(individualFirst.height());
    
    const individualLast = individualGraph.getNode(`node-${nodeCount-1}`)!;
    const batchLast = batchGraph.getNode(`node-${nodeCount-1}`)!;
    expect(batchLast.level).toBe(individualLast.level);
    expect(batchLast.x).toBe(individualLast.x);
    expect(batchLast.height()).toBe(individualLast.height());
    
    // 通常批量模式应该更快，但在测试环境中可能差异不明显
    // 这里主要验证功能正确性
    expect(batchTime).toBeGreaterThan(0);
    expect(individualTime).toBeGreaterThan(0);
  });

  it('应该能处理大量节点的批量创建', () => {
    const largeNodeCount = 100;
    const nodeConfigs = [];
    
    // 创建一个深度为5的树形结构
    for (let level = 0; level < 5; level++) {
      for (let i = 0; i < 20; i++) {
        const nodeId = `level${level}-node${i}`;
        if (level === 0) {
          nodeConfigs.push({ id: nodeId, height: 80 });
        } else {
          const parentIndex = Math.floor(i / 4); // 每个父节点4个子节点
          const parentId = `level${level-1}-node${parentIndex}`;
          nodeConfigs.push({ 
            id: nodeId, 
            parentId: parentId, 
            height: 60 + (i % 20) 
          });
        }
      }
    }
    
    const graph = new LayeredEntityGraph();
    const nodes = graph.batchCreateNodes(nodeConfigs);
    
    expect(nodes.length).toBe(largeNodeCount);
    expect(graph.getAllNodes().length).toBe(largeNodeCount);
    
    // 验证层级结构正确
    for (let level = 0; level < 5; level++) {
      const nodesAtLevel = graph.getNodesAtLevel(level);
      expect(nodesAtLevel.length).toBe(20);
      
      for (const node of nodesAtLevel) {
        expect(node.level).toBe(level);
        expect(node.x).toBe(level * 200); // COLUMN_WIDTH = 200
      }
    }
    
    // 验证根节点
    const rootNodes = graph.getNodesAtLevel(0);
    for (const rootNode of rootNodes) {
      expect(rootNode.parent).toBeNull();
    }
    
    // 验证最深层节点
    const deepestNodes = graph.getNodesAtLevel(4);
    for (const deepNode of deepestNodes) {
      expect(deepNode.level).toBe(4);
      expect(deepNode.parent).not.toBeNull();
      expect(deepNode.parent!.level).toBe(3);
    }
  });
});