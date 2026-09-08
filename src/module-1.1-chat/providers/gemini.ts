import type { ChatMessage, ChatTurnResult, McpTool, ToolCaller } from '../types';
import { toGeminiSchema } from '../tool-schema';

type Part = { text?: string; functionCall?: { name: string; args?: unknown } };

export async function runGeminiConversation(
  apiKey: string, model: string, messages: ChatMessage[], systemPrompt: string,
  tools: McpTool[] = [], callTool?: ToolCaller,
): Promise<ChatTurnResult> {
  if (!apiKey) return { reply: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY กรุณาตั้งค่า key ก่อนใช้งาน Gemini', toolTrace: [] };
  const contents: Array<Record<string, unknown>> = [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${messages.map((m) => `${m.role}: ${m.content}`).join('\n')}` }] }];
  const toolTrace: ChatTurnResult['toolTrace'] = [];
  for (let round = 0; round < 4; round += 1) {
    const body: Record<string, unknown> = { contents };
    if (tools.length) body.tools = [{ function_declarations: tools.map((t) => ({ name: `${t.serverId}__${t.name}`, description: t.description, parameters: toGeminiSchema(t.inputSchema) })) }];
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) return { reply: `Gemini ตอบกลับผิดพลาด (${response.status})`, toolTrace };
    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Part[] } }> };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const call = parts.find((part) => part.functionCall)?.functionCall;
    if (!call || !callTool) return { reply: parts.map((part) => part.text ?? '').join('') || 'Gemini ไม่ได้ส่งข้อความตอบกลับ', toolTrace };
    const tool = tools.find((item) => `${item.serverId}__${item.name}` === call.name);
    if (!tool) return { reply: 'ไม่พบเครื่องมือที่โมเดลร้องขอ', toolTrace };
    const result = await callTool(tool, call.args ?? {});
    toolTrace.push({ serverId: tool.serverId, toolName: tool.name, arguments: call.args ?? {}, result });
    contents.push({ role: 'model', parts }, { role: 'user', parts: [{ functionResponse: { name: call.name, response: { result } } }] });
  }
  return { reply: 'การเรียกเครื่องมือเกินจำนวนรอบที่กำหนด', toolTrace };
}