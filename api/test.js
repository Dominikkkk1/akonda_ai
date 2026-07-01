const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: 'claude-3-5-sonnet-latest',
      max_tokens: 50,
      messages: [{ role: 'user', content: 'Say "hello" in Polish' }],
    });
    res.json({ ok: true, text: msg.content[0].text });
  } catch (err) {
    res.json({ ok: false, error: err.message, status: err.status });
  }
};
