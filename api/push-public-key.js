export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  if (!publicKey) return res.status(500).json({ error: 'VAPID_PUBLIC_KEY belum disetel di Environment Variables.' });
  return res.status(200).json({ publicKey });
}
