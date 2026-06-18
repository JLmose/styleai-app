export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { personBase64, garmentBase64, apiKey } = req.body || {};
  if (!personBase64 || !garmentBase64 || !apiKey) {
    return res.status(400).json({ error: 'Champs manquants' });
  }

  async function uploadToImgur(base64Data) {
    const cleanB64 = base64Data.replace(/^data:image\/[a-z+]+;base64,/, '');
    const r = await fetch('https://api.imgur.com/3/image', {
      method: 'POST',
      headers: {
        'Authorization': 'Client-ID 546c25a59c58ad7',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image: cleanB64, type: 'base64' }),
    });
    const d = await r.json();
    if (!d.success) throw new Error('Imgur : ' + JSON.stringify(d));
    return d.data.link;
  }

  try {
    let personUrl, garmentUrl;
    try {
      [personUrl, garmentUrl] = await Promise.all([
        uploadToImgur(personBase64),
        uploadToImgur(garmentBase64),
      ]);
    } catch (e) {
      return res.status(500).json({ error: 'Upload image échoué : ' + e.message });
    }

    const lxResp = await fetch('https://api.lightxeditor.com/external/api/v2/aivirtualtryon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ imageUrl: personUrl, styleImageUrl: garmentUrl }),
    });

    const lxData = await lxResp.json();
    if (!lxResp.ok) {
      return res.status(lxResp.status).json({ error: lxData.message || JSON.stringify(lxData) });
    }

    const requestId =
      lxData.body?.requestId || lxData.requestId ||
      lxData.body?.orderId  || lxData.orderId;

    if (!requestId) {
      return res.status(500).json({ error: 'Pas de requestId', raw: lxData });
    }

    // On retourne juste le requestId — le browser va poller lui-même
    return res.status(200).json({ requestId });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
