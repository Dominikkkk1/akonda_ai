const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  const key = process.env.ANTHROPIC_API_KEY || '';
  try {
    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 50,
      messages: [{ role: 'user', content: 'Say hi' }],
    });
    res.json({ ok: true, text: msg.content[0].text });
  } catch (err) {
    res.json({
      ok: false,
      error: err.message,
      status: err.status,
      keyPrefix: key.slice(0, 10) + '...',
      keyLength: key.length,
    });
  }
};
