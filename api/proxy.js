export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { personBase64, garmentBase64, apiKey } = req.body;
    if (!personBase64 || !garmentBase64 || !apiKey) {
      return res.status(400).json({ error: 'Champs manquants' });
    }

    // Upload sur freeimage.host (service public gratuit)
    async function uploadImg(base64Data) {
      const cleanB64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
      const form = new URLSearchParams();
      form.append('key', '6d207e02198a847aa98d0a2a901485a5');
      form.append('action', 'upload');
      form.append('source', cleanB64);
      form.append('format', 'json');
      const r = await fetch('https://freeimage.host/api/1/upload', {
        method: 'POST',
        body: form,
      });
      const d = await r.json();
      if (d.status_code !== 200) throw new Error('Upload image échoué');
      return d.image.url;
    }

    const [personUrl, garmentUrl] = await Promise.all([
      uploadImg(personBase64),
      uploadImg(garmentBase64),
    ]);

    // Appel LightX
    const lxResp = await fetch('https://api.lightxeditor.com/external/api/v2/aivirtualtryon', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ imageUrl: personUrl, styleImageUrl: garmentUrl }),
    });

    const lxData = await lxResp.json();
    if (!lxResp.ok) return res.status(lxResp.status).json({ error: lxData.message || JSON.stringify(lxData) });

    const requestId = lxData.body?.requestId;
    if (!requestId) return res.status(500).json({ error: 'Pas de requestId', raw: lxData });

    // Polling résultat
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const pr = await fetch(`https://api.lightxeditor.com/external/api/v1/order-status?orderId=${requestId}`, {
        headers: { 'x-api-key': apiKey },
      });
      const pd = await pr.json();
      const st = pd.body?.status;
      if (st === 'active' && pd.body?.output) return res.status(200).json({ output: pd.body.output });
      if (st === 'failed') return res.status(500).json({ error: 'Génération échouée', raw: pd });
    }

    return res.status(408).json({ error: 'Temps dépassé — réessaie' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
