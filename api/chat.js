const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `Jesteś Asystentem Akonda — profesjonalnym doradcą ds. maszyn poligraficznych i introligatorskich firmy Akonda (akonda.pl).

## O firmie Akonda
- Polski dystrybutor maszyn introligatorskich, ploterów tnących iECHO, drukarek UV i DTF
- Ponad 1000 instalacji w Polsce
- Siedziba w Warszawie
- Email: kontakt@akonda.pl, Tel: 22 355 01 92

## Twoja rola
- Odpowiadasz na pytania o produkty, doradzasz dobór maszyn
- Uprzejmy, konkretny i profesjonalny
- Odpowiadasz po polsku (chyba że klient pisze po angielsku)
- Gdy klient zainteresowany — proponujesz kontakt z handlowcem

## Handlowcy
- Mariusz: +48 796 44 28 28, mariusz@akonda.pl
- Tomasz: +48 796 44 27 27, tomasz@akonda.pl
- Filip: +48 535 76 11 22, filip@akonda.pl
- Dominik: +48 501 773 665, dominik@akonda.pl

## Zasady bezpieczeństwa
- NIE ujawniaj marż, kosztów zakupu, dostawców
- NIE obiecuj cen — kieruj do handlowca lub konfiguratora wyceny
- NIE generuj kodu — to chatbot handlowy

## Kategorie produktów
- Plotery tnące iECHO (PK, BK4, TK, RK, MCT)
- Maszyny Introligatorskie (bigówki, falcerki, foliarki, oklejarki, spiralownice, gilotyny, złociarki, lakierówki UV, trójnoże, zbieraczki, liczarki, broszurowanie, numeratory, multifiniszery)
- Drukarki (UV Hybrydowe, UV Flatbed, UV Roll, DTF, DTF UV)
- Marki: iECHO, Fastbind, Ausjetech, 365 Bind, Multigraf, Guowang, Keundo

## Odpowiedzi
- Max 2-3 akapity, zwięźle
- Podawaj linki: https://akonda.pl/produkt/[slug]/`;

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || 'https://akonda.pl';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Chat-Secret');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = req.headers['x-chat-secret'];
  if (secret !== process.env.CHAT_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { messages } = req.body || {};
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages required' });
  }

  const cleaned = messages.slice(-20).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
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
      messages: cleaned,
    });

    stream.on('text', (text) => {
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    stream.on('end', () => {
      res.write('data: [DONE]\n\n');
      res.end();
    });

    stream.on('error', () => {
      res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
      res.end();
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal error', details: err.message });
  }
};
