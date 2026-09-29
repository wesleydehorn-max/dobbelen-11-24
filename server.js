const http = require('node:http');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 3000;
const rooms = new Map();
const sessions = new Map();

const makeId = () => crypto.randomBytes(12).toString('hex');
const makeCode = () => crypto.randomBytes(3).toString('hex').toUpperCase();
const money = n => Math.round(n * 100) / 100;

function send(res, status, data, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}

async function readJson(req) {
  return await new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => {
      raw += c;
      if (raw.length > 100000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Ongeldige gegevens.'));
      }
    });
    req.on('error', reject);
  });
}

function newRoom(hostName) {
  let code;
  do code = makeCode(); while (rooms.has(code));

  const host = {
    id: makeId(),
    name: cleanName(hostName),
    money: 100,
    admin: true
  };

  const room = {
    code,
    players: [host],
    started: false,
    phase: 'lobby',
    turn: 0,
    dice: [1, 1, 1, 1, 1],
    held: [false, false, false, false, false],
    selected: [],
    holdHistory: [],
    mustHold: false,
    target: null,
    message: 'Wacht op spelers. Minimaal 2 spelers om te starten.',
    chat: []
  };

  rooms.set(code, room);
  return { room, player: host };
}

function cleanName(name) {
  return String(name || 'Speler').trim().slice(0, 20) || 'Speler';
}

function createSession(room, player) {
  const token = makeId() + makeId();
  sessions.set(token, {
    room: room.code,
    player: player.id
  });
  return token;
}

function auth(req) {
  const token = req.headers['x-player-token'];
  const s = sessions.get(token);

  if (!s) return null;

  const room = rooms.get(s.room);
  if (!room) return null;

  const player = room.players.find(p => p.id === s.player);
  if (!player) return null;

  return { room, player };
}

function stateFor(room, me) {
  return {
    code: room.code,
    started: room.started,
    phase: room.phase,
    turn: room.turn,
    me: me.id,
    dice: room.dice,
    held: room.held,
    selected: room.selected,
    holdHistory: room.holdHistory,
    mustHold: room.mustHold,
    target: room.target,
    message: room.message,

    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      money: p.money,
      admin: p.admin
    })),

    chat: room.chat.slice(-40)
  };
}

function roll(room) {
  for (let i = 0; i < 5; i++) {
    if (!room.held[i]) {
      room.dice[i] =
        1 + Math.floor(Math.random() * 6);
    }
  }
}

function sum(room) {
  return room.dice.reduce((a, b) => a + b, 0);
}

function fullBak(room) {
  return room.dice.every(
    v => v === room.dice[0]
  );
}

function payoutFor(total) {

  if (total === 11 || total === 24) {
    return {
      special: true,
      earn: false,
      amount: 0.5
    };
  }

  if (total >= 5 && total <= 10) {
    return {
      special: false,
      earn: true,
      amount: (11 - total) * 0.5
    };
  }

  if (total >= 12 && total <= 17) {
    return {
      special: false,
      earn: false,
      amount: (total - 11) * 0.5
    };
  }

  if (total >= 18 && total <= 23) {
    return {
      special: false,
      earn: false,
      amount: (24 - total) * 0.5
    };
  }

  if (total >= 25 && total <= 30) {
    return {
      special: false,
      earn: true,
      amount: (total - 24) * 0.5
    };
  }

  return null;
}

function nextTurn(room) {

  room.turn =
    (room.turn + 1) %
    room.players.length;

  room.phase = 'main';
  room.target = null;

  room.dice = [1, 1, 1, 1, 1];

  room.held =
    [false, false, false, false, false];

  room.selected = [];
  room.holdHistory = [];
  room.mustHold = false;
}

function finishScore(room) {

  const player =
    room.players[room.turn];

  const total =
    room.target ?? sum(room);

  const payout =
    payoutFor(total);

  if (!payout) {

    room.message =
      `${player.name} heeft ${total}: MIS. Beurt gaat door.`;

    nextTurn(room);
    return;
  }

  const opponents =
    room.players.filter(
      p => p.id !== player.id
    );

  if (payout.special) {

    for (const op of opponents) {

      const paid =
        Math.min(
          0.50,
          player.money
        );

      player.money =
        money(
          player.money - paid
        );

      op.money =
        money(
          op.money + paid
        );
    }

    room.message =
      `${player.name} heeft ${total}: €0,50 naar iedere tegenstander.`;

    nextTurn(room);
    return;
  }

  if (payout.earn) {

    const amount =
      money(
        payout.amount *
        opponents.length
      );

    player.money =
      money(
        player.money + amount
      );

    room.message =
      `${player.name} heeft ${total}: +€${payout.amount
        .toFixed(2)
        .replace('.', ',')} per tegenstander.`;

  } else {

    for (const op of opponents) {

      const paid =
        Math.min(
          payout.amount,
          player.money
        );

      player.money =
        money(
          player.money - paid
        );

      op.money =
        money(
          op.money + paid
        );
    }

    room.message =
      `${player.name} heeft ${total}: €${payout.amount
        .toFixed(2)
        .replace('.', ',')} betalen per tegenstander.`;
  }

  nextTurn(room);
}

function startGame(room) {

  if (room.players.length < 2) {
    throw new Error(
      'Minimaal 2 spelers nodig.'
    );
  }

  room.players.forEach(
    p => {
      p.money = 100;
    }
  );

  room.started = true;
  room.phase = 'main';
  room.turn = 0;

  room.dice =
    [1, 1, 1, 1, 1];

  room.held =
    [false, false, false, false, false];

  room.selected = [];
  room.holdHistory = [];
  room.mustHold = false;
  room.target = null;

  room.message =
    'Het spel is gestart. Klik BEGIN WORP.';
}

function action(room, player, data) {

  if (!room.started) {
    throw new Error(
      'Het spel is nog niet gestart.'
    );
  }

  if (
    room.players[room.turn].id !==
    player.id
  ) {
    throw new Error(
      'Je bent nu niet aan de beurt.'
    );
  }

  const a = data.action;

  if (a === 'begin') {

    if (room.phase !== 'main') {
      throw new Error(
        'Deze worp kan nu niet beginnen.'
      );
    }

    room.held =
      [false, false, false, false, false];

    room.selected = [];
    room.holdHistory = [];
    room.mustHold = true;

    roll(room);

    const t = sum(room);

    if (fullBak(room)) {

      room.phase = 'earn';
      room.target = 6;
      room.mustHold = false;

      room.message =
        'VOLLE BAK! €6,00 per tegenstander. Klik AKKOORD.';

    } else if (
      t === 11 ||
      t === 24
    ) {

      room.phase = 'earn';
      room.target = t;
      room.mustHold = false;

      room.message =
        `Speciale score ${t}. Klik AKKOORD.`;

    } else {

      room.message =
        `Je hebt ${t} gegooid. Selecteer minimaal één steen en druk VASTHOUDEN.`;
    }

    return;
  }

  if (a === 'hold') {

    if (room.phase !== 'main') {
      throw new Error(
        'Vasthouden kan nu niet.'
      );
    }

    const selected =
      Array.isArray(data.selected)
        ? data.selected
        : [];

    if (!selected.length) {
      throw new Error(
        'Selecteer eerst minimaal één dobbelsteen.'
      );
    }

    const newly = [];

    for (const raw of selected) {

      const i = Number(raw);

      if (
        Number.isInteger(i) &&
        i >= 0 &&
        i < 5 &&
        !room.held[i]
      ) {
        room.held[i] = true;
        newly.push(i);
      }
    }

    if (!newly.length) {
      throw new Error(
        'Deze dobbelstenen zijn al vastgehouden.'
      );
    }

    room.holdHistory.push(newly);
    room.selected = [];
    room.mustHold = false;

    if (room.held.every(Boolean)) {

      room.phase = 'earn';
      room.target = sum(room);

      room.message =
        `Alle stenen vastgehouden: ${room.target}. Klik AKKOORD.`;

    } else {

      room.message =
        `Vastgehouden. Totaal: ${sum(room)}. Je kunt opnieuw gooien.`;
    }

    return;
  }

  if (a === 'undo') {

    if (room.phase !== 'main') {
      throw new Error(
        'Dit kan nu niet.'
      );
    }

    const last =
      room.holdHistory.pop();

    if (!last) {
      throw new Error(
        'Er is niets om te annuleren.'
      );
    }

    last.forEach(
      i => {
        room.held[i] = false;
      }
    );

    room.selected = [];

    room.mustHold =
      room.held.every(
        v => !v
      );

    room.message =
      'Laatste vasthouden is geannuleerd.';

    return;
  }

  if (a === 'reroll') {

    if (room.phase !== 'main') {
      throw new Error(
        'Opnieuw gooien kan nu niet.'
      );
    }

    if (room.mustHold) {
      throw new Error(
        'Houd eerst minimaal één steen vast.'
      );
    }

    roll(room);
    room.selected = [];

    const t = sum(room);

    if (fullBak(room)) {

      room.phase = 'earn';
      room.target = 6;
      room.mustHold = false;

      room.message =
        'VOLLE BAK! €6,00 per tegenstander. Klik AKKOORD.';

    } else if (
      t === 11 ||
      t === 24
    ) {

      room.phase = 'earn';
      room.target = t;
      room.mustHold = false;

      room.message =
        `Speciale score ${t}. Klik AKKOORD.`;

    } else {

      room.mustHold = true;

      room.message =
        `Je hebt ${t} gegooid. Selecteer minimaal één steen en druk VASTHOUDEN.`;
    }

    return;
  }

  if (a === 'accept') {

    if (room.phase !== 'earn') {
      throw new Error(
        'Er is nog geen score om akkoord te geven.'
      );
    }

    finishScore(room);
    return;
  }

  throw new Error(
    'Onbekende actie.'
  );
}

const HTML = `<!doctype html>
<html lang="nl">

<head>

<meta charset="utf-8">

<meta name="viewport"
content="width=device-width,initial-scale=1,viewport-fit=cover">

<title>Dobbelen 11/24</title>

<style>

:root{
--gold:#f4c542;
--gold2:#ffdf70;
--green:#08783d;
--green2:#0a4f2d;
--red:#c9282d;
--red2:#8d1015;
--black:#090b0b;
--panel:#111617;
--line:#454b4d;
--text:#f6f6f2;
--muted:#aeb5b6
}

*{
box-sizing:border-box
}

body{
margin:0;
min-height:100vh;
background:
radial-gradient(
circle at 50% -10%,
#303637 0,
#101313 35%,
#050606 75%
);
font-family:Arial,Helvetica,sans-serif;
color:var(--text)
}

button,
input{
font:inherit
}

.wrap{
max-width:1100px;
margin:auto;
padding:20px 16px 40px
}

.logo{
text-align:center;
font-weight:1000;
font-size:clamp(30px,7vw,58px);
letter-spacing:2px;
color:var(--gold2);
text-shadow:
0 3px 0 #7d5c05,
0 0 25px #e5ad1b55
}

.tag{
text-align:center;
color:#bfc4c4;
font-size:clamp(14px,3vw,22px);
letter-spacing:2px;
margin:2px 0 20px
}

.panel{
background:
linear-gradient(
145deg,
#151a1a,
#0c1010
);
border:1px solid #3a4041;
border-radius:20px;
box-shadow:
0 18px 45px #0009,
inset 0 1px #ffffff08;
padding:18px;
margin:14px 0
}

.title{
font-size:20px;
font-weight:900;
margin-bottom:12px;
color:var(--gold2)
}

.row{
display:flex;
gap:10px;
flex-wrap:wrap
}

.input{
flex:1;
min-width:180px;
background:#090c0c;
color:white;
border:1px solid #555d5e;
border-radius:12px;
padding:13px 14px;
outline:none
}

.input:focus{
border-color:var(--gold)
}

button{
border:1px solid #8e6a12;
border-radius:12px;
padding:12px 17px;
font-weight:900;
background:
linear-gradient(
#ffdf70,
#dcae2b
);
color:#18130a;
box-shadow:
0 4px 0 #785b0c;
cursor:pointer
}

button:active{
transform:translateY(2px);
box-shadow:
0 2px 0 #785b0c
}

button:disabled{
opacity:.35;
cursor:not-allowed;
transform:none
}

.green{
background:
linear-gradient(
#23bd73,
#078146
);
border-color:#2bd58a;
color:white;
box-shadow:
0 4px 0 #034f2b
}

.dark{
background:
linear-gradient(
#3d4546,
#252a2b
);
border-color:#666;
color:white;
box-shadow:
0 4px 0 #111
}

.red{
background:
linear-gradient(
#ef6464,
#a81b20
);
border-color:#ff8989;
color:white;
box-shadow:
0 4px 0 #5d080c
}

.players{
display:grid;
grid-template-columns:
repeat(auto-fit,minmax(180px,1fr));
gap:10px
}

.player{
background:
linear-gradient(
145deg,
#202626,
#111515
);
border:1px solid #41494a;
border-radius:14px;
padding:12px
}

.money{
display:inline-block;
color:#78f6a9;
font-weight:900;
margin-top:5px
}

.badge{
font-size:11px;
color:#111;
background:var(--gold);
padding:3px 6px;
border-radius:6px;
font-weight:900
}

.notice{
border:1px solid #6d5617;
background:#2a230c;
color:#ffe18a;
border-radius:12px;
padding:12px;
margin:12px 0;
font-weight:800
}

.status{
font-size:18px;
font-weight:900;
margin-bottom:8px
}

.subtle{
color:var(--muted);
font-size:13px
}

.invite{
margin-top:8px;
background:#070909;
border:1px dashed #70601e;
padding:12px;
border-radius:10px;
word-break:break-all;
color:#ffe18a;
font-family:monospace
}

.table{
position:relative;
background:
radial-gradient(
ellipse at center,
#129150 0,
#075e36 60%,
#043a23 100%
);
border:8px solid #9b731d;
border-radius:28px;
padding:22px;
box-shadow:
inset 0 0 0 3px #d4a83b,
0 16px 35px #000b
}

.table:before{
content:"";
position:absolute;
inset:7px;
border:1px solid #ffffff2a;
border-radius:20px;
pointer-events:none
}

.dice{
position:relative;
display:flex;
justify-content:center;
gap:12px;
flex-wrap:wrap;
min-height:105px
}

.die{
position:relative;
width:78px;
height:78px;
background:
linear-gradient(
145deg,
#fffdf1,
#d9d5c7
);
border:4px solid #9d1017;
border-radius:15px;
box-shadow:
0 7px 0 #57090d,
0 10px 15px #0008;
cursor:pointer
}

.die.held{
transform:translateY(-9px);
border-color:#ffe36b;
box-shadow:
0 7px 0 #73590b,
0 13px 20px #0009
}

.die.selected{
outline:4px solid #fff07c;
outline-offset:2px
}

.pip{
position:absolute;
width:13px;
height:13px;
border-radius:50%;
background:#151515;
transform:
translate(-50%,-50%);
box-shadow:
inset 0 1px 1px #555
}

.a{
left:25%;
top:25%
}

.b{
left:50%;
top:50%
}

.c{
left:75%;
top:75%
}

.d{
left:75%;
top:25%
}

.e{
left:25%;
top:75%
}

.f{
left:25%;
top:50%
}

.g{
left:75%;
top:50%
}

.actions{
display:flex;
flex-wrap:wrap;
gap:10px;
margin-top:16px;
justify-content:center
}

.chat{
height:170px;
overflow:auto;
background:#080b0b;
border:1px solid #343a3b;
border-radius:12px;
padding:10px
}

.msg{
padding:4px 0
}

.msg b{
color:#ffd85b
}

.error{
color:#ff6f6f;
font-weight:900
}

.center{
text-align:center
}

.waiting{
padding:16px;
text-align:center;
color:#ddd
}

.copy{
cursor:pointer;
color:#ffd85b;
text-decoration:underline
}

.score{
display:inline-block;
padding:6px 10px;
border-radius:8px;
background:#101616;
border:1px solid #454d4e;
color:#ffe27a;
font-weight:900
}

.hidden{
display:none
}

@media(max-width:600px){

.wrap{
padding:12px 10px 30px
}

.panel{
padding:14px;
border-radius:16px
}

.die{
width:64px;
height:64px
}

.pip{
width:11px;
height:11px
}

.table{
padding:15px;
border-width:6px
}

.actions button{
flex:1;
min-width:145px
}

.input{
min-width:100%
}

}

</style>

</head>

<body>

<div class="wrap">

<div class="logo">
DOBBELEN 11/24
</div>

<div class="tag">
LAS VEGAS • ONLINE MULTIPLAYER
</div>

<main id="app"></main>

</div>

<script>

const KEY =
'd1124_token';

let S = null;

const params =
new URLSearchParams(
location.search
);

const joinCode =
(
params.get('join') || ''
).toUpperCase();

const $ =
id =>
document.getElementById(id);

const esc =
x =>
String(x ?? '')
.replace(
/[&<>"']/g,
c =>
({
'&':'&amp;',
'<':'&lt;',
'>':'&gt;',
'"':'&quot;',
"'":'&#39;'
}[c])
);

const euro =
x =>
'€' +
Number(x || 0)
.toFixed(2)
.replace('.',',');

async function api(
path,
method='GET',
data
){

const o = {
method,
headers:{
'Content-Type':
'application/json',

'X-Player-Token':
sessionStorage.getItem(KEY) || ''
}
};

if(data)
o.body =
JSON.stringify(data);

const r =
await fetch(path,o);

let j = {};

try{
j =
await r.json();
}catch{}

if(!r.ok)
throw Error(
j.error ||
'Er ging iets mis.'
);

return j;
}

function renderHome(){

app.innerHTML =

'<section class="panel">' +

'<div class="title">' +
'NIEUW SPEL' +
'</div>' +

'<div class="row">' +

'<input id="name" ' +
'class="input" ' +
'maxlength="20" ' +
'placeholder="Jouw naam">' +

'<button class="green" ' +
'onclick="createRoom()">' +
'KAMER MAKEN' +
'</button>' +

'</div>' +

'</section>' +

'<section class="panel">' +

'<div class="title">' +
'MEESPELEN' +
'</div>' +

'<div class="row">' +

'<input id="code" ' +
'class="input" ' +
'maxlength="6" ' +
'placeholder="Kamercode">' +

'<input id="joinName" ' +
'class="input" ' +
'maxlength="20" ' +
'placeholder="Jouw naam">' +

'<button ' +
'onclick="joinRoom()">' +
'MEEDOEN' +
'</button>' +

'</div>' +

'</section>';
}

async function createRoom(){

try{

const r =
await api(
'/api/create',
'POST',
{
name:
$('name').value
}
);

sessionStorage.setItem(
KEY,
r.playerToken
);

history.replaceState(
{},
'',
'/?room=' +
r.code
);

await refresh();

}catch(e){

alert(e.message);

}

}

async function joinRoom(){

try{

const code =
(
$('code')?.value ||
joinCode
)
.trim()
.toUpperCase();

const name =
(
$('joinName')?.value ||
$('jname')?.value ||
'Speler'
).trim();

const r =
await api(
'/api/join',
'POST',
{
code,
name
}
);

sessionStorage.setItem(
KEY,
r.playerToken
);

history.replaceState(
{},
'',
'/?room=' +
r.code
);

await refresh();

}catch(e){

alert(e.message);

}

}

function diceHTML(){

const maps = {

1:['b'],

2:['a','c'],

3:['a','b','c'],

4:['a','d','e','c'],

5:['a','d','b','e','c'],

6:['a','d','f','g','e','c']

};

return S.dice
.map(
(v,i) =>

'<div class="die ' +

(
S.held[i]
? 'held '
: ''
) +

(
S.selected.includes(i)
? 'selected'
: ''
) +

'" onclick="selectDie(' +
i +
')">' +

maps[v]
.map(
x =>
'<i class="pip ' +
x +
'"></i>'
)
.join('') +

'</div>'

)
.join('');
}

function chatHTML(){

return

'<div class="chat" id="chat">' +

S.chat
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
'style="margin-top:9px">' +

'<input id="chatInput" ' +
'class="input" ' +
'placeholder="Typ een bericht…" ' +

'onkeydown="' +
"if(event.key==='Enter')sendChat()" +
'">' +

'<button ' +
'onclick="sendChat()">' +
'STUUR' +
'</button>' +

'</div>';
}

function renderLobby(){

const me =
S.players.find(
p =>
p.id === S.me
);

const link =
location.origin +
'/?join=' +
S.code;

app.innerHTML =

'<section class="panel">' +

'<div class="title">' +
'KAMER ' +
esc(S.code) +
'</div>' +

'<div class="subtle">' +
'Nodig andere spelers uit met deze link:' +
'</div>' +

'<div class="invite">' +
esc(link) +
'</div>' +

'<div class="actions">' +

'<button class="dark" ' +

'onclick="' +

'navigator.clipboard?.writeText(' +
JSON.stringify(link) +
').then(()=>this.textContent=\\'GEKOPIEERD!\\')' +

'">' +

'LINK KOPIËREN' +

'</button>' +

(
me?.admin

?

'<button class="green" ' +
'onclick="startGame()" ' +

(
S.players.length < 2
? 'disabled'
: ''
) +

'>' +

'START SPEL' +

'</button>'

: ''

) +

'</div>' +

'</section>' +

'<section class="panel">' +

'<div class="title">' +
'SPELERS' +
'</div>' +

'<div class="players">' +

S.players
.map(
p =>

'<div class="player">' +

'<b>' +
esc(p.name) +
'</b> ' +

(
p.admin

?

'<span class="badge">' +
'BEHEERDER' +
'</span>'

:

'<span class="subtle">' +
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
S.players.length < 2

?

'<div class="waiting">' +
'Wachten op de tweede speler…' +
'</div>'

: ''

) +

'</section>' +

'<section class="panel">' +

'<div class="title">' +
'CHAT' +
'</div>' +

chatHTML() +

'</section>';
}

function renderGame(){

const me =
S.players.find(
p =>
p.id === S.me
);

const active =
S.players[S.turn];

const mine =
active &&
me &&
active.id === me.id;

const canHold =
mine &&
S.phase === 'main' &&
S.selected.length > 0;

const canReroll =
mine &&
S.phase === 'main' &&
!S.mustHold;

app.innerHTML =

'<section class="panel">' +

'<div class="players">' +

S.players
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

'</section>' +

'<section class="panel">' +

'<div class="status">' +

'AAN DE BEURT: ' +

'<span style="color:#ffdf70">' +

esc(
active?.name || '-'
) +

'</span> ' +

(
mine
? '(JIJ)'
: ''
) +

'</div>' +

'<div class="notice">' +

esc(S.message) +

'</div>' +

'<div class="table">' +

'<div class="dice">' +

diceHTML() +

'</div>' +

'<div class="actions">' +

'<button class="green" ' +
'onclick="doAction(\\'begin\\')" ' +

(
!mine ||
S.phase !== 'main'
? 'disabled'
: ''
) +

'>' +

'BEGIN WORP' +

'</button>' +

'<button ' +
'onclick="doAction(\\'hold\\')" ' +

(
!canHold
? 'disabled'
: ''
) +

'>' +

'VASTHOUDEN' +

'</button>' +

'<button class="dark" ' +
'onclick="doAction(\\'reroll\\')" ' +

(
!canReroll
? 'disabled'
: ''
) +

'>' +

'OPNIEUW GOOIEN' +

'</button>' +

'<button ' +
'onclick="doAction(\\'accept\\')" ' +

(
!mine ||
S.phase !== 'earn'
? 'disabled'
: ''
) +

'>' +

'AKKOORD' +

'</button>' +

'<button class="red" ' +
'onclick="doAction(\\'undo\\')" ' +

(
!mine ||
S.phase !== 'main' ||
!S.holdHistory.length
? 'disabled'
: ''
) +

'>' +

'VASTHOUDEN ANNULEREN' +

'</button>' +

'</div>' +

'</div>' +

'</section>' +

'<section class="panel">' +

'<div class="title">' +
'CHAT' +
'</div>' +

chatHTML() +

'</section>';
}

function render(){

if(!S){

renderHome();

return;

}

if(!S.started)
renderLobby();

else
renderGame();

}

async function refresh(){

try{

S =
await api(
'/api/state'
);

render();

const c =
$('chat');

if(c)
c.scrollTop =
c.scrollHeight;

}catch(e){

if(
!sessionStorage.getItem(KEY)
){

renderHome();

}else{

app.innerHTML =
'<section class="panel">' +

'<div class="error">'
