import { ArchaeologicalUnit, StratigraphicRelation, GraphNode, GraphLink, RelationType, UnitType } from '../types';

/**
 * 传递规约 (Transitive Reduction)
 * 移除冗余的连线 (如果 A->B, B->C, A->C，则移除 A->C)
 */
const performTransitiveReduction = (
  nodes: string[],
  adj: Map<string, string[]>
): Map<string, string[]> => {
  const reducedAdj = new Map<string, string[]>();
  nodes.forEach(n => reducedAdj.set(n, [...(adj.get(n) || [])]));

  for (const i of nodes) {
    const children = reducedAdj.get(i) || [];
    for (const j of children) {
      const isRedundant = children.some(k => {
        if (k === j) return false;
        return isReachable(k, j, reducedAdj);
      });
      if (isRedundant) {
        const current = reducedAdj.get(i)!;
        reducedAdj.set(i, current.filter(c => c !== j));
      }
    }
  }
  return reducedAdj;
};

const isReachable = (start: string, end: string, adj: Map<string, string[]>): boolean => {
  if (start === end) return true;
  const stack = [start];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const curr = stack.pop()!;
    if (visited.has(curr)) continue;
    visited.add(curr);
    const neighbors = adj.get(curr) || [];
    if (neighbors.includes(end)) return true;
    for (const n of neighbors) {
      stack.push(n);
    }
  }
  return false;
};

// 解析地层编号，用于排序
// 规则：数字越大越深。数字相同，字母越靠后越深 (2b 在 2a 下面)。
const getLayerSortValue = (id: string): number => {
    const match = id.match(/^(\d+)([a-z]*)$/);
    if (!match) return 0;
    const num = parseInt(match[1], 10);
    const suffix = match[2];
    let suffixVal = 0;
    if (suffix) {
        suffixVal = suffix.charCodeAt(0) - 96; 
    }
    return num + (suffixVal / 100);
};

export const calculateLayout = (
  units: ArchaeologicalUnit[],
  relations: StratigraphicRelation[],
  width: number,
  height: number
): { nodes: GraphNode[]; links: GraphLink[]; layers: number } => {
  
  const nodeMap = new Map<string, GraphNode>();
  units.forEach(u => {
    nodeMap.set(u.id, { ...u, x: 0, y: 0, rank: 0 });
  });

  const rawAdj = new Map<string, string[]>();
  const reverseAdj = new Map<string, string[]>(); 

  // 1. 构建邻接表
  relations.forEach(r => {
    if (!nodeMap.has(r.sourceId) || !nodeMap.has(r.targetId)) return;
    if (!rawAdj.has(r.sourceId)) rawAdj.set(r.sourceId, []);
    if (!rawAdj.get(r.sourceId)!.includes(r.targetId)) {
        rawAdj.get(r.sourceId)!.push(r.targetId);
    }
  });

  // 添加隐式层位关系
  units.forEach(u => {
    if (u.openingLayerId && nodeMap.has(u.openingLayerId)) {
        if (!rawAdj.has(u.openingLayerId!)) rawAdj.set(u.openingLayerId!, []);
        if (!rawAdj.get(u.openingLayerId!)!.includes(u.id)) {
             rawAdj.get(u.openingLayerId!)!.push(u.id);
        }
    }
  });

  // 自动构建地层序列
  const allLayers = units
    .filter(u => u.type === UnitType.LAYER)
    .sort((a, b) => getLayerSortValue(a.id) - getLayerSortValue(b.id));

  for (let i = 0; i < allLayers.length - 1; i++) {
      const upper = allLayers[i].id;
      const lower = allLayers[i+1].id;
      if (!rawAdj.has(upper)) rawAdj.set(upper, []);
      if (!rawAdj.get(upper)!.includes(lower)) {
          rawAdj.get(upper)!.push(lower);
      }
  }

  // 2. 传递规约
  const allNodeIds = Array.from(nodeMap.keys());
  const adj = performTransitiveReduction(allNodeIds, rawAdj);

  // 3. Rank 计算
  allNodeIds.forEach(id => {
      const children = adj.get(id) || [];
      children.forEach(child => {
          if (!reverseAdj.has(child)) reverseAdj.set(child, []);
          reverseAdj.get(child)!.push(id);
      });
  });

  // 简单的Rank计算，不做循环检测的复杂处理，假设输入相对合法
  const calcRank = (nodeId: string, memo: Map<string, number>, visited: Set<string>): number => {
      if (visited.has(nodeId)) return 0; // Break cycle simply
      if (memo.has(nodeId)) return memo.get(nodeId)!;
      
      visited.add(nodeId);
      const parents = reverseAdj.get(nodeId) || [];
      if (parents.length === 0) {
          memo.set(nodeId, 0);
          visited.delete(nodeId);
          return 0;
      }
      
      let maxParentRank = 0;
      for (const p of parents) {
          maxParentRank = Math.max(maxParentRank, calcRank(p, memo, visited));
      }
      const r = maxParentRank + 1;
      memo.set(nodeId, r);
      visited.delete(nodeId);
      return r;
  };

  const memo = new Map<string, number>();
  units.forEach(u => {
      const r = calcRank(u.id, memo, new Set());
      nodeMap.get(u.id)!.rank = r;
  });

  // 4. 布局坐标计算
  const maxRank = Math.max(...Array.from(nodeMap.values()).map(n => n.rank || 0));
  const layers: GraphNode[][] = Array.from({ length: maxRank + 1 }, () => []);
  nodeMap.forEach(n => layers[n.rank || 0].push(n));

  const canvasCenterX = width / 2;
  const xSpacing = 140; // Horizontal spacing
  const layerHeight = 100; // Vertical spacing

  // 记录每一层被占用的X坐标，防止重叠
  // const occupiedX: Map<number, number[]> = new Map(); 

  layers.forEach((layerNodes, layerIndex) => {
      // 区分地层和遗迹
      const layerUnits = layerNodes
        .filter(n => n.type === UnitType.LAYER)
        .sort((a, b) => getLayerSortValue(a.id) - getLayerSortValue(b.id));

      const featureUnits = layerNodes
        .filter(n => n.type !== UnitType.LAYER)
        .sort((a, b) => a.id.localeCompare(b.id)); // 可以优化排序逻辑，比如根据父节点的X坐标

      // --- 规则1：地层永远在正中间 ---
      if (layerUnits.length > 0) {
          // 哪怕有多个地层在同一Rank（罕见），也挤在中间
          const totalW = (layerUnits.length - 1) * (xSpacing * 0.8);
          const startX = canvasCenterX - totalW / 2;
          layerUnits.forEach((u, i) => {
              u.x = startX + i * (xSpacing * 0.8);
          });
      }

      // --- 规则2：遗迹布局 ---
      if (featureUnits.length > 0) {
          // 如果该层没有地层占据中心，且只有一个遗迹，则直接居中
          // 这样可以形成直线
          if (layerUnits.length === 0 && featureUnits.length === 1) {
              // 尝试寻找它的父节点位置，如果只有一个父节点，优先对齐父节点
              const parents = reverseAdj.get(featureUnits[0].id) || [];
              if (parents.length === 1) {
                   const parentNode = nodeMap.get(parents[0]);
                   featureUnits[0].x = parentNode ? parentNode.x : canvasCenterX;
              } else {
                   featureUnits[0].x = canvasCenterX;
              }
          } else {
              // 分布在两侧
              // 需要避让地层占据的区域
              const centerOccupiedWidth = layerUnits.length > 0 ? (layerUnits.length * 60 + 80) : 0;
              const gap = Math.max(xSpacing * 0.6, centerOccupiedWidth / 2 + xSpacing * 0.5);

              const leftSide: GraphNode[] = [];
              const rightSide: GraphNode[] = [];
              
              featureUnits.forEach((u, i) => {
                  if (i % 2 === 0) rightSide.push(u);
                  else leftSide.push(u);
              });
              
              // 简单的左右交替分布，实际可以优化为“尽可能靠近父节点”
              leftSide.forEach((u, i) => {
                  u.x = canvasCenterX - gap - (i * xSpacing);
              });
              
              rightSide.forEach((u, i) => {
                  u.x = canvasCenterX + gap + (i * xSpacing);
              });
          }
      }

      // Y Position
      layerNodes.forEach(node => {
          node.y = 50 + layerIndex * layerHeight;
      });
  });

  // 5. 生成连线
  const graphLinks: GraphLink[] = [];
  adj.forEach((targets, sourceId) => {
      const source = nodeMap.get(sourceId);
      if (!source) return;
      
      targets.forEach(targetId => {
          const target = nodeMap.get(targetId);
          if (target) {
              let type = RelationType.CUTS;
              // 修正关系类型判断，地层到遗迹通常是 Overlay (开口于下)
              if (source.type === UnitType.LAYER && target.type !== UnitType.LAYER) {
                  type = RelationType.OVERLAYS; 
              } else if (source.type === UnitType.LAYER && target.type === UnitType.LAYER) {
                  type = RelationType.OVERLAYS;
              } else {
                  // 遗迹之间默认 CUTS (晚打破早)
                  type = RelationType.CUTS;
              }
              graphLinks.push({ source, target, type });
          }
      });
  });

  return { nodes: Array.from(nodeMap.values()), links: graphLinks, layers: maxRank + 1 };
};