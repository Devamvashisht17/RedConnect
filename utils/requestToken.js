const crypto = require('crypto');

function normalizeToken(token) {
  if (token == null) return '';
  try {
    return decodeURIComponent(String(token).trim());
  } catch {
    return String(token).trim();
  }
}

function healthCheckToken(requestId, donorId) {
  return crypto
    .createHmac('sha256', process.env.JWT_SECRET || 'fallback-secret')
    .update(`${requestId}:${donorId}`)
    .digest('hex');
}

function verifyHealthCheckToken(requestId, donorId, token) {
  const received = normalizeToken(token);
  if (!received) return false;
  const expected = healthCheckToken(requestId, donorId);
  if (received.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(received, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

module.exports = { healthCheckToken, verifyHealthCheckToken, normalizeToken };
