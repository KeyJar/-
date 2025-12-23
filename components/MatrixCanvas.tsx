import React, { useEffect, useRef, useMemo, useState } from 'react';
import * as d3 from 'd3';
import { ArchaeologicalUnit, StratigraphicRelation, GraphNode, GraphLink, RelationType, UnitType } from '../types';
import { calculateLayout, calculateRoutes, LinkPortConfig, Side, RouteType } from '../utils/graphLayout';
import { Download, Move, MousePointer2, Plus, PenTool, Eraser, Square, Lock, Unlock, ZoomIn, ZoomOut, Maximize, Circle } from 'lucide-react';

interface MatrixCanvasProps {
  units: ArchaeologicalUnit[];
  relations: StratigraphicRelation[];
  onNodeClick: (unit: ArchaeologicalUnit) => void;
  onAddRelation?: (relation: StratigraphicRelation) => void;
  onAddUnit?: (unit: ArchaeologicalUnit) => void;
  onDeleteUnit?: (id: string) => void;
  onDeleteRelation?: (id: string) => void;
}

// Tool types
type ToolType = 'select' | 'node' | 'edge' | 'eraser';

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

const MatrixCanvas: React.FC<MatrixCanvasProps> = ({ 
    units, relations, onNodeClick, onAddRelation, onAddUnit, onDeleteUnit, onDeleteRelation 
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // --- Layout State ---
  const [layoutMode, setLayoutMode] = useState<'auto' | 'manual'>('auto');
  const [manualPositions, setManualPositions] = useState<Map<string, {x:number, y:number}>>(new Map());
  const [linkSegmentOffsets, setLinkSegmentOffsets] = useState<Map<string, number>>(new Map());
  const [linkPorts, setLinkPorts] = useState<Map<string, LinkPortConfig>>(new Map()); 
  
  // --- Tool State ---
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [drawSourceId, setDrawSourceId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{x:number, y:number} | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // 1. Calculate Initial/Auto Layout
  const autoLayout = useMemo(() => {
    return calculateLayout(units, relations, 1000, 800);
  }, [units, relations]);

  // 2. Merge Manual Positions (Fully Editable Graph)
  const { nodes, links, layers } = useMemo(() => {
    // Determine the base positions
    const baseNodes = autoLayout.nodes;
    
    const mergedNodes = baseNodes.map(n => {
        const manual = manualPositions.get(n.id);
        if (manual) {
            return { ...n, x: manual.x, y: manual.y };
        }
        return { ...n };
    });

    const nodeMap = new Map(mergedNodes.map(n => [n.id, n]));
    const mergedLinks = autoLayout.links.map(l => {
        const src = nodeMap.get(l.source.id);
        const tgt = nodeMap.get(l.target.id);
        if (!src || !tgt) return null;
        return { ...l, source: src, target: tgt };
    }).filter(l => l !== null) as GraphLink[];

    return { nodes: mergedNodes, links: mergedLinks, layers: autoLayout.layers };
  }, [autoLayout, manualPositions]);

  // 3. Generate Paths (With Custom Ports)
  const routes = useMemo(() => {
      return calculateRoutes(nodes, links, linkSegmentOffsets, linkPorts);
  }, [nodes, links, linkSegmentOffsets, linkPorts]);

  // --- Handlers ---

  const switchToManual = () => {
      if (layoutMode === 'auto') {
          // Snapshot current positions to allow editing from here
          const initMap = new Map<string, {x:number, y:number}>();
          nodes.forEach(n => initMap.set(n.id, {x: n.x, y: n.y}));
          setManualPositions(initMap);
          setLayoutMode('manual');
      }
  };

  const handleToolChange = (tool: ToolType) => {
      if (tool !== 'select') {
          switchToManual();
      }
      setActiveTool(tool);
      setDrawSourceId(null);
      setSelectedId(null);
  };

  const updateLinkPort = (linkId: string, type: 'source' | 'target', side: Side) => {
      switchToManual();
      setLinkPorts(prev => {
          const next = new Map(prev);
          const oldConfig = next.get(linkId);
          // Use safe spread for potentially undefined config
          const current: LinkPortConfig = oldConfig ? { ...oldConfig } : {};
          
          if (type === 'source') current.sourceSide = side;
          else current.targetSide = side;
          
          next.set(linkId, current);
          return next;
      });
  };

  // Zoom Controls
  const handleZoomIn = () => {
      if (svgRef.current && zoomBehaviorRef.current) {
          d3.select(svgRef.current).transition().duration(300).call(zoomBehaviorRef.current.scaleBy, 1.2);
      }
  };

  const handleZoomOut = () => {
      if (svgRef.current && zoomBehaviorRef.current) {
          d3.select(svgRef.current).transition().duration(300).call(zoomBehaviorRef.current.scaleBy, 0.8);
      }
  };

  const handleResetZoom = () => {
      if (svgRef.current && zoomBehaviorRef.current && containerRef.current) {
          const width = containerRef.current.clientWidth;
          d3.select(svgRef.current).transition().duration(500)
            .call(zoomBehaviorRef.current.transform, d3.zoomIdentity.translate(width/2 - 500, 50).scale(0.8));
      }
  };

  // Keyboard Shortcuts
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

          if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
             const unit = units.find(u => u.id === selectedId);
             if (unit && onDeleteUnit) {
                 if (confirm(`确定要删除 ${selectedId} 吗?`)) {
                    onDeleteUnit(selectedId);
                    setSelectedId(null);
                 }
                 return;
             }
             const rel = relations.find(r => r.id === selectedId);
             if (rel && onDeleteRelation) {
                 if (confirm('确定要删除这条连线吗?')) {
                    onDeleteRelation(selectedId);
                    setSelectedId(null);
                 }
                 return;
             }
          }

          if (e.key === 'v' || e.key === 'V') handleToolChange('select');
          if (e.key === 'b' || e.key === 'B') handleToolChange('node');
          if (e.key === 'l' || e.key === 'L') handleToolChange('edge');
          if (e.key === 'd' || e.key === 'D') handleToolChange('eraser');
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, units, relations, onDeleteUnit, onDeleteRelation]);

  // Canvas Interactions
  const handleCanvasClick = (e: React.MouseEvent) => {
      if (!svgRef.current) return;
      if (e.button === 1) return; // Middle click ignore

      if (activeTool === 'select') {
          // If clicking port controls, don't deselect
          if ((e.target as Element).closest('.port-control')) return;

          if (e.target === svgRef.current) {
              setSelectedId(null);
          }
      }

      if (activeTool === 'node' && onAddUnit) {
          const svg = d3.select(svgRef.current);
          const g = svg.select<SVGGElement>("g.main-group");
          const [mx, my] = d3.pointer(e, g.node());

          let counter = 1;
          let newId = `H${counter}`;
          while (units.some(u => u.id === newId)) {
              counter++;
              newId = `H${counter}`;
          }

          setManualPositions(prev => {
              const next = new Map(prev);
              next.set(newId, { x: mx, y: my });
              return next;
          });

          onAddUnit({ id: newId, type: UnitType.ASH_PIT, description: '新遗迹' });
          setSelectedId(newId);
      }
  };

  const handleNodeInteraction = (unit: ArchaeologicalUnit, event: any) => {
      if (activeTool === 'eraser') {
          if (onDeleteUnit && confirm(`确定要删除 ${unit.id} 吗?`)) onDeleteUnit(unit.id);
          return;
      }

      if (activeTool === 'edge') {
          if (!onAddRelation) return;
          if (!drawSourceId) {
              setDrawSourceId(unit.id);
          } else {
              if (drawSourceId !== unit.id) {
                  const exists = relations.some(r => r.sourceId === drawSourceId && r.targetId === unit.id);
                  if (!exists) {
                      onAddRelation({
                          id: `${drawSourceId}-CUTS-${unit.id}-${Date.now()}`,
                          sourceId: drawSourceId,
                          targetId: unit.id,
                          type: RelationType.CUTS
                      });
                  }
              }
              setDrawSourceId(null);
          }
          return;
      }

      if (activeTool === 'select') {
          if (event.detail === 2) onNodeClick(unit); 
          else setSelectedId(unit.id);
      }
  };

  const handleLinkClick = (linkId: string) => {
      if (activeTool === 'eraser' && onDeleteRelation) {
          if (confirm('确定要删除这条连线吗?')) onDeleteRelation(linkId);
      } else if (activeTool === 'select') {
          setSelectedId(linkId);
      }
  };

  // --- D3 Render ---

  // Zoom
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;
    const svg = d3.select(svgRef.current);
    const width = containerRef.current.clientWidth;

    let g = svg.select<SVGGElement>("g.main-group");
    if (g.empty()) {
        g = svg.append("g").attr("class", "main-group");
    }

    const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .filter((event) => event.type === 'wheel' || event.button === 1)
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
        });
    
    zoomBehaviorRef.current = zoom;
    svg.call(zoom);

    if (!svg.attr("data-initialized")) {
        svg.call(zoom.transform, d3.zoomIdentity.translate(width/2 - 500, 50).scale(0.8));
        svg.attr("data-initialized", "true");
    }
    
    svg.on("mousedown", (event) => { if (event.button === 1) event.preventDefault(); });
  }, []); 

  // Node Drag
  useEffect(() => {
      if (!svgRef.current) return;
      const svg = d3.select(svgRef.current);
      
      const dragBehavior = d3.drag<SVGGElement, GraphNode>()
        .filter(event => event.button === 0) 
        .on("start", (event, d) => {
            switchToManual(); 
            setSelectedId(d.id);
        })
        .on("drag", (event, d) => {
             if (activeTool !== 'select') return;
             setManualPositions(prev => {
                 const next = new Map(prev);
                 next.set(d.id, { x: event.x, y: event.y });
                 return next;
             });
        });

      if (activeTool === 'select') {
          svg.selectAll<SVGGElement, GraphNode>(".node").call(dragBehavior);
      } else {
          svg.selectAll<SVGGElement, GraphNode>(".node").on(".drag", null);
      }
  }, [nodes, activeTool]);

  // Link Segment Handle Drag (X or Y depending on route type)
  useEffect(() => {
      if (!svgRef.current) return;
      const svg = d3.select(svgRef.current);

      const linkDrag = d3.drag<SVGCircleElement, {id: string, routeType: RouteType}>()
        .filter(event => event.button === 0)
        .on("start", () => switchToManual())
        .on("drag", (event, d) => {
            if (activeTool !== 'select') return;
            
            setLinkSegmentOffsets(prev => {
                const next = new Map(prev);
                // If it's a Vertical Stack (Bottom->Top), we adjust Y.
                // If it's a Side Bracket (Left->Left), we adjust X.
                const val = (d.routeType === 'SideBracket') ? event.x : event.y;
                next.set(d.id, val);
                return next;
            });
        });

      svg.selectAll<SVGCircleElement, any>(".link-handle").call(linkDrag);
  }, [routes, activeTool]);

  // Main Render
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const g = svg.select<SVGGElement>("g.main-group");

    // Drawing Line
    svg.on("mousemove", (event) => {
           if (activeTool === 'edge' && drawSourceId) {
               const transform = d3.zoomTransform(svg.node()!);
               const [mx, my] = d3.pointer(event, svg.node());
               const x = (mx - transform.x) / transform.k;
               const y = (my - transform.y) / transform.k;
               setMousePos({x, y});
           }
       });

    g.selectAll(".temp-line").remove();
    if (activeTool === 'edge' && drawSourceId && mousePos) {
        const sourceNode = nodes.find(n => n.id === drawSourceId);
        if (sourceNode) {
            g.append("line")
             .attr("class", "temp-line")
             .attr("x1", sourceNode.x).attr("y1", sourceNode.y)
             .attr("x2", mousePos.x).attr("y2", mousePos.y)
             .attr("stroke", "#ef4444").attr("stroke-width", 2).attr("stroke-dasharray", "4 4");
        }
    }

    // Defs
    const defs = svg.select("defs");
    if (defs.empty()) {
        const newDefs = svg.append("defs");
        newDefs.append("marker").attr("id", "arrow-filled").attr("viewBox", "0 -5 10 10")
        .attr("refX", 8).attr("refY", 0).attr("markerWidth", 6).attr("markerHeight", 6)
        .attr("orient", "auto").append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "#333");

        newDefs.append("marker").attr("id", "arrow-selected").attr("viewBox", "0 -5 10 10")
        .attr("refX", 8).attr("refY", 0).attr("markerWidth", 6).attr("markerHeight", 6)
        .attr("orient", "auto").append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "#3b82f6");
    }

    // --- Links ---
    g.selectAll(".links").remove();
    const linkGroup = g.append("g").attr("class", "links");
    
    const linksSelection = linkGroup.selectAll("g.link-group")
      .data(links)
      .join("g")
      .attr("class", "link-group");

    // Hit Area
    linksSelection.append("path")
      .attr("d", (d, i) => routes[i].path)
      .attr("stroke", "transparent").attr("stroke-width", 15).attr("fill", "none")
      .on("click", (e, d) => {
          e.stopPropagation();
          if (d.id) handleLinkClick(d.id);
      });

    // Visible Path
    linksSelection.append("path")
      .attr("class", "visible-path")
      .attr("d", (d, i) => routes[i].path) 
      .attr("fill", "none")
      .attr("stroke", (d) => d.id === selectedId ? "#3b82f6" : "#333") 
      .attr("stroke-width", (d) => d.id === selectedId ? 2.5 : 1.5)
      .attr("marker-end", (d) => d.id === selectedId ? "url(#arrow-selected)" : "url(#arrow-filled)")
      .style("pointer-events", "none");

    // --- Port Controls (Only for Selected Link) ---
    g.selectAll(".port-controls").remove();
    const selectedLink = links.find(l => l.id === selectedId);
    if (activeTool === 'select' && selectedLink && selectedId) {
        const portsGroup = g.append("g").attr("class", "port-controls");
        
        // Helper to draw 4 dots around a node
        const drawNodePorts = (node: GraphNode, type: 'source' | 'target') => {
            const isLayer = node.type === UnitType.LAYER;
            const w = isLayer ? 36 : 60;
            const h = isLayer ? 36 : 28;
            const cx = node.x;
            const cy = node.y;

            const config = linkPorts.get(selectedId!) || {};
            const activeSide = type === 'source' ? config.sourceSide : config.targetSide;
            
            const positions: {side: Side, x: number, y: number}[] = [
                { side: 'top', x: cx, y: cy - h/2 - 8 },
                { side: 'bottom', x: cx, y: cy + h/2 + 8 },
                { side: 'left', x: cx - w/2 - 8, y: cy },
                { side: 'right', x: cx + w/2 + 8, y: cy },
            ];

            positions.forEach(p => {
                const isActive = activeSide ? activeSide === p.side : (type === 'source' ? p.side === 'bottom' : p.side === 'top'); 
                
                portsGroup.append("circle")
                    .attr("class", "port-control")
                    .attr("cx", p.x).attr("cy", p.y).attr("r", 4)
                    .attr("fill", isActive ? "#ef4444" : "#fff")
                    .attr("stroke", "#ef4444").attr("stroke-width", 1)
                    .style("cursor", "pointer")
                    .on("click", (e) => {
                        e.stopPropagation();
                        updateLinkPort(selectedId!, type, p.side);
                    })
                    .append("title").text(`Set ${type} to ${p.side}`);
            });
        };

        drawNodePorts(selectedLink.source, 'source');
        drawNodePorts(selectedLink.target, 'target');
    }

    // --- Link Control Handles (General) ---
    // These allow dragging the middle segment of the line (X or Y)
    g.selectAll(".link-handles").remove();
    if (layoutMode === 'manual' && activeTool === 'select') {
        const handleGroup = g.append("g").attr("class", "link-handles");
        const handleData = links.map((link, i) => {
            const route = routes[i];
            // Determine handle position based on route type
            let hx = 0;
            let hy = 0;
            if (route.routeType === 'VerticalStack') {
                // Control is Y
                hx = (link.source.x + link.target.x) / 2;
                hy = route.controlPoint;
            } else if (route.routeType === 'SideBracket') {
                // Control is X
                hx = route.controlPoint;
                hy = (link.source.y + link.target.y) / 2;
            } else {
                return null; // Mixed types might not have a simple single-axis drag
            }

            return {
                id: link.id,
                x: hx,
                y: hy,
                routeType: route.routeType,
                isSelected: link.id === selectedId
            };
        }).filter(h => h !== null) as {id: string, x: number, y: number, routeType: RouteType, isSelected: boolean}[];

        handleGroup.selectAll("circle")
            .data(handleData)
            .join("circle")
            .attr("class", "link-handle")
            .attr("cx", d => d.x).attr("cy", d => d.y)
            .attr("r", d => d.isSelected ? 6 : 4) 
            .attr("fill", "#fbbf24").attr("stroke", "#fff").attr("stroke-width", 1)
            .style("cursor", d => d.routeType === 'SideBracket' ? "ew-resize" : "ns-resize")
            .style("opacity", d => (d.isSelected || layoutMode === 'manual') ? 1 : 0)
            .append("title").text(d => d.routeType === 'SideBracket' ? "拖动调整水平位置" : "拖动调整垂直位置");
    }

    // --- Nodes ---
    g.selectAll(".nodes").remove();
    const nodeGroup = g.append("g").attr("class", "nodes")
      .selectAll("g").data(nodes).join("g")
      .attr("transform", d => `translate(${d.x},${d.y})`)
      .attr("class", d => `node`)
      .style("cursor", () => {
          if (activeTool === 'select') return 'move';
          if (activeTool === 'edge') return 'crosshair';
          if (activeTool === 'eraser') return 'not-allowed';
          return 'pointer';
      })
      .on("click", (event, d) => {
          event.stopPropagation();
          handleNodeInteraction(d, event);
      });

    nodeGroup.each(function(d) {
      const node = d3.select(this);
      const isLayer = d.type === 'LAYER';
      const isSelected = selectedId === d.id;
      const isSource = drawSourceId === d.id;
      const strokeColor = isSelected || isSource ? "#3b82f6" : "#000";
      const strokeWidth = isSelected || isSource ? 2.5 : 1.2;
      const fill = "#fff";

      if (isLayer) {
        node.append("circle").attr("r", 18).attr("fill", fill).attr("stroke", strokeColor).attr("stroke-width", isLayer && !isSelected ? 0 : strokeWidth);
        node.append("text").attr("text-anchor", "middle").attr("dy", 6).attr("fill", "#000").attr("font-family", "serif").attr("font-size", "22px").attr("font-weight", "bold").style("pointer-events", "none").text(toCircled(d.id));
      } else {
        const w = 60; const h = 28;
        node.append("rect").attr("x", -w/2).attr("y", -h/2).attr("width", w).attr("height", h).attr("fill", fill).attr("stroke", strokeColor).attr("stroke-width", strokeWidth);
        node.append("text").attr("text-anchor", "middle").attr("dy", 4).attr("fill", "#000").attr("font-size", "14px").attr("font-family", "sans-serif").style("pointer-events", "none").text(d.id);
      }
      
      if (isSelected) {
          node.append("circle").attr("r", 4).attr("cx", isLayer ? 18 : 30).attr("cy", 0).attr("fill", "#3b82f6");
      }
    });

  }, [nodes, links, routes, layoutMode, activeTool, drawSourceId, mousePos, selectedId, linkPorts]);

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
    <div 
        ref={containerRef} 
        className={`w-full h-full bg-white border border-gray-300 rounded-lg overflow-hidden shadow-inner relative group ${activeTool === 'node' ? 'cursor-crosshair' : ''}`}
        onClick={handleCanvasClick}
        onContextMenu={(e) => e.preventDefault()} 
    >

      {/* Visio-like Toolbar */}
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 pointer-events-auto items-end">
         
         <div className="bg-white border border-gray-300 rounded shadow-sm flex flex-col overflow-hidden mb-2">
             <button
                onClick={() => {
                    setLayoutMode('auto');
                    setManualPositions(new Map());
                    setLinkSegmentOffsets(new Map());
                    setLinkPorts(new Map());
                    setActiveTool('select');
                    handleResetZoom();
                }}
                className={`p-2 text-xs font-medium flex items-center justify-center gap-2 hover:bg-gray-50 ${layoutMode === 'auto' ? 'bg-amber-50 text-amber-700' : 'text-gray-500'}`}
                title="自动布局 (重置)"
             >
                 <Lock size={16}/> 
             </button>
             <button
                onClick={switchToManual}
                className={`p-2 text-xs font-medium flex items-center justify-center gap-2 hover:bg-gray-50 ${layoutMode === 'manual' ? 'bg-amber-50 text-amber-700' : 'text-gray-500'}`}
                title="手动/绘图模式"
             >
                 <Unlock size={16}/>
             </button>
         </div>

         {/* Zoom Controls */}
         <div className="bg-white border border-gray-300 rounded shadow-sm flex flex-col overflow-hidden mb-2">
             <button onClick={handleZoomIn} className="p-2 text-gray-600 hover:bg-gray-50" title="放大">
                 <ZoomIn size={16}/>
             </button>
             <button onClick={handleZoomOut} className="p-2 text-gray-600 hover:bg-gray-50" title="缩小">
                 <ZoomOut size={16}/>
             </button>
             <button onClick={handleResetZoom} className="p-2 text-gray-600 hover:bg-gray-50" title="适应窗口">
                 <Maximize size={16}/>
             </button>
         </div>

         <div className="bg-white border border-gray-300 rounded-lg shadow-md flex flex-col overflow-hidden divide-y divide-gray-100">
             <button
                onClick={() => handleToolChange('select')}
                className={`p-3 hover:bg-gray-50 transition-colors relative group ${activeTool === 'select' ? 'bg-blue-100 text-blue-700' : 'text-gray-600'}`}
                title="选择 (V)"
             >
                 <MousePointer2 size={18}/>
             </button>
             
             <button
                onClick={() => handleToolChange('node')}
                className={`p-3 hover:bg-gray-50 transition-colors relative group ${activeTool === 'node' ? 'bg-blue-100 text-blue-700' : 'text-gray-600'}`}
                title="绘制遗迹 (B)"
             >
                 <Square size={18}/>
             </button>

             <button
                onClick={() => handleToolChange('edge')}
                className={`p-3 hover:bg-gray-50 transition-colors relative group ${activeTool === 'edge' ? 'bg-blue-100 text-blue-700' : 'text-gray-600'}`}
                title="绘制连线 (L)"
             >
                 <PenTool size={18}/>
             </button>

             <button
                onClick={() => handleToolChange('eraser')}
                className={`p-3 hover:bg-red-50 transition-colors relative group ${activeTool === 'eraser' ? 'bg-red-100 text-red-600' : 'text-gray-600'}`}
                title="删除工具 (D)"
             >
                 <Eraser size={18}/>
             </button>
         </div>
         
         <button 
           onClick={handleExport}
           className="mt-2 bg-white hover:bg-gray-50 text-gray-800 border border-gray-300 p-2 rounded-full shadow-sm flex items-center justify-center transition-colors"
           title="导出"
         >
           <Download size={18} /> 
         </button>
      </div>

      {/* Info Overlay */}
      <div className="absolute top-4 left-4 z-10 bg-white/90 p-2 rounded border border-gray-200 text-xs text-gray-800 pointer-events-none shadow-sm">
        {activeTool === 'node' && (
            <div className="flex items-center gap-2 text-blue-600 font-bold">
                 <Plus size={12}/> <span>点击画布绘制新遗迹 (自动编号)</span>
             </div>
        )}
        {activeTool === 'edge' && (
             <div className="flex items-center gap-2 text-blue-600 font-bold">
                 <PenTool size={12}/>
                 <span>{drawSourceId ? "点击目标单位结束连线" : "点击起点单位开始连线"}</span>
             </div>
        )}
        {activeTool === 'eraser' && (
             <div className="flex items-center gap-2 text-red-600 font-bold">
                 <Eraser size={12}/> <span>点击遗迹或连线删除</span>
             </div>
        )}
        {activeTool === 'select' && (
            <div className="space-y-1">
                <div className="flex items-center gap-2 text-gray-600">
                    <MousePointer2 size={12}/> <span>选择 / 拖拽 / <b>中键平移</b></span>
                </div>
                {layoutMode === 'manual' && <div className="text-amber-600 flex items-center gap-1"><Move size={10}/> 拖拽黄点调整线高(上下)或线宽(左右)，红点改变接口</div>}
                {selectedId && <div className="text-blue-600 font-bold">已选择: {selectedId} (按 Delete 删除)</div>}
            </div>
        )}
      </div>
      
      <svg ref={svgRef} className="w-full h-full touch-action-none bg-white cursor-default"></svg>
    </div>
  );
};

export default MatrixCanvas;