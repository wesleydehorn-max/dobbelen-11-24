const http = require("http");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;

const rooms = new Map();
const sessions = new Map();

function randomId() {
  return crypto.randomBytes(24).toString("hex");
}

function roomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;

  do {
    code = "";
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));

  return code;
}

function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
}

function rollFive() {
  return [
    rollDie(),
    rollDie(),
    rollDie(),
    rollDie(),
    rollDie()
  ];
}

function cleanName(value) {
  const name = String(value || "")
    .trim()
    .replace(/\s+/g, " ");

  if (!name) {
    throw new Error("Vul eerst een speelnaam in.");
  }

  if (name.length > 20) {
    throw new Error("De naam mag maximaal 20 tekens zijn.");
  }

  return name;
}

function cleanCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function activePlayers(room) {
  return room.players.filter(p => p.active);
}

function currentPlayer(room) {
  if (!room.players.length) return null;

  if (
    room.players[room.current] &&
    room.players[room.current].active
  ) {
    return room.players[room.current];
  }

  for (let i = 0; i < room.players.length; i++) {
    const n = (room.current + i) % room.players.length;

    if (room.players[n] && room.players[n].active) {
      room.current = n;
      return room.players[n];
    }
  }

  return null;
}

function playerIndex(room, id) {
  return room.players.findIndex(p => p.id === id);
}

function nextPlayer(room) {
  for (let i = 1; i <= room.players.length; i++) {
    const n = (room.current + i) % room.players.length;

    if (
      room.players[n] &&
      room.players[n].active
    ) {
      room.current = n;
      return room.players[n];
    }
  }

  return currentPlayer(room);
}

function addLog(room, text) {
  room.log.unshift({
    text,
    time: new Date().toLocaleTimeString("nl-NL", {
      hour: "2-digit",
      minute: "2-digit"
    })
  });

  room.log = room.log.slice(0, 30);
}

function bump(room) {
  room.version++;
}

function resetTurn(room) {
  room.phase = "main";

  room.dice = [1, 1, 1, 1, 1];

  room.held = [
    false,
    false,
    false,
    false,
    false
  ];

  room.settled = [
    false,
    false,
    false,
    false,
    false
  ];

  room.hasRolled = false;
  room.mustHold = false;

  room.holdHistory = [];

  room.target = null;
  room.mode = null;
  room.needFreshRoll = false;
}

function newRoom(name) {
  const room = {
    code: roomCode(),

    players: [],

    admin: null,

    started: false,

    current: 0,

    phase: "lobby",

    dice: [1, 1, 1, 1, 1],

    held: [
      false,
      false,
      false,
      false,
      false
    ],

    settled: [
      false,
      false,
      false,
      false,
      false
    ],

    hasRolled: false,

    mustHold: false,

    holdHistory: [],

    target: null,

    mode: null,

    needFreshRoll: false,

    banner: "Wacht op spelers.",

    version: 1,

    rollSeq: 0,

    log: [],

    chat: []
  };

  const player = {
    id: randomId(),
    name,
    money: 100,
    active: true
  };

  room.players.push(player);
  room.admin = player.id;

  rooms.set(room.code, room);

  addLog(
    room,
    name + " heeft de kamer gemaakt."
  );

  return {
    room,
    player
  };
}

function createSession(roomCode, playerId) {
  const token = randomId();

  sessions.set(token, {
    roomCode,
    playerId
  });

  return token;
}

function auth(req) {
  const token =
    req.headers["x-player-token"];

  if (!token) return null;

  const session =
    sessions.get(String(token));

  if (!session) return null;

  const room =
    rooms.get(session.roomCode);

  if (!room) return null;

  const player =
    room.players.find(
      p => p.id === session.playerId
    );

  if (!player) return null;

  return {
    room,
    player
  };
}

function fullBak(room) {
  return room.dice.every(
    d => d === room.dice[0]
  );
}

function startGame(room) {
  if (activePlayers(room).length < 2) {
    throw new Error(
      "Er moeten minimaal 2 spelers zijn."
    );
  }

  room.started = true;

  room.current =
    room.players.findIndex(
      p => p.id === room.admin
    );

  room.players.forEach(p => {
    if (p.active) {
      p.money = 100;
    }
  });

  resetTurn(room);

  const p = currentPlayer(room);

  room.banner =
    p.name +
    " is aan de beurt. Druk op BEGIN WORP.";

  addLog(
    room,
    "Het spel is gestart."
  );

  bump(room);
}

function beginTurn(room) {
  if (
    room.phase !== "main" ||
    room.hasRolled
  ) {
    throw new Error(
      "Je kunt nu geen beginworp doen."
    );
  }

  room.dice = rollFive();

  room.held = [
    false,
    false,
    false,
    false,
    false
  ];

  room.settled = [
    false,
    false,
    false,
    false,
    false
  ];

  room.hasRolled = true;
  room.mustHold = true;
  room.holdHistory = [];

  room.rollSeq++;

  if (fullBak(room)) {
    enterFullBak(room);
    return;
  }

  room.banner =
    currentPlayer(room).name +
    " heeft gegooid. Houd minimaal één nieuwe dobbelsteen vast.";

  addLog(
    room,
    currentPlayer(room).name +
      " gooide " +
      room.dice.join(" - ") +
      "."
  );

  bump(room);
}

function enterFullBak(room) {
  room.phase = "round";

  room.target = 6;
  room.mode = "earn";

  room.settled = [
    false,
    false,
    false,
    false,
    false
  ];

  room.held = [
    false,
    false,
    false,
    false,
    false
  ];

  room.needFreshRoll = true;
  room.hasRolled = true;
  room.mustHold = false;

  room.banner =
    "🎲 VOLLE BAK! 6'en VERDIENEN.";

  addLog(
    room,
    currentPlayer(room).name +
      " gooide VOLLE BAK."
  );

  bump(room);
}

function holdDie(room, index) {
  if (
    room.phase !== "main" ||
    !room.hasRolled
  ) {
    throw new Error(
      "Je kunt nu niet vasthouden."
    );
  }

  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index > 4
  ) {
    throw new Error(
      "Ongeldige dobbelsteen."
    );
  }

  if (room.held[index]) {
    throw new Error(
      "Deze dobbelsteen staat al vast."
    );
  }

  room.held[index] = true;
  room.holdHistory.push(index);
  room.mustHold = false;

  room.banner =
    currentPlayer(room).name +
    " heeft een dobbelsteen vastgezet.";

  bump(room);
}

function undoHold(room) {
  if (
    room.phase !== "main" ||
    !room.hasRolled
  ) {
    throw new Error(
      "Je kunt dit nu niet annuleren."
    );
  }

  if (!room.holdHistory.length) {
    throw new Error(
      "Er is niets om te annuleren."
    );
  }

  const index =
    room.holdHistory.pop();

  room.held[index] = false;

  room.mustHold =
    room.holdHistory.length === 0;

  room.banner =
    currentPlayer(room).name +
    " heeft de laatste vasthoudactie geannuleerd.";

  bump(room);
}

function reroll(room) {
  if (
    room.phase !== "main" ||
    !room.hasRolled
  ) {
    throw new Error(
      "Doe eerst de beginworp."
    );
  }

  if (room.mustHold) {
    throw new Error(
      "Houd eerst minimaal één nieuwe dobbelsteen vast."
    );
  }

  const loose = [];

  for (let i = 0; i < 5; i++) {
    if (!room.held[i]) {
      loose.push(i);
    }
  }

  if (!loose.length) {
    throw new Error(
      "Alle dobbelstenen staan vast."
    );
  }

  loose.forEach(i => {
    room.dice[i] = rollDie();
  });

  room.mustHold = true;
  room.holdHistory = [];
  room.rollSeq++;

  if (fullBak(room)) {
    enterFullBak(room);
    return;
  }

  room.banner =
    currentPlayer(room).name +
    " heeft opnieuw gegooid.";

  addLog(
    room,
    currentPlayer(room).name +
      " gooide opnieuw: " +
      room.dice.join(" - ") +
      "."
  );

  bump(room);
}

function diceTotal(room) {
  return room.dice.reduce(
    (a, b) => a + b,
    0
  );
}

function targetFor(total) {
  if (
    total === 11 ||
    total === 24
  ) {
    return null;
  }

  if (total >= 5 && total <= 10) {
    return {
      target: 11 - total,
      mode: "earn"
    };
  }

  if (total >= 12 && total <= 17) {
    return {
      target: total - 11,
      mode: "pay"
    };
  }

  if (total >= 18 && total <= 23) {
    return {
      target: 24 - total,
      mode: "pay"
    };
  }

  if (total >= 25 && total <= 30) {
    return {
      target: total - 24,
      mode: "earn"
    };
  }

  return null;
}

function transferPerOpponent(
  room,
  player,
  amount,
  mode
) {
  const opponents =
    activePlayers(room).filter(
      p => p.id !== player.id
    );

  opponents.forEach(opponent => {
    if (mode === "earn") {
      opponent.money -= amount;
      player.money += amount;
    } else {
      player.money -= amount;
      opponent.money += amount;
    }
  });
}

function finishTurn(room) {
  nextPlayer(room);

  resetTurn(room);

  const p =
    currentPlayer(room);

  if (p) {
    room.banner =
      p.name +
      " is aan de beurt. Druk op BEGIN WORP.";
  }

  bump(room);
}

function accept(room) {
  if (
    room.phase !== "main" ||
    !room.hasRolled
  ) {
    throw new Error(
      "Doe eerst een worp."
    );
  }

  const player =
    currentPlayer(room);

  const total =
    diceTotal(room);

  if (
    total === 11 ||
    total === 24
  ) {
    transferPerOpponent(
      room,
      player,
      0.50,
      "pay"
    );

    addLog(
      room,
      player.name +
        " gooide " +
        total +
        " en betaalt €0,50 aan iedere tegenstander."
    );

    finishTurn(room);

    return;
  }

  const target =
    targetFor(total);

  if (!target) {
    throw new Error(
      "Ongeldige totaalscore."
    );
  }

  room.phase = "round";

  room.target = target.target;
  room.mode = target.mode;

  room.settled = [
    false,
    false,
    false,
    false,
    false
  ];

  room.held = [
    false,
    false,
    false,
    false,
    false
  ];

  room.needFreshRoll = false;
  room.mustHold = false;

  room.banner =
    target.mode === "earn"
      ? "💰 VERDIEN FASE"
      : "💸 BETAAL FASE";

  addLog(
    room,
    player.name +
      " accepteerde totaal " +
      total +
      ". Doelsteen: " +
      target.target +
      "."
  );

  resolveRound(room);
}

function resolveRound(room) {
  const player =
    currentPlayer(room);

  let hits = 0;

  for (let i = 0; i < 5; i++) {
    if (
      !room.settled[i] &&
      room.dice[i] === room.target
    ) {
      room.settled[i] = true;
      room.held[i] = true;
      hits++;
    }
  }

  if (!hits) {
    room.banner =
      player.name +
      ": MIS! Geen " +
      room.target +
      ".";

    addLog(
      room,
      player.name +
        " had geen doelsteen."
    );

    finishTurn(room);
    return;
  }

  const amount =
    hits *
    room.target *
    0.50;

  transferPerOpponent(
    room,
    player,
    amount,
    room.mode
  );

  room.banner =
    room.mode === "earn"
      ? "💰 VERDIEND €" +
        amount.toFixed(2)
      : "💸 BETAALD €" +
        amount.toFixed(2);

  addLog(
    room,
    player.name +
      " verwerkt " +
      hits +
      " × " +
      room.target +
      " = €" +
      amount.toFixed(2)
  );

  if (
    room.settled.every(Boolean)
  ) {
    room.needFreshRoll = true;

    room.banner =
      "🎲 ALLE 5 DOELSTENEN! Nieuwe 5 dobbelstenen bij de volgende worp.";
  }

  bump(room);
}

function roundRoll(room) {
  if (room.phase !== "round") {
    throw new Error(
      "Je bent niet in de verdien/betaalfase."
    );
  }

  if (room.needFreshRoll) {
    room.dice = rollFive();

    room.held = [
      false,
      false,
      false,
      false,
      false
    ];

    room.settled = [
      false,
      false,
      false,
      false,
      false
    ];

    room.needFreshRoll = false;

    room.rollSeq++;

    resolveRound(room);
    return;
  }

  for (let i = 0; i < 5; i++) {
    if (!room.settled[i]) {
      room.dice[i] = rollDie();
    }
  }

  room.rollSeq++;

  resolveRound(room);
}

function newGame(room) {
  if (!room.started) {
    throw new Error(
      "Het spel is nog niet gestart."
    );
  }

  activePlayers(room).forEach(
    p => {
      p.money = 100;
    }
  );

  room.current =
    room.players.findIndex(
      p => p.id === room.admin
    );

  resetTurn(room);

  room.banner =
    currentPlayer(room).name +
    " begint een nieuw spel.";

  addLog(
    room,
    "Nieuw spel gestart."
  );

  bump(room);
}

function publicState(room, player) {
  const current =
    currentPlayer(room);

  return {
    ok: true,

    room: {
      code: room.code,
      started: room.started,
      phase: room.phase,
      banner: room.banner,

      currentPlayerId:
        current
          ? current.id
          : null,

      dice: room.dice,
      held: room.held,
      settled: room.settled,

      hasRolled:
        room.hasRolled,

      mustHold:
        room.mustHold,

      holdHistory:
        room.holdHistory,

      target:
        room.target,

      mode:
        room.mode,

      needFreshRoll:
        room.needFreshRoll,

      rollSeq:
        room.rollSeq
    },

    me: {
      id: player.id,
      name: player.name,
      money: player.money,

      isAdmin:
        player.id === room.admin
    },

    players:
      room.players.map(
        p => ({
          id: p.id,
          name: p.name,
          money: p.money,
          active: p.active,
          isAdmin:
            p.id === room.admin
        })
      ),

    log: room.log,

    chat: room.chat
  };
}

function performAction(
  room,
  player,
  body
) {
  const action =
    body.action;

  if (action === "start") {
    if (player.id !== room.admin) {
      throw new Error(
        "Alleen de beheerder kan het spel starten."
      );
    }

    startGame(room);
    return;
  }

  if (action === "newGame") {
    if (player.id !== room.admin) {
      throw new Error(
        "Alleen de beheerder kan een nieuw spel starten."
      );
    }

    newGame(room);
    return;
  }

  if (action === "removePlayer") {
    if (player.id !== room.admin) {
      throw new Error(
        "Alleen de beheerder kan spelers verwijderen."
      );
    }

    const target =
      room.players.find(
        p =>
          p.id ===
          String(body.playerId || "")
      );

    if (!target || target.id === room.admin) {
      throw new Error(
        "Speler kan niet worden verwijderd."
      );
    }

    const removedIndex =
      playerIndex(room, target.id);

    target.active = false;

    if (
      room.started &&
      room.current === removedIndex
    ) {
      nextPlayer(room);
      resetTurn(room);
    }

    addLog(
      room,
      target.name +
        " is verwijderd."
    );

    bump(room);
    return;
  }

  if (action === "chat") {
    const message =
      String(
        body.message || ""
      ).trim();

    if (!message) return;

    if (message.length > 200) {
      throw new Error(
        "Bericht is te lang."
      );
    }

    room.chat.push({
      player: player.name,
      message,
      time: new Date().toLocaleTimeString(
        "nl-NL",
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      )
    });

    room.chat =
      room.chat.slice(-50);

    bump(room);
    return;
  }

  if (
    room.current !==
    playerIndex(room, player.id)
  ) {
    throw new Error(
      "Het is niet jouw beurt."
    );
  }

  if (action === "beginTurn") {
    beginTurn(room);
  } else if (action === "hold") {
    holdDie(
      room,
      Number(body.index)
    );
  } else if (action === "undoHold") {
    undoHold(room);
  } else if (action === "reroll") {
    reroll(room);
  } else if (action === "accept") {
    accept(room);
  } else if (action === "roundRoll") {
    roundRoll(room);
  } else {
    throw new Error(
      "Onbekende actie."
    );
  }
}

const HTML = String.raw`<!DOCTYPE html>
<html lang="nl">
<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width,initial-scale=1,maximum-scale=1"
>

<title>Dobbelen 11/24</title>

<style>

*{
box-sizing:border-box
}

body{
margin:0;
min-height:100vh;
font-family:Arial,sans-serif;
color:white;
background:
radial-gradient(circle at top,#203966,#071326 55%,#020711)
}

.app{
max-width:900px;
margin:auto;
padding:12px
}

.top{
text-align:center;
padding:8px 0 14px
}

.logo{
font-size:clamp(30px,8vw,48px);
font-weight:900;
color:#ffd34f;
text-shadow:0 3px #765000
}

.sub{
font-size:18px;
color:#b7c8e5
}

.card{
background:linear-gradient(145deg,#192d51,#08162f);
border:1px solid #38527a;
border-radius:18px;
padding:16px;
margin-bottom:12px;
box-shadow:0 12px 35px #0007
}

h2{
margin:0 0 12px
}

label{
display:block;
font-size:12px;
font-weight:bold;
color:#bdcbe1;
margin:9px 0 5px
}

input{
width:100%;
padding:14px;
border-radius:11px;
border:1px solid #425b81;
background:#071329;
color:#fff;
font-size:17px
}

.btn{
width:100%;
border:0;
border-radius:11px;
padding:14px;
margin-top:8px;
font-size:15px;
font-weight:900;
color:#fff;
background:#2457a7;
box-shadow:0 5px #112e5c
}

.gold{
background:linear-gradient(#ffdc6a,#db9c0c);
color:#241900;
box-shadow:0 5px #805b00
}

.green{
background:linear-gradient(#39d47e,#13994c);
box-shadow:0 5px #075c31
}

.orange{
background:linear-gradient(#ffb34b,#df6b08);
box-shadow:0 5px #7b3300
}

.red{
background:#ae2b32;
box-shadow:0 5px #65151a
}

.btn:disabled{
opacity:.35
}

.code{
font-size:38px;
font-weight:900;
letter-spacing:7px;
text-align:center;
color:#ffd65c
}

.invite{
background:#07132a;
padding:10px;
border-radius:10px;
font-size:12px;
word-break:break-all;
color:#b8c7df;
margin-top:8px
}

.player{
display:flex;
align-items:center;
justify-content:space-between;
background:#ffffff09;
border-radius:12px;
padding:11px;
margin:6px 0
}

.badge{
font-size:10px;
padding:4px 7px;
border-radius:20px;
background:#405674
}

.admin{
background:#9a7416;
color:#ffe69a
}

.money{
color:#62ed9b;
font-weight:900;
font-size:20px
}

.banner{
text-align:center;
background:#112746;
border:1px solid #3d5a82;
border-radius:11px;
padding:11px;
margin-bottom:9px;
font-weight:900;
color:#ffda68
}

.turn{
text-align:center;
color:#b9c9df;
font-size:13px;
margin-bottom:8px
}

.table{
background:
radial-gradient(circle,#1b8153,#075333 68%,#033522);
border:7px solid #714912;
border-radius:24px;
padding:17px 7px;
box-shadow:inset 0 0 30px #0009
}

.tray{
text-align:center;
color:#ffe18b;
font-weight:900;
letter-spacing:2px;
margin-bottom:10px
}

.table-count{
text-align:center;
background:#07152a;
border:1px solid #456182;
border-radius:11px;
padding:10px;
margin-bottom:10px;
font-weight:bold
}

.table-count b{
font-size:23px;
color:#ffd65b
}

.dice{
min-height:175px;
display:flex;
justify-content:center;
align-items:center;
gap:8px;
flex-wrap:wrap
}

.die{
position:relative;
width:64px;
height:64px;
border-radius:15px;
background:linear-gradient(145deg,#ff5555,#c00f0f 60%,#680303);
border:3px solid #e7ba4a;
box-shadow:
inset -6px -7px 10px #0005,
inset 4px 4px 8px #fff4,
0 7px 12px #0009
}

.click{
cursor:pointer
}

.held{
box-shadow:
0 0 0 3px #ffd43666,
0 0 24px #ffd436aa,
inset -6px -7px 10px #0005
}

.selected{
outline:4px solid #67e7ff
}

.pip{
position:absolute;
width:12px;
height:12px;
border-radius:50%;
background:white
}

.tl{left:10px;top:10px}
.tc{left:50%;top:10px;transform:translateX(-50%)}
.tr{right:10px;top:10px}
.ml{left:10px;top:50%;transform:translateY(-50%)}
.mc{left:50%;top:50%;transform:translate(-50%,-50%)}
.mr{right:10px;top:50%;transform:translateY(-50%)}
.bl{left:10px;bottom:10px}
.bc{left:50%;bottom:10px;transform:translateX(-50%)}
.br{right:10px;bottom:10px}

.roll{
animation:tumble .55s ease
}

.roll .pip{
opacity:0
}

.target{
text-align:center;
background:#0b1932;
border:1px solid #456080;
border-radius:11px;
padding:12px;
margin-bottom:9px
}

.target b{
font-size:32px;
color:#ffdd68
}

.status{
text-align:center;
padding:11px;
margin-top:8px;
border-radius:10px;
background:#0003;
color:#b9c8de
}

.row{
display:grid;
grid-template-columns:1fr 1fr;
gap:8px
}

.small{
font-size:12px;
color:#96a9c6
}

.center{
text-align:center
}

.messages{
height:170px;
overflow:auto;
background:#061126;
border-radius:10px;
padding:9px
}

.msg{
font-size:13px;
margin-bottom:7px
}

.msg b{
color:#ffd65b
}

.error{
display:none;
background:#551c24;
border:1px solid #a54450;
padding:10px;
border-radius:10px;
margin-bottom:10px
}

.hidden{
display:none!important
}

@keyframes tumble{

0%{
transform:rotateX(0) rotateY(0) rotateZ(0)
}

25%{
transform:translate(-13px,-15px) rotateX(150deg) rotateY(90deg)
}

55%{
transform:translate(14px,8px) rotateX(330deg) rotateY(220deg)
}

80%{
transform:translate(-7px,-4px) rotateX(500deg) rotateY(310deg)
}

100%{
transform:rotateX(540deg) rotateY(360deg) rotateZ(0)
}

}

@media(max-width:560px){

.die{
width:57px;
height:57px
}

.pip{
width:10px;
height:10px
}

}

</style>
</head>

<body>

<div class="app">

<div class="top">

<div class="logo">
🎲 DOBBELEN 11/24 🎲
</div>

<div class="sub">
Las Vegas multiplayer dice game
</div>

</div>

<div
id="error"
class="error"
></div>

<div id="landing">

<div
id="createCard"
class="card"
>

<h2>
🎰 Nieuwe speelkamer
</h2>

<label>
SPEELNAAM
</label>

<input
id="createName"
maxlength="20"
placeholder="Bijvoorbeeld Wesley"
>

<button
class="btn gold"
onclick="createRoom()"
>
KAMER MAKEN
</button>

</div>

<div
id="joinCard"
class="card"
>

<h2 id="joinTitle">
🚪 Meedoen met een kamer
</h2>

<label>
SPEELNAAM
</label>

<input
id="joinName"
maxlength="20"
placeholder="Bijvoorbeeld Patrick"
>

<label>
KAMERNUMMER
</label>

<input
id="joinCode"
maxlength="6"
placeholder="ABC123"
>

<button
class="btn green"
onclick="joinRoom()"
>
SPEL BINNENGAAN
</button>

</div>

</div>

<div
id="lobby"
class="hidden"
>

<div
id="inviteCard"
class="card center hidden"
>

<h2>
🎰 PRIVÉ SPEELKAMER
</h2>

<div class="small">
KAMERNUMMER
</div>

<div
id="roomCode"
class="code"
></div>

<button
class="btn gold"
onclick="copyInvite()"
>
🔗 UITNODIGINGS-LINK KOPIËREN
</button>

<div
id="invite"
class="invite"
></div>

</div>

<div class="card">

<h2>
👥 SPELERS
</h2>

<div id="lobbyPlayers"></div>

<button
id="startBtn"
class="btn green"
onclick="act('start')"
>
🎲 START SPEL
</button>

<div
id="waiting"
class="small center"
style="margin-top:8px"
></div>

</div>

</div>

<div
id="game"
class="hidden"
>

<div class="card">

<div
id="turn"
class="turn"
></div>

<div
id="banner"
class="banner"
></div>

<div
id="target"
class="target hidden"
></div>

<div
id="tableCount"
class="table-count"
></div>

<div class="table">

<div class="tray">
🎲 DOBBELBAK
</div>

<div
id="dice"
class="dice"
></div>

</div>

<div id="controls"></div>

</div>

<div class="card">

<h2>
👥 SPELERS
</h2>

<div id="players"></div>

</div>

<div class="card">

<div
style="display:flex;justify-content:space-between;align-items:center"
>

<h2 style="margin:0">
💬 CHAT
</h2>

<button
class="btn"
style="width:auto;margin:0;padding:8px 12px"
onclick="toggleChat()"
>
CHAT
</button>

</div>

<div
id="chat"
class="hidden"
>

<div
id="messages"
class="messages"
></div>

<div
style="display:grid;grid-template-columns:1fr 75px;gap:7px;margin-top:7px"
>

<input
id="chatInput"
maxlength="200"
placeholder="Typ een bericht..."
onkeydown="if(event.key==='Enter')sendChat()"
>

<button
class="btn"
style="margin:0"
onclick="sendChat()"
>
STUUR
</button>

</div>

</div>

</div>

<div
id="admin"
class="card hidden"
>

<h2>
⚙️ BEHEERDER
</h2>

<button
class="btn gold"
onclick="act('newGame')"
>
🔄 NIEUW SPEL
</button>

</div>

</div>

</div>

<script>

let state = null;
let token = "";
let timer = null;
let firstRender = true;
let lastRoll = -1;
let selected = [];
let chatOpen = false;

const params =
new URLSearchParams(
location.search
);

const inviteCode =
(params.get("join") || "")
.toUpperCase();

try{
token =
sessionStorage.getItem(
"dobbelenToken"
) || "";
}catch(e){}

function esc(v){

return String(v)
.replace(/&/g,"&amp;")
.replace(/</g,"&lt;")
.replace(/>/g,"&gt;")
.replace(/"/g,"&quot;")
.replace(/'/g,"&#039;");

}

function showError(message){

const e =
document.getElementById(
"error"
);

e.textContent =
message;

e.style.display =
"block";

setTimeout(
function(){
e.style.display="none";
},
4500
);

}

async function api(
url,
options
){

const opts =
Object.assign(
{
method:"GET",
headers:{
"Content-Type":
"application/json",
"X-Player-Token":
token
}
},
options || {}
);

const response =
await fetch(
url,
opts
);

const data =
await response.json();

if(
!response.ok ||
data.error
){

throw new Error(
data.error ||
"Er ging iets mis."
);

}

return data;

}

async function createRoom(){

try{

const name =
document
.getElementById(
"createName"
)
.value
.trim();

const data =
await api(
"/api/create",
{
method:"POST",
body:
JSON.stringify({
name:name
})
}
);

token =
data.playerToken;

sessionStorage.setItem(
"dobbelenToken",
token
);

history.replaceState(
{},
"",
"/?room="+
encodeURIComponent(
data.room.code
)
);

state = data;

render();

startPolling();

}
catch(e){

showError(
e.message
);

}

}

async function joinRoom(){

try{

const name =
document
.getElementById(
"joinName"
)
.value
.trim();

const code =
document
.getElementById(
"joinCode"
)
.value
.trim()
.toUpperCase();

const data =
await api(
"/api/join",
{
method:"POST",
body:
JSON.stringify({
name:name,
code:code
})
}
);

token =
data.playerToken;

sessionStorage.setItem(
"dobbelenToken",
token
);

history.replaceState(
{},
"",
"/?room="+
encodeURIComponent(
data.room.code
)
);

state=data;

render();

startPolling();

}
catch(e){

showError(
e.message
);

}

}

async function act(
action,
extra
){

try{

const data =
await api(
"/api/action",
{
method:"POST",
body:
JSON.stringify(
Object.assign(
{
action:action
},
extra || {}
)
)
}
);

state=data;

render();

}
catch(e){

showError(
e.message
);

}

}

async function poll(){

if(!token)return;

try{

const data =
await api(
"/api/state"
);

state=data;

render();

}
catch(e){

}

}

function startPolling(){

if(timer)return;

timer =
setInterval(
poll,
700
);

}

function render(){

if(!state){

document
.getElementById("landing")
.classList
.remove("hidden");

document
.getElementById("lobby")
.classList
.add("hidden");

document
.getElementById("game")
.classList
.add("hidden");

if(inviteCode){

document
.getElementById("createCard")
.classList
.add("hidden");

document
.getElementById("joinTitle")
.textContent =
"🎰 JE BENT UITGENODIGD";

document
.getElementById("joinCode")
.value =
inviteCode;

document
.getElementById("joinCode")
.readOnly=true;

}

return;

}

document
.getElementById("landing")
.classList
.add("hidden");

if(
!state.room.started
){

document
.getElementById("lobby")
.classList
.remove("hidden");

document
.getElementById("game")
.classList
.add("hidden");

renderLobby();

}
else{

document
.getElementById("lobby")
.classList
.add("hidden");

document
.getElementById("game")
.classList
.remove("hidden");

renderGame();

}

}

function renderLobby(){

const isAdmin =
state.me.isAdmin;

document
.getElementById("inviteCard")
.classList
.toggle(
"hidden",
!isAdmin
);

document
.getElementById("startBtn")
.classList
.toggle(
"hidden",
!isAdmin
);

document
.getElementById("roomCode")
.textContent =
state.room.code;

if(isAdmin){

const link =
location.origin+
"/?join="+
state.room.code;

document
.getElementById("invite")
.textContent =
link;

}

let html="";

state.players.forEach(
function(p){

html +=
'<div class="player">'+
'<div>'+
'<b>'+
esc(p.name)+
'</b><br>'+
'<span class="badge '+
(p.isAdmin?"admin":"")+
'">'+
(p.isAdmin?
"BEHEERDER":
"SPELER")+
'</span>'+
'</div>'+
'<div class="money">€'+
Number(p.money)
.toFixed(2)+
'</div>'+
'</div>';

}
);

document
.getElementById(
"lobbyPlayers"
)
.innerHTML =
html;

const count =
state.players.filter(
p => p.active
).length;

document
.getElementById(
"startBtn"
)
.disabled =
count < 2;

document
.getElementById(
"waiting"
)
.textContent =
isAdmin
?
(
count < 2
?
"Wacht op minimaal één andere speler."
:
"Je kunt het spel starten."
)
:
"Wachten op de beheerder…";

}

function renderGame(){

const r =
state.room;

const current =
state.players.find(
p =>
p.id ===
r.currentPlayerId
);

document
.getElementById("turn")
.textContent =
current
?
"🎲 Aan de beurt: "+
current.name
:
"";

document
.getElementById("banner")
.textContent =
r.banner;

renderTarget();
renderDice();
renderControls();
renderPlayers();

document
.getElementById("admin")
.classList
.toggle(
"hidden",
!state.me.isAdmin
);

renderChat();

}

function renderPlayers(){

let html="";

state.players.forEach(
function(p){

const current =
p.id ===
state.room.currentPlayerId;

html +=
'<div class="player">'+
'<div>'+
'<b>'+
(current?"🎲 ":"")+
esc(p.name)+
'</b><br>'+
'<span class="badge '+
(p.isAdmin?"admin":"")+
'">'+
(p.isAdmin?
"BEHEERDER":
"SPELER")+
'</span>'+
'</div>'+
'<div style="text-align:right">'+
'<div class="money">€'+
Number(p.money)
.toFixed(2)+
'</div>'+
(
state.me.isAdmin &&
!p.isAdmin
?
'<button class="btn red" style="width:auto;padding:5px 8px;font-size:10px" onclick="act(\'removePlayer\',{playerId:\''+
p.id+
'\'})">VERWIJDER</button>'
:
""
)+
'</div>'+
'</div>';

}
);

document
.getElementById("players")
.innerHTML =
html;

}

function pipHTML(n){

const positions = {
1:["mc"],
2:["tl","br"],
3:["tl","mc","br"],
4:["tl","tr","bl","br"],
5:["tl","tr","mc","bl","br"],
6:["tl","tr","ml","mr","bl","br"]
};

return positions[n]
.map(
x =>
'<span class="pip '+
x+
'"></span>'
)
.join("");

}

function selectDie(i){

const r =
state.room;

if(
r.phase !== "main" ||
!r.hasRolled ||
state.me.id !==
r.currentPlayerId ||
r.held[i]
){

return;

}

const pos =
selected.indexOf(i);

if(pos >= 0){

selected.splice(pos,1);

}
else{

selected.push(i);

}

renderDice();
renderControls();

}

function renderDice(){

const r =
state.room;

let html="";

for(let i=0;i<5;i++){

const fixed =
r.phase === "round"
?
r.settled[i]
:
r.held[i];

const clickable =
r.phase === "main" &&
r.hasRolled &&
state.me.id ===
r.currentPlayerId &&
!r.held[i];

const isSelected =
selected.indexOf(i) >= 0;

html +=
'<div class="die '+
(fixed?"held ":"")+
(clickable?"click ":"")+
(isSelected?"selected":"")+
'" '+
(
clickable
?
'onclick="selectDie('+i+')"'
:
""
)+
'>'+
pipHTML(r.dice[i])+
'</div>';

}

document
.getElementById("dice")
.innerHTML =
html;

if(
!firstRender &&
lastRoll !==
r.rollSeq
){

document
.querySelectorAll(".die")
.forEach(
function(el,i){

const fixed =
r.phase === "round"
?
r.settled[i]
:
r.held[i];

if(!fixed){

el.classList.add("roll");

setTimeout(
function(){
el.classList.remove("roll");
},
650
);

}

}
);

soundRoll();

}

lastRoll =
r.rollSeq;

firstRender=false;

}

function renderTarget(){

const r =
state.room;

const count =
r.dice.reduce(
(a,b) => a+b,
0
);

let text =
"🎯 TOTAAL OP TAFEL: <b>"+
count+
" OGEN</b>";

if(
r.phase === "round"
){

const targetCount =
r.dice.filter(
d =>
d === r.target
).length;

text +=
"<br><small>Doelsteen: <b>"+
r.target+
"</b> — "+
targetCount+
" op tafel</small>";

document
.getElementById("target")
.classList
.remove("hidden");

document
.getElementById("target")
.innerHTML =
"<b>"+
r.target+
"</b><br>"+
(
r.mode==="earn"
?
"💰 VERDIEN FASE"
:
"💸 BETAAL FASE"
)+
"<br><small>"+
"Elke doelsteen: €"+
(
r.target*0.50
).toFixed(2)+
"</small>";

}
else{

document
.getElementById("target")
.classList
.add("hidden");

}

document
.getElementById("tableCount")
.innerHTML =
text;

}

async function holdSelected(){

if(!selected.length){

showError(
"Selecteer eerst minimaal één dobbelsteen."
);

return;

}

const copy =
selected.slice();

selected=[];

for(
let i=0;
i<copy.length;
i++
){

await act(
"hold",
{
index:copy[i]
}
);

}

}

function renderControls(){

const r =
state.room;

const my =
state.me.id ===
r.currentPlayerId;

const e =
document.getElementById(
"controls"
);

if(!my){

e.innerHTML =
'<div class="status">Wacht op de andere speler.</div>';

return;

}

if(
r.phase==="main" &&
!r.hasRolled
){

e.innerHTML =
'<button class="btn gold" style="font-size:18px" onclick="act(\'beginTurn\');soundRoll()">🎲 BEGIN WORP</button>';

return;

}

if(
r.phase==="main"
){

const allHeld =
r.held.every(Boolean);

const canHold =
selected.length > 0;

e.innerHTML =
'<div class="row">'+

'<button class="btn green" onclick="holdSelected()" '+
(
canHold&&!allHeld
?
""
:
"disabled"
)+
'>🔒 VASTHOUDEN</button>'+

'<button class="btn" onclick="act(\'undoHold\')" '+
(
r.holdHistory &&
r.holdHistory.length
?
""
:
"disabled"
)+
'>↩ VASTHOUDEN ANNULEREN</button>'+

'</div>'+

'<div class="row">'+

'<button class="btn orange" onclick="act(\'reroll\');soundRoll()" '+
(
r.mustHold||allHeld
?
"disabled"
:
""
)+
'>🎲 OPNIEUW GOOIEN</button>'+

'<button class="btn" onclick="act(\'accept\');soundAccept()" '+
(
r.mustHold
?
"disabled"
:
""
)+
'>✓ AKKOORD</button>'+

'</div>'+

'<div class="status">'+
(
r.mustHold
?
"👉 Selecteer minimaal één nieuwe dobbelsteen en druk op VASTHOUDEN."
:
"✓ Klaar. Je kunt opnieuw gooien of AKKOORD kiezen."
)+
'</div>';

return;

}

if(
r.phase==="round"
){

e.innerHTML =
'<button class="btn '+
(
r.mode==="earn"
?
"green"
:
"orange"
)+
'" style="font-size:18px" onclick="act(\'roundRoll\');soundRoll()">'+
(
r.mode==="earn"
?
"💰 VERDIENEN — GOOI"
:
"💸 BETALEN — GOOI"
)+
'</button>'+

'<div class="status">'+
(
r.needFreshRoll
?
"🎲 Nieuwe set van 5 dobbelstenen!"
:
"Doelstenen worden automatisch vastgezet."
)+
'</div>';

}

}

function toggleChat(){

chatOpen =
!chatOpen;

document
.getElementById("chat")
.classList
.toggle(
"hidden",
!chatOpen
);

}

function renderChat(){

let html="";

state.chat.forEach(
m => {

html +=
'<div class="msg">'+
'<b>'+
esc(m.player)+
'</b> '+
'<span class="small">'+
esc(m.time)+
'</span><br>'+
esc(m.message)+
'</div>';

}
);

document
.getElementById("messages")
.innerHTML =
html;

const box =
document
.getElementById("messages");

box.scrollTop =
box.scrollHeight;

}

function sendChat(){

const input =
document
.getElementById("chatInput");

const message =
input.value.trim();

if(!message)return;

input.value="";

act(
"chat",
{
message:message
}
);

}

async function copyInvite(){

const link =
location.origin+
"/?join="+
state.room.code;

try{

await navigator.clipboard.writeText(link);

alert(
"Uitnodigingslink gekopieerd!"
);

}
catch(e){

prompt(
"Kopieer deze link:",
link
);

}

}

let audioContext=null;

function audio(){

if(!audioContext){

const A =
window.AudioContext ||
window.webkitAudioContext;

if(!A)return null;

audioContext =
new A();

}

if(
audioContext.state ===
"suspended"
){

audioContext.resume();

}

return audioContext;

}

function beep(
frequency,
duration
){

const c =
audio();

if(!c)return;

const oscillator =
c.createOscillator();

const gain =
c.createGain();

oscillator.frequency.value =
frequency;

oscillator.type =
"square";

gain.gain.setValueAtTime(
0.04,
c.currentTime
);

gain.gain.exponentialRampToValueAtTime(
0.001,
c.currentTime+
duration
);

oscillator.connect(gain);
gain.connect(c.destination);

oscillator.start();

oscillator.stop(
c.currentTime+
duration
);

}

function soundRoll(){

beep(90,.08);

setTimeout(
() => beep(150,.08),
80
);

setTimeout(
() => beep(220,.1),
160
);

}

function soundAccept(){

beep(500,.1);

setTimeout(
() => beep(800,.13),
100
);

}

if(inviteCode){

document
.getElementById("createCard")
.classList
.add("hidden");

document
.getElementById("joinTitle")
.textContent =
"🎰 JE BENT UITGENODIGD";

document
.getElementById("joinCode")
.value =
inviteCode;

document
.getElementById("joinCode")
.readOnly=true;

}

if(token){

poll();
startPolling();

}

render();

</script>

</body>
</html>`;

function readBody(req) {
  return new Promise(
    (resolve, reject) => {
      let data = "";

      req.on(
        "data",
        chunk => {
          data += chunk;

          if (data.length > 1000000) {
            reject(
              new Error(
                "Request is te groot."
              )
            );

            req.destroy();
          }
        }
      );

      req.on(
        "end",
        () => {
          try {
            resolve(
              data
                ? JSON.parse(data)
                : {}
            );
          } catch {
            reject(
              new Error(
                "Ongeldige gegevens."
              )
            );
          }
        }
      );

      req.on(
        "error",
        reject
      );
    }
  );
}

const server =
  http.createServer(
    async (req, res) => {

      try {

        if (
          req.method === "GET" &&
          req.url === "/health"
        ) {
          res.writeHead(
            200,
            {
              "Content-Type":
                "application/json"
            }
          );

          res.end(
            JSON.stringify({
              ok: true
            })
          );

          return;
        }

        if (
          req.method === "GET" &&
          req.url.split("?")[0] === "/"
        ) {
          res.writeHead(
            200,
            {
              "Content-Type":
                "text/html; charset=utf-8",

              "Cache-Control":
                "no-cache"
            }
          );

          res.end(HTML);
          return;
        }

        if (
          req.method === "POST" &&
          req.url === "/api/create"
        ) {

          const body =
            await readBody(req);

          const name =
            cleanName(body.name);

          const result =
            newRoom(name);

          const playerToken =
            createSession(
              result.room.code,
              result.player.id
            );

          res.writeHead(
            200,
            {
              "Content-Type":
                "application/json"
            }
          );

          res.end(
            JSON.stringify(
              Object.assign(
                publicState(
                  result.room,
                  result.player
                ),
                {
                  playerToken
                }
              )
            )
          );

          return;
        }

        if (
          req.method === "POST" &&
          req.url === "/api/join"
        ) {

          const body =
            await readBody(req);

          const name =
            cleanName(body.name);

          const code =
            cleanCode(body.code);

          if (code.length !== 6) {
            throw new Error(
              "Vul een geldig kamernummer in."
            );
          }

          const room =
            rooms.get(code);

          if (!room) {
            throw new Error(
              "Deze kamer bestaat niet."
            );
          }

          if (room.started) {
            throw new Error(
              "Het spel is al gestart."
            );
          }

          if (
            activePlayers(room).length >= 4
          ) {
            throw new Error(
              "De kamer zit al vol."
            );
          }

          if (
            room.players.some(
              p =>
                p.active &&
                p.name.toLowerCase() ===
                  name.toLowerCase()
            )
          ) {
            throw new Error(
              "Deze speelnaam wordt al gebruikt."
            );
          }

          const player = {
            id: randomId(),
            name,
            money: 100,
            active: true
          };

          room.players.push(player);

          addLog(
            room,
            name +
              " is de kamer binnengekomen."
          );

          bump(room);

          const playerToken =
            createSession(
              room.code,
              player.id
            );

          res.writeHead(
            200,
            {
              "Content-Type":
                "application/json"
            }
          );

          res.end(
            JSON.stringify(
              Object.assign(
                publicState(
                  room,
                  player
                ),
                {
                  playerToken
                }
              )
            )
          );

          return;
        }

        if (
          req.method === "GET" &&
          req.url === "/api/state"
        ) {

          const authData =
            auth(req);

          if (!authData) {
            res.writeHead(
              401,
              {
                "Content-Type":
                  "application/json"
              }
            );

            res.end(
              JSON.stringify({
                error:
                  "Geen geldige spelerssessie."
              })
            );

            return;
          }

          res.writeHead(
            200,
            {
              "Content-Type":
                "application/json",
              "Cache-Control":
                "no-cache"
            }
          );

          res.end(
            JSON.stringify(
              publicState(
                authData.room,
                authData.player
              )
            )
          );

          return;
        }

        if (
          req.method === "POST" &&
          req.url === "/api/action"
        ) {

          const authData =
            auth(req);

          if (!authData) {
            throw new Error(
              "Geen geldige spelerssessie."
            );
          }

          const body =
            await readBody(req);

          performAction(
            authData.room,
            authData.player,
            body
          );

          res.writeHead(
            200,
            {
              "Content-Type":
               
