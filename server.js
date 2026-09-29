const http = require("http");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;

const rooms = new Map();
const sessions = new Map();

/* =========================================================
   HELPERS
========================================================= */

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = "";
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));
  return code;
}

function randomDie() {
  return Math.floor(Math.random() * 6) + 1;
}

function rollDice(count = 5) {
  return Array.from({ length: count }, () => randomDie());
}

function cleanName(name) {
  name = String(name || "").trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Vul een speelnaam in.");
  if (name.length > 20) throw new Error("Je speelnaam mag maximaal 20 tekens zijn.");
  return name;
}

function cleanCode(code) {
  return String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function newRoom(hostName) {
  const code = randomCode();

  const room = {
    code,
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

    banner: "Maak een kamer en nodig spelers uit.",
    log: [],
    chat: [],

    version: 1,
    rollSeq: 0
  };

  rooms.set(code, room);

  const player = {
    id: crypto.randomUUID(),
    name: hostName,
    money: 0,
    active: true
  };

  room.players.push(player);
  room.admin = player.id;

  addLog(room, `${hostName} heeft de kamer gemaakt.`);

  return room;
}

function getSession(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/sid=([^;]+)/);

  if (!match) return null;

  return sessions.get(match[1]) || null;
}

function createSession(roomCode, playerId) {
  const sid = crypto.randomBytes(24).toString("hex");

  sessions.set(sid, {
    roomCode,
    playerId
  });

  return sid;
}

function setCookie(res, sid) {
  res.setHeader(
    "Set-Cookie",
    `sid=${sid}; HttpOnly; Path=/; SameSite=Lax`
  );
}

function getPlayer(room, session) {
  if (!session || session.roomCode !== room.code) return null;

  return room.players.find(p => p.id === session.playerId) || null;
}

function playerIndex(room, playerId) {
  return room.players.findIndex(p => p.id === playerId);
}

function activePlayers(room) {
  return room.players.filter(p => p.active);
}

function currentPlayer(room) {
  const active = activePlayers(room);
  if (!active.length) return null;

  if (room.current >= room.players.length) {
    room.current = 0;
  }

  let p = room.players[room.current];

  if (p && p.active) return p;

  for (let i = 0; i < room.players.length; i++) {
    const index = (room.current + i) % room.players.length;
    if (room.players[index].active) {
      room.current = index;
      return room.players[index];
    }
  }

  return null;
}

function nextPlayer(room) {
  const start = room.current;

  for (let i = 1; i <= room.players.length; i++) {
    const index = (start + i) % room.players.length;

    if (room.players[index].active) {
      room.current = index;
      return room.players[index];
    }
  }

  return room.players[room.current];
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

/* =========================================================
   GAME
========================================================= */

function resetTurn(room) {
  room.phase = "main";

  room.dice = [1, 1, 1, 1, 1];
  room.held = [false, false, false, false, false];
  room.settled = [false, false, false, false, false];

  room.hasRolled = false;
  room.mustHold = false;

  room.target = null;
  room.mode = null;

  room.needFreshRoll = false;

  room.rollSeq++;
}

function startGame(room) {
  if (activePlayers(room).length < 2) {
    throw new Error("Er moeten minimaal 2 spelers in de kamer zitten.");
  }

  room.started = true;
  room.phase = "main";
  room.current = room.players.findIndex(p => p.active);

  resetTurn(room);

  const p = currentPlayer(room);

  room.banner = `${p.name} is aan de beurt.`;
  addLog(room, `Het spel is gestart. ${p.name} begint.`);

  bump(room);
}

function beginTurn(room) {
  if (room.phase !== "main") {
    throw new Error("Je kunt nu geen beginworp doen.");
  }

  if (room.hasRolled) {
    throw new Error("Je hebt deze beurt al gegooid.");
  }

  room.dice = rollDice(5);
  room.held = [false, false, false, false, false];
  room.settled = [false, false, false, false, false];

  room.hasRolled = true;
  room.mustHold = true;
  room.rollSeq++;

  const p = currentPlayer(room);

  room.banner = `${p.name} heeft gegooid. Houd minimaal 1 nieuwe dobbelsteen vast.`;

  addLog(
    room,
    `${p.name} gooide ${room.dice.join(" - ")}.`
  );

  bump(room);
}

function holdDie(room, index) {
  if (room.phase !== "main") {
    throw new Error("Vasthouden kan alleen tijdens de gewone worpfase.");
  }

  if (!room.hasRolled) {
    throw new Error("Doe eerst de beginworp.");
  }

  if (index < 0 || index >= 5) {
    throw new Error("Ongeldige dobbelsteen.");
  }

  if (room.held[index]) {
    throw new Error("Deze dobbelsteen staat al vast.");
  }

  room.held[index] = true;

  // Zodra minstens één nieuwe steen is vastgezet,
  // mag er opnieuw gegooid worden.
  room.mustHold = false;

  const p = currentPlayer(room);

  room.banner = `${p.name} heeft een dobbelsteen vastgezet.`;

  bump(room);
}

function mainReroll(room) {
  if (room.phase !== "main") {
    throw new Error("Je kunt hier nu niet opnieuw gooien.");
  }

  if (!room.hasRolled) {
    throw new Error("Doe eerst de beginworp.");
  }

  if (room.mustHold) {
    throw new Error(
      "Je moet eerst minimaal 1 nieuwe dobbelsteen vasthouden."
    );
  }

  const loose = room.dice
    .map((_, i) => i)
    .filter(i => !room.held[i]);

  if (!loose.length) {
    throw new Error("Alle dobbelstenen staan vast.");
  }

  loose.forEach(i => {
    room.dice[i] = randomDie();
  });

  room.rollSeq++;

  // Na iedere worp moet er opnieuw minimaal één nieuwe
  // dobbelsteen worden vastgehouden.
  room.mustHold = true;

  const p = currentPlayer(room);

  room.banner =
    `${p.name} heeft opnieuw gegooid. Houd minimaal 1 nieuwe dobbelsteen vast.`;

  addLog(room, `${p.name} gooide opnieuw: ${room.dice.join(" - ")}.`);

  bump(room);
}

function diceTotal(room) {
  return room.dice.reduce((sum, n) => sum + n, 0);
}

/*
  11 en 24 zijn speciale worpen.

  Voor andere totalen:
  - onder 11: afstand tot 11
  - 12 t/m 17: afstand vanaf 11
  - 18 t/m 23: afstand tot 24
  - boven 24: afstand vanaf 24

  Hierdoor ontstaat altijd een doelsteen van 1 t/m 6.
*/

function determineTarget(total) {
  if (total === 11 || total === 24) {
    return null;
  }

  let target;

  if (total < 11) {
    target = 11 - total;
  } else if (total < 18) {
    target = total - 11;
  } else if (total < 24) {
    target = 24 - total;
  } else {
    target = total - 24;
  }

  if (target < 1) target = 1;
  if (target > 6) target = 6;

  let mode = "earn";

  /*
    18 t/m 23 wordt de betaalrichting.
    De overige geldige totalen zijn verdienen.
  */
  if (total >= 18 && total <= 23) {
    mode = "pay";
  }

  return {
    target,
    mode
  };
}

function transferMoney(room, fromId, toId, amount) {
  const from = room.players.find(p => p.id === fromId);
  const to = room.players.find(p => p.id === toId);

  if (!from || !to) return;

  from.money -= amount;
  to.money += amount;
}

function transferToAll(room, playerId, amount, direction) {
  const p = room.players.find(x => x.id === playerId);
  if (!p) return;

  const opponents = activePlayers(room).filter(x => x.id !== playerId);

  for (const opponent of opponents) {
    if (direction === "earn") {
      opponent.money -= amount;
      p.money += amount;
    } else {
      p.money -= amount;
      opponent.money += amount;
    }
  }
}

function finishTurn(room) {
  const p = currentPlayer(room);

  if (p) {
    room.banner = `${p.name} heeft zijn beurt beëindigd.`;
  }

  nextPlayer(room);

  const next = currentPlayer(room);

  resetTurn(room);

  if (next) {
    room.banner = `${next.name} is aan de beurt.`;
    addLog(room, `${next.name} is nu aan de beurt.`);
  }

  bump(room);
}

function acceptMain(room) {
  if (room.phase !== "main") {
    throw new Error("Je kunt nu niet akkoord gaan.");
  }

  if (!room.hasRolled) {
    throw new Error("Doe eerst een worp.");
  }

  const total = diceTotal(room);
  const p = currentPlayer(room);

  /* 11 / 24 = speciale uitbetaling */
  if (total === 11 || total === 24) {
    const opponents = activePlayers(room).filter(
      x => x.id !== p.id
    );

    for (const opponent of opponents) {
      opponent.money -= 0.5;
      p.money += 0.5;
    }

    room.banner =
      `${p.name} gooide ${total}! €0,50 van iedere tegenstander.`;

    addLog(
      room,
      `${p.name} gooide ${total} en kreeg €0,50 van iedere tegenstander.`
    );

    finishTurn(room);
    return;
  }

  const result = determineTarget(total);

  room.phase = "round";

  room.target = result.target;
  room.mode = result.mode;

  room.settled = [false, false, false, false, false];
  room.held = [false, false, false, false, false];

  room.needFreshRoll = false;

  room.banner =
    `${p.name}: ${result.mode === "earn" ? "VERDIENEN" : "BETALEN"} met ${result.target}'en.`;

  addLog(
    room,
    `${p.name} accepteerde totaal ${total}. Doelsteen: ${result.target}.`
  );

  /*
    De huidige worp wordt meteen verwerkt.
    Dus als er bijvoorbeeld twee doelstenen liggen,
    tellen die direct mee.
  */
  resolveRound(room);
}

function resolveRound(room) {
  if (room.phase !== "round") return;

  const p = currentPlayer(room);

  if (!p) return;

  const target = room.target;

  if (!target) {
    finishTurn(room);
    return;
  }

  let hits = 0;

  for (let i = 0; i < 5; i++) {
    if (!room.settled[i] && room.dice[i] === target) {
      room.settled[i] = true;
      room.held[i] = true;
      hits++;
    }
  }

  if (hits === 0) {
    room.banner =
      `${p.name}: MIS! Geen ${target}. De beurt gaat naar de volgende speler.`;

    addLog(
      room,
      `${p.name} had geen ${target} en eindigt de beurt.`
    );

    finishTurn(room);
    return;
  }

  const amount = hits * 5;

  transferToAll(
    room,
    p.id,
    amount,
    room.mode
  );

  room.banner =
    `${room.mode === "earn" ? "VERDIEND" : "BETAALD"}: ${amount} euro (${hits} × €5).`;

  addLog(
    room,
    `${p.name}: ${hits}× doelsteen ${target}. ${amount} euro.`
  );

  const allSettled = room.settled.every(Boolean);

  if (allSettled) {
    /*
      VOLLE BAK:
      alle 5 dobbelstenen zijn doelstenen.
      Er komt een volledig nieuwe worp van 5 dobbelstenen.
      Deze worp wordt pas uitgevoerd wanneer de speler
      opnieuw op de knop drukt.
    */
    room.needFreshRoll = true;

    room.banner =
      `VOLLE BAK! ${p.name} mag opnieuw met 5 dobbelstenen gooien.`;

    addLog(
      room,
      `${p.name} had een VOLLE BAK en krijgt 5 nieuwe dobbelstenen.`
    );
  } else {
    room.needFreshRoll = false;

    room.banner =
      `${p.name}: ${room.mode === "earn" ? "VERDIENEN" : "BETALEN"} met ${target}'en.`;
  }

  room.hasRolled = true;
  room.mustHold = false;

  bump(room);
}

function roundRoll(room) {
  if (room.phase !== "round") {
    throw new Error("Je bent niet in de verdien/betaalfase.");
  }

  const target = room.target;

  if (!target) {
    throw new Error("Geen doelsteen ingesteld.");
  }

  /*
    Na een volle bak moet er een volledig nieuwe set
    van 5 dobbelstenen komen.
  */
  if (room.needFreshRoll) {
    room.dice = rollDice(5);
    room.held = [false, false, false, false, false];
    room.settled = [false, false, false, false, false];

    room.needFreshRoll = false;
    room.hasRolled = true;

    room.rollSeq++;

    addLog(
      room,
      `${currentPlayer(room).name} kreeg een nieuwe set van 5 dobbelstenen: ${room.dice.join(" - ")}.`
    );

    resolveRound(room);
    return;
  }

  const loose = [];

  for (let i = 0; i < 5; i++) {
    if (!room.settled[i]) {
      loose.push(i);
    }
  }

  if (!loose.length) {
    room.needFreshRoll = true;
    bump(room);
    return;
  }

  loose.forEach(i => {
    room.dice[i] = randomDie();
    room.held[i] = false;
  });

  room.rollSeq++;

  room.hasRolled = true;

  addLog(
    room,
    `${currentPlayer(room).name} gooide opnieuw: ${room.dice.join(" - ")}.`
  );

  resolveRound(room);
}

function newGame(room) {
  if (!room.started) {
    throw new Error("Het spel is nog niet gestart.");
  }

  for (const p of room.players) {
    p.money = 0;
    p.active = true;
  }

  room.current = room.players.findIndex(p => p.id === room.admin);

  resetTurn(room);

  const p = currentPlayer(room);

  room.banner = `${p.name} begint een nieuw spel.`;

  addLog(room, "Nieuw spel gestart.");

  bump(room);
}

/* =========================================================
   CHAT
========================================================= */

function sendChat(room, player, message) {
  message = String(message || "").trim();

  if (!message) return;

  if (message.length > 200) {
    throw new Error("Bericht is te lang.");
  }

  room.chat.push({
    id: crypto.randomUUID(),
    player: player.name,
    message,
    time: new Date().toLocaleTimeString("nl-NL", {
      hour: "2-digit",
      minute: "2-digit"
    })
  });

  room.chat = room.chat.slice(-50);

  bump(room);
}

/* =========================================================
   STATE
========================================================= */

function publicState(room, player) {
  const current = currentPlayer(room);

  return {
    ok: true,

    room: {
      code: room.code,
      started: room.started,
      phase: room.phase,
      banner: room.banner,

      currentPlayerId: current ? current.id : null,

      dice: room.dice,
      held: room.held,
      settled: room.settled,

      hasRolled: room.hasRolled,
      mustHold: room.mustHold,

      target: room.target,
      mode: room.mode,
      needFreshRoll: room.needFreshRoll,

      version: room.version,
      rollSeq: room.rollSeq
    },

    me: player
      ? {
          id: player.id,
          name: player.name,
          money: player.money,
          isAdmin: player.id === room.admin
        }
      : null,

    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      money: p.money,
      active: p.active,
      isAdmin: p.id === room.admin
    })),

    log: room.log,
    chat: room.chat
  };
}

/* =========================================================
   ACTIONS
========================================================= */

function performAction(room, player, body) {
  const action = body.action;

  if (!player) {
    throw new Error("Geen speler gevonden.");
  }

  const pi = playerIndex(room, player.id);

  if (pi < 0) {
    throw new Error("Speler zit niet in deze kamer.");
  }

  /*
    Admin-acties
  */
  if (action === "start") {
    if (player.id !== room.admin) {
      throw new Error("Alleen de beheerder kan het spel starten.");
    }

    startGame(room);
    return;
  }

  if (action === "newGame") {
    if (player.id !== room.admin) {
      throw new Error("Alleen de beheerder kan een nieuw spel starten.");
    }

    newGame(room);
    return;
  }

  if (action === "removePlayer") {
    if (player.id !== room.admin) {
      throw new Error("Alleen de beheerder kan spelers verwijderen.");
    }

    const targetId = String(body.playerId || "");

    if (targetId === room.admin) {
      throw new Error("De beheerder kan zichzelf niet verwijderen.");
    }

    const target = room.players.find(p => p.id === targetId);

    if (!target) {
      throw new Error("Speler niet gevonden.");
    }

    target.active = false;

    addLog(room, `${target.name} is uit het spel gehaald.`);

    if (room.started && room.current === playerIndex(room, target.id)) {
      nextPlayer(room);
      resetTurn(room);
    }

    bump(room);
    return;
  }

  /*
    Vanaf hier zijn de acties alleen toegestaan
    voor de speler die aan de beurt is.
  */
  if (room.current !== pi) {
    throw new Error("Het is niet jouw beurt.");
  }

  if (action === "beginTurn") {
    beginTurn(room);
    return;
  }

  if (action === "hold") {
    holdDie(room, Number(body.index));
    return;
  }

  if (action === "reroll") {
    mainReroll(room);
    return;
  }

  if (action === "accept") {
    acceptMain(room);
    return;
  }

  if (action === "roundRoll") {
    roundRoll(room);
    return;
  }

  if (action === "chat") {
    sendChat(room, player, body.message);
    return;
  }

  throw new Error("Onbekende actie.");
}

/* =========================================================
   HTML
========================================================= */

const HTML = String.raw`<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<title>Dobbelen 11/24</title>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Arial, Helvetica, sans-serif;
  background:
    radial-gradient(circle at top, #172a50 0%, #081126 48%, #030812 100%);
  color: white;
  min-height: 100vh;
}

button,
input {
  font: inherit;
}

button {
  border: 0;
  cursor: pointer;
}

.app {
  width: min(900px, 100%);
  margin: auto;
  padding: 12px;
}

.top {
  text-align: center;
  padding: 8px 0 12px;
}

.logo {
  font-size: clamp(25px, 7vw, 44px);
  font-weight: 900;
  letter-spacing: 2px;
  color: #ffd35a;
  text-shadow:
    0 3px 0 #8c5800,
    0 0 20px rgba(255, 194, 50, .35);
}

.subtitle {
  color: #bfcce7;
  font-size: 13px;
  margin-top: 3px;
}

.card {
  background:
    linear-gradient(145deg, rgba(25,43,78,.96), rgba(7,16,34,.98));
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 18px;
  box-shadow: 0 15px 40px rgba(0,0,0,.35);
  padding: 16px;
  margin-bottom: 12px;
}

h2 {
  margin: 0 0 12px;
  font-size: 21px;
}

h3 {
  margin: 0 0 8px;
}

label {
  display: block;
  color: #b9c7df;
  font-size: 12px;
  font-weight: bold;
  margin: 10px 0 5px;
}

input {
  width: 100%;
  border: 1px solid #40557c;
  background: #09142b;
  color: white;
  border-radius: 11px;
  padding: 13px;
  outline: none;
}

input:focus {
  border-color: #ffd15a;
  box-shadow: 0 0 0 2px rgba(255,209,90,.12);
}

.btn {
  width: 100%;
  padding: 14px;
  margin-top: 10px;
  border-radius: 12px;
  font-weight: 900;
  color: white;
  background: #2455a6;
  box-shadow: 0 5px 0 #12356d;
}

.btn:active {
  transform: translateY(2px);
  box-shadow: 0 3px 0 #12356d;
}

.btn.gold {
  background: linear-gradient(#ffd96a, #d89715);
  color: #211500;
  box-shadow: 0 5px 0 #8a5a00;
}

.btn.green {
  background: linear-gradient(#35d17b, #15954f);
  box-shadow: 0 5px 0 #096337;
}

.btn.orange {
  background: linear-gradient(#ffb449, #e56b0b);
  box-shadow: 0 5px 0 #8d3900;
}

.btn.red {
  background: linear-gradient(#ef6262, #b82d2d);
  box-shadow: 0 5px 0 #6f1717;
}

.btn:disabled {
  opacity: .38;
  cursor: not-allowed;
  transform: none;
}

.room-code {
  font-size: 35px;
  font-weight: 900;
  letter-spacing: 5px;
  text-align: center;
  color: #ffd45a;
  margin: 8px 0;
}

.invite {
  background: #0a1730;
  border: 1px dashed #4d638b;
  border-radius: 12px;
  padding: 10px;
  font-size: 12px;
  color: #bfcce7;
  word-break: break-all;
  margin-top: 8px;
}

.player-list {
  display: grid;
  gap: 7px;
}

.player {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255,255,255,.06);
  border-radius: 10px;
  padding: 10px;
}

.player-name {
  font-weight: 800;
}

.badge {
  font-size: 10px;
  border-radius: 20px;
  padding: 4px 7px;
  background: #2b4168;
  color: #d9e5ff;
}

.badge.admin {
  background: #806016;
  color: #ffe18a;
}

.money {
  color: #62ed9a;
  font-weight: 900;
}

.error {
  background: rgba(160,30,30,.25);
  border: 1px solid #9b3b3b;
  color: #ffaaaa;
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 10px;
  display: none;
}

.banner {
  text-align: center;
  background: linear-gradient(90deg, #162d55, #0c1a34, #162d55);
  border: 1px solid #314b79;
  border-radius: 13px;
  padding: 11px;
  font-weight: 900;
  color: #f9d96b;
  margin-bottom: 10px;
}

.turn {
  text-align: center;
  color: #b7c7e4;
  font-size: 13px;
  margin-bottom: 8px;
}

.table {
  position: relative;
  overflow: hidden;
  border-radius: 24px;
  padding: 18px 10px 22px;
  background:
    radial-gradient(ellipse at center, #16774d 0%, #075535 60%, #033724 100%);
  border: 7px solid #7b4b15;
  box-shadow:
    inset 0 0 30px rgba(0,0,0,.45),
    0 12px 30px rgba(0,0,0,.45);
}

.table::before {
  content: "";
  position: absolute;
  inset: 7px;
  border: 2px solid rgba(255,214,111,.25);
  border-radius: 18px;
  pointer-events: none;
}

.tray-title {
  position: relative;
  text-align: center;
  color: #ffe092;
  font-weight: 900;
  letter-spacing: 2px;
  margin-bottom: 8px;
}

.dice-area {
  position: relative;
  min-height: 185px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
  padding: 10px;
}

.die {
  width: 66px;
  height: 66px;
  position: relative;
  border-radius: 15px;
  background:
    linear-gradient(145deg, #ff4d4d 0%, #c51212 45%, #720707 100%);
  border: 3px solid #e7b849;
  box-shadow:
    inset -6px -7px 10px rgba(0,0,0,.35),
    inset 4px 4px 8px rgba(255,255,255,.25),
    0 7px 12px rgba(0,0,0,.55);
  user-select: none;
  transition: transform .18s, filter .18s, box-shadow .18s;
}

.die.clickable {
  cursor: pointer;
}

.die.clickable:hover {
  transform: translateY(-5px) scale(1.04);
}

.die.held {
  border-color: #ffe28b;
  box-shadow:
    0 0 0 3px rgba(255,213,72,.18),
    0 0 22px rgba(255,204,58,.55),
    inset -6px -7px 10px rgba(0,0,0,.35);
  filter: brightness(1.08);
}

.die.settled {
  border-color: #fff0a5;
  box-shadow:
    0 0 0 3px rgba(255,213,72,.3),
    0 0 28px rgba(255,210,50,.75),
    inset -6px -7px 10px rgba(0,0,0,.35);
}

.die.vast::after {
  content: "VAST";
  position: absolute;
  left: 50%;
  bottom: -18px;
  transform: translateX(-50%);
  color: #ffe37a;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 1px;
}

.pip {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: white;
  box-shadow:
    inset 1px 1px 2px rgba(0,0,0,.25),
    0 1px 2px rgba(0,0,0,.3);
}

.tl { left: 12px; top: 12px; }
.tc { left: 50%; top: 12px; transform: translateX(-50%); }
.tr { right: 12px; top: 12px; }
.ml { left: 12px; top: 50%; transform: translateY(-50%); }
.mc { left: 50%; top: 50%; transform: translate(-50%,-50%); }
.mr { right: 12px; top: 50%; transform: translateY(-50%); }
.bl { left: 12px; bottom: 12px; }
.bc { left: 50%; bottom: 12px; transform: translateX(-50%); }
.br { right: 12px; bottom: 12px; }

.rolling {
  animation: tumble .55s cubic-bezier(.2,.8,.2,1);
}

@keyframes tumble {
  0% {
    transform:
      translate3d(0,0,0)
      rotateX(0deg)
      rotateY(0deg)
      rotateZ(0deg);
  }

  20% {
    transform:
      translate3d(-14px,-20px,0)
      rotateX(130deg)
      rotateY(75deg)
      rotateZ(-35deg);
  }

  45% {
    transform:
      translate3d(15px,9px,0)
      rotateX(270deg)
      rotateY(180deg)
      rotateZ(65deg);
  }

  70% {
    transform:
      translate3d(-10px,-7px,0)
      rotateX(420deg)
      rotateY(280deg)
      rotateZ(-50deg);
  }

  100% {
    transform:
      translate3d(0,0,0)
      rotateX(540deg)
      rotateY(360deg)
      rotateZ(0deg);
  }
}

.controls {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.control-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.status-box {
  text-align: center;
  background: rgba(0,0,0,.18);
  border-radius: 12px;
  padding: 12px;
  margin-top: 10px;
}

.big-action {
  font-size: 18px;
  padding: 17px;
}

.target-box {
  text-align: center;
  padding: 12px;
  border-radius: 14px;
  background: linear-gradient(135deg, #111f3c, #09152b);
  border: 1px solid #41567d;
  margin-bottom: 10px;
}

.target-number {
  font-size: 32px;
  color: #ffe17b;
  font-weight: 900;
}

.target-label {
  font-size: 12px;
  color: #b9c8e0;
  font-weight: 900;
  letter-spacing: 1px;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chat-box {
  display: none;
}

.chat-box.open {
  display: block;
}

.chat-messages {
  height: 180px;
  overflow-y: auto;
  background: #071127;
  border-radius: 10px;
  padding: 8px;
}

.chat-message {
  margin-bottom: 7px;
  font-size: 13px;
}

.chat-message strong {
  color: #ffd968;
}

.chat-time {
  color: #66799c;
  font-size: 10px;
  margin-left: 4px;
}

.chat-input {
  display: grid;
  grid-template-columns: 1fr 75px;
  gap: 7px;
  margin-top: 7px;
}

.small {
  font-size: 11px;
  color: #8295b7;
}

.hidden {
  display: none !important;
}

.center {
  text-align: center;
}

@media (max-width: 560px) {
  .app {
    padding: 8px;
  }

  .card {
    padding: 12px;
    border-radius: 15px;
  }

  .die {
    width: 57px;
    height: 57px;
  }

  .pip {
    width: 10px;
    height: 10px;
  }

  .tl { left: 10px; top: 10px; }
  .tc { top: 10px; }
  .tr { right: 10px; top: 10px; }
  .ml { left: 10px; }
  .mr { right: 10px; }
  .bl { left: 10px; bottom: 10px; }
  .bc { bottom: 10px; }
  .br { right: 10px; bottom: 10px; }

  .dice-area {
    gap: 6px;
  }
}
</style>
</head>

<body>

<div class="app">

  <div class="top">
    <div class="logo">DOBBELEN 11/24</div>
    <div class="subtitle">Las Vegas multiplayer dice game</div>
  </div>

  <div id="error" class="error"></div>

  <!-- LANDING -->
  <div id="landing">

    <div class="card">
      <h2>🎲 Nieuwe speelkamer</h2>

      <label>SPEELNAAM</label>
      <input
        id="createName"
        maxlength="20"
        placeholder="Bijvoorbeeld Wesley"
        autocomplete="off"
      >

      <button class="btn gold big-action" onclick="createRoom()">
        KAMER MAKEN
      </button>

      <div class="small center" style="margin-top:8px">
        Jij wordt automatisch beheerder van de kamer.
      </div>
    </div>

    <div class="card">
      <h2>🚪 Meedoen met een kamer</h2>

      <label>SPEELNAAM</label>
      <input
        id="joinName"
        maxlength="20"
        placeholder="Bijvoorbeeld Jan"
        autocomplete="off"
      >

      <label>PRIVÉ SPEELKAMER NUMMER</label>
      <input
        id="joinCode"
        maxlength="6"
        placeholder="Bijvoorbeeld OF3855"
        autocomplete="off"
        style="text-transform:uppercase"
      >

      <button class="btn green big-action" onclick="joinRoom()">
        SPEL BINNENGAAN
      </button>
    </div>

  </div>

  <!-- LOBBY -->
  <div id="lobby" class="hidden">

    <div class="card center">

      <h2>🎰 PRIVÉ SPEELKAMER</h2>

      <div class="small">KAMERNUMMER</div>
      <div id="roomCode" class="room-code"></div>

      <button class="btn gold" onclick="copyInvite()">
        🔗 UITNODIGINGS-LINK KOPIËREN
      </button>

      <div id="inviteLink" class="invite"></div>

    </div>

    <div class="card">
      <h2>👥 SPELERS</h2>

      <div id="lobbyPlayers" class="player-list"></div>

      <button
        id="startButton"
        class="btn green big-action"
        onclick="sendAction('start')"
      >
        🎲 START SPEL
      </button>

      <div id="waitingText" class="small center" style="margin-top:8px"></div>
    </div>

  </div>

  <!-- GAME -->
  <div id="game" class="hidden">

    <div class="card">

      <div id="turnText" class="turn"></div>

      <div id="banner" class="banner"></div>

      <div id="targetBox" class="target-box hidden">
        <div id="targetNumber" class="target-number"></div>
        <div id="targetLabel" class="target-label"></div>
      </div>

      <div class="table">

        <div class="tray-title">🎲 DOBBELBAK</div>

        <div id="diceArea" class="dice-area"></div>

      </div>

      <div id="gameControls" class="controls"></div>

    </div>

    <div class="card">
      <h2>👥 SPELERS</h2>
      <div id="gamePlayers" class="player-list"></div>
    </div>

    <div class="card">
      <div class="chat-header">
        <h2 style="margin:0">💬 CHAT</h2>
        <button class="btn" style="width:auto;margin:0;padding:8px 13px" onclick="toggleChat()">
          CHAT
        </button>
      </div>

      <div id="chatBox" class="chat-box">

        <div id="chatMessages" class="chat-messages"></div>

        <div class="chat-input">
          <input
            id="chatInput"
            maxlength="200"
            placeholder="Typ een bericht..."
            onkeydown="if(event.key==='Enter') sendChat()"
          >
          <button class="btn" style="margin:0" onclick="sendChat()">STUUR</button>
        </div>

      </div>
    </div>

    <div id="adminBox" class="card hidden">
      <h2>⚙️ BEHEERDER</h2>
      <button class="btn gold" onclick="sendAction('newGame')">
        🔄 NIEUW SPEL
      </button>
    </div>

  </div>

</div>

<script>
let state = null;
let lastRollSeq = -1;
let firstLoad = true;
let chatOpen = false;

const params = new URLSearchParams(location.search);
const urlRoom = (params.get("room") || "").toUpperCase();

if (urlRoom) {
  document.getElementById("joinCode").value = urlRoom;
}

/* =========================================================
   ERROR
========================================================= */

function showError(message) {
  const box = document.getElementById("error");
  box.textContent = message;
  box.style.display = "block";

  setTimeout(() => {
    box.style.display = "none";
  }, 4000);
}

/* =========================================================
   API
========================================================= */

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

async function createRoom() {
  try {
    const name = document.getElementById("createName").value.trim();

    const data = await api("/api/create", {
      method: "POST",
      body: JSON.stringify({ name })
    });

    history.replaceState({}, "", "/?room=" + data.room.code);

    state = data;
    render();

  } catch (e) {
    showError(e.message);
  }
}

async function joinRoom() {
  try {
    const name = document.getElementById("joinName").value.trim();
    const code = document.getElementById("joinCode").value.trim().toUpperCase();

    const data = await api("/api/join", {
      method: "POST",
      body: JSON.stringify({
        name,
        code
      })
    });

    history.replaceState({}, "", "/?room=" + data.room.code);

    state = data;
    render();

  } catch (e) {
    showError(e.message);
  }
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
    render();

  } catch (e) {
    showError(e.message);
  }
}

async function sendChat() {
  const input = document.getElementById("chatInput");
  const message = input.value.trim();

  if (!message) return;

  input.value = "";

  try {
    await sendAction("chat", { message });
  } catch (e) {
    showError(e.message);
  }
}

/* =========================================================
   RENDER
========================================================= */

function render() {
  if (!state || !state.me) {
    document.getElementById("landing").classList.remove("hidden");
    document.getElementById("lobby").classList.add("hidden");
    document.getElementById("game").classList.add("hidden");
    return;
  }

  document.getElementById("landing").classList.add("hidden");

  if (!state.room.started) {
    document.getElementById("lobby").classList.remove("hidden");
    document.getElementById("game").classList.add("hidden");
    renderLobby();
  } else {
    document.getElementById("lobby").classList.add("hidden");
    document.getElementById("game").classList.remove("hidden");
    renderGame();
  }

  renderChat();
}

function renderLobby() {
  const room = state.room;

  document.getElementById("roomCode").textContent = room.code;

  const link =
    location.origin + "/?room=" + encodeURIComponent(room.code);

  document.getElementById("inviteLink").textContent = link;

  const list = document.getElementById("lobbyPlayers");

  list.innerHTML = state.players.map(p => {
    return \`
      <div class="player">
        <div>
          <div class="player-name">
            \${escapeHtml(p.name)}
          </div>
          <div>
            <span class="badge \${p.isAdmin ? "admin" : ""}">
              \${p.isAdmin ? "BEHEERDER" : "SPELER"}
            </span>
          </div>
        </div>

        <div class="money">
          €\${Number(p.money).toFixed(2)}
        </div>
      </div>
    \`;
  }).join("");

  const start = document.getElementById("startButton");

  start.disabled =
    !state.me.isAdmin ||
    state.players.filter(p => p.active).length < 2;

  const count =
    state.players.filter(p => p.active).length;

  document.getElementById("waitingText").textContent =
    count < 2
      ? "Wacht op minimaal één andere speler..."
      : "Er zijn genoeg spelers. De beheerder kan het spel starten.";
}

function renderGame() {
  const room = state.room;

  const current =
    state.players.find(p => p.id === room.currentPlayerId);

  document.getElementById("turnText").textContent =
    current
      ? "Aan de beurt: " + current.name
      : "";

  document.getElementById("banner").textContent =
    room.banner || "";

  renderPlayers();
  renderDice();
  renderControls();
  renderTarget();

  const adminBox = document.getElementById("adminBox");

  if (state.me.isAdmin) {
    adminBox.classList.remove("hidden");
  } else {
    adminBox.classList.add("hidden");
  }
}

function renderPlayers() {
  const list = document.getElementById("gamePlayers");

  list.innerHTML = state.players.map(p => {
    const current =
      p.id === state.room.currentPlayerId;

    return \`
      <div class="player" style="\${current ? "outline:2px solid #ffd45a" : ""}">
        <div>
          <div class="player-name">
            \${current ? "🎲 " : ""}
            \${escapeHtml(p.name)}
          </div>

          <div>
            <span class="badge \${p.isAdmin ? "admin" : ""}">
              \${p.isAdmin ? "BEHEERDER" : "SPELER"}
            </span>

            \${current
              ? '<span class="badge">AAN DE BEURT</span>'
              : ""}
          </div>
        </div>

        <div style="text-align:right">
          <div class="money">
            €\${Number(p.money).toFixed(2)}
          </div>

          \${state.me.isAdmin && !p.isAdmin
            ? \`
              <button
                class="btn red"
                style="width:auto;padding:5px 8px;margin-top:4px;font-size:10px"
                onclick="removePlayer('\${p.id}')"
              >
                VERWIJDER
              </button>
            \`
            : ""}
        </div>
      </div>
    \`;
  }).join("");
}

function removePlayer(id) {
  if (confirm("Deze speler uit de kamer verwijderen?")) {
    sendAction("removePlayer", { playerId: id });
  }
}

function renderDice() {
  const area = document.getElementById("diceArea");
  const room = state.room;

  area.innerHTML = room.dice.map((value, index) => {

    const isHeld =
      room.phase === "main"
        ? room.held[index]
        : room.settled[index];

    const canClick =
      room.phase === "main" &&
      state.me.id === room.currentPlayerId &&
      room.hasRolled &&
      !room.held[index];

    return \`
      <div
        class="die \${isHeld ? "held vast" : ""} \${room.settled[index] ? "settled" : ""} \${canClick ? "clickable" : ""}"
        data-index="\${index}"
        onclick="\${canClick ? "holdDie(" + index + ")" : ""}"
      >
        \${pips(value)}
      </div>
    \`;
  }).join("");

  if (!firstLoad && lastRollSeq !== room.rollSeq) {
    animateLooseDice();
  }

  lastRollSeq = room.rollSeq;
  firstLoad = false;
}

function pips(n) {
  const positions = {
    1: ["mc"],
    2: ["tl", "br"],
    3: ["tl", "mc", "br"],
    4: ["tl", "tr", "bl", "br"],
    5: ["tl", "tr", "mc", "bl", "br"],
    6: ["tl", "tr", "ml", "mr", "bl", "br"]
  };

  return positions[n]
    .map(pos => '<span class="pip ' + pos + '"></span>')
    .join("");
}

function animateLooseDice() {
  const room = state.room;

  document.querySelectorAll(".die").forEach((el, index) => {
    const fixed =
      room.phase === "round"
        ? room.settled[index]
        : room.held[index];

    if (!fixed) {
      el.classList.add("rolling");

      setTimeout(() => {
        el.classList.remove("rolling");
      }, 600);
    }
  });

  playRollSound();
}

function holdDie(index) {
  sendAction("hold", { index });
  playHoldSound();
}

function renderTarget() {
  const box = document.getElementById("targetBox");
  const room = state.room;

  if (room.phase !== "round" || !room.target) {
    box.classList.add("hidden");
    return;
  }

  box.classList.remove("hidden");

  document.getElementById("targetNumber").textContent =
    room.target;

  document.getElementById("targetLabel").textContent =
    room.mode === "earn"
      ? "DOELSTEEN — VERDIENEN"
      : "DOELSTEEN — BETALEN";
}

function renderControls() {
  const el = document.getElementById("gameControls");
  const room = state.room;

  const myTurn =
    state.me.id === room.currentPlayerId;

  if (!myTurn) {
    el.innerHTML =
      '<div class="status-box">Wacht op de worp van de andere speler.</div>';
    return;
  }

  /* BEGIN WORP */
  if (room.phase === "main" && !room.hasRolled) {
    el.innerHTML = \`
      <button
        class="btn gold big-action"
        onclick="sendAction('beginTurn'); playRollSound()"
      >
        🎲 BEGIN WORP
      </button>
    \`;

    return;
  }

  /* MAIN */
  if (room.phase === "main") {

    const allHeld =
      room.held.every(Boolean);

    el.innerHTML = \`
      <div class="control-row">

        <button
          class="btn orange"
          onclick="sendAction('reroll'); playRollSound()"
          \${room.mustHold || allHeld ? "disabled" : ""}
        >
          🎲 OPNIEUW GOOIEN
        </button>

        <button
          class="btn"
          style="background:#163b75;box-shadow:0 5px 0 #0a2146"
          onclick="sendAction('accept'); playAcceptSound()"
        >
          ✓ AKKOORD
        </button>

      </div>

      <div class="status-box">
        \${room.mustHold
          ? "👉 Houd minimaal 1 nieuwe dobbelsteen vast voordat je opnieuw gooit."
          : allHeld
            ? "Alle dobbelstenen staan vast. Druk AKKOORD."
            : "Je mag opnieuw gooien of AKKOORD kiezen."}
      </div>
    \`;

    return;
  }

  /* VERDIENEN / BETALEN */
  if (room.phase === "round") {

    const title =
      room.mode === "earn"
        ? "💰 GOoi VOOR VERDIENEN"
        : "💸 GOOI VOOR BETALEN";

    el.innerHTML = \`
      <button
        class="btn \${room.mode === "earn" ? "green" : "orange"} big-action"
        onclick="sendAction('roundRoll'); playRollSound()"
      >
        \${title}
      </button>

      <div class="status-box">
        Doelsteen: <strong>\${room.target}'en</strong><br>
        \${room.needFreshRoll
          ? "VOLLE BAK! De volgende worp is een nieuwe set van 5."
          : "Doelstenen worden automatisch vastgezet."}
      </div>
    \`;

    return;
  }
}

/* =========================================================
   CHAT
========================================================= */

function toggleChat() {
  chatOpen = !chatOpen;

  const box = document.getElementById("chatBox");

  if (chatOpen) {
    box.classList.add("open");
  } else {
    box.classList.remove("open");
  }
}

function renderChat() {
  const box = document.getElementById("chatMessages");

  box.innerHTML = state.chat.map(m => \`
    <div class="chat-message">
      <strong>\${escapeHtml(m.player)}</strong>
      <span class="chat-time">\${escapeHtml(m.time)}</span><br>
      \${escapeHtml(m.message)}
    </div>
  \`).join("");

  box.scrollTop = box.scrollHeight;
}

/* =========================================================
   INVITE
========================================================= */

async function copyInvite() {
  const link =
    location.origin + "/?room=" + state.room.code;

  try {
    await navigator.clipboard.writeText(link);

    const button = event.target;
    const old = button.textContent;

    button.textContent = "✓ LINK GEKOPIEERD";

    setTimeout(() => {
      button.textContent = old;
    }, 1800);

  } catch {
    prompt("Kopieer deze uitnodigingslink:", link);
  }
}

/* =========================================================
   SOUND
========================================================= */

let audioCtx = null;

function audio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;

    if (!AC) return null;

    audioCtx = new AC();
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  return audioCtx;
}

function beep(freq, duration, type = "sine", volume = .06) {
  const ctx = audio();

  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.value = freq;

  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(
    .001,
    ctx.currentTime + duration
  );

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + duration);
}

function playRollSound() {
  beep(90, .08, "square", .045);

  setTimeout(() => beep(130, .08, "square", .035), 70);
  setTimeout(() => beep(180, .1, "square", .025), 140);
}

function playHoldSound() {
  beep(420, .08, "triangle", .07);
  setTimeout(() => beep(620, .1, "triangle", .05), 70);
}

function playAcceptSound() {
  beep(500, .1, "triangle", .06);
  setTimeout(() => beep(800, .15, "triangle", .05), 90);
}

/* =========================================================
   POLLING
========================================================= */

async function poll() {
  try {
    const data = await api("/api/state");

    if (data && data.me) {
      state = data;
      render();
    }

  } catch (e) {
    /*
      Als de gebruiker nog niet is ingelogd is dit normaal.
    */
  }
}

setInterval(poll, 800);

poll();

/* =========================================================
   UTILS
========================================================= */

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
</script>

</body>
</html>`;

/* =========================================================
   HTTP SERVER
========================================================= */

const server = http.createServer(async (req, res) => {

  try {

    /*
      Health check voor Render
    */
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, {
        "Content-Type": "application/json"
      });

      res.end(JSON.stringify({
        ok: true
      }));

      return;
    }

    /*
      Frontend
    */
    if (req.method === "GET" && req.url.split("?")[0] === "/") {

      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache"
      });

      res.end(HTML);
      return;
    }

    /*
      API state
    */
    if (req.method === "GET" && req.url === "/api/state") {

      const session = getSession(req);

      if (!session) {
        res.writeHead(401, {
          "Content-Type": "application/json"
        });

        res.end(JSON.stringify({
          error: "Geen sessie"
        }));

        return;
      }

      const room = rooms.get(session.roomCode);

      if (!room) {
        res.writeHead(404, {
          "Content-Type": "application/json"
        });

        res.end(JSON.stringify({
          error: "Kamer bestaat niet meer."
        }));

        return;
      }

      const player = getPlayer(room, session);

      if (!player) {
        res.writeHead(401, {
          "Content-Type": "application/json"
        });

        res.end(JSON.stringify({
          error: "Speler niet gevonden."
        }));

        return;
      }

      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache"
      });

      res.end(
        JSON.stringify(
          publicState(room, player)
        )
      );

      return;
    }

    /*
      JSON body uitlezen
    */
    async function readBody() {
      return new Promise((resolve, reject) => {

        let data = "";

        req.on("data", chunk => {
          data += chunk;

          if (data.length > 1000000) {
            reject(new Error("Request te groot."));
            req.destroy();
          }
        });

        req.on("end", () => {
          try {
            resolve(data ? JSON.parse(data) : {});
          } catch {
            reject(new Error("Ongeldige JSON."));
          }
        });

        req.on("error", reject);
      });
    }

    /*
      KAMER MAKEN
    */
    if (req.method === "POST" && req.url === "/api/create") {

      const body = await readBody();
      const name = cleanName(body.name);

      const room = newRoom(name);
      const host = room.players[0];

      const sid = createSession(
        room.code,
        host.id
      );

      setCookie(res, sid);

      res.writeHead(200, {
        "Content-Type": "application/json"
      });

      res.end(
        JSON.stringify(
          publicState(room, host)
        )
      );

      return;
    }

    /*
      MEEDOEN MET KAMER
    */
    if (req.method === "POST" && req.url === "/api/join") {

      const body = await readBody();

      const name = cleanName(body.name);
      const code = cleanCode(body.code);

      if (!code || code.length !== 6) {
        throw new Error("Vul een geldig kamernummer van 6 tekens in.");
      }

      const room = rooms.get(code);

      if (!room) {
        throw new Error("Deze speelkamer bestaat niet.");
      }

      if (room.started) {
        throw new Error("Het spel is al gestart.");
      }

      if (room.players.filter(p => p.active).length >= 4) {
        throw new Error("Deze kamer zit al vol.");
      }

      const duplicate = room.players.find(
        p =>
          p.active &&
          p.name.toLowerCase() === name.toLowerCase()
      );

      if (duplicate) {
        throw new Error("Deze speelnaam wordt al gebruikt.");
      }

      const player = {
        id: crypto.randomUUID(),
        name,
        money: 0,
        active: true
      };

      room.players.push(player);

      addLog(
        room,
        `${name} is de kamer binnengekomen.`
      );

      bump(room);

      const sid = createSession(
        room.code,
        player.id
      );

      setCookie(res, sid);

      res.writeHead(200, {
        "Content-Type": "application/json"
      });

      res.end(
        JSON.stringify(
          publicState(room, player)
        )
      );

      return;
    }

    /*
      GAME ACTION
    */
    if (req.method === "POST" && req.url === "/api/action") {

      const session = getSession(req);

      if (!session) {
        throw new Error("Geen sessie.");
      }

      const room = rooms.get(session.roomCode);

      if (!room) {
        throw new Error("Kamer bestaat niet meer.");
      }

      const player = getPlayer(room, session);

      if (!player) {
        throw new Error("Speler niet gevonden.");
      }

      const body = await readBody();

      performAction(
        room,
        player,
        body
      );

      res.writeHead(200, {
        "Content-Type": "application/json"
      });

      res.end(
        JSON.stringify(
          publicState(room, player)
        )
      );

      return;
    }

    res.writeHead(404, {
      "Content-Type": "application/json"
    });

    res.end(
      JSON.stringify({
        error: "Niet gevonden."
      })
    );

  } catch (err) {

    console.error(err);

    res.writeHead(400, {
      "Content-Type": "application/json"
    });

    res.end(
      JSON.stringify({
        error: err.message || "Er ging iets mis."
      })
    );
  }
});

server.listen(PORT, () => {
  console.log(`Dobbelen 11/24 draait op poort ${PORT}`);
});
