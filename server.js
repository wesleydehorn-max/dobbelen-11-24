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

function makeRoomCode() {
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

  if (!name) throw new Error("Vul een naam in.");
  if (name.length > 20) {
    throw new Error("Naam mag maximaal 20 tekens zijn.");
  }

  return name;
}

function cleanCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function active(room) {
  return room.players.filter(function (p) {
    return p.active;
  });
}

function current(room) {
  return room.players[room.current];
}

function playerIndex(room, id) {
  return room.players.findIndex(function (p) {
    return p.id === id;
  });
}

function bump(room) {
  room.version++;
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

/* =========================================================
   BEURT
========================================================= */

function resetTurn(room) {
  room.phase = "main";

  room.dice = [
    null,
    null,
    null,
    null,
    null
  ];

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

function nextPlayer(room) {
  for (let i = 1; i <= room.players.length; i++) {
    const index =
      (room.current + i) % room.players.length;

    if (
      room.players[index] &&
      room.players[index].active
    ) {
      room.current = index;
      return;
    }
  }
}

function finishTurn(room) {
  nextPlayer(room);
  resetTurn(room);

  const p = current(room);

  if (p) {
    room.banner =
      "🎰 " +
      p.name +
      " is aan de beurt — druk op BEGIN WORP.";
  }

  bump(room);
}

/* =========================================================
   START SPEL
========================================================= */

function startGame(room) {
  if (active(room).length < 2) {
    throw new Error(
      "Er moeten minimaal 2 spelers zijn."
    );
  }

  /* ALTIJD €100 BIJ NIEUW SPEL */
  room.players.forEach(function (p) {
    if (p.active) {
      p.money = 100;
    }
  });

  room.started = true;

  room.current =
    room.players.findIndex(function (p) {
      return p.active;
    });

  resetTurn(room);

  const p = current(room);

  room.banner =
    "🎰 " +
    p.name +
    " is aan de beurt — druk op BEGIN WORP.";

  addLog(
    room,
    "🎰 Het spel is gestart. Iedereen begint met €100,00."
  );

  bump(room);
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

function fiveOfKind(dice) {
  return (
    dice.every(function (v) {
      return v !== null;
    }) &&
    dice.every(function (v) {
      return v === dice[0];
    })
  );
}

/* =========================================================
   GELD
========================================================= */

function transfer(room, player, amount, mode) {
  const others = active(room).filter(function (p) {
    return p.id !== player.id;
  });

  others.forEach(function (other) {
    if (mode === "earn") {
      other.money -= amount;
      player.money += amount;
    } else {
      player.money -= amount;
      other.money += amount;
    }
  });

  if (mode === "earn") {
    addLog(
      room,
      "💰 " +
        player.name +
        " verdient €" +
        amount.toFixed(2) +
        " van iedere tegenstander."
    );
  } else {
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

/* =========================================================
   HOOFDWORP
========================================================= */

function resolveMain(room) {
  const player = current(room);

  const total = room.dice.reduce(function (sum, value) {
    return sum + value;
  }, 0);

  /* VOLLE BAK */
  if (fiveOfKind(room.dice)) {
    room.target = 6;
    room.mode = "earn";
    room.phase = "earn";

    room.held = [true, true, true, true, true];
    room.settled = [true, true, true, true, true];

    transfer(room, player, 25, "earn");

    room.needFreshRoll = true;

    room.banner =
      "🔥 VOLLE BAK! " +
      player.name +
      " verdient €25,00.";

    bump(room);
    return;
  }

  const result = targetFor(total);

  /* 11 / 24 */
  if (result.special) {
    active(room)
      .filter(function (p) {
        return p.id !== player.id;
      })
      .forEach(function (other) {
        player.money -= 0.50;
        other.money += 0.50;
      });

    room.banner =
      "🎯 " +
      result.target +
      " — €0,50 naar iedere tegenstander.";

    addLog(room, room.banner);

    finishTurn(room);
    return;
  }

  room.target = result.target;
  room.mode = result.mode;
  room.phase = result.mode;

  room.settled = room.dice.map(function (v) {
    return v === result.target;
  });

  room.held = room.settled.slice();

  const count =
    room.settled.filter(Boolean).length;

  if (count > 0) {
    transfer(
      room,
      player,
      count * 5,
      result.mode
    );
  }

  room.banner =
    (result.mode === "earn"
      ? "💰 VERDIENEN: "
      : "💸 BETALEN: ") +
    result.target +
    "'EN";

  bump(room);
}

/* =========================================================
   VERDIENEN / BETALEN
========================================================= */

function resolveEarnPay(room) {
  const player = current(room);

  if (room.needFreshRoll) {
    room.dice = fiveDice();

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
  } else {
    room.dice = room.dice.map(function (value, index) {
      return room.settled[index]
        ? value
        : die();
    });
  }

  const found = room.dice.map(function (value, index) {
    return (
      !room.settled[index] &&
      value === room.target
    );
  });

  /* MIS */
  if (!found.some(Boolean)) {
    room.banner =
      "❌ MIS — geen " +
      room.target +
      " gegooid.";

    finishTurn(room);
    return;
  }

  const count =
    found.filter(Boolean).length;

  found.forEach(function (yes, index) {
    if (yes) {
      room.settled[index] = true;
      room.held[index] = true;
    }
  });

  transfer(
    room,
    player,
    count * 5,
    room.mode
  );

  room.banner =
    (room.mode === "earn"
      ? "💰 VERDIENEN: "
      : "💸 BETALEN: ") +
    room.target +
    "'EN — " +
    count +
    " doelsteen" +
    (count === 1 ? "" : "en");

  if (
    room.settled.every(function (v) {
      return v;
    })
  ) {
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

  if (action === "start") {
    if (player.id !== room.admin) {
      throw new Error(
        "Alleen de beheerder kan het spel starten."
      );
    }

    startGame(room);
    return;
  }

  if (action === "chat") {
    const text =
      String(body.text || "")
        .trim()
        .slice(0, 200);

    if (text) {
      room.chat.push({
        player: player.name,
        text: text,
        time: new Date().toLocaleTimeString(
          "nl-NL",
          {
            hour: "2-digit",
            minute: "2-digit"
          }
        )
      });

      room.chat = room.chat.slice(-50);

      bump(room);
    }

    return;
  }

  if (!room.started) {
    throw new Error(
      "Het spel is nog niet gestart."
    );
  }

  if (room.current !== index) {
    throw new Error(
      "Het is niet jouw beurt."
    );
  }

  /* BEGIN WORP */
  if (action === "begin") {
    if (
      room.phase !== "main" ||
      room.hasRolled
    ) {
      throw new Error(
        "Je kunt nu niet beginnen."
      );
    }

    room.dice = fiveDice();

    room.hasRolled = true;
    room.mustHold = true;
    room.rollSeq++;

    bump(room);
    return;
  }

  /* VASTZETTEN */
  if (action === "hold") {
    const i = Number(body.index);

    if (
      room.phase !== "main" ||
      !room.hasRolled ||
      !Number.isInteger(i) ||
      i < 0 ||
      i > 4 ||
      room.held[i]
    ) {
      throw new Error(
        "Ongeldige dobbelsteen."
      );
    }

    room.held[i] = true;

    /*
      Minimaal één nieuwe steen
      is nu vastgezet.
    */
    room.mustHold = false;

    bump(room);
    return;
  }

  /* OPNIEUW GOOIEN */
  if (action === "reroll") {
    if (
      room.phase !== "main" ||
      !room.hasRolled
    ) {
      throw new Error(
        "Je kunt nu niet opnieuw gooien."
      );
    }

    if (room.mustHold) {
      throw new Error(
        "Je moet eerst minimaal één nieuwe dobbelsteen vasthouden."
      );
    }

    if (
      room.held.every(function (v) {
        return v;
      })
    ) {
      throw new Error(
        "Alle dobbelstenen staan vast."
      );
    }

    room.dice = room.dice.map(function (value, i) {
      return room.held[i]
        ? value
        : die();
    });

    room.mustHold = true;
    room.rollSeq++;

    bump(room);
    return;
  }

  /* AKKOORD */
  if (action === "accept") {
    if (
      room.phase !== "main" ||
      !room.hasRolled
    ) {
      throw new Error(
        "Je kunt nu niet akkoord geven."
      );
    }

    resolveMain(room);
    return;
  }

  /* VERDIENEN / BETALEN */
  if (action === "roundRoll") {
    if (
      room.phase !== "earn" &&
      room.phase !== "pay"
    ) {
      throw new Error(
        "Je kunt nu niet gooien."
      );
    }

    resolveEarnPay(room);
    return;
  }

  throw new Error(
    "Onbekende actie."
  );
}

/* =========================================================
   KAMER MAKEN
========================================================= */

function createRoom(name) {
  const code = makeRoomCode();

  const player = {
    id: uid(),
    name: name,
    money: 100,
    active: true
  };

  const room = {
    code: code,

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

  return {
    room: room,
    player: player
  };
}

/* =========================================================
   JOIN
========================================================= */

function joinRoom(code, name) {
  const room = rooms.get(code);

  if (!room) {
    throw new Error(
      "Kamer niet gevonden."
    );
  }

  if (room.started) {
    throw new Error(
      "Dit spel is al gestart."
    );
  }

  if (active(room).length >= 4) {
    throw new Error(
      "Deze tafel zit vol."
    );
  }

  const player = {
    id: uid(),
    name: name,
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
    room: room,
    player: player
  };
}

/* =========================================================
   SESSION
========================================================= */

function createSession(roomCode, playerId) {
  const sid = uid();

  sessions.set(sid, {
    roomCode: roomCode,
    playerId: playerId
  });

  return sid;
}

function getSession(req) {
  const cookies =
    String(req.headers.cookie || "")
      .split(";");

  for (let i = 0; i < cookies.length; i++) {
    const part = cookies[i].trim();

    if (part.indexOf("sid=") === 0) {
      return sessions.get(
        part.substring(4)
      ) || null;
    }
  }

  return null;
}

function getRoomPlayer(req) {
  const session = getSession(req);

  if (!session) return null;

  const room =
    rooms.get(session.roomCode);

  if (!room) return null;

  const player =
    room.players.find(function (p) {
      return p.id === session.playerId;
    });

  if (!player) return null;

  return {
    room: room,
    player: player
  };
}

/* =========================================================
   PUBLIC STATE
========================================================= */

function publicState(room, me) {
  const cp = current(room);

  return {
    room: {
      code: room.code,

      started: room.started,

      canStart:
        !room.started &&
        me.id === room.admin &&
        active(room).length >= 2,

      playerCount:
        active(room).length,

      maxPlayers: 4,

      current: cp
        ? {
            id: cp.id,
            name: cp.name
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

      needFreshRoll:
        room.needFreshRoll,

      banner: room.banner,

      version: room.version,

      rollSeq: room.rollSeq,

      log: room.log,

      chat: room.chat
    },

    players:
      room.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          money:
            Number(p.money.toFixed(2)),
          active: p.active,
          isAdmin:
            p.id === room.admin
        };
      }),

    me: {
      id: me.id,
      name: me.name,
      money:
        Number(me.money.toFixed(2)),
      isAdmin:
        me.id === room.admin
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

html,
body {
  margin: 0;
  min-height: 100%;

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  color: white;

  background:
    radial-gradient(
      circle at top,
      #173d2b 0%,
      #06130c 45%,
      #020504 100%
    );
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

.hidden {
  display: none !important;
}

/* ======================================================
   TOP
====================================================== */

.wrap {
  max-width: 1100px;
  margin: auto;
  padding: 10px;
}

.brand {
  text-align: center;

  padding: 18px;

  border:
    1px solid #b88a2d;

  border-radius: 22px;

  background:
    linear-gradient(
      145deg,
      #101f17,
      #030806
    );

  box-shadow:
    0 12px 30px #0008,
    inset 0 0 25px #0008;
}

.brand h1 {
  margin: 0;

  color: #ffd76b;

  font-size:
    clamp(30px, 8vw, 55px);

  letter-spacing: 3px;

  text-shadow:
    0 2px 0 #67480d,
    0 0 20px #ffcf4d44;
}

.brand small {
  color: #cdbc83;

  letter-spacing: 3px;
}

/* ======================================================
   STARTSCHERM
====================================================== */

.start-screen {
  max-width: 650px;

  margin:
    18px auto;

  padding: 18px;

  border:
    1px solid #a67c2b;

  border-radius: 22px;

  background:
    linear-gradient(
      145deg,
      #13271c,
      #050c08
    );

  box-shadow:
    0 15px 40px #0009;
}

.start-title {
  text-align: center;

  color: #ffe08a;

  font-size: 24px;

  font-weight: 900;

  margin-bottom: 15px;
}

.field {
  margin-bottom: 12px;
}

.field label {
  display: block;

  margin-bottom: 6px;

  color: #d9c584;

  font-weight: 800;
}

.field input {
  width: 100%;

  padding: 13px;

  border-radius: 12px;

  border:
    1px solid #866728;

  background:
    #050b07;

  color: white;

  outline: none;
}

.field input:focus {
  border-color: #e2bd52;
}

.start-buttons {
  display: grid;

  grid-template-columns:
    1fr 1fr;

  gap: 10px;
}

.btn {
  border: 0;

  border-radius: 13px;

  padding: 13px 16px;

  font-weight: 900;

  box-shadow:
    0 5px 13px #0008;
}

.green {
  background:
    linear-gradient(
      #2aad60,
      #0a612d
    );

  color: white;
}

.blue {
  background:
    linear-gradient(
      #2b6dbb,
      #123768
    );

  color: white;
}

.orange {
  background:
    linear-gradient(
      #ffb53e,
      #bd5e0a
    );

  color: #241100;
}

.red {
  background:
    linear-gradient(
      #d94e4e,
      #7d1717
    );

  color: white;
}

/* ======================================================
   CASINO ROOM
====================================================== */

.panel {
  margin-top: 12px;

  padding: 15px;

  border:
    1px solid #9e772b;

  border-radius: 22px;

  background:
    linear-gradient(
      145deg,
      #13271c,
      #050c08
    );

  box-shadow:
    0 12px 35px #0008;
}

.room-code {
  text-align: center;

  font-size: 27px;

  font-weight: 900;

  letter-spacing: 7px;

  color: #ffe08a;
}

.status {
  text-align: center;

  color: #74ffab;

  font-weight: 900;

  margin:
    12px 0 16px;
}

.players {
  display: grid;

  grid-template-columns:
    repeat(4, 1fr);

  gap: 8px;
}

.player {
  min-height: 80px;

  padding: 10px;

  text-align: center;

  border:
    1px solid #5b4720;

  border-radius: 14px;

  background:
    linear-gradient(
      145deg,
      #172a20,
      #07100b
    );
}

.player.admin {
  border-color: #d5aa43;

  box-shadow:
    0 0 16px #d5aa4330;
}

.player-name {
  font-weight: 900;
}

.role {
  color: #dabb64;

  font-size: 11px;

  margin-top: 5px;
}

.money {
  color: #7dffad;

  font-weight: 900;

  margin-top: 6px;
}

.waiting {
  text-align: center;

  padding: 20px;
}

.waiting-icon {
  font-size: 50px;
}

.waiting h2 {
  color: #ffd76b;
}

.waiting p {
  color: #c0cbc4;
}

.center {
  text-align: center;

  margin-top: 14px;
}

/* ======================================================
   GAME
====================================================== */

.game {
  display: grid;

  grid-template-columns:
    minmax(0, 1fr)
    280px;

  gap: 12px;

  margin-top: 12px;
}

.table {
  min-height: 540px;

  position: relative;

  overflow: hidden;

  border:
    5px solid #b7892d;

  border-radius: 28px;

  background:
    radial-gradient(
      ellipse at center,
      #18864d,
      #07552e 55%,
      #02331d
    );

  box-shadow:
    inset 0 0 60px #0008,
    0 15px 45px #0009;
}

.table-title {
  text-align: center;

  padding: 13px;

  color: #ffe18a;

  font-weight: 900;

  letter-spacing: 3px;
}

.banner {
  width: 92%;

  margin: auto;

  padding: 10px;

  text-align: center;

  border-radius: 12px;

  background: #0007;

  border:
    1px solid #f4d26955;

  font-weight: 900;
}

.target {
  text-align: center;

  color: #ffe28b;

  font-size: 24px;

  font-weight: 900;

  min-height: 30px;

  margin: 10px;
}

/* ======================================================
   DOBBELBAK
====================================================== */

.tray {
  position: relative;

  width: 94%;

  height: 330px;

  margin: 30px auto 10px;

  border:
    3px solid #d4ad4d;

  border-radius: 28px;

  background:
    radial-gradient(
      ellipse at center,
      #11804a,
      #034226
    );

  box-shadow:
    inset 0 0 50px #0008;
}

.cup {
  position: absolute;

  z-index: 5;

  top: -28px;

  left: 50%;

  transform:
    translateX(-50%);

  width: 110px;

  height: 80px;

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
    0 12px 25px #0009;
}

.cup:after {
  content: "";

  position: absolute;

  left: 15px;
  right: 15px;
  top: 6px;

  height: 18px;

  border-radius: 50%;

  background: #090909;

  border:
    2px solid #efc95a;
}

.dice-area {
  position: absolute;

  inset:
    48px
    10px
    15px;

  display: flex;

  justify-content: center;

  align-items: center;

  flex-wrap: wrap;

  gap: 13px;
}

/* ======================================================
   DICE
====================================================== */

.die {
  width: 76px;
  height: 76px;

  position: relative;

  border-radius: 18px;

  background:
    linear-gradient(
      145deg,
      #ff4141,
      #c80e18 55%,
      #700009
    );

  border:
    3px solid #f0c95b;

  box-shadow:
    inset -7px -9px 12px #0006,
    inset 4px 4px 8px #fff2,
    0 10px 20px #0009;

  transform-style: preserve-3d;
}

.die.held {
  border-width: 5px;

  box-shadow:
    0 0 25px #ffd53f99,
    inset -7px -9px 12px #0006;
}

.die.held:after {
  content: "VAST";

  position: absolute;

  left: 50%;

  bottom: -24px;

  transform:
    translateX(-50%);

  font-size: 9px;

  font-weight: 900;

  color: #ffe78b;
}

.pip {
  position: absolute;

  width: 14px;
  height: 14px;

  border-radius: 50%;

  background:
    radial-gradient(
      circle at 35% 30%,
      white,
      #e6e6e6 55%,
      #aaa
    );

  transform:
    translate(-50%, -50%);

  box-shadow:
    inset 1px 1px 2px #0004;
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
    tumble .55s linear infinite;
}

.hidden-eyes .pip {
  opacity: 0;
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
      translate(-22px,-13px)
      rotateX(130deg)
      rotateY(80deg)
      rotateZ(55deg);
  }

  40% {
    transform:
      translate(20px,14px)
      rotateX(260deg)
      rotateY(170deg)
      rotateZ(135deg);
  }

  60% {
    transform:
      translate(-18px,10px)
      rotateX(390deg)
      rotateY(260deg)
      rotateZ(215deg);
  }

  80% {
    transform:
      translate(15px,-12px)
      rotateX(530deg)
      rotateY(340deg)
      rotateZ(295deg);
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
   SIDE
====================================================== */

.side {
  display: flex;

  flex-direction: column;

  gap: 10px;
}

.side-box {
  padding: 12px;

  border:
    1px solid #896a29;

  border-radius: 17px;

  background:
    linear-gradient(
      145deg,
      #122319,
      #050b07
    );
}

.side-box h3 {
  margin:
    0 0 8px;

  color: #f2cf68;
}

.chat {
  max-height: 220px;

  overflow-y: auto;

  font-size: 13px;
}

.chat-row {
  padding: 5px 0;
}

.chat-row b {
  color: #ffd66b;
}

.chat-form {
  display: flex;

  gap: 5px;

  margin-top: 7px;
}

.chat-form input {
  flex: 1;

  min-width: 0;

  padding: 8px;

  border-radius: 8px;

  border:
    1px solid #765b25;

  background: #020604;

  color: white;
}

.log-row {
  font-size: 12px;

  color: #bbc5bd;

  padding: 3px 0;
}

/* ======================================================
   MOBIEL
====================================================== */

@media(max-width:760px) {

  .players {
    grid-template-columns:
      repeat(2, 1fr);
  }

  .game {
    grid-template-columns: 1fr;
  }

  .start-buttons {
    grid-template-columns: 1fr;
  }

  .die {
    width: 63px;
    height: 63px;
  }

  .tray {
    height: 300px;
  }
}

</style>
</head>

<body>

<div class="wrap">

  <div class="brand">

    <h1>🎰 DOBBELEN 11/24</h1>

    <small>
      PRIVATE CASINO TABLE
    </small>

  </div>

  <!-- ==================================================
       STARTSCHERM
  =================================================== -->

  <section
    id="startScreen"
    class="start-screen">

    <div class="start-title">
      🎰 WELKOM IN HET CASINO
    </div>

    <div class="field">

      <label>
        Jouw speelnaam
      </label>

      <input
        id="createName"
        maxlength="20"
        placeholder="Bijvoorbeeld Wesley">

    </div>

    <div class="start-buttons">

      <button
        id="createButton"
        class="btn green">

        🎲 NIEUWE KAMER MAKEN

      </button>

      <button
        id="showJoinButton"
        class="btn blue">

        🎩 KAMER JOINEN

      </button>

    </div>

    <div
      id="joinBox"
      class="hidden"
      style="margin-top:15px">

      <div class="field">

        <label>
          Kamercode
        </label>

        <input
          id="joinCode"
          maxlength="6"
          placeholder="ABC123">

      </div>

      <div class="field">

        <label>
          Jouw speelnaam
        </label>

        <input
          id="joinName"
          maxlength="20"
          placeholder="Bijvoorbeeld Patrick">

      </div>

      <button
        id="joinButton"
        class="btn blue"
        style="width:100%">

        🎩 AAN TAFEL GAAN

      </button>

    </div>

  </section>

  <!-- ==================================================
       CASINO WACHTKAMER
  =================================================== -->

  <section
    id="lobby"
    class="panel hidden">

    <div
      id="roomCode"
      class="room-code">
    </div>

    <div class="status">
      🟢 CASINO TAFEL OPEN
    </div>

    <div
      id="players"
      class="players">
    </div>

    <div
      id="waiting"
      class="waiting hidden">

      <div class="waiting-icon">
        🎩
      </div>

      <h2>
        WACHT OP DE BEHEERDER
      </h2>

      <p id="waitingText">
        De tafel wordt klaargemaakt...
      </p>

      <p>
        🎲 Zodra de beheerder start,
        begint jouw eerste ronde.
      </p>

    </div>

    <div
      id="adminControls"
      class="center hidden">

      <button
        id="startButton"
        class="btn green">

        🎲 START SPEL

      </button>

    </div>

  </section>

  <!-- ==================================================
       SPEL
  =================================================== -->

  <section
    id="game"
    class="game hidden">

    <div class="table">

      <div class="table-title">
        🎲 DOBBELTAFEL
      </div>

      <div
        id="banner"
        class="banner">
      </div>

      <div
        id="target"
        class="target">
      </div>

      <div class="tray">

        <div class="cup"></div>

        <div
          id="diceArea"
          class="dice-area">
        </div>

      </div>

      <div
        id="turnInfo"
        style="
        text-align:center;
        color:#d0dad3">
      </div>

      <div
        id="controls"
        class="center">
      </div>

    </div>

    <div class="side">

      <div class="side-box">

        <h3>
          💰 SPELERS
        </h3>

        <div
          id="sidePlayers">
        </div>

      </div>

      <div class="side-box">

        <h3>
          💬 CHAT
        </h3>

        <div
          id="chat"
          class="chat">
        </div>

        <form
          id="chatForm"
          class="chat-form">

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

      <div class="side-box">

        <h3>
          📜 SPELLOG
        </h3>

        <div id="log"></div>

      </div>

    </div>

  </section>

</div>

<script>

var state = null;

var lastVersion = 0;

var lastRollSeq = 0;

var rolling = false;

var pipMap = {
  1: ["mc"],
  2: ["tl","br"],
  3: ["tl","mc","br"],
  4: ["tl","tr","bl","br"],
  5: ["tl","tr","mc","bl","br"],
  6: ["tl","tr","ml","mr","bl","br"]
};

function escapeHTML(value) {

  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}

function api(url, options) {

  options = options || {};

  return fetch(
    url,
    {
      method:
        options.method || "GET",

      credentials:
        "same-origin",

      headers: {
        "Content-Type":
          "application/json"
      },

      body:
        options.body
    }
  )
  .then(function(response) {

    return response.json()
      .then(function(data) {

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

      });

  });

}

/* ======================================================
   START / JOIN
====================================================== */

document.getElementById(
  "createButton"
).onclick = function() {

  var name =
    document.getElementById(
      "createName"
    ).value.trim();

  if (!name) {
    alert(
      "Vul eerst je speelnaam in."
    );
    return;
  }

  api(
    "/api/create",
    {
      method: "POST",

      body:
        JSON.stringify({
          name: name
        })
    }
  )
  .then(function(data) {

    state = data;
    lastVersion =
      data.room.version;

    lastRollSeq =
      data.room.rollSeq;

    render();

  })
  .catch(function(error) {

    alert(error.message);

  });

};

document.getElementById(
  "showJoinButton"
).onclick = function() {

  document.getElementById(
    "joinBox"
  ).classList.toggle("hidden");

};

document.getElementById(
  "joinButton"
).onclick = function() {

  var name =
    document.getElementById(
      "joinName"
    ).value.trim();

  var code =
    document.getElementById(
      "joinCode"
    ).value.trim();

  if (!name) {
    alert("Vul je naam in.");
    return;
  }

  if (!code) {
    alert("Vul de kamercode in.");
    return;
  }

  api(
    "/api/join",
    {
      method: "POST",

      body:
        JSON.stringify({
          name: name,
          code: code
        })
    }
  )
  .then(function(data) {

    state = data;

    lastVersion =
      data.room.version;

    lastRollSeq =
      data.room.rollSeq;

    render();

  })
  .catch(function(error) {

    alert(error.message);

  });

};

/* ======================================================
   DICE
====================================================== */

function createDie(
  value,
  index,
  hideEyes
) {

  var die =
    document.createElement(
      "div"
    );

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

  if (hideEyes) {
    die.classList.add(
      "hidden-eyes"
    );
  }

  var visualValue;

  if (hideEyes) {
    visualValue =
      Math.floor(
        Math.random() * 6
      ) + 1;
  } else {
    visualValue = value;
  }

  (
    pipMap[visualValue] || []
  ).forEach(function(position) {

    var pip =
      document.createElement(
        "div"
      );

    pip.className =
      "pip " + position;

    die.appendChild(pip);

  });

  /*
    Alleen losse stenen kunnen
    worden vastgezet.
  */

  if (
    !hideEyes &&
    !rolling &&
    state.room.phase === "main" &&
    state.room.hasRolled &&
    !state.room.held[index]
  ) {

    die.onclick = function() {

      sendAction(
        "hold",
        {
          index: index
        }
      );

    };

  }

  return die;

}

function renderDice(hideEyes) {

  var area =
    document.getElementById(
      "diceArea"
    );

  area.innerHTML = "";

  state.room.dice.forEach(
    function(value, index) {

      if (value !== null) {

        area.appendChild(
          createDie(
            value,
            index,
            hideEyes
          )
        );

      }

    }
  );

}

/* ======================================================
   ROLL ANIMATIE
====================================================== */

function playRollAnimation() {

  if (rolling) return;

  rolling = true;

  renderDice(true);

  setTimeout(
    function() {

      rolling = false;

      renderDice(false);

      renderControls();

    },
    1350
  );

}

/* ======================================================
   ACTIES
====================================================== */

function sendAction(
  action,
  extra
) {

  extra = extra || {};

  var payload =
    Object.assign(
      {
        action: action
      },
      extra
    );

  api(
    "/api/action",
    {
      method: "POST",

      body:
        JSON.stringify(payload)
    }
  )
  .then(function(data) {

    var oldSeq =
      state
        ? state.room.rollSeq
        : -1;

    state = data;

    lastVersion =
      data.room.version;

    if (
      data.room.rollSeq !== oldSeq
    ) {

      render();

      playRollAnimation();

    } else {

      render();

    }

  })
  .catch(function(error) {

    alert(error.message);

  });

}

/* ======================================================
   RENDER
====================================================== */

function render() {

  if (!state) return;

  if (!state.room.started) {

    document.getElementById(
      "startScreen"
    ).classList.add("hidden");

    document.getElementById(
      "lobby"
    ).classList.remove("hidden");

    document.getElementById(
      "game"
    ).classList.add("hidden");

    renderLobby();

    return;
  }

  document.getElementById(
    "startScreen"
  ).classList.add("hidden");

  document.getElementById(
    "lobby"
  ).classList.add("hidden");

  document.getElementById(
    "game"
  ).classList.remove("hidden");

  renderGame();

}

function renderLobby() {

  document.getElementById(
    "roomCode"
  ).textContent =
    state.room.code;

  var players =
    document.getElementById(
      "players"
    );

  players.innerHTML = "";

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
      "player";

    if (
      p &&
      p.isAdmin
    ) {
      card.classList.add(
        "admin"
      );
    }

    if (p) {

      card.innerHTML =
        "<div class='player-name'>" +
        escapeHTML(p.name) +
        "</div>" +

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
        "<div class='player-name'>" +
        "🎩 WACHT..." +
        "</div>" +

        "<div class='role'>" +
        "OPEN PLAATS" +
        "</div>";

    }

    players.appendChild(card);

  }

  var admin =
    state.me.isAdmin;

  var adminControls =
    document.getElementById(
      "adminControls"
    );

  var waiting =
    document.getElementById(
      "waiting"
    );

  if (admin) {

    adminControls.classList.remove(
      "hidden"
    );

    waiting.classList.add(
      "hidden"
    );

    document.getElementById(
      "startButton"
    ).disabled =
      !state.room.canStart;

  } else {

    adminControls.classList.add(
      "hidden"
    );

    waiting.classList.remove(
      "hidden"
    );

    var adminPlayer =
      state.players.find(
        function(p) {
          return p.isAdmin;
        }
      );

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

document.getElementById(
  "startButton"
).onclick = function() {

  sendAction("start");

};

/* ======================================================
   GAME
====================================================== */

function renderGame() {

  document.getElementById(
    "banner"
  ).textContent =
    state.room.banner || "";

  var target = "";

  if (
    state.room.phase === "earn"
  ) {

    target =
      "💰 VERDIENEN: " +
      state.room.target +
      "'EN";

  } else if (
    state.room.phase === "pay"
  ) {

    target =
      "💸 BETALEN: " +
      state.room.target +
      "'EN";

  }

  document.getElementById(
    "target"
  ).textContent =
    target;

  var cp =
    state.room.current;

  document.getElementById(
    "turnInfo"
  ).textContent =
    cp &&
    cp.id === state.me.id

      ? "🎯 DIT IS JOUW BEURT"

      : "⏳ " +
        (
          cp
            ? cp.name
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

  function button(
    text,
    className,
    callback
  ) {

    var b =
      document.createElement(
        "button"
      );

    b.className =
      "btn " +
      className;

    b.textContent =
      text;

    b.onclick =
      callback;

    box.appendChild(b);

    return b;
  }

  /*
    BEGIN
  */

  if (
    state.room.phase === "main" &&
    !state.room.hasRolled
  ) {

    button(
      "🎲 BEGIN WORP",
      "orange",
      function() {

        sendAction(
          "begin"
        );

      }
    );

    return;
  }

  /*
    MAIN
  */

  if (
    state.room.phase === "main"
  ) {

    if (
      !state.room.held.every(
        function(v) {
          return v;
        }
      )
    ) {

      var reroll =
        button(
          "🎲 OPNIEUW GOOIEN",
          "orange",
          function() {

            if (
              !state.room.mustHold
            ) {

              sendAction(
                "reroll"
              );

            }

          }
        );

      if (
        state.room.mustHold
      ) {
        reroll.disabled = true;
      }

    }

    button(
      "✓ AKKOORD",
      "blue",
      function() {

        sendAction(
          "accept"
        );

      }
    );

    return;
  }

  /*
    EARN / PAY
  */

  if (
    state.room.phase === "earn" ||
    state.room.phase === "pay"
  ) {

    button(
      state.room.phase === "earn"
        ? "🎲 GOOI VOOR VERDIENEN"
        : "🎲 GOOI VOOR BETALEN",

      state.room.phase === "earn"
        ? "green"
        : "red",

      function() {

        sendAction(
          "roundRoll"
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
        "7px";

      row.innerHTML =
        "<span>" +
        (
          p.isAdmin
            ? "👑 "
            : "🎩 "
        ) +
        escapeHTML(p.name) +
        "</span>" +

        "<b>" +
        "€" +
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
        "chat-row";

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
          "log-row";

        row.textContent =
          item.time +
          " — " +
          item.text;

        box.appendChild(row);

      }
    );

}

/* ======================================================
   CHAT
====================================================== */

document.getElementById(
  "chatForm"
).onsubmit = function(event) {

  event.preventDefault();

  var input =
    document.getElementById(
      "chatInput"
    );

  var text =
    input.value.trim();

  if (!text) return;

  input.value = "";

  sendAction(
    "chat",
    {
      text: text
    }
  );

};

/* ======================================================
   POLLING
====================================================== */

function poll() {

  api("/api/state")
    .then(function(data) {

      if (!state) {

        state = data;

        lastVersion =
          data.room.version;

        lastRollSeq =
          data.room.rollSeq;

        render();

        return;
      }

      var rollChanged =
        data.room.rollSeq !==
        lastRollSeq;

      state = data;

      lastVersion =
        data.room.version;

      if (rollChanged) {

        lastRollSeq =
          data.room.rollSeq;

        render();

        playRollAnimation();

      } else if (!rolling) {

        render();

      }

    })
    .catch(function() {

      /*
        Geen sessie is normaal
        op het startscherm.
      */

    });

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
   HTTP HELPERS
========================================================= */

function sendJSON(res, status, data) {
  res.writeHead(status, {
    "Content-Type":
      "application/json; charset=utf-8",

    "Cache-Control":
      "no-store"
  });

  res.end(
    JSON.stringify(data)
  );
}

function readBody(req) {
  return new Promise(function(resolve, reject) {

    let body = "";

    req.on("data", function(chunk) {

      body += chunk;

      if (body.length > 1000000) {
        reject(
          new Error("Request te groot.")
        );

        req.destroy();
      }

    });

    req.on("end", function() {

      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(
          JSON.parse(body)
        );
      } catch (e) {
        reject(
          new Error(
            "Ongeldige JSON."
          )
        );
      }

    });

    req.on("error", reject);

  });
}

/* =========================================================
   SERVER
========================================================= */

const server = http.createServer(
  async function(req, res) {

    try {

      /* HEALTH */

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

      /* STATE */

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
              error:
                "Geen sessie"
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

      /* CREATE */

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
            created.room.code,
            created.player.id
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
            created.room,
            created.player
          )
        );

      }

      /* JOIN */

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
            joined.room.code,
            joined.player.id
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
            joined.room,
            joined.player
          )
        );

      }

      /* ACTION */

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
              error:
                "Geen sessie"
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

      /* WEBSITE */

      if (
        req.method === "GET" &&
        (
          req.url === "/" ||
          req.url.indexOf("/?") === 0
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
