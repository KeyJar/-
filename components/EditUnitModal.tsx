import React, { useState, useEffect } from 'react';
import { ArchaeologicalUnit, UnitType, StratigraphicRelation, RelationType } from '../types';
import { X, Save, Trash2, AlertTriangle, Link as LinkIcon, Plus, MinusCircle } from 'lucide-react';

interface EditUnitModalProps {
  unit: ArchaeologicalUnit;
  allUnits: ArchaeologicalUnit[];
  relations: StratigraphicRelation[]; // Added prop
  isOpen: boolean;
  onClose: () => void;
  onSave: (oldId: string, newUnit: ArchaeologicalUnit) => void;
  onDelete: (id: string) => void;
  onAddRelation: (relation: StratigraphicRelation) => void; // Added prop
  onRemoveRelation: (id: string) => void; // Added prop
}

// Helper to convert to circled number
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

// Preset layers 1-9
const PRESET_LAYERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

const EditUnitModal: React.FC<EditUnitModalProps> = ({ 
  unit, allUnits, relations, isOpen, onClose, onSave, onDelete, onAddRelation, onRemoveRelation
}) => {
  const [formData, setFormData] = useState<ArchaeologicalUnit>(unit);
  const [error, setError] = useState('');
  
  // Local state for adding relations inside modal
  const [newCutTarget, setNewCutTarget] = useState('');
  const [newCutBySource, setNewCutBySource] = useState('');

  useEffect(() => {
    setFormData(unit);
    setError('');
    setNewCutTarget('');
    setNewCutBySource('');
  }, [unit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.id.trim()) {
      setError('编号不能为空');
      return;
    }
    // Check if ID exists (only if ID changed)
    if (formData.id !== unit.id && allUnits.some(u => u.id === formData.id)) {
      setError('该编号已存在');
      return;
    }
    onSave(unit.id, formData);
    onClose();
  };

  const layers = allUnits.filter(u => u.type === UnitType.LAYER && u.id !== formData.id);
  
  // Combine existing layers with presets
  const availableLayers = Array.from(new Set([...PRESET_LAYERS, ...layers.map(l => l.id)]));

  // Relations Logic
  const myCuts = relations.filter(r => r.sourceId === unit.id);
  const myCutBy = relations.filter(r => r.targetId === unit.id);

  // Filter candidates for new relations (exclude self, layers, and already related)
  const availableTargetsForCuts = allUnits
      .filter(u => u.type !== UnitType.LAYER && u.id !== unit.id && !myCuts.some(r => r.targetId === u.id));
  
  const availableSourcesForCutBy = allUnits
      .filter(u => u.type !== UnitType.LAYER && u.id !== unit.id && !myCutBy.some(r => r.sourceId === u.id));

  const handleAddCut = () => {
      if(!newCutTarget) return;
      onAddRelation({
          id: `${unit.id}-CUTS-${newCutTarget}-${Date.now()}`,
          sourceId: unit.id,
          targetId: newCutTarget,
          type: RelationType.CUTS
      });
      setNewCutTarget('');
  };

  const handleAddCutBy = () => {
      if(!newCutBySource) return;
      onAddRelation({
          id: `${newCutBySource}-CUTS-${unit.id}-${Date.now()}`,
          sourceId: newCutBySource,
          targetId: unit.id,
          type: RelationType.CUTS
      });
      setNewCutBySource('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-lg shadow-xl w-[500px] max-w-full overflow-hidden scale-100 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="bg-gray-800 text-white px-4 py-3 flex justify-between items-center flex-shrink-0">
          <h3 className="font-medium flex items-center gap-2">
            编辑单位: {unit.id}
          </h3>
          <button onClick={onClose} className="hover:text-gray-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 custom-scrollbar">
            <form id="edit-form" onSubmit={handleSubmit} className="space-y-4">
            
            {/* Basic Info Section */}
            <div className="space-y-3 border-b pb-4">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">基本信息</h4>
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">编号</label>
                        <input
                        value={formData.id}
                        onChange={e => setFormData({ ...formData, id: e.target.value })}
                        className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-gray-800 outline-none"
                        placeholder="如 H1"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">类型</label>
                        <select
                        value={formData.type}
                        onChange={e => setFormData({ ...formData, type: e.target.value as UnitType })}
                        className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-gray-800 outline-none bg-white"
                        >
                        <option value={UnitType.LAYER}>地层</option>
                        <option value={UnitType.ASH_PIT}>灰坑</option>
                        <option value={UnitType.TOMB}>墓葬</option>
                        <option value={UnitType.HOUSE}>房址</option>
                        <option value={UnitType.WELL}>水井</option>
                        <option value={UnitType.WALL}>墙体</option>
                        <option value={UnitType.KILN}>窑址</option>
                        <option value={UnitType.OTHER}>其他</option>
                        </select>
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase">开口层位</label>
                    <select
                        value={formData.openingLayerId || ''}
                        onChange={e => setFormData({ ...formData, openingLayerId: e.target.value || undefined })}
                        className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-gray-800 outline-none bg-white font-serif"
                    >
                        <option value="" className="font-sans">-- 无 --</option>
                        {availableLayers.map(lid => (
                            <option key={lid} value={lid}>{toCircled(lid)}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Relations Section */}
            {unit.type !== UnitType.LAYER && (
                <div className="space-y-4 pb-2">
                     <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                         <LinkIcon size={12}/> 打破关系管理
                     </h4>
                     
                     {/* Cuts Relations */}
                     <div className="bg-gray-50 p-2 rounded border border-gray-100">
                         <div className="text-xs font-medium mb-2 text-gray-700">它打破了 (Cuts):</div>
                         <div className="flex flex-wrap gap-2 mb-2">
                             {myCuts.length === 0 && <span className="text-xs text-gray-400 italic">无</span>}
                             {myCuts.map(r => (
                                 <div key={r.id} className="bg-white border border-gray-200 text-xs px-2 py-1 rounded-full flex items-center gap-1 shadow-sm">
                                     <span>{r.targetId}</span>
                                     <button type="button" onClick={() => onRemoveRelation(r.id)} className="text-gray-400 hover:text-red-500"><X size={10}/></button>
                                 </div>
                             ))}
                         </div>
                         <div className="flex gap-1">
                             <select 
                                className="flex-1 text-xs border border-gray-300 rounded p-1"
                                value={newCutTarget}
                                onChange={e => setNewCutTarget(e.target.value)}
                             >
                                 <option value="">+ 添加打破对象</option>
                                 {availableTargetsForCuts.map(u => <option key={u.id} value={u.id}>{u.id}</option>)}
                             </select>
                             <button type="button" onClick={handleAddCut} disabled={!newCutTarget} className="bg-gray-200 hover:bg-gray-300 text-gray-700 rounded px-2 disabled:opacity-50"><Plus size={14}/></button>
                         </div>
                     </div>

                     {/* Cut By Relations */}
                     <div className="bg-gray-50 p-2 rounded border border-gray-100">
                         <div className="text-xs font-medium mb-2 text-gray-700">它被...打破 (Cut By):</div>
                         <div className="flex flex-wrap gap-2 mb-2">
                             {myCutBy.length === 0 && <span className="text-xs text-gray-400 italic">无</span>}
                             {myCutBy.map(r => (
                                 <div key={r.id} className="bg-white border border-gray-200 text-xs px-2 py-1 rounded-full flex items-center gap-1 shadow-sm">
                                     <span>{r.sourceId}</span>
                                     <button type="button" onClick={() => onRemoveRelation(r.id)} className="text-gray-400 hover:text-red-500"><X size={10}/></button>
                                 </div>
                             ))}
                         </div>
                         <div className="flex gap-1">
                             <select 
                                className="flex-1 text-xs border border-gray-300 rounded p-1"
                                value={newCutBySource}
                                onChange={e => setNewCutBySource(e.target.value)}
                             >
                                 <option value="">+ 添加打破者</option>
                                 {availableSourcesForCutBy.map(u => <option key={u.id} value={u.id}>{u.id}</option>)}
                             </select>
                             <button type="button" onClick={handleAddCutBy} disabled={!newCutBySource} className="bg-gray-200 hover:bg-gray-300 text-gray-700 rounded px-2 disabled:opacity-50"><Plus size={14}/></button>
                         </div>
                     </div>
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 p-2 rounded">
                <AlertTriangle size={14} />
                {error}
                </div>
            )}
            </form>
        </div>

        <div className="flex gap-3 p-4 border-t bg-gray-50 flex-shrink-0">
             <button
              type="button"
              onClick={() => {
                  if(confirm('确定要删除这个单位及其相关关系吗？')) {
                      onDelete(unit.id);
                      onClose();
                  }
              }}
              className="flex-1 bg-white text-red-600 border border-red-200 hover:bg-red-50 py-2 rounded text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Trash2 size={16} /> 删除单位
            </button>
            <button
              type="submit"
              form="edit-form"
              className="flex-[2] bg-gray-800 text-white hover:bg-gray-900 py-2 rounded text-sm font-medium flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <Save size={16} /> 保存修改
            </button>
        </div>
      </div>
    </div>
  );
};

export default EditUnitModal;