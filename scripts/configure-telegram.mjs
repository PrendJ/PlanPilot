const token = process.env.TELEGRAM_BOT_TOKEN;
const username = (process.env.TELEGRAM_BOT_USERNAME || "").replace(/^@/, "");
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const base = process.env.APP_URL;
if (!token || !username || !secret || !base || !/^https:\/\//.test(base))
  throw new Error("Set TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET and a public HTTPS APP_URL first.");
if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret))
  throw new Error("TELEGRAM_WEBHOOK_SECRET must contain only letters, digits, underscores or hyphens.");
const identityResponse = await fetch(`https://api.telegram.org/bot${token}/getMe`);
const identity = await identityResponse.json();
if (!identityResponse.ok || !identity.ok || identity.result?.username?.toLowerCase() !== username.toLowerCase())
  throw new Error("TELEGRAM_BOT_USERNAME does not match the bot token.");
const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: new URL("/api/integrations/telegram/webhook", base).toString(),
    secret_token: secret,
    allowed_updates: ["message"],
  }),
});
const result = await response.json();
if (!response.ok || !result.ok) throw new Error(`Telegram rejected the webhook: ${result.description || response.status}`);
console.log("Telegram webhook configured.");
