import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ArchaeologicalUnit, StratigraphicRelation, UnitType, RelationType } from '../types';
import { Plus, Trash2, Wand2, Loader2, ArrowRight, Link as LinkIcon, Box, ChevronDown, RotateCcw, Layers, Check, X, FolderOpen, GripVertical } from 'lucide-react';
import { geminiService } from '../services/geminiService';

interface UnitFormProps {
  units: ArchaeologicalUnit[];
  relations: StratigraphicRelation[];
  onAddUnit: (unit: ArchaeologicalUnit) => void;
  onRemoveUnit: (id: string) => void;
  onUpdateUnit: (id: string, newUnit: ArchaeologicalUnit) => void;
  onAddRelation: (relation: StratigraphicRelation) => void;
  onRemoveRelation: (id: string) => void;
  onBulkImport: (units: ArchaeologicalUnit[], relations: StratigraphicRelation[]) => void;
  onClearAll: () => void;
}

// Helper to convert to circled number
const toCircled = (str: string): string => {
  if (!str) return '';
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

// Helper to calculate sort value for layers (Smaller number = Younger/Upper)
// e.g. 1 < 2, 2a < 2b
const getLayerSortValue = (id?: string): number => {
    if (!id) return 9999; // Unknown layer treated as very deep/old
    const match = id.match(/^(\d+)([a-z]*)$/);
    if (!match) return 9999;
    const num = parseInt(match[1], 10);
    const suffix = match[2];
    let suffixVal = 0;
    if (suffix) {
        suffixVal = suffix.charCodeAt(0) - 96; 
    }
    return num + (suffixVal / 100);
};

// Preset layers 1-9
const PRESET_LAYERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

const UnitForm: React.FC<UnitFormProps> = ({ 
  units, relations, onAddUnit, onRemoveUnit, onUpdateUnit, onAddRelation, onRemoveRelation, onBulkImport, onClearAll
}) => {
  const [activeTab, setActiveTab] = useState<'manual' | 'ai'>('manual');
  
  // Manual Entry State
  const [unitId, setUnitId] = useState('');
  
  // Custom Dropdown State
  const [openingLayer, setOpeningLayer] = useState('');
  const [showLayerDropdown, setShowLayerDropdown] = useState(false);
  const [isLayerInputFocused, setIsLayerInputFocused] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Bulk Relation State
  const [relSubject, setRelSubject] = useState('');
  const [relMode, setRelMode] = useState<'subject_cuts' | 'subject_is_cut_by'>('subject_cuts'); 
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set());

  // AI State
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Drag and Drop State
  const [draggedUnitId, setDraggedUnitId] = useState<string | null>(null);
  const [dragOverLayerId, setDragOverLayerId] = useState<string | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowLayerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const existingLayers = units
    .filter(u => u.type === UnitType.LAYER)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  // Combine presets and existing, remove duplicates
  const availableLayerOptions = Array.from(new Set([
      ...PRESET_LAYERS,
      ...existingLayers.map(u => u.id)
  ]));

  const filteredLayers = useMemo(() => {
      if (!openingLayer) return availableLayerOptions;
      const isExactMatch = availableLayerOptions.some(opt => opt === openingLayer || toCircled(opt) === openingLayer);
      if (isExactMatch && isLayerInputFocused) { 
           return availableLayerOptions;
      }
      return availableLayerOptions.filter(id => 
        id.toLowerCase().includes(openingLayer.toLowerCase()) || 
        toCircled(id).includes(openingLayer)
      );
  }, [availableLayerOptions, openingLayer, isLayerInputFocused]);

  const handleAddUnit = (e: React.FormEvent) => {
    e.preventDefault();
    const mainId = unitId.trim();
    if (!mainId) return;

    if (units.some(u => u.id === mainId)) {
      alert('编号已存在');
      return;
    }

    const newUnits: ArchaeologicalUnit[] = [];
    const openingId = openingLayer.trim() || undefined;

    newUnits.push({
      id: mainId,
      type: UnitType.ASH_PIT, 
      openingLayerId: openingId,
    });

    if (openingId) {
        if (!units.some(u => u.id === openingId) && openingId !== mainId) {
             newUnits.push({
                 id: openingId,
                 type: UnitType.LAYER,
                 description: '自动创建的层位'
             });
        }
    }

    onBulkImport(newUnits, []); 
    setUnitId('');
  };

  const toggleTargetSelection = (id: string) => {
      const newSet = new Set(selectedTargets);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedTargets(newSet);
  };

  const handleAddRelations = (e: React.FormEvent) => {
    e.preventDefault();
    if (!relSubject || selectedTargets.size === 0) return;

    Array.from(selectedTargets).forEach(otherId => {
        let source, target;
        if (relMode === 'subject_cuts') {
            source = relSubject;
            target = otherId;
        } else {
            source = otherId;
            target = relSubject;
        }

        if (!relations.some(r => r.sourceId === source && r.targetId === target)) {
             onAddRelation({
                 id: `${source}-CUTS-${target}-${Date.now()}-${Math.random()}`,
                 sourceId: source,
                 targetId: target,
                 type: RelationType.CUTS
             });
        }
    });
    setSelectedTargets(new Set());
  };

  const handleAiParse = async () => {
    if (!aiInput.trim()) return;
    setIsAiLoading(true);
    
    try {
      const result = await geminiService.parseFieldNotes(aiInput);
      if (result) {
        const importedRelations: StratigraphicRelation[] = result.relations.map((r, idx) => ({
          id: `ai-${idx}-${Date.now()}`,
          sourceId: r.younger,
          targetId: r.older,
          type: r.type as RelationType
        }));
        
        onBulkImport(
          result.units.map(u => ({
              ...u, 
              type: u.type as UnitType
          })), 
          importedRelations
        );
        setAiInput('');
        alert('导入成功！');
      } else {
        alert('无法解析，请检查内容。');
      }
    } catch (e) {
      alert('AI 服务繁忙，请稍后重试');
    } finally {
      setIsAiLoading(false);
    }
  };

  const confirmClear = () => {
      if (window.confirm("确定要清空所有数据吗？此操作无法撤销。")) {
          onClearAll();
      }
  };

  // --- Drag and Drop Logic ---
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedUnitId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, layerId: string) => {
      e.preventDefault(); // Necessary to allow dropping
      setDragOverLayerId(layerId);
      e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetLayerId: string) => {
      e.preventDefault();
      setDragOverLayerId(null);
      setDraggedUnitId(null);

      const unitId = e.dataTransfer.getData('text/plain');
      if (!unitId) return;

      const unit = units.find(u => u.id === unitId);
      if (unit && unit.openingLayerId !== targetLayerId) {
          // 'no_layer' is a special key for undefined openingLayerId
          const newLayerId = targetLayerId === 'no_layer' ? undefined : targetLayerId;
          onUpdateUnit(unitId, { ...unit, openingLayerId: newLayerId });
      }
  };

  // Group units by Opening Layer
  const groupedUnits = useMemo(() => {
      const groups: Record<string, ArchaeologicalUnit[]> = {};
      const noLayer: ArchaeologicalUnit[] = [];

      units.filter(u => u.type !== UnitType.LAYER).forEach(u => {
          if (u.openingLayerId) {
              if (!groups[u.openingLayerId]) groups[u.openingLayerId] = [];
              groups[u.openingLayerId].push(u);
          } else {
              noLayer.push(u);
          }
      });
      return { groups, noLayer };
  }, [units]);

  const sortedGroupKeys = Object.keys(groupedUnits.groups).sort((a, b) => 
      a.localeCompare(b, undefined, { numeric: true })
  );

  // Filter candidates based on stratigraphic logic
  const candidateUnits = useMemo(() => {
      const subjectUnit = units.find(u => u.id === relSubject);
      if (!subjectUnit) return [];

      const subjectLayerVal = getLayerSortValue(subjectUnit.openingLayerId);

      return units.filter(u => {
          // 1. Not self
          if (u.id === relSubject) return false;
          // 2. Not Layer (unless special case, but usually we link units)
          if (u.type === UnitType.LAYER) return false;
          
          const targetLayerVal = getLayerSortValue(u.openingLayerId);

          if (relMode === 'subject_cuts') {
              // Subject (Younger) CUTS Candidate (Older)
              // Younger Layer Number <= Older Layer Number (e.g., 1 <= 2)
              // ALLOW same layer cuts.
              return subjectLayerVal <= targetLayerVal; 
          } else {
              // Subject (Older) IS CUT BY Candidate (Younger)
              // Older Layer Number >= Younger Layer Number
              return subjectLayerVal >= targetLayerVal;
          }
      });
  }, [units, relSubject, relMode]);

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200 shadow-lg overflow-hidden">
      <div className="p-4 bg-gray-800 text-white shadow-md flex justify-between items-center">
        <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
            <Layers className="text-amber-500" size={24} /> ArchaeoGraph
            </h2>
            <p className="text-xs text-gray-300 mt-1">田野考古系络图工具</p>
        </div>
        
        <button 
            onClick={confirmClear}
            className="text-gray-400 hover:text-red-400 p-1.5 rounded-full hover:bg-gray-700 transition-colors"
            title="清空所有数据"
        >
            <RotateCcw size={16} />
        </button>
      </div>

      <div className="flex border-b border-gray-200">
        <button 
          onClick={() => setActiveTab('manual')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'manual' ? 'bg-gray-50 text-gray-800 border-b-2 border-gray-800' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          手动录入
        </button>
        <button 
          onClick={() => setActiveTab('ai')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'ai' ? 'bg-gray-50 text-gray-800 border-b-2 border-gray-800' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          AI 识别
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {activeTab === 'manual' ? (
          <>
            {/* Unit Entry */}
            <div className="space-y-3">
              <h3 className="font-bold text-gray-800 border-b pb-2 flex items-center gap-2 text-sm">
                  <Box size={16}/> 1. 添加遗迹
              </h3>
              
              <form onSubmit={handleAddUnit} className="space-y-3">
                <div className="flex gap-2">
                    <div className="flex-[3] space-y-1">
                        <label className="text-xs font-medium text-gray-600">遗迹编号</label>
                        <input 
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-gray-500 outline-none" 
                            placeholder="H1" 
                            value={unitId}
                            onChange={e => setUnitId(e.target.value)}
                            required
                        />
                    </div>
                    
                    <div className="flex-[2] space-y-1 relative" ref={dropdownRef}>
                        <label className="text-xs font-medium text-gray-600">开口层位</label>
                        <div className="relative">
                            <input 
                                className={`w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-gray-500 outline-none cursor-pointer ${!isLayerInputFocused && openingLayer ? 'font-serif font-bold text-gray-800' : ''}`}
                                placeholder="选择" 
                                value={isLayerInputFocused ? openingLayer : toCircled(openingLayer)}
                                onChange={e => {
                                    setOpeningLayer(e.target.value);
                                    if (!showLayerDropdown) setShowLayerDropdown(true);
                                }}
                                onClick={() => {
                                    setShowLayerDropdown(true);
                                }}
                                onFocus={() => {
                                    setIsLayerInputFocused(true);
                                    setShowLayerDropdown(true);
                                }}
                                onBlur={() => {
                                    setTimeout(() => setIsLayerInputFocused(false), 200);
                                }}
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                                <ChevronDown size={14} />
                            </div>
                        </div>
                        
                        {showLayerDropdown && (
                            <div className="absolute z-50 w-full bg-white border border-gray-200 rounded mt-1 shadow-lg max-h-40 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                                {filteredLayers.map(id => (
                                    <div 
                                        key={id}
                                        className="px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer flex items-center gap-2 font-serif"
                                        onClick={() => {
                                            setOpeningLayer(id);
                                            setShowLayerDropdown(false);
                                            setIsLayerInputFocused(false);
                                        }}
                                    >
                                        <span className="font-bold">{toCircled(id)}</span>
                                    </div>
                                ))}
                                {filteredLayers.length === 0 && (
                                    <div className="p-1.5 text-xs text-gray-400 text-center">新建 {openingLayer}</div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                <button type="submit" className="w-full bg-gray-800 hover:bg-gray-900 text-white py-1.5 px-4 rounded shadow-sm flex items-center justify-center gap-2 transition-all mt-2 text-sm font-medium">
                  <Plus size={14} /> 添加
                </button>
              </form>

              {/* Unit List (Horizontal Tags + DragDrop) */}
              <div className="max-h-64 overflow-y-auto border border-gray-200 rounded bg-gray-50 p-3 space-y-2 custom-scrollbar">
                {units.length === 0 && <p className="text-xs text-gray-400 text-center py-2">暂无数据</p>}
                
                {sortedGroupKeys.map(layerId => (
                    <div 
                        key={layerId} 
                        className={`
                            flex items-start gap-2 text-xs border-b border-gray-200 pb-2 last:border-0 transition-colors p-1 rounded
                            ${dragOverLayerId === layerId ? 'bg-amber-100 ring-2 ring-amber-300' : ''}
                        `}
                        onDragOver={(e) => handleDragOver(e, layerId)}
                        onDrop={(e) => handleDrop(e, layerId)}
                    >
                        <div className="font-serif font-bold text-gray-600 whitespace-nowrap min-w-[3rem] text-right mt-0.5 select-none cursor-default">
                            {toCircled(layerId)} 下:
                        </div>
                        <div className="flex flex-wrap gap-x-2 gap-y-1.5">
                            {groupedUnits.groups[layerId].slice().reverse().map((u, idx) => (
                                <span 
                                    key={u.id} 
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, u.id)}
                                    className={`
                                        group flex items-center gap-0.5 text-gray-800 bg-white border border-gray-300 rounded px-1.5 py-0.5 shadow-sm 
                                        cursor-grab active:cursor-grabbing hover:border-gray-400 hover:shadow-md transition-all
                                        ${draggedUnitId === u.id ? 'opacity-50' : 'opacity-100'}
                                    `}
                                >
                                    <span className="font-medium">{u.id}</span>
                                    <button 
                                        onClick={() => onRemoveUnit(u.id)} 
                                        className="text-gray-300 hover:text-red-500 opacity-50 hover:opacity-100 transition-opacity ml-1"
                                        title="删除"
                                    >
                                        <X size={10} />
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
                
                {/* No Layer Drop Zone */}
                {(groupedUnits.noLayer.length > 0 || draggedUnitId) && (
                     <div 
                        className={`
                            flex items-start gap-2 text-xs border-b border-gray-200 pb-2 last:border-0 transition-colors p-1 rounded
                            ${dragOverLayerId === 'no_layer' ? 'bg-amber-100 ring-2 ring-amber-300' : ''}
                        `}
                        onDragOver={(e) => handleDragOver(e, 'no_layer')}
                        onDrop={(e) => handleDrop(e, 'no_layer')}
                     >
                        <div className="font-bold text-gray-400 whitespace-nowrap min-w-[3rem] text-right mt-0.5 select-none cursor-default">
                            未定:
                        </div>
                        <div className="flex flex-wrap gap-x-2 gap-y-1.5">
                            {groupedUnits.noLayer.slice().reverse().map((u, idx) => (
                                <span 
                                    key={u.id} 
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, u.id)}
                                    className={`
                                        group flex items-center gap-0.5 text-gray-800 bg-white border border-gray-300 rounded px-1.5 py-0.5 shadow-sm 
                                        cursor-grab active:cursor-grabbing hover:border-gray-400 hover:shadow-md transition-all
                                        ${draggedUnitId === u.id ? 'opacity-50' : 'opacity-100'}
                                    `}
                                >
                                    <span className="font-medium">{u.id}</span>
                                    <button 
                                        onClick={() => onRemoveUnit(u.id)} 
                                        className="text-gray-300 hover:text-red-500 opacity-50 hover:opacity-100 transition-opacity ml-1"
                                        title="删除"
                                    >
                                        <X size={10} />
                                    </button>
                                </span>
                            ))}
                             {/* Empty placeholder to make dropping easier when empty */}
                             {groupedUnits.noLayer.length === 0 && <span className="text-gray-300 italic select-none">拖拽至此移出层位</span>}
                        </div>
                     </div>
                )}
              </div>
              <p className="text-[10px] text-gray-400 text-center mt-1">💡 提示：按住遗迹标签可拖拽修改层位</p>
            </div>

            {/* Relation Entry */}
            <div className="space-y-3 pt-2">
              <h3 className="font-bold text-gray-800 border-b pb-2 flex items-center gap-2 text-sm">
                  <LinkIcon size={16}/> 2. 打破关系
              </h3>
              <form onSubmit={handleAddRelations} className="space-y-3">
                <div>
                   <label className="text-xs font-medium text-gray-600 block mb-1">主角遗迹</label>
                   <select 
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-gray-500 outline-none" 
                        value={relSubject} 
                        onChange={e => {
                            setRelSubject(e.target.value);
                            setSelectedTargets(new Set());
                        }}
                    >
                        <option value="">-- 选择遗迹 --</option>
                        {units.filter(u => u.type !== UnitType.LAYER).map(u => <option key={u.id} value={u.id}>{u.id}</option>)}
                   </select>
                </div>

                <div className="flex bg-gray-100 p-1 rounded">
                    <button
                        type="button"
                        onClick={() => setRelMode('subject_cuts')}
                        className={`flex-1 py-1 text-xs rounded transition-colors ${relMode === 'subject_cuts' ? 'bg-white shadow text-gray-800 font-bold' : 'text-gray-500'}`}
                    >
                        打破 (晚 → 早)
                    </button>
                    <button
                         type="button"
                        onClick={() => setRelMode('subject_is_cut_by')}
                        className={`flex-1 py-1 text-xs rounded transition-colors ${relMode === 'subject_is_cut_by' ? 'bg-white shadow text-gray-800 font-bold' : 'text-gray-500'}`}
                    >
                        被打破 (早 ← 晚)
                    </button>
                </div>

                {relSubject && (
                    <div className="border border-gray-200 rounded p-2 bg-gray-50 max-h-40 overflow-y-auto custom-scrollbar">
                        <p className="text-[10px] text-gray-400 mb-1.5">{relMode === 'subject_cuts' ? `请选择 ${relSubject} 打破了谁 (层位更早/同层)：` : `请选择谁打破了 ${relSubject} (层位更晚/同层)：`}</p>
                        <div className="grid grid-cols-2 gap-2">
                            {candidateUnits.length === 0 && <p className="text-xs text-gray-400 col-span-2 text-center">无符合层位逻辑的遗迹</p>}
                            {candidateUnits.map(u => (
                                <div 
                                    key={u.id} 
                                    className={`
                                        flex items-center gap-2 p-1.5 rounded cursor-pointer border text-xs transition-colors
                                        ${selectedTargets.has(u.id) ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-100 hover:border-gray-300'}
                                    `}
                                    onClick={() => toggleTargetSelection(u.id)}
                                >
                                    <div className={`w-3 h-3 rounded-full border flex items-center justify-center ${selectedTargets.has(u.id) ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                                        {selectedTargets.has(u.id) && <Check size={8} className="text-white"/>}
                                    </div>
                                    <span>{u.id} {u.openingLayerId && <span className="text-gray-400 scale-90 inline-block">({toCircled(u.openingLayerId)}下)</span>}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <button type="submit" disabled={!relSubject || selectedTargets.size === 0} className="w-full bg-gray-800 hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed text-white py-1.5 px-4 rounded shadow-sm flex items-center justify-center gap-2 transition-all text-sm font-medium">
                  <Plus size={14} /> 确认添加 ({selectedTargets.size})
                </button>
              </form>
              
              <div className="border-t pt-2">
                  <h4 className="text-xs font-bold text-gray-500 mb-2">已添加关系 ({relations.length})</h4>
                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded bg-gray-50 p-1 space-y-1 custom-scrollbar">
                      {relations.length === 0 && <p className="text-xs text-gray-400 text-center py-2">暂无关系</p>}
                      {relations.slice().reverse().map(r => (
                          <div key={r.id} className="flex justify-between items-center text-xs bg-white px-2 py-1.5 rounded border border-gray-100 shadow-sm group">
                              <div className="flex items-center gap-2 text-gray-700">
                                  <span className="font-bold">{r.sourceId}</span>
                                  <ArrowRight size={10} className="text-gray-400"/>
                                  <span className="text-gray-600">{r.targetId}</span>
                                  <span className="text-[10px] text-gray-400 bg-gray-100 px-1 rounded transform scale-90">{r.type === RelationType.CUTS ? '打破' : '叠压'}</span>
                              </div>
                              <button 
                                onClick={() => onRemoveRelation(r.id)} 
                                className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                title="删除此关系"
                              >
                                  <X size={12} />
                              </button>
                          </div>
                      ))}
                  </div>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-4 h-full flex flex-col">
            <div className="bg-gray-100 text-gray-700 p-3 rounded-md text-sm border border-gray-200">
              <p className="font-bold mb-1 flex items-center gap-1"><Wand2 size={14}/> 智能识别</p>
              粘贴田野记录，AI将自动提取地层序列和遗迹关系。
            </div>
            
            <textarea
              className="flex-1 w-full p-3 border rounded-md text-sm outline-none focus:ring-1 focus:ring-gray-400 resize-none font-mono"
              placeholder="请在此粘贴..."
              value={aiInput}
              onChange={e => setAiInput(e.target.value)}
            />
            
            <button 
              onClick={handleAiParse}
              disabled={isAiLoading || !aiInput.trim()}
              className="w-full bg-gray-800 text-white p-3 rounded shadow hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
            >
              {isAiLoading ? <Loader2 className="animate-spin" size={20} /> : <Wand2 size={20} />}
              {isAiLoading ? '分析中...' : '生成系络图'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UnitForm;