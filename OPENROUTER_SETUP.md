// OpenRouter Integration Setup

## What This Does
This integrates the free OpenRouter model (`inclusionai/ring-2.6-1t:free`) into your Moodify app safely by using a server-side proxy that keeps your API key secret.

## Files Added
- `api/openrouter.js` — Vercel serverless function that proxies requests to OpenRouter

## Setup Instructions

### 1. Deploy to Vercel
If you haven't already:
```bash
npm i -g vercel
vercel
```

### 2. Add Your OpenRouter API Key
1. Get your key from: https://openrouter.ai/keys
2. In Vercel Dashboard → Your Project → Settings → Environment Variables
3. Add: `OPENROUTER_KEY = sk-or-...` (paste your actual key)
4. Redeploy after adding the key

### 3. Update Your HTML File
In `moodai-public.html`, replace your existing `callAI()` function with this:

\`\`\`javascript
async function callAI(text) {
  try {
    // Call the proxy instead of OpenRouter directly
    const response = await fetch('/api/openrouter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: text }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'API request failed');
    }

    const data = await response.json();
    
    // Parse the AI response (expecting JSON or plain text)
    if (data.success) {
      try {
        // Try to parse as JSON if it is JSON
        const parsed = JSON.parse(data.response);
        return parsed;
      } catch {
        // If not JSON, return as-is
        return { response: data.response };
      }
    }

    throw new Error(data.error || 'Unknown error');
  } catch (error) {
    console.error('AI Error:', error);
    return { error: error.message };
  }
}
\`\`\`

## Security Features Built-in
✓ API key stays on the server (never exposed to browser)
✓ Rate limiting: max 10 requests per minute per IP
✓ Input validation: max 2000 character prompts
✓ CORS protection
✓ Error handling with safe messages

## Testing
1. Call the function from your browser console:
   \`\`\`javascript
   await callAI("What is mood?")
   \`\`\`

2. Check Vercel logs if something fails:
   Vercel Dashboard → Deployments → Logs

## Cost Control Checklist
- [ ] Set spending limits in OpenRouter Dashboard
- [ ] Monitor API usage in Vercel logs weekly
- [ ] Consider adding CAPTCHA for public access (optional)
- [ ] Test rate limiting works (try >10 requests in 1 minute)

## Troubleshooting
**"500 Server configuration error"**
→ OPENROUTER_KEY not set in Vercel environment variables

**"Too many requests"**
→ You hit the rate limit. Wait 1 minute and retry.

**"OpenRouter API error"**
→ Check your API key is valid at https://openrouter.ai/keys

**Model not working**
→ Verify the model `inclusionai/ring-2.6-1t:free` is available on OpenRouter. If it's deprecated, update the MODEL constant in `api/openrouter.js`.

## Next Steps (Optional)
- Add caching to reduce duplicate API calls
- Upgrade rate limiting to use Redis (Vercel Redis)
- Add analytics to track usage
- Switch to different free model if needed
