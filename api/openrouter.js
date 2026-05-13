// Vercel Serverless Function: OpenRouter Proxy
// File: api/openrouter.js
// This keeps your OpenRouter API key secret and safely forwards requests to the free model

const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
const MODEL = "inclusionai/ring-2.6-1t:free";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Simple in-memory rate limiter (per IP, per minute)
const requestCounts = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const key = `${ip}:${Math.floor(now / 60000)}`; // 1 minute buckets

  if (!requestCounts.has(key)) {
    requestCounts.set(key, 0);
  }

  const count = requestCounts.get(key);
  if (count >= 10) {
    return false; // Rate limit exceeded
  }

  requestCounts.set(key, count + 1);

  // Cleanup old entries (older than 2 minutes)
  for (const [storedKey] of requestCounts) {
    if (!storedKey.startsWith(ip)) continue;
    const storedTime = parseInt(storedKey.split(":")[1]);
    if (now - storedTime * 60000 > 120000) {
      requestCounts.delete(storedKey);
    }
  }

  return true;
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Only accept POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Check if API key is configured
  if (!OPENROUTER_KEY) {
    console.error("Missing OPENROUTER_KEY environment variable");
    return res.status(500).json({ 
      error: "Server configuration error. Please set OPENROUTER_KEY." 
    });
  }

  // Get client IP for rate limiting
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || 
             req.headers["x-real-ip"] || 
             req.socket?.remoteAddress || 
             "unknown";

  // Rate limiting check
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ 
      error: "Too many requests. Max 10 per minute." 
    });
  }

  try {
    const { prompt } = req.body;

    // Validate input
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Invalid prompt. Send { prompt: 'text' }" });
    }

    if (prompt.length > 2000) {
      return res.status(400).json({ error: "Prompt too long (max 2000 chars)" });
    }

    if (prompt.trim().length === 0) {
      return res.status(400).json({ error: "Prompt cannot be empty" });
    }

    // Call OpenRouter API
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "HTTP-Referer": "https://moodify.app", // Optional: identifies your app
        "X-Title": "Moodify", // Optional: for OpenRouter tracking
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`OpenRouter error (${response.status}):`, error);

      if (response.status === 401) {
        return res.status(500).json({ 
          error: "Authentication failed. Invalid API key." 
        });
      }

      if (response.status === 429) {
        return res.status(503).json({ 
          error: "OpenRouter rate limited. Try again in a moment." 
        });
      }

      return res.status(response.status).json({ 
        error: "OpenRouter API error. Check logs." 
      });
    }

    const data = await response.json();

    // Extract the response text
    const aiResponse = data.choices?.[0]?.message?.content || "";

    if (!aiResponse) {
      console.warn("Empty response from OpenRouter");
      return res.status(500).json({ error: "Empty response from AI model" });
    }

    return res.status(200).json({
      success: true,
      response: aiResponse,
      model: MODEL,
    });

  } catch (error) {
    console.error("Proxy error:", error);
    return res.status(500).json({ 
      error: "Internal server error. Check logs." 
    });
  }
}
