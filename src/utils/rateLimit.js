const hits = new Map();

const MAX_PER_MINUTE = 8;

function isRateLimited(phone) {
  const now = Date.now();
  const windowMs = 60 * 1000;

  const data = hits.get(phone) || [];
  const recent = data.filter(time => now - time < windowMs);

  recent.push(now);
  hits.set(phone, recent);

  return recent.length > MAX_PER_MINUTE;
}

module.exports = { isRateLimited };