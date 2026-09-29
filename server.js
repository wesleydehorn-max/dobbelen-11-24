const http = require("http");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;

const rooms = new Map();
const sessions = new Map();

/* =========================================================
   BASIS
========================================================= */

function uid() {
  return crypto.randomBytes(12).toString("hex");
}

function roomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c;

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

function cleanName(value) {
  const name = String(value || "")
    .trim()
    .replace(/\s+/g, " ");

  if (!name) throw new Error("Vul een speelnaam in.");
  if (name.length > 20) throw new Error("Naam mag maximaal 20 tekens zijn.");

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
  return room.players[room.current];
}

function playerIndex(room, id) {
  return room.players.findIndex(p => p.id === id);
}

function bump(room) {
  room.version++;
}

function addLog(room, text) {
  room.log.unshift({
    text,
    time: new Date().toLocaleTimeString("nl-NL", {
      hour: "2-digit",
      minute: "2-digit"
    })
  });

  room.log = room.log.slice(0, 40);
}

function nextPlayer(room) {
  const active = activePlayers(room);

  if (!active.length) return;

  const currentIndex = room.current;

  for (let i = 1; i <= room.players.length; i++) {
    const index = (currentIndex + i) % room.players.length;

    if (room.players[index] && room.players[index].active) {
      room.current = index;
      return;
    }
  }
}

/* =========================================================
   SPEL
========================================================= */

function resetTurn(room) {
  room.phase = "main";
  room.dice = [null, null, null, null, null];
  room.held = [false, false, false, false, false];
  room.settled = [false, false, false, false, false];

  room.hasRolled = false;
  room.mustHold = false;

  room.target = null;
  room.mode = null;

  room.needFreshRoll = false;
  room.banner = "";
  room.rollSeq++;
}

function startGame(room) {
  const players = activePlayers(room);

  if (players.length < 2) {
    throw new Error("Er moeten minimaal 2 spelers zijn.");
  }

  /*
    IEDERE SPELER START ALTIJD OP €100
  */
  room.players.forEach(p => {
    if (p.active) {
      p.money = 100;
    }
  });

  room.started = true;

  const first = room.players.findIndex(p => p.active);
  room.current = first >= 0 ? first : 0;

  resetTurn(room);

  const p = currentPlayer(room);

  room.banner =
    "🎰 " +
    p.name +
    " is aan de beurt — druk op BEGIN WORP.";

  addLog(room, "🎰 Het spel is gestart.");
  bump(room);
}

function targetFor(total) {
  /*
    11 t/m 17 -> richting 11
    18 t/m 24 -> richting 24
    onder 11 -> verdienen
    boven 24 -> verdienen

    11 en 24 zijn speciaal.
  */

  if (total === 11) {
    return {
      special: true,
      target: 11,
      mode: "special"
    };
  }

  if (total === 24) {
    return {
      special: true,
      target: 24,
      mode: "special"
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

  if (total > 24) {
    return {
      target: total - 24,
      mode: "earn"
    };
  }

  return {
    target: 1,
    mode: "earn"
  };
}

function isFiveOfAKind(dice) {
  if (!dice || dice.some(v => !v)) return false;
  return dice.every(v => v === dice[0]);
}

function moneyTransfer(room, player, amount, mode) {
  const opponents = activePlayers(room).filter(p => p.id !== player.id);

  if (mode === "earn") {
    opponents.forEach(opponent => {
      opponent.money -= amount;
      player.money += amount;
    });

    addLog(
      room,
      "💰 " +
      player.name +
      " verdient €" +
      amount.toFixed(2) +
      " van iedere tegenstander."
    );
  }

  if (mode === "pay") {
    opponents.forEach(opponent => {
      player.money -= amount;
      opponent.money += amount;
    });

    addLog(
      room,
      "💸 " +
      player.name +
      " betaalt €" +
      amount.toFixed(2) +
      " aan iedere tegenstander."
    );
  }
}

function special1124(room, player, number) {
  const opponents = activePlayers(room).filter(p => p.id !== player.id);

  opponents.forEach(opponent => {
    player.money -= 0.5;
    opponent.money += 0.5;
  });

  addLog(
    room,
    "🎯 " +
    player.name +
    " gooide " +
    number +
    " — €0,50 naar iedere tegenstander."
  );
}

function finishTurn(room) {
  nextPlayer(room);

  resetTurn(room);

  const p = currentPlayer(room);

  if (p) {
    room.banner =
      "🎰 " +
      p.name +
      " is aan de beurt — druk op BEGIN WORP.";
  }

  bump(room);
}

/* =========================================================
   WERPLOGICA
========================================================= */

function resolveMainRoll(room) {
  const player = currentPlayer(room);

  if (!player) return;

  /*
    Alleen de definitieve waarden gebruiken.
    De animatie op de telefoon is puur visueel.
  */

  const total = room.dice.reduce((sum, value) => {
    return sum + (Number(value) || 0);
  }, 0);

  /*
    VOLLE BAK
    Vijf dezelfde dobbelstenen.
  */

  if (isFiveOfAKind(room.dice)) {
    room.target = 6;
    room.mode = "earn";

    room.held = [true, true, true, true, true];
    room.settled = [true, true, true, true, true];

    moneyTransfer(room, player, 5 * 5, "earn");

    room.banner =
      "🔥 VOLLE BAK! " +
      player.name +
      " verdient €25,00.";

    /*
      Omdat alle vijf dobbelstenen doelstenen zijn,
      moet een volledig nieuwe set van vijf komen.
    */

    room.needFreshRoll = true;
    room.phase = "earn";

    bump(room);
    return;
  }

  const result = targetFor(total);

  if (result.special) {
    special1124(room, player, result.target);

    room.banner =
      "🎯 " +
      result.target +
      " GEGOOID — beurt voorbij.";

    finishTurn(room);
    return;
  }

  room.target = result.target;
  room.mode = result.mode;

  /*
    Alle dobbelstenen met het doelgetal worden automatisch
    vastgezet in de verdien/betaalfase.
  */

  room.phase = result.mode;
  room.settled = room.dice.map(v => v === result.target);

  room.held = room.settled.slice();

  const count = room.settled.filter(Boolean).length;

  if (count > 0) {
    moneyTransfer(
      room,
      player,
      count * 5,
      result.mode
    );

    room.banner =
      (result.mode === "earn" ? "💰 VERDIENEN: " : "💸 BETALEN: ") +
      result.target +
      "'EN";
  }

  bump(room);
}

/*
  Controleert een nieuwe worp in verdienen/betalen.
*/
function resolveEarnPayRoll(room) {
  const player = currentPlayer(room);

  if (!player) return;

  /*
    Als vorige worp volle bak was:
    nieuwe set van vijf.
  */

  if (room.needFreshRoll) {
    room.dice = fiveDice();
    room.held = [false, false, false, false, false];
    room.settled = [false, false, false, false, false];

    room.needFreshRoll = false;

    const target = room.target;

    const found = room.dice.map(v => v === target);

    if (!found.some(Boolean)) {
      room.banner =
        "❌ MIS — geen " +
        target +
        " gegooid.";

      finishTurn(room);
      return;
    }

    const count = found.filter(Boolean).length;

    room.settled = found.slice();
    room.held = found.slice();

    moneyTransfer(
      room,
      player,
      count * 5,
      room.mode
    );

    room.banner =
      (room.mode === "earn" ? "💰 VERDIENEN: " : "💸 BETALEN: ") +
      target +
      "'EN — +" +
      count +
      " doelsteen" +
      (count === 1 ? "" : "en");

    /*
      Als opnieuw alle vijf doelstenen zijn:
      nogmaals nieuwe set.
    */

    if (count === 5) {
      room.needFreshRoll = true;
    }

    bump(room);
    return;
  }

  const target = room.target;

  const found = room.dice.map((v, i) => {
    return !room.settled[i] && v === target;
  });

  if (!found.some(Boolean)) {
    room.banner =
      "❌ MIS — geen " +
      target +
      " gegooid.";

    finishTurn(room);
    return;
  }

  const count = found.filter(Boolean).length;

  found.forEach((yes, i) => {
    if (yes) {
      room.settled[i] = true;
      room.held[i] = true;
    }
  });

  moneyTransfer(
    room,
    player,
    count * 5,
    room.mode
  );

  room.banner =
    (room.mode === "earn" ? "💰 VERDIENEN: " : "💸 BETALEN: ") +
    target +
    "'EN — +" +
    count +
    " doelsteen" +
    (count === 1 ? "" : "en");

  /*
    Alle vijf zijn doelstenen.
    Nieuwe set van vijf.
  */

  if (room.settled.every(Boolean)) {
    room.needFreshRoll = true;
  }

  bump(room);
}

/* =========================================================
   ACTIES
========================================================= */

function doAction(room, player, body) {
  const action = body.action;
  const index = playerIndex(room, player.id);

  if (index < 0) {
    throw new Error("Speler niet gevonden.");
  }

  /*
    START SPEL
    Alleen beheerder.
  */

  if (action === "start") {
    if (player.id !== room.admin) {
      throw new Error("Alleen de beheerder kan het spel starten.");
    }

    startGame(room);
    return;
  }

  if (!room.started) {
    throw new Error("Het spel is nog niet gestart.");
  }

  if (!player.active) {
    throw new Error("Je bent niet actief.");
  }

  if (room.current !== index) {
    throw new Error("Het is niet jouw beurt.");
  }

  /* BEGIN WORP */

  if (action === "begin") {
    if (room.phase !== "main") {
      throw new Error("Je kunt nu niet beginnen.");
    }

    if (room.hasRolled) {
      throw new Error("Je hebt al gegooid.");
    }

    room.dice = fiveDice();
    room.held = [false, false, false, false, false];
    room.settled = [false, false, false, false, false];

    room.hasRolled = true;
    room.mustHold = true;
    room.rollSeq++;

    addLog(
      room,
      "🎲 " +
      player.name +
      " heeft de eerste worp gedaan."
    );

    /*
      De client toont eerst de animatie.
      Daarna worden deze definitieve dobbelstenen zichtbaar.
    */

    bump(room);
    return;
  }

  /* HOOFDWORP OPNIEUW */

  if (action === "reroll") {
    if (room.phase !== "main") {
      throw new Error("Je kunt hier niet opnieuw gooien.");
    }

    if (!room.hasRolled) {
      throw new Error("Begin eerst met gooien.");
    }

    if (room.mustHold) {
      throw new Error(
        "Je moet eerst minimaal één nieuwe dobbelsteen vasthouden."
      );
    }

    if (room.held.every(Boolean)) {
      throw new Error("Alle dobbelstenen zijn vastgezet.");
    }

    room.dice = room.dice.map((value, i) => {
      return room.held[i] ? value : die();
    });

    room.rollSeq++;

    /*
      Na iedere nieuwe worp moet minstens één nieuwe steen
      worden vastgehouden.
    */

    room.mustHold = true;

    addLog(
      room,
      "🎲 " +
      player.name +
      " heeft opnieuw gegooid."
    );

    bump(room);
    return;
  }

  /* VASTZETTEN */

  if (action === "hold") {
    if (room.phase !== "main") {
      throw new Error(
        "In deze fase worden doelstenen automatisch vastgezet."
      );
    }

    if (!room.hasRolled) {
      throw new Error("Je moet eerst gooien.");
    }

    const i = Number(body.index);

    if (!Number.isInteger(i) || i < 0 || i > 4) {
      throw new Error("Ongeldige dobbelsteen.");
    }

    if (room.held[i]) {
      throw new Error("Deze dobbelsteen staat al vast.");
    }

    room.held[i] = true;

    /*
      Er is minimaal één nieuwe steen vastgezet.
    */

    room.mustHold = false;

    bump(room);
    return;
  }

  /* AKKOORD */

  if (action === "accept") {
    if (room.phase !== "main") {
      throw new Error("Je kunt nu niet akkoord geven.");
    }

    if (!room.hasRolled) {
      throw new Error("Je moet eerst gooien.");
    }

    resolveMainRoll(room);
    return;
  }

  /* VERDIENEN / BETALEN */

  if (action === "roundRoll") {
    if (room.phase !== "earn" && room.phase !== "pay") {
      throw new Error("Je bent niet in de verdien/betaalfase.");
    }

    /*
      Alle doelstenen blijven automatisch vast.
      Alleen losse dobbelstenen worden gegooid.
    */

    if (room.needFreshRoll) {
      resolveEarnPayRoll(room);
      return;
    }

    room.dice = room.dice.map((value, i) => {
      return room.settled[i] ? value : die();
    });

    room.rollSeq++;

    resolveEarnPayRoll(room);
    return;
  }

  /* NIEUW SPEL */

  if (action === "newGame") {
    if (player.id !== room.admin) {
      throw new Error("Alleen de beheerder kan een nieuw spel starten.");
    }

    room.players.forEach(p => {
      if (p.active) p.money = 100;
    });

    room.started = true;

    room.current = room.players.findIndex(p => p.active);

    resetTurn(room);

    const p = currentPlayer(room);

    room.banner =
      "🎰 Nieuw spel! " +
      p.name +
      " begint.";

    addLog(
      room,
      "🔄 Nieuw spel gestart. Iedereen begint met €100,00."
    );

    bump(room);
    return;
  }

  /* CHAT */

  if (action === "chat") {
    const text = String(body.text || "")
      .trim()
      .slice(0, 200);

    if (!text) return;

    room.chat.push({
      id: uid(),
      player: player.name,
      text,
      time: new Date().toLocaleTimeString("nl-NL", {
        hour: "2-digit",
        minute: "2-digit"
      })
    });

    room.chat = room.chat.slice(-60);

    bump(room);
    return;
  }

  throw new Error("Onbekende actie.");
}

/* =========================================================
   ROOM / SESSIES
========================================================= */

function createRoom(name) {
  const code = roomCode();

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

    dice: [null, null, null, null, null],

    held: [false, false, false, false, false],

    settled: [false, false, false, false, false],

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

  return {
    room,
    player
  };
}

function joinRoom(code, name) {
  const room = rooms.get(code);

  if (!room) {
    throw new Error("Kamer niet gevonden.");
  }

  if (room.started) {
    throw new Error("Dit spel is al gestart.");
  }

  if (activePlayers(room).length >= 4) {
    throw new Error("Deze tafel zit vol.");
  }

  const player = {
    id: uid(),
    name,
    money: 100,
    active: true
  };

  room.players.push(player);

  addLog(
    room,
    "🎩 " +
    player.name +
    " is aan tafel gekomen."
  );

  bump(room);

  return {
    room,
    player
  };
}

function createSession(roomCodeValue, playerId) {
  const sid = uid();

  sessions.set(sid, {
    roomCode: roomCodeValue,
    playerId
  });

  return sid;
}

function getCookies(req) {
  const result = {};

  const cookie = req.headers.cookie || "";

  cookie.split(";").forEach(part => {
    const index = part.indexOf("=");

    if (index === -1) return;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    result[key] = value;
  });

  return result;
}

function getSession(req) {
  const cookies = getCookies(req);

  if (!cookies.sid) return null;

  return sessions.get(cookies.sid) || null;
}

function setCookie(res, sid) {
  res.setHeader(
    "Set-Cookie",
    "sid=" +
      sid +
      "; HttpOnly; Path=/; SameSite=Lax"
  );
}

function getRoomPlayer(req) {
  const session = getSession(req);

  if (!session) return null;

  const room = rooms.get(session.roomCode);

  if (!room) return null;

  const player = room.players.find(
    p => p.id === session.playerId
  );

  if (!player) return null;

  return {
    room,
    player
  };
}

/* =========================================================
   PUBLIC STATE
========================================================= */

function publicState(room, me) {
  const current = currentPlayer(room);

  return {
    room: {
      code: room.code,

      started: room.started,

      adminId: room.admin,

      canStart:
        !room.started &&
        me.id === room.admin &&
        activePlayers(room).length >= 2,

      playerCount: activePlayers(room).length,

      maxPlayers: 4,

      current: current
        ? {
            id: current.id,
            name: current.name
          }
        : null,

      phase: room.phase,

      dice: room.dice,

      held: room.held,

      settled: room.settled,

      hasRolled: room.hasRolled,

      mustHold: room.mustHold,

      target: room.target,

      mode: room.mode,

      needFreshRoll: room.needFreshRoll,

      banner: room.banner,

      version: room.version,

      rollSeq: room.rollSeq,

      log: room.log,

      chat: room.chat
    },

    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      money: Number(p.money.toFixed(2)),
      active: p.active,
      isAdmin: p.id === room.admin
    })),

    me: {
      id: me.id,
      name: me.name,
      money: Number(me.money.toFixed(2)),
      isAdmin: me.id === room.admin
    }
  };
}

/* =========================================================
   HTML
========================================================= */

const HTML = String.raw`<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport"
      content="width=device-width,
               initial-scale=1,
               maximum-scale=1,
               user-scalable=no">

<title>Dobbelen 11/24</title>

<style>

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  min-height: 100%;
  font-family: Arial, Helvetica, sans-serif;
  background:
    radial-gradient(circle at top,
      #173b2b 0%,
      #07140e 55%,
      #020504 100%);
  color: white;
}

body {
  min-height: 100vh;
}

button,
input {
  font: inherit;
}

button {
  cursor: pointer;
}

button:disabled {
  opacity: .35;
  cursor: not-allowed;
}

/* ======================================================
   CASINO
====================================================== */

.casino {
  min-height: 100vh;
  padding: 12px;
}

.topbar {
  max-width: 1100px;
  margin: 0 auto 12px;
  padding: 12px 16px;

  border: 1px solid #b8862d;
  border-radius: 18px;

  background:
    linear-gradient(
      180deg,
      #14251d,
      #07100b
    );

  box-shadow:
    0 0 25px rgba(218,165,54,.18),
    inset 0 0 20px rgba(0,0,0,.7);
}

.brand {
  text-align: center;
}

.brand h1 {
  margin: 0;

  color: #ffd86b;

  font-size: clamp(25px, 6vw, 42px);

  letter-spacing: 3px;

  text-shadow:
    0 2px 0 #6f4b0d,
    0 0 18px rgba(255,204,70,.3);
}

.brand small {
  color: #c9b77c;
  letter-spacing: 3px;
}

/* ======================================================
   PANELS
====================================================== */

.panel {
  max-width: 1100px;
  margin: 0 auto 12px;

  padding: 14px;

  border-radius: 20px;

  border: 1px solid #9b7125;

  background:
    linear-gradient(
      145deg,
      rgba(22,40,31,.98),
      rgba(5,13,9,.98)
    );

  box-shadow:
    0 12px 35px rgba(0,0,0,.5),
    inset 0 0 25px rgba(0,0,0,.45);
}

.hidden {
  display: none !important;
}

/* ======================================================
   LOBBY
====================================================== */

.room-code {
  text-align: center;
  font-size: 26px;
  font-weight: 900;
  letter-spacing: 7px;
  color: #ffe08a;
  margin: 5px 0 15px;
}

.table-status {
  text-align: center;
  color: #7dffb0;
  font-weight: 800;
  margin-bottom: 12px;
}

.players-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.player-card {
  min-height: 82px;

  padding: 10px;

  border-radius: 14px;

  background:
    linear-gradient(
      145deg,
      #17291f,
      #09110d
    );

  border: 1px solid #59451e;

  text-align: center;
}

.player-card.admin {
  border-color: #d7a93b;
  box-shadow:
    0 0 15px rgba(219,169,55,.16);
}

.player-name {
  font-weight: 900;
}

.player-role {
  font-size: 11px;
  color: #d9b85d;
  margin-top: 5px;
}

.money {
  margin-top: 7px;
  color: #7dffad;
  font-weight: 900;
}

.empty {
  opacity: .3;
}

.waiting {
  text-align: center;
  padding: 18px 10px;
}

.waiting .big {
  font-size: 40px;
  margin-bottom: 8px;
}

.waiting h2 {
  margin: 4px 0;
  color: #ffd66b;
}

.waiting p {
  color: #b7c0ba;
  margin: 5px 0;
}

/* ======================================================
   BUTTONS
====================================================== */

.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 14px;
}

.btn {
  border: 0;
  border-radius: 13px;
  padding: 12px 18px;
  font-weight: 900;
  color: white;

  box-shadow:
    0 5px 12px rgba(0,0,0,.4),
    inset 0 1px rgba(255,255,255,.15);
}

.green {
  background:
    linear-gradient(
      180deg,
      #28a65a,
      #0c612d
    );
}

.gold {
  background:
    linear-gradient(
      180deg,
      #f5c95d,
      #9b6813
    );
  color: #251700;
}

.blue {
  background:
    linear-gradient(
      180deg,
      #245eaa,
      #113260
    );
}

.orange {
  background:
    linear-gradient(
      180deg,
      #ffad32,
      #bd5c0a
    );
  color: #241100;
}

.red {
  background:
    linear-gradient(
      180deg,
      #d54c4c,
      #7d1717
    );
}

/* ======================================================
   GAME
====================================================== */

.game-grid {
  max-width: 1100px;
  margin: auto;

  display: grid;

  grid-template-columns:
    minmax(0, 1fr)
    280px;

  gap: 12px;
}

.table {
  position: relative;

  min-height: 500px;

  overflow: hidden;

  border-radius: 28px;

  border: 5px solid #b7892c;

  background:
    radial-gradient(
      ellipse at center,
      #16834b 0%,
      #07562f 48%,
      #03351f 100%
    );

  box-shadow:
    inset 0 0 60px rgba(0,0,0,.5),
    0 15px 45px rgba(0,0,0,.6);
}

.table::before {
  content: "";

  position: absolute;
  inset: 12px;

  border: 2px solid rgba(240,199,91,.4);

  border-radius: 22px;

  pointer-events: none;
}

.table-title {
  position: relative;
  text-align: center;
  padding: 13px;
  font-weight: 900;
  letter-spacing: 3px;
  color: #ffe28a;
}

.banner {
  position: relative;

  margin: 0 auto;

  max-width: 90%;

  padding: 10px 15px;

  text-align: center;

  border-radius: 12px;

  background: rgba(0,0,0,.45);

  border: 1px solid rgba(255,220,110,.35);

  color: #fff4c5;

  font-weight: 900;
}

/* ======================================================
   DOBBELBAK
====================================================== */

.dice-tray {
  position: relative;

  margin: 18px auto 10px;

  width: min(95%, 820px);

  min-height: 310px;

  border-radius: 28px;

  background:
    radial-gradient(
      ellipse at center,
      rgba(20,132,77,.9),
      rgba(2,67,39,.95)
    );

  border: 3px solid rgba(221,179,69,.7);

  box-shadow:
    inset 0 0 40px rgba(0,0,0,.55);
}

.dice-cup {
  position: absolute;

  top: -25px;
  left: 50%;

  transform: translateX(-50%);

  width: 110px;
  height: 80px;

  border-radius: 10px 10px 38px 38px;

  background:
    linear-gradient(
      90deg,
      #6e430d,
      #e4b747,
      #80520f
    );

  border: 3px solid #f4d46c;

  box-shadow:
    0 12px 25px rgba(0,0,0,.5);

  z-index: 5;
}

.dice-cup::after {
  content: "";

  position: absolute;

  left: 15px;
  right: 15px;
  top: 7px;

  height: 17px;

  border-radius: 50%;

  background: #090909;

  border: 2px solid #f1c758;
}

/* ======================================================
   DICE
====================================================== */

.dice-area {
  position: absolute;

  inset: 45px 15px 15px;

  display: flex;

  align-items: center;
  justify-content: center;

  flex-wrap: wrap;

  gap: 15px;
}

.die {
  width: 78px;
  height: 78px;

  position: relative;

  border-radius: 18px;

  background:
    linear-gradient(
      145deg,
      #ff3d3d 0%,
      #c80e18 50%,
      #740009 100%
    );

  border: 3px solid #f1c85a;

  box-shadow:
    inset -7px -9px 12px rgba(0,0,0,.4),
    inset 4px 4px 8px rgba(255,255,255,.18),
    0 10px 20px rgba(0,0,0,.45);

  transform-style: preserve-3d;

  transition:
    transform .15s,
    box-shadow .15s;
}

.die.held {
  border-width: 5px;

  box-shadow:
    0 0 0 3px rgba(255,221,93,.18),
    0 0 25px rgba(255,208,64,.65),
    inset -7px -9px 12px rgba(0,0,0,.4);
}

.die.hidden-result .pip {
  opacity: 0;
}

.die.rolling {
  animation:
    tumble .7s linear infinite;
}

.die.held::after {
  content: "VAST";

  position: absolute;

  left: 50%;
  bottom: -25px;

  transform: translateX(-50%);

  font-size: 10px;
  font-weight: 900;

  color: #ffe78b;
}

@keyframes tumble {

  0% {
    transform:
      translate(0,0)
      rotateX(0deg)
      rotateY(0deg)
      rotateZ(0deg);
  }

  20% {
    transform:
      translate(-18px,-11px)
      rotateX(125deg)
      rotateY(70deg)
      rotateZ(50deg);
  }

  40% {
    transform:
      translate(20px,12px)
      rotateX(250deg)
      rotateY(160deg)
      rotateZ(130deg);
  }

  60% {
    transform:
      translate(-12px,15px)
      rotateX(390deg)
      rotateY(250deg)
      rotateZ(210deg);
  }

  80% {
    transform:
      translate(14px,-9px)
      rotateX(520deg)
      rotateY(330deg)
      rotateZ(290deg);
  }

  100% {
    transform:
      translate(0,0)
      rotateX(720deg)
      rotateY(540deg)
      rotateZ(360deg);
  }
}

/* ======================================================
   PIPS
====================================================== */

.pip {
  position: absolute;

  width: 14px;
  height: 14px;

  border-radius: 50%;

  background:
    radial-gradient(
      circle at 35% 30%,
      #ffffff,
      #e5e5e5 55%,
      #aaa 100%
    );

  box-shadow:
    inset 1px 1px 2px rgba(0,0,0,.25),
    0 1px 2px rgba(0,0,0,.4);

  transform: translate(-50%, -50%);
}

.pip.tl { left: 24%; top: 24%; }
.pip.tc { left: 50%; top: 24%; }
.pip.tr { left: 76%; top: 24%; }
.pip.ml { left: 24%; top: 50%; }
.pip.mc { left: 50%; top: 50%; }
.pip.mr { left: 76%; top: 50%; }
.pip.bl { left: 24%; top: 76%; }
.pip.bc { left: 50%; top: 76%; }
.pip.br { left: 76%; top: 76%; }

/* ======================================================
   CONTROLS
====================================================== */

.controls {
  padding: 8px;

  display: flex;

  flex-wrap: wrap;

  gap: 8px;

  justify-content: center;
}

.target {
  text-align: center;

  margin: 8px auto;

  font-size: 24px;

  color: #ffe28b;

  font-weight: 1000;
}

.subinfo {
  text-align: center;

  color: #c9d1ca;

  font-size: 13px;
}

/* ======================================================
   SIDE
====================================================== */

.side {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.side-panel {
  border-radius: 18px;

  border: 1px solid #8b6928;

  background:
    linear-gradient(
      145deg,
      #13241b,
      #060c08
    );

  padding: 12px;
}

.side-title {
  color: #f3cf68;
  font-weight: 900;
  margin-bottom: 9px;
}

.side-player {
  display: flex;
  justify-content: space-between;

  padding: 8px;

  border-bottom: 1px solid rgba(255,255,255,.07);
}

.side-player.current {
  background: rgba(212,164,47,.12);
  border-radius: 8px;
}

.chat {
  max-height: 230px;
  overflow-y: auto;
}

.chat-message {
  padding: 6px 0;
  font-size: 13px;
}

.chat-message strong {
  color: #ffd66b;
}

.chat-form {
  display: flex;
  gap: 5px;
  margin-top: 7px;
}

.chat-form input {
  min-width: 0;
  flex: 1;

  border-radius: 9px;
  border: 1px solid #765b25;

  background: #07100b;
  color: white;

  padding: 8px;
}

/* ======================================================
   MOBILE
====================================================== */

@media(max-width: 760px) {

  .casino {
    padding: 7px;
  }

  .game-grid {
    grid-template-columns: 1fr;
  }

  .players-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .table {
    min-height: 450px;
  }

  .die {
    width: 65px;
    height: 65px;
  }

  .pip {
    width: 12px;
    height: 12px;
  }

  .dice-area {
    gap: 9px;
  }

  .btn {
    padding: 11px 13px;
  }
}

</style>
</head>

<body>

<div class="casino">

  <div class="topbar">
    <div class="brand">
      <h1>🎰 DOBBELEN 11/24</h1>
      <small>PRIVATE CASINO TABLE</small>
    </div>
  </div>

  <!-- ===================================================
       LOBBY / CASINO WAITING ROOM
  ==================================================== -->

  <section id="lobby" class="panel">

    <div class="room-code" id="roomCode">
      ------
    </div>

    <div class="table-status">
      🟢 CASINO TAFEL OPEN
    </div>

    <div class="players-grid" id="playersGrid"></div>

    <div id="guestWaiting" class="waiting hidden">

      <div class="big">🎩</div>

      <h2>WACHT OP DE BEHEERDER</h2>

      <p id="waitingText">
        De tafel wordt klaargemaakt...
      </p>

      <p>
        🎲 Zodra de beheerder het spel start,
        begint jouw eerste ronde.
      </p>

    </div>

    <div id="adminControls" class="buttons hidden">

      <button
        id="startButton"
        class="btn green"
        onclick="sendAction('start')">

        🎲 START SPEL

      </button>

    </div>

  </section>

  <!-- ===================================================
       GAME
  ==================================================== -->

  <section id="game" class="game-grid hidden">

    <div class="table">

      <div class="table-title">
        🎲 DOBBELTAFEL
      </div>

      <div id="banner" class="banner">
        Klaar...
      </div>

      <div id="target" class="target"></div>

      <div class="dice-tray">

        <div class="dice-cup"></div>

        <div id="diceArea" class="dice-area"></div>

      </div>

      <div class="subinfo" id="turnInfo"></div>

      <div class="controls" id="controls"></div>

    </div>

    <div class="side">

      <div class="side-panel">

        <div class="side-title">
          💰 SPELERS
        </div>

        <div id="sidePlayers"></div>

      </div>

      <div class="side-panel">

        <div class="side-title">
          💬 CHAT
        </div>

        <div id="chat" class="chat"></div>

        <form
          class="chat-form"
          onsubmit="sendChat(event)">

          <input
            id="chatInput"
            maxlength="200"
            placeholder="Bericht...">

          <button
            class="btn blue"
            type="submit">

            ➤

          </button>

        </form>

      </div>

      <div class="side-panel">

        <div class="side-title">
          📜 SPELLOG
        </div>

        <div id="log"></div>

      </div>

    </div>

  </section>

</div>

<script>

let state = null;
let lastVersion = 0;
let rolling = false;
let inviteMode = false;

/* ======================================================
   API
====================================================== */

async function api(url, options = {}) {

  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error || "Er ging iets mis.");
  }

  return data;
}

async function sendAction(action, extra = {}) {

  try {

    const data = await api("/api/action", {
      method: "POST",

      body: JSON.stringify({
        action,
        ...extra
      })
    });

    state = data;
    lastVersion = state.room.version;

    render();

  } catch (error) {

    alert(error.message);

  }
}

/* ======================================================
   SOUND
====================================================== */

let audioContext = null;

function audio() {

  if (!audioContext) {
    try {
      audioContext =
        new (window.AudioContext ||
             window.webkitAudioContext)();
    } catch(e) {}
  }

  return audioContext;
}

function beep(freq, duration, type="sine") {

  const ctx = audio();

  if (!ctx) return;

  try {

    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(
      0.001,
      ctx.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.13,
      ctx.currentTime + 0.02
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + duration
    );

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);

  } catch(e) {}
}

function rollSound() {

  beep(90, .12, "square");

  setTimeout(
    () => beep(120, .1, "square"),
    100
  );

  setTimeout(
    () => beep(160, .12, "square"),
    200
  );
}

function holdSound() {
  beep(500, .09, "triangle");
}

function acceptSound() {
  beep(500, .08, "sine");

  setTimeout(
    () => beep(700, .12, "sine"),
    80
  );
}

function winSound() {

  beep(500, .1, "sine");

  setTimeout(
    () => beep(700, .1, "sine"),
    100
  );

  setTimeout(
    () => beep(950, .18, "sine"),
    200
  );
}

/* ======================================================
   DICE
====================================================== */

const pipMap = {

  1: ["mc"],

  2: ["tl","br"],

  3: ["tl","mc","br"],

  4: ["tl","tr","bl","br"],

  5: ["tl","tr","mc","bl","br"],

  6: ["tl","tr","ml","mr","bl","br"]

};

function dieHTML(value, index, hidden=false) {

  const die = document.createElement("div");

  die.className = "die";

  if (state.room.held[index]) {
    die.classList.add("held");
  }

  if (hidden) {
    die.classList.add("hidden-result");
  }

  if (rolling && !state.room.held[index]) {
    die.classList.add("rolling");
  }

  /*
    Tijdens de animatie geven we expres geen echte waarde
    aan de ogen.
  */

  const visualValue =
    hidden
      ? Math.floor(Math.random() * 6) + 1
      : value;

  if (visualValue) {

    (pipMap[visualValue] || []).forEach(pos => {

      const pip = document.createElement("div");

      pip.className = "pip " + pos;

      die.appendChild(pip);

    });

  }

  if (
    !hidden &&
    state.room.phase === "main" &&
    state.room.hasRolled &&
    !state.room.held[index] &&
    !rolling
  ) {

    die.onclick = () => {

      holdSound();

      sendAction("hold", {
        index
      });

    };

  }

  return die;
}

function renderDice(hidden=false) {

  const area =
    document.getElementById("diceArea");

  area.innerHTML = "";

  state.room.dice.forEach((value, i) => {

    if (value === null) return;

    area.appendChild(
      dieHTML(value, i, hidden)
    );

  });
}

/* ======================================================
   ROLL ANIMATION
====================================================== */

function animateRoll(callback) {

  if (rolling) return;

  rolling = true;

  rollSound();

  /*
    Tijdens deze periode worden willekeurige ogen getoond.
    De echte serverwaarden worden NIET zichtbaar gemaakt.
  */

  renderDice(true);

  const duration = 1250;

  const started = performance.now();

  function frame(now) {

    if (now - started < duration) {

      renderDice(true);

      requestAnimationFrame(frame);

    } else {

      rolling = false;

      /*
        Pas nu worden de echte waarden getoond.
      */

      renderDice(false);

      if (callback) callback();

    }

  }

  requestAnimationFrame(frame);
}

/* ======================================================
   RENDER
====================================================== */

function render() {

  if (!state) return;

  document.getElementById("roomCode").textContent =
    state.room.code;

  renderPlayers();

  if (!state.room.started) {

    document
      .getElementById("lobby")
      .classList.remove("hidden");

    document
      .getElementById("game")
      .classList.add("hidden");

    renderLobby();

    return;
  }

  document
    .getElementById("lobby")
    .classList.add("hidden");

  document
    .getElementById("game")
    .classList.remove("hidden");

  renderGame();
}

function renderLobby() {

  const admin =
    !!state.me.isAdmin;

  const guestWaiting =
    document.getElementById("guestWaiting");

  const adminControls =
    document.getElementById("adminControls");

  if (admin) {

    adminControls.classList.remove("hidden");

    guestWaiting.classList.add("hidden");

    const button =
      document.getElementById("startButton");

    /*
      Server bepaalt canStart.
      Hierdoor kan de knop niet meer onterecht
      grijs worden door een verkeerde clientstatus.
    */

    button.disabled =
      !state.room.canStart;

  } else {

    adminControls.classList.add("hidden");

    guestWaiting.classList.remove("hidden");

    const adminPlayer =
      state.players.find(p => p.isAdmin);

    document.getElementById(
      "waitingText"
    ).textContent =
      adminPlayer
        ? "👑 " +
          adminPlayer.name +
          " maakt de tafel klaar..."
        : "De beheerder maakt de tafel klaar...";
  }
}

function renderPlayers() {

  const grid =
    document.getElementById("playersGrid");

  grid.innerHTML = "";

  for (let i = 0; i < 4; i++) {

    const player = state.players[i];

    const card =
      document.createElement("div");

    card.className = "player-card";

    if (!player) {

      card.innerHTML = `
        <div class="player-name empty">
          🎩 WACHT...
        </div>
        <div class="player-role">
          OPEN PLAATS
        </div>
      `;

    } else {

      if (player.isAdmin) {
        card.classList.add("admin");
      }

      card.innerHTML = `
        <div class="player-name">
          ${escapeHTML(player.name)}
        </div>

        <div class="player-role">
          ${player.isAdmin
            ? "👑 BEHEERDER"
            : "🎩 SPELER"}
        </div>

        <div class="money">
          €${player.money.toFixed(2)}
        </div>
      `;

    }

    grid.appendChild(card);
  }
}

function renderGame() {

  document.getElementById(
    "banner"
  ).textContent =
    state.room.banner || "";

  const current =
    state.room.current;

  const meIsCurrent =
    current &&
    current.id === state.me.id;

  document.getElementById(
    "turnInfo"
  ).textContent =
    meIsCurrent
      ? "🎯 DIT IS JOUW BEURT"
      : "⏳ " +
        (current
          ? current.name
          : "") +
        " is aan de beurt";

  renderDice(false);

  renderTarget();

  renderControls();

  renderSidePlayers();

  renderChat();

  renderLog();
}

function renderTarget() {

  const el =
    document.getElementById("target");

  if (
    state.room.phase === "earn" ||
    state.room.phase === "pay"
  ) {

    const mode =
      state.room.phase === "earn"
        ? "VERDIENEN"
        : "BETALEN";

    el.textContent =
      mode +
      ": " +
      state.room.target +
      "'EN";

    return;
  }

  el.textContent = "";
}

function renderControls() {

  const controls =
    document.getElementById("controls");

  controls.innerHTML = "";

  const isMe =
    state.room.current &&
    state.room.current.id === state.me.id;

  if (!isMe) return;

  /*
    BEGIN WORP
  */

  if (
    state.room.phase === "main" &&
    !state.room.hasRolled
  ) {

    const btn =
      document.createElement("button");

    btn.className = "btn orange";

    btn.textContent =
      "🎲 BEGIN WORP";

    btn.onclick = () => {

      audio();

      sendAction("begin");

    };

    controls.appendChild(btn);

    return;
  }

  /*
    MAIN
  */

  if (state.room.phase === "main") {

    if (
      state.room.hasRolled &&
      !state.room.held.every(Boolean)
    ) {

      const reroll =
        document.createElement("button");

      reroll.className =
        "btn orange";

      reroll.textContent =
        "🎲 OPNIEUW GOOIEN";

      reroll.disabled =
        state.room.mustHold;

      reroll.onclick = () => {

        audio();

        animateRoll(() => {
          sendAction("reroll");
        });

      };

      controls.appendChild(reroll);
    }

    if (state.room.hasRolled) {

      const accept =
        document.createElement("button");

      accept.className =
        "btn blue";

      accept.textContent =
        "✓ AKKOORD";

      accept.onclick = () => {

        acceptSound();

        sendAction("accept");

      };

      controls.appendChild(accept);
    }

    return;
  }

  /*
    VERDIENEN / BETALEN
  */

  if (
    state.room.phase === "earn" ||
    state.room.phase === "pay"
  ) {

    const btn =
      document.createElement("button");

    btn.className =
      state.room.phase === "earn"
        ? "btn green"
        : "btn red";

    btn.textContent =
      state.room.phase === "earn"
        ? "🎲 GOOI VOOR VERDIENEN"
        : "🎲 GOOI VOOR BETALEN";

    btn.onclick = () => {

      animateRoll(() => {

        if (state.room.needFreshRoll) {

          sendAction("roundRoll");

        } else {

          sendAction("roundRoll");

        }

      });

    };

    controls.appendChild(btn);
  }
}

function renderSidePlayers() {

  const box =
    document.getElementById("sidePlayers");

  box.innerHTML = "";

  state.players.forEach(player => {

    const div =
      document.createElement("div");

    div.className =
      "side-player";

    if (
      state.room.current &&
      player.id === state.room.current.id
    ) {
      div.classList.add("current");
    }

    div.innerHTML = `
      <span>
        ${player.isAdmin ? "👑 " : "🎩 "}
        ${escapeHTML(player.name)}
      </span>

      <strong>
        €${player.money.toFixed(2)}
      </strong>
    `;

    box.appendChild(div);
  });
}

function renderChat() {

  const box =
    document.getElementById("chat");

  box.innerHTML = "";

  state.room.chat.forEach(message => {

    const div =
      document.createElement("div");

    div.className =
      "chat-message";

    div.innerHTML = `
      <strong>
        ${escapeHTML(message.player)}
      </strong>
      ${escapeHTML(message.text)}
      <small>
        ${escapeHTML(message.time)}
      </small>
    `;

    box.appendChild(div);

  });

  box.scrollTop = box.scrollHeight;
}

function renderLog() {

  const box =
    document.getElementById("log");

  box.innerHTML = "";

  state.room.log.slice(0, 12).forEach(item => {

    const div =
      document.createElement("div");

    div.style.fontSize = "12px";
    div.style.padding = "4px 0";
    div.style.color = "#bfc8c1";

    div.textContent =
      item.time + " — " + item.text;

    box.appendChild(div);

  });
}

/* ======================================================
   CHAT
====================================================== */

async function sendChat(event) {

  event.preventDefault();

  const input =
    document.getElementById("chatInput");

  const text =
    input.value.trim();

  if (!text) return;

  input.value = "";

  await sendAction(
    "chat",
    { text }
  );
}

/* ======================================================
   POLLING
====================================================== */

async function poll() {

  try {

    const data =
      await api("/api/state");

    const changed =
      !state ||
      data.room.version !== lastVersion;

    state = data;
    lastVersion = data.room.version;

    if (changed) {

      /*
        Wanneer een nieuwe worp binnenkomt,
        starten we lokaal de verborgen animatie.
      */

      render();

    }

  } catch(e) {

    /*
      Nog geen sessie is normaal bij het openingsscherm.
    */

  }
}

setInterval(
  poll,
  700
);

/* ======================================================
   START
====================================================== */

async function createRoom() {

  const name =
    document.getElementById("name").value.trim();

  if (!name) {
    alert("Vul eerst je naam in.");
    return;
  }

  try {

    const data =
      await api("/api/create", {
        method: "POST",

        body: JSON.stringify({
          name
        })
      });

    state = data;
    lastVersion = state.room.version;

    render();

  } catch(e) {

    alert(e.message);

  }
}

async function joinRoom() {

  const name =
    document.getElementById("joinName").value.trim();

  const code =
    document.getElementById("joinCode").value.trim();

  if (!name) {
    alert("Vul je naam in.");
    return;
  }

  if (!code) {
    alert("Vul de kamercode in.");
    return;
  }

  try {

    const data =
      await api("/api/join", {
        method: "POST",

        body: JSON.stringify({
          name,
          code
        })
      });

    state = data;
    lastVersion = state.room.version;

    render();

  } catch(e) {

    alert(e.message);

  }
}

function escapeHTML(value) {

  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/*
  Activeer audio na eerste aanraking.
*/

document.addEventListener(
  "pointerdown",
  () => {
    audio();
  },
  { once: true }
);

/*
  Begin direct met state ophalen.
*/

poll();

</script>

</body>
</html>`;

/* =========================================================
   HTTP SERVER
========================================================= */

function sendJSON(res, status, data) {

  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });

  res.end(JSON.stringify(data));
}

function sendHTML(res) {

  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });

  res.end(HTML);
}

function readBody(req) {

  return new Promise((resolve, reject) => {

    let body = "";

    req.on("data", chunk => {

      body += chunk;

      if (body.length > 1000000) {
        reject(
          new Error("Request te groot.")
        );

        req.destroy();
      }
    });

    req.on("end", () => {

      try {

        resolve(
          body
            ? JSON.parse(body)
            : {}
        );

      } catch(e) {

        reject(
          new Error("Ongeldige JSON.")
        );

      }

    });

    req.on("error", reject);

  });
}

/* =========================================================
   SERVER
========================================================= */

const server =
  http.createServer(
    async (req, res) => {

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
            { ok: true }
          );

        }

        /*
          STATE
        */

        if (
          req.method === "GET" &&
          req.url === "/api/state"
        ) {

          const session =
            getRoomPlayer(req);

          if (!session) {

            return sendJSON(
              res,
              401,
              {
                error: "Geen sessie"
              }
            );

          }

          return sendJSON(
            res,
            200,
            publicState(
              session.room,
              session.player
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
            cleanName(body.name);

          const created =
            createRoom(name);

          const sid =
            createSession(
              created.room.code,
              created.player.id
            );

          setCookie(res, sid);

          return sendJSON(
            res,
            200,
            publicState(
              created.room,
              created.player
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

          const name =
            cleanName(body.name);

          const code =
            cleanCode(body.code);

          const joined =
            joinRoom(code, name);

          const sid =
            createSession(
              joined.room.code,
              joined.player.id
            );

          setCookie(res, sid);

          return sendJSON(
            res,
            200,
            publicState(
              joined.room,
              joined.player
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

          const session =
            getRoomPlayer(req);

          if (!session) {

            return sendJSON(
              res,
              401,
              {
                error: "Geen sessie"
              }
            );

          }

          const body =
            await readBody(req);

          doAction(
            session.room,
            session.player,
            body
          );

          return sendJSON(
            res,
            200,
            publicState(
              session.room,
              session.player
            )
          );

        }

        /*
          WEBSITE
        */

        if (
          req.method === "GET" &&
          (req.url === "/" ||
           req.url.startsWith("/?"))
        ) {

          return sendHTML(res);

        }

        sendJSON(
          res,
          404,
          {
            error: "Niet gevonden"
          }
        );

      } catch(error) {

        console.error(error);

        sendJSON(
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
  () => {
    console.log(
      "🎰 Dobbelen 11/24 draait op poort " +
      PORT
    );
  }
);
