import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from '../lib/knowledge';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const maxDuration = 60;

const RATE_LIMIT_MAX_MESSAGES = 30;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = (req.headers.origin as string) || 'https://akonda.pl';

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Chat-Secret');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (origin && !origin.includes('akonda.pl') && !origin.includes('localhost') && !origin.includes('vercel.app')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const secret = req.headers['x-chat-secret'];
  if (secret !== process.env.CHAT_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body;
  if (!body?.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ error: 'Messages required' });
  }

  if (body.messages.length > RATE_LIMIT_MAX_MESSAGES) {
    return res.status(429).json({ error: 'Too many messages' });
  }

  const messages = body.messages.map((m: any) => ({
    role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
    content: String(m.content).slice(0, 2000),
  }));

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    });

    stream.on('text', (text) => {
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    stream.on('end', () => {
      res.write('data: [DONE]\n\n');
      res.end();
    });

    stream.on('error', (err) => {
      res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
      res.end();
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
