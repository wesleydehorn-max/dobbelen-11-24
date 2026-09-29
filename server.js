const http = require("http");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;

const rooms = new Map();
const sessions = new Map();

function makeId() {
  return crypto.randomBytes(12).toString("hex");
}

function cleanName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 20);
}

function cleanCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

function makeRoomCode() {
  let code;

  do {
    code = Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase();
  } while (rooms.has(code));

  return code;
}

function activePlayers(room) {
  return room.players.filter(function (p) {
    return !p.removed;
  });
}

function findPlayer(room, playerId) {
  return room.players.find(function (p) {
    return p.id === playerId && !p.removed;
  });
}

function bump(room) {
  room.version++;
}

function addLog(room, text) {
  room.log.unshift(text);
  room.log = room.log.slice(0, 40);
}

function addChat(room, player, text) {
  const clean = String(text || "")
    .trim()
    .slice(0, 160);

  if (!clean) return;

  room.chat.push({
    id: makeId(),
    name: player.name,
    text: clean,
    at: Date.now()
  });

  room.chat = room.chat.slice(-50);
}

function createRoom(name) {
  const player = {
    id: makeId(),
    name: cleanName(name),
    money: 100,
    removed: false
  };

  const room = {
    code: makeRoomCode(),

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

    banner: "🎰 Wacht op spelers...",

    version: 1,

    rollSeq: 0,

    log: [],

    chat: []
  };

  rooms.set(room.code, room);

  return {
    room: room,
    player: player
  };
}

function joinRoom(code, name) {
  const room = rooms.get(cleanCode(code));

  if (!room) {
    throw new Error("Kamer bestaat niet.");
  }

  if (room.started) {
    throw new Error("Dit spel is al gestart.");
  }

  if (activePlayers(room).length >= 4) {
    throw new Error("Deze kamer zit vol.");
  }

  const player = {
    id: makeId(),
    name: cleanName(name),
    money: 100,
    removed: false
  };

  room.players.push(player);

  room.banner = "🎰 Klaar om te spelen!";

  addLog(
    room,
    "🎩 " + player.name + " is aan tafel gekomen."
  );

  bump(room);

  return {
    room: room,
    player: player
  };
}

function resetTurn(room) {
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
  room.phase = "main";
}

function startGame(room) {
  const players = activePlayers(room);

  if (players.length < 2) {
    throw new Error(
      "Minimaal 2 spelers nodig."
    );
  }

  if (room.started) {
    throw new Error(
      "Het spel is al gestart."
    );
  }

  players.forEach(function (p) {
    p.money = 100;
  });

  room.started = true;
  room.current = 0;

  resetTurn(room);

  room.banner =
    "🎲 " +
    players[0].name +
    " is aan de beurt.";

  addLog(
    room,
    "🎰 Het spel is gestart met " +
      players.length +
      " spelers."
  );

  bump(room);
}

function nextPlayer(room) {
  const players = activePlayers(room);

  if (!players.length) return;

  const currentIndex = room.current;

  for (let i = 1; i <= players.length; i++) {
    const next =
      (currentIndex + i) %
      players.length;

    if (players[next]) {
      room.current = next;
      break;
    }
  }

  resetTurn(room);

  room.banner =
    "🎲 " +
    players[room.current].name +
    " is aan de beurt.";

  bump(room);
}

function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
}

function total(dice) {
  return dice.reduce(function (sum, value) {
    return sum + (Number(value) || 0);
  }, 0);
}

function countValue(dice, value) {
  return dice.filter(function (v) {
    return v === value;
  }).length;
}

function allHeld(room) {
  return room.held.every(Boolean);
}

function distribute(room, currentPlayer, amount, earning) {
  const players = activePlayers(room);

  for (const p of players) {
    if (p.id === currentPlayer.id) {
      continue;
    }

    if (earning) {
      p.money -= amount;
      currentPlayer.money += amount;
    } else {
      p.money += amount;
      currentPlayer.money -= amount;
    }
  }
}

function beginRoll(room) {
  room.dice = [
    rollDie(),
    rollDie(),
    rollDie(),
    rollDie(),
    rollDie()
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

  room.hasRolled = true;
  room.mustHold = false;

  room.rollSeq++;

  room.banner =
    "🎲 Zet minimaal 1 nieuwe dobbelsteen vast.";

  addLog(
    room,
    "🎲 " +
      activePlayers(room)[room.current].name +
      " heeft gegooid: " +
      room.dice.join(", ") +
      "."
  );
}

function rerollMain(room) {
  if (!room.hasRolled) {
    throw new Error(
      "Je moet eerst gooien."
    );
  }

  if (room.mustHold) {
    throw new Error(
      "Zet eerst minimaal 1 nieuwe dobbelsteen vast."
    );
  }

  if (allHeld(room)) {
    throw new Error(
      "Alle dobbelstenen staan al vast."
    );
  }

  for (let i = 0; i < 5; i++) {
    if (!room.held[i]) {
      room.dice[i] = rollDie();
    }
  }

  room.mustHold = true;
  room.rollSeq++;

  room.banner =
    "🎲 Zet minimaal 1 nieuwe steen vast voor de volgende worp.";

  addLog(
    room,
    "🎲 Nieuwe worp: " +
      room.dice.join(", ") +
      "."
  );
}

/*
========================================================
BEPALING DOELSTEEN
========================================================

5  -> 6
6  -> 5
7  -> 4
8  -> 3
9  -> 2
10 -> 1

11 -> SPECIAL

12 -> 1
13 -> 2
14 -> 3
15 -> 4
16 -> 5
17 -> 6

18 -> 6
19 -> 5
20 -> 4
21 -> 3
22 -> 2
23 -> 1

24 -> SPECIAL

25 -> 1
26 -> 2
27 -> 3
28 -> 4
29 -> 5
30 -> 6
*/

function getTarget(sum) {
  if (sum < 11) {
    return 11 - sum;
  }

  if (sum > 11 && sum < 18) {
    return sum - 11;
  }

  if (sum >= 18 && sum < 24) {
    return 24 - sum;
  }

  if (sum > 24) {
    return sum - 24;
  }

  return null;
}

function acceptMain(room, player) {
  if (!room.hasRolled) {
    throw new Error(
      "Je moet eerst gooien."
    );
  }

  if (room.mustHold) {
    throw new Error(
      "Zet eerst minimaal 1 nieuwe dobbelsteen vast."
    );
  }

  const sum = total(room.dice);

  /*
  ======================================================
  SPECIALE 11
  ======================================================
  */

  if (sum === 11) {
    distribute(
      room,
      player,
      0.5,
      false
    );

    room.banner =
      "💰 " +
      player.name +
      " heeft 11! €0,50 naar iedere tegenstander.";

    addLog(
      room,
      "💰 " +
        player.name +
        " gooide 11 en betaalt €0,50 aan iedere tegenstander."
    );

    nextPlayer(room);

    return;
  }

  /*
  ======================================================
  SPECIALE 24
  ======================================================
  */

  if (sum === 24) {
    distribute(
      room,
      player,
      0.5,
      false
    );

    room.banner =
      "💰 " +
      player.name +
      " heeft 24! €0,50 naar iedere tegenstander.";

    addLog(
      room,
      "💰 " +
        player.name +
        " gooide 24 en betaalt €0,50 aan iedere tegenstander."
    );

    nextPlayer(room);

    return;
  }

  /*
  ======================================================
  VOLLE BAK
  ======================================================
  */

  if (countValue(room.dice, 6) === 5) {
    room.phase = "earnpay";

    room.target = 6;

    room.mode = "earn";

    room.needFreshRoll = true;

    room.held = [
      true,
      true,
      true,
      true,
      true
    ];

    room.settled = [
      true,
      true,
      true,
      true,
      true
    ];

    room.banner =
      "🎰 VOLLE BAK! VERDIENEN: 6’en.";

    addLog(
      room,
      "🎰 VOLLE BAK! " +
        player.name +
        " gaat verdienen met 6’en."
    );

    return;
  }

  const target =
    getTarget(sum);

  if (!target) {
    throw new Error(
      "Ongeldige worp."
    );
  }

  room.target = target;

  room.mode = "earn";

  room.phase = "earnpay";

  room.needFreshRoll = true;

  room.held = [
    true,
    true,
    true,
    true,
    true
  ];

  room.settled = [
    true,
    true,
    true,
    true,
    true
  ];

  room.banner =
    "💰 VERDIENEN: " +
    target +
    "’EN.";

  addLog(
    room,
    "💰 " +
      player.name +
      " gooide " +
      sum +
      " en gaat verdienen met " +
      target +
      "’en."
  );
}

function resolveEarnPay(room, player) {
  /*
  Bij de eerste verdienworp:
  altijd een nieuwe set van 5.
  */

  if (room.needFreshRoll) {
    room.dice = [
      rollDie(),
      rollDie(),
      rollDie(),
      rollDie(),
      rollDie()
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

    room.needFreshRoll = false;
  } else {
    /*
    Alleen losse dobbelstenen opnieuw gooien.
    Vastgezette doelstenen blijven staan.
    */

    for (let i = 0; i < 5; i++) {
      if (!room.held[i]) {
        room.dice[i] = rollDie();
      }
    }
  }

  room.rollSeq++;

  const target = room.target;

  const hits = [];

  for (let i = 0; i < 5; i++) {
    if (
      room.dice[i] === target &&
      !room.settled[i]
    ) {
      hits.push(i);
    }
  }

  /*
  ======================================================
  MIS
  ======================================================
  */

  if (!hits.length) {
    room.banner =
      "❌ MIS! Geen " +
      target +
      ". De beurt gaat naar de volgende speler.";

    addLog(
      room,
      "❌ " +
        player.name +
        " gooide geen " +
        target +
        " en mist."
    );

    nextPlayer(room);

    return;
  }

  /*
  ======================================================
  VERDIENEN
  ======================================================
  */

  const amount =
    hits.length * 5;

  distribute(
    room,
    player,
    amount,
    true
  );

  hits.forEach(function (index) {
    room.held[index] = true;
    room.settled[index] = true;
  });

  room.banner =
    "💰 +" +
    euro(amount) +
    " — " +
    hits.length +
    "× " +
    target +
    ".";

  addLog(
    room,
    "💰 " +
      player.name +
      " verdient " +
      euro(amount) +
      " met " +
      hits.length +
      "× " +
      target +
      "."
  );

  /*
  ======================================================
  VOLLE BAK TIJDENS VERDIENEN
  ======================================================
  */

  if (hits.length === 5) {
    room.needFreshRoll = true;

    room.banner +=
      " 🎰 VOLLE BAK — nieuwe set van 5.";
  }
}

function publicState(room, me) {
  const players =
    activePlayers(room);

  const current =
    players[room.current] || null;

  return {
    room: {
      code: room.code,

      started: room.started,

      canStart:
        !room.started &&
        me.id === room.admin &&
        players.length >= 2,

      playerCount:
        players.length,

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
      players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          money: p.money,
          isAdmin:
            p.id === room.admin
        };
      }),

    me: {
      id: me.id,
      name: me.name,
      money: me.money,
      isAdmin:
        me.id === room.admin
    }
  };
}

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type":
      "application/json; charset=utf-8",

    "Cache-Control":
      "no-store",

    "Access-Control-Allow-Origin":
      "*"
  });

  res.end(
    JSON.stringify(data)
  );
}

function parseBody(req) {
  return new Promise(
    function (resolve, reject) {
      let body = "";

      req.on(
        "data",
        function (chunk) {
          body += chunk;

          if (body.length > 100000) {
            req.destroy();
          }
        }
      );

      req.on(
        "end",
        function () {
          try {
            resolve(
              body
                ? JSON.parse(body)
                : {}
            );
          } catch (e) {
            reject(
              new Error(
                "Ongeldige aanvraag."
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

function getSession(req, res) {
  const cookie =
    req.headers.cookie || "";

  const match =
    cookie.match(
      /sid=([^;]+)/
    );

  let sid =
    match
      ? match[1]
      : null;

  let session =
    sid
      ? sessions.get(sid)
      : null;

  if (!session) {
    sid = makeId();

    session = {};

    sessions.set(
      sid,
      session
    );

    res.setHeader(
      "Set-Cookie",
      "sid=" +
        sid +
        "; Path=/; HttpOnly; SameSite=Lax"
    );
  }

  return session;
}

function performAction(
  room,
  player,
  type,
  data
) {
  const players =
    activePlayers(room);

  const current =
    players[room.current];

  /*
  START
  */

  if (type === "start") {
    if (
      player.id !==
      room.admin
    ) {
      throw new Error(
        "Alleen de beheerder kan starten."
      );
    }

    startGame(room);

    return;
  }

  /*
  CHAT
  */

  if (type === "chat") {
    addChat(
      room,
      player,
      data && data.text
    );

    bump(room);

    return;
  }

  /*
  SPELER VERWIJDEREN
  */

  if (type === "remove") {
    if (
      player.id !==
      room.admin
    ) {
      throw new Error(
        "Alleen de beheerder kan spelers verwijderen."
      );
    }

    const target =
      room.players.find(
        function (p) {
          return (
            p.id ===
            String(
              data &&
              data.playerId
            )
          );
        }
      );

    if (
      !target ||
      target.id ===
      room.admin
    ) {
      throw new Error(
        "Speler kan niet worden verwijderd."
      );
    }

    target.removed = true;

    room.banner =
      "👋 " +
      target.name +
      " is verwijderd.";

    bump(room);

    return;
  }

  if (!room.started) {
    throw new Error(
      "Het spel is nog niet gestart."
    );
  }

  if (
    !current ||
    current.id !== player.id
  ) {
    throw new Error(
      "Het is niet jouw beurt."
    );
  }

  /*
  GOOIEN
  */

  if (type === "roll") {
    if (
      room.phase ===
      "main"
    ) {
      if (!room.hasRolled) {
        beginRoll(room);
      } else {
        rerollMain(room);
      }

      bump(room);

      return;
    }

    if (
      room.phase ===
      "earnpay"
    ) {
      resolveEarnPay(
        room,
        player
      );

      bump(room);

      return;
    }
  }

  /*
  DOBBELSTEEN VASTZETTEN
  */

  if (type === "hold") {
    if (
      room.phase !==
      "main"
    ) {
      throw new Error(
        "Vastzetten kan nu niet."
      );
    }

    if (!room.hasRolled) {
      throw new Error(
        "Gooi eerst."
      );
    }

    const index =
      Number(
        data &&
        data.index
      );

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

    /*
    Na iedere worp moet minimaal
    één nieuwe steen worden vastgezet.
    */

    room.mustHold = false;

    room.banner =
      "🔒 Dobbelsteen vastgezet. Je mag opnieuw gooien.";

    bump(room);

    return;
  }

  /*
  AKKOORD
  */

  if (type === "accept") {
    if (
      room.phase !==
      "main"
    ) {
      throw new Error(
        "Je kunt nu niet akkoord gaan."
      );
    }

    acceptMain(
      room,
      player
    );

    bump(room);

    return;
  }

  throw new Error(
    "Onbekende actie."
  );
}

const HTML = String.raw`<!DOCTYPE html>
<html lang="nl">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"
>

<title>Dobbelen 11/24</title>

<style>

*{
  box-sizing:border-box;
  -webkit-tap-highlight-color:transparent;
}

html,
body{
  margin:0;
  min-height:100%;
  font-family:Arial,Helvetica,sans-serif;
  background:#031d15;
  color:#fff;
}

body{
  padding:8px;

  background:
    radial-gradient(
      circle at 50% 0%,
      #0c5037,
      #062d21 40%,
      #02150f
    );
}

.app{
  width:min(100%,900px);
  margin:auto;
}

.hidden{
  display:none!important;
}

.topbar{
  background:
    linear-gradient(
      180deg,
      #073e2c,
      #04271d
    );

  border:2px solid #b88a2b;
  border-radius:18px;

  padding:12px;

  margin-bottom:10px;

  box-shadow:0 10px 30px #0008;
}

.logo{
  text-align:center;

  font-size:24px;
  font-weight:900;

  color:#f5d879;

  text-shadow:0 2px 5px #000;
}

.sublogo{
  text-align:center;

  color:#d8c27d;

  font-size:11px;
}

.panel{
  background:
    linear-gradient(
      145deg,
      #0a5138,
      #06301f
    );

  border:2px solid #b98a2c;
  border-radius:20px;

  padding:14px;

  box-shadow:
    0 14px 35px #0009;

  margin-bottom:10px;
}

.start-screen{
  min-height:430px;

  display:flex;
  flex-direction:column;
  justify-content:center;
}

.start-title{
  text-align:center;

  font-size:24px;
  font-weight:900;

  color:#f4d574;

  margin-bottom:20px;
}

.field{
  margin-bottom:12px;
}

.field label{
  display:block;

  font-size:13px;

  color:#dcc77e;

  margin-bottom:5px;

  font-weight:bold;
}

.field input{
  width:100%;

  padding:13px;

  border-radius:11px;

  border:2px solid #8f6b24;

  background:#021b13;

  color:#fff;

  outline:none;
}

.start-buttons{
  display:grid;

  grid-template-columns:1fr 1fr;

  gap:8px;
}

.btn{
  min-height:46px;

  padding:11px 14px;

  border-radius:12px;

  color:#fff;

  font-weight:900;

  border:2px solid #c59b39;

  box-shadow:0 5px 12px #0007;
}

.btn:active{
  transform:translateY(2px);
}

.btn:disabled{
  opacity:.4;
}

.green{
  background:
    linear-gradient(
      145deg,
      #16824d,
      #07532e
    );
}

.blue{
  background:
    linear-gradient(
      145deg,
      #17578c,
      #0a3157
    );
}

.gold{
  background:
    linear-gradient(
      145deg,
      #d3aa4d,
      #8f6418
    );

  color:#201600;
}

.orange{
  background:
    linear-gradient(
      145deg,
      #e47c20,
      #9e420d
    );
}

.red{
  background:
    linear-gradient(
      145deg,
      #a72d28,
      #611512
    );
}

.room-code{
  text-align:center;

  font-size:32px;

  letter-spacing:6px;

  font-weight:900;

  color:#f6d875;

  margin-bottom:3px;
}

.status{
  text-align:center;

  color:#8ff1b4;

  font-weight:bold;

  margin-bottom:12px;
}

.invite-area{
  text-align:center;

  margin-bottom:13px;
}

.invite-btn{
  width:100%;

  max-width:380px;

  background:
    linear-gradient(
      145deg,
      #e0b74f,
      #986a17
    );

  color:#241800;

  border:2px solid #f5d878;

  box-shadow:
    0 0 18px #d8ad4533,
    0 7px 16px #0008;
}

.invite-message{
  min-height:18px;

  margin-top:6px;

  color:#83f0aa;

  font-size:12px;

  font-weight:bold;
}

.players{
  display:grid;

  grid-template-columns:
    repeat(2,1fr);

  gap:8px;
}

.player-card{
  background:
    linear-gradient(
      145deg,
      #0b3b2b,
      #05251a
    );

  border:1px solid #806021;

  border-radius:13px;

  padding:11px;

  min-height:78px;
}

.player-name{
  font-weight:900;

  font-size:14px;
}

.player-money{
  color:#f1d36c;

  font-weight:900;

  margin-top:5px;
}

.admin-tag{
  font-size:9px;

  color:#f5d46e;

  margin-left:3px;
}

.empty{
  opacity:.5;
}

.waiting{
  text-align:center;

  margin-top:13px;

  padding:12px;

  border-radius:12px;

  background:#031b13;

  border:1px solid #795c22;

  color:#ddd;
}

.center{
  text-align:center;

  margin-top:13px;
}

.game-head{
  display:flex;

  justify-content:space-between;

  align-items:center;

  margin-bottom:8px;
}

.turn{
  font-weight:900;
}

.money{
  font-size:20px;

  color:#f3d36e;

  font-weight:900;
}

.banner{
  background:
    linear-gradient(
      145deg,
      #062a1e,
      #02170f
    );

  border:2px solid #96732a;

  border-radius:14px;

  padding:12px;

  text-align:center;

  color:#f4d56d;

  font-weight:900;

  min-height:47px;

  display:flex;

  align-items:center;

  justify-content:center;

  margin-bottom:10px;
}

.target{
  background:#220d09;

  border:2px solid #d5ad45;

  border-radius:15px;

  padding:12px;

  text-align:center;

  margin-bottom:10px;
}

.target .small{
  font-size:10px;

  color:#e1c66f;

  font-weight:bold;
}

.target .big{
  font-size:28px;

  font-weight:900;

  color:#fff;
}

.tray{
  position:relative;

  border-radius:30px;

  padding:22px 9px 28px;

  background:
    radial-gradient(
      ellipse at center,
      #16704b,
      #0b4b33 50%,
      #052b1d
    );

  border:7px solid #9b6d21;

  box-shadow:
    inset 0 0 0 4px #d0a342,
    inset 0 -18px 35px #0008,
    0 10px 25px #0009;

  min-height:215px;
}

.cup{
  position:absolute;

  left:50%;

  top:-12px;

  transform:translateX(-50%);

  width:88px;

  height:52px;

  border-radius:
    50% 50% 35% 35%;

  background:
    linear-gradient(
      145deg,
      #e2bf61,
      #765018
    );

  border:3px solid #f5dc8b;

  box-shadow:
    0 6px 12px #0009;

  z-index:2;
}

.cup:after{
  content:"";

  position:absolute;

  left:13px;

  right:13px;

  top:8px;

  height:16px;

  border-radius:50%;

  background:#1d1204;

  border:2px solid #8e671e;
}

.dice-grid{
  position:relative;

  z-index:3;

  display:grid;

  grid-template-columns:
    repeat(5,1fr);

  gap:7px;

  align-items:center;

  justify-items:center;

  margin-top:40px;
}

.die{
  width:70px;

  height:70px;

  border-radius:14px;

  background:
    linear-gradient(
      145deg,
      #d82d28,
      #8d1715
    );

  border:4px solid #68100e;

  box-shadow:
    inset 3px 3px 7px #ff777755,
    inset -5px -6px 9px #3b0000aa,
    0 7px 10px #0009;

  position:relative;

  display:grid;

  grid-template-columns:
    repeat(3,1fr);

  grid-template-rows:
    repeat(3,1fr);

  padding:8px;

  user-select:none;
}

.die.held{
  border-color:#f4ce5b;

  box-shadow:
    0 0 0 3px #e0b44255,
    inset 3px 3px 7px #ff777755,
    inset -5px -6px 9px #3b0000aa,
    0 0 17px #f1ca4b99,
    0 7px 10px #0009;
}

.die.clickable{
  cursor:pointer;
}

.die.clickable:active{
  transform:scale(.95);
}

.pip{
  width:11px;

  height:11px;

  border-radius:50%;

  background:#fff;

  box-shadow:
    inset 1px 1px 2px #bbb,
    0 1px 2px #0008;

  align-self:center;

  justify-self:center;
}

/* 1 */

.d1 .p1{
  grid-column:2;
  grid-row:2;
}

/* 2 */

.d2 .p1{
  grid-column:1;
  grid-row:1;
}

.d2 .p2{
  grid-column:3;
  grid-row:3;
}

/* 3 */

.d3 .p1{
  grid-column:1;
  grid-row:1;
}

.d3 .p2{
  grid-column:2;
  grid-row:2;
}

.d3 .p3{
  grid-column:3;
  grid-row:3;
}

/* 4 */

.d4 .p1{
  grid-column:1;
  grid-row:1;
}

.d4 .p2{
  grid-column:3;
  grid-row:1;
}

.d4 .p3{
  grid-column:1;
  grid-row:3;
}

.d4 .p4{
  grid-column:3;
  grid-row:3;
}

/* 5 */

.d5 .p1{
  grid-column:1;
  grid-row:1;
}

.d5 .p2{
  grid-column:3;
  grid-row:1;
}

.d5 .p3{
  grid-column:2;
  grid-row:2;
}

.d5 .p4{
  grid-column:1;
  grid-row:3;
}

.d5 .p5{
  grid-column:3;
  grid-row:3;
}

/* 6 */

.d6 .p1{
  grid-column:1;
  grid-row:1;
}

.d6 .p2{
  grid-column:3;
  grid-row:1;
}

.d6 .p3{
  grid-column:1;
  grid-row:2;
}

.d6 .p4{
  grid-column:3;
  grid-row:2;
}

.d6 .p5{
  grid-column:1;
  grid-row:3;
}

.d6 .p6{
  grid-column:3;
  grid-row:3;
}

.vast-label{
  position:absolute;

  bottom:-20px;

  left:50%;

  transform:
    translateX(-50%);

  font-size:9px;

  color:#f5d56f;

  font-weight:900;

  letter-spacing:1px;

  white-space:nowrap;
}

.rolling{
  animation:
    tumble .18s linear infinite;
}

.rolling .pip{
  visibility:hidden;
}

@keyframes tumble{

  0%{
    transform:
      translate(0,0)
      rotate(0deg);
  }

  25%{
    transform:
      translate(7px,-5px)
      rotate(18deg);
  }

  50%{
    transform:
      translate(-6px,4px)
      rotate(-17deg);
  }

  75%{
    transform:
      translate(5px,2px)
      rotate(13deg);
  }

  100%{
    transform:
      translate(0,0)
      rotate(0deg);
  }
}

.controls{
  display:grid;

  grid-template-columns:
    1fr 1fr;

  gap:8px;

  margin-top:15px;
}

.full{
  grid-column:1/-1;
}

.hint{
  text-align:center;

  color:#c7d4cc;

  font-size:12px;

  margin-top:8px;

  min-height:18px;
}

.chat{
  background:#031a12;

  border:1px solid #73571e;

  border-radius:14px;

  margin-top:11px;

  overflow:hidden;
}

.chat-head{
  padding:10px;

  font-weight:900;

  color:#e6ca6c;

  cursor:pointer;
}

.chat-body{
  padding:9px;

  border-top:1px solid #574619;
}

.chat-list{
  max-height:150px;

  overflow:auto;

  margin-bottom:8px;
}

.chat-msg{
  padding:4px 0;

  font-size:13px;
}

.chat-msg b{
  color:#f0cf68;
}

.chat-row{
  display:flex;

  gap:6px;
}

.chat-row input{
  flex:1;

  background:#06271b;

  color:#fff;

  border:1px solid #745a23;

  border-radius:9px;

  padding:9px;
}

.chat-row button{
  padding:9px 12px;

  border-radius:9px;

  background:#185a3b;

  color:#fff;

  border:1px solid #bd9639;

  font-weight:bold;
}

.log{
  margin-top:11px;

  background:#031a12;

  border:1px solid #73571e;

  border-radius:14px;

  padding:9px;
}

.log-title{
  font-weight:900;

  color:#e4ca6d;

  margin-bottom:6px;
}

.log-line{
  font-size:12px;

  color:#cbd4ce;

  padding:3px 0;

  border-bottom:
    1px solid #ffffff0b;
}

.footer{
  text-align:center;

  color:#7e9a8c;

  font-size:10px;

  padding:12px;
}

@media(max-width:650px){

  .start-buttons{
    grid-template-columns:1fr;
  }

  .die{
    width:61px;
    height:61px;
    padding:7px;
  }

  .die .pip{
    width:9px;
    height:9px;
  }

  .dice-grid{
    gap:5px;
  }

}

@media(max-width:390px){

  .die{
    width:53px;
    height:53px;
  }

  .die .pip{
    width:8px;
    height:8px;
  }

  .dice-grid{
    gap:3px;
  }

  .players{
    grid-template-columns:1fr;
  }

}

</style>

</head>

<body>

<div class="app">

<div class="topbar">

<div class="logo">
🎲 DOBBELEN 11/24
</div>

<div class="sublogo">
PRIVATE CASINO TABLE
</div>

</div>

<section
  id="startScreen"
  class="panel start-screen"
>

<div
  id="startTitle"
  class="start-title"
>
🎰 WELKOM IN HET CASINO
</div>

<div class="field">

<label>
Jouw speelnaam
</label>

<input
  id="createName"
  maxlength="20"
  placeholder="Bijv. Wesley"
>

</div>

<div class="start-buttons">

<button
  id="createButton"
  class="btn green"
>
🎲 NIEUWE KAMER MAKEN
</button>

<button
  id="showJoinButton"
  class="btn blue"
>
🎩 KAMER JOINEN
</button>

</div>

<div
  id="joinBox"
  class="hidden"
  style="margin-top:13px"
>

<div class="field">

<label>
Kamercode
</label>

<input
  id="joinCode"
  maxlength="6"
  placeholder="Bijv. 2HS3NA"
>

</div>

<div class="field">

<label>
Jouw speelnaam
</label>

<input
  id="joinName"
  maxlength="20"
  placeholder="Bijv. Patrick"
>

</div>

<button
  id="joinButton"
  class="btn blue"
  style="width:100%"
>
🎩 AAN TAFEL GAAN
</button>

<div
  id="joinError"
  style="
    color:#ff9b8e;
    text-align:center;
    font-weight:bold;
    margin-top:8px;
    min-height:18px
  "
></div>

</div>

</section>

<section
  id="lobby"
  class="panel hidden"
>

<div
  id="roomCode"
  class="room-code"
></div>

<div class="status">
🟢 CASINO TAFEL OPEN
</div>

<div
  id="inviteArea"
  class="invite-area"
>

<button
  id="inviteButton"
  class="btn invite-btn"
>
🔗 LINK KOPIËREN
</button>

<div
  id="inviteMessage"
  class="invite-message"
></div>

</div>

<div
  id="players"
  class="players"
></div>

<div
  id="waiting"
  class="waiting hidden"
>

<div style="font-size:25px">
🎩
</div>

<div id="waitingText">
Wachten op de beheerder...
</div>

</div>

<div
  id="adminControls"
  class="center hidden"
>

<button
  id="startButton"
  class="btn green"
>
🎲 START SPEL
</button>

</div>

</section>

<section
  id="game"
  class="panel hidden"
>

<div class="game-head">

<div
  id="turn"
  class="turn"
></div>

<div
  id="money"
  class="money"
>
€100,00
</div>

</div>

<div
  id="banner"
  class="banner"
>
🎲 Klaar?
</div>

<div
  id="targetBox"
  class="target hidden"
>

<div class="small">
DOEL
</div>

<div
  id="targetText"
  class="big"
>
</div>

</div>

<div class="tray">

<div class="cup"></div>

<div
  id="dice"
  class="dice-grid"
></div>

</div>

<div
  id="controls"
  class="controls"
></div>

<div
  id="hint"
  class="hint"
></div>

<div class="chat">

<div
  id="chatHead"
  class="chat-head"
>
💬 CHAT ▼
</div>

<div
  id="chatBody"
  class="chat-body hidden"
>

<div
  id="chatList"
  class="chat-list"
></div>

<div class="chat-row">

<input
  id="chatInput"
  maxlength="160"
  placeholder="Typ een bericht..."
>

<button id="chatSend">
STUUR
</button>

</div>

</div>

</div>

<div class="log">

<div class="log-title">
📜 SPELVERLOOP
</div>

<div id="logList"></div>

</div>

</section>

<div class="footer">
Dobbelen 11/24 • Private Casino Table
</div>

</div>

<script>

let state = null;

let lastRollSeq = -1;

let rolling = false;

let pollTimer = null;

function $(id){
  return document.getElementById(id);
}

function euro(value){

  return new Intl.NumberFormat(
    "nl-NL",
    {
      style:"currency",
      currency:"EUR"
    }
  ).format(value || 0);

}

function escapeHtml(text){

  return String(text || "")
    .replace(
      /[&<>'"]/g,
      function(ch){

        return {
          "&":"&amp;",
          "<":"&lt;",
          ">":"&gt;",
          "'":"&#39;",
          '"':"&quot;"
        }[ch];

      }
    );

}

async function api(url, options){

  const response =
    await fetch(
      url,
      options || {}
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

async function postAction(
  type,
  data
){

  return api(
    "/api/action",
    {
      method:"POST",

      headers:{
        "Content-Type":
          "application/json"
      },

      body:
        JSON.stringify({
          type:type,
          data:data || {}
        })
    }
  );

}

function showOnly(id){

  $("startScreen")
    .classList.add("hidden");

  $("lobby")
    .classList.add("hidden");

  $("game")
    .classList.add("hidden");

  $(id)
    .classList.remove("hidden");

}

function render(){

  if(!state){
    return;
  }

  if(state.room.started){

    showOnly("game");

    renderGame();

  }else{

    showOnly("lobby");

    renderLobby();

  }

}

function renderLobby(){

  $("roomCode").textContent =
    state.room.code;

  let html = "";

  for(
    let i=0;
    i<4;
    i++
  ){

    const player =
      state.players[i];

    if(player){

      html +=
        '<div class="player-card">';

      html +=
        '<div class="player-name">' +
        escapeHtml(player.name);

      if(player.isAdmin){

        html +=
          '<span class="admin-tag">' +
          '👑 BEHEERDER' +
          '</span>';

      }

      html +=
        '</div>';

      html +=
        '<div class="player-money">' +
        euro(player.money) +
        '</div>';

      if(
        state.me.isAdmin &&
        !player.isAdmin
      ){

        html +=
          '<button ' +
          'class="btn red" ' +
          'style="margin-top:7px;' +
          'min-height:32px;' +
          'padding:5px 8px;' +
          'font-size:10px" ' +
          'onclick="removePlayer(\'' +
          player.id +
          '\')">' +
          'VERWIJDER' +
          '</button>';

      }

      html +=
        '</div>';

    }else{

      html +=
        '<div class="player-card empty">' +
        '<div class="player-name">' +
        '🎩 OPEN PLAATS' +
        '</div>' +
        '<div style="margin-top:5px">' +
        'WACHT...' +
        '</div>' +
        '</div>';

    }

  }

  $("players").innerHTML =
    html;

  if(state.me.isAdmin){

    $("inviteArea")
      .classList.remove(
        "hidden"
      );

    $("adminControls")
      .classList.remove(
        "hidden"
      );

    $("waiting")
      .classList.add(
        "hidden"
      );

    $("startButton").disabled =
      !state.room.canStart;

  }else{

    /*
    Gasten zien de kopieerknop NIET.
    */

    $("inviteArea")
      .classList.add(
        "hidden"
      );

    $("adminControls")
      .classList.add(
        "hidden"
      );

    $("waiting")
      .classList.remove(
        "hidden"
      );

    const admin =
      state.players.find(
        function(p){
          return p.isAdmin;
        }
      );

    $("waitingText").textContent =
      admin
        ? "👑 " +
          admin.name +
          " maakt de tafel klaar..."
        : "De beheerder maakt de tafel klaar...";

  }

}

function renderGame(){

  const current =
    state.room.current;

  const mine =
    current &&
    current.id ===
      state.me.id;

  $("turn").textContent =
    current
      ? (
          mine
            ? "🎲 JOUW BEURT"
            : "🎩 " +
              current.name
        )
      : "";

  $("money").textContent =
    euro(state.me.money);

  $("banner").textContent =
    state.room.banner || "";

  if(
    state.room.phase ===
      "earnpay" &&
    state.room.target
  ){

    $("targetBox")
      .classList.remove(
        "hidden"
      );

    $("targetText").textContent =
      (
        state.room.mode ===
          "earn"
          ? "💰 VERDIENEN: "
          : "💸 BETALEN: "
      ) +
      state.room.target +
      "’EN";

  }else{

    $("targetBox")
      .classList.add(
        "hidden"
      );

  }

  renderDice();

  renderControls();

  renderChat();

  renderLog();

}

function renderDice(){

  const dice =
    state.room.dice ||
    [
      null,
      null,
      null,
      null,
      null
    ];

  const held =
    state.room.held ||
    [
      false,
      false,
      false,
      false,
      false
    ];

  let html = "";

  for(
    let i=0;
    i<5;
    i++
  ){

    const value =
      dice[i];

    let classes =
      "die";

    /*
    BELANGRIJK:
    d1, d2, d3 enz.
    */

    if(value){

      classes +=
        " d" +
        value;

    }

    if(held[i]){

      classes +=
        " held";

    }

    if(
      rolling &&
      !held[i]
    ){

      classes +=
        " rolling";

    }

    const canHold =
      !rolling &&
      value &&
      !held[i] &&
      state.room.phase ===
        "main" &&
      state.room.hasRolled;

    if(canHold){

      classes +=
        " clickable";

    }

    html +=
      '<div class="' +
      classes +
      '"' +
      (
        canHold
          ? ' onclick="holdDie(' +
            i +
            ')"'
          : ""
      ) +
      '>';

    if(
      value &&
      !rolling
    ){

      for(
        let p=1;
        p<=value;
        p++
      ){

        html +=
          '<span class="pip p' +
          p +
          '"></span>';

      }

    }else{

      /*
      Tijdens rollen GEEN ogen zichtbaar.
      */

      for(
        let p=1;
        p<=6;
        p++
      ){

        html +=
          '<span class="pip p' +
          p +
          '" ' +
          'style="visibility:hidden">' +
          '</span>';

      }

    }

    if(held[i]){

      html +=
        '<span class="vast-label">' +
        'VAST' +
        '</span>';

    }

    html +=
      '</div>';

  }

  $("dice").innerHTML =
    html;

}

function renderControls(){

  const current =
    state.room.current;

  const mine =
    current &&
    current.id ===
      state.me.id;

  const controls =
    $("controls");

  controls.innerHTML = "";

  if(!mine){

    $("hint").textContent =
      "Wacht op " +
      (
        current
          ? current.name
          : "de speler"
      ) +
      "...";

    return;

  }

  if(
    state.room.phase ===
      "main"
  ){

    if(
      !state.room.hasRolled
    ){

      controls.innerHTML =
        '<button class="btn orange full" ' +
        'onclick="doAction(\'roll\')">' +
        '🎲 BEGIN WORP' +
        '</button>';

      $("hint").textContent =
        "Gooi 5 dobbelstenen om te beginnen.";

      return;
    }

    const rerollDisabled =
      state.room.mustHold ||
      state.room.held.every(Boolean);

    const acceptDisabled =
      state.room.mustHold;

    controls.innerHTML =
      '<button class="btn orange" ' +
      (
        rerollDisabled
          ? "disabled"
          : ""
      ) +
      ' onclick="doAction(\'roll\')">' +
      '🎲 OPNIEUW GOOIEN' +
      '</button>';

    controls.innerHTML +=
      '<button class="btn blue" ' +
      (
        acceptDisabled
          ? "disabled"
          : ""
      ) +
      ' onclick="doAction(\'accept\')">' +
      '✅ AKKOORD' +
      '</button>';

    if(
      state.room.mustHold
    ){

      $("hint").textContent =
        "⚠️ Zet eerst minimaal 1 NIEUWE dobbelsteen vast.";

    }else{

      $("hint").textContent =
        "Tik op een losse dobbelsteen om hem vast te zetten.";

    }

  }else if(
    state.room.phase ===
      "earnpay"
  ){

    controls.innerHTML =
      '<button class="btn orange full" ' +
      'onclick="doAction(\'roll\')">' +
      '💰 GOOI VOOR VERDIENEN' +
      '</button>';

    $("hint").textContent =
      "Elke nieuwe doelsteen telt mee. Geen doelsteen = MIS.";

  }

}

function renderChat(){

  $("chatList").innerHTML =
    (
      state.room.chat ||
      []
    )
      .map(
        function(message){

          return (
            '<div class="chat-msg">' +
            '<b>' +
            escapeHtml(
              message.name
            ) +
            ':</b> ' +
            escapeHtml(
              message.text
            ) +
            '</div>'
          );

        }
      )
      .join("");

}

function renderLog(){

  $("logList").innerHTML =
    (
      state.room.log ||
      []
    )
      .map(
        function(line){

          return (
            '<div class="log-line">' +
            escapeHtml(line) +
            '</div>'
          );

        }
      )
      .join("");

}

async function refresh(){

  try{

    const data =
      await api(
        "/api/state"
      );

    if(!data.state){
      return;
    }

    const oldSeq =
      state
        ? state.room.rollSeq
        : -1;

    state =
      data.state;

    const rollChanged =
      oldSeq !== -1 &&
      oldSeq !==
        state.room.rollSeq;

    if(rollChanged){

      rolling = true;

      render();

      setTimeout(
        function(){

          rolling = false;

          render();

        },
        1350
      );

    }else{

      render();

    }

  }catch(e){

    console.log(e);

  }

}

async function doAction(
  type,
  data
){

  if(rolling){
    return;
  }

  try{

    const oldSeq =
      state
        ? state.room.rollSeq
        : -1;

    const result =
      await postAction(
        type,
        data
      );

    state =
      result.state;

    const rollChanged =
      oldSeq !==
        state.room.rollSeq;

    if(rollChanged){

      rolling = true;

      render();

      setTimeout(
        function(){

          rolling = false;

          render();

        },
        1350
      );

    }else{

      render();

    }

  }catch(e){

    alert(e.message);

  }

}

function holdDie(index){

  if(
    rolling ||
    !state ||
    !state.room.started
  ){

    return;

  }

  if(
    !state.room.current ||
    state.room.current.id !==
      state.me.id
  ){

    return;

  }

  if(
    state.room.phase !==
      "main"
  ){

    return;

  }

  doAction(
    "hold",
    {
      index:index
    }
  );

}

function removePlayer(id){

  if(
    !confirm(
      "Deze speler verwijderen?"
    )
  ){

    return;

  }

  doAction(
    "remove",
    {
      playerId:id
    }
  );

}

/*
========================================================
ALLEEN BEHEERDER:
LINK KOPIËREN
========================================================
*/

async function copyInviteLink(){

  if(
    !state ||
    !state.room ||
    !state.me.isAdmin
  ){

    return;

  }

  const link =
    location.origin +
    "/?join=" +
    state.room.code;

  try{

    await navigator.clipboard.writeText(
      link
    );

    $("inviteMessage").textContent =
      "✅ Link gekopieerd! Plak hem nu in WhatsApp.";

  }catch(error){

    /*
    Reserveoplossing
    */

    const area =
      document.createElement(
        "textarea"
      );

    area.value = link;

    area.style.position =
      "fixed";

    area.style.left =
      "-9999px";

    document.body.appendChild(
      area
    );

    area.focus();

    area.select();

    try{

      document.execCommand(
        "copy"
      );

      $("inviteMessage").textContent =
        "✅ Link gekopieerd! Plak hem nu in WhatsApp.";

    }catch(e){

      prompt(
        "Kopieer deze link:",
        link
      );

    }

    document.body.removeChild(
      area
    );

  }

}

async function sendChat(){

  const input =
    $("chatInput");

  const text =
    input.value.trim();

  if(!text){
    return;
  }

  input.value = "";

  try{

    const result =
      await postAction(
        "chat",
        {
          text:text
        }
      );

    state =
      result.state;

    render();

  }catch(e){

    alert(e.message);

  }

}

$("createButton").onclick =
  async function(){

    const name =
      $("createName")
        .value
        .trim();

    if(!name){

      alert(
        "Vul eerst je speelnaam in."
      );

      return;

    }

    try{

      const result =
        await api(
          "/api/create",
          {
            method:"POST",

            headers:{
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify({
                name:name
              })
          }
        );

      state =
        result.state;

      history.replaceState(
        {},
        "",
        "/"
      );

      render();

    }catch(e){

      alert(e.message);

    }

  };

$("showJoinButton").onclick =
  function(){

    $("joinBox")
      .classList.remove(
        "hidden"
      );

    $("joinCode").focus();

  };

$("joinButton").onclick =
  async function(){

    const code =
      $("joinCode")
        .value
        .trim()
        .toUpperCase();

    const name =
      $("joinName")
        .value
        .trim();

    $("joinError")
      .textContent = "";

    if(
      !code ||
      !name
    ){

      $("joinError")
        .textContent =
        "Vul de kamercode en je speelnaam in.";

      return;

    }

    try{

      const result =
        await api(
          "/api/join",
          {
            method:"POST",

            headers:{
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify({
                code:code,
                name:name
              })
          }
        );

      state =
        result.state;

      history.replaceState(
        {},
        "",
        "/"
      );

      render();

    }catch(e){

      $("joinError")
        .textContent =
        e.message;

    }

  };

$("startButton").onclick =
  function(){

    doAction(
      "start"
    );

  };

$("inviteButton").onclick =
  copyInviteLink;

$("chatSend").onclick =
  sendChat;

$("chatInput")
  .addEventListener(
    "keydown",
    function(e){

      if(
        e.key === "Enter"
      ){

        sendChat();

      }

    }
  );

$("chatHead").onclick =
  function(){

    $("chatBody")
      .classList.toggle(
        "hidden"
      );

  };

function setupInviteMode(){

  const params =
    new URLSearchParams(
      location.search
    );

  const code =
    (
      params.get("join") ||
      ""
    )
      .toUpperCase()
      .replace(
        /[^A-Z0-9]/g,
        ""
      )
      .slice(0,6);

  if(!code){
    return;
  }

  $("startTitle")
    .textContent =
    "🎩 JE BENT UITGENODIGD";

  $("joinBox")
    .classList.remove(
      "hidden"
    );

  $("joinCode").value =
    code;

  $("joinCode").readOnly =
    true;

  $("createButton")
    .classList.add(
      "hidden"
    );

  $("showJoinButton")
    .classList.add(
      "hidden"
    );

  $("joinName").focus();

}

async function initial(){

  setupInviteMode();

  try{

    const data =
      await api(
        "/api/state"
      );

    if(data.state){

      state =
        data.state;

      render();

    }

  }catch(e){}

  pollTimer =
    setInterval(
      refresh,
      1200
    );

}

initial();

</script>

</body>
</html>`;

const server =
  http.createServer(
    async function(req, res){

      const url =
        new URL(
          req.url,
          "http://localhost"
        );

      const session =
        getSession(
          req,
          res
        );

      try{

        if(
          req.method === "GET" &&
          url.pathname === "/health"
        ){

          return json(
            res,
            200,
            {
              ok:true,
              rooms:rooms.size
            }
          );

        }

        if(
          req.method === "GET" &&
          url.pathname === "/api/state"
        ){

          if(
            !session.roomCode ||
            !session.playerId
          ){

            return json(
              res,
              200,
              {
                state:null
              }
            );

          }

          const room =
            rooms.get(
              session.roomCode
            );

          if(!room){

            return json(
              res,
              200,
              {
                state:null
              }
            );

          }

          const me =
            findPlayer(
              room,
              session.playerId
            );

          if(!me){

            return json(
              res,
              200,
              {
                state:null
              }
            );

          }

          return json(
            res,
            200,
            {
              state:
                publicState(
                  room,
                  me
                )
            }
          );

        }

        if(
          req.method === "POST" &&
          url.pathname === "/api/create"
        ){

          const body =
            await parseBody(req);

          const name =
            cleanName(
              body.name
            );

          if(!name){

            throw new Error(
              "Vul je speelnaam in."
            );

          }

          const result =
            createRoom(name);

          session.roomCode =
            result.room.code;

          session.playerId =
            result.player.id;

          return json(
            res,
            200,
            {
              state:
                publicState(
                  result.room,
                  result.player
                )
            }
          );

        }

        if(
          req.method === "POST" &&
          url.pathname === "/api/join"
        ){

          const body =
            await parseBody(req);

          const name =
            cleanName(
              body.name
            );

          if(!name){

            throw new Error(
              "Vul je speelnaam in."
            );

          }

          const result =
            joinRoom(
              body.code,
              name
            );

          session.roomCode =
            result.room.code;

          session.playerId =
            result.player.id;

          return json(
            res,
            200,
            {
              state:
                publicState(
                  result.room,
                  result.player
                )
            }
          );

        }

        if(
          req.method === "POST" &&
          url.pathname === "/api/action"
        ){

          if(
            !session.roomCode ||
            !session.playerId
          ){

            throw new Error(
              "Geen actieve kamer."
            );

          }

          const room =
            rooms.get(
              session.roomCode
            );

          if(!room){

            throw new Error(
              "Kamer bestaat niet meer."
            );

          }

          const player =
            findPlayer(
              room,
              session.playerId
            );

          if(!player){

            throw new Error(
              "Je zit niet meer aan deze tafel."
            );

          }

          const body =
            await parseBody(req);

          performAction(
            room,
            player,
            body.type,
            body.data || {}
          );

          return json(
            res,
            200,
            {
              state:
                publicState(
                  room,
                  player
                )
            }
          );

        }

        if(
          req.method === "GET" &&
          url.pathname === "/"
        ){

          res.writeHead(
            200,
            {
              "Content-Type":
                "text/html; charset=utf-8",

              "Cache-Control":
                "no-store"
            }
          );

          return res.end(
            HTML
          );

        }

        res.writeHead(
          404,
          {
            "Content-Type":
              "text/plain; charset=utf-8"
          }
        );

        res.end(
          "Niet gevonden"
        );

      }catch(error){

        return json(
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
  function(){

    console.log(
      "Dobbelen 11/24 draait op poort " +
      PORT
    );

  }
);
