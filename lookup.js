// ── Garage Guardian model lookup proxy ──
// Uses Groq's free API (llama-4-maverick) — 1,000 req/day free, no credit card needed
// Get your free key at: console.groq.com
//
// To switch to paid Gemini Flash instead (~$0.01/day at normal traffic):
//   1. Change GROQ_API_KEY → GEMINI_API_KEY in Vercel env vars
//   2. Swap the fetch call below to the Gemini version (commented out)

const SYSTEM = `You are a garage door opener compatibility expert for an Australian smart home product called Garage Guardian.

The user will give you a garage door opener brand and model name.
Determine whether it uses FIXED CODE or ROLLING CODE technology, then output a JSON recommendation:
  - FIXED CODE   → result: "air"   (Garage Guardian Air)
  - ROLLING CODE → result: "link"  (Garage Guardian Link)
  - Cannot determine → result: "unsure"

Australian garage brands: B&D, Merlin, ATA, Gliderol, Steel-Line, Centurion, Grifco, Chamberlain, Auto Openers, Superlift.
Fixed code: pre-2005 openers with DIP switch remotes, same code every press.
Rolling code: 2005+ openers — look for SecureCode, Security+, Tri-Tran+, TrioCode, SecuraCode, MyQ labels.

Respond ONLY with valid JSON, no markdown, no extra text:
{"result":"air"|"link"|"unsure","modelName":"full model name","codeType":"Fixed code"|"Rolling code"|"Unknown","reasoning":"1-2 plain English sentences for the customer explaining why."}`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query } = req.body || {};
  if (!query) return res.status(400).json({ error: 'Missing query' });

  try {
    // ── Groq (free tier — llama-4-maverick, 1000 req/day) ──
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-maverick-17b-128e-instruct',
        max_tokens: 300,
        temperature: 0.1,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user',   content: 'Garage opener: ' + query },
        ],
      }),
    });

    // ── Gemini Flash alternative (swap in if you prefer Google) ──
    // const response = await fetch(
    //   `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
    //   {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({
    //       system_instruction: { parts: [{ text: SYSTEM }] },
    //       contents: [{ parts: [{ text: 'Garage opener: ' + query }] }],
    //       generationConfig: { maxOutputTokens: 300, temperature: 0.1 },
    //     }),
    //   }
    // );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err?.error?.message || `API error ${response.status}`;
      return res.status(response.status).json({ error: msg });
    }

    const data = await response.json();

    // Parse Groq/OpenAI response format
    let text = data?.choices?.[0]?.message?.content || '';

    // If using Gemini, swap to:
    // let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    text = text.replace(/```json|```/g, '').trim();

    let parsed;
    try { parsed = JSON.parse(text); }
    catch { return res.status(500).json({ error: 'Could not parse AI response — try again.' }); }

    // Validate shape
    if (!['air', 'link', 'unsure'].includes(parsed.result)) {
      parsed.result = 'unsure';
    }

    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
