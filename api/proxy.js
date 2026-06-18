export const config = { runtime: 'edge' };

const LIGHTX_API_KEY = 'bf8f904d12974d389c10f9e324f85c96_06e516b72750409a9067d3435766ada0_andoraitools';
const LIGHTX_TRYON_URL = 'https://api.lightxeditor.com/external/api/v2/aivirtualtryon';

// Convertit base64 en Uint8Array binaire
function base64ToBytes(b64) {
  const pure = b64.replace(/^data:image\/[a-z]+;base64,/, '');
  const binary = atob(pure);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Extrait le mime type depuis le data URL (ex: "image/jpeg")
function getMime(b64) {
  const m = b64.match(/^data:(image\/[a-z]+);base64,/);
  return m ? m[1] : 'image/jpeg';
}

// Upload une image (base64) sur tmpfiles.org via multipart/form-data
// Retourne une URL publique directe
async function uploadToTmpfiles(b64, filename) {
  const bytes = base64ToBytes(b64);
  const mime = getMime(b64);

  const formData = new FormData();
  const blob = new Blob([bytes], { type: mime });
  formData.append('file', blob, filename);

  const res = await fetch('https://tmpfiles.org/api/v1/upload', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`tmpfiles upload failed ${res.status}: ${text}`);
  }

  const json = await res.json();
  // tmpfiles retourne: { status: "success", data: { url: "https://tmpfiles.org/123/photo.jpg" } }
  // L'URL directe est la même mais avec /dl/ au lieu de /
  const pageUrl = json?.data?.url;
  if (!pageUrl) throw new Error('tmpfiles: pas d URL dans la réponse: ' + JSON.stringify(json));

  // Convertir https://tmpfiles.org/12345/file.jpg → https://tmpfiles.org/dl/12345/file.jpg
  const directUrl = pageUrl.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
  return directUrl;
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

    // 1. Upload les deux images en parallèle sur tmpfiles.org
    const [personUrl, clothUrl] = await Promise.all([
      uploadToTmpfiles(personImage, 'person.jpg'),
      uploadToTmpfiles(clothImage, 'cloth.jpg'),
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

    // LightX retourne { body: { orderId: "..." } }
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

    return new Response(JSON.stringify({ orderId, personUrl, clothUrl }), {
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
