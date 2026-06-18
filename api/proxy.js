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

  // Upload une image base64 sur Imgur (anonyme, client_id public)
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
    if (!d.success) throw new Error('Imgur upload échoué : ' + JSON.stringify(d));
    return d.data.link;
  }

  try {
    // Upload les 2 images en parallèle
    let personUrl, garmentUrl;
    try {
      [personUrl, garmentUrl] = await Promise.all([
        uploadToImgur(personBase64),
        uploadToImgur(garmentBase64),
      ]);
    } catch (uploadErr) {
      return res.status(500).json({ error: 'Erreur upload image : ' + uploadErr.message });
    }

    // Appel LightX virtual try-on
    const lxResp = await fetch('https://api.lightxeditor.com/external/api/v2/aivirtualtryon', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ imageUrl: personUrl, styleImageUrl: garmentUrl }),
    });

    const lxData = await lxResp.json();
    if (!lxResp.ok) {
      return res.status(lxResp.status).json({
        error: lxData.message || lxData.error || JSON.stringify(lxData),
      });
    }

    const requestId = lxData.body?.requestId;
    if (!requestId) {
      return res.status(500).json({ error: 'Pas de requestId LightX', raw: lxData });
    }

    // Polling toutes les 3s, max 40 fois (~2 min)
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const pr = await fetch(
        `https://api.lightxeditor.com/external/api/v1/order-status?orderId=${requestId}`,
        { headers: { 'x-api-key': apiKey } }
      );
      const pd = await pr.json();
      const st = pd.body?.status;

      if (st === 'active' && pd.body?.output) {
        return res.status(200).json({ output: pd.body.output });
      } else if (st === 'failed') {
        return res.status(500).json({ error: 'Génération échouée', raw: pd });
      }
      // 'init' ou 'processing' → on continue
    }

    return res.status(408).json({ error: 'Temps dépassé — réessaie' });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
