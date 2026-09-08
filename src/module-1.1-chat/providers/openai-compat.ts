import type { ChatMessage, ChatTurnResult, McpTool, ToolCaller } from '../types';

export async function runOpenAiCompatConversation(baseUrl: string, apiKey: string, model: string, messages: ChatMessage[], systemPrompt: string, tools: McpTool[] = [], callTool?: ToolCaller): Promise<ChatTurnResult> {
  if (!baseUrl || baseUrl === 'Replace base url') return { reply: 'ยังไม่ได้ตั้งค่า base URL ของ OpenAI-compatible gateway', toolTrace: [] };
  if (!apiKey) return { reply: 'ยังไม่ได้ตั้งค่า API key ของ provider นี้ กรุณาตั้งค่าก่อนใช้งาน', toolTrace: [] };
  const apiMessages: Array<Record<string, unknown>> = [{ role: 'system', content: systemPrompt }, ...messages];
  const toolTrace: ChatTurnResult['toolTrace'] = [];
  for (let round = 0; round < 4; round += 1) {
    const body: Record<string, unknown> = { model, messages: apiMessages };
    if (tools.length) { body.tools = tools.map((t) => ({ type: 'function', function: { name: `${t.serverId}__${t.name}`, description: t.description, parameters: t.inputSchema } })); body.tool_choice = 'auto'; }
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body) });
    if (!response.ok) return { reply: `OpenAI-compatible gateway ตอบกลับผิดพลาด (${response.status})`, toolTrace };
    const data = await response.json() as { choices?: Array<{ message?: { role?: string; content?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }> };
    const message = data.choices?.[0]?.message; const call = message?.tool_calls?.[0];
    if (!call || !callTool) return { reply: message?.content ?? 'Provider ไม่ได้ส่งข้อความตอบกลับ', toolTrace };
    const tool = tools.find((t) => `${t.serverId}__${t.name}` === call.function.name);
    if (!tool) return { reply: 'ไม่พบเครื่องมือที่โมเดลร้องขอ', toolTrace };
    let args: unknown; try { args = JSON.parse(call.function.arguments || '{}'); } catch { return { reply: 'รูปแบบ arguments จากโมเดลไม่ถูกต้อง', toolTrace }; }
    const result = await callTool(tool, args); toolTrace.push({ serverId: tool.serverId, toolName: tool.name, arguments: args, result });
    apiMessages.push({ ...message, role: 'assistant' }, { role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
  }
  return { reply: 'การเรียกเครื่องมือเกินจำนวนรอบที่กำหนด', toolTrace };
}