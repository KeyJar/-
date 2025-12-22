import React, { useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import { ArchaeologicalUnit, StratigraphicRelation, GraphNode, GraphLink } from '../types';
import { calculateLayout } from '../utils/graphLayout';
import { Download } from 'lucide-react';

interface MatrixCanvasProps {
  units: ArchaeologicalUnit[];
  relations: StratigraphicRelation[];
  onNodeClick: (unit: ArchaeologicalUnit) => void;
}

// 转换逻辑：1 -> ①, 2a -> ②a
const toCircled = (str: string): string => {
  const match = str.match(/^(\d+)([a-z]*)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    const suffix = match[2]; 
    let circled = str;
    if (num >= 1 && num <= 20) {
      circled = String.fromCharCode(0x2460 + num - 1);
    }
    return suffix ? `${circled}${suffix}` : circled;
  }
  return str;
};

// 定义线段
interface Segment {
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  isHorizontal: boolean;
  linkId?: string; // 所属连线的标识
}

/**
 * 核心算法：生成带“过桥”且水平分流的直角路径
 */
const generateOrthogonalPathsWithBridges = (links: GraphLink[], nodeHeight = 30) => {
  // 1. 预计算所有连线的基础信息
  const linkInfos = links.map((link, index) => {
    const sx = link.source.x;
    const sy = link.source.y + (link.source.type === 'LAYER' ? 18 : 14);
    const tx = link.target.x;
    const ty = link.target.y - (link.target.type === 'LAYER' ? 18 : 14);
    const isVertical = Math.abs(sx - tx) < 1;
    const midY = (sy + ty) / 2;
    return { index, sx, sy, tx, ty, midY, isVertical };
  });

  // 2. 分组水平线段，解决重叠
  // key: 近似的 midY, value: link indices
  const gapGroups = new Map<number, number[]>();
  linkInfos.forEach(info => {
      if (!info.isVertical) {
          const key = Math.floor(info.midY / 10) * 10;
          if (!gapGroups.has(key)) gapGroups.set(key, []);
          gapGroups.get(key)!.push(info.index);
      }
  });

  const yOffsets = new Map<number, number>();
  gapGroups.forEach((indices) => {
      if (indices.length <= 1) return;
      // 排序策略：使用简单的中心位置排序，让线更顺畅
      indices.sort((a, b) => {
          const infoA = linkInfos[a];
          const infoB = linkInfos[b];
          const centerA = (infoA.sx + infoA.tx) / 2;
          const centerB = (infoB.sx + infoB.tx) / 2;
          return centerA - centerB;
      });

      const spacing = 6; // 通道间距
      const startOffset = -((indices.length - 1) * spacing) / 2;
      indices.forEach((idx, i) => {
          yOffsets.set(idx, startOffset + i * spacing);
      });
  });

  // 3. 生成路径点
  const basicPaths = linkInfos.map(info => {
    if (info.isVertical) {
        return {
            id: info.index,
            points: [{x: info.sx, y: info.sy}, {x: info.tx, y: info.ty}],
            segments: [{p1: {x: info.sx, y: info.sy}, p2: {x: info.tx, y: info.ty}, isHorizontal: false, linkId: info.index.toString()}]
        };
    }

    const offset = yOffsets.get(info.index) || 0;
    const actualMidY = info.midY + offset;

    const p1 = { x: info.sx, y: info.sy };
    const p2 = { x: info.sx, y: actualMidY };
    const p3 = { x: info.tx, y: actualMidY };
    const p4 = { x: info.tx, y: info.ty };

    return {
        id: info.index,
        points: [p1, p2, p3, p4],
        segments: [
            { p1, p2, isHorizontal: false, linkId: info.index.toString() },
            { p1: p2, p2: p3, isHorizontal: true, linkId: info.index.toString() },
            { p1: p3, p2: p4, isHorizontal: false, linkId: info.index.toString() }
        ]
    };
  });

  // 4. 计算过桥
  const allVerticalSegments: Segment[] = [];
  basicPaths.forEach(path => {
      path.segments.forEach(seg => {
          if (!seg.isHorizontal) allVerticalSegments.push(seg);
      });
  });

  return basicPaths.map(path => {
      if (path.points.length === 2) {
          return `M ${path.points[0].x} ${path.points[0].y} L ${path.points[1].x} ${path.points[1].y}`;
      }

      const [v1, h, v2] = path.segments;
      const yLevel = h.p1.y;
      const minX = Math.min(h.p1.x, h.p2.x);
      const maxX = Math.max(h.p1.x, h.p2.x);
      const direction = h.p2.x > h.p1.x ? 1 : -1; 

      const intersections: number[] = []; 

      allVerticalSegments.forEach(vSeg => {
          if (vSeg.linkId === path.id.toString()) return; 
          
          const vx = vSeg.p1.x;
          const vyMin = Math.min(vSeg.p1.y, vSeg.p2.y);
          const vyMax = Math.max(vSeg.p1.y, vSeg.p2.y);

          // 简单的相交检测
          if (vx > minX + 2 && vx < maxX - 2 && yLevel > vyMin + 2 && yLevel < vyMax - 2) {
              intersections.push(vx);
          }
      });

      intersections.sort((a, b) => direction === 1 ? a - b : b - a);

      let d = `M ${path.points[0].x} ${path.points[0].y} L ${h.p1.x} ${h.p1.y}`; 
      
      let currentX = h.p1.x;
      const bridgeRadius = 4;

      intersections.forEach(ix => {
          // 绘制到桥前
          const bridgeStart = ix - (direction * bridgeRadius);
          d += ` L ${bridgeStart} ${yLevel}`;
          
          // 绘制桥
          const bridgeEnd = ix + (direction * bridgeRadius);
          d += ` A ${bridgeRadius} ${bridgeRadius} 0 0 1 ${bridgeEnd} ${yLevel}`;
          
          currentX = bridgeEnd;
      });

      d += ` L ${h.p2.x} ${h.p2.y}`; 
      d += ` L ${path.points[3].x} ${path.points[3].y}`; 

      return d;
  });
};

const MatrixCanvas: React.FC<MatrixCanvasProps> = ({ units, relations, onNodeClick }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { nodes, links, layers } = useMemo(() => {
    return calculateLayout(units, relations, 1000, 800);
  }, [units, relations]);

  const pathStrings = useMemo(() => {
      return generateOrthogonalPathsWithBridges(links);
  }, [links]);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); 

    const width = containerRef.current.clientWidth;
    const height = Math.max(600, layers * 150 + 200);

    const g = svg.append("g");
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    
    svg.call(zoom)
       .attr("viewBox", [0, 0, width, height])
       .attr("width", width)
       .attr("height", height);

    const defs = svg.append("defs");
    defs.append("marker")
      .attr("id", "arrow-filled")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 10) // Tip at end of path (touching node)
      .attr("refY", 0)
      .attr("markerWidth", 7)
      .attr("markerHeight", 7)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#000");

    // --- Links ---
    g.append("g")
      .attr("class", "links")
      .selectAll("path")
      .data(links)
      .join("path")
      .attr("d", (d, i) => pathStrings[i])
      .attr("fill", "none")
      .attr("stroke", "#000")
      .attr("stroke-width", 1.2)
      .attr("marker-end", "url(#arrow-filled)");

    // --- Nodes ---
    const nodeGroup = g.append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("transform", d => `translate(${d.x},${d.y})`)
      .attr("class", "node cursor-pointer")
      .on("click", (event, d) => {
          onNodeClick(d);
      });

    nodeGroup.each(function(d) {
      const node = d3.select(this);
      const isLayer = d.type === 'LAYER';
      
      if (isLayer) {
        node.append("circle")
          .attr("r", 18) 
          .attr("fill", "#fff")
          .attr("stroke", "none"); 
        
        node.append("text")
          .attr("text-anchor", "middle")
          .attr("dy", 6)
          .attr("fill", "#000")
          .attr("font-family", "serif") 
          .attr("font-size", "22px") 
          .attr("font-weight", "bold")
          .text(toCircled(d.id));
      } else {
        const w = 60;
        const h = 28;
        node.append("rect")
          .attr("x", -w/2)
          .attr("y", -h/2)
          .attr("width", w)
          .attr("height", h)
          .attr("fill", "#fff")
          .attr("stroke", "#000")
          .attr("stroke-width", 1.2);

        node.append("text")
          .attr("text-anchor", "middle")
          .attr("dy", 4)
          .attr("fill", "#000")
          .attr("font-size", "14px")
          .attr("font-family", "sans-serif")
          .text(d.id);
      }
    });
    
    // Add tooltip-like hint on hover (optional)
    nodeGroup.append("title").text(d => `点击编辑 ${d.id}`);

  }, [nodes, links, layers, pathStrings, onNodeClick]);

  const handleExport = () => {
    if (!svgRef.current) return;
    const svgEl = svgRef.current;
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgEl);
    if(!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)){
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    const canvas = document.createElement("canvas");
    const scale = 3; 
    const bbox = svgEl.getBoundingClientRect();
    const finalW = bbox.width || 800;
    const finalH = bbox.height || 600;
    
    canvas.width = finalW * scale;
    canvas.height = finalH * scale;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);
    
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);
    img.onload = () => {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, finalW, finalH);
      ctx.drawImage(img, 0, 0, finalW, finalH);
      const a = document.createElement("a");
      a.download = "archaeograph_hd.png";
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
  };

  return (
    <div ref={containerRef} className="w-full h-full bg-white border border-gray-300 rounded-lg overflow-hidden shadow-inner relative">
      <div className="absolute top-4 right-4 z-10">
         <button 
           onClick={handleExport}
           className="bg-white hover:bg-gray-50 text-gray-800 border border-gray-300 px-3 py-1.5 rounded shadow text-xs font-medium flex items-center gap-2 transition-colors"
         >
           <Download size={14} /> 导出高清图片
         </button>
      </div>
      
      <div className="absolute top-4 left-4 z-10 bg-white/90 p-2 rounded border border-gray-200 text-xs text-gray-800 pointer-events-none shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <div className="font-serif font-bold text-base">①a</div>
          <span>地层</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-3 border border-black bg-white"></div>
          <span>遗迹</span>
        </div>
        <div className="mt-1 border-t pt-1 flex items-center gap-1 text-[10px] text-gray-500">
             <span className="w-4 h-2 border-b border-black rounded-b-full"></span>
             <span>过桥线</span>
        </div>
      </div>
      
      <svg ref={svgRef} className="w-full h-full touch-action-none bg-white"></svg>
    </div>
  );
};

export default MatrixCanvas;