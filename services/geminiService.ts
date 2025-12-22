import { GoogleGenAI, Type } from "@google/genai";
import { ParsedFieldNote, RelationType, UnitType, ArchaeologicalUnit, StratigraphicRelation, ChatResponse } from "../types";

const apiKey = process.env.API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const parseFieldNotes = async (text: string): Promise<ParsedFieldNote | null> => {
  if (!ai) {
    console.error("API Key is missing");
    return null;
  }

  const systemInstruction = `
    你是一位专业的田野考古助手。请根据输入的田野发掘记录，提取生成“系络图”（Connection Diagram）所需的数据。
    
    规则：
    1. **单位类型**：
       - **地层 (LAYER)**：如 "L1", "①", "第2层", "耕土层"。
       - **遗迹 (ASH_PIT, TOMB, etc.)**：如 "H1", "M2", "F3", "J4"。
    
    2. **关系提取**：
       - **开口于/叠压**：如 "H1开口于L1下"，即 L1 叠压 H1 (L1 -> H1)。
       - **打破**：如 "H1打破H2"，即 H1 晚于 H2 (H1 -> H2)。
    
    3. **命名规范**：
       - 地层若为数字（如 1, 2），请保留数字，前端会自动转换为带圈数字（①, ②）。
       - 遗迹保留原编号（如 H1, M5）。
    
    请输出符合 JSON Schema 的数据。
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: text,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            units: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "单位编号 (如 1, H1)" },
                  type: { 
                    type: Type.STRING, 
                    enum: ["LAYER", "ASH_PIT", "TOMB", "HOUSE", "KILN", "WELL", "WALL", "OTHER"],
                    description: "遗迹类型"
                  },
                  description: { type: Type.STRING, description: "简短描述" },
                  openingLayerId: { type: Type.STRING, description: "开口层位编号 (可选)" }
                },
                required: ["id", "type"]
              }
            },
            relations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  younger: { type: Type.STRING, description: "晚/上层单位ID" },
                  older: { type: Type.STRING, description: "早/下层单位ID" },
                  type: { 
                    type: Type.STRING, 
                    enum: ["CUTS", "OVERLAYS", "SAME_AS"],
                    description: "关系类型" 
                  }
                },
                required: ["younger", "older", "type"]
              }
            }
          },
          required: ["units", "relations"]
        }
      }
    });

    if (response.text) {
      const parsed = JSON.parse(response.text) as ParsedFieldNote;
      return parsed;
    }
    return null;

  } catch (error) {
    console.error("Gemini Parse Error:", error);
    return null;
  }
};

const chatWithGraph = async (
  message: string, 
  currentUnits: ArchaeologicalUnit[], 
  currentRelations: StratigraphicRelation[]
): Promise<ChatResponse | null> => {
  if (!ai) return null;

  const contextSummary = `
    当前存在的单位: ${currentUnits.map(u => `${u.id}(${u.type})`).join(', ')}
    当前存在的关系: ${currentRelations.map(r => `${r.sourceId}->${r.targetId}`).join(', ')}
  `;

  const systemInstruction = `
    你是一个考古绘图助手。用户会用自然语言要求修改当前的“系络图”（Harris Matrix）。
    你需要根据用户的指令，返回一个 JSON 对象，包含回复文本 (reply) 和需要执行的操作列表 (operations)。

    当前图表状态:
    ${contextSummary}

    支持的操作 (action):
    1. ADD_UNIT: 添加单位 (需要 id, type)
    2. DELETE_UNIT: 删除单位 (需要 id)
    3. UPDATE_UNIT: 修改单位 (需要 id, 和其他属性)
    4. ADD_RELATION: 添加关系 (需要 sourceId, targetId, type=CUTS/OVERLAYS)
    5. DELETE_RELATION: 删除关系 (需要 sourceId, targetId)

    注意：
    - 如果用户说“H1打破H2”，意味着 H1 晚于 H2，建立 H1 -> H2 的 CUTS 关系。sourceId=H1, targetId=H2。
    - 如果用户说“H1开口于L1下”，意味着 L1 叠压 H1。可以是 ADD_RELATION L1 -> H1，或者 UPDATE_UNIT H1 的 openingLayerId=L1。推荐使用 ADD_RELATION。
    - UnitType: LAYER (地层), ASH_PIT (灰坑), TOMB, HOUSE, WALL, WELL.
    - RelationType: CUTS (打破), OVERLAYS (叠压).
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: message,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING, description: "给用户的回复，解释做了什么修改" },
            operations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  action: { type: Type.STRING, enum: ["ADD_UNIT", "DELETE_UNIT", "UPDATE_UNIT", "ADD_RELATION", "DELETE_RELATION"] },
                  id: { type: Type.STRING, description: "For Unit ops" },
                  data: { 
                    type: Type.OBJECT, 
                    description: "For ADD_UNIT/UPDATE_UNIT",
                    properties: {
                      id: { type: Type.STRING },
                      type: { type: Type.STRING, enum: ["LAYER", "ASH_PIT", "TOMB", "HOUSE", "KILN", "WELL", "WALL", "OTHER"] },
                      description: { type: Type.STRING },
                      openingLayerId: { type: Type.STRING }
                    }
                  },
                  sourceId: { type: Type.STRING, description: "For Relation ops" },
                  targetId: { type: Type.STRING, description: "For Relation ops" },
                  type: { type: Type.STRING, enum: ["CUTS", "OVERLAYS"], description: "For Relation ops" }
                }
              }
            }
          },
          required: ["reply", "operations"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as ChatResponse;
    }
    return null;
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    return null;
  }
};

export const geminiService = {
  parseFieldNotes,
  chatWithGraph
};