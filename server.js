const http = require("http");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;

const rooms = new Map();
const sessions = new Map();

function makeCode() {
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

function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
}

function rollFive() {
  return [rollDie(), rollDie(), rollDie(), rollDie(), rollDie()];
}

function cleanName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ");

  if (!name) {
    throw new Error("Vul een speelnaam in.");
  }

  if (name.length > 20) {
    throw new Error("Je speelnaam mag maximaal 20 tekens zijn.");
  }

  return name;
}

function cleanCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function addLog(room, text) {
  room.log.unshift({
    text: text,
    time: new Date().toLocaleTimeString("nl-NL", {
      hour: "2-digit",
      minute: "2-digit"
    })
  });

  room.log = room.log.slice(0, 30);
}

function activePlayers(room) {
  return room.players.filter(function (p) {
    return p.active;
  });
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
    const index = (room.current + i) % room.players.length;

    if (room.players[index].active) {
      room.current = index;
      return room.players[index];
    }
  }

  return null;
}

function nextPlayer(room) {
  for (let i = 1; i <= room.players.length; i++) {
    const index =
      (room.current + i) % room.players.length;

    if (room.players[index] && room.players[index].active) {
      room.current = index;
      return room.players[index];
    }
  }

  return currentPlayer(room);
}

function playerIndex(room, playerId) {
  return room.players.findIndex(function (p) {
    return p.id === playerId;
  });
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

  room.target = null;
  room.mode = null;

  room.needFreshRoll = false;

  room.rollSeq++;
}

function createRoom(name) {
  const room = {
    code: makeCode(),

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
    id: crypto.randomUUID(),
    name: name,
    money: 0,
    active: true
  };

  room.players.push(player);
  room.admin = player.id;

  rooms.set(room.code, room);

  addLog(
    room,
    name + " heeft de kamer gemaakt."
  );

  return room;
}

function createSession(roomCode, playerId) {
  const sid = crypto.randomBytes(24).toString("hex");

  sessions.set(sid, {
    roomCode: roomCode,
    playerId: playerId
  });

  return sid;
}

function getSession(req) {
  const cookie = req.headers.cookie || "";

  const match = cookie.match(
    /(?:^|;\s*)sid=([^;]+)/
  );

  if (!match) return null;

  return sessions.get(match[1]) || null;
}

function setSessionCookie(res, sid) {
  res.setHeader(
    "Set-Cookie",
    "sid=" + sid + "; HttpOnly; Path=/; SameSite=Lax"
  );
}

function getRoomAndPlayer(req) {
  const session = getSession(req);

  if (!session) return null;

  const room = rooms.get(session.roomCode);

  if (!room) return null;

  const player = room.players.find(function (p) {
    return p.id === session.playerId;
  });

  if (!player) return null;

  return {
    room: room,
    player: player
  };
}

function bump(room) {
  room.version++;
}

/* =========================================================
   GAME
========================================================= */

function startGame(room) {
  if (activePlayers(room).length < 2) {
    throw new Error(
      "Er moeten minimaal 2 spelers zijn."
    );
  }

  room.started = true;

  room.current = room.players.findIndex(
    function (p) {
      return p.active;
    }
  );

  resetTurn(room);

  const player = currentPlayer(room);

  room.banner =
    player.name +
    " is aan de beurt. Druk op BEGIN WORP.";

  addLog(
    room,
    "Het spel is gestart. " +
    player.name +
    " begint."
  );

  bump(room);
}

function beginTurn(room) {
  if (room.phase !== "main") {
    throw new Error(
      "Je kunt nu geen beginworp doen."
    );
  }

  if (room.hasRolled) {
    throw new Error(
      "Je hebt deze beurt al gegooid."
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

  room.rollSeq++;

  const player = currentPlayer(room);

  room.banner =
    player.name +
    " heeft gegooid. Houd minimaal 1 nieuwe dobbelsteen vast.";

  addLog(
    room,
    player.name +
    " gooide " +
    room.dice.join(" - ") +
    "."
  );

  bump(room);
}

function holdDie(room, index) {
  if (room.phase !== "main") {
    throw new Error(
      "Je kunt nu geen dobbelsteen vasthouden."
    );
  }

  if (!room.hasRolled) {
    throw new Error(
      "Doe eerst de beginworp."
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

  room.mustHold = false;

  room.banner =
    currentPlayer(room).name +
    " heeft een dobbelsteen vastgezet.";

  bump(room);
}

function reroll(room) {
  if (room.phase !== "main") {
    throw new Error(
      "Je kunt nu niet opnieuw gooien."
    );
  }

  if (!room.hasRolled) {
    throw new Error(
      "Doe eerst de beginworp."
    );
  }

  if (room.mustHold) {
    throw new Error(
      "Houd eerst minimaal 1 nieuwe dobbelsteen vast."
    );
  }

  let loose = [];

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

  loose.forEach(function (index) {
    room.dice[index] = rollDie();
  });

  room.mustHold = true;

  room.rollSeq++;

  room.banner =
    currentPlayer(room).name +
    " heeft opnieuw gegooid. Houd minimaal 1 nieuwe dobbelsteen vast.";

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
    function (sum, value) {
      return sum + value;
    },
    0
  );
}

function getTarget(total) {
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

  return {
    target: target,
    mode:
      total >= 18 && total <= 23
        ? "pay"
        : "earn"
  };
}

function transferMoney(
  room,
  player,
  amount,
  mode
) {
  const opponents =
    activePlayers(room).filter(function (p) {
      return p.id !== player.id;
    });

  opponents.forEach(function (opponent) {
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

  const player = currentPlayer(room);

  if (player) {
    room.banner =
      player.name +
      " is aan de beurt. Druk op BEGIN WORP.";

    addLog(
      room,
      player.name +
      " is nu aan de beurt."
    );
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

  const player = currentPlayer(room);
  const total = diceTotal(room);

  /*
    11 en 24
  */

  if (total === 11 || total === 24) {
    const opponents =
      activePlayers(room).filter(
        function (p) {
          return p.id !== player.id;
        }
      );

    opponents.forEach(function (opponent) {
      opponent.money -= 0.50;
      player.money += 0.50;
    });

    room.banner =
      player.name +
      " gooide " +
      total +
      "! €0,50 van iedere tegenstander.";

    addLog(
      room,
      player.name +
      " gooide " +
      total +
      "."
    );

    finishTurn(room);
    return;
  }

  /*
    Volle bak
  */

  const counts = {};

  room.dice.forEach(function (value) {
    counts[value] =
      (counts[value] || 0) + 1;
  });

  const values = Object.keys(counts);

  if (
    values.length === 1 &&
    counts[values[0]] === 5
  ) {
    room.phase = "round";
    room.target = 6;
    room.mode = "earn";

    room.settled = [
      true,
      true,
      true,
      true,
      true
    ];

    room.held = [
      true,
      true,
      true,
      true,
      true
    ];

    transferMoney(
      room,
      player,
      25,
      "earn"
    );

    room.needFreshRoll = true;

    room.banner =
      "VOLLE BAK! 5 × " +
      room.dice[0] +
      " — €25 verdiend. Nieuwe 5 dobbelstenen!";

    addLog(
      room,
      player.name +
      " gooide VOLLE BAK en verdiende €25."
    );

    bump(room);
    return;
  }

  const targetInfo =
    getTarget(total);

  room.phase = "round";

  room.target =
    targetInfo.target;

  room.mode =
    targetInfo.mode;

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

  room.banner =
    (
      targetInfo.mode === "earn"
        ? "VERDIENEN"
        : "BETALEN"
    ) +
    ": " +
    targetInfo.target +
    "'en.";

  addLog(
    room,
    player.name +
    " accepteerde totaal " +
    total +
    ". Doelsteen: " +
    targetInfo.target +
    "."
  );

  resolveRound(room);
}

function resolveRound(room) {
  if (room.phase !== "round") {
    return;
  }

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

  if (hits === 0) {
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

  const amount = hits * 5;

  transferMoney(
    room,
    player,
    amount,
    room.mode
  );

  room.banner =
    (
      room.mode === "earn"
        ? "VERDIEND"
        : "BETAALD"
    ) +
    ": €" +
    amount +
    " (" +
    hits +
    " × €5).";

  addLog(
    room,
    player.name +
    ": " +
    hits +
    "× " +
    room.target +
    ", €" +
    amount +
    "."
  );

  if (
    room.settled.every(function (x) {
      return x;
    })
  ) {
    room.needFreshRoll = true;

    room.banner =
      "VOLLE BAK! Nieuwe 5 dobbelstenen bij de volgende worp.";

    addLog(
      room,
      player.name +
      " had een VOLLE BAK."
    );
  }

  room.hasRolled = true;
  room.mustHold = false;

  bump(room);
}

function roundRoll(room) {
  if (room.phase !== "round") {
    throw new Error(
      "Je bent niet in de verdien/betaalfase."
    );
  }

  /*
    VOLLE BAK:
    volledig nieuwe set van 5.
  */

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

    addLog(
      room,
      currentPlayer(room).name +
      " kreeg een nieuwe set van 5: " +
      room.dice.join(" - ") +
      "."
    );

    resolveRound(room);

    return;
  }

  let loose = [];

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

  loose.forEach(function (index) {
    room.dice[index] = rollDie();
  });

  room.rollSeq++;

  addLog(
    room,
    currentPlayer(room).name +
    " gooide: " +
    room.dice.join(" - ") +
    "."
  );

  resolveRound(room);
}

function newGame(room) {
  if (!room.started) {
    throw new Error(
      "Het spel is nog niet gestart."
    );
  }

  room.players.forEach(function (p) {
    p.money = 0;
    p.active = true;
  });

  room.current =
    room.players.findIndex(function (p) {
      return p.id === room.admin;
    });

  resetTurn(room);

  room.banner =
    currentPlayer(room).name +
    " begint een nieuw spel. Druk op BEGIN WORP.";

  addLog(
    room,
    "Nieuw spel gestart."
  );

  bump(room);
}

/* =========================================================
   STATE
========================================================= */

function publicState(room, me) {
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
        current ? current.id : null,

      dice: room.dice,
      held: room.held,
      settled: room.settled,

      hasRolled: room.hasRolled,
      mustHold: room.mustHold,

      target: room.target,
      mode: room.mode,
      needFreshRoll:
        room.needFreshRoll,

      version: room.version,
      rollSeq: room.rollSeq
    },

    me: {
      id: me.id,
      name: me.name,
      money: me.money,
      isAdmin:
        me.id === room.admin
    },

    players: room.players.map(
      function (p) {
        return {
          id: p.id,
          name: p.name,
          money: p.money,
          active: p.active,
          isAdmin:
            p.id === room.admin
        };
      }
    ),

    log: room.log,
    chat: room.chat
  };
}

/* =========================================================
   ACTIONS
========================================================= */

function doAction(room, player, body) {
  const action = body.action;

  const index =
    playerIndex(room, player.id);

  /*
    ADMIN
  */

  if (action === "start") {
    if (player.id !== room.admin) {
      throw new Error(
        "Alleen de beheerder kan starten."
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
      room.players.find(function (p) {
        return p.id ===
          String(body.playerId || "");
      });

    if (!target || target.id === room.admin) {
      throw new Error(
        "Speler kan niet worden verwijderd."
      );
    }

    target.active = false;

    addLog(
      room,
      target.name +
      " is uit het spel gehaald."
    );

    bump(room);
    return;
  }

  /*
    CHAT
  */

  if (action === "chat") {
    const message =
      String(body.message || "")
        .trim();

    if (!message) return;

    if (message.length > 200) {
      throw new Error(
        "Bericht is te lang."
      );
    }

    room.chat.push({
      player: player.name,
      message: message,
      time:
        new Date().toLocaleTimeString(
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

  /*
    BEURT
  */

  if (room.current !== index) {
    throw new Error(
      "Het is niet jouw beurt."
    );
  }

  if (action === "beginTurn") {
    beginTurn(room);
    return;
  }

  if (action === "hold") {
    holdDie(
      room,
      Number(body.index)
    );
    return;
  }

  if (action === "reroll") {
    reroll(room);
    return;
  }

  if (action === "accept") {
    accept(room);
    return;
  }

  if (action === "roundRoll") {
    roundRoll(room);
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
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>Dobbelen 11/24</title>

<style>

* {
  box-sizing:border-box;
}

body {
  margin:0;
  min-height:100vh;
  background:
    radial-gradient(circle at top,#172b52,#061022 60%,#020711);
  color:white;
  font-family:Arial,sans-serif;
}

.app {
  width:min(900px,100%);
  margin:auto;
  padding:10px;
}

.top {
  text-align:center;
  padding:10px;
}

.logo {
  font-size:clamp(28px,7vw,46px);
  font-weight:900;
  color:#ffd45b;
  text-shadow:0 3px #805200;
}

.sub {
  color:#b9c8e5;
}

.card {
  background:
    linear-gradient(145deg,#192c50,#08152d);
  border:1px solid #30466b;
  border-radius:18px;
  padding:16px;
  margin-bottom:12px;
  box-shadow:0 12px 35px #0006;
}

h2 {
  margin:0 0 12px;
}

label {
  display:block;
  color:#c1cde2;
  font-size:13px;
  font-weight:800;
  margin:10px 0 5px;
}

input {
  width:100%;
  padding:14px;
  border-radius:12px;
  border:1px solid #40577f;
  background:#07132a;
  color:white;
  font-size:17px;
  outline:0;
}

input:focus {
  border-color:#ffd45b;
}

button {
  font:inherit;
}

.btn {
  width:100%;
  padding:14px;
  border:0;
  border-radius:12px;
  margin-top:9px;
  font-weight:900;
  font-size:15px;
  background:#2457a7;
  color:white;
  box-shadow:0 5px #112f60;
  cursor:pointer;
}

.btn:disabled {
  opacity:.35;
}

.gold {
  background:
    linear-gradient(#ffda69,#dda014);
  color:#201500;
  box-shadow:0 5px #895b00;
}

.green {
  background:
    linear-gradient(#37d17b,#139a4e);
  box-shadow:0 5px #086435;
}

.orange {
  background:
    linear-gradient(#ffb44b,#e36d0b);
  box-shadow:0 5px #843800;
}

.red {
  background:#b92e35;
  box-shadow:0 5px #6b151a;
}

.code {
  text-align:center;
  font-size:38px;
  letter-spacing:6px;
  color:#ffd55f;
  font-weight:900;
  margin:7px;
}

.invite {
  background:#07132a;
  border:1px dashed #52698e;
  padding:10px;
  border-radius:10px;
  font-size:12px;
  word-break:break-all;
  color:#b8c8e5;
}

.player {
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:10px;
  background:#ffffff0a;
  border-radius:10px;
  margin:6px 0;
}

.badge {
  font-size:10px;
  background:#2d4368;
  padding:4px 7px;
  border-radius:20px;
}

.admin {
  background:#806017;
  color:#ffe394;
}

.money {
  color:#64ed9b;
  font-weight:900;
}

.banner {
  text-align:center;
  background:#122849;
  border:1px solid #38527d;
  border-radius:12px;
  padding:11px;
  color:#ffdc70;
  font-weight:900;
  margin-bottom:9px;
}

.turn {
  text-align:center;
  color:#bdcbe2;
  font-size:13px;
  margin-bottom:8px;
}

.table {
  background:
    radial-gradient(circle,#197a4e,#075334 65%,#033523);
  border:7px solid #744914;
  border-radius:24px;
  padding:18px 8px;
  box-shadow:
    inset 0 0 30px #0008;
}

.tray {
  text-align:center;
  color:#ffe18b;
  font-weight:900;
  letter-spacing:2px;
  margin-bottom:9px;
}

.dice {
  min-height:180px;
  display:flex;
  justify-content:center;
  align-items:center;
  gap:8px;
  flex-wrap:wrap;
}

.die {
  width:64px;
  height:64px;
  border-radius:15px;
  position:relative;
  background:
    linear-gradient(145deg,#ff4b4b,#bd1010 55%,#6e0505);
  border:3px solid #e8bb4d;
  box-shadow:
    inset -6px -7px 10px #0005,
    inset 4px 4px 8px #fff4,
    0 7px 12px #0009;
}

.click {
  cursor:pointer;
}

.held {
  box-shadow:
    0 0 0 3px #ffd43c55,
    0 0 25px #ffd43c99,
    inset -6px -7px 10px #0005;
}

.pip {
  position:absolute;
  width:12px;
  height:12px;
  border-radius:50%;
  background:white;
  box-shadow:
    inset 1px 1px 2px #0004;
}

.tl {
  left:10px;
  top:10px;
}

.tc {
  left:50%;
  top:10px;
  transform:translateX(-50%);
}

.tr {
  right:10px;
  top:10px;
}

.ml {
  left:10px;
  top:50%;
  transform:translateY(-50%);
}

.mc {
  left:50%;
  top:50%;
  transform:translate(-50%,-50%);
}

.mr {
  right:10px;
  top:50%;
  transform:translateY(-50%);
}

.bl {
  left:10px;
  bottom:10px;
}

.bc {
  left:50%;
  bottom:10px;
  transform:translateX(-50%);
}

.br {
  right:10px;
  bottom:10px;
}

.roll {
  animation:tumble .55s ease;
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
  text-align:center;
  padding:12px;
  background:#0b1933;
  border:1px solid #435b83;
  border-radius:12px;
  margin-bottom:10px;
}

.target b {
  font-size:34px;
  color:#ffe17b;
}

.status {
  text-align:center;
  color:#b7c7e0;
  background:#0002;
  padding:11px;
  border-radius:11px;
  margin-top:9px;
}

.row {
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:8px;
}

.chatbox {
  display:none;
}

.chatbox.open {
  display:block;
}

.messages {
  height:170px;
  overflow:auto;
  background:#061126;
  padding:8px;
  border-radius:10px;
}

.msg {
  font-size:13px;
  margin-bottom:7px;
}

.msg b {
  color:#ffd66b;
}

.small {
  font-size:12px;
  color:#91a4c4;
}

.center {
  text-align:center;
}

.error {
  display:none;
  background:#551d25;
  border:1px solid #a54550;
  color:#ffb3ba;
  padding:10px;
  border-radius:10px;
  margin-bottom:10px;
}

.hidden {
  display:none !important;
}

@media(max-width:560px) {

  .die {
    width:57px;
    height:57px;
  }

  .pip {
    width:10px;
    height:10px;
  }

  .tl {
    left:9px;
    top:9px;
  }

  .tc {
    top:9px;
  }

  .tr {
    right:9px;
    top:9px;
  }

  .ml {
    left:9px;
  }

  .mr {
    right:9px;
  }

  .bl {
    left:9px;
    bottom:9px;
  }

  .bc {
    bottom:9px;
  }

  .br {
    right:9px;
    bottom:9px;
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

<div id="error" class="error"></div>

<!-- ======================================================
     STARTSCHERM
====================================================== -->

<div id="landing">

  <div class="card">

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

    <h2>
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

<!-- ======================================================
     LOBBY
====================================================== -->

<div id="lobby" class="hidden">

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

<!-- ======================================================
     GAME
====================================================== -->

<div id="game" class="hidden">

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
          placeholder="Typ een bericht..."
          maxlength="200"
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

/* ======================================================
   ROOM UIT URL
====================================================== */

var urlParams =
  new URLSearchParams(
    location.search
  );

var urlRoom =
  urlParams.get("room") || "";

if (urlRoom) {
  document.getElementById(
    "joinCode"
  ).value =
    urlRoom.toUpperCase();
}

/* ======================================================
   HELPERS
====================================================== */

function escapeHtml(value) {

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

  box.textContent = message;
  box.style.display = "block";

  setTimeout(function() {
    box.style.display = "none";
  }, 4500);
}

/* ======================================================
   API
====================================================== */

async function api(url, options) {

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

/* ======================================================
   KAMER MAKEN
====================================================== */

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

          body:JSON.stringify({
            name:name
          })
        }
      );

    state = data;

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

/* ======================================================
   MEEDOEN
====================================================== */

async function joinRoom() {

  try {

    var name =
      document
        .getElementById(
          "joinName"
        )
        .value
        .trim();

    var code =
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

    if (code.length !== 6) {
      showError(
        "Vul het kamernummer van 6 tekens in."
      );
      return;
    }

    var data =
      await api(
        "/api/join",
        {
          method:"POST",

          body:JSON.stringify({
            name:name,
            code:code
          })
        }
      );

    state = data;

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

/* ======================================================
   ACTIE
====================================================== */

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

    state = data;

    render();

  } catch (error) {

    showError(
      error.message
    );
  }
}

/* ======================================================
   RENDER
====================================================== */

function render() {

  if (
    !state ||
    !state.me
  ) {

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

    return;
  }

  document
    .getElementById("landing")
    .classList
    .add("hidden");

  if (!state.room.started) {

    document
      .getElementById("lobby")
      .classList
      .remove("hidden");

    document
      .getElementById("game")
      .classList
      .add("hidden");

    renderLobby();

  } else {

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

  renderChat();
}

/* ======================================================
   LOBBY
====================================================== */

function renderLobby() {

  var room =
    state.room;

  document
    .getElementById(
      "roomCode"
    )
    .textContent =
      room.code;

  var link =
    location.origin +
    "/?room=" +
    room.code;

  document
    .getElementById(
      "invite"
    )
    .textContent =
      link;

  var html = "";

  state.players.forEach(
    function(player) {

      html +=
        '<div class="player">' +

          '<div>' +

            '<b>' +
            escapeHtml(
              player.name
            ) +
            '</b><br>' +

            '<span class="badge ' +
            (
              player.isAdmin
                ? "admin"
                : ""
            ) +
            '">' +

            (
              player.isAdmin
                ? "BEHEERDER"
                : "SPELER"
            ) +

            '</span>' +

          '</div>' +

          '<div class="money">' +
          "€" +
          Number(
            player.money
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
      function(player) {
        return player.active;
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

/* ======================================================
   GAME
====================================================== */

function renderGame() {

  var room =
    state.room;

  var player =
    state.players.find(
      function(p) {
        return p.id ===
          room.currentPlayerId;
      }
    );

  document
    .getElementById(
      "turn"
    )
    .textContent =
      player
        ? "Aan de beurt: " +
          player.name
        : "";

  document
    .getElementById(
      "banner"
    )
    .textContent =
      room.banner;

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

/* ======================================================
   SPELERS
====================================================== */

function renderPlayers() {

  var html = "";

  state.players.forEach(
    function(player) {

      var current =
        player.id ===
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

            escapeHtml(
              player.name
            ) +

            '</b><br>' +

            '<span class="badge ' +
            (
              player.isAdmin
                ? "admin"
                : ""
            ) +
            '">' +

            (
              player.isAdmin
                ? "BEHEERDER"
                : "SPELER"
            ) +

            '</span>' +

          '</div>' +

          '<div>' +

            '<div class="money">' +
            "€" +
            Number(
              player.money
            ).toFixed(2) +
            '</div>' +

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

/* ======================================================
   DOBBELSTENEN
====================================================== */

function pipHtml(number) {

  var positions = {

    1:["mc"],

    2:[
      "tl",
      "br"
    ],

    3:[
      "tl",
      "mc",
      "br"
    ],

    4:[
      "tl",
      "tr",
      "bl",
      "br"
    ],

    5:[
      "tl",
      "tr",
      "mc",
      "bl",
      "br"
    ],

    6:[
      "tl",
      "tr",
      "ml",
      "mr",
      "bl",
      "br"
    ]
  };

  var html = "";

  positions[number]
    .forEach(
      function(position) {

        html +=
          '<span class="pip ' +
          position +
          '"></span>';
      }
    );

  return html;
}

function renderDice() {

  var room =
    state.room;

  var html = "";

  for (
    var i = 0;
    i < 5;
    i++
  ) {

    var fixed =
      room.phase === "round"
        ? room.settled[i]
        : room.held[i];

    var clickable =
      room.phase === "main" &&
      state.me.id ===
        room.currentPlayerId &&
      room.hasRolled &&
      !room.held[i];

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

      pipHtml(
        room.dice[i]
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
      room.rollSeq
  ) {

    var dice =
      document.querySelectorAll(
        ".die"
      );

    dice.forEach(
      function(element,index) {

        var fixed =
          room.phase === "round"
            ? room.settled[index]
            : room.held[index];

        if (!fixed) {

          element
            .classList
            .add("roll");

          setTimeout(
            function() {
              element
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
    room.rollSeq;

  firstLoad = false;
}

/* ======================================================
   DOELSTEEN
====================================================== */

function renderTarget() {

  var box =
    document.getElementById(
      "target"
    );

  var room =
    state.room;

  if (
    room.phase !==
      "round"
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
    room.target +
    "</b><br>" +

    "<span>" +

    (
      room.mode === "earn"
        ? "DOELSTEEN — VERDIENEN"
        : "DOELSTEEN — BETALEN"
    ) +

    "</span>";
}

/* ======================================================
   KNOPPEN
====================================================== */

function renderControls() {

  var box =
    document.getElementById(
      "controls"
    );

  var room =
    state.room;

  var myTurn =
    state.me.id ===
    room.currentPlayerId;

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
    room.phase === "main" &&
    !room.hasRolled
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
    NORMALE FASE
  */

  if (
    room.phase === "main"
  ) {

    var allHeld =
      room.held.every(
        function(value) {
          return value;
        }
      );

    box.innerHTML =
      '<div class="row">' +

        '<button ' +
        'class="btn orange" ' +
        'onclick="sendAction(\'reroll\');soundRoll()" ' +
        (
          room.mustHold ||
          allHeld
            ? "disabled"
            : ""
        ) +
        '>' +

        '🎲 OPNIEUW GOOIEN' +

        '</button>' +

        '<button ' +
        'class="btn" ' +
        'style="background:#163d79" ' +
        'onclick="sendAction(\'accept\');soundAccept()">' +

        '✓ AKKOORD' +

        '</button>' +

      '</div>' +

      '<div class="status">' +

      (
        room.mustHold
          ? "👉 Houd minimaal 1 nieuwe dobbelsteen vast."
          : allHeld
            ? "Alle dobbelstenen staan vast. Druk AKKOORD."
            : "Je mag opnieuw gooien of AKKOORD kiezen."
      ) +

      '</div>';

    return;
  }

  /*
    VERDIENEN / BETALEN
  */

  if (
    room.phase === "round"
  ) {

    var title =
      room.mode === "earn"
        ? "💰 GOOI VOOR VERDIENEN"
        : "💸 GOOI VOOR BETALEN";

    box.innerHTML =
      '<button class="btn ' +
      (
        room.mode === "earn"
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
      room.target +
      "'en</b><br>" +

      (
        room.needFreshRoll
          ? "VOLLE BAK! De volgende worp is een nieuwe set van 5."
          : "Doelstenen worden automatisch vastgezet."
      ) +

      '</div>';
  }
}

/* ======================================================
   CHAT
====================================================== */

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
    function(message) {

      html +=
        '<div class="msg">' +

        '<b>' +
        escapeHtml(
          message.player
        ) +
        '</b> ' +

        '<span class="small">' +
        escapeHtml(
          message.time
        ) +
        '</span><br>' +

        escapeHtml(
          message.message
        ) +

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

  if (!message) {
    return;
  }

  input.value = "";

  sendAction(
    "chat",
    {
      message:message
    }
  );
}

/* ======================================================
   UITNODIGING
====================================================== */

async function copyInvite() {

  var link =
    location.origin +
    "/?room=" +
    state.room.code;

  try {

    await navigator
      .clipboard
      .writeText(link);

    alert(
      "Uitnodigingslink gekopieerd!"
    );

  } catch (error) {

    prompt(
      "Kopieer deze link:",
      link
    );
  }
}

/* ======================================================
   GELUID
====================================================== */

var audioContext = null;

function getAudio() {

  if (!audioContext) {

    var Audio =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!Audio) {
      return null;
    }

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

  var context =
    getAudio();

  if (!context) {
    return;
  }

  var oscillator =
    context.createOscillator();

  var gain =
    context.createGain();

  oscillator.type =
    type || "sine";

  oscillator.frequency.value =
    frequency;

  gain.gain.setValueAtTime(
    volume || .05,
    context.currentTime
  );

  gain.gain.exponentialRampToValueAtTime(
    .001,
    context.currentTime +
      duration
  );

  oscillator.connect(gain);

  gain.connect(
    context.destination
  );

  oscillator.start();

  oscillator.stop(
    context.currentTime +
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

/* ======================================================
   AUTOMATISCH BIJWERKEN
====================================================== */

async function poll() {

  try {

    var data =
      await api(
        "/api/state"
      );

    if (
      data &&
      data.me
    ) {

      state = data;

      render();
    }

  } catch (error) {

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

          res.writeHead(
            200,
            {
              "Content-Type":
                "application/json"
            }
          );

          res.end(
            JSON.stringify({
              ok:true
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

          res.end(
            HTML
          );

          return;
        }

        /*
          BODY
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

                  } catch (error) {

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
          KAMER MAKEN
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
            createSession(
              room.code,
              player.id
            );

          setSessionCookie(
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
          MEEDOEN
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

          const code =
            cleanCode(
              body.code
            );

          if (
            code.length !== 6
          ) {

            throw new Error(
              "Vul een kamernummer van 6 tekens in."
            );
          }

          const room =
            rooms.get(code);

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
            activePlayers(room).length >= 4
          ) {

            throw new Error(
              "Deze kamer zit al vol."
            );
          }

          const duplicate =
            room.players.some(
              function(player) {

                return (
                  player.active &&
                  player.name.toLowerCase() ===
                    name.toLowerCase()
                );
              }
            );

          if (duplicate) {

            throw new Error(
              "Deze speelnaam wordt al gebruikt."
            );
          }

          const player = {
            id:
              crypto.randomUUID(),

            name:name,

            money:0,

            active:true
          };

          room.players.push(
            player
          );

          addLog(
            room,
            name +
            " is de kamer binnengekomen."
          );

          bump(room);

          const sid =
            createSession(
              room.code,
              player.id
            );

          setSessionCookie(
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
            getRoomAndPlayer(req);

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
                error:"Geen sessie"
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
          ACTIES
        */

        if (
          req.method === "POST" &&
          req.url === "/api/action"
        ) {

          const result =
            getRoomAndPlayer(req);

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
            error:"Niet gevonden"
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
