module.exports = async function handler(req, res) {
  const key = process.env.ANTHROPIC_API_KEY || '';
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'Say hi' }],
      }),
    });
    const data = await response.json();
    res.json({ status: response.status, data });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
};
