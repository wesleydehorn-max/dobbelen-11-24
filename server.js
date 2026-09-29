const http = require("http");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;

const rooms = new Map();
const sessions = new Map();

function id() {
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

function makeCode() {
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

function newRoom(name) {
  const player = {
    id: id(),
    name: cleanName(name),
    money: 100,
    removed: false
  };

  const room = {
    code: makeCode(),

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

  return room;
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
    id: id(),
    name: cleanName(name),
    money: 100,
    removed: false
  };

  room.players.push(player);

  room.banner = "🎰 Klaar om te spelen!";

  bump(room);

  return {
    room: room,
    player: player
  };
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

  if (!clean) {
    return;
  }

  room.chat.push({
    id: id(),
    name: player.name,
    text: clean,
    at: Date.now()
  });

  room.chat = room.chat.slice(-50);
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
    throw new Error("Minimaal 2 spelers nodig.");
  }

  if (room.started) {
    throw new Error("Het spel is al gestart.");
  }

  players.forEach(function (p) {
    p.money = 100;
  });

  room.started = true;

  room.current = 0;

  room.phase = "main";

  room.banner = "🎲 Jouw beurt! Gooi de dobbelstenen.";

  room.log = [];

  room.chat = [];

  resetTurn(room);

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

  if (!players.length) {
    return;
  }

  const currentIndex = room.current;

  for (let i = 1; i <= players.length; i++) {
    const next =
      (currentIndex + i) % players.length;

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

function rollLoose(room) {
  for (let i = 0; i < 5; i++) {
    if (!room.held[i]) {
      room.dice[i] = rollDie();
    }
  }
}

function allHeld(room) {
  return room.held.every(Boolean);
}

function countValue(dice, value) {
  return dice.filter(function (v) {
    return v === value;
  }).length;
}

function total(dice) {
  return dice.reduce(function (sum, v) {
    return sum + (Number(v) || 0);
  }, 0);
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
    "🎲 Kies minimaal 1 nieuwe steen om vast te zetten.";

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
    throw new Error("Je moet eerst gooien.");
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

  rollLoose(room);

  room.mustHold = true;

  room.rollSeq++;

  room.banner =
    "🎲 Zet minimaal 1 nieuwe steen vast voor de volgende worp.";
}

function finishSpecial(room, player, sum) {
  if (sum === 11 || sum === 24) {
    distribute(
      room,
      player,
      0.5,
      false
    );

    room.banner =
      "💰 " +
      player.name +
      " heeft " +
      sum +
      "! €0,50 naar iedere tegenstander.";

    addLog(
      room,
      "💰 " +
        player.name +
        " gooide " +
        sum +
        " en betaalt €0,50 aan iedere tegenstander."
    );

    nextPlayer(room);

    return true;
  }

  return false;
}

function acceptMain(room, player) {
  if (!room.hasRolled) {
    throw new Error("Je moet eerst gooien.");
  }

  if (room.mustHold) {
    throw new Error(
      "Zet eerst minimaal 1 nieuwe steen vast."
    );
  }

  const sum = total(room.dice);

  if (finishSpecial(room, player, sum)) {
    return;
  }

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
      "🎰 VOLLE BAK! Verdienen met 6'en.";

    addLog(
      room,
      "🎰 VOLLE BAK! " +
        player.name +
        " gaat verdienen met 6'en."
    );

    return;
  }

  if (sum >= 11 && sum <= 17) {
    room.target = 11;

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
      "💰 VERDIENEN: 11 – gooi voor 11'en.";

    addLog(
      room,
      "💰 " +
        player.name +
        " kiest verdienen richting 11."
    );

    return;
  }

  if (sum >= 18 && sum <= 24) {
    room.target = 24;

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
      "💰 VERDIENEN: 24 – gooi voor 24'en.";

    addLog(
      room,
      "💰 " +
        player.name +
        " kiest verdienen richting 24."
    );

    return;
  }

  if (sum < 11) {
    room.target = 11;

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
      "💰 VERDIENEN: 11'en.";

    addLog(
      room,
      "💰 " +
        player.name +
        " gaat verdienen met 11'en."
    );

    return;
  }

  room.target = 24;

  room.mode = "pay";

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
    "💸 BETALEN: 24'en.";

  addLog(
    room,
    "💸 " +
      player.name +
      " gaat betalen met 24'en."
  );
}

function resolveEarnPay(room, player) {
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
    rollLoose(room);
  }

  room.rollSeq++;

  const target = room.target;

  const hits = [];

  for (let i = 0; i < 5; i++) {
    if (room.dice[i] === target) {
      hits.push(i);
    }
  }

  if (!hits.length) {
    room.banner =
      "❌ MIS! Geen " +
      target +
      ". De beurt gaat door naar de volgende speler.";

    addLog(
      room,
      "❌ " +
        player.name +
        " had geen " +
        target +
        " en mist."
    );

    nextPlayer(room);

    return;
  }

  const amount = hits.length * 5;

  distribute(
    room,
    player,
    amount,
    room.mode === "earn"
  );

  hits.forEach(function (i) {
    room.held[i] = true;
    room.settled[i] = true;
  });

  if (room.mode === "earn") {
    room.banner =
      "💰 +€" +
      amount.toFixed(2) +
      " — " +
      hits.length +
      "× " +
      target +
      ".";

    addLog(
      room,
      "💰 " +
        player.name +
        " verdient €" +
        amount.toFixed(2) +
        " met " +
        hits.length +
        "× " +
        target +
        "."
    );
  } else {
    room.banner =
      "💸 -€" +
      amount.toFixed(2) +
      " — " +
      hits.length +
      "× " +
      target +
      ".";

    addLog(
      room,
      "💸 " +
        player.name +
        " betaalt €" +
        amount.toFixed(2) +
        " voor " +
        hits.length +
        "× " +
        target +
        "."
    );
  }

  if (hits.length === 5) {
    room.needFreshRoll = true;

    room.banner +=
      " 🎰 VOLLE BAK — nieuwe set van 5.";
  }
}

function publicState(room, me) {
  const players = activePlayers(room);

  const currentPlayer =
    players[room.current] || null;

  return {
    room: {
      code: room.code,

      started: room.started,

      canStart:
        !room.started &&
        me.id === room.admin &&
        players.length >= 2,

      playerCount: players.length,

      maxPlayers: 4,

      current: currentPlayer
        ? {
            id: currentPlayer.id,
            name: currentPlayer.name
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

    players: players.map(function (p) {
      return {
        id: p.id,
        name: p.name,
        money: p.money,
        isAdmin: p.id === room.admin
      };
    }),

    me: {
      id: me.id,
      name: me.name,
      money: me.money,
      isAdmin: me.id === room.admin
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

  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise(function (resolve, reject) {
    let body = "";

    req.on("data", function (chunk) {
      body += chunk;

      if (body.length > 100000) {
        req.destroy();
      }
    });

    req.on("end", function () {
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
    });

    req.on("error", reject);
  });
}

function cookieSession(req, res) {
  const cookie =
    req.headers.cookie || "";

  const match =
    cookie.match(/sid=([^;]+)/);

  let sid =
    match
      ? match[1]
      : null;

  let session =
    sid
      ? sessions.get(sid)
      : null;

  if (!session) {
    sid = id();

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

function action(
  room,
  player,
  type,
  data
) {
  const players =
    activePlayers(room);

  const current =
    players[room.current];

  if (type === "start") {
    if (player.id !== room.admin) {
      throw new Error(
        "Alleen de beheerder kan starten."
      );
    }

    startGame(room);

    return;
  }

  if (type === "chat") {
    addChat(
      room,
      player,
      data && data.text
    );

    bump(room);

    return;
  }

  if (type === "remove") {
    if (player.id !== room.admin) {
      throw new Error(
        "Alleen de beheerder kan spelers verwijderen."
      );
    }

    const target =
      room.players.find(function (p) {
        return (
          p.id ===
            String(
              data &&
                data.playerId
            )
        );
      });

    if (
      !target ||
      target.id === room.admin
    ) {
      throw new Error(
        "Speler kan niet worden verwijderd."
      );
    }

    target.removed = true;

    if (
      room.started &&
      room.current >=
        activePlayers(room).length
    ) {
      room.current = 0;
    }

    room.banner =
      "👋 " +
      target.name +
      " is verwijderd uit de tafel.";

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

  if (type === "roll") {
    if (room.phase === "main") {
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

  if (type === "hold") {
    if (
      room.phase !==
      "main"
    ) {
      throw new Error(
        "Vastzetten kan alleen tijdens de hoofdworp."
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
      !Number.isInteger(
        index
      ) ||
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
      "🔒 Dobbelsteen vastgezet. Je mag opnieuw gooien.";

    bump(room);

    return;
  }

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
  content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
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
  background:
    radial-gradient(
      circle at 50% 0%,
      #0c5037 0,
      #062d21 35%,
      #02150f 100%
    );

  padding:12px;
}

button,
input{
  font:inherit;
}

button{
  cursor:pointer;
  border:0;
}

.hidden{
  display:none!important;
}

.app{
  width:min(100%,900px);
  margin:0 auto;
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

  padding:12px 14px;
  margin-bottom:12px;

  box-shadow:
    0 10px 30px #0008;
}

.logo{
  font-size:25px;
  font-weight:900;
  letter-spacing:1px;
  color:#f5d879;
  text-align:center;

  text-shadow:
    0 2px 5px #000;
}

.sublogo{
  text-align:center;
  font-size:12px;
  color:#d8c27d;
  margin-top:3px;
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

  padding:18px;

  box-shadow:
    0 14px 35px #0009;

  margin-bottom:12px;
}

.start-screen{
  min-height:450px;

  display:flex;
  flex-direction:column;
  justify-content:center;
}

.start-title{
  text-align:center;
  font-size:24px;
  font-weight:900;
  color:#f4d574;
  margin-bottom:22px;
}

.field{
  margin-bottom:14px;
}

.field label{
  display:block;
  font-size:13px;
  color:#dcc77e;
  margin:0 0 6px 3px;
  font-weight:bold;
}

.field input{
  width:100%;
  padding:14px;

  border-radius:12px;
  border:2px solid #8f6b24;

  background:#021b13;
  color:#fff;

  outline:none;
}

.field input:focus{
  border-color:#e5c45e;
}

.start-buttons{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:10px;
}

.join-box{
  margin-top:14px;
  padding-top:14px;
  border-top:1px solid #9d792e;
}

.btn{
  min-height:48px;

  padding:12px 15px;

  border-radius:12px;

  color:#fff;
  font-weight:900;

  border:2px solid #c59b39;

  box-shadow:
    0 5px 12px #0007;

  transition:.12s;
}

.btn:active{
  transform:translateY(2px);
}

.btn:disabled{
  opacity:.4;
  cursor:not-allowed;
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
  font-size:34px;
  text-align:center;
  letter-spacing:6px;
  color:#f6d875;
  font-weight:900;

  text-shadow:
    0 3px 7px #000;

  margin:3px 0 4px;
}

.status{
  text-align:center;
  color:#8ff1b4;
  font-weight:bold;
  margin-bottom:12px;
}

.invite-area{
  text-align:center;
  margin:0 auto 14px;
}

.invite-btn{
  width:100%;
  max-width:390px;

  background:
    linear-gradient(
      145deg,
      #d9ad45,
      #956516
    );

  color:#241800;

  border:2px solid #f4d877;

  box-shadow:
    0 0 18px #d8ad4533,
    0 7px 16px #0008;
}

.invite-message{
  min-height:18px;
  margin-top:7px;

  color:#83f0aa;
  font-size:13px;
  font-weight:bold;
}

.players{
  display:grid;
  grid-template-columns:repeat(2,1fr);
  gap:9px;
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

  padding:12px;

  min-height:83px;
}

.player-name{
  font-weight:900;
  font-size:15px;
}

.player-money{
  color:#f1d36c;
  font-weight:900;
  margin-top:6px;
}

.admin-tag{
  font-size:10px;
  color:#f5d46e;
  margin-left:4px;
}

.empty{
  opacity:.5;
  color:#b8b8b8;
}

.waiting{
  text-align:center;

  margin-top:15px;
  padding:13px;

  border-radius:12px;

  background:#031b13;
  border:1px solid #795c22;

  color:#ddd;
}

.center{
  text-align:center;
  margin-top:15px;
}

.admin-tools{
  display:flex;
  gap:8px;
  flex-wrap:wrap;
  justify-content:center;
}

.admin-tools .btn{
  flex:1;
  min-width:180px;
}

.game-head{
  display:flex;
  gap:8px;
  justify-content:space-between;
  align-items:center;

  margin-bottom:10px;
}

.money{
  font-size:20px;
  color:#f3d36e;
  font-weight:900;
}

.turn{
  font-weight:900;
  color:#fff;
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

  padding:13px;

  text-align:center;

  color:#f4d56d;
  font-weight:900;

  min-height:48px;

  display:flex;
  align-items:center;
  justify-content:center;

  margin-bottom:12px;
}

.target{
  background:#220d09;

  border:2px solid #d5ad45;
  border-radius:15px;

  padding:13px;

  text-align:center;

  margin-bottom:12px;

  box-shadow:
    0 0 18px #b88a2b33;
}

.target .small{
  font-size:11px;
  color:#e1c66f;
  font-weight:bold;
}

.target .big{
  font-size:28px;
  font-weight:900;
  color:#fff;
  margin-top:2px;
}

.tray{
  position:relative;

  border-radius:30px;

  padding:20px 12px 26px;

  background:
    radial-gradient(
      ellipse at center,
      #16704b 0,
      #0b4b33 48%,
      #052b1d 100%
    );

  border:7px solid #9b6d21;

  box-shadow:
    inset 0 0 0 4px #d0a342,
    inset 0 -18px 35px #0008,
    0 10px 25px #0009;

  min-height:230px;
}

.tray:before{
  content:"";

  position:absolute;

  left:10%;
  right:10%;
  bottom:7px;

  height:16px;

  border-radius:50%;

  background:#0006;

  filter:blur(8px);
}

.cup{
  position:absolute;

  left:50%;
  top:-12px;

  transform:translateX(-50%);

  width:90px;
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

  gap:10px;

  align-items:center;
  justify-items:center;

  margin-top:38px;
}

.die{
  width:72px;
  height:72px;

  max-width:100%;

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

  padding:9px;

  user-select:none;

  transition:.12s;
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

.die .pip{
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

.d1 .p5{
  grid-column:2;
  grid-row:2;
}

.d2 .p1{
  grid-column:1;
  grid-row:1;
}

.d2 .p2{
  grid-column:3;
  grid-row:3;
}

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

  bottom:-19px;
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

.rolling{
  background:
    linear-gradient(
      145deg,
      #bd2925,
      #6f1210
    );
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

  gap:9px;

  margin-top:16px;
}

.controls .btn{
  width:100%;
}

.full{
  grid-column:1/-1;
}

.hint{
  text-align:center;

  color:#c7d4cc;

  font-size:12px;

  margin-top:9px;

  min-height:18px;
}

.chat{
  background:#031a12;

  border:1px solid #73571e;

  border-radius:14px;

  margin-top:12px;

  overflow:hidden;
}

.chat-head{
  padding:11px;

  font-weight:900;

  color:#e6ca6c;

  cursor:pointer;
}

.chat-body{
  padding:10px;

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
  margin-top:12px;

  background:#031a12;

  border:1px solid #73571e;

  border-radius:14px;

  padding:10px;
}

.log-title{
  font-weight:900;
  color:#e4ca6d;
  margin-bottom:7px;
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

  body{
    padding:7px;
  }

  .panel{
    padding:12px;
  }

  .start-buttons{
    grid-template-columns:1fr;
  }

  .players{
    grid-template-columns:1fr 1fr;
  }

  .dice-grid{
    gap:6px;
  }

  .die{
    width:61px;
    height:61px;
    padding:7px;
    border-radius:12px;
  }

  .die .pip{
    width:9px;
    height:9px;
  }

  .tray{
    padding-left:7px;
    padding-right:7px;
  }

  .logo{
    font-size:21px;
  }

  .room-code{
    font-size:29px;
  }

}

@media(max-width:390px){

  .die{
    width:54px;
    height:54px;
  }

  .die .pip{
    width:8px;
    height:8px;
  }

  .dice-grid{
    gap:4px;
  }

  .tray{
    border-width:5px;
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
  autocomplete="nickname"
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
  class="join-box hidden"
>

<div class="field">

<label>
Kamercode
</label>

<input
  id="joinCode"
  maxlength="6"
  placeholder="Bijv. 2HS3NA"
  autocomplete="off"
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
  autocomplete="nickname"
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
    margin-top:9px;
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
🔗 VRIEND UITNODIGEN
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

<div class="admin-tools">

<button
  id="startButton"
  class="btn green"
>
🎲 START SPEL
</button>

</div>

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
11
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
💬 CHAT
<span id="chatArrow">
▼
</span>
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

<button
  id="chatSend"
>
STUUR
</button>

</div>

</div>

</div>

<div class="log">

<div class="log-title">
📜 SPELVERLOOP
</div>

<div
  id="logList"
></div>

</div>

</section>

<div class="footer">
Dobbelen 11/24 • Private Casino Table
</div>

</div>

<script>

var state = null;

var lastVersion = -1;

var lastRollSeq = -1;

var rolling = false;

var pollTimer = null;

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

async function api(
  url,
  options
){

  var res =
    await fetch(
      url,
      options || {}
    );

  var data =
    await res.json();

  if(
    !res.ok ||
    data.error
  ){

    throw new Error(
      data.error ||
      "Er ging iets mis."
    );

  }

  return data;
}

function postAction(
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

      body:JSON.stringify({
        type:type,
        data:data || {}
      })
    }
  );

}

function showOnly(
  section
){

  $("startScreen")
    .classList.add("hidden");

  $("lobby")
    .classList.add("hidden");

  $("game")
    .classList.add("hidden");

  $(section)
    .classList.remove("hidden");

}

function render(){

  if(!state){
    return;
  }

  if(!state.room.started){

    showOnly("lobby");

    renderLobby();

  }else{

    showOnly("game");

    renderGame();

  }

}

function renderLobby(){

  $("roomCode").textContent =
    state.room.code;

  var players =
    state.players || [];

  var html = "";

  for(
    var i=0;
    i<4;
    i++
  ){

    var p =
      players[i];

    if(p){

      html +=
        '<div class="player-card">';

      html +=
        '<div class="player-name">' +
        escapeHtml(p.name);

      if(p.isAdmin){

        html +=
          '<span class="admin-tag">' +
          '👑 BEHEERDER' +
          '</span>';

      }

      html +=
        '</div>';

      html +=
        '<div class="player-money">' +
        euro(p.money) +
        '</div>';

      if(
        state.me.isAdmin &&
        !p.isAdmin
      ){

        html +=
          "<button " +
          "class=\"btn red\" " +
          "style=\"margin-top:8px;" +
          "min-height:34px;" +
          "padding:6px 9px;" +
          "font-size:11px\" " +
          "onclick=\"removePlayer('" +
          p.id +
          "')\">" +
          "VERWIJDER" +
          "</button>";

      }

      html +=
        "</div>";

    }else{

      html +=
        '<div class="player-card empty">' +
        '<div class="player-name">' +
        '🎩 OPEN PLAATS' +
        '</div>' +
        '<div style="margin-top:6px">' +
        'WACHT...' +
        '</div>' +
        '</div>';

    }

  }

  $("players").innerHTML =
    html;

  if(state.me.isAdmin){

    $("adminControls")
      .classList.remove("hidden");

    $("waiting")
      .classList.add("hidden");

    $("inviteArea")
      .classList.remove("hidden");

    $("startButton").disabled =
      !state.room.canStart;

  }else{

    $("adminControls")
      .classList.add("hidden");

    $("inviteArea")
      .classList.add("hidden");

    $("waiting")
      .classList.remove("hidden");

    var admin =
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

  var current =
    state.room.current;

  var mine =
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
    euro(
      state.me.money
    );

  $("banner").textContent =
    state.room.banner || "";

  var targetBox =
    $("targetBox");

  if(
    state.room.phase ===
      "earnpay" &&
    state.room.target
  ){

    targetBox
      .classList.remove("hidden");

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

    targetBox
      .classList.add("hidden");

  }

  renderDice(false);

  renderControls();

  renderChat();

  renderLog();

}

function dieHtml(
  value,
  held,
  index,
  hidePips
){

  var cls = "die";

  if(held){
    cls += " held";
  }

  if(
    !held &&
    state &&
    state.room.phase ===
      "main" &&
    state.room.hasRolled
  ){

    cls += " clickable";

  }

  if(
    rolling &&
    !held
  ){

    cls += " rolling";

  }

  var html =
    '<div class="' +
    cls +
    '" data-index="' +
    index +
    '"';

  if(
    !hidePips &&
    value &&
    !rolling
  ){

    html +=
      ' onclick="holdDie(' +
      index +
      ')"';

  }

  html += ">";

  if(
    value &&
    !hidePips &&
    !rolling
  ){

    for(
      var i=1;
      i<=value;
      i++
    ){

      html +=
        '<span class="pip p' +
        i +
        '"></span>';

    }

  }else{

    for(
      var j=1;
      j<=5;
      j++
    ){

      html +=
        '<span class="pip p' +
        j +
        '" ' +
        'style="visibility:hidden">' +
        '</span>';

    }

  }

  if(held){

    html +=
      '<span class="vast-label">' +
      'VAST' +
      '</span>';

  }

  html +=
    "</div>";

  return html;

}

function renderDice(
  hide
){

  var dice =
    state.room.dice ||
    [
      null,
      null,
      null,
      null,
      null
    ];

  var held =
    state.room.held ||
    [
      false,
      false,
      false,
      false,
      false
    ];

  var html = "";

  for(
    var i=0;
    i<5;
    i++
  ){

    html +=
      dieHtml(
        dice[i],
        held[i],
        i,
        hide
      );

  }

  $("dice").innerHTML =
    html;

}

function renderControls(){

  var mine =
    state.room.current &&
    state.room.current.id ===
      state.me.id;

  var c =
    $("controls");

  c.innerHTML = "";

  if(!mine){

    $("hint").textContent =
      "Wacht op " +
      (
        state.room.current
          ? state.room.current.name
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

      c.innerHTML =
        "<button " +
        "class=\"btn orange full\" " +
        "onclick=\"doAction('roll')\">" +
        "🎲 BEGIN WORP" +
        "</button>";

      $("hint").textContent =
        "Gooi 5 dobbelstenen om te beginnen.";

      return;

    }

    var rerollDisabled =
      state.room.mustHold ||
      state.room.held.every(
        Boolean
      );

    var acceptDisabled =
      state.room.mustHold;

    c.innerHTML =
      "<button " +
      "class=\"btn orange\" " +
      (
        rerollDisabled
          ? "disabled"
          : ""
      ) +
      " onclick=\"doAction('roll')\">" +
      "🎲 OPNIEUW GOOIEN" +
      "</button>";

    c.innerHTML +=
      "<button " +
      "class=\"btn blue\" " +
      (
        acceptDisabled
          ? "disabled"
          : ""
      ) +
      " onclick=\"doAction('accept')\">" +
      "✅ AKKOORD" +
      "</button>";

    if(
      state.room.mustHold
    ){

      $("hint").textContent =
        "⚠️ Zet eerst minimaal 1 NIEUWE dobbelsteen vast.";

    }else if(
      state.room.held.every(
        Boolean
      )
    ){

      $("hint").textContent =
        "Alle dobbelstenen staan vast. Kies AKKOORD.";

    }else{

      $("hint").textContent =
        "Tik op een losse dobbelsteen om hem vast te zetten.";

    }

  }else if(
    state.room.phase ===
      "earnpay"
  ){

    var text =
      state.room.mode ===
        "earn"
        ? "💰 GOOI VOOR VERDIENEN"
        : "💸 GOOI VOOR BETALEN";

    c.innerHTML =
      "<button " +
      "class=\"btn orange full\" " +
      "onclick=\"doAction('roll')\">" +
      text +
      "</button>";

    $("hint").textContent =
      "Iedere nieuwe doelsteen telt mee. Geen doelsteen = MIS.";

  }

}

function renderChat(){

  var list =
    $("chatList");

  list.innerHTML =
    (
      state.room.chat ||
      []
    )
      .map(function(m){

        return (
          '<div class="chat-msg">' +
          '<b>' +
          escapeHtml(m.name) +
          ':</b> ' +
          escapeHtml(m.text) +
          '</div>'
        );

      })
      .join("");

  list.scrollTop =
    list.scrollHeight;

}

function renderLog(){

  $("logList").innerHTML =
    (
      state.room.log ||
      []
    )
      .map(function(x){

        return (
          '<div class="log-line">' +
          escapeHtml(x) +
          '</div>'
        );

      })
      .join("");

}

function escapeHtml(s){

  return String(
    s || ""
  ).replace(
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

async function refresh(){

  try{

    var data =
      await api(
        "/api/state"
      );

    if(!data.state){
      return;
    }

    var oldSeq =
      state
        ? state.room.rollSeq
        : -1;

    state =
      data.state;

    var rollChanged =
      oldSeq !==
        state.room.rollSeq &&
      oldSeq !== -1;

    if(rollChanged){

      rolling = true;

      render();

      renderDice(true);

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

    var oldSeq =
      state
        ? state.room.rollSeq
        : -1;

    var result =
      await postAction(
        type,
        data
      );

    state =
      result.state;

    var changed =
      oldSeq !==
      state.room.rollSeq;

    if(changed){

      rolling = true;

      render();

      renderDice(true);

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

function holdDie(
  index
){

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

  if(
    !state.room.hasRolled
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

async function removePlayer(
  playerId
){

  if(
    !confirm(
      "Deze speler uit de tafel verwijderen?"
    )
  ){

    return;

  }

  doAction(
    "remove",
    {
      playerId:
        playerId
    }
  );

}

async function inviteFriend(){

  if(
    !state ||
    !state.room
  ){

    return;

  }

  var link =
    location.origin +
    "/?join=" +
    state.room.code;

  var shareText =
    "🎰 Kom bij mijn Dobbelen 11/24 casino tafel!";

  var msg =
    $("inviteMessage");

  if(
    navigator.share
  ){

    try{

      await navigator.share({
        title:
          "Dobbelen 11/24",

        text:
          shareText,

        url:
          link
      });

      msg.textContent =
        "✅ Uitnodiging gedeeld!";

      return;

    }catch(e){

      if(
        e &&
        e.name ===
          "AbortError"
      ){

        return;

      }

    }

  }

  try{

    await navigator.clipboard.writeText(
      link
    );

    msg.textContent =
      "✅ Uitnodigingslink gekopieerd! Stuur hem door via WhatsApp.";

  }catch(e){

    window.prompt(
      "Kopieer deze uitnodigingslink:",
      link
    );

  }

}

async function sendChat(){

  var input =
    $("chatInput");

  var text =
    input.value.trim();

  if(!text){
    return;
  }

  input.value = "";

  try{

    var result =
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

    var name =
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

      var result =
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

      alert(
        e.message
      );

    }

  };

$("showJoinButton").onclick =
  function(){

    $("joinBox")
      .classList.remove(
        "hidden"
      );

    $("joinCode")
      .focus();

  };

$("joinButton").onclick =
  async function(){

    var code =
      $("joinCode")
        .value
        .trim()
        .toUpperCase();

    var name =
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

      var result =
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
  inviteFriend;

$("chatSend").onclick =
  sendChat;

$("chatInput")
  .addEventListener(
    "keydown",
    function(e){

      if(
        e.key ===
        "Enter"
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

    $("chatArrow")
      .textContent =
      $("chatBody")
        .classList.contains(
          "hidden"
        )
        ? "▼"
        : "▲";

  };

function setupInviteMode(){

  var params =
    new URLSearchParams(
      location.search
    );

  var code =
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

  $("joinCode")
    .value =
    code;

  $("joinCode")
    .readOnly = true;

  $("createButton")
    .classList.add(
      "hidden"
    );

  $("showJoinButton")
    .classList.add(
      "hidden"
    );

  $("joinName")
    .focus();

}

async function initial(){

  setupInviteMode();

  try{

    var data =
      await api(
        "/api/state"
      );

    if(data.state){

      state =
        data.state;

      render();

    }

  }catch(e){}

  if(pollTimer){

    clearInterval(
      pollTimer
    );

  }

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
        cookieSession(
          req,
          res
        );

      try{

        if(
          req.method ===
            "GET" &&
          url.pathname ===
            "/health"
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
          req.method ===
            "GET" &&
          url.pathname ===
            "/api/state"
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
          req.method ===
            "POST" &&
          url.pathname ===
            "/api/create"
        ){

          const body =
            await parseBody(
              req
            );

          const name =
            cleanName(
              body.name
            );

          if(!name){

            throw new Error(
              "Vul je speelnaam in."
            );

          }

          const room =
            newRoom(name);

          const player =
            room.players[0];

          session.roomCode =
            room.code;

          session.playerId =
            player.id;

          bump(room);

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
          req.method ===
            "POST" &&
          url.pathname ===
            "/api/join"
        ){

          const body =
            await parseBody(
              req
            );

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
          req.method ===
            "POST" &&
          url.pathname ===
            "/api/action"
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
            await parseBody(
              req
            );

          action(
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
          req.method ===
            "GET" &&
          url.pathname ===
            "/"
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

      }catch(e){

        return json(
          res,
          400,
          {
            error:
              e.message ||
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
