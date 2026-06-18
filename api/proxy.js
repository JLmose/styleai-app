export const config = { runtime: 'edge' };

const LIGHTX_API_KEY = 'bf8f904d12974d389c10f9e324f85c96_06e516b72750409a9067d3435766ada0_andoraitools';
const LIGHTX_TRYON_URL = 'https://api.lightxeditor.com/external/api/v2/aivirtualtryon';
const IMGUR_CLIENT_ID = 'df1fee79b1c7f2c';

async function uploadToImgur(base64Data) {
  // Enlève le préfixe "data:image/...;base64," si présent
  const pureBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');

  const res = await fetch('https://api.imgur.com/3/image', {
    method: 'POST',
    headers: {
      Authorization: `Client-ID ${IMGUR_CLIENT_ID}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ image: pureBase64, type: 'base64' }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Imgur upload failed ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (!json.success || !json.data?.link) {
    throw new Error(`Imgur: pas de lien dans la réponse: ${JSON.stringify(json)}`);
  }
  return json.data.link;
}

export default async function handler(req) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const body = await req.json();
    const { personImage, clothImage } = body;

    if (!personImage || !clothImage) {
      return new Response(JSON.stringify({ error: 'Images manquantes (personImage, clothImage)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // 1. Upload les deux images sur Imgur en parallèle
    const [personUrl, clothUrl] = await Promise.all([
      uploadToImgur(personImage),
      uploadToImgur(clothImage),
    ]);

    // 2. Appel LightX virtual try-on
    const lightxRes = await fetch(LIGHTX_TRYON_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': LIGHTX_API_KEY,
      },
      body: JSON.stringify({
        imageUrl: personUrl,
        styleImageUrl: clothUrl,
      }),
    });

    const lightxData = await lightxRes.json();

    // LightX retourne { body: { orderId: "..." } } ou { message: "..." }
    const orderId = lightxData?.body?.orderId || lightxData?.orderId;

    if (!orderId) {
      return new Response(
        JSON.stringify({ error: 'LightX: pas de orderId', details: lightxData }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        }
      );
    }

    return new Response(JSON.stringify({ orderId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
