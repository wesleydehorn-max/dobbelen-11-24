const http = require("http");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const sessions = new Map();

const uid = () => crypto.randomBytes(12).toString("hex");
const roll = () => Math.floor(Math.random() * 6) + 1;
const dice5 = () => [roll(), roll(), roll(), roll(), roll()];

function cleanName(v) {
  const n = String(v || "").trim().replace(/\s+/g, " ");
  if (!n) throw Error("Vul een speelnaam in.");
  if (n.length > 20) throw Error("Naam mag maximaal 20 tekens zijn.");
  return n;
}

function cleanCode(v) {
  return String(v || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function active(r) {
  return r.players.filter(p => p.active);
}

function current(r) {
  return r.players[r.current];
}

function idx(r, id) {
  return r.players.findIndex(p => p.id === id);
}

function log(r, text) {
  r.log.unshift({
    text,
    time: new Date().toLocaleTimeString("nl-NL", {
      hour: "2-digit",
      minute: "2-digit"
    })
  });

  r.log = r.log.slice(0, 30);
}

function bump(r) {
  r.version++;
}

function resetTurn(r) {
  r.phase = "main";
  r.dice = [null, null, null, null, null];
  r.held = [false, false, false, false, false];
  r.settled = [false, false, false, false, false];
  r.hasRolled = false;
  r.mustHold = false;
  r.target = null;
  r.mode = null;
  r.needFreshRoll = false;
  r.rollSeq++;
}

function next(r) {
  for (let n = 1; n <= r.players.length; n++) {
    const i = (r.current + n) % r.players.length;

    if (r.players[i] && r.players[i].active) {
      r.current = i;
      return;
    }
  }
}

/* =========================================================
   SPEL STARTEN
========================================================= */

function start(r) {
  if (active(r).length < 2) {
    throw Error("Er moeten minimaal 2 spelers zijn.");
  }

  r.players.forEach(p => {
    if (p.active) p.money = 100;
  });

  r.started = true;
  r.current = r.players.findIndex(p => p.active);

  resetTurn(r);

  log(
    r,
    "🎰 Het spel is gestart. Iedereen begint met €100,00."
  );

  r.banner =
    current(r).name +
    " is aan de beurt — druk op BEGIN WORP.";

  bump(r);
}

function finish(r) {
  next(r);
  resetTurn(r);

  r.banner =
    current(r).name +
    " is aan de beurt — druk op BEGIN WORP.";

  bump(r);
}

/* =========================================================
   GELD
========================================================= */

function transfer(r, p, amount, mode) {
  const others = active(r).filter(x => x.id !== p.id);

  others.forEach(o => {
    if (mode === "earn") {
      o.money -= amount;
      p.money += amount;
    } else {
      p.money -= amount;
      o.money += amount;
    }
  });

  log(
    r,
    mode === "earn"
      ? "💰 " + p.name + " verdient €" + amount.toFixed(2) + " per tegenstander."
      : "💸 " + p.name + " betaalt €" + amount.toFixed(2) + " per tegenstander."
  );
}

/* =========================================================
   DOEL
========================================================= */

function targetFor(total) {
  if (total === 11 || total === 24) {
    return {
      special: true,
      target: total
    };
  }

  if (total >= 12 && total <= 17) {
    return {
      target: total - 11,
      mode: "earn"
    };
  }

  if (total >= 18 && total <= 23) {
    return {
      target: 24 - total,
      mode: "pay"
    };
  }

  if (total < 11) {
    return {
      target: 11 - total,
      mode: "earn"
    };
  }

  return {
    target: total - 24,
    mode: "earn"
  };
}

function full(dice) {
  return dice.every(x => x && x === dice[0]);
}

/* =========================================================
   HOOFDWORP
========================================================= */

function mainResolve(r) {
  const p = current(r);

  const total = r.dice.reduce(
    (a, b) => a + b,
    0
  );

  /*
    VOLLE BAK
  */

  if (full(r.dice)) {
    r.target = 6;
    r.mode = "earn";

    r.held = [true, true, true, true, true];
    r.settled = [true, true, true, true, true];

    transfer(r, p, 25, "earn");

    r.phase = "earn";
    r.needFreshRoll = true;

    r.banner =
      "🔥 VOLLE BAK! " +
      p.name +
      " verdient €25,00 en krijgt een nieuwe set.";

    bump(r);
    return;
  }

  const q = targetFor(total);

  /*
    11 OF 24
  */

  if (q.special) {
    active(r)
      .filter(x => x.id !== p.id)
      .forEach(o => {
        p.money -= 0.50;
        o.money += 0.50;
      });

    r.banner =
      "🎯 " +
      q.target +
      " — €0,50 naar iedere tegenstander.";

    log(r, r.banner);

    finish(r);
    return;
  }

  r.target = q.target;
  r.mode = q.mode;
  r.phase = q.mode;

  r.settled = r.dice.map(
    v => v === q.target
  );

  r.held = r.settled.slice();

  const count =
    r.settled.filter(Boolean).length;

  if (count) {
    transfer(
      r,
      p,
      count * 5,
      q.mode
    );
  }

  r.banner =
    (q.mode === "earn"
      ? "💰 VERDIENEN: "
      : "💸 BETALEN: ") +
    q.target +
    "'EN";

  bump(r);
}

/* =========================================================
   VERDIENEN / BETALEN
========================================================= */

function earnResolve(r) {
  const p = current(r);

  /*
    Nieuwe set na volle bak
  */

  if (r.needFreshRoll) {
    r.dice = dice5();

    r.held = [
      false,
      false,
      false,
      false,
      false
    ];

    r.settled = [
      false,
      false,
      false,
      false,
      false
    ];

    r.needFreshRoll = false;
  } else {
    r.dice = r.dice.map(
      (v, i) =>
        r.settled[i]
          ? v
          : roll()
    );
  }

  const found = r.dice.map(
    (v, i) =>
      !r.settled[i] &&
      v === r.target
  );

  /*
    MIS
  */

  if (!found.some(Boolean)) {
    r.banner =
      "❌ MIS — geen " +
      r.target +
      " gegooid.";

    finish(r);
    return;
  }

  const count =
    found.filter(Boolean).length;

  found.forEach((yes, i) => {
    if (yes) {
      r.settled[i] = true;
      r.held[i] = true;
    }
  });

  transfer(
    r,
    p,
    count * 5,
    r.mode
  );

  r.banner =
    (r.mode === "earn"
      ? "💰 VERDIENEN: "
      : "💸 BETALEN: ") +
    r.target +
    "'EN — " +
    count +
    " doelsteen" +
    (count === 1 ? "" : "en");

  /*
    Alle vijf doelstenen:
    nieuwe set van vijf.
  */

  if (r.settled.every(Boolean)) {
    r.needFreshRoll = true;
  }

  bump(r);
}

/* =========================================================
   ACTIES
========================================================= */

function action(r, p, b) {
  const a = b.action;
  const pi = idx(r, p.id);

  /*
    START
  */

  if (a === "start") {
    if (p.id !== r.admin) {
      throw Error(
        "Alleen de beheerder kan starten."
      );
    }

    start(r);
    return;
  }

  /*
    CHAT
  */

  if (a === "chat") {
    const text =
      String(b.text || "")
        .trim()
        .slice(0, 200);

    if (text) {
      r.chat.push({
        player: p.name,
        text,
        time: new Date().toLocaleTimeString(
          "nl-NL",
          {
            hour: "2-digit",
            minute: "2-digit"
          }
        )
      });

      r.chat = r.chat.slice(-50);

      bump(r);
    }

    return;
  }

  if (!r.started) {
    throw Error(
      "Het spel is nog niet gestart."
    );
  }

  if (r.current !== pi) {
    throw Error(
      "Het is niet jouw beurt."
    );
  }

  /*
    BEGIN WORP
  */

  if (a === "begin") {
    if (
      r.phase !== "main" ||
      r.hasRolled
    ) {
      throw Error(
        "Je kunt nu niet beginnen."
      );
    }

    r.dice = dice5();

    r.hasRolled = true;
    r.mustHold = true;
    r.rollSeq++;

    bump(r);
    return;
  }

  /*
    VASTZETTEN
  */

  if (a === "hold") {
    const i = Number(b.index);

    if (
      r.phase !== "main" ||
      !r.hasRolled ||
      !Number.isInteger(i) ||
      i < 0 ||
      i > 4 ||
      r.held[i]
    ) {
      throw Error(
        "Ongeldige dobbelsteen."
      );
    }

    r.held[i] = true;
    r.mustHold = false;

    bump(r);
    return;
  }

  /*
    OPNIEUW GOOIEN
  */

  if (a === "reroll") {
    if (
      r.phase !== "main" ||
      !r.hasRolled
    ) {
      throw Error(
        "Je kunt nu niet opnieuw gooien."
      );
    }

    if (r.mustHold) {
      throw Error(
        "Je moet eerst minimaal één nieuwe dobbelsteen vasthouden."
      );
    }

    if (r.held.every(Boolean)) {
      throw Error(
        "Alle dobbelstenen staan vast."
      );
    }

    r.dice = r.dice.map(
      (v, i) =>
        r.held[i]
          ? v
          : roll()
    );

    r.mustHold = true;
    r.rollSeq++;

    bump(r);
    return;
  }

  /*
    AKKOORD
  */

  if (a === "accept") {
    if (
      r.phase !== "main" ||
      !r.hasRolled
    ) {
      throw Error(
        "Je kunt nu niet akkoord geven."
      );
    }

    mainResolve(r);
    return;
  }

  /*
    VERDIENEN / BETALEN
  */

  if (a === "roundRoll") {
    if (
      r.phase !== "earn" &&
      r.phase !== "pay"
    ) {
      throw Error(
        "Niet beschikbaar."
      );
    }

    earnResolve(r);
    return;
  }

  throw Error(
    "Onbekende actie."
  );
}

/* =========================================================
   KAMER
========================================================= */

function createRoom(name) {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code;

  do {
    code = "";

    for (let i = 0; i < 6; i++) {
      code +=
        chars[
          Math.floor(
            Math.random() * chars.length
          )
        ];
    }
  } while (rooms.has(code));

  const player = {
    id: uid(),
    name,
    money: 100,
    active: true
  };

  const room = {
    code,

    players: [player],

    admin: player.id,

    started: false,

    current: 0,

    phase: "lobby",

    dice: [
      null,
      null,
      null,
      null,
      null
    ],

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

    target: null,

    mode: null,

    needFreshRoll: false,

    banner:
      "🎰 Wacht op spelers...",

    version: 1,

    rollSeq: 0,

    log: [],

    chat: []
  };

  rooms.set(code, room);

  return [
    room,
    player
  ];
}

function joinRoom(code, name) {
  const room = rooms.get(code);

  if (!room) {
    throw Error(
      "Kamer niet gevonden."
    );
  }

  if (room.started) {
    throw Error(
      "Dit spel is al gestart."
    );
  }

  if (active(room).length >= 4) {
    throw Error(
      "Deze tafel zit vol."
    );
  }

  const player = {
    id: uid(),
    name,
    money: 100,
    active: true
  };

  room.players.push(player);

  log(
    room,
    "🎩 " +
    player.name +
    " zit aan tafel."
  );

  bump(room);

  return [
    room,
    player
  ];
}

/* =========================================================
   SESSIES
========================================================= */

function createSession(room, player) {
  const sid = uid();

  sessions.set(
    sid,
    {
      room: room.code,
      player: player.id
    }
  );

  return sid;
}

function getSession(req) {
  const cookie =
    (req.headers.cookie || "")
      .split(";")
      .map(x => x.trim())
      .find(x =>
        x.startsWith("sid=")
      );

  if (!cookie) return null;

  return sessions.get(
    cookie.substring(4)
  );
}

function getMe(req) {
  const session =
    getSession(req);

  if (!session) return null;

  const room =
    rooms.get(session.room);

  if (!room) return null;

  const player =
    room.players.find(
      p => p.id === session.player
    );

  if (!player) return null;

  return {
    room,
    player
  };
}

/* =========================================================
   STATE
========================================================= */

function publicState(room, player) {
  return {
    room: {
      code: room.code,

      started: room.started,

      canStart:
        !room.started &&
        player.id === room.admin &&
        active(room).length >= 2,

      playerCount:
        active(room).length,

      current:
        current(room)
          ? {
              id: current(room).id,
              name: current(room).name
            }
          : null,

      phase: room.phase,

      dice: room.dice,

      held: room.held,

      settled: room.settled,

      hasRolled:
        room.hasRolled,

      mustHold:
        room.mustHold,

      target:
        room.target,

      mode:
        room.mode,

      needFreshRoll:
        room.needFreshRoll,

      banner:
        room.banner,

      version:
        room.version,

      rollSeq:
        room.rollSeq,

      log:
        room.log,

      chat:
        room.chat
    },

    players:
      room.players.map(p => ({
        id: p.id,
        name: p.name,
        money:
          Number(
            p.money.toFixed(2)
          ),
        active: p.active,
        isAdmin:
          p.id === room.admin
      })),

    me: {
      id: player.id,
      name: player.name,
      money:
        Number(
          player.money.toFixed(2)
        ),
      isAdmin:
        player.id === room.admin
    }
  };
}

/* =========================================================
   WEBSITE
========================================================= */

const HTML = String.raw`<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,
  initial-scale=1,
  maximum-scale=1,
  user-scalable=no">

<title>Dobbelen 11/24</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;

  background:
    radial-gradient(
      circle at top,
      #173b2b,
      #020604 75%
    );

  color: white;

  font-family:
    Arial,
    sans-serif;
}

.wrap {
  max-width: 1100px;
  margin: auto;
  padding: 10px;
}

.top {
  padding: 14px;

  text-align: center;

  border:
    1px solid #b88a2c;

  border-radius: 18px;

  background: #08110c;

  box-shadow:
    0 0 25px #000;
}

.top h1 {
  margin: 0;

  color: #ffd76b;

  letter-spacing: 3px;
}

.top small {
  color: #cdbb7b;
  letter-spacing: 2px;
}

.panel {
  margin-top: 10px;

  padding: 14px;

  border:
    1px solid #98722c;

  border-radius: 20px;

  background:
    linear-gradient(
      145deg,
      #14271c,
      #050b07
    );

  box-shadow:
    0 10px 30px #000;
}

.code {
  text-align: center;

  font-size: 25px;

  font-weight: bold;

  letter-spacing: 7px;

  color: #ffe08a;
}

.status {
  text-align: center;

  color: #7dffad;

  font-weight: bold;

  margin: 10px;
}

.players {
  display: grid;

  grid-template-columns:
    repeat(4, 1fr);

  gap: 8px;
}

.pc {
  padding: 12px;

  border:
    1px solid #58451f;

  border-radius: 14px;

  text-align: center;

  background: #0b1710;

  min-height: 75px;
}

.pc.admin {
  border-color: #d6aa42;

  box-shadow:
    0 0 15px #d6aa4233;
}

.role {
  font-size: 11px;

  color: #d8b75f;

  margin-top: 4px;
}

.money {
  color: #7dffad;

  font-weight: bold;

  margin-top: 5px;
}

.wait {
  text-align: center;

  padding: 22px;
}

.wait .big {
  font-size: 50px;
}

.wait h2 {
  color: #ffd66b;
}

.btn {
  border: 0;

  border-radius: 12px;

  padding: 12px 16px;

  font-weight: bold;

  box-shadow:
    0 5px 12px #0008;

  cursor: pointer;
}

.btn:disabled {
  opacity: .35;
}

.green {
  background:
    linear-gradient(
      #29aa5c,
      #0b602d
    );

  color: white;
}

.orange {
  background:
    linear-gradient(
      #ffb43d,
      #bd5d0b
    );

  color: #241100;
}

.blue {
  background:
    linear-gradient(
      #2868b7,
      #123766
    );

  color: white;
}

.red {
  background:
    linear-gradient(
      #d84d4d,
      #7e1717
    );

  color: white;
}

.controls {
  text-align: center;

  margin-top: 10px;
}

.controls button {
  margin: 4px;
}

.game {
  display: grid;

  grid-template-columns:
    minmax(0, 1fr)
    280px;

  gap: 10px;

  margin-top: 10px;
}

.table {
  min-height: 500px;

  border:
    5px solid #b7892c;

  border-radius: 28px;

  background:
    radial-gradient(
      ellipse,
      #16834b,
      #064b2a 65%,
      #02331d
    );

  box-shadow:
    inset 0 0 55px #0009,
    0 15px 40px #0008;

  overflow: hidden;
}

.title {
  text-align: center;

  padding: 12px;

  color: #ffe28a;

  font-weight: bold;

  letter-spacing: 3px;
}

.banner {
  margin: auto;

  max-width: 90%;

  padding: 10px;

  text-align: center;

  border-radius: 12px;

  background: #0007;

  border:
    1px solid #f5d36a66;

  font-weight: bold;
}

.target {
  text-align: center;

  color: #ffe28b;

  font-size: 24px;

  font-weight: bold;

  margin: 10px;
}

.tray {
  position: relative;

  width: 94%;

  height: 315px;

  margin:
    25px auto
    10px;

  border:
    3px solid #d4ad4d;

  border-radius: 25px;

  background:
    radial-gradient(
      ellipse,
      #0c7844,
      #034126
    );

  box-shadow:
    inset 0 0 40px #0008;
}

.cup {
  position: absolute;

  z-index: 3;

  top: -25px;

  left: 50%;

  transform:
    translateX(-50%);

  width: 105px;

  height: 75px;

  border-radius:
    10px
    10px
    38px
    38px;

  border:
    3px solid #f4d46c;

  background:
    linear-gradient(
      90deg,
      #68400c,
      #e1b546,
      #70460d
    );

  box-shadow:
    0 12px 22px #0009;
}

.dice {
  position: absolute;

  inset:
    45px
    10px
    10px;

  display: flex;

  justify-content: center;

  align-items: center;

  flex-wrap: wrap;

  gap: 14px;
}

.die {
  width: 76px;

  height: 76px;

  border-radius: 17px;

  position: relative;

  background:
    linear-gradient(
      145deg,
      #ff4242,
      #c50e18 55%,
      #700009
    );

  border:
    3px solid #f0c95c;

  box-shadow:
    inset -7px -9px 12px #0006,
    0 9px 18px #0008;
}

.die.held {
  border-width: 5px;

  box-shadow:
    0 0 24px #ffd43d99,
    inset -7px -9px 12px #0006;
}

.die.held:after {
  content: "VAST";

  position: absolute;

  bottom: -23px;

  left: 50%;

  transform:
    translateX(-50%);

  font-size: 9px;

  color: #ffe78b;

  font-weight: bold;
}

.pip {
  position: absolute;

  width: 13px;

  height: 13px;

  border-radius: 50%;

  background: white;

  transform:
    translate(-50%, -50%);

  box-shadow:
    inset 1px 1px 2px #0005;
}

.tl { left: 24%; top: 24%; }
.tc { left: 50%; top: 24%; }
.tr { left: 76%; top: 24%; }

.ml { left: 24%; top: 50%; }
.mc { left: 50%; top: 50%; }
.mr { left: 76%; top: 50%; }

.bl { left: 24%; top: 76%; }
.bc { left: 50%; top: 76%; }
.br { left: 76%; top: 76%; }

.rolling {
  animation:
    tumble .65s linear infinite;
}

.hiddenpip .pip {
  opacity: 0;
}

@keyframes tumble {

  0% {
    transform:
      translate(0,0)
      rotateX(0)
      rotateY(0)
      rotateZ(0);
  }

  25% {
    transform:
      translate(-20px,-12px)
      rotateX(130deg)
      rotateY(70deg)
      rotateZ(55deg);
  }

  50% {
    transform:
      translate(20px,12px)
      rotateX(270deg)
      rotateY(170deg)
      rotateZ(140deg);
  }

  75% {
    transform:
      translate(-14px,10px)
      rotateX(410deg)
      rotateY(270deg)
      rotateZ(230deg);
  }

  100% {
    transform:
      translate(0,0)
      rotateX(540deg)
      rotateY(360deg)
      rotateZ(360deg);
  }
}

.side {
  display: flex;

  flex-direction: column;

  gap: 10px;
}

.sidebox {
  padding: 12px;

  border:
    1px solid #876728;

  border-radius: 16px;

  background: #07100b;
}

.sidebox h3 {
  margin:
    0 0 8px;

  color: #f1cc67;
}

.chat {
  max-height: 210px;

  overflow: auto;

  font-size: 13px;
}

.chatrow {
  margin: 5px 0;
}

.chatrow b {
  color: #ffd66b;
}

.chatform {
  display: flex;

  gap: 5px;

  margin-top: 7px;
}

.chatform input {
  min-width: 0;

  flex: 1;

  padding: 8px;

  border-radius: 8px;

  border:
    1px solid #765b25;

  background: #020604;

  color: white;
}

.logrow {
  font-size: 12px;

  color: #bbc5bd;

  padding: 3px 0;
}

@media(max-width:760px) {

  .players {
    grid-template-columns:
      repeat(2,1fr);
  }

  .game {
    grid-template-columns: 1fr;
  }

  .die {
    width: 64px;
    height: 64px;
  }

  .tray {
    height: 300px;
  }
}

</style>
</head>

<body>

<div class="wrap">

<div class="top">
  <h1>🎰 DOBBELEN 11/24</h1>
  <small>PRIVATE CASINO TABLE</small>
</div>

<section id="lobby" class="panel">

  <div id="code" class="code">
    ------
  </div>

  <div class="status">
    🟢 CASINO TAFEL OPEN
  </div>

  <div id="players" class="players"></div>

  <div id="wait"
       class="wait"
       style="display:none">

    <div class="big">🎩</div>

    <h2>
      WACHT OP DE BEHEERDER
    </h2>

    <p id="waitText">
      De tafel wordt klaargemaakt...
    </p>

    <p>
      🎲 Zodra de beheerder start,
      begint jouw eerste ronde.
    </p>

  </div>

  <div id="admin"
       class="controls"
       style="display:none">

    <button
      id="start"
      class="btn green">

      🎲 START SPEL

    </button>

  </div>

</section>

<section
  id="game"
  class="game"
  style="display:none">

  <div class="table">

    <div class="title">
      🎲 DOBBELTAFEL
    </div>

    <div id="banner"
         class="banner">
    </div>

    <div id="target"
         class="target">
    </div>

    <div class="tray">

      <div class="cup"></div>

      <div id="dice"
           class="dice">
      </div>

    </div>

    <div id="turn"
         style="
         text-align:center;
         color:#d1dad3">
    </div>

    <div id="controls"
         class="controls">
    </div>

  </div>

  <aside class="side">

    <div class="sidebox">

      <h3>
        💰 SPELERS
      </h3>

      <div id="sidePlayers"></div>

    </div>

    <div class="sidebox">

      <h3>
        💬 CHAT
      </h3>

      <div id="chat"
           class="chat">
      </div>

      <form
        id="chatForm"
        class="chatform">

        <input
          id="chatInput"
          maxlength="200"
          placeholder="Bericht...">

        <button
          class="btn blue">

          ➤

        </button>

      </form>

    </div>

    <div class="sidebox">

      <h3>
        📜 SPELLOG
      </h3>

      <div id="log"></div>

    </div>

  </aside>

</section>

</div>

<script>

var state = null;
var lastVersion = 0;
var rolling = false;

var pipMap = {
  1: ["mc"],
  2: ["tl","br"],
  3: ["tl","mc","br"],
  4: ["tl","tr","bl","br"],
  5: ["tl","tr","mc","bl","br"],
  6: ["tl","tr","ml","mr","bl","br"]
};

function api(url, options) {

  options = options || {};

  return fetch(
    url,
    {
      credentials: "same-origin",
      method:
        options.method || "GET",

      headers: {
        "Content-Type":
          "application/json"
      },

      body: options.body
    }
  )
  .then(function(response) {

    return response.json()
      .then(function(data) {

        if (!response.ok ||
            data.error) {

          throw Error(
            data.error ||
            "Er ging iets mis."
          );
        }

        return data;
      });

  });
}

function escapeHTML(value) {

  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dieHTML(
  value,
  index,
  hidden
) {

  var die =
    document.createElement("div");

  die.className = "die";

  if (
    state.room.held[index]
  ) {
    die.classList.add("held");
  }

  if (
    rolling &&
    !state.room.held[index]
  ) {
    die.classList.add("rolling");
  }

  if (hidden) {
    die.classList.add(
      "hiddenpip"
    );
  }

  var visual =
    hidden
      ? Math.floor(
          Math.random() * 6
        ) + 1
      : value;

  (
    pipMap[visual] || []
  ).forEach(function(position) {

    var pip =
      document.createElement("div");

    pip.className =
      "pip " + position;

    die.appendChild(pip);

  });

  if (
    !hidden &&
    state.room.phase === "main" &&
    state.room.hasRolled &&
    !state.room.held[index] &&
    !rolling
  ) {

    die.onclick =
      function() {

        send(
          "hold",
          { index: index }
        );

      };
  }

  return die;
}

function renderDice(hidden) {

  var box =
    document.getElementById(
      "dice"
    );

  box.innerHTML = "";

  state.room.dice.forEach(
    function(value, index) {

      if (value !== null) {

        box.appendChild(
          dieHTML(
            value,
            index,
            hidden
          )
        );

      }

    }
  );
}

function animateAfter(data) {

  state = data;

  lastVersion =
    data.room.version;

  rolling = true;

  render();

  /*
    Tijdens deze 1,35 seconde
    zijn de echte ogen verborgen.
  */

  renderDice(true);

  setTimeout(
    function() {

      rolling = false;

      render();

    },
    1350
  );
}

function send(
  action,
  extra,
  animate
) {

  extra = extra || {};

  var payload =
    Object.assign(
      {
        action: action
      },
      extra
    );

  return api(
    "/api/action",
    {
      method: "POST",

      body:
        JSON.stringify(payload)
    }
  )
  .then(function(data) {

    if (animate) {

      animateAfter(data);

    } else {

      state = data;

      lastVersion =
        data.room.version;

      render();

    }

  })
  .catch(function(error) {

    alert(error.message);

  });
}

/* =====================================================
   RENDER
===================================================== */

function render() {

  if (!state) return;

  document.getElementById(
    "code"
  ).textContent =
    state.room.code;

  renderPlayers();

  if (!state.room.started) {

    document.getElementById(
      "lobby"
    ).style.display = "block";

    document.getElementById(
      "game"
    ).style.display = "none";

    var isAdmin =
      state.me.isAdmin;

    document.getElementById(
      "admin"
    ).style.display =
      isAdmin
        ? "block"
        : "none";

    document.getElementById(
      "wait"
    ).style.display =
      isAdmin
        ? "none"
        : "block";

    if (!isAdmin) {

      var adminPlayer =
        state.players.find(
          function(p) {
            return p.isAdmin;
          }
        );

      document.getElementById(
        "waitText"
      ).textContent =
        adminPlayer
          ? "👑 " +
            adminPlayer.name +
            " maakt de tafel klaar..."
          : "De beheerder maakt de tafel klaar...";
    }

    document.getElementById(
      "start"
    ).disabled =
      !state.room.canStart;

    return;
  }

  document.getElementById(
    "lobby"
  ).style.display = "none";

  document.getElementById(
    "game"
  ).style.display = "grid";

  renderGame();
}

function renderPlayers() {

  var box =
    document.getElementById(
      "players"
    );

  box.innerHTML = "";

  for (
    var i = 0;
    i < 4;
    i++
  ) {

    var p =
      state.players[i];

    var card =
      document.createElement(
        "div"
      );

    card.className =
      "pc" +
      (
        p && p.isAdmin
          ? " admin"
          : ""
      );

    if (p) {

      card.innerHTML =
        "<b>" +
        escapeHTML(p.name) +
        "</b>" +

        "<div class='role'>" +
        (
          p.isAdmin
            ? "👑 BEHEERDER"
            : "🎩 SPELER"
        ) +
        "</div>" +

        "<div class='money'>" +
        "€" +
        p.money.toFixed(2) +
        "</div>";

    } else {

      card.innerHTML =
        "<b>🎩 WACHT...</b>" +
        "<div class='role'>OPEN PLAATS</div>";
    }

    box.appendChild(card);
  }
}

function renderGame() {

  document.getElementById(
    "banner"
  ).textContent =
    state.room.banner || "";

  var targetText = "";

  if (
    state.room.phase === "earn"
  ) {

    targetText =
      "💰 VERDIENEN: " +
      state.room.target +
      "'EN";

  } else if (
    state.room.phase === "pay"
  ) {

    targetText =
      "💸 BETALEN: " +
      state.room.target +
      "'EN";
  }

  document.getElementById(
    "target"
  ).textContent =
    targetText;

  var currentPlayer =
    state.room.current;

  document.getElementById(
    "turn"
  ).textContent =
    currentPlayer &&
    currentPlayer.id ===
      state.me.id

      ? "🎯 DIT IS JOUW BEURT"

      : "⏳ " +
        (
          currentPlayer
            ? currentPlayer.name
            : ""
        ) +
        " is aan de beurt";

  if (!rolling) {
    renderDice(false);
  }

  renderControls();
  renderSide();
  renderChat();
  renderLog();
}

function renderControls() {

  var box =
    document.getElementById(
      "controls"
    );

  box.innerHTML = "";

  var mine =
    state.room.current &&
    state.room.current.id ===
      state.me.id;

  if (!mine) return;

  function makeButton(
    text,
    className,
    callback
  ) {

    var button =
      document.createElement(
        "button"
      );

    button.className =
      "btn " + className;

    button.textContent =
      text;

    button.onclick =
      callback;

    box.appendChild(button);

    return button;
  }

  /*
    BEGIN WORP
  */

  if (
    state.room.phase === "main" &&
    !state.room.hasRolled
  ) {

    makeButton(
      "🎲 BEGIN WORP",
      "orange",
      function() {

        send(
          "begin",
          {},
          true
        );

      }
    );

    return;
  }

  /*
    HOOFDWORP
  */

  if (
    state.room.phase === "main"
  ) {

    if (
      !state.room.held.every(
        function(x) {
          return x;
        }
      )
    ) {

      var reroll =
        makeButton(
          "🎲 OPNIEUW GOOIEN",
          "orange",
          function() {

            if (
              !state.room.mustHold
            ) {

              send(
                "reroll",
                {},
                true
              );

            }

          }
        );

      if (
        state.room.mustHold
      ) {

        reroll.disabled =
          true;
      }
    }

    makeButton(
      "✓ AKKOORD",
      "blue",
      function() {

        send(
          "accept"
        );

      }
    );

    return;
  }

  /*
    VERDIENEN / BETALEN
  */

  if (
    state.room.phase === "earn" ||
    state.room.phase === "pay"
  ) {

    makeButton(
      state.room.phase === "earn"
        ? "🎲 GOOI VOOR VERDIENEN"
        : "🎲 GOOI VOOR BETALEN",

      state.room.phase === "earn"
        ? "green"
        : "red",

      function() {

        send(
          "roundRoll",
          {},
          true
        );

      }
    );
  }
}

function renderSide() {

  var box =
    document.getElementById(
      "sidePlayers"
    );

  box.innerHTML = "";

  state.players.forEach(
    function(p) {

      var row =
        document.createElement(
          "div"
        );

      row.style.display =
        "flex";

      row.style.justifyContent =
        "space-between";

      row.style.padding =
        "6px";

      row.style.borderBottom =
        "1px solid #ffffff10";

      row.innerHTML =
        "<span>" +
        (
          p.isAdmin
            ? "👑 "
            : "🎩 "
        ) +
        escapeHTML(p.name) +
        "</span>" +

        "<b>€" +
        p.money.toFixed(2) +
        "</b>";

      box.appendChild(row);
    }
  );
}

function renderChat() {

  var box =
    document.getElementById(
      "chat"
    );

  box.innerHTML = "";

  state.room.chat.forEach(
    function(message) {

      var row =
        document.createElement(
          "div"
        );

      row.className =
        "chatrow";

      row.innerHTML =
        "<b>" +
        escapeHTML(
          message.player
        ) +
        "</b> " +
        escapeHTML(
          message.text
        );

      box.appendChild(row);
    }
  );

  box.scrollTop =
    box.scrollHeight;
}

function renderLog() {

  var box =
    document.getElementById(
      "log"
    );

  box.innerHTML = "";

  state.room.log
    .slice(0, 12)
    .forEach(
      function(item) {

        var row =
          document.createElement(
            "div"
          );

        row.className =
          "logrow";

        row.textContent =
          item.time +
          " — " +
          item.text;

        box.appendChild(row);
      }
    );
}

/* =====================================================
   KNOPPEN
===================================================== */

document.getElementById(
  "start"
).onclick =
  function() {

    send("start");

  };

document.getElementById(
  "chatForm"
).onsubmit =
  function(event) {

    event.preventDefault();

    var input =
      document.getElementById(
        "chatInput"
      );

    var text =
      input.value.trim();

    if (!text) return;

    input.value = "";

    send(
      "chat",
      {
        text: text
      }
    );
  };

/* =====================================================
   POLLING
===================================================== */

function poll() {

  api("/api/state")
    .then(function(data) {

      if (
        !state ||
        data.room.version !==
          lastVersion
      ) {

        state = data;

        lastVersion =
          data.room.version;

        /*
          Tijdens een lokale
          dobbelanimatie laten we
          de echte uitkomst niet
          tussendoor zien.
        */

        if (!rolling) {
          render();
        }
      }

    })
    .catch(function() {});
}

setInterval(
  poll,
  700
);

poll();

</script>

</body>
</html>`;

/* =========================================================
   HTTP
========================================================= */

function sendJSON(
  res,
  status,
  data
) {

  res.writeHead(
    status,
    {
      "Content-Type":
        "application/json; charset=utf-8",

      "Cache-Control":
        "no-store"
    }
  );

  res.end(
    JSON.stringify(data)
  );
}

function readBody(req) {

  return new Promise(
    function(resolve, reject) {

      let data = "";

      req.on(
        "data",
        function(chunk) {

          data += chunk;

          if (
            data.length > 1000000
          ) {

            reject(
              Error(
                "Request te groot."
              )
            );

            req.destroy();
          }
        }
      );

      req.on(
        "end",
        function() {

          try {

            resolve(
              data
                ? JSON.parse(data)
                : {}
            );

          } catch (e) {

            reject(
              Error(
                "Ongeldige JSON."
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

/* =========================================================
   SERVER
========================================================= */

const server =
  http.createServer(
    async function(req, res) {

      try {

        /*
          HEALTH
        */

        if (
          req.method === "GET" &&
          req.url === "/health"
        ) {

          return sendJSON(
            res,
            200,
            {
              ok: true
            }
          );
        }

        /*
          STATE
        */

        if (
          req.method === "GET" &&
          req.url === "/api/state"
        ) {

          const me =
            getMe(req);

          if (!me) {

            return sendJSON(
              res,
              401,
              {
                error:
                  "Geen sessie"
              }
            );
          }

          return sendJSON(
            res,
            200,
            publicState(
              me.room,
              me.player
            )
          );
        }

        /*
          CREATE
        */

        if (
          req.method === "POST" &&
          req.url === "/api/create"
        ) {

          const body =
            await readBody(req);

          const name =
            cleanName(
              body.name
            );

          const created =
            createRoom(name);

          const sid =
            createSession(
              created[0],
              created[1]
            );

          res.setHeader(
            "Set-Cookie",
            "sid=" +
            sid +
            "; HttpOnly; Path=/; SameSite=Lax"
          );

          return sendJSON(
            res,
            200,
            publicState(
              created[0],
              created[1]
            )
          );
        }

        /*
          JOIN
        */

        if (
          req.method === "POST" &&
          req.url === "/api/join"
        ) {

          const body =
            await readBody(req);

          const joined =
            joinRoom(
              cleanCode(
                body.code
              ),
              cleanName(
                body.name
              )
            );

          const sid =
            createSession(
              joined[0],
              joined[1]
            );

          res.setHeader(
            "Set-Cookie",
            "sid=" +
            sid +
            "; HttpOnly; Path=/; SameSite=Lax"
          );

          return sendJSON(
            res,
            200,
            publicState(
              joined[0],
              joined[1]
            )
          );
        }

        /*
          ACTION
        */

        if (
          req.method === "POST" &&
          req.url === "/api/action"
        ) {

          const me =
            getMe(req);

          if (!me) {

            return sendJSON(
              res,
              401,
              {
                error:
                  "Geen sessie"
              }
            );
          }

          const body =
            await readBody(req);

          action(
            me.room,
            me.player,
            body
          );

          return sendJSON(
            res,
            200,
            publicState(
              me.room,
              me.player
            )
          );
        }

        /*
          WEBSITE
        */

        if (
          req.method === "GET" &&
          (
            req.url === "/" ||
            req.url.startsWith("/?")
          )
        ) {

          res.writeHead(
            200,
            {
              "Content-Type":
                "text/html; charset=utf-8",

              "Cache-Control":
                "no-store"
            }
          );

          return res.end(HTML);
        }

        return sendJSON(
          res,
          404,
          {
            error:
              "Niet gevonden"
          }
        );

      } catch (error) {

        console.error(error);

        return sendJSON(
          res,
          400,
          {
            error:
              error.message ||
              "Er ging iets mis."
          }
        );
      }
    }
  );

server.listen(
  PORT,
  function() {

    console.log(
      "🎰 Dobbelen 11/24 draait op poort " +
      PORT
    );

  }
);
