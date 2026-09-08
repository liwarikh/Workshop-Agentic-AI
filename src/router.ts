import type { Env } from './env';
import { errorJson, json } from './lib/http';
import { handleChatRoute } from './module-1.1-chat/chat-routes';

export function route(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === '/healthz') return Promise.resolve(json({ ok: true }));
  if (path === '/api/chat') return handleChatRoute(request, env);
  return env.ASSETS ? env.ASSETS.fetch(request) : Promise.resolve(errorJson('ไม่พบ static assets', 404));
}