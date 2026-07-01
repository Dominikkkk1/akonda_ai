module.exports = function handler(req, res) {
  res.json({
    ok: true,
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    hasSecret: !!process.env.CHAT_SECRET,
    secretLength: (process.env.CHAT_SECRET || '').length,
    method: req.method
  });
};
