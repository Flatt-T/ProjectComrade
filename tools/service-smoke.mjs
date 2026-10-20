import assert from 'node:assert/strict';
const base = process.env.COMRADE_URL || 'http://127.0.0.1:3001';
const health = await (await fetch(`${base}/health`)).json();
assert.equal(health.status, 'ok');
const clients = [];
function connect() {
  const messages = [];
  const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/ws`);
  ws.addEventListener('message', event => messages.push(JSON.parse(event.data)));
  clients.push(ws);
  return { ws, messages };
}
async function until(predicate) {
  const deadline = Date.now() + 10000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Room protocol timed out');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
const send = (client, message) => client.ws.send(JSON.stringify({ version: 1, ...message }));
const latestRoom = client => client.messages.filter(message => message.type === 'room').at(-1);
try {
  const a = connect(), b = connect();
  await until(() => a.messages.some(m => m.type === 'welcome') && b.messages.some(m => m.type === 'welcome'));
  const room = `check-${Date.now()}`;
  send(a, { type: 'join', room, name: 'GDI test', faction: 'gdi' });
  send(b, { type: 'join', room, name: 'Nod test', faction: 'nod' });
  await until(() => latestRoom(a)?.players.length === 2 && latestRoom(b)?.players.length === 2);
  const host = latestRoom(a).host;
  const hostClient = a.messages.find(m => m.type === 'welcome').id === host ? a : b;
  const other = hostClient === a ? b : a;
  send(a, { type: 'ready', ready: true }); send(b, { type: 'ready', ready: true });
  await until(() => latestRoom(a).players.every(p => p.ready));
  send(hostClient, { type: 'start' });
  await until(() => hostClient.messages.some(m => m.type === 'error' && /not enabled/.test(m.message)));
  hostClient.ws.close();
  await until(() => latestRoom(other).players.length === 1);
  assert.notEqual(latestRoom(other).host, host);
  assert.equal(latestRoom(other).players[0].ready, false);
  console.log('Public health, room membership/readiness, guarded match start and host transfer passed');
} finally { for (const ws of clients) ws.close(); }
