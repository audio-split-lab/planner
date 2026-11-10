# planner-ai – Gemini proxy for the planner assistant

No dependencies (Node 18+). `node server.js`

Endpoints
- `POST /api/gemini` – body = Gemini `generateContent` body (contents, systemInstruction, tools, toolConfig, generationConfig). Headers: `X-Device-Id`, `X-Turn-Id`, optional `X-Owner-Code`. Response = Gemini JSON, with `X-Remaining` / `X-Limit` headers.
  Errors: 429 `{error:'limit'}` (daily limit), 429 `{error:'turn'}` (too many requests in one turn), 503 `{error:'busy'}` (Google overloaded / out of quota), 502 `{error:'upstream'}`.
- `GET /api/quota` – remaining messages for this device (no Gemini call).
- `GET /healthz`

Env
- `GEMINI_API_KEY` (required), `OWNER_CODE` (unlimited user)
- optional: `LIMIT` (50 msgs/device/day), `IP_LIMIT` (150 msgs/IP/day), `MAX_PER_TURN` (5), `DEVICE_REQ_CAP`, `IP_REQ_CAP`,
  `MODELS` (default `gemini-3.5-flash-lite,gemini-flash-lite-latest,gemini-flash-latest`, tried in order on 429/5xx/404),
  `ALLOWED_ORIGINS` (default `https://planner-yqc2.onrender.com`; localhost always allowed), `TZ_RESET` (Asia/Jerusalem).

Counters are in memory and reset at midnight Asia/Jerusalem (also on restart / free-tier spin-down).
