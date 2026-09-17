module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_ANON_KEY || '';
  let publishable = key.startsWith('sb_publishable_');
  if (!publishable && key.split('.').length === 3) {
    try { publishable = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon'; } catch (_) {}
  }
  // Never expose service-role or secret keys to the browser.
  const configured = /^https:\/\//.test(url) && publishable;
  return res.status(200).json({SUPABASE_URL:configured ? url : '', SUPABASE_ANON_KEY:configured ? key : ''});
};
