// Run once per minute inside the app container using its existing environment.
// Only loopback is contacted; do not pass CRON_SECRET in command-line arguments.
if (!process.env.CRON_SECRET) throw new Error('CRON_SECRET is required');
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const response = await fetch(`http://127.0.0.1:${port}/api/cron/notifications`, {
  method: 'POST', headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(90000),
});
if (!response.ok) throw new Error(`Notification dispatcher returned HTTP ${response.status}`);
const result = await response.json();
console.log(JSON.stringify({ enabled: result.enabled, sent: result.sent, discarded: result.discarded, retried: result.retried }));
