import React, { useState, useRef, useEffect } from 'react';
import { ArchaeologicalUnit, StratigraphicRelation, UnitType, RelationType } from '../types';
import { Plus, Trash2, Wand2, Loader2, ArrowRight, Link as LinkIcon, Box, ChevronDown, RotateCcw, Layers } from 'lucide-react';
import { geminiService } from '../services/geminiService';

interface UnitFormProps {
  units: ArchaeologicalUnit[];
  relations: StratigraphicRelation[];
  onAddUnit: (unit: ArchaeologicalUnit) => void;
  onRemoveUnit: (id: string) => void;
  onAddRelation: (relation: StratigraphicRelation) => void;
  onRemoveRelation: (id: string) => void;
  onBulkImport: (units: ArchaeologicalUnit[], relations: StratigraphicRelation[]) => void;
  onClearAll: () => void;
}

// Helper to convert to circled number (replicated to ensure consistency in UI)
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

const UnitForm: React.FC<UnitFormProps> = ({ 
  units, relations, onAddUnit, onRemoveUnit, onAddRelation, onRemoveRelation, onBulkImport, onClearAll
}) => {
  const [activeTab, setActiveTab] = useState<'manual' | 'ai'>('manual');
  
  // Manual Entry State
  const [unitId, setUnitId] = useState('');
  
  // Custom Dropdown State
  const [openingLayer, setOpeningLayer] = useState('');
  const [showLayerDropdown, setShowLayerDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Relation State
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');

  // AI State
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

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

  const filteredLayers = existingLayers.filter(layer => 
    layer.id.toLowerCase().includes(openingLayer.toLowerCase())
  );

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

    // Handle Opening Layer Creation
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
    // setOpeningLayer(''); // Optional: clear or keep for next entry
  };

  const handleAddRelation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceId || !targetId) return;
    if (sourceId === targetId) return;
    
    const exists = relations.some(r => r.sourceId === sourceId && r.targetId === targetId);
    if (exists) return;

    onAddRelation({
      id: `${sourceId}-CUTS-${targetId}-${Date.now()}`,
      sourceId, 
      targetId, 
      type: RelationType.CUTS 
    });
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
                <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">遗迹编号</label>
                    <input 
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-gray-500 outline-none" 
                        placeholder="如 H1" 
                        value={unitId}
                        onChange={e => setUnitId(e.target.value)}
                        required
                    />
                </div>
                
                <div className="space-y-1 relative" ref={dropdownRef}>
                    <label className="text-xs font-medium text-gray-600">开口层位</label>
                    <div className="relative">
                        <input 
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-gray-500 outline-none" 
                            placeholder="选择或输入 (如 2b)" 
                            value={openingLayer}
                            onChange={e => {
                                setOpeningLayer(e.target.value);
                                setShowLayerDropdown(true);
                            }}
                            onFocus={() => setShowLayerDropdown(true)}
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                            <ChevronDown size={14} />
                        </div>
                    </div>
                    
                    {/* Compact Dropdown */}
                    {showLayerDropdown && (
                        <div className="absolute z-50 w-full bg-white border border-gray-200 rounded mt-1 shadow-lg max-h-32 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                            {filteredLayers.length === 0 && openingLayer && (
                                <div className="p-1.5 text-xs text-blue-600 bg-blue-50">
                                    新建: "{openingLayer}"
                                </div>
                            )}
                            {filteredLayers.map(u => (
                                <div 
                                    key={u.id}
                                    className="px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100 cursor-pointer flex justify-between items-center font-serif"
                                    onClick={() => {
                                        setOpeningLayer(u.id);
                                        setShowLayerDropdown(false);
                                    }}
                                >
                                    <span>{toCircled(u.id)}</span>
                                </div>
                            ))}
                            {filteredLayers.length === 0 && !openingLayer && (
                                <div className="p-1.5 text-xs text-gray-400 text-center">无地层</div>
                            )}
                        </div>
                    )}
                </div>

                <button type="submit" className="w-full bg-gray-800 hover:bg-gray-900 text-white py-1.5 px-4 rounded shadow-sm flex items-center justify-center gap-2 transition-all mt-2 text-sm font-medium">
                  <Plus size={14} /> 添加
                </button>
              </form>

              {/* Unit List */}
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded bg-gray-50 p-1 space-y-1 custom-scrollbar">
                {units.length === 0 && <p className="text-xs text-gray-400 text-center py-2">暂无数据</p>}
                {units.filter(u => u.type !== UnitType.LAYER).slice().reverse().map(u => (
                  <div key={u.id} className="flex justify-between items-center text-xs bg-white px-2 py-1.5 rounded border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-800">{u.id}</span>
                        {u.openingLayerId && <span className="text-[10px] text-gray-500 bg-gray-100 px-1 rounded font-serif">in {toCircled(u.openingLayerId)}</span>}
                    </div>
                    <button onClick={() => onRemoveUnit(u.id)} className="text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            </div>

            {/* Relation Entry */}
            <div className="space-y-3 pt-2">
              <h3 className="font-bold text-gray-800 border-b pb-2 flex items-center gap-2 text-sm">
                  <LinkIcon size={16}/> 2. 遗迹间关系
              </h3>
              <form onSubmit={handleAddRelation} className="space-y-2">
                <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded border border-gray-200">
                  <select className="flex-1 bg-transparent text-xs outline-none font-medium w-full cursor-pointer" value={sourceId} onChange={e => setSourceId(e.target.value)} required>
                    <option value="">晚 (打破者)</option>
                    {units.filter(u => u.type !== UnitType.LAYER).map(u => <option key={u.id} value={u.id}>{u.id}</option>)}
                  </select>
                  
                  <div className="flex flex-col items-center px-1">
                    <ArrowRight size={12} className="text-gray-400" />
                  </div>

                  <select className="flex-1 bg-transparent text-xs outline-none font-medium text-right w-full cursor-pointer" value={targetId} onChange={e => setTargetId(e.target.value)} required>
                    <option value="">早 (被打破)</option>
                    {units.filter(u => u.type !== UnitType.LAYER).map(u => <option key={u.id} value={u.id}>{u.id}</option>)}
                  </select>
                </div>
                <button type="submit" className="w-full bg-gray-800 hover:bg-gray-900 text-white py-1.5 px-4 rounded shadow-sm flex items-center justify-center gap-2 transition-all text-sm font-medium">
                  <Plus size={14} /> 添加关系
                </button>
              </form>

              {/* Relation List */}
              <div className="max-h-40 overflow-y-auto border border-gray-200 rounded bg-gray-50 p-1 space-y-1 custom-scrollbar">
                {relations.length === 0 && <p className="text-xs text-gray-400 text-center py-2">暂无关系</p>}
                {relations.slice().reverse().map(r => (
                  <div key={r.id} className="flex justify-between items-center text-xs bg-white px-2 py-1.5 rounded border border-gray-100 shadow-sm">
                    <span className="text-gray-700 font-mono flex items-center gap-1">
                      <span className="font-bold">{r.sourceId}</span>
                      <ArrowRight size={8} className="text-gray-400"/>
                      <span className="font-bold">{r.targetId}</span>
                    </span>
                    <button onClick={() => onRemoveRelation(r.id)} className="text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={12} /></button>
                  </div>
                ))}
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