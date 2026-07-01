import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from '../lib/knowledge';

export const runtime = 'edge';
export const maxDuration = 60;

const RATE_LIMIT_MAX_MESSAGES = 30;

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': req.headers.get('origin') || 'https://akonda.pl',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Chat-Secret',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
  }

  const origin = req.headers.get('origin') || '';
  if (origin && !origin.includes('akonda.pl') && !origin.includes('localhost') && !origin.includes('vercel.app')) {
    return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
  }

  const secret = req.headers.get('x-chat-secret');
  if (secret !== process.env.CHAT_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
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

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
