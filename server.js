const http = require("http");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;

const rooms = new Map();
const sessions = new Map();

/* =========================================================
   HELPERS
========================================================= */

function code() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  do {
    c = "";
    for (let i = 0; i < 6; i++) {
      c += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(c));
  return c;
}

function die() {
  return Math.floor(Math.random() * 6) + 1;
}

function fiveDice() {
  return [die(), die(), die(), die(), die()];
}

function cleanName(v) {
  const n = String(v || "").trim().replace(/\s+/g, " ");
  if (!n) throw new Error("Vul een speelnaam in.");
  if (n.length > 20) throw new Error("Naam is maximaal 20 tekens.");
  return n;
}

function cleanCode(v) {
  return String(v || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function active(r) {
  return r.players.filter(p => p.active);
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

function current(r) {
  if (!r.players.length) return null;

  if (r.players[r.current] && r.players[r.current].active) {
    return r.players[r.current];
  }

  for (let i = 0; i < r.players.length; i++) {
    const n = (r.current + i) % r.players.length;

    if (r.players[n].active) {
      r.current = n;
      return r.players[n];
    }
  }

  return null;
}

function nextPlayer(r) {
  for (let i = 1; i <= r.players.length; i++) {
    const n = (r.current + i) % r.players.length;

    if (r.players[n] && r.players[n].active) {
      r.current = n;
      return r.players[n];
    }
  }

  return current(r);
}

function playerIndex(r, id) {
  return r.players.findIndex(p => p.id === id);
}

/* =========================================================
   ROOM
========================================================= */

function createRoom(name) {
  const r = {
    code: code(),

    players: [],
    admin: null,

    started: false,
    current: 0,

    phase: "lobby",

    dice: [1, 1, 1, 1, 1],
    held: [false, false, false, false, false],
    settled: [false, false, false, false, false],

    hasRolled: false,
    mustHold: false,

    target: null,
    mode: null,

    needFreshRoll: false,

    banner: "Wacht op spelers.",

    version: 1,
    rollSeq: 0,

    log: [],
    chat: []
  };

  const p = {
    id: crypto.randomUUID(),
    name,
    money: 0,
    active: true
  };

  r.players.push(p);
  r.admin = p.id;

  rooms.set(r.code, r);

  log(r, name + " heeft de kamer gemaakt.");

  return r;
}

/* =========================================================
   SESSIONS
========================================================= */

function newSession(roomCode, playerId) {
  const sid = crypto.randomBytes(24).toString("hex");

  sessions.set(sid, {
    roomCode,
    playerId
  });

  return sid;
}

function getSession(req) {
  const cookie = req.headers.cookie || "";
  const m = cookie.match(/(?:^|;\s*)sid=([^;]+)/);

  return m ? sessions.get(m[1]) : null;
}

function setCookie(res, sid) {
  res.setHeader(
    "Set-Cookie",
    "sid=" + sid + "; HttpOnly; Path=/; SameSite=Lax"
  );
}

function getRoomPlayer(req) {
  const s = getSession(req);

  if (!s) return null;

  const r = rooms.get(s.roomCode);

  if (!r) return null;

  const p = r.players.find(x => x.id === s.playerId);

  if (!p) return null;

  return {
    room: r,
    player: p
  };
}

/* =========================================================
   GAME
========================================================= */

function resetTurn(r) {
  r.phase = "main";

  r.dice = [1, 1, 1, 1, 1];

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

  r.hasRolled = false;
  r.mustHold = false;

  r.target = null;
  r.mode = null;
  r.needFreshRoll = false;

  r.rollSeq++;
}

function startGame(r) {
  if (active(r).length < 2) {
    throw new Error(
      "Er moeten minimaal 2 spelers zijn."
    );
  }

  r.started = true;
  r.current = r.players.findIndex(p => p.active);

  resetTurn(r);

  r.banner =
    current(r).name +
    " is aan de beurt. Druk op BEGIN WORP.";

  log(
    r,
    "Het spel is gestart. " +
    current(r).name +
    " begint."
  );

  bump(r);
}

function beginTurn(r) {
  if (r.phase !== "main" || r.hasRolled) {
    throw new Error(
      "Je kunt nu geen beginworp doen."
    );
  }

  r.dice = fiveDice();

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

  r.hasRolled = true;
  r.mustHold = true;
  r.rollSeq++;

  r.banner =
    current(r).name +
    " heeft gegooid. Houd minimaal 1 nieuwe dobbelsteen vast.";

  log(
    r,
    current(r).name +
    " gooide " +
    r.dice.join(" - ") +
    "."
  );

  bump(r);
}

function holdDie(r, index) {
  if (r.phase !== "main" || !r.hasRolled) {
    throw new Error(
      "Je kunt nu geen dobbelsteen vasthouden."
    );
  }

  if (!Number.isInteger(index) || index < 0 || index > 4) {
    throw new Error("Ongeldige dobbelsteen.");
  }

  if (r.held[index]) {
    throw new Error(
      "Deze dobbelsteen staat al vast."
    );
  }

  r.held[index] = true;
  r.mustHold = false;

  r.banner =
    current(r).name +
    " heeft een dobbelsteen vastgezet.";

  bump(r);
}

function reroll(r) {
  if (r.phase !== "main" || !r.hasRolled) {
    throw new Error(
      "Doe eerst de beginworp."
    );
  }

  if (r.mustHold) {
    throw new Error(
      "Houd eerst minimaal 1 nieuwe dobbelsteen vast."
    );
  }

  const loose = [];

  for (let i = 0; i < 5; i++) {
    if (!r.held[i]) loose.push(i);
  }

  if (!loose.length) {
    throw new Error(
      "Alle dobbelstenen staan vast."
    );
  }

  loose.forEach(i => {
    r.dice[i] = die();
  });

  r.mustHold = true;
  r.rollSeq++;

  r.banner =
    current(r).name +
    " heeft opnieuw gegooid. Houd minimaal 1 nieuwe dobbelsteen vast.";

  log(
    r,
    current(r).name +
    " gooide opnieuw: " +
    r.dice.join(" - ") +
    "."
  );

  bump(r);
}

function total(r) {
  return r.dice.reduce(
    (a, b) => a + b,
    0
  );
}

function targetFor(t) {
  if (t === 11 || t === 24) return null;

  let target;

  if (t < 11) {
    target = 11 - t;
  } else if (t < 18) {
    target = t - 11;
  } else if (t < 24) {
    target = 24 - t;
  } else {
    target = t - 24;
  }

  target = Math.max(1, Math.min(6, target));

  return {
    target,
    mode:
      t >= 18 && t <= 23
        ? "pay"
        : "earn"
  };
}

function money(r, player, amount, mode) {
  const opponents = active(r).filter(
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

function finishTurn(r) {
  nextPlayer(r);
  resetTurn(r);

  const p = current(r);

  if (p) {
    r.banner =
      p.name +
      " is aan de beurt. Druk op BEGIN WORP.";

    log(
      r,
      p.name +
      " is nu aan de beurt."
    );
  }

  bump(r);
}

function accept(r) {
  if (r.phase !== "main" || !r.hasRolled) {
    throw new Error(
      "Doe eerst een worp."
    );
  }

  const p = current(r);
  const t = total(r);

  /* 11 / 24 */

  if (t === 11 || t === 24) {
    active(r)
      .filter(x => x.id !== p.id)
      .forEach(opponent => {
        opponent.money -= 0.50;
        p.money += 0.50;
      });

    r.banner =
      p.name +
      " gooide " +
      t +
      "! €0,50 van iedere tegenstander.";

    log(
      r,
      p.name +
      " gooide " +
      t +
      "."
    );

    finishTurn(r);
    return;
  }

  /* VOLLE BAK */

  const counts = {};

  r.dice.forEach(v => {
    counts[v] = (counts[v] || 0) + 1;
  });

  const keys = Object.keys(counts);

  if (
    keys.length === 1 &&
    counts[keys[0]] === 5
  ) {
    r.phase = "round";
    r.target = 6;
    r.mode = "earn";

    r.settled = [
      true,
      true,
      true,
      true,
      true
    ];

    r.held = [
      true,
      true,
      true,
      true,
      true
    ];

    money(r, p, 25, "earn");

    r.needFreshRoll = true;

    r.banner =
      "VOLLE BAK! 5 × " +
      r.dice[0] +
      " — €25 verdiend. Nieuwe 5 dobbelstenen!";

    log(
      r,
      p.name +
      " gooide VOLLE BAK en verdiende €25."
    );

    bump(r);
    return;
  }

  const target =
    targetFor(t);

  r.phase = "round";
  r.target = target.target;
  r.mode = target.mode;

  r.settled = [
    false,
    false,
    false,
    false,
    false
  ];

  r.held = [
    false,
    false,
    false,
    false,
    false
  ];

  r.needFreshRoll = false;

  r.banner =
    (
      target.mode === "earn"
        ? "VERDIENEN"
        : "BETALEN"
    ) +
    ": " +
    target.target +
    "'en.";

  log(
    r,
    p.name +
    " accepteerde totaal " +
    t +
    ". Doelsteen: " +
    target.target +
    "."
  );

  resolveRound(r);
}

function resolveRound(r) {
  if (r.phase !== "round") return;

  const p = current(r);
  let hits = 0;

  for (let i = 0; i < 5; i++) {
    if (
      !r.settled[i] &&
      r.dice[i] === r.target
    ) {
      r.settled[i] = true;
      r.held[i] = true;
      hits++;
    }
  }

  if (!hits) {
    r.banner =
      p.name +
      ": MIS! Geen " +
      r.target +
      ".";

    log(
      r,
      p.name +
      " had geen doelsteen."
    );

    finishTurn(r);
    return;
  }

  const amount = hits * 5;

  money(
    r,
    p,
    amount,
    r.mode
  );

  r.banner =
    (
      r.mode === "earn"
        ? "VERDIEND"
        : "BETAALD"
    ) +
    ": €" +
    amount +
    " (" +
    hits +
    " × €5).";

  log(
    r,
    p.name +
    ": " +
    hits +
    "× " +
    r.target +
    ", €" +
    amount +
    "."
  );

  if (
    r.settled.every(Boolean)
  ) {
    r.needFreshRoll = true;

    r.banner =
      "VOLLE BAK! Nieuwe 5 dobbelstenen bij de volgende worp.";
  }

  r.hasRolled = true;
  r.mustHold = false;

  bump(r);
}

function roundRoll(r) {
  if (r.phase !== "round") {
    throw new Error(
      "Je bent niet in de verdien/betaalfase."
    );
  }

  /*
    Na volle bak:
    volledig nieuwe 5.
  */

  if (r.needFreshRoll) {
    r.dice = fiveDice();

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
    r.rollSeq++;

    log(
      r,
      current(r).name +
      " kreeg een nieuwe set van 5: " +
      r.dice.join(" - ") +
      "."
    );

    resolveRound(r);
    return;
  }

  const loose = [];

  for (let i = 0; i < 5; i++) {
    if (!r.settled[i]) loose.push(i);
  }

  if (!loose.length) {
    r.needFreshRoll = true;
    bump(r);
    return;
  }

  loose.forEach(i => {
    r.dice[i] = die();
  });

  r.rollSeq++;

  log(
    r,
    current(r).name +
    " gooide: " +
    r.dice.join(" - ") +
    "."
  );

  resolveRound(r);
}

function newGame(r) {
  if (!r.started) {
    throw new Error(
      "Het spel is nog niet gestart."
    );
  }

  r.players.forEach(p => {
    p.money = 0;
    p.active = true;
  });

  r.current =
    r.players.findIndex(
      p => p.id === r.admin
    );

  resetTurn(r);

  r.banner =
    current(r).name +
    " begint een nieuw spel. Druk op BEGIN WORP.";

  log(r, "Nieuw spel gestart.");

  bump(r);
}

/* =========================================================
   STATE
========================================================= */

function publicState(r, me) {
  const cp = current(r);

  return {
    ok: true,

    room: {
      code: r.code,
      started: r.started,
      phase: r.phase,
      banner: r.banner,

      currentPlayerId:
        cp ? cp.id : null,

      dice: r.dice,
      held: r.held,
      settled: r.settled,

      hasRolled: r.hasRolled,
      mustHold: r.mustHold,

      target: r.target,
      mode: r.mode,

      needFreshRoll:
        r.needFreshRoll,

      version: r.version,
      rollSeq: r.rollSeq
    },

    me: {
      id: me.id,
      name: me.name,
      money: me.money,
      isAdmin:
        me.id === r.admin
    },

    players:
      r.players.map(p => ({
        id: p.id,
        name: p.name,
        money: p.money,
        active: p.active,
        isAdmin:
          p.id === r.admin
      })),

    log: r.log,
    chat: r.chat
  };
}

/* =========================================================
   ACTIONS
========================================================= */

function doAction(r, p, b) {
  const a = b.action;
  const pi = playerIndex(r, p.id);

  if (a === "start") {
    if (p.id !== r.admin) {
      throw new Error(
        "Alleen de beheerder kan starten."
      );
    }

    startGame(r);
    return;
  }

  if (a === "newGame") {
    if (p.id !== r.admin) {
      throw new Error(
        "Alleen de beheerder kan een nieuw spel starten."
      );
    }

    newGame(r);
    return;
  }

  if (a === "removePlayer") {
    if (p.id !== r.admin) {
      throw new Error(
        "Alleen de beheerder kan spelers verwijderen."
      );
    }

    const q = r.players.find(
      x => x.id === String(b.playerId || "")
    );

    if (!q || q.id === r.admin) {
      throw new Error(
        "Speler kan niet worden verwijderd."
      );
    }

    q.active = false;

    log(
      r,
      q.name +
      " is uit het spel gehaald."
    );

    bump(r);
    return;
  }

  if (a === "chat") {
    const message =
      String(b.message || "").trim();

    if (!message) return;

    if (message.length > 200) {
      throw new Error(
        "Bericht is te lang."
      );
    }

    r.chat.push({
      player: p.name,
      message,

      time:
        new Date().toLocaleTimeString(
          "nl-NL",
          {
            hour: "2-digit",
            minute: "2-digit"
          }
        )
    });

    r.chat = r.chat.slice(-50);

    bump(r);
    return;
  }

  if (r.current !== pi) {
    throw new Error(
      "Het is niet jouw beurt."
    );
  }

  if (a === "beginTurn") {
    beginTurn(r);
    return;
  }

  if (a === "hold") {
    holdDie(
      r,
      Number(b.index)
    );
    return;
  }

  if (a === "reroll") {
    reroll(r);
    return;
  }

  if (a === "accept") {
    accept(r);
    return;
  }

  if (a === "roundRoll") {
    roundRoll(r);
    return;
  }

  throw new Error(
    "Onbekende actie."
  );
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
  content="width=device-width,initial-scale=1,maximum-scale=1"
>

<title>Dobbelen 11/24</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  font-family: Arial, sans-serif;
  color: white;

  background:
    radial-gradient(
      circle at top,
      #172b52,
      #061022 60%,
      #020711
    );
}

.app {
  width: min(900px, 100%);
  margin: auto;
  padding: 10px;
}

.top {
  text-align: center;
  padding: 10px;
}

.logo {
  font-size: clamp(28px, 7vw, 46px);
  font-weight: 900;
  color: #ffd45b;
  text-shadow: 0 3px #805200;
}

.sub {
  color: #b9c8e5;
}

.card {
  background:
    linear-gradient(
      145deg,
      #192c50,
      #08152d
    );

  border: 1px solid #30466b;
  border-radius: 18px;

  padding: 16px;
  margin-bottom: 12px;

  box-shadow:
    0 12px 35px #0006;
}

h2 {
  margin: 0 0 12px;
}

label {
  display: block;
  color: #c1cde2;
  font-size: 13px;
  font-weight: 800;
  margin: 10px 0 5px;
}

input {
  width: 100%;
  padding: 14px;

  border-radius: 12px;
  border: 1px solid #40577f;

  background: #07132a;
  color: white;

  font-size: 17px;
  outline: none;
}

input:focus {
  border-color: #ffd45b;
}

.btn {
  width: 100%;
  padding: 14px;

  border: 0;
  border-radius: 12px;

  margin-top: 9px;

  font-weight: 900;
  font-size: 15px;

  background: #2457a7;
  color: white;

  box-shadow:
    0 5px #112f60;

  cursor: pointer;
}

.btn:disabled {
  opacity: .35;
}

.gold {
  background:
    linear-gradient(
      #ffda69,
      #dda014
    );

  color: #201500;

  box-shadow:
    0 5px #895b00;
}

.green {
  background:
    linear-gradient(
      #37d17b,
      #139a4e
    );

  box-shadow:
    0 5px #086435;
}

.orange {
  background:
    linear-gradient(
      #ffb44b,
      #e36d0b
    );

  box-shadow:
    0 5px #843800;
}

.red {
  background: #b92e35;
  box-shadow: 0 5px #6b151a;
}

.code {
  text-align: center;

  font-size: 38px;
  letter-spacing: 6px;

  color: #ffd55f;
  font-weight: 900;

  margin: 7px;
}

.invite {
  background: #07132a;

  border: 1px dashed #52698e;

  padding: 10px;

  border-radius: 10px;

  font-size: 12px;

  word-break: break-all;

  color: #b8c8e5;
}

.player {
  display: flex;
  justify-content: space-between;
  align-items: center;

  padding: 10px;

  background: #ffffff0a;

  border-radius: 10px;

  margin: 6px 0;
}

.badge {
  font-size: 10px;

  background: #2d4368;

  padding: 4px 7px;

  border-radius: 20px;
}

.admin {
  background: #806017;
  color: #ffe394;
}

.money {
  color: #64ed9b;
  font-weight: 900;
}

.banner {
  text-align: center;

  background: #122849;

  border: 1px solid #38527d;

  border-radius: 12px;

  padding: 11px;

  color: #ffdc70;

  font-weight: 900;

  margin-bottom: 9px;
}

.turn {
  text-align: center;

  color: #bdcbe2;

  font-size: 13px;

  margin-bottom: 8px;
}

.table {
  background:
    radial-gradient(
      circle,
      #197a4e,
      #075334 65%,
      #033523
    );

  border: 7px solid #744914;

  border-radius: 24px;

  padding: 18px 8px;

  box-shadow:
    inset 0 0 30px #0008;
}

.tray {
  text-align: center;

  color: #ffe18b;

  font-weight: 900;

  letter-spacing: 2px;

  margin-bottom: 9px;
}

.dice {
  min-height: 180px;

  display: flex;

  justify-content: center;
  align-items: center;

  gap: 8px;

  flex-wrap: wrap;
}

.die {
  width: 64px;
  height: 64px;

  border-radius: 15px;

  position: relative;

  background:
    linear-gradient(
      145deg,
      #ff4b4b,
      #bd1010 55%,
      #6e0505
    );

  border: 3px solid #e8bb4d;

  box-shadow:
    inset -6px -7px 10px #0005,
    inset 4px 4px 8px #fff4,
    0 7px 12px #0009;
}

.click {
  cursor: pointer;
}

.held {
  box-shadow:
    0 0 0 3px #ffd43c55,
    0 0 25px #ffd43c99,
    inset -6px -7px 10px #0005;
}

.pip {
  position: absolute;

  width: 12px;
  height: 12px;

  border-radius: 50%;

  background: white;

  box-shadow:
    inset 1px 1px 2px #0004;
}

.tl {
  left: 10px;
  top: 10px;
}

.tc {
  left: 50%;
  top: 10px;
  transform: translateX(-50%);
}

.tr {
  right: 10px;
  top: 10px;
}

.ml {
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
}

.mc {
  left: 50%;
  top: 50%;
  transform: translate(-50%,-50%);
}

.mr {
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
}

.bl {
  left: 10px;
  bottom: 10px;
}

.bc {
  left: 50%;
  bottom: 10px;
  transform: translateX(-50%);
}

.br {
  right: 10px;
  bottom: 10px;
}

.roll {
  animation: tumble .55s ease;
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
      translate(-14px,-18px)
      rotateX(160deg)
      rotateY(80deg)
      rotateZ(-40deg);
  }

  55% {
    transform:
      translate(14px,8px)
      rotateX(330deg)
      rotateY(210deg)
      rotateZ(60deg);
  }

  80% {
    transform:
      translate(-8px,-5px)
      rotateX(500deg)
      rotateY(300deg)
      rotateZ(-45deg);
  }

  100% {
    transform:
      translate(0,0)
      rotateX(540deg)
      rotateY(360deg)
      rotateZ(0);
  }
}

.target {
  text-align: center;

  padding: 12px;

  background: #0b1933;

  border: 1px solid #435b83;

  border-radius: 12px;

  margin-bottom: 10px;
}

.target b {
  font-size: 34px;
  color: #ffe17b;
}

.status {
  text-align: center;

  color: #b7c7e0;

  background: #0002;

  padding: 11px;

  border-radius: 11px;

  margin-top: 9px;
}

.row {
  display: grid;

  grid-template-columns:
    1fr 1fr;

  gap: 8px;
}

.chatbox {
  display: none;
}

.chatbox.open {
  display: block;
}

.messages {
  height: 170px;

  overflow: auto;

  background: #061126;

  padding: 8px;

  border-radius: 10px;
}

.msg {
  font-size: 13px;
  margin-bottom: 7px;
}

.msg b {
  color: #ffd66b;
}

.small {
  font-size: 12px;
  color: #91a4c4;
}

.center {
  text-align: center;
}

.error {
  display: none;

  background: #551d25;

  border: 1px solid #a54550;

  color: #ffb3ba;

  padding: 10px;

  border-radius: 10px;

  margin-bottom: 10px;
}

.hidden {
  display: none !important;
}

@media(max-width:560px) {

  .die {
    width: 57px;
    height: 57px;
  }

  .pip {
    width: 10px;
    height: 10px;
  }

  .tl {
    left: 9px;
    top: 9px;
  }

  .tc {
    top: 9px;
  }

  .tr {
    right: 9px;
    top: 9px;
  }

  .ml {
    left: 9px;
  }

  .mr {
    right: 9px;
  }

  .bl {
    left: 9px;
    bottom: 9px;
  }

  .bc {
    bottom: 9px;
  }

  .br {
    right: 9px;
    bottom: 9px;
  }
}

</style>
</head>

<body>

<div class="app">

<div class="top">

  <div class="logo">
    DOBBELEN 11/24
  </div>

  <div class="sub">
    Las Vegas multiplayer dice game
  </div>

</div>

<div
  id="error"
  class="error"
></div>

<!-- =====================================================
     START / MEEDOEN
===================================================== -->

<div id="landing">

  <div
    id="createCard"
    class="card"
  >

    <h2>
      🎲 Nieuwe speelkamer
    </h2>

    <label>
      SPEELNAAM
    </label>

    <input
      id="createName"
      maxlength="20"
      placeholder="Bijvoorbeeld Wesley"
      autocomplete="off"
    >

    <button
      class="btn gold"
      onclick="createRoom()"
    >
      KAMER MAKEN
    </button>

    <div
      class="small center"
      style="margin-top:8px"
    >
      Jij wordt automatisch beheerder van de kamer.
    </div>

  </div>

  <div class="card">

    <h2 id="joinTitle">
      🚪 Meedoen met een kamer
    </h2>

    <label>
      SPEELNAAM
    </label>

    <input
      id="joinName"
      maxlength="20"
      placeholder="Bijvoorbeeld Jan"
      autocomplete="off"
    >

    <label>
      PRIVÉ SPEELKAMER NUMMER
    </label>

    <input
      id="joinCode"
      maxlength="6"
      placeholder="Bijvoorbeeld OF3855"
      autocomplete="off"
      style="text-transform:uppercase"
    >

    <button
      class="btn green"
      onclick="joinRoom()"
    >
      SPEL BINNENGAAN
    </button>

  </div>

</div>

<!-- =====================================================
     LOBBY
===================================================== -->

<div
  id="lobby"
  class="hidden"
>

  <div class="card center">

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
      id="startButton"
      class="btn green"
      onclick="sendAction('start')"
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

<!-- =====================================================
     GAME
===================================================== -->

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
      style="
        display:flex;
        justify-content:space-between;
        align-items:center
      "
    >

      <h2 style="margin:0">
        💬 CHAT
      </h2>

      <button
        class="btn"
        style="
          width:auto;
          margin:0;
          padding:8px 12px
        "
        onclick="toggleChat()"
      >
        CHAT
      </button>

    </div>

    <div
      id="chatbox"
      class="chatbox"
    >

      <div
        id="messages"
        class="messages"
      ></div>

      <div
        style="
          display:grid;
          grid-template-columns:1fr 75px;
          gap:7px;
          margin-top:7px
        "
      >

        <input
          id="chatInput"
          maxlength="200"
          placeholder="Typ een bericht..."
          onkeydown="
            if(event.key==='Enter')
              sendChat()
          "
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
      onclick="sendAction('newGame')"
    >
      🔄 NIEUW SPEL
    </button>

  </div>

</div>

</div>

<script>

var state = null;
var lastRoll = -1;
var firstLoad = true;
var chatOpen = false;

/*
  BELANGRIJK:

  ?join=ZMY4D8

  betekent:
  dit is een uitnodigingslink.

  Dan wordt de bestaande sessie NIET automatisch
  gebruikt en krijgt de bezoeker het meedoen-scherm.
*/

var params =
  new URLSearchParams(
    location.search
  );

var inviteRoom =
  params.get("join") || "";

var inviteMode =
  inviteRoom.length > 0;

if (inviteMode) {

  inviteRoom =
    inviteRoom
      .toUpperCase()
      .replace(
        /[^A-Z0-9]/g,
        ""
      );

  document
    .getElementById(
      "createCard"
    )
    .classList
    .add("hidden");

  document
    .getElementById(
      "joinTitle"
    )
    .textContent =
      "🎰 Uitnodiging ontvangen";

  document
    .getElementById(
      "joinCode"
    )
    .value =
      inviteRoom;

  document
    .getElementById(
      "joinCode"
    )
    .readOnly = true;
}

/* =====================================================
   HELPERS
===================================================== */

function esc(value) {

  return String(value)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function showError(message) {

  var box =
    document.getElementById(
      "error"
    );

  box.textContent =
    message;

  box.style.display =
    "block";

  setTimeout(
    function() {
      box.style.display =
        "none";
    },
    4500
  );
}

/* =====================================================
   API
===================================================== */

async function api(
  url,
  options
) {

  options =
    options || {};

  options.credentials =
    "same-origin";

  options.headers =
    Object.assign(
      {
        "Content-Type":
          "application/json"
      },
      options.headers || {}
    );

  var response =
    await fetch(
      url,
      options
    );

  var data =
    await response.json();

  if (
    !response.ok ||
    data.error
  ) {
    throw new Error(
      data.error ||
      "Er ging iets mis."
    );
  }

  return data;
}

/* =====================================================
   KAMER MAKEN
===================================================== */

async function createRoom() {

  try {

    var name =
      document
        .getElementById(
          "createName"
        )
        .value
        .trim();

    if (!name) {
      showError(
        "Vul eerst je speelnaam in."
      );
      return;
    }

    var data =
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

    state =
      data;

    history.replaceState(
      {},
      "",
      "/?room=" +
      data.room.code
    );

    render();

  } catch (error) {

    showError(
      error.message
    );
  }
}

/* =====================================================
   MEEDOEN
===================================================== */

async function joinRoom() {

  try {

    var name =
      document
        .getElementById(
          "joinName"
        )
        .value
        .trim();

    var roomCode =
      document
        .getElementById(
          "joinCode"
        )
        .value
        .trim()
        .toUpperCase();

    if (!name) {
      showError(
        "Vul je speelnaam in."
      );
      return;
    }

    if (roomCode.length !== 6) {
      showError(
        "Het kamernummer moet 6 tekens hebben."
      );
      return;
    }

    var data =
      await api(
        "/api/join",
        {
          method:"POST",

          body:
            JSON.stringify({
              name:name,
              code:roomCode
            })
        }
      );

    state =
      data;

    /*
      Na succesvol meedoen
      wordt de normale kamer geopend.
    */

    history.replaceState(
      {},
      "",
      "/?room=" +
      data.room.code
    );

    render();

  } catch (error) {

    showError(
      error.message
    );
  }
}

/* =====================================================
   ACTIE
===================================================== */

async function sendAction(
  action,
  extra
) {

  try {

    var body =
      Object.assign(
        {
          action:action
        },
        extra || {}
      );

    var data =
      await api(
        "/api/action",
        {
          method:"POST",

          body:
            JSON.stringify(body)
        }
      );

    state =
      data;

    render();

  } catch (error) {

    showError(
      error.message
    );
  }
}

/* =====================================================
   RENDER
===================================================== */

function render() {

  if (
    !state ||
    !state.me
  ) {

    document
      .getElementById(
        "landing"
      )
      .classList
      .remove("hidden");

    document
      .getElementById(
        "lobby"
      )
      .classList
      .add("hidden");

    document
      .getElementById(
        "game"
      )
      .classList
      .add("hidden");

    return;
  }

  document
    .getElementById(
      "landing"
    )
    .classList
    .add("hidden");

  if (!state.room.started) {

    document
      .getElementById(
        "lobby"
      )
      .classList
      .remove("hidden");

    document
      .getElementById(
        "game"
      )
      .classList
      .add("hidden");

    renderLobby();

  } else {

    document
      .getElementById(
        "lobby"
      )
      .classList
      .add("hidden");

    document
      .getElementById(
        "game"
      )
      .classList
      .remove("hidden");

    renderGame();
  }

  renderChat();
}

/* =====================================================
   LOBBY
===================================================== */

function renderLobby() {

  document
    .getElementById(
      "roomCode"
    )
    .textContent =
      state.room.code;

  /*
    NIEUWE UITNODIGINGSLINK
  */

  var link =
    location.origin +
    "/?join=" +
    state.room.code;

  document
    .getElementById(
      "invite"
    )
    .textContent =
      link;

  var html = "";

  state.players.forEach(
    function(p) {

      html +=
        '<div class="player">' +

          '<div>' +

            '<b>' +
            esc(p.name) +
            '</b><br>' +

            '<span class="badge ' +
            (
              p.isAdmin
                ? "admin"
                : ""
            ) +
            '">' +

            (
              p.isAdmin
                ? "BEHEERDER"
                : "SPELER"
            ) +

            '</span>' +

          '</div>' +

          '<div class="money">' +
          "€" +
          Number(
            p.money
          ).toFixed(2) +
          '</div>' +

        '</div>';
    }
  );

  document
    .getElementById(
      "lobbyPlayers"
    )
    .innerHTML =
      html;

  var count =
    state.players.filter(
      function(p) {
        return p.active;
      }
    ).length;

  document
    .getElementById(
      "startButton"
    )
    .disabled =
      !state.me.isAdmin ||
      count < 2;

  document
    .getElementById(
      "waiting"
    )
    .textContent =
      count < 2
        ? "Wacht op minimaal één andere speler..."
        : "Er zijn genoeg spelers. De beheerder kan het spel starten.";
}

/* =====================================================
   GAME
===================================================== */

function renderGame() {

  var r =
    state.room;

  var p =
    state.players.find(
      function(x) {
        return x.id ===
          r.currentPlayerId;
      }
    );

  document
    .getElementById(
      "turn"
    )
    .textContent =
      p
        ? "Aan de beurt: " +
          p.name
        : "";

  document
    .getElementById(
      "banner"
    )
    .textContent =
      r.banner;

  renderTarget();
  renderDice();
  renderControls();
  renderPlayers();

  document
    .getElementById(
      "admin"
    )
    .classList
    .toggle(
      "hidden",
      !state.me.isAdmin
    );
}

/* =====================================================
   PLAYERS
===================================================== */

function renderPlayers() {

  var html = "";

  state.players.forEach(
    function(p) {

      var current =
        p.id ===
        state.room.currentPlayerId;

      html +=
        '<div class="player" style="' +
        (
          current
            ? "outline:2px solid #ffd45a"
            : ""
        ) +
        '">' +

          '<div>' +

            '<b>' +

            (
              current
                ? "🎲 "
                : ""
            ) +

            esc(p.name) +

            '</b><br>' +

            '<span class="badge ' +
            (
              p.isAdmin
                ? "admin"
                : ""
            ) +
            '">' +

            (
              p.isAdmin
                ? "BEHEERDER"
                : "SPELER"
            ) +

            '</span>' +

          '</div>' +

          '<div class="money">' +

          "€" +
          Number(
            p.money
          ).toFixed(2) +

          '</div>' +

        '</div>';
    }
  );

  document
    .getElementById(
      "players"
    )
    .innerHTML =
      html;
}

/* =====================================================
   DICE
===================================================== */

function pips(n) {

  var positions = {

    1:["mc"],

    2:["tl","br"],

    3:["tl","mc","br"],

    4:["tl","tr","bl","br"],

    5:["tl","tr","mc","bl","br"],

    6:["tl","tr","ml","mr","bl","br"]
  };

  return positions[n]
    .map(function(pos) {

      return (
        '<span class="pip ' +
        pos +
        '"></span>'
      );

    })
    .join("");
}

function renderDice() {

  var r =
    state.room;

  var html = "";

  for (
    var i = 0;
    i < 5;
    i++
  ) {

    var fixed =
      r.phase === "round"
        ? r.settled[i]
        : r.held[i];

    var clickable =
      r.phase === "main" &&
      state.me.id ===
        r.currentPlayerId &&
      r.hasRolled &&
      !r.held[i];

    html +=
      '<div class="die ' +
      (
        fixed
          ? "held"
          : ""
      ) +
      (
        clickable
          ? " click"
          : ""
      ) +
      '"' +

      (
        clickable
          ? ' onclick="sendAction(\'hold\',{index:' +
            i +
            '})"'
          : ""
      ) +

      '>' +

      pips(
        r.dice[i]
      ) +

      '</div>';
  }

  document
    .getElementById(
      "dice"
    )
    .innerHTML =
      html;

  if (
    !firstLoad &&
    lastRoll !==
      r.rollSeq
  ) {

    document
      .querySelectorAll(
        ".die"
      )
      .forEach(
        function(el, index) {

          var fixed =
            r.phase === "round"
              ? r.settled[index]
              : r.held[index];

          if (!fixed) {

            el
              .classList
              .add("roll");

            setTimeout(
              function() {

                el
                  .classList
                  .remove(
                    "roll"
                  );

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

  firstLoad = false;
}

/* =====================================================
   TARGET
===================================================== */

function renderTarget() {

  var box =
    document.getElementById(
      "target"
    );

  var r =
    state.room;

  if (
    r.phase !== "round"
  ) {

    box
      .classList
      .add("hidden");

    return;
  }

  box
    .classList
    .remove("hidden");

  box.innerHTML =
    "<b>" +
    r.target +
    "</b><br><span>" +

    (
      r.mode === "earn"
        ? "DOELSTEEN — VERDIENEN"
        : "DOELSTEEN — BETALEN"
    ) +

    "</span>";
}

/* =====================================================
   CONTROLS
===================================================== */

function renderControls() {

  var box =
    document.getElementById(
      "controls"
    );

  var r =
    state.room;

  var myTurn =
    state.me.id ===
    r.currentPlayerId;

  if (!myTurn) {

    box.innerHTML =
      '<div class="status">' +
      "Wacht op de andere speler." +
      "</div>";

    return;
  }

  /*
    BEGIN WORP
  */

  if (
    r.phase === "main" &&
    !r.hasRolled
  ) {

    box.innerHTML =
      '<button class="btn gold" ' +
      'style="font-size:19px" ' +
      'onclick="sendAction(\'beginTurn\');soundRoll()">' +
      '🎲 BEGIN WORP' +
      '</button>';

    return;
  }

  /*
    MAIN
  */

  if (
    r.phase === "main"
  ) {

    var allHeld =
      r.held.every(
        function(v) {
          return v;
        }
      );

    box.innerHTML =
      '<div class="row">' +

        '<button class="btn orange" ' +
        'onclick="sendAction(\'reroll\');soundRoll()" ' +

        (
          r.mustHold ||
          allHeld
            ? "disabled"
            : ""
        ) +

        '>' +

        '🎲 OPNIEUW GOOIEN' +

        '</button>' +

        '<button class="btn" ' +
        'style="background:#163d79" ' +
        'onclick="sendAction(\'accept\');soundAccept()">' +

        '✓ AKKOORD' +

        '</button>' +

      '</div>' +

      '<div class="status">' +

      (
        r.mustHold
          ? "👉 Houd minimaal 1 nieuwe dobbelsteen vast."
          : allHeld
            ? "Alle dobbelstenen staan vast. Druk AKKOORD."
            : "Je mag opnieuw gooien of AKKOORD kiezen."
      ) +

      '</div>';

    return;
  }

  /*
    EARN / PAY
  */

  if (
    r.phase === "round"
  ) {

    var title =
      r.mode === "earn"
        ? "💰 GOOI VOOR VERDIENEN"
        : "💸 GOOI VOOR BETALEN";

    box.innerHTML =
      '<button class="btn ' +
      (
        r.mode === "earn"
          ? "green"
          : "orange"
      ) +
      '" ' +
      'style="font-size:18px" ' +
      'onclick="sendAction(\'roundRoll\');soundRoll()">' +

      title +

      '</button>' +

      '<div class="status">' +

      "Doelsteen: <b>" +
      r.target +
      "'en</b><br>" +

      (
        r.needFreshRoll
          ? "VOLLE BAK! De volgende worp is een nieuwe set van 5."
          : "Doelstenen worden automatisch vastgezet."
      ) +

      '</div>';
  }
}

/* =====================================================
   CHAT
===================================================== */

function toggleChat() {

  chatOpen =
    !chatOpen;

  document
    .getElementById(
      "chatbox"
    )
    .classList
    .toggle(
      "open",
      chatOpen
    );
}

function renderChat() {

  var html = "";

  state.chat.forEach(
    function(m) {

      html +=
        '<div class="msg">' +

        '<b>' +
        esc(m.player) +
        '</b> ' +

        '<span class="small">' +
        esc(m.time) +
        '</span><br>' +

        esc(m.message) +

        '</div>';
    }
  );

  var box =
    document.getElementById(
      "messages"
    );

  box.innerHTML =
    html;

  box.scrollTop =
    box.scrollHeight;
}

function sendChat() {

  var input =
    document.getElementById(
      "chatInput"
    );

  var message =
    input.value.trim();

  if (!message) return;

  input.value = "";

  sendAction(
    "chat",
    {
      message: message
    }
  );
}

/* =====================================================
   UITNODIGING
===================================================== */

async function copyInvite() {

  var link =
    location.origin +
    "/?join=" +
    state.room.code;

  try {

    await navigator
      .clipboard
      .writeText(link);

    alert(
      "Uitnodigingslink gekopieerd!"
    );

  } catch (e) {

    prompt(
      "Kopieer deze link:",
      link
    );
  }
}

/* =====================================================
   SOUND
===================================================== */

var audioContext = null;

function audio() {

  if (!audioContext) {

    var Audio =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!Audio) return null;

    audioContext =
      new Audio();
  }

  if (
    audioContext.state ===
      "suspended"
  ) {
    audioContext.resume();
  }

  return audioContext;
}

function beep(
  frequency,
  duration,
  type,
  volume
) {

  var c =
    audio();

  if (!c) return;

  var oscillator =
    c.createOscillator();

  var gain =
    c.createGain();

  oscillator.type =
    type || "sine";

  oscillator.frequency.value =
    frequency;

  gain.gain.setValueAtTime(
    volume || .05,
    c.currentTime
  );

  gain.gain.exponentialRampToValueAtTime(
    .001,
    c.currentTime +
      duration
  );

  oscillator.connect(gain);
  gain.connect(c.destination);

  oscillator.start();

  oscillator.stop(
    c.currentTime +
      duration
  );
}

function soundRoll() {

  beep(
    90,
    .08,
    "square",
    .04
  );

  setTimeout(
    function() {
      beep(
        150,
        .08,
        "square",
        .03
      );
    },
    70
  );

  setTimeout(
    function() {
      beep(
        210,
        .1,
        "square",
        .02
      );
    },
    140
  );
}

function soundAccept() {

  beep(
    500,
    .1,
    "triangle",
    .06
  );

  setTimeout(
    function() {

      beep(
        800,
        .14,
        "triangle",
        .05
      );

    },
    90
  );
}

/* =====================================================
   POLLING
===================================================== */

async function poll() {

  /*
    Bij een uitnodigingslink:
    NIET automatisch de bestaande sessie
    ophalen.

    De gast moet eerst zijn naam invullen
    en op SPEL BINNENGAAN drukken.
  */

  if (
    inviteMode &&
    !state
  ) {
    return;
  }

  try {

    var data =
      await api(
        "/api/state"
      );

    if (
      data &&
      data.me
    ) {

      state =
        data;

      render();
    }

  } catch (e) {

    /*
      Geen sessie is normaal
      op het startscherm.
    */
  }
}

setInterval(
  poll,
  800
);

poll();

</script>

</body>
</html>`;

/* =========================================================
   HTTP SERVER
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

        /*
          WEBSITE
        */

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

        /*
          JSON BODY
        */

        async function readBody() {

          return new Promise(
            function(resolve, reject) {

              let data = "";

              req.on(
                "data",
                function(chunk) {

                  data += chunk;

                  if (
                    data.length >
                    1000000
                  ) {

                    reject(
                      new Error(
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
                      new Error(
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

        /*
          CREATE
        */

        if (
          req.method === "POST" &&
          req.url === "/api/create"
        ) {

          const body =
            await readBody();

          const name =
            cleanName(
              body.name
            );

          const room =
            createRoom(name);

          const player =
            room.players[0];

          const sid =
            newSession(
              room.code,
              player.id
            );

          setCookie(
            res,
            sid
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
              publicState(
                room,
                player
              )
            )
          );

          return;
        }

        /*
          JOIN
        */

        if (
          req.method === "POST" &&
          req.url === "/api/join"
        ) {

          const body =
            await readBody();

          const name =
            cleanName(
              body.name
            );

          const roomCode =
            cleanCode(
              body.code
            );

          if (
            roomCode.length !== 6
          ) {

            throw new Error(
              "Vul een geldig kamernummer van 6 tekens in."
            );
          }

          const room =
            rooms.get(
              roomCode
            );

          if (!room) {

            throw new Error(
              "Deze speelkamer bestaat niet."
            );
          }

          if (room.started) {

            throw new Error(
              "Het spel is al gestart."
            );
          }

          if (
            active(room).length >= 4
          ) {

            throw new Error(
              "Deze kamer zit al vol."
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
            id: crypto.randomUUID(),
            name,
            money: 0,
            active: true
          };

          room.players.push(
            player
          );

          log(
            room,
            name +
            " is de kamer binnengekomen."
          );

          bump(room);

          const sid =
            newSession(
              room.code,
              player.id
            );

          setCookie(
            res,
            sid
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
              publicState(
                room,
                player
              )
            )
          );

          return;
        }

        /*
          STATE
        */

        if (
          req.method === "GET" &&
          req.url === "/api/state"
        ) {

          const result =
            getRoomPlayer(req);

          if (!result) {

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
                  "Geen sessie"
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
                result.room,
                result.player
              )
            )
          );

          return;
        }

        /*
          ACTION
        */

        if (
          req.method === "POST" &&
          req.url === "/api/action"
        ) {

          const result =
            getRoomPlayer(req);

          if (!result) {
            throw new Error(
              "Geen sessie."
            );
          }

          const body =
            await readBody();

          doAction(
            result.room,
            result.player,
            body
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
              publicState(
                result.room,
                result.player
              )
            )
          );

          return;
        }

        /*
          404
        */

        res.writeHead(
          404,
          {
            "Content-Type":
              "application/json"
          }
        );

        res.end(
          JSON.stringify({
            error:
              "Niet gevonden"
          })
        );

      } catch (error) {

        console.error(error);

        res.writeHead(
          400,
          {
            "Content-Type":
              "application/json"
          }
        );

        res.end(
          JSON.stringify({
            error:
              error.message ||
              "Er ging iets mis."
          })
        );
      }
    }
  );

server.listen(
  PORT,
  function() {
    console.log(
      "Dobbelen 11/24 draait op poort " +
      PORT
    );
  }
);
