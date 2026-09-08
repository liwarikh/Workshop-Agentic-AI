import type { Env } from '../env';
import { errorJson, json } from '../lib/http';
import type { ChatMessage, ChatProvider } from './types';
import { runGeminiConversation } from './providers/gemini';
import { runOpenAiCompatConversation } from './providers/openai-compat';

const providers: ChatProvider[] = ['gemini', 'openai', 'openai-compat'];
export function resolveProvider(value: unknown, env: Env): ChatProvider {
  return providers.includes(value as ChatProvider) ? value as ChatProvider : providers.includes(env.DEFAULT_CHAT_PROVIDER as ChatProvider) ? env.DEFAULT_CHAT_PROVIDER as ChatProvider : 'gemini';
}
export function defaultModelFor(provider: ChatProvider, env: Env): string {
  return provider === 'gemini' ? env.GEMINI_MODEL || 'gemini-flash-latest' : provider === 'openai' ? env.OPENAI_MODEL || 'gpt-4o-mini' : env.OPENAI_COMPAT_MODEL || 'gpt-4o-mini';
}
export function buildSystemPrompt(): string { return 'คุณคือผู้ช่วย AI ที่สุภาพ ตอบภาษาไทยเป็นหลัก และตอบตามข้อมูลที่มีอย่างกระชับ'; }
export async function handleChatRoute(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return errorJson('ต้องใช้เมธอด POST', 405);
  let input: { message?: unknown; history?: unknown; provider?: unknown; model?: unknown };
  try { input = await request.json() as typeof input; } catch { return errorJson('รูปแบบ JSON ไม่ถูกต้อง'); }
  if (typeof input.message !== 'string' || !input.message.trim()) return errorJson('กรุณาระบุ message');
  const history = Array.isArray(input.history) ? input.history.filter((m): m is ChatMessage => !!m && typeof m === 'object' && ((m as ChatMessage).role === 'user' || (m as ChatMessage).role === 'assistant') && typeof (m as ChatMessage).content === 'string') : [];
  const provider = resolveProvider(input.provider, env); const model = typeof input.model === 'string' && input.model.trim() ? input.model.trim() : defaultModelFor(provider, env);
  const messages: ChatMessage[] = [...history, { role: 'user', content: input.message }];
  const result = provider === 'gemini' ? await runGeminiConversation(env.GEMINI_API_KEY || '', model, messages, buildSystemPrompt()) : await runOpenAiCompatConversation(provider === 'openai' ? 'https://api.openai.com/v1' : env.OPENAI_COMPAT_BASE_URL || '', provider === 'openai' ? env.OPENAI_API_KEY || '' : env.OPENAI_COMPAT_API_KEY || '', model, messages, buildSystemPrompt());
  return json({ reply: result.reply, provider, model, toolTrace: result.toolTrace });
}