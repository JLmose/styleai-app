export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { requestId, apiKey } = req.query;
  if (!requestId || !apiKey) {
    return res.status(400).json({ error: 'requestId et apiKey requis' });
  }

  try {
    const pr = await fetch(
      `https://api.lightxeditor.com/external/api/v1/order-status?orderId=${requestId}`,
      { headers: { 'x-api-key': apiKey } }
    );
    const pd = await pr.json();
    return res.status(200).json(pd);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
