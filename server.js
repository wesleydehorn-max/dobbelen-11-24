const http = require('node:http');
const crypto = require('node:crypto');

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const sessions = new Map();

const id = () => crypto.randomBytes(12).toString('hex');
const code = () => crypto.randomBytes(3).toString('hex').toUpperCase();
const euro = n => Math.round(n * 100) / 100;
const clean = n => String(n || 'Speler').trim().slice(0, 20) || 'Speler';

function send(res, status, data, type) {
  res.writeHead(status, {
    'Content-Type': type || 'application/json',
    'Cache-Control': 'no-store'
  });
  res.end(type ? data : JSON.stringify(data));
}

function read(req) {
  return new Promise((resolve, reject) => {
    let s = '';

    req.on('data', c => {
      s += c;
      if (s.length > 100000) req.destroy();
    });

    req.on('end', () => {
      try {
        resolve(s ? JSON.parse(s) : {});
      } catch {
        reject(new Error('Ongeldige gegevens.'));
      }
    });

    req.on('error', reject);
  });
}

function makeRoom(name) {
  let c;

  do {
    c = code();
  } while (rooms.has(c));

  const host = {
    id: id(),
    name: clean(name),
    money: 100,
    admin: true
  };

  const room = {
    code: c,
    players: [host],
    started: false,
    phase: 'lobby',
    turn: 0,

    dice: [1, 1, 1, 1, 1],
    held: [false, false, false, false, false],
    selected: [],

    history: [],
    mustHold: false,
    target: null,

    message: 'Wachten op minimaal 2 spelers.',
    chat: []
  };

  rooms.set(c, room);

  return {
    room,
    player: host
  };
}

function session(room, player) {
  const token =
    id() + id();

  sessions.set(token, {
    room: room.code,
    player: player.id
  });

  return token;
}

function auth(req) {
  const token =
    req.headers['x-player-token'];

  const s =
    sessions.get(token);

  if (!s) return null;

  const room =
    rooms.get(s.room);

  if (!room) return null;

  const player =
    room.players.find(
      p => p.id === s.player
    );

  return player
    ? { room, player }
    : null;
}

function state(room, me) {
  return {
    code: room.code,
    started: room.started,
    phase: room.phase,
    turn: room.turn,

    me: me.id,

    dice: room.dice,
    held: room.held,
    selected: room.selected,

    history: room.history,
    mustHold: room.mustHold,
    target: room.target,

    message: room.message,

    players:
      room.players.map(p => ({
        id: p.id,
        name: p.name,
        money: p.money,
        admin: p.admin
      })),

    chat:
      room.chat.slice(-30)
  };
}

function total(r) {
  return r.dice.reduce(
    (a, b) => a + b,
    0
  );
}

function full(r) {
  return r.dice.every(
    v => v === r.dice[0]
  );
}

function roll(r) {
  for (let i = 0; i < 5; i++) {
    if (!r.held[i]) {
      r.dice[i] =
        1 + Math.floor(
          Math.random() * 6
        );
    }
  }
}

function payout(t) {

  if (t === 11 || t === 24) {
    return {
      special: true,
      earn: false,
      amount: 0.50
    };
  }

  if (t >= 5 && t <= 10) {
    return {
      special: false,
      earn: true,
      amount: (11 - t) * 0.50
    };
  }

  if (t >= 12 && t <= 17) {
    return {
      special: false,
      earn: false,
      amount: (t - 11) * 0.50
    };
  }

  if (t >= 18 && t <= 23) {
    return {
      special: false,
      earn: false,
      amount: (24 - t) * 0.50
    };
  }

  if (t >= 25 && t <= 30) {
    return {
      special: false,
      earn: true,
      amount: (t - 24) * 0.50
    };
  }

  return null;
}

function next(r) {

  r.turn =
    (r.turn + 1) %
    r.players.length;

  r.phase = 'main';
  r.target = null;

  r.dice =
    [1, 1, 1, 1, 1];

  r.held =
    [false, false, false, false, false];

  r.selected = [];
  r.history = [];
  r.mustHold = false;
}

function finish(r) {

  const p =
    r.players[r.turn];

  const t =
    r.target == null
      ? total(r)
      : r.target;

  const pay =
    payout(t);

  if (!pay) {

    r.message =
      p.name +
      ' heeft ' +
      t +
      ': MIS. Beurt gaat naar de volgende speler.';

    return next(r);
  }

  const ops =
    r.players.filter(
      x => x.id !== p.id
    );

  if (pay.special) {

    for (const o of ops) {

      const n =
        Math.min(
          0.50,
          p.money
        );

      p.money =
        euro(
          p.money - n
        );

      o.money =
        euro(
          o.money + n
        );
    }

    r.message =
      p.name +
      ' heeft ' +
      t +
      ': €0,50 naar iedere tegenstander.';

    return next(r);
  }

  if (pay.earn) {

    p.money =
      euro(
        p.money +
        pay.amount *
        ops.length
      );

    r.message =
      p.name +
      ' heeft ' +
      t +
      ': +€' +
      pay.amount
        .toFixed(2)
        .replace('.', ',') +
      ' per tegenstander.';

  } else {

    for (const o of ops) {

      const n =
        Math.min(
          pay.amount,
          p.money
        );

      p.money =
        euro(
          p.money - n
        );

      o.money =
        euro(
          o.money + n
        );
    }

    r.message =
      p.name +
      ' heeft ' +
      t +
      ': €' +
      pay.amount
        .toFixed(2)
        .replace('.', ',') +
      ' betalen per tegenstander.';
  }

  next(r);
}

function start(r) {

  if (r.players.length < 2) {
    throw Error(
      'Minimaal 2 spelers nodig.'
    );
  }

  r.players.forEach(
    p => p.money = 100
  );

  r.started = true;
  r.phase = 'main';
  r.turn = 0;

  r.dice =
    [1, 1, 1, 1, 1];

  r.held =
    [false, false, false, false, false];

  r.selected = [];
  r.history = [];
  r.mustHold = false;
  r.target = null;

  r.message =
    'Het spel is gestart. Klik BEGIN WORP.';
}

function act(r, p, b) {

  if (!r.started) {
    throw Error(
      'Het spel is nog niet gestart.'
    );
  }

  if (
    r.players[r.turn].id !==
    p.id
  ) {
    throw Error(
      'Je bent nu niet aan de beurt.'
    );
  }

  const a = b.action;

  if (a === 'begin') {

    if (r.phase !== 'main') {
      throw Error(
        'Deze worp kan nu niet beginnen.'
      );
    }

    r.held =
      [false, false, false, false, false];

    r.selected = [];
    r.history = [];
    r.mustHold = true;

    roll(r);

    const t =
      total(r);

    if (full(r)) {

      r.phase = 'earn';
      r.target = 6;
      r.mustHold = false;

      r.message =
        'VOLLE BAK! €6,00 per tegenstander. Klik AKKOORD.';

    } else if (
      t === 11 ||
      t === 24
    ) {

      r.phase = 'earn';
      r.target = t;
      r.mustHold = false;

      r.message =
        'Speciale score ' +
        t +
        '. Klik AKKOORD.';

    } else {

      r.message =
        'Je hebt ' +
        t +
        ' gegooid. Selecteer minimaal één steen en druk VASTHOUDEN.';
    }

    return;
  }

  if (a === 'hold') {

    if (r.phase !== 'main') {
      throw Error(
        'Vasthouden kan nu niet.'
      );
    }

    const sel =
      Array.isArray(b.selected)
        ? b.selected
        : [];

    if (!sel.length) {
      throw Error(
        'Selecteer eerst minimaal één dobbelsteen.'
      );
    }

    const added = [];

    for (const x of sel) {

      const i = Number(x);

      if (
        Number.isInteger(i) &&
        i >= 0 &&
        i < 5 &&
        !r.held[i]
      ) {

        r.held[i] = true;
        added.push(i);
      }
    }

    if (!added.length) {
      throw Error(
        'Deze dobbelstenen zijn al vastgehouden.'
      );
    }

    r.history.push(added);
    r.selected = [];
    r.mustHold = false;

    if (
      r.held.every(Boolean)
    ) {

      r.phase = 'earn';
      r.target = total(r);

      r.message =
        'Alle stenen vastgehouden: ' +
        r.target +
        '. Klik AKKOORD.';

    } else {

      r.message =
        'Vastgehouden. Totaal: ' +
        total(r) +
        '. Je kunt opnieuw gooien.';
    }

    return;
  }

  if (a === 'undo') {

    if (r.phase !== 'main') {
      throw Error(
        'Dit kan nu niet.'
      );
    }

    const last =
      r.history.pop();

    if (!last) {
      throw Error(
        'Er is niets om te annuleren.'
      );
    }

    last.forEach(
      i => r.held[i] = false
    );

    r.selected = [];

    r.mustHold =
      r.held.every(
        v => !v
      );

    r.message =
      'Laatste vasthouden is geannuleerd.';

    return;
  }

  if (a === 'reroll') {

    if (r.phase !== 'main') {
      throw Error(
        'Opnieuw gooien kan nu niet.'
      );
    }

    if (r.mustHold) {
      throw Error(
        'Houd eerst minimaal één steen vast.'
      );
    }

    roll(r);

    r.selected = [];

    const t =
      total(r);

    if (full(r)) {

      r.phase = 'earn';
      r.target = 6;
      r.mustHold = false;

      r.message =
        'VOLLE BAK! €6,00 per tegenstander. Klik AKKOORD.';

    } else if (
      t === 11 ||
      t === 24
    ) {

      r.phase = 'earn';
      r.target = t;
      r.mustHold = false;

      r.message =
        'Speciale score ' +
        t +
        '. Klik AKKOORD.';

    } else {

      r.mustHold = true;

      r.message =
        'Je hebt ' +
        t +
        ' gegooid. Selecteer minimaal één steen en druk VASTHOUDEN.';
    }

    return;
  }

  if (a === 'accept') {

    if (r.phase !== 'earn') {
      throw Error(
        'Er is nog geen score om akkoord te geven.'
      );
    }

    finish(r);
    return;
  }

  throw Error(
    'Onbekende actie.'
  );
}

const HTML = String.raw`<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Dobbelen 11/24</title>

<style>

:root{
--gold:#f5c84b;
--gold2:#ffe27b;
--green:#08783d;
--green2:#064b2a;
--red:#c92c32;
--dark:#080a0a;
--panel:#111616;
--line:#3e4748
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
#303737 0,
#111616 35%,
#050606 75%
);
font-family:Arial,sans-serif;
color:#fff
}

.wrap{
max-width:1050px;
margin:auto;
padding:18px 12px 40px
}

.logo{
text-align:center;
font-size:clamp(32px,8vw,58px);
font-weight:1000;
letter-spacing:2px;
color:var(--gold2);
text-shadow:
0 3px #76590b,
0 0 24px #e7b51d55
}

.tag{
text-align:center;
color:#bfc5c5;
font-size:clamp(14px,3vw,21px);
letter-spacing:2px;
margin:3px 0 20px
}

.panel{
background:
linear-gradient(
145deg,
#171d1d,
#0b0f0f
);
border:1px solid var(--line);
border-radius:19px;
padding:16px;
margin:13px 0;
box-shadow:
0 18px 45px #0009
}

.title{
font-size:20px;
font-weight:900;
color:var(--gold2);
margin-bottom:11px
}

.row{
display:flex;
gap:9px;
flex-wrap:wrap
}

.input{
flex:1;
min-width:180px;
padding:13px;
border-radius:11px;
border:1px solid #555;
background:#080b0b;
color:#fff;
outline:0
}

.input:focus{
border-color:var(--gold)
}

button{
border:1px solid #987313;
border-radius:11px;
padding:12px 16px;
font-weight:900;
background:
linear-gradient(
#ffe27b,
#d9aa2e
);
color:#171209;
box-shadow:
0 4px #73550b;
cursor:pointer
}

button:disabled{
opacity:.35;
cursor:not-allowed
}

.green{
background:
linear-gradient(
#24bf75,
#078047
);
border-color:#39d88f;
color:#fff;
box-shadow:
0 4px #034b29
}

.red{
background:
linear-gradient(
#ef6666,
#a51c21
);
border-color:#ff8e8e;
color:#fff;
box-shadow:
0 4px #5b090d
}

.dark{
background:
linear-gradient(
#414a4b,
#242a2b
);
border-color:#666;
color:#fff;
box-shadow:
0 4px #111
}

.players{
display:grid;
grid-template-columns:
repeat(auto-fit,minmax(175px,1fr));
gap:9px
}

.player{
background:
linear-gradient(
145deg,
#202727,
#111515
);
border:1px solid #424a4b;
border-radius:13px;
padding:11px
}

.money{
color:#76f5a7;
font-weight:900
}

.badge{
font-size:10px;
color:#111;
background:var(--gold);
padding:3px 5px;
border-radius:5px;
font-weight:900
}

.notice{
border:1px solid #6b5518;
background:#2b230c;
color:#ffe28b;
border-radius:11px;
padding:11px;
margin:10px 0;
font-weight:800
}

.table{
background:
radial-gradient(
ellipse at center,
#159354 0,
#075e36 60%,
#043b23 100%
);
border:7px solid #9d751e;
border-radius:25px;
padding:20px;
box-shadow:
inset 0 0 0 2px #d5a83a,
0 16px 35px #000b
}

.dice{
display:flex;
justify-content:center;
gap:11px;
flex-wrap:wrap;
min-height:82px
}

.die{
position:relative;
width:74px;
height:74px;
background:
linear-gradient(
145deg,
#fffdf2,
#d9d5c7
);
border:4px solid #a2151b;
border-radius:14px;
box-shadow:
0 7px #59090d,
0 10px 15px #0008;
cursor:pointer
}

.die.held{
transform:translateY(-8px);
border-color:#ffe16b;
box-shadow:
0 7px #73580b,
0 13px 20px #0009
}

.die.selected{
outline:4px solid #fff07c;
outline-offset:2px
}

.pip{
position:absolute;
width:12px;
height:12px;
border-radius:50%;
background:#151515;
transform:translate(-50%,-50%)
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
justify-content:center;
gap:9px;
flex-wrap:wrap;
margin-top:14px
}

.chat{
height:160px;
overflow:auto;
background:#080b0b;
border:1px solid #343a3b;
border-radius:11px;
padding:9px
}

.msg{
padding:4px 0
}

.msg b{
color:#ffda61
}

.invite{
background:#070909;
border:1px dashed #80691d;
border-radius:10px;
padding:11px;
word-break:break-all;
color:#ffe18a;
font-family:monospace
}

.center{
text-align:center
}

.error{
color:#ff6d6d;
font-weight:900
}

.waiting{
text-align:center;
color:#bbb;
padding:12px
}

.subtle{
color:#aeb6b6;
font-size:13px
}

@media(max-width:600px){

.wrap{
padding:12px 9px 30px
}

.panel{
padding:13px
}

.die{
width:63px;
height:63px
}

.pip{
width:10px;
height:10px
}

.table{
padding:14px;
border-width:6px
}

.actions button{
flex:1;
min-width:140px
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
'd1124token';

let S = null;

const app =
document.getElementById('app');

const qs =
new URLSearchParams(
location.search
);

const invite =
(qs.get('join') || '')
.toUpperCase();

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

const eur =
x =>
'€' +
Number(x || 0)
.toFixed(2)
.replace('.',',');

async function api(
path,
method,
data
){

const o = {
method:
method || 'GET',

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
await fetch(
path,
o
);

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

function home(){

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

'<input id="jname" ' +
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
document.getElementById(
'name'
).value
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

const c =
(
document.getElementById(
'code'
)?.value ||
invite
)
.trim()
.toUpperCase();

const n =
(
document.getElementById(
'jname'
)?.value ||
'Speler'
).trim();

const r =
await api(
'/api/join',
'POST',
{
code:c,
name:n
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

const pipMap = {

1:['b'],

2:['a','c'],

3:['a','b','c'],

4:['a','d','e','c'],

5:['a','d','b','e','c'],

6:['a','d','f','g','e','c']

};

function dice(){

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

pipMap[v]
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

function chat(){

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
'style="margin-top:8px">' +

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

function lobby(){

const me =
S.players.find(
p => p.id === S.me
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
'Deel deze link met de andere spelers:' +
'</div>' +

'<div class="invite">' +
esc(link) +
'</div>' +

'<div class="actions">' +

'<button class="dark" ' +
'onclick="copyLink()">' +

'LINK KOPIËREN' +

'</button>' +

(
me && me.admin

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
'<span class="badge">BEHEERDER</span>'
:
''
) +

'<br>' +

'<span class="money">' +
eur(p.money) +
'</span>' +

'</div>'
)
.join('') +

'</div>' +

(
S.players.length < 2

?

'<div class="waiting">' +
'Wachten op minimaal 2 spelers…' +
'</div>'

:
''
) +

'</section>' +

'<section class="panel">' +

'<div class="title">' +
'CHAT' +
'</div>' +

chat() +

'</section>';
}

function game(){

const me =
S.players.find(
p => p.id === S.me
);

const active =
S.players[S.turn];

const mine =
!!(
me &&
active &&
active.id === me.id
);

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
eur(p.money) +
'</span>' +

'</div>'
)
.join('') +

'</div>' +

'</section>' +

'<section class="panel">' +

'<div>' +

'<b>AAN DE BEURT: ' +

'<span style="color:#ffe27b">' +

esc(
active?.name || '-'
) +

'</span>' +

'</b> ' +

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

dice() +

'</div>' +

'<div class="actions">' +

'<button class="green" ' +
'onclick="action(\'begin\')" ' +

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
'onclick="action(\'hold\')" ' +

(
!mine ||
S.phase !== 'main' ||
!S.selected.length
? 'disabled'
: ''
) +

'>' +

'VASTHOUDEN' +

'</button>' +

'<button class="dark" ' +
'onclick="action(\'reroll\')" ' +

(
!mine ||
S.phase !== 'main' ||
S.mustHold
? 'disabled'
: ''
) +

'>' +

'OPNIEUW GOOIEN' +

'</button>' +

'<button ' +
'onclick="action(\'accept\')" ' +

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
'onclick="action(\'undo\')" ' +

(
!mine ||
S.phase !== 'main' ||
!S.history.length
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

chat() +

'</section>';
}

function render(){

if(!S)
return home();

if(!S.started)
lobby();

else
game();

}

async function refresh(){

try{

S =
await api(
'/api/state'
);

render();

const c =
document.getElementById(
'chat'
);

if(c)
c.scrollTop =
c.scrollHeight;

}catch(e){

if(
!sessionStorage.getItem(KEY)
){

home();

}else{

app.innerHTML =

'<section class="panel">' +

'<div class="error">' +

esc(e.message) +

'</div>' +

'</section>';

}

}

}

function selectDie(i){

if(
!S ||
S.phase !== 'main' ||
S.held[i]
)
return;

S.selected =
S.selected.includes(i)

?
S.selected.filter(
x => x !== i
)

:
S.selected.concat(i);

render();
}

async function action(a){

try{

S =
await api(
'/api/action',
'POST',
{
action:a,
selected:S.selected
}
);

render();

}catch(e){

alert(e.message);

}

}

async function startGame(){

try{

S =
await api(
'/api/start',
'POST'
);

render();

}catch(e){

alert(e.message);

}

}

function copyLink(){

navigator.clipboard
?.writeText(
location.origin +
'/?join=' +
S.code
)
.then(
() =>
alert(
'Link gekopieerd!'
)
);

}

async function sendChat(){

const x =
document.getElementById(
'chatInput'
);

if(
!x ||
!x.value.trim()
)
return;

try{

await api(
'/api/chat',
'POST',
{
text:
x.value.trim()
}
);

x.value = '';

await refresh();

}catch(e){

alert(e.message);

}

}

if(
invite &&
!sessionStorage.getItem(KEY)
){

app.innerHTML =

'<section class="panel center">' +

'<div class="title">' +

'UITNODIGING VOOR KAMER ' +

esc(invite) +

'</div>' +

'<div class="row">' +

'<input id="jname" ' +
'class="input" ' +
'maxlength="20" ' +
'placeholder="Jouw naam">' +

'<button class="green" ' +
'onclick="joinRoom()">' +

'MEEDOEN' +

'</button>' +

'</div>' +

'</section>';

}else{

refresh();

}

setInterval(
refresh,
1200
);

</script>

</body>
</html>`;

const server =
http.createServer(
async (req, res) => {

try{

const u =
new URL(
req.url,
'http://localhost'
);

if(
req.method === 'GET' &&
u.pathname === '/health'
){

return send(
res,
200,
{
ok:true
}
);

}

if(
req.method === 'GET' &&
u.pathname === '/'
){

return send(
res,
200,
HTML,
'text/html; charset=utf-8'
);

}

if(
req.method === 'POST' &&
u.pathname === '/api/create'
){

const b =
await read(req);

const x =
makeRoom(
b.name
);

return send(
res,
200,
{
code:x.room.code,
playerToken:
session(
x.room,
x.player
)
}
);

}

if(
req.method === 'POST' &&
u.pathname === '/api/join'
){

const b =
await read(req);

const c =
String(
b.code || ''
)
.trim()
.toUpperCase();

const r =
rooms.get(c);

if(!r){

return send(
res,
404,
{
error:
'Kamer bestaat niet.'
}
);

}

if(r.started){

return send(
res,
400,
{
error:
'Het spel is al gestart.'
}
);

}

if(
r.players.length >= 4
){

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

id:id(),

name:
clean(b.name),

money:100,

admin:false

};

r.players.push(p);

r.message =
p.name +
' is de kamer binnengekomen.';

return send(
res,
200,
{
code:c,

playerToken:
session(r,p)
}
);

}

const me =
auth(req);

if(!me){

return send(
res,
401,
{
error:
'Sessie verlopen. Open de kamer opnieuw.'
}
);

}

if(
req.method === 'GET' &&
u.pathname === '/api/state'
){

return send(
res,
200,
state(
me.room,
me.player
)
);

}

if(
req.method === 'POST' &&
u.pathname === '/api/start'
){

if(
!me.player.admin
){

throw Error(
'Alleen de beheerder kan starten.'
);

}

start(me.room);

return send(
res,
200,
state(
me.room,
me.player
)
);

}

if(
req.method === 'POST' &&
u.pathname === '/api/action'
){

const b =
await read(req);

act(
me.room,
me.player,
b
);

return send(
res,
200,
state(
me.room,
me.player
)
);

}

if(
req.method === 'POST' &&
u.pathname === '/api/chat'
){

const b =
await read(req);

const text =
String(
b.text || ''
)
.trim()
.slice(0,250);

if(text){

me.room.chat.push({
name:
me.player.name,
text
});

}

return send(
res,
200,
{
ok:true
}
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

}catch(e){

console.error(e);

return send(
res,
400,
{
error:
e.message ||
'Er ging iets mis.'
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
