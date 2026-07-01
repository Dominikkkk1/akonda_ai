import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from '../lib/knowledge';

const client = new Anthropic();

const RATE_LIMIT_MAX_MESSAGES = 30;

export const config = { maxDuration: 60 };

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const origin = req.headers.get('origin') || '';
  if (!origin.includes('akonda.pl') && !origin.includes('localhost')) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const secret = req.headers.get('x-chat-secret');
  if (secret !== process.env.CHAT_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { messages: Array<{ role: string; content: string }>; sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: 'Messages required' }, { status: 400 });
  }

  if (body.messages.length > RATE_LIMIT_MAX_MESSAGES) {
    return Response.json({ error: 'Too many messages in session' }, { status: 429 });
  }

  // Sanitize messages
  const messages = body.messages.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
    content: String(m.content).slice(0, 2000),
  }));

  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': origin,
    },
  });
}
