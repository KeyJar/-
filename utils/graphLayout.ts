import { ArchaeologicalUnit, StratigraphicRelation, GraphNode, GraphLink, RelationType, UnitType } from '../types';

// --- Constants ---
const UNIT_WIDTH = 60;
const UNIT_HEIGHT = 28;
const LAYER_RADIUS = 18;
const X_SPACING = 90; // Horizontal gap between columns
const Y_SPACING = 80; // Vertical gap between ranks (Reduced slightly to keep compactness with extra ranks)
const BRIDGE_RADIUS = 6;
const DEFAULT_GAP = 20;

// --- Types ---
export type Side = 'top' | 'bottom' | 'left' | 'right';

export interface LinkPortConfig {
    sourceSide?: Side;
    targetSide?: Side;
}

// --- Helper: Transitive Reduction ---
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

const getLayerSortValue = (id: string): number => {
    const match = id.match(/^(\d+)([a-z]*)$/);
    if (!match) return 99999;
    const num = parseInt(match[1], 10);
    const suffix = match[2];
    let suffixVal = 0;
    if (suffix) {
        suffixVal = suffix.charCodeAt(0) - 96; 
    }
    return num * 100 + suffixVal;
};

// --- Part 1: Advanced Node Layout ---

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

  // 1. Build Adjacency & Implicit Relations
  const rawAdj = new Map<string, string[]>();
  const reverseAdj = new Map<string, string[]>(); 

  const addEdge = (u: string, v: string) => {
      if (!nodeMap.has(u) || !nodeMap.has(v)) return;
      if (!rawAdj.has(u)) rawAdj.set(u, []);
      if (!rawAdj.get(u)!.includes(v)) rawAdj.get(u)!.push(v);
      
      if (!reverseAdj.has(v)) reverseAdj.set(v, []);
      if (!reverseAdj.get(v)!.includes(u)) reverseAdj.get(v)!.push(u);
  };

  relations.forEach(r => addEdge(r.sourceId, r.targetId));

  // Implicit Layer Relations (Opening Layer -> Unit)
  units.forEach(u => {
    if (u.openingLayerId && nodeMap.has(u.openingLayerId)) {
        addEdge(u.openingLayerId, u.id);
    }
  });

  // Sequential Layers (1 -> 2 -> 3)
  const allLayers = units
    .filter(u => u.type === UnitType.LAYER)
    .sort((a, b) => getLayerSortValue(a.id) - getLayerSortValue(b.id));

  for (let i = 0; i < allLayers.length - 1; i++) {
      addEdge(allLayers[i].id, allLayers[i+1].id);
  }

  // 2. Transitive Reduction (simplify graph)
  const allNodeIds = Array.from(nodeMap.keys());
  const adj = performTransitiveReduction(allNodeIds, rawAdj);

  // Pre-calculation: Check if Layers have Feature children
  // This helps us decide if we need to expand the gap between layers
  const layerHasFeatures = new Map<string, boolean>();
  units.filter(u => u.type === UnitType.LAYER).forEach(layer => {
      const children = rawAdj.get(layer.id) || [];
      const hasFeature = children.some(cid => {
           const childNode = nodeMap.get(cid);
           return childNode && childNode.type !== UnitType.LAYER;
      });
      layerHasFeatures.set(layer.id, hasFeature);
  });

  // 3. Rank Assignment (Longest Path with Variable Edge Weights)
  const memo = new Map<string, number>();
  
  const getEdgeWeight = (parentId: string, childId: string): number => {
      const pNode = nodeMap.get(parentId);
      const cNode = nodeMap.get(childId);
      
      // If it's a Layer -> Layer connection (Stratigraphic Backbone)
      if (pNode?.type === UnitType.LAYER && cNode?.type === UnitType.LAYER) {
          // If the parent layer ALSO contains features (e.g., H1 under Layer 1),
          // we want to push Layer 2 down by 2 ranks instead of 1.
          // This creates a "visual band" for H1 to sit in between Layer 1 and Layer 2.
          if (layerHasFeatures.get(parentId)) {
              return 2;
          }
      }
      return 1;
  };

  const calcRank = (nodeId: string, visited: Set<string>): number => {
      if (visited.has(nodeId)) return 0; 
      if (memo.has(nodeId)) return memo.get(nodeId)!;
      visited.add(nodeId);
      
      const parents = [];
      adj.forEach((kids, pid) => {
          if (kids.includes(nodeId)) parents.push(pid);
      });

      if (parents.length === 0) {
          memo.set(nodeId, 0);
          visited.delete(nodeId);
          return 0;
      }
      
      let maxParentRank = 0;
      for (const p of parents) {
          const w = getEdgeWeight(p, nodeId);
          const pRank = calcRank(p, visited);
          maxParentRank = Math.max(maxParentRank, pRank + w);
      }
      
      memo.set(nodeId, maxParentRank);
      visited.delete(nodeId);
      return maxParentRank;
  };

  units.forEach(u => {
      nodeMap.get(u.id)!.rank = calcRank(u.id, new Set());
  });

  // 4. Coordinate Assignment
  const maxRank = Math.max(...Array.from(nodeMap.values()).map(n => n.rank || 0));
  const rankGroups: GraphNode[][] = Array.from({ length: maxRank + 1 }, () => []);
  nodeMap.forEach(n => rankGroups[n.rank || 0].push(n));

  const canvasCenterX = width / 2;
  const sideAssignment = new Map<string, 'left' | 'right' | 'center'>();

  // Initialize Layers to Center
  units.forEach(u => {
      if (u.type === UnitType.LAYER) sideAssignment.set(u.id, 'center');
  });

  // --- SPECIAL RULE: Single Child Centering ---
  units.filter(u => u.type === UnitType.LAYER).forEach(layer => {
      const children = adj.get(layer.id) || [];
      
      const featureChildren = children.filter(cid => {
          const childNode = nodeMap.get(cid);
          return childNode && childNode.type !== UnitType.LAYER;
      });

      const hasLayerChild = children.some(cid => nodeMap.get(cid)?.type === UnitType.LAYER);

      // Only center if it's a leaf node situation or effectively a chain end
      if (featureChildren.length === 1 && !hasLayerChild) {
          const childId = featureChildren[0];
          if (!sideAssignment.has(childId)) {
              sideAssignment.set(childId, 'center');
          }
      }
  });

  // Propagate Sides Top-Down for remaining nodes
  rankGroups.forEach(nodesInRank => {
      nodesInRank.forEach(n => {
          if (sideAssignment.has(n.id)) return; // Already assigned

          // Check parents
          let balance = 0; // Negative = Left, Positive = Right
          let parentCount = 0;
          
          const parents = [];
          adj.forEach((kids, pid) => {
              if (kids.includes(n.id)) parents.push(pid);
          });

          parents.forEach(pid => {
             const pSide = sideAssignment.get(pid);
             if (pSide === 'left') balance -= 1;
             else if (pSide === 'right') balance += 1;
             parentCount++;
          });

          if (balance < 0) sideAssignment.set(n.id, 'left');
          else if (balance > 0) sideAssignment.set(n.id, 'right');
          else {
              // Tied or all center parents.
              const currentLeft = nodesInRank.filter(node => sideAssignment.get(node.id) === 'left').length;
              const currentRight = nodesInRank.filter(node => sideAssignment.get(node.id) === 'right').length;
              sideAssignment.set(n.id, currentLeft <= currentRight ? 'left' : 'right');
          }
      });
  });

  // Assign X and Y
  rankGroups.forEach((nodesInRank, rankIndex) => {
      const rankY = 80 + rankIndex * Y_SPACING;
      
      const centerNodes = nodesInRank.filter(n => sideAssignment.get(n.id) === 'center');
      const leftNodes = nodesInRank.filter(n => sideAssignment.get(n.id) === 'left');
      const rightNodes = nodesInRank.filter(n => sideAssignment.get(n.id) === 'right');

      // Sorting
      leftNodes.sort((a, b) => b.id.localeCompare(a.id)); 
      rightNodes.sort((a, b) => a.id.localeCompare(b.id));

      // Placement
      centerNodes.forEach(n => {
          n.x = canvasCenterX;
          n.y = rankY;
      });

      leftNodes.forEach((n, i) => {
          n.x = canvasCenterX - X_SPACING * (i + 1);
          n.y = rankY;
      });

      rightNodes.forEach((n, i) => {
          n.x = canvasCenterX + X_SPACING * (i + 1);
          n.y = rankY;
      });
  });

  // 5. Final Links
  const finalNodes = Array.from(nodeMap.values());
  const graphLinks: GraphLink[] = [];
  adj.forEach((targets, sourceId) => {
      const source = nodeMap.get(sourceId);
      if (!source) return;
      targets.forEach(targetId => {
          const target = nodeMap.get(targetId);
          if (target) {
              const originalRelation = relations.find(r => r.sourceId === sourceId && r.targetId === targetId);
              let type = RelationType.CUTS;
              if (source.type === UnitType.LAYER) type = RelationType.OVERLAYS; 
              
              graphLinks.push({ 
                  id: originalRelation?.id || `${sourceId}-${targetId}`, 
                  source, 
                  target, 
                  type 
              });
          }
      });
  });

  return { nodes: finalNodes, links: graphLinks, layers: maxRank + 1 };
};


// --- Part 2: Orthogonal Routing with Bridges & Explicit Ports ---

interface Point { x: number; y: number; }

export type RouteType = 'VerticalStack' | 'SideBracket' | 'Mixed';

export interface RouteResult {
    path: string;
    routeType: RouteType;
    controlPoint: number; // For VerticalStack this is Y, for SideBracket this is X
}

export const calculateRoutes = (
    nodes: GraphNode[], 
    links: GraphLink[], 
    customOffsets: Map<string, number> = new Map(),
    customPorts: Map<string, LinkPortConfig> = new Map()
): RouteResult[] => {
    
    const polylines: Point[][] = []; 
    const meta: { routeType: RouteType, controlPoint: number }[] = [];

    // Calculate mean X for heuristics
    const meanX = nodes.length > 0 ? nodes.reduce((sum, n) => sum + n.x, 0) / nodes.length : 0;

    links.forEach((link, i) => {
        const src = link.source;
        const tgt = link.target;
        
        // Dimensions
        const sR = src.type === UnitType.LAYER ? LAYER_RADIUS : 0;
        const sW = src.type === UnitType.LAYER ? sR * 2 : UNIT_WIDTH;
        const sH = src.type === UnitType.LAYER ? sR * 2 : UNIT_HEIGHT;

        const tR = tgt.type === UnitType.LAYER ? LAYER_RADIUS : 0;
        const tW = tgt.type === UnitType.LAYER ? tR * 2 : UNIT_WIDTH;
        const tH = tgt.type === UnitType.LAYER ? tR * 2 : UNIT_HEIGHT;

        // Centers
        const sc = { x: src.x, y: src.y };
        const tc = { x: tgt.x, y: tgt.y };

        // Anchors
        const anchors = {
            src: {
                top: { x: sc.x, y: sc.y - sH/2 },
                bottom: { x: sc.x, y: sc.y + sH/2 },
                left: { x: sc.x - sW/2, y: sc.y },
                right: { x: sc.x + sW/2, y: sc.y },
            },
            tgt: {
                top: { x: tc.x, y: tc.y - tH/2 },
                bottom: { x: tc.x, y: tc.y + tH/2 },
                left: { x: tc.x - tW/2, y: tc.y },
                right: { x: tc.x + tW/2, y: tc.y },
            }
        };

        const config = customPorts.get(link.id || '') || {};
        
        // --- 1. Heuristic: Determine Default Sides ---
        let defaultSource: Side = 'bottom';
        let defaultTarget: Side = 'top';

        const isVerticalAligned = Math.abs(tc.x - sc.x) < 40; 
        
        if (link.type === RelationType.CUTS && isVerticalAligned) {
            const preferredSide = sc.x <= meanX ? 'left' : 'right';
            defaultSource = preferredSide;
            defaultTarget = preferredSide;
        } else {
            if (src.type === UnitType.LAYER) defaultSource = 'bottom';
            else if (tc.y < sc.y) defaultSource = 'top'; 
            else if (Math.abs(tc.x - sc.x) > 100) defaultSource = tc.x > sc.x ? 'right' : 'left'; 
            else defaultSource = 'bottom';

            if (sc.y > tc.y + 30) defaultTarget = 'bottom';
            else if (Math.abs(tc.x - sc.x) > 100) defaultTarget = tc.x > sc.x ? 'left' : 'right';
            else defaultTarget = 'top';
        }

        let sSide: Side = config.sourceSide || defaultSource;
        let tSide: Side = config.targetSide || defaultTarget;

        const start = anchors.src[sSide];
        const end = anchors.tgt[tSide];

        const exitPt = { ...start };
        if (sSide === 'top') exitPt.y -= DEFAULT_GAP;
        if (sSide === 'bottom') exitPt.y += DEFAULT_GAP;
        if (sSide === 'left') exitPt.x -= DEFAULT_GAP;
        if (sSide === 'right') exitPt.x += DEFAULT_GAP;

        const entryPt = { ...end };
        if (tSide === 'top') entryPt.y -= DEFAULT_GAP;
        if (tSide === 'bottom') entryPt.y += DEFAULT_GAP;
        if (tSide === 'left') entryPt.x -= DEFAULT_GAP;
        if (tSide === 'right') entryPt.x += DEFAULT_GAP;

        const points: Point[] = [start, exitPt];
        
        const isVerticalExit = sSide === 'top' || sSide === 'bottom';
        const isVerticalEntry = tSide === 'top' || tSide === 'bottom';
        
        let routeType: RouteType = 'Mixed';
        let controlPoint = 0;

        if (isVerticalExit && isVerticalEntry) {
            routeType = 'VerticalStack';
            let midY = (exitPt.y + entryPt.y) / 2;
            if (customOffsets.has(link.id || '')) {
                midY = customOffsets.get(link.id || '')!;
            }
            controlPoint = midY;
            points.push({ x: exitPt.x, y: midY });
            points.push({ x: entryPt.x, y: midY });
        } 
        else if (!isVerticalExit && !isVerticalEntry) {
            routeType = 'SideBracket';
            let midX = (exitPt.x + entryPt.x) / 2;
            if (!customOffsets.has(link.id || '')) {
                 if (sSide === 'left') midX = Math.min(exitPt.x, entryPt.x) - 20;
                 else midX = Math.max(exitPt.x, entryPt.x) + 20;
            } else {
                 midX = customOffsets.get(link.id || '')!;
            }
            controlPoint = midX;
            points.push({ x: midX, y: exitPt.y });
            points.push({ x: midX, y: entryPt.y });
        } 
        else if (isVerticalExit && !isVerticalEntry) {
            points.push({ x: exitPt.x, y: entryPt.y }); 
        } 
        else {
             points.push({ x: entryPt.x, y: exitPt.y });
        }
        
        const last = points[points.length-1];
        if (last.x !== entryPt.x && last.y !== entryPt.y) {
             points.push({ x: entryPt.x, y: last.y });
        } else if (last.x !== entryPt.x || last.y !== entryPt.y) {
             if (routeType === 'Mixed') {
                 if (last.x !== entryPt.x && last.y !== entryPt.y) {
                     points.push({ x: entryPt.x, y: last.y });
                 }
             }
        }

        points.push(entryPt);
        points.push(end);

        const cleanPoints = points.filter((p, idx) => {
            if (idx === 0) return true;
            return Math.abs(p.x - points[idx-1].x) > 0.1 || Math.abs(p.y - points[idx-1].y) > 0.1;
        });

        polylines.push(cleanPoints);
        meta.push({ routeType, controlPoint });
    });

    // --- Bridges Calculation ---
    const vSegments: { x: number, y1: number, y2: number, linkIdx: number, segIdx: number }[] = [];
    const hSegments: { y: number, x1: number, x2: number, linkIdx: number }[] = [];

    polylines.forEach((points, linkIdx) => {
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i+1];
            if (Math.abs(p1.x - p2.x) < 0.1) {
                vSegments.push({ 
                    x: p1.x, 
                    y1: Math.min(p1.y, p2.y), 
                    y2: Math.max(p1.y, p2.y), 
                    linkIdx, segIdx: i 
                });
            } else {
                hSegments.push({ 
                    y: p1.y, 
                    x1: Math.min(p1.x, p2.x), 
                    x2: Math.max(p1.x, p2.x), 
                    linkIdx 
                });
            }
        }
    });

    const jumps = new Map<number, Map<number, number[]>>();

    vSegments.forEach(v => {
        hSegments.forEach(h => {
            if (v.linkIdx === h.linkIdx) return; // Self-intersection check
            
            // Check intersection with padding
            if (v.x > h.x1 + BRIDGE_RADIUS && v.x < h.x2 - BRIDGE_RADIUS && 
                h.y > v.y1 + BRIDGE_RADIUS && h.y < v.y2 - BRIDGE_RADIUS) {
                
                if (!jumps.has(v.linkIdx)) jumps.set(v.linkIdx, new Map());
                const segMap = jumps.get(v.linkIdx)!;
                if (!segMap.has(v.segIdx)) segMap.set(v.segIdx, []);
                segMap.get(v.segIdx)!.push(h.y);
            }
        });
    });

    // Generate SVG Paths with Bridges
    return polylines.map((points, linkIdx) => {
        let d = `M ${points[0].x} ${points[0].y}`;
        let currentPt = points[0];

        for (let i = 0; i < points.length - 1; i++) {
            const nextPt = points[i+1];
            const segJumps = jumps.get(linkIdx)?.get(i);
            
            if (segJumps && segJumps.length > 0) {
                const isDown = nextPt.y > currentPt.y;
                segJumps.sort((a, b) => isDown ? a - b : b - a);

                // Merge overlapping or close jumps to create a cleaner look
                const intervals: {start: number, end: number}[] = [];
                segJumps.forEach(jy => {
                    const y1 = jy - BRIDGE_RADIUS;
                    const y2 = jy + BRIDGE_RADIUS;
                    intervals.push({start: y1, end: y2});
                });

                const merged: {start: number, end: number}[] = [];
                if (isDown) {
                    // Ascending Sort (already sorted by segJumps)
                    intervals.forEach(inv => {
                        if (merged.length === 0) merged.push(inv);
                        else {
                            const last = merged[merged.length - 1];
                            if (inv.start < last.end) last.end = Math.max(last.end, inv.end);
                            else merged.push(inv);
                        }
                    });
                } else {
                    // Descending Sort (already sorted by segJumps)
                    // But for merging, we check overlap from 'top' (high Y) down to 'bottom' (low Y)
                    intervals.forEach(inv => {
                        if (merged.length === 0) merged.push(inv);
                        else {
                            const last = merged[merged.length - 1];
                            // If overlap: last is [99, 111], inv is [94, 106]. inv.end > last.start
                            if (inv.end > last.start) last.start = Math.min(last.start, inv.start);
                            else merged.push(inv);
                        }
                    });
                }
                
                let cursorY = currentPt.y;
                merged.forEach(inv => {
                    // Determine bridge direction based on travel
                    const bridgeStart = isDown ? inv.start : inv.end;
                    const bridgeEnd = isDown ? inv.end : inv.start;
                    
                    // 1. Draw Line to Bridge Start
                    if (Math.abs(cursorY - bridgeStart) > 0.1) {
                         d += ` L ${currentPt.x} ${bridgeStart}`;
                    }
                    
                    // 2. Draw Arc (Radius adjusts to cover merged distance)
                    const dist = Math.abs(bridgeEnd - bridgeStart);
                    const radius = dist / 2;
                    
                    // Sweep flag 1 (clockwise) creates consistent bulge to the right relative to down direction
                    d += ` A ${radius} ${radius} 0 0 1 ${currentPt.x} ${bridgeEnd}`;
                    cursorY = bridgeEnd;
                });
                
                // Draw remaining line to end point
                if (Math.abs(cursorY - nextPt.y) > 0.1) {
                    d += ` L ${nextPt.x} ${nextPt.y}`;
                }
            } else {
                d += ` L ${nextPt.x} ${nextPt.y}`;
            }
            currentPt = nextPt;
        }

        return { 
            path: d, 
            routeType: meta[linkIdx].routeType, 
            controlPoint: meta[linkIdx].controlPoint 
        };
    });
};