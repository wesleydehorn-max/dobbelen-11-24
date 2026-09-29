const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const rooms = new Map();

const MAX_PLAYERS = 4;
const START_BALANCE = 100;
const EURO_PER_EYE = 0.50;
const DICE_COUNT = 5;
const MAX_ROLLS = 3;

/* =========================================================
   HULPFUNCTIES
========================================================= */

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  for (let attempt = 0; attempt < 100; attempt++) {
    let code = "";

    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }

    if (!rooms.has(code)) {
      return code;
    }
  }

  throw new Error("Kon geen unieke kamer maken.");
}

function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
}

function rollAllDice() {
  return Array.from({ length: DICE_COUNT }, rollDie);
}

function getPlayer(room, playerId) {
  return room.players.find(p => p.id === playerId);
}

function getCurrentPlayer(room) {
  return room.players[room.turn];
}

function countHeld(room) {
  return room.held.filter(Boolean).length;
}

function roomState(room) {
  return {
    code: room.code,
    started: room.started,
    turn: room.turn,
    currentPlayerId:
      room.players[room.turn] ? room.players[room.turn].id : null,

    dice: room.dice,
    held: room.held,
    rolls: room.rolls,

    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      money: Number(p.money.toFixed(2)),
      admin: p.admin
    })),

    message: room.message || "",
    history: room.history.slice(-20)
  };
}

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(room) {
  const state = roomState(room);

  room.players.forEach(player => {
    send(player.ws, {
      type: "state",
      state
    });
  });
}

function messageRoom(room, text) {
  room.message = text;
  broadcast(room);
}

function addHistory(room, text) {
  room.history.push(text);

  if (room.history.length > 50) {
    room.history.shift();
  }
}

/* =========================================================
   KAMER
========================================================= */

function createRoom(name, ws) {
  const code = makeCode();

  const player = {
    id: Math.random().toString(36).slice(2) + Date.now(),
    name,
    money: START_BALANCE,
    admin: true,
    ws
  };

  const room = {
    code,
    players: [player],

    started: false,
    turn: 0,

    dice: [1, 1, 1, 1, 1],
    held: [false, false, false, false, false],

    rolls: 0,

    message: "Wacht op spelers...",
    history: []
  };

  rooms.set(code, room);

  ws.roomCode = code;
  ws.playerId = player.id;

  addHistory(room, `${name} heeft het spel aangemaakt.`);

  send(ws, {
    type: "created",
    code,
    playerId: player.id
  });

  broadcast(room);
}

function joinRoom(name, code, ws) {
  code = String(code || "").trim().toUpperCase();

  const room = rooms.get(code);

  if (!room) {
    send(ws, {
      type: "error",
      message: "Deze spelcode bestaat niet."
    });
    return;
  }

  if (room.started) {
    send(ws, {
      type: "error",
      message: "Dit spel is al gestart."
    });
    return;
  }

  if (room.players.length >= MAX_PLAYERS) {
    send(ws, {
      type: "error",
      message: "Deze kamer zit vol."
    });
    return;
  }

  const cleanName = String(name || "").trim();

  if (!cleanName) {
    send(ws, {
      type: "error",
      message: "Vul eerst je naam in."
    });
    return;
  }

  const duplicate = room.players.some(
    p => p.name.toLowerCase() === cleanName.toLowerCase()
  );

  if (duplicate) {
    send(ws, {
      type: "error",
      message: "Deze naam wordt al gebruikt."
    });
    return;
  }

  const player = {
    id: Math.random().toString(36).slice(2) + Date.now(),
    name: cleanName,
    money: START_BALANCE,
    admin: false,
    ws
  };

  room.players.push(player);

  ws.roomCode = code;
  ws.playerId = player.id;

  addHistory(room, `${cleanName} is toegetreden.`);

  send(ws, {
    type: "joined",
    code,
    playerId: player.id
  });

  messageRoom(
    room,
    `${cleanName} is toegevoegd. (${room.players.length}/${MAX_PLAYERS})`
  );
}

/* =========================================================
   SPEL STARTEN
========================================================= */

function startGame(room, ws) {
  const player = getPlayer(room, ws.playerId);

  if (!player || !player.admin) {
    send(ws, {
      type: "error",
      message: "Alleen de beheerder kan het spel starten."
    });
    return;
  }

  if (room.players.length < 2) {
    send(ws, {
      type: "error",
      message: "Er moeten minimaal 2 spelers zijn."
    });
    return;
  }

  room.started = true;
  room.turn = 0;
  room.rolls = 0;
  room.dice = [1, 1, 1, 1, 1];
  room.held = [false, false, false, false, false];

  const current = getCurrentPlayer(room);

  addHistory(room, "Het spel is gestart.");

  room.message = `Beurt van ${current.name}.`;

  broadcast(room);
}

/* =========================================================
   STEEN VASTZETTEN
========================================================= */

function toggleHold(room, ws, index) {
  const player = getPlayer(room, ws.playerId);

  if (!player) return;

  if (!room.started) {
    send(ws, {
      type: "error",
      message: "Het spel is nog niet gestart."
    });
    return;
  }

  const current = getCurrentPlayer(room);

  if (!current || current.id !== player.id) {
    send(ws, {
      type: "error",
      message: "Het is niet jouw beurt."
    });
    return;
  }

  if (room.rolls === 0) {
    send(ws, {
      type: "error",
      message: "Gooi eerst de stenen."
    });
    return;
  }

  if (index < 0 || index >= DICE_COUNT) {
    return;
  }

  room.held[index] = !room.held[index];

  const status = room.held[index] ? "vastgezet" : "vrijgegeven";

  room.message =
    `${current.name} heeft steen ${index + 1} ${status}.`;

  broadcast(room);
}

/* =========================================================
   GOOIEN
========================================================= */

function roll(room, ws) {
  const player = getPlayer(room, ws.playerId);

  if (!player) return;

  if (!room.started) {
    send(ws, {
      type: "error",
      message: "Het spel is nog niet gestart."
    });
    return;
  }

  const current = getCurrentPlayer(room);

  if (!current || current.id !== player.id) {
    send(ws, {
      type: "error",
      message: "Het is niet jouw beurt."
    });
    return;
  }

  if (room.rolls >= MAX_ROLLS) {
    send(ws, {
      type: "error",
      message: "Je hebt al 3 keer gegooid."
    });
    return;
  }

  /*
    BELANGRIJK:

    Eerste worp:
    - alle stenen worden gegooid.

    Tweede/derde worp:
    - minimaal één steen MOET vaststaan.
    - vastgezette stenen worden NIET opnieuw gegooid.
  */

  if (room.rolls > 0 && countHeld(room) === 0) {
    send(ws, {
      type: "error",
      message: "Zet eerst minimaal 1 steen vast voordat je opnieuw gooit."
    });
    return;
  }

  for (let i = 0; i < DICE_COUNT; i++) {
    if (!room.held[i]) {
      room.dice[i] = rollDie();
    }
  }

  room.rolls++;

  room.message =
    `${current.name} heeft worp ${room.rolls} van ${MAX_ROLLS} gedaan.`;

  if (room.rolls === MAX_ROLLS) {
    room.message += " Je kunt nu je beurt afronden.";
  }

  broadcast(room);
}

/* =========================================================
   BEURT AFRONDEN
========================================================= */

function finishTurn(room, ws) {
  const player = getPlayer(room, ws.playerId);

  if (!player) return;

  if (!room.started) {
    send(ws, {
      type: "error",
      message: "Het spel is nog niet gestart."
    });
    return;
  }

  const current = getCurrentPlayer(room);

  if (!current || current.id !== player.id) {
    send(ws, {
      type: "error",
      message: "Het is niet jouw beurt."
    });
    return;
  }

  if (room.rolls === 0) {
    send(ws, {
      type: "error",
      message: "Je moet eerst gooien."
    });
    return;
  }

  /*
    Ook hier verplicht minimaal één vastgezette steen.
    Zo kan een speler niet zomaar door naar de volgende beurt.
  */

  if (countHeld(room) === 0) {
    send(ws, {
      type: "error",
      message: "Zet eerst minimaal 1 steen vast."
    });
    return;
  }

  const total = room.dice.reduce((a, b) => a + b, 0);

  let change = 0;
  let resultText = "";

  if (total >= 11 && total <= 24) {
    change = total * EURO_PER_EYE;
    player.money += change;

    resultText =
      `${player.name} gooit ${total} → WINST +€${change.toFixed(2)}`;
  } else {
    change = total * EURO_PER_EYE;
    player.money -= change;

    resultText =
      `${player.name} gooit ${total} → VERLIES -€${change.toFixed(2)}`;
  }

  addHistory(room, resultText);

  /*
    Volgende speler
  */

  room.turn++;

  if (room.turn >= room.players.length) {
    room.turn = 0;
  }

  room.rolls = 0;
  room.dice = [1, 1, 1, 1, 1];
  room.held = [false, false, false, false, false];

  const nextPlayer = getCurrentPlayer(room);

  room.message =
    `${resultText}. Beurt van ${nextPlayer.name}.`;

  broadcast(room);
}

/* =========================================================
   SERVER
========================================================= */

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/health") {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8"
    });

    res.end(HTML);
    return;
  }

  res.writeHead(404, {
    "Content-Type": "text/plain; charset=utf-8"
  });

  res.end("Not Found");
});

const wss = new WebSocket.Server({
  server
});

wss.on("connection", ws => {
  send(ws, {
    type: "connected"
  });

  ws.on("message", raw => {
    let data;

    try {
      data = JSON.parse(raw.toString());
    } catch {
      send(ws, {
        type: "error",
        message: "Ongeldige opdracht."
      });
      return;
    }

    try {
      switch (data.type) {
        case "create":
          createRoom(data.name, ws);
          break;

        case "join":
          joinRoom(data.name, data.code, ws);
          break;

        case "start": {
          const room = rooms.get(ws.roomCode);
          if (room) startGame(room, ws);
          break;
        }

        case "hold": {
          const room = rooms.get(ws.roomCode);
          if (room) {
            toggleHold(room, ws, Number(data.index));
          }
          break;
        }

        case "roll": {
          const room = rooms.get(ws.roomCode);
          if (room) roll(room, ws);
          break;
        }

        case "finish": {
          const room = rooms.get(ws.roomCode);
          if (room) finishTurn(room, ws);
          break;
        }

        default:
          send(ws, {
            type: "error",
            message: "Onbekende opdracht."
          });
      }
    } catch (err) {
      console.error(err);

      send(ws, {
        type: "error",
        message: "Er ging iets mis op de server."
      });
    }
  });

  ws.on("close", () => {
    if (!ws.roomCode) return;

    const room = rooms.get(ws.roomCode);

    if (!room) return;

    const player = getPlayer(room, ws.playerId);

    if (!player) return;

    const name = player.name;

    room.players = room.players.filter(
      p => p.id !== ws.playerId
    );

    addHistory(room, `${name} heeft het spel verlaten.`);

    if (room.players.length === 0) {
      rooms.delete(room.code);
      return;
    }

    /*
      Als de beheerder vertrekt krijgt de eerste speler
      automatisch de beheerderrol.
    */

    if (!room.players.some(p => p.admin)) {
      room.players[0].admin = true;
    }

    if (room.turn >= room.players.length) {
      room.turn = 0;
    }

    broadcast(room);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Dobbelspel server draait op poort ${PORT}`);
});

/* =========================================================
   HTML
========================================================= */

const HTML = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport"
      content="width=device-width, initial-scale=1.0,
      maximum-scale=1.0,user-scalable=no">

<title>Dobbelen 11/24</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: #075c3b;
  color: white;
  font-family: Arial, Helvetica, sans-serif;
}

.container {
  width: 100%;
  max-width: 650px;
  margin: 0 auto;
  padding: 15px;
}

.card {
  background: #06472f;
  border: 4px solid #d4af37;
  border-radius: 18px;
  padding: 20px;
  margin-bottom: 15px;
  box-shadow: 0 5px 20px rgba(0,0,0,.25);
}

h1 {
  text-align: center;
  color: #d4af37;
  margin: 5px 0 10px;
  font-size: 30px;
}

h2 {
  color: #d4af37;
  text-align: center;
}

.subtitle {
  text-align: center;
  opacity: .9;
  margin-bottom: 20px;
}

input {
  width: 100%;
  padding: 15px;
  border-radius: 10px;
  border: 2px solid #d4af37;
  margin-bottom: 10px;
  font-size: 18px;
  text-align: center;
  outline: none;
}

button {
  width: 100%;
  padding: 15px;
  margin-top: 8px;
  border: none;
  border-radius: 12px;
  background: #d4af37;
  color: #123b28;
  font-weight: bold;
  font-size: 18px;
  cursor: pointer;
}

button:disabled {
  opacity: .4;
  cursor: not-allowed;
}

.secondary {
  background: #0b7650;
  color: white;
  border: 2px solid #d4af37;
}

.danger {
  background: #8b2222;
  color: white;
}

.hidden {
  display: none !important;
}

.code {
  text-align: center;
  font-size: 42px;
  font-weight: bold;
  color: #d4af37;
  letter-spacing: 7px;
  margin: 10px 0;
}

.status {
  background: rgba(0,0,0,.2);
  border-radius: 10px;
  padding: 12px;
  text-align: center;
  margin: 10px 0;
}

.message {
  color: #ffeaa0;
  text-align: center;
  min-height: 25px;
  margin: 10px 0;
}

.dice {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin: 20px 0;
}

.die {
  aspect-ratio: 1;
  border-radius: 14px;
  background: white;
  color: #111;
  border: 4px solid #fff;
  font-size: 34px;
  font-weight: bold;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  cursor: pointer;
  padding: 0;
}

.die.held {
  background: #d4af37;
  border-color: white;
  transform: translateY(-7px);
}

.held-label {
  position: absolute;
  bottom: 2px;
  left: 0;
  right: 0;
  font-size: 10px;
  color: #123b28;
}

.players {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.player {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(0,0,0,.18);
  padding: 11px;
  border-radius: 10px;
}

.player.current {
  border: 2px solid #d4af37;
}

.money {
  color: #d4af37;
  font-weight: bold;
}

.history {
  max-height: 180px;
  overflow-y: auto;
  font-size: 14px;
}

.history div {
  padding: 7px;
  border-bottom: 1px solid rgba(255,255,255,.1);
}

.small {
  font-size: 13px;
  opacity: .8;
  text-align: center;
}

.warning {
  color: #ffd86b;
  text-align: center;
  font-weight: bold;
  margin: 8px 0;
}

@media (max-width: 400px) {

  h1 {
    font-size: 25px;
  }

  .card {
    padding: 15px;
  }

  .die {
    font-size: 27px;
  }

  .code {
    font-size: 34px;
  }
}

</style>
</head>

<body>

<div class="container">

  <div class="card" id="lobby">

    <h1>🎲 Dobbelen 11/24</h1>

    <div class="subtitle">
      Online spelen
    </div>

    <input
      id="name"
      placeholder="Jouw naam"
      maxlength="20"
      autocomplete="off"
    >

    <button onclick="createGame()">
      🎟️ NIEUW SPEL
    </button>

    <div style="height:10px"></div>

    <input
      id="code"
      placeholder="Spelcode"
      maxlength="4"
      autocomplete="off"
      style="text-transform:uppercase"
    >

    <button class="secondary" onclick="joinGame()">
      ➡️ DEELNEMEN
    </button>

    <div class="message" id="lobbyMessage"></div>

  </div>


  <div class="card hidden" id="room">

    <h1>🎲 Dobbelen 11/24</h1>

    <div class="small">
      Spelcode
    </div>

    <div class="code" id="roomCode">
      ----
    </div>

    <div class="small">
      Deel deze code met de andere spelers
    </div>

    <div class="status" id="gameStatus">
      Wachten...
    </div>

    <div class="players" id="players"></div>

    <button
      id="startButton"
      onclick="startGame()"
      class="hidden"
    >
      ▶️ START SPEL
    </button>

  </div>


  <div class="card hidden" id="game">

    <h2>🎲 Jouw beurt</h2>

    <div class="status">
      Worp:
      <strong id="rollNumber">0</strong>
      / 3
    </div>

    <div class="message" id="gameMessage"></div>

    <div class="warning" id="holdWarning">
      Zet minimaal 1 steen vast om verder te gaan.
    </div>

    <div class="dice" id="dice"></div>

    <button
      id="rollButton"
      onclick="rollDice()"
    >
      🎲 BEGIN WORP
    </button>

    <button
      id="finishButton"
      onclick="finishTurn()"
      class="secondary"
      disabled
    >
      ✅ BEURT AFRONDEN
    </button>

  </div>


  <div class="card hidden" id="historyCard">

    <h2>📜 Spelverloop</h2>

    <div class="history" id="history"></div>

  </div>

</div>


<script>

let socket = null;
let playerId = null;
let currentState = null;


/* ========================================================
   VERBINDING
======================================================== */

function connect() {

  if (
    socket &&
    (
      socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING
    )
  ) {
    return;
  }

  const protocol =
    location.protocol === "https:" ? "wss:" : "ws:";

  socket = new WebSocket(
    protocol + "//" + location.host
  );

  socket.onopen = () => {
    console.log("WebSocket verbonden");
  };

  socket.onmessage = event => {

    let data;

    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    handleMessage(data);
  };

  socket.onclose = () => {
    console.log("WebSocket gesloten");
  };

  socket.onerror = () => {
    showLobbyMessage(
      "Kan geen verbinding maken met de server."
    );
  };
}


function send(data) {

  if (!socket || socket.readyState !== WebSocket.OPEN) {

    showLobbyMessage(
      "Even wachten: verbinding wordt gemaakt..."
    );

    connect();

    setTimeout(() => {

      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
      }

    }, 500);

    return;
  }

  socket.send(JSON.stringify(data));
}


/* ========================================================
   NIEUW SPEL
======================================================== */

function createGame() {

  const name =
    document.getElementById("name").value.trim();

  if (!name) {
    showLobbyMessage("Vul eerst je naam in.");
    return;
  }

  connect();

  const action = () => {

    send({
      type: "create",
      name
    });

  };

  if (socket.readyState === WebSocket.OPEN) {
    action();
  } else {
    setTimeout(action, 500);
  }
}


/* ========================================================
   JOIN
======================================================== */

function joinGame() {

  const name =
    document.getElementById("name").value.trim();

  const code =
    document.getElementById("code").value.trim().toUpperCase();

  if (!name) {
    showLobbyMessage("Vul eerst je naam in.");
    return;
  }

  if (code.length !== 4) {
    showLobbyMessage("Vul een 4-cijferige spelcode in.");
    return;
  }

  connect();

  const action = () => {

    send({
      type: "join",
      name,
      code
    });

  };

  if (socket.readyState === WebSocket.OPEN) {
    action();
  } else {
    setTimeout(action, 500);
  }
}


/* ========================================================
   SERVER BERICHTEN
======================================================== */

function handleMessage(data) {

  if (data.type === "error") {

    showLobbyMessage(data.message);
    showGameMessage(data.message);

    return;
  }

  if (data.type === "created") {

    playerId = data.playerId;

    document.getElementById("roomCode").textContent =
      data.code;

    showRoom();

    return;
  }

  if (data.type === "joined") {

    playerId = data.playerId;

    document.getElementById("roomCode").textContent =
      data.code;

    showRoom();

    return;
  }

  if (data.type === "state") {

    currentState = data.state;

    renderState();

  }
}


/* ========================================================
   ROOM TONEN
======================================================== */

function showRoom() {

  document
    .getElementById("lobby")
    .classList.add("hidden");

  document
    .getElementById("room")
    .classList.remove("hidden");
}


/* ========================================================
   STATE
======================================================== */

function renderState() {

  if (!currentState) return;

  document.getElementById("roomCode").textContent =
    currentState.code;

  renderPlayers();

  renderHistory();

  if (currentState.started) {

    document
      .getElementById("game")
      .classList.remove("hidden");

    document
      .getElementById("historyCard")
      .classList.remove("hidden");

  }

  const me = currentState.players.find(
    p => p.id === playerId
  );

  const current =
    currentState.players[currentState.turn];

  if (current) {

    document.getElementById("gameStatus").textContent =
      currentState.started
        ? "Aan de beurt: " + current.name
        : "Wachten op start...";
  }

  if (currentState.started) {

    document.getElementById("gameMessage").textContent =
      currentState.message || "";

    document.getElementById("rollNumber").textContent =
      currentState.rolls;

    renderDice();

    const myTurn =
      current &&
      current.id === playerId;

    const heldCount =
      currentState.held.filter(Boolean).length;

    const canContinue =
      myTurn &&
      currentState.rolls > 0 &&
      heldCount > 0;

    document.getElementById("rollButton").disabled =
      !myTurn ||
      currentState.rolls >= 3 ||
      (
        currentState.rolls > 0 &&
        heldCount === 0
      );

    document.getElementById("finishButton").disabled =
      !canContinue;

    if (
      myTurn &&
      currentState.rolls > 0 &&
      heldCount === 0
    ) {

      document.getElementById("holdWarning")
        .classList.remove("hidden");

    } else {

      document.getElementById("holdWarning")
        .classList.add("hidden");

    }

    if (currentState.rolls === 0) {

      document.getElementById("rollButton")
        .textContent = "🎲 BEGIN WORP";

    } else if (currentState.rolls < 3) {

      document.getElementById("rollButton")
        .textContent = "🎲 OPNIEUW GOOIEN";

    } else {

      document.getElementById("rollButton")
        .textContent = "🎲 MAXIMAAL GEGOOID";

    }

    if (!myTurn) {

      document.getElementById("rollButton")
        .textContent = "⏳ WACHT OP JE BEURT";

    }
  }

  if (me) {

    // Alleen de beheerder ziet de startknop
    const startButton =
      document.getElementById("startButton");

    if (!currentState.started && me.admin) {

      startButton.classList.remove("hidden");

      startButton.disabled =
        currentState.players.length < 2;

    } else {

      startButton.classList.add("hidden");

    }
  }
}


/* ========================================================
   SPELERS
======================================================== */

function renderPlayers() {

  const box =
    document.getElementById("players");

  box.innerHTML = "";

  currentState.players.forEach((player, index) => {

    const div = document.createElement("div");

    div.className = "player";

    if (
      currentState.started &&
      index === currentState.turn
    ) {
      div.classList.add("current");
    }

    const left =
      document.createElement("span");

    left.textContent =
      (index === currentState.turn &&
       currentState.started
        ? "🎯 "
        : "") +
      player.name +
      (player.admin ? " 👑" : "");

    const right =
      document.createElement("span");

    right.className = "money";

    right.textContent =
      "€" + Number(player.money).toFixed(2);

    div.appendChild(left);
    div.appendChild(right);

    box.appendChild(div);
  });
}


/* ========================================================
   DOBBELSTENEN
======================================================== */

function renderDice() {

  const box =
    document.getElementById("dice");

  box.innerHTML = "";

  const current =
    currentState.players[currentState.turn];

  const myTurn =
    current &&
    current.id === playerId;

  currentState.dice.forEach((value, index) => {

    const button =
      document.createElement("button");

    button.className = "die";

    if (currentState.held[index]) {
      button.classList.add("held");
    }

    button.innerHTML =
      value +
      (
        currentState.held[index]
          ? '<span class="held-label">VAST</span>'
          : ""
      );

    button.disabled =
      !myTurn ||
      currentState.rolls === 0;

    button.onclick = () => {

      send({
        type: "hold",
        index
      });

    };

    box.appendChild(button);
  });
}


/* ========================================================
   START
======================================================== */

function startGame() {

  send({
    type: "start"
  });
}


/* ========================================================
   ROLL
======================================================== */

function rollDice() {

  send({
    type: "roll"
  });
}


/* ========================================================
   BEURT AFRONDEN
======================================================== */

function finishTurn() {

  send({
    type: "finish"
  });
}


/* ========================================================
   HISTORY
======================================================== */

function renderHistory() {

  const box =
    document.getElementById("history");

  box.innerHTML = "";

  [...currentState.history]
    .reverse()
    .forEach(item => {

      const div =
        document.createElement("div");

      div.textContent = item;

      box.appendChild(div);
    });
}


/* ========================================================
   MELDINGEN
======================================================== */

function showLobbyMessage(text) {

  document.getElementById(
    "lobbyMessage"
  ).textContent = text;
}

function showGameMessage(text) {

  document.getElementById(
    "gameMessage"
  ).textContent = text;
}


/* ========================================================
   START VERBINDING
======================================================== */

connect();

</script>

</body>
</html>`;
