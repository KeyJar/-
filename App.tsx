import React, { useState } from 'react';
import MatrixCanvas from './components/MatrixCanvas';
import UnitForm from './components/UnitForm';
import ChatWidget from './components/ChatWidget';
import EditUnitModal from './components/EditUnitModal';
import { ArchaeologicalUnit, StratigraphicRelation, GraphOperation, RelationType } from './types';

const App: React.FC = () => {
  const [units, setUnits] = useState<ArchaeologicalUnit[]>([]);
  const [relations, setRelations] = useState<StratigraphicRelation[]>([]);
  
  // Edit State
  const [editingUnit, setEditingUnit] = useState<ArchaeologicalUnit | null>(null);

  const addUnit = (unit: ArchaeologicalUnit) => {
    setUnits(prev => {
        if (prev.some(u => u.id === unit.id)) return prev;
        return [...prev, unit];
    });
  };

  const removeUnit = (id: string) => {
    setUnits(prev => prev.filter(u => u.id !== id));
    setRelations(prev => prev.filter(r => r.sourceId !== id && r.targetId !== id));
  };

  const addRelation = (relation: StratigraphicRelation) => {
    setRelations(prev => {
        if (prev.some(r => r.sourceId === relation.sourceId && r.targetId === relation.targetId)) return prev;
        return [...prev, relation];
    });
  };

  const removeRelation = (id: string) => {
    setRelations(prev => prev.filter(r => r.id !== id));
  };

  const handleClearAll = () => {
      setUnits([]);
      setRelations([]);
  };

  const handleUpdateUnit = (oldId: string, newUnit: ArchaeologicalUnit) => {
      // 1. Update Units List
      setUnits(prev => prev.map(u => u.id === oldId ? newUnit : u));

      // 2. If ID changed, cascade update to relations and other units' openingLayerId
      if (oldId !== newUnit.id) {
          // Update Relations
          setRelations(prev => prev.map(r => ({
              ...r,
              sourceId: r.sourceId === oldId ? newUnit.id : r.sourceId,
              targetId: r.targetId === oldId ? newUnit.id : r.targetId,
          })));

          // Update Opening Layer References (if this unit was a layer for others)
          setUnits(prev => prev.map(u => {
              if (u.openingLayerId === oldId) {
                  return { ...u, openingLayerId: newUnit.id };
              }
              return u;
          }));
      }
  };

  const handleBulkImport = (newUnits: ArchaeologicalUnit[], newRelations: StratigraphicRelation[]) => {
    setUnits(prev => {
      const existingIds = new Set(prev.map(u => u.id));
      const uniqueNewUnits = newUnits.filter(u => !existingIds.has(u.id));
      return [...prev, ...uniqueNewUnits];
    });
    setRelations(prev => [...prev, ...newRelations]);
  };

  // Handle operations from AI Chat
  const handleGraphOperations = (ops: GraphOperation[]) => {
    ops.forEach(op => {
      switch (op.action) {
        case 'ADD_UNIT':
          if (op.data) addUnit(op.data);
          break;
        case 'DELETE_UNIT':
          if (op.id) removeUnit(op.id);
          break;
        case 'UPDATE_UNIT':
          if (op.id && op.data) {
             setUnits(prev => prev.map(u => u.id === op.id ? { ...u, ...op.data } : u));
          }
          break;
        case 'ADD_RELATION':
          if (op.sourceId && op.targetId) {
            addRelation({
                id: `${op.sourceId}-${op.type}-${op.targetId}-${Date.now()}`,
                sourceId: op.sourceId,
                targetId: op.targetId,
                type: op.type || RelationType.CUTS
            });
          }
          break;
        case 'DELETE_RELATION':
           if (op.sourceId && op.targetId) {
               setRelations(prev => prev.filter(r => !(r.sourceId === op.sourceId && r.targetId === op.targetId)));
           }
           break;
      }
    });
  };

  return (
    <div className="flex h-screen w-screen bg-clay-50 overflow-hidden">
      {/* Sidebar: Data Entry */}
      <div className="w-96 flex-shrink-0 z-20">
        <UnitForm 
          units={units}
          relations={relations}
          onAddUnit={addUnit}
          onRemoveUnit={removeUnit}
          onAddRelation={addRelation}
          onRemoveRelation={removeRelation}
          onBulkImport={handleBulkImport}
          onClearAll={handleClearAll}
        />
      </div>

      {/* Main Area: Visualization */}
      <main className="flex-1 relative p-4 flex flex-col">
         {/* Toolbar / Header */}
         <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-clay-50/50 to-transparent pointer-events-none z-10" />
         
         {units.length === 0 ? (
           <div className="flex-1 flex flex-col items-center justify-center text-clay-400 border-2 border-dashed border-clay-200 rounded-lg m-4">
             <div className="text-6xl mb-4">⛏️</div>
             <p className="text-lg font-medium">暂无数据</p>
             <p className="text-sm mt-2">请在左侧添加遗迹单位或使用 AI 导入田野记录</p>
           </div>
         ) : (
           <MatrixCanvas 
             units={units} 
             relations={relations} 
             onNodeClick={setEditingUnit}
           />
         )}
         
         <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-clay-400 text-xs pointer-events-none">
            Powered by Gemini & D3.js | Strictly follows Field Archaeology Regulations
         </div>
         
         {/* AI Chat Widget */}
         <ChatWidget 
            units={units} 
            relations={relations} 
            onApplyOperations={handleGraphOperations} 
         />

         {/* Edit Modal */}
         {editingUnit && (
             <EditUnitModal 
                unit={editingUnit}
                allUnits={units}
                isOpen={!!editingUnit}
                onClose={() => setEditingUnit(null)}
                onSave={handleUpdateUnit}
                onDelete={removeUnit}
             />
         )}
      </main>
    </div>
  );
};

export default App;