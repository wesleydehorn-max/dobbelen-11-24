const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const sessions = new Map();

function id() {
  return crypto.randomBytes(12).toString('hex');
}

function code() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function euro(n) {
  return Math.round(n * 100) / 100;
}

function send(res, status, data, type = 'application/json') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store'
  });

  res.end(
    type === 'application/json'
      ? JSON.stringify(data)
      : data
  );
}

function body(req) {
  return new Promise((resolve, reject) => {
    let s = '';

    req.on('data', c => {
      s += c;
    });

    req.on('end', () => {
      try {
        resolve(s ? JSON.parse(s) : {});
      } catch (e) {
        reject(e);
      }
    });

    req.on('error', reject);
  });
}

function playerFor(req) {
  const t = req.headers['x-player-token'];
  const s = sessions.get(t);

  if (!s) return null;

  const room = rooms.get(s.room);

  if (!room) return null;

  const player = room.players.find(p => p.id === s.player);

  if (!player) return null;

  return {
    room,
    player
  };
}

function publicRoom(room) {
  return {
    code: room.code,
    started: room.started,
    phase: room.phase,
    turn: room.turn,
    dice: room.dice,
    held: room.held,
    selected: room.selected,
    target: room.target,
    message: room.message,

    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      money: p.money,
      admin: p.admin,
      connected: p.connected
    })),

    chat: room.chat.slice(-30)
  };
}

function newRoom(name) {
  let c;

  do {
    c = code();
  } while (rooms.has(c));

  const p = {
    id: id(),
    name: name || 'Speler',
    money: 100,
    admin: true,
    connected: true
  };

  const room = {
    code: c,
    players: [p],

    started: false,
    phase: 'lobby',
    turn: 0,

    dice: [1, 1, 1, 1, 1],
    held: [false, false, false, false, false],
    selected: [],

    target: null,
    message: 'Wacht op minimaal 2 spelers.',

    chat: [],

    holdHistory: [],
    mustHold: false
  };

  rooms.set(c, room);

  return {
    room,
    p
  };
}

function createSession(room, player) {
  const t = id() + id();

  sessions.set(t, {
    room: room.code,
    player: player.id
  });

  return t;
}

function resetRoll(room) {
  room.dice = [1, 1, 1, 1, 1];
  room.held = [false, false, false, false, false];
  room.selected = [];
  room.holdHistory = [];
  room.mustHold = true;
}

function rollDice(room) {
  for (let i = 0; i < 5; i++) {
    if (!room.held[i]) {
      room.dice[i] = 1 + Math.floor(Math.random() * 6);
    }
  }
}

function total(room) {
  return room.dice.reduce((a, b) => a + b, 0);
}

function isFullBak(room) {
  return room.dice.every(v => v === room.dice[0]);
}

function rewardFor(t) {
  if (t === 11 || t === 24) {
    return {
      special: true,
      amount: 0.5,
      earn: false
    };
  }

  if (t >= 5 && t <= 10) {
    return {
      special: false,
      amount: (11 - t) * 0.5,
      earn: true
    };
  }

  if (t >= 12 && t <= 17) {
    return {
      special: false,
      amount: (t - 11) * 0.5,
      earn: false
    };
  }

  if (t >= 18 && t <= 23) {
    return {
      special: false,
      amount: (24 - t) * 0.5,
      earn: false
    };
  }

  if (t >= 25 && t <= 30) {
    return {
      special: false,
      amount: (t - 24) * 0.5,
      earn: true
    };
  }

  return null;
}

function applyResult(room, actor) {
  const t = room.target != null
    ? room.target
    : total(room);

  const r = rewardFor(t);

  if (!r) {
    room.message =
      'MIS — geen uitbetaling. Beurt gaat naar de volgende speler.';

    nextTurn(room);
    return;
  }

  const opponents = room.players.filter(
    p => p.id !== actor.id
  );

  if (r.special) {
    for (const op of opponents) {
      const pay = Math.min(r.amount, actor.money);

      actor.money = euro(actor.money - pay);
      op.money = euro(op.money + pay);
    }

    room.message =
      `${actor.name} heeft ${t}: €0,50 naar iedere tegenstander.`;

    nextTurn(room);
    return;
  }

  const perOpponent = r.amount;

  if (r.earn) {
    const totalAmount =
      euro(perOpponent * opponents.length);

    actor.money = euro(actor.money + totalAmount);

    room.message =
      `${actor.name} heeft ${t}: +€${perOpponent
        .toFixed(2)
        .replace('.', ',')} per tegenstander.`;
  } else {
    for (const op of opponents) {
      const pay = Math.min(perOpponent, actor.money);

      actor.money = euro(actor.money - pay);
      op.money = euro(op.money + pay);
    }

    room.message =
      `${actor.name} heeft ${t}: betalen €${perOpponent
        .toFixed(2)
        .replace('.', ',')} per tegenstander.`;
  }

  nextTurn(room);
}

function nextTurn(room) {
  room.turn =
    (room.turn + 1) % room.players.length;

  room.phase = 'main';
  room.target = null;

  room.dice = [1, 1, 1, 1, 1];
  room.held = [false, false, false, false, false];
  room.selected = [];

  room.holdHistory = [];
  room.mustHold = false;
}

function startGame(room) {
  if (room.players.length < 2) {
    return false;
  }

  for (const p of room.players) {
    p.money = 100;
  }

  room.started = true;
  room.phase = 'main';
  room.turn = 0;

  room.message =
    'Het spel is gestart. Klik op BEGIN WERP.';

  resetRoll(room);

  room.mustHold = false;

  return true;
}

const HTML = String.raw`<!doctype html>
<html lang="nl">

<head>

<meta charset="utf-8">

<meta name="viewport"
content="width=device-width,initial-scale=1">

<title>Dobbelen 11/24</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Arial, sans-serif;
  background:
    radial-gradient(
      circle at top,
      #252525,
      #070707 70%
    );
  color: #fff;
  min-height: 100vh;
}

.wrap {
  max-width: 1050px;
  margin: auto;
  padding: 18px;
}

.brand {
  text-align: center;
  font-size: 34px;
  font-weight: 900;
  letter-spacing: 2px;
  color: #ffd34d;
  text-shadow: 0 2px 12px #000;
}

.sub {
  text-align: center;
  color: #aaa;
  margin: 3px 0 18px;
}

.card {
  background:
    linear-gradient(
      145deg,
      #171717,
      #0e0e0e
    );

  border: 1px solid #3c3c3c;
  border-radius: 18px;
  padding: 18px;

  box-shadow:
    0 15px 50px #0008;

  margin-bottom: 14px;
}

.row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.input {
  flex: 1;
  min-width: 180px;

  padding: 13px;

  border-radius: 10px;
  border: 1px solid #555;

  background: #222;
  color: #fff;

  font-size: 16px;
}

button {
  border: 0;
  border-radius: 11px;

  padding: 13px 17px;

  font-weight: 800;
  cursor: pointer;

  color: #111;
  background: #ffd34d;
}

button:disabled {
  opacity: .35;
  cursor: not-allowed;
}

.green {
  background: #20c878;
}

.red {
  background: #e85b5b;
  color: #fff;
}

.dark {
  background: #303030;
  color: #fff;
}

.title {
  font-weight: 900;
  font-size: 20px;
  margin-bottom: 10px;
}

.players {
  display: grid;
  grid-template-columns:
    repeat(auto-fit, minmax(180px, 1fr));

  gap: 10px;
}

.player {
  padding: 12px;

  border: 1px solid #444;
  border-radius: 12px;

  background: #202020;
}

.money {
  color: #7dffb5;
  font-weight: 900;
}

.dicebox {
  background:
    linear-gradient(
      135deg,
      #075b31,
      #01361c
    );

  border: 4px solid #b78a28;
  border-radius: 22px;

  padding: 20px;

  display: flex;
  justify-content: center;

  gap: 12px;
  flex-wrap: wrap;

  min-height: 145px;
}

.die {
  width: 78px;
  height: 78px;

  background: #f4f0df;

  border-radius: 14px;

  position: relative;

  box-shadow:
    0 6px 12px #0008;

  cursor: pointer;

  border: 4px solid transparent;
}

.die.held {
  border-color: #ffd34d;
  transform: translateY(-8px);
}

.die.sel {
  border-color: #ff5555;
}

.pip {
  position: absolute;

  width: 13px;
  height: 13px;

  background: #111;

  border-radius: 50%;

  transform:
    translate(-50%, -50%);
}

.p1 {
  left: 50%;
  top: 50%;
}

.p2 {
  left: 25%;
  top: 25%;
}

.p3 {
  left: 75%;
  top: 75%;
}

.p4 {
  left: 25%;
  top: 25%;
}

.p5 {
  left: 75%;
  top: 25%;
}

.p6 {
  left: 25%;
  top: 75%;
}

.p7 {
  left: 75%;
  top: 75%;
}

.p8 {
  left: 25%;
  top: 50%;
}

.p9 {
  left: 75%;
  top: 50%;
}

.actions {
  display: flex;
  gap: 9px;
  flex-wrap: wrap;
  margin-top: 14px;
}

.status {
  font-size: 17px;
  font-weight: 800;
  margin-bottom: 12px;
}

.chat {
  height: 190px;

  overflow: auto;

  background: #0d0d0d;

  border-radius: 10px;

  padding: 10px;

  border: 1px solid #333;
}

.msg {
  margin: 5px 0;
}

.small {
  font-size: 13px;
  color: #aaa;
}

.invite {
  font-family: monospace;

  background: #101010;

  padding: 12px;

  border-radius: 10px;

  word-break: break-all;
}

.notice {
  padding: 10px;

  border-radius: 10px;

  background: #332b0b;

  color: #ffe78b;

  margin: 10px 0;
}

.link {
  color: #ffd34d;
}

.error {
  color: #ff7777;
  font-weight: 700;
}

</style>

</head>

<body>

<div class="wrap">

<div class="brand">
DOBBELEN 11/24
</div>

<div class="sub">
LAS VEGAS • ONLINE MULTIPLAYER
</div>

<div id="app"></div>

</div>

<script>

const app =
  document.getElementById('app');

let state = null;

const tokenKey =
  'dob11_token';

const qs =
  new URLSearchParams(location.search);

const joinCode =
  (qs.get('join') || '').toUpperCase();

function token() {
  return sessionStorage.getItem(tokenKey) || '';
}

async function api(
  path,
  method = 'GET',
  data
) {

  const opt = {
    method,
    headers: {
      'Content-Type':
        'application/json',

      'X-Player-Token':
        token()
    }
  };

  if (data) {
    opt.body =
      JSON.stringify(data);
  }

  const r =
    await fetch(path, opt);

  let j = {};

  try {
    j = await r.json();
  } catch (e) {}

  if (!r.ok) {
    throw new Error(
      j.error || 'Er ging iets mis'
    );
  }

  return j;
}

function esc(s) {

  return String(s ?? '')
    .replace(
      /[&<>"']/g,
      c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[c])
    );
}

function euro(n) {

  return '€' +
    Number(n || 0)
      .toFixed(2)
      .replace('.', ',');
}

function pipHTML(v) {

  const map = {
    1: [1],
    2: [2, 7],
    3: [2, 1, 7],
    4: [2, 5, 6, 7],
    5: [2, 5, 1, 6, 7],
    6: [2, 5, 8, 9, 6, 7]
  };

  return map[v]
    .map(
      n =>
        '<i class="pip p' +
        n +
        '"></i>'
    )
    .join('');
}

function diceHTML() {

  return state.dice
    .map(
      (v, i) =>
        '<div class="die ' +
        (state.held[i]
          ? 'held '
          : '') +
        (state.selected.includes(i)
          ? 'sel'
          : '') +
        '" onclick="selectDie(' +
        i +
        ')">' +
        pipHTML(v) +
        '</div>'
    )
    .join('');
}

function render() {

  if (!state) {
    renderHome();
    return;
  }

  if (!state.started) {
    renderLobby();
    return;
  }

  renderGame();
}

function renderHome() {

  app.innerHTML =

    '<div class="card">' +

    '<div class="title">' +
    'Nieuw spel' +
    '</div>' +

    '<div class="row">' +

    '<input id="name" ' +
    'class="input" ' +
    'placeholder="Jouw naam" ' +
    'maxlength="20">' +

    '<button onclick="createRoom()">' +
    'KAMER MAKEN' +
    '</button>' +

    '</div>' +

    '</div>' +

    '<div class="card">' +

    '<div class="title">' +
    'Meedoen met een kamer' +
    '</div>' +

    '<div class="row">' +

    '<input id="join" ' +
    'class="input" ' +
    'placeholder="Kamercode">' +

    '<input id="jname" ' +
    'class="input" ' +
    'placeholder="Jouw naam" ' +
    'maxlength="20">' +

    '<button class="green" ' +
    'onclick="joinRoom()">' +
    'MEEDOEN' +
    '</button>' +

    '</div>' +

    '</div>';
}

async function createRoom() {

  try {

    const name =
      (
        document.getElementById('name')
          .value ||
        'Speler'
      ).trim();

    const r =
      await api(
        '/api/create',
        'POST',
        { name }
      );

    sessionStorage.setItem(
      tokenKey,
      r.playerToken
    );

    history.replaceState(
      {},
      '',
      '/?room=' + r.code
    );

    await poll();

  } catch (e) {

    alert(e.message);
  }
}

async function joinRoom() {

  try {

    const c =
      (
        document.getElementById('join')
          ?.value ||
        joinCode
      )
        .trim()
        .toUpperCase();

    const name =
      (
        document.getElementById('jname')
          .value ||
        'Speler'
      ).trim();

    const r =
      await api(
        '/api/join',
        'POST',
        {
          code: c,
          name
        }
      );

    sessionStorage.setItem(
      tokenKey,
      r.playerToken
    );

    history.replaceState(
      {},
      '',
      '/?room=' + r.code
    );

    await poll();

  } catch (e) {

    alert(e.message);
  }
}

function renderLobby() {

  const me =
    state.players.find(
      p => p.id === state.me
    );

  const url =
    location.origin +
    '/?join=' +
    state.code;

  app.innerHTML =

    '<div class="card">' +

    '<div class="title">' +
    'Kamer ' +
    esc(state.code) +
    '</div>' +

    '<div class="small">' +
    'Deel deze uitnodiging:' +
    '</div>' +

    '<div class="invite">' +
    esc(url) +
    '</div>' +

    '<div class="actions">' +

    '<button class="dark" ' +
    'onclick="copyLink(this)">' +
    'LINK KOPIËREN' +
    '</button>' +

    (
      me && me.admin

        ? '<button class="green" ' +
          'onclick="startGame()" ' +
          (
            state.players.length < 2
              ? 'disabled'
              : ''
          ) +
          '>' +
          'START SPEL' +
          '</button>'

        : ''
    ) +

    '</div>' +

    '</div>' +

    '<div class="card">' +

    '<div class="title">' +
    'Spelers' +
    '</div>' +

    '<div class="players">' +

    state.players
      .map(
        p =>
          '<div class="player">' +

          '<b>' +
          esc(p.name) +
          '</b> ' +

          (
            p.admin
              ? '<span class="small">' +
                'BEHEERDER' +
                '</span>'

              : '<span class="small">' +
                'SPELER' +
                '</span>'
          ) +

          '<br>' +

          '<span class="money">' +
          euro(p.money) +
          '</span>' +

          '</div>'
      )
      .join('') +

    '</div>' +

    (
      state.players.length < 2

        ? '<div class="notice">' +
          'Wachten op minimaal 2 spelers…' +
          '</div>'

        : ''
    ) +

    '</div>' +

    '<div class="card">' +

    '<div class="title">' +
    'Chat' +
    '</div>' +

    chatHTML() +

    '</div>';
}

function copyLink(btn) {

  const url =
    location.origin +
    '/?join=' +
    state.code;

  if (navigator.clipboard) {

    navigator.clipboard
      .writeText(url)
      .then(() => {
        btn.textContent =
          'GEKOPIEERD';
      });

  }
}

function chatHTML() {

  return (

    '<div class="chat" id="chat">' +

    state.chat
      .map(
        m =>
          '<div class="msg">' +

          '<b>' +
          esc(m.name) +
          ':</b> ' +

          esc(m.text) +

          '</div>'
      )
      .join('') +

    '</div>' +

    '<div class="row" ' +
    'style="margin-top:8px">' +

    '<input id="chatmsg" ' +
    'class="input" ' +
    'placeholder="Bericht…" ' +
    'onkeydown="' +
    "if(event.key==='Enter')sendChat()" +
    '">' +

    '<button onclick="sendChat()">' +
    'STUUR' +
    '</button>' +

    '</div>'
  );
}

function renderGame() {

  const me =
    state.players.find(
      p => p.id === state.me
    );

  const active =
    state.players[state.turn];

  const myTurn =
    me &&
    active &&
    me.id === active.id;

  let extra = '';

  if (state.phase === 'main') {

    extra =
      '<div class="small">' +
      'Doel: rol de vijf dobbelstenen. ' +
      'Bij 11 of 24 volgt de speciale ' +
      'uitbetaling. Bij een andere geldige ' +
      'totaalscore volgt betalen of verdienen.' +
      '</div>';

  } else {

    extra =
      '<div class="small">' +
      'Uitbetalingsfase — akkoord om de beurt af te ronden.' +
      '</div>';
  }

  app.innerHTML =

    '<div class="card">' +

    '<div class="players">' +

    state.players
      .map(
        p =>
          '<div class="player">' +

          '<b>' +
          esc(p.name) +
          '</b> ' +

          (
            p.admin
              ? '👑'
              : ''
          ) +

          '<br>' +

          '<span class="money">' +
          euro(p.money) +
          '</span>' +

          '</div>'
      )
      .join('') +

    '</div>' +

    '</div>' +

    '<div class="card">' +

    '<div class="status">' +

    'Aan de beurt: ' +

    '<span class="link">' +
    esc(
      active
        ? active.name
        : '-'
    ) +
    '</span> ' +

    (
      myTurn
        ? '(jij)'
        : ''
    ) +

    '</div>' +

    '<div class="notice">' +
    esc(state.message) +
    '</div>' +

    extra +

    '<div class="dicebox">' +
    diceHTML() +
    '</div>' +

    '<div class="actions">' +

    '<button class="green" ' +
    'onclick="beginRoll()" ' +
    (
      !myTurn
        ? 'disabled'
        : ''
    ) +
    '>' +
    'BEGIN WERP' +
    '</button>' +

    '<button onclick="hold()" ' +
    (
      !myTurn ||
      state.phase !== 'main' ||
      state.selected.length === 0
        ? 'disabled'
        : ''
    ) +
    '>' +
    'VASTHOUDEN' +
    '</button>' +

    '<button class="dark" ' +
    'onclick="reroll()" ' +
    (
      !myTurn ||
      state.phase !== 'main' ||
      state.mustHold
        ? 'disabled'
        : ''
    ) +
    '>' +
    'OPNIEUW GOOIEN' +
    '</button>' +

    '<button onclick="accept()" ' +
    (
      !myTurn ||
      state.phase !== 'earn'
        ? 'disabled'
        : ''
    ) +
    '>' +
    'AKKOORD' +
    '</button>' +

    '<button class="red" ' +
    'onclick="undoHold()" ' +
    (
      !myTurn ||
      state.phase !== 'main' ||
      state.holdHistory.length === 0
        ? 'disabled'
        : ''
    ) +
    '>' +
    'VASTHOUDEN ANNULEREN' +
    '</button>' +

    '</div>' +

    '</div>' +

    '<div class="card">' +

    '<div class="title">' +
    'Chat' +
    '</div>' +

    chatHTML() +

    '</div>';
}

async function poll() {

  try {

    const r =
      await api('/api/state');

    state = r;

    if (r.me) {
      state.me = r.me;
    }

    render();

  } catch (e) {

    if (token()) {

      app.innerHTML =
        '<div class="card">' +
        '<div class="error">' +
        esc(e.message) +
        '</div>' +
        '</div>';

    } else {

      renderHome();
    }
  }
}

function selectDie(i) {

  if (
    !state ||
    state.phase !== 'main'
  ) {
    return;
  }

  if (!state.held[i]) {

    if (
      state.selected.includes(i)
    ) {

      state.selected =
        state.selected.filter(
          x => x !== i
        );

    } else {

      state.selected.push(i);
    }

    render();
  }
}

async function act(a) {

  try {

    state =
      await api(
        '/api/action',
        'POST',
        {
          action: a,
          selected: state.selected
        }
      );

    render();

  } catch (e) {

    alert(e.message);
  }
}

function beginRoll() {
  act('begin');
}

function hold() {
  act('hold');
}

function reroll() {
  act('reroll');
}

function accept() {
  act('accept');
}

function undoHold() {
  act('undo');
}

async function sendChat() {

  const x =
    document.getElementById(
      'chatmsg'
    );

  if (
    !x ||
    !x.value.trim()
  ) {
    return;
  }

  try {

    await api(
      '/api/chat',
      'POST',
      {
        text:
          x.value.trim()
      }
    );

    x.value = '';

    await poll();

  } catch (e) {

    alert(e.message);
  }
}

async function startGame() {

  try {

    state =
      await api(
        '/api/start',
        'POST'
      );

    render();

  } catch (e) {

    alert(e.message);
  }
}

if (
  joinCode &&
  !token()
) {

  app.innerHTML =

    '<div class="card">' +

    '<div class="title">' +

    'Uitnodiging voor kamer ' +

    esc(joinCode) +

    '</div>' +

    '<div class="row">' +

    '<input id="jname" ' +
    'class="input" ' +
    'placeholder="Jouw naam" ' +
    'maxlength="20">' +

    '<button class="green" ' +
    'onclick="joinRoom()">' +

    'MEEDOEN' +

    '</button>' +

    '</div>' +

    '</div>';

} else {

  poll();
}

setInterval(
  poll,
  1000
);

</script>

</body>
</html>`;

function handleAction(
  room,
  player,
  action,
  selected
) {

  const active =
    room.players[room.turn];

  if (
    !active ||
    active.id !== player.id
  ) {

    throw new Error(
      'Je bent nu niet aan de beurt.'
    );
  }

  if (action === 'begin') {

    if (room.phase !== 'main') {

      throw new Error(
        'Deze beurt is al bezig.'
      );
    }

    room.held =
      [false, false, false, false, false];

    room.selected = [];
    room.holdHistory = [];

    room.mustHold = true;

    rollDice(room);

    const sum =
      total(room);

    if (
      sum === 11 ||
      sum === 24
    ) {

      room.phase = 'earn';
      room.target = sum;

      room.message =
        `Speciale score ${sum}. Klik AKKOORD.`;

      room.mustHold = false;

      return;
    }

    if (isFullBak(room)) {

      room.phase = 'earn';
      room.target = 6;

      room.message =
        'VOLLE BAK! Automatisch €6,00 per tegenstander. Klik AKKOORD.';

      room.mustHold = false;

      return;
    }

    room.message =
      `Je hebt ${sum} gegooid. Houd minimaal één steen vast.`;

    return;
  }

  if (action === 'hold') {

    if (room.phase !== 'main') {

      throw new Error(
        'Niet beschikbaar in deze fase.'
      );
    }

    if (
      !Array.isArray(selected) ||
      !selected.length
    ) {

      throw new Error(
        'Selecteer eerst minimaal één dobbelsteen.'
      );
    }

    const newlyHeld = [];

    for (const i of selected) {

      if (
        i >= 0 &&
        i < 5 &&
        !room.held[i]
      ) {

        room.held[i] = true;
        newlyHeld.push(i);
      }
    }

    if (!newlyHeld.length) {

      throw new Error(
        'Deze dobbelstenen zijn al vastgehouden.'
      );
    }

    room.holdHistory.push(
      newlyHeld
    );

    room.selected = [];
    room.mustHold = false;

    const sum =
      total(room);

    if (
      room.held.every(Boolean)
    ) {

      room.phase = 'earn';
      room.target = sum;

      room.message =
        `Alle stenen vastgehouden: ${sum}. Klik AKKOORD.`;

      return;
    }

    room.message =
      `Vastgehouden. Totaal is ${sum}. Je mag opnieuw gooien.`;

    return;
  }

  if (action === 'undo') {

    const last =
      room.holdHistory.pop();

    if (
      !last ||
      !last.length
    ) {

      throw new Error(
        'Niets om te annuleren.'
      );
    }

    for (const i of last) {
      room.held[i] = false;
    }

    room.mustHold =
      room.held.every(
        v => !v
      );

    room.message =
      'Laatste vasthouden is geannuleerd.';

    return;
  }

  if (action === 'reroll') {

    if (room.phase !== 'main') {

      throw new Error(
        'Niet beschikbaar in deze fase.'
      );
    }

    if (room.mustHold) {

      throw new Error(
        'Je moet eerst minimaal één steen vasthouden.'
      );
    }

    rollDice(room);

    room.selected = [];

    const sum =
      total(room);

    if (
      sum === 11 ||
      sum === 24
    ) {

      room.phase = 'earn';
      room.target = sum;

      room.message =
        `Speciale score ${sum}. Klik AKKOORD.`;

      room.mustHold = false;

      return;
    }

    if (isFullBak(room)) {

      room.phase = 'earn';
      room.target = 6;

      room.message =
        'VOLLE BAK! Automatisch €6,00 per tegenstander. Klik AKKOORD.';

      room.mustHold = false;

      return;
    }

    room.mustHold = true;

    room.message =
      `Je hebt ${sum} gegooid. Houd minimaal één steen vast.`;

    return;
  }

  if (action === 'accept') {

    if (room.phase !== 'earn') {

      throw new Error(
        'Er is nog geen uitbetalingsscore.'
      );
    }

    applyResult(
      room,
      player
    );

    return;
  }

  throw new Error(
    'Onbekende actie.'
  );
}

const server =
  http.createServer(
    async (req, res) => {

      try {

        const u =
          new URL(
            req.url,
            'http://localhost'
          );

        if (
          req.method === 'GET' &&
          u.pathname === '/health'
        ) {

          return send(
            res,
            200,
            { ok: true }
          );
        }

        if (
          req.method === 'GET' &&
          u.pathname === '/'
        ) {

          return send(
            res,
            200,
            HTML,
            'text/html; charset=utf-8'
          );
        }

        if (
          req.method === 'POST' &&
          u.pathname === '/api/create'
        ) {

          const b =
            await body(req);

          const {
            room,
            p
          } =
            newRoom(
              String(
                b.name || 'Speler'
              ).slice(0, 20)
            );

          const playerToken =
            createSession(
              room,
              p
            );

          return send(
            res,
            200,
            {
              code: room.code,
              playerToken
            }
          );
        }

        if (
          req.method === 'POST' &&
          u.pathname === '/api/join'
        ) {

          const b =
            await body(req);

          const c =
            String(
              b.code || ''
            ).toUpperCase();

          const room =
            rooms.get(c);

          if (!room) {

            return send(
              res,
              404,
              {
                error:
                  'Kamer bestaat niet.'
              }
            );
          }

          if (room.started) {

            return send(
              res,
              400,
              {
                error:
                  'Het spel is al gestart.'
              }
            );
          }

          if (
            room.players.length >= 4
          ) {

            return send(
              res,
              400,
              {
                error:
                  'Deze kamer zit vol.'
              }
            );
          }

          const p = {
            id: id(),
            name:
              String(
                b.name || 'Speler'
              ).slice(0, 20),
            money: 100,
            admin: false,
            connected: true
          };

          room.players.push(p);

          const playerToken =
            createSession(
              room,
              p
            );

          return send(
            res,
            200,
            {
              code: c,
              playerToken
            }
          );
        }

        const me =
          playerFor(req);

        if (!me) {

          return send(
            res,
            401,
            {
              error:
                'Sessie verlopen. Open de kamer opnieuw.'
            }
          );
        }

        me.player.connected = true;

        if (
          req.method === 'GET' &&
          u.pathname === '/api/state'
        ) {

          const out =
            publicRoom(
              me.room
            );

          out.me =
            me.player.id;

          return send(
            res,
            200,
            out
          );
        }

        if (
          req.method === 'POST' &&
          u.pathname === '/api/start'
        ) {

          if (!me.player.admin) {

            throw new Error(
              'Alleen de beheerder kan starten.'
            );
          }

          if (
            !startGame(me.room)
          ) {

            throw new Error(
              'Minimaal 2 spelers nodig.'
            );
          }

          const out =
            publicRoom(
              me.room
            );

          out.me =
            me.player.id;

          return send(
            res,
            200,
            out
          );
        }

        if (
          req.method === 'POST' &&
          u.pathname === '/api/action'
        ) {

          const b =
            await body(req);

          handleAction(
            me.room,
            me.player,
            b.action,
            b.selected
          );

          const out =
            publicRoom(
              me.room
            );

          out.me =
            me.player.id;

          return send(
            res,
            200,
            out
          );
        }

        if (
          req.method === 'POST' &&
          u.pathname === '/api/chat'
        ) {

          const b =
            await body(req);

          const text =
            String(
              b.text || ''
            )
              .trim()
              .slice(0, 250);

          if (text) {

            me.room.chat.push({
              name: me.player.name,
              text
            });
          }

          return send(
            res,
            200,
            { ok: true }
          );
        }

        return send(
          res,
          404,
          {
            error:
              'Niet gevonden.'
          }
        );

      } catch (e) {

        console.error(e);

        return send(
          res,
          400,
          {
            error:
              e.message ||
              'Fout'
          }
        );
      }
    }
  );

server.listen(
  PORT,
  () =>
    console.log(
      'Dobbelen 11/24 draait op poort ' +
      PORT
    )
);
