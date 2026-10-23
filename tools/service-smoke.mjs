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
  // Chat: messages to all reach everyone; allied messages only reach teammates.
  send(a, { type: 'team', team: 1 }); send(b, { type: 'team', team: 2 });
  await until(() => latestRoom(a).players.every(p => p.team > 0));
  send(a, { type: 'chat', text: 'secret plan', to: 'allies' });
  send(a, { type: 'chat', text: 'good luck\u0007 all', to: 'all' });
  await until(() => b.messages.some(m => m.type === 'chat' && m.text.startsWith('good luck')));
  assert.ok(a.messages.some(m => m.type === 'chat' && m.text === 'secret plan'), 'The sender sees its own allied message');
  assert.ok(!b.messages.some(m => m.type === 'chat' && m.text === 'secret plan'), 'An opponent must never receive allied chat');
  assert.equal(b.messages.find(m => m.type === 'chat').text, 'good luck all', 'Control characters are stripped');
  send(b, { type: 'team', team: 1 });
  await until(() => latestRoom(a).players.every(p => p.team === 1));
  send(a, { type: 'chat', text: 'now together', to: 'allies' });
  await until(() => b.messages.some(m => m.type === 'chat' && m.text === 'now together'));
  send(a, { type: 'ready', ready: true }); send(b, { type: 'ready', ready: true });
  await until(() => latestRoom(a).players.every(p => p.ready));
  const oversized = connect();
  let rejected = false;
  oversized.ws.addEventListener('close', () => { rejected = true; });
  await until(() => oversized.messages.some(m => m.type === 'welcome'));
  oversized.ws.send('x'.repeat(70000));
  await until(() => rejected);
  assert.equal((await (await fetch(`${base}/health`)).json()).status, 'ok', 'An oversized peer must not crash the service');
  // Only the host may configure; a guest's attempt is rejected.
  const options = { style: 'td-classic', map: 'canyon-clash', visibility: 'invite', maxPlayers: 4, settings: { credits: 'high', techLevel: 10 } };
  send(other, { type: 'configure', options });
  await until(() => other.messages.some(m => m.type === 'error' && /host/.test(m.message)));
  send(hostClient, { type: 'configure', options });
  await until(() => latestRoom(other)?.options.map === 'canyon-clash' && latestRoom(other).options.visibility === 'invite');
  // Configuration resets readiness; start is refused until everyone is ready again.
  send(hostClient, { type: 'start' });
  await until(() => hostClient.messages.some(m => m.type === 'error' && /ready/.test(m.message)));
  send(other, { type: 'ready', ready: true });
  await until(() => latestRoom(hostClient).players.find(p => !p.host)?.ready === true);
  send(hostClient, { type: 'start' });
  await until(() => latestRoom(other).phase === 'started');
  hostClient.ws.close();
  await until(() => latestRoom(other).players.length === 1);
  assert.notEqual(latestRoom(other).host, host);
  // A started match persists for the remaining players (lockstep finalises any drop).
  assert.equal(latestRoom(other).phase, 'started');
  console.log('Health, rooms, teams, all/allies chat, host-only configuration, ready-gated start, oversized-peer isolation and host transfer passed');
} finally { for (const ws of clients) ws.close(); }
