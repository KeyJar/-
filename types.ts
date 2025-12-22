export enum RelationType {
  CUTS = 'CUTS', // 打破 (晚打破早)
  OVERLAYS = 'OVERLAYS', // 叠压 (晚叠压早)
  SAME_AS = 'SAME_AS', // 等同 (共时)
  PART_OF = 'PART_OF', // 包含 (如：房址包含垫土)
}

export enum UnitType {
  LAYER = 'LAYER', // 地层 (Use Circles)
  ASH_PIT = 'ASH_PIT', // 灰坑 (Use Rects)
  TOMB = 'TOMB', // 墓葬
  HOUSE = 'HOUSE', // 房址
  KILN = 'KILN', // 窑址
  WELL = 'WELL', // 水井
  WALL = 'WALL', // 墙体
  OTHER = 'OTHER', // 其他
}

export interface ArchaeologicalUnit {
  id: string; // 编号 (如 "1", "H1")
  type: UnitType; // 类型
  description?: string; // 描述
  openingLayerId?: string; // 开口层位 (隐含叠压关系: OpeningLayer -> ThisUnit)
}

export interface StratigraphicRelation {
  id: string;
  sourceId: string; // 晚 (Younger/Upper)
  targetId: string; // 早 (Older/Lower)
  type: RelationType;
}

export interface GraphNode extends ArchaeologicalUnit {
  x: number;
  y: number;
  rank?: number;
}

export interface GraphLink {
  source: GraphNode;
  target: GraphNode;
  type: RelationType;
}

export interface ParsedFieldNote {
  units: ArchaeologicalUnit[];
  relations: {
    younger: string;
    older: string;
    type: RelationType;
  }[];
}

// Chat related types
export type GraphOperation = 
  | { action: 'ADD_UNIT'; data: ArchaeologicalUnit }
  | { action: 'DELETE_UNIT'; id: string }
  | { action: 'UPDATE_UNIT'; id: string; data: Partial<ArchaeologicalUnit> }
  | { action: 'ADD_RELATION'; sourceId: string; targetId: string; type: RelationType }
  | { action: 'DELETE_RELATION'; sourceId: string; targetId: string };

export interface ChatResponse {
  reply: string;
  operations: GraphOperation[];
}

export interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
}