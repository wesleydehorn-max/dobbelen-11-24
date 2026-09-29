const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Dobbelspel server draait.");
    return;
  }

  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      rooms: rooms.size
    }));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

const wss = new WebSocket.Server({ server });

/* =========================================================
   OPSLAG
========================================================= */

const rooms = new Map();

const MAX_PLAYERS = 4;
const START_BALANCE = 100;
const DICE_COUNT = 5;
const EURO_PER_EYE = 0.50;


/* =========================================================
   HULPFUNCTIES
========================================================= */

function randomNumber(max) {
  return 1 + Math.floor(Math.random() * max);
}

function makeId() {
  return Math.random()
    .toString(36)
    .slice(2, 10);
}

function makePlayerId() {
  return makeId() + makeId();
}

function makeRoomCode() {
  let code;

  do {
    code = Math.random()
      .toString(36)
      .substring(2, 6)
      .toUpperCase();
  } while (rooms.has(code));

  return code;
}

function cleanName(name) {
  if (typeof name !== "string") {
    return "Speler";
  }

  name = name.trim();

  if (!name) {
    return "Speler";
  }

  return name.substring(0, 20);
}

function send(ws, data) {
  if (!ws) return;

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(room, data) {
  if (!room) return;

  const message = JSON.stringify(data);

  for (const player of room.players) {
    if (
      player.ws &&
      player.ws.readyState === WebSocket.OPEN
    ) {
      player.ws.send(message);
    }
  }
}

function broadcastState(room) {
  broadcast(room, {
    type: "state",
    state: getState(room)
  });
}

function getState(room) {
  return {
    code: room.code,

    paused: room.paused,

    started: room.started,

    phase: room.phase,

    turnPlayerId: room.turnPlayerId,

    round: room.round,

    rollNumber: room.rollNumber,

    dice: room.dice,

    held: room.held,

    total: room.total,

    akkoord: room.akkoord,

    players: room.players.map(player => ({
      id: player.id,
      name: player.name,
      balance: Number(player.balance.toFixed(2)),
      connected: !!player.ws
    }))
  };
}


/* =========================================================
   SPELER / ROOM
========================================================= */

function createRoom(adminName, ws) {
  const code = makeRoomCode();

  const admin = {
    id: makePlayerId(),
    name: cleanName(adminName),
    balance: START_BALANCE,
    ws,
    admin: true
  };

  const room = {
    code,

    adminId: admin.id,

    players: [admin],

    started: false,

    paused: false,

    phase: "waiting",

    round: 0,

    turnPlayerId: null,

    rollNumber: 0,

    dice: [0, 0, 0, 0, 0],

    held: [false, false, false, false, false],

    total: 0,

    akkoord: {},

    chat: []
  };

  rooms.set(code, room);

  ws.roomCode = code;
  ws.playerId = admin.id;

  return {
    room,
    player: admin
  };
}

function findPlayer(room, playerId) {
  return room.players.find(
    player => player.id === playerId
  );
}

function joinRoom(code, name, ws) {
  code = String(code || "")
    .trim()
    .toUpperCase();

  const room = rooms.get(code);

  if (!room) {
    return {
      error: "Spelcode bestaat niet."
    };
  }

  if (room.players.length >= MAX_PLAYERS) {
    return {
      error: "Het spel zit al vol."
    };
  }

  if (room.started) {
    return {
      error: "Het spel is al gestart."
    };
  }

  const playerName = cleanName(name);

  const existingName = room.players.some(
    player =>
      player.name.toLowerCase() ===
      playerName.toLowerCase()
  );

  if (existingName) {
    return {
      error: "Deze naam is al in gebruik."
    };
  }

  const player = {
    id: makePlayerId(),
    name: playerName,
    balance: START_BALANCE,
    ws,
    admin: false
  };

  room.players.push(player);

  ws.roomCode = code;
  ws.playerId = player.id;

  return {
    room,
    player
  };
}


/* =========================================================
   SPEL STARTEN
========================================================= */

function startGame(room) {
  if (!room) return;

  if (room.players.length < 2) {
    return;
  }

  if (room.players.length > MAX_PLAYERS) {
    return;
  }

  room.started = true;
  room.paused = false;

  room.phase = "earning";

  room.round = 1;

  room.rollNumber = 0;

  room.dice = [0, 0, 0, 0, 0];

  room.held = [false, false, false, false, false];

  room.total = 0;

  room.akkoord = {};

  room.turnPlayerId =
    room.players[0].id;

  broadcast(room, {
    type: "gameStarted",
    state: getState(room)
  });
}


/* =========================================================
   DOBBELSTENEN
========================================================= */

function calculateTotal(room) {
  return room
