import React, { useState, useEffect } from 'react';
import { ArchaeologicalUnit, UnitType } from '../types';
import { X, Save, Trash2, AlertTriangle } from 'lucide-react';

interface EditUnitModalProps {
  unit: ArchaeologicalUnit;
  allUnits: ArchaeologicalUnit[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (oldId: string, newUnit: ArchaeologicalUnit) => void;
  onDelete: (id: string) => void;
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

const EditUnitModal: React.FC<EditUnitModalProps> = ({ 
  unit, allUnits, isOpen, onClose, onSave, onDelete 
}) => {
  const [formData, setFormData] = useState<ArchaeologicalUnit>(unit);
  const [error, setError] = useState('');

  useEffect(() => {
    setFormData(unit);
    setError('');
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-lg shadow-xl w-96 max-w-full overflow-hidden scale-100 animate-in zoom-in-95 duration-200">
        <div className="bg-gray-800 text-white px-4 py-3 flex justify-between items-center">
          <h3 className="font-medium flex items-center gap-2">
            编辑单位: {unit.id}
          </h3>
          <button onClick={onClose} className="hover:text-gray-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
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

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">开口层位 (可选)</label>
            <select
              value={formData.openingLayerId || ''}
              onChange={e => setFormData({ ...formData, openingLayerId: e.target.value || undefined })}
              className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-gray-800 outline-none bg-white font-serif"
            >
              <option value="" className="font-sans">-- 无 --</option>
              {layers.map(l => (
                <option key={l.id} value={l.id}>{toCircled(l.id)}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400">修改此项将改变层位叠压关系。</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 p-2 rounded">
              <AlertTriangle size={14} />
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
             <button
              type="button"
              onClick={() => {
                  if(confirm('确定要删除这个单位及其相关关系吗？')) {
                      onDelete(unit.id);
                      onClose();
                  }
              }}
              className="flex-1 bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 py-2 rounded text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Trash2 size={16} /> 删除
            </button>
            <button
              type="submit"
              className="flex-[2] bg-gray-800 text-white hover:bg-gray-900 py-2 rounded text-sm font-medium flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <Save size={16} /> 保存修改
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditUnitModal;