const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const rooms = new Map();

const MAX_PLAYERS = 4;
const START_BALANCE = 100;
const DICE_COUNT = 5;
const EURO_PER_EYE = 0.50;

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/health") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8"
    });

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


function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}


function id() {
  return Math.random()
    .toString(36)
    .slice(2, 10);
}


function cleanName(name) {
  name = typeof name === "string"
    ? name.trim()
    : "";

  return (name || "Speler").slice(0, 20);
}


function makeCode() {
  let code;

  do {
    code = Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase();
  } while (rooms.has(code));

  return code;
}


function state(room) {
  return {
    code: room.code,

    started: room.started,

    paused: room.paused,

    finished: room.finished,

    phase: room.phase,

    round: room.round,

    rollNumber: room.rollNumber,

    turnPlayerId: room.turnPlayerId,

    dice: room.dice,

    held: room.held,

    total: room.total,

    akkoord: room.akkoord,

    players: room.players.map(p => ({
      id: p.id,

      name: p.name,

      balance: Number(
        p.balance.toFixed(2)
      ),

      admin: p.id === room.adminId,

      connected: !!p.ws
    }))
  };
}


function broadcast(room, data) {
  for (const p of room.players) {
    send(p.ws, data);
  }
}


function broadcastState(room) {
  broadcast(room, {
    type: "state",
    state: state(room)
  });
}


function findPlayer(room, playerId) {
  return room.players.find(
    p => p.id === playerId
  );
}


function createRoom(name, ws) {
  const player = {
    id: id(),

    name: cleanName(name),

    balance: START_BALANCE,

    ws
  };


  const room = {
    code: makeCode(),

    adminId: player.id,

    players: [player],

    started: false,

    paused: false,

    finished: false,

    phase: "waiting",

    round: 0,

    rollNumber: 0,

    turnPlayerId: null,

    dice: [0, 0, 0, 0, 0],

    held: [
      false,
      false,
      false,
      false,
      false
    ],

    total: 0,

    akkoord: {}
  };


  rooms.set(room.code, room);

  ws.roomCode = room.code;

  ws.playerId = player.id;


  return {
    room,
    player
  };
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


  if (room.started) {
    return {
      error: "Het spel is al gestart."
    };
  }


  if (room.players.length >= MAX_PLAYERS) {
    return {
      error: "Het spel zit vol."
    };
  }


  const playerName = cleanName(name);


  if (
    room.players.some(
      p =>
        p.name.toLowerCase() ===
        playerName.toLowerCase()
    )
  ) {
    return {
      error: "Deze naam is al in gebruik."
    };
  }


  const player = {
    id: id(),

    name: playerName,

    balance: START_BALANCE,

    ws
  };


  room.players.push(player);


  ws.roomCode = room.code;

  ws.playerId = player.id;


  return {
    room,
    player
  };
}


function startGame(room) {
  if (room.players.length < 2) {
    return false;
  }


  room.started = true;

  room.paused = false;

  room.finished = false;

  room.phase = "earning";

  room.round = 1;

  room.rollNumber = 0;

  room.turnPlayerId =
    room.players[0].id;


  room.dice = [
    0,
    0,
    0,
    0,
    0
  ];


  room.held = [
    false,
    false,
    false,
    false,
    false
  ];


  room.total = 0;

  room.akkoord = {};


  broadcast(room, {
    type: "gameStarted",

    state: state(room)
  });


  return true;
}


function roll(room) {
  for (
    let i = 0;
    i < DICE_COUNT;
    i++
  ) {
    if (!room.held[i]) {
      room.dice[i] =
        1 +
        Math.floor(
          Math.random() * 6
        );
    }
  }


  room.rollNumber++;


  room.total =
    room.dice.reduce(
      (a, b) => a + b,
      0
    );


  if (
    room.total >= 11 &&
    room.total <= 24
  ) {
    room.phase = "pay";
  } else {
    room.phase = "earn";
  }


  broadcast(room, {
    type: "diceRolled",

    state: state(room)
  });
}


function finishTurn(room) {
  const current =
    findPlayer(
      room,
      room.turnPlayerId
    );


  if (!current) {
    return;
  }


  const result =
    room.total >= 11 &&
    room.total <= 24
      ? "pay"
      : "earn";


  const number =
    result === "pay"
      ? room.total - 10
      : Math.abs(room.total - 10);


  const amount =
    number * EURO_PER_EYE;


  const opponents =
    room.players.filter(
      p =>
        p.id !== current.id &&
        p.balance > 0
    );


  if (result === "earn") {

    current.balance += amount;

  } else if (opponents.length) {

    const payment =
      Math.min(
        current.balance,
        amount
      );


    current.balance -= payment;


    const each =
      payment / opponents.length;


    opponents.forEach(p => {
      p.balance += each;
    });
  }


  room.players.forEach(p => {
    p.balance =
      Math.max(
        0,
        Number(
          p.balance.toFixed(2)
        )
      );
  });


  const alive =
    room.players.filter(
      p => p.balance > 0
    );


  if (alive.length <= 1) {

    room.finished = true;

    room.phase = "finished";


    broadcast(room, {

      type: "gameFinished",

      winner:
        alive.length === 1
          ? {
              id: alive[0].id,

              name: alive[0].name,

              balance: alive[0].balance
            }
          : null,

      state: state(room)
    });


    return;
  }


  const currentIndex =
    room.players.findIndex(
      p => p.id === current.id
    );


  let nextIndex =
    currentIndex;


  for (
    let i = 1;
    i <= room.players.length;
    i++
  ) {

    const index =
      (currentIndex + i) %
      room.players.length;


    if (
      room.players[index].balance > 0
    ) {

      nextIndex = index;

      break;
    }
  }


  room.turnPlayerId =
    room.players[nextIndex].id;


  room.round++;

  room.rollNumber = 0;


  room.dice = [
    0,
    0,
    0,
    0,
    0
  ];


  room.held = [
    false,
    false,
    false,
    false,
    false
  ];


  room.total = 0;

  room.phase = "earning";

  room.akkoord = {};


  broadcast(room, {
    type: "turnChanged",

    state: state(room)
  });
}


function handleMessage(ws, data) {

  const action =
    data.action ||
    data.type;


  if (
    action === "create" ||
    action === "createRoom"
  ) {

    if (ws.roomCode) {

      return send(ws, {
        type: "error",

        message:
          "Je zit al in een spel."
      });
    }


    const result =
      createRoom(
        data.name,
        ws
      );


    return send(ws, {

      type: "roomCreated",

      code: result.room.code,

      player: {

        id: result.player.id,

        name: result.player.name,

        admin: true,

        balance:
          result.player.balance

      },

      state:
        state(result.room)
    });
  }


  if (
    action === "join" ||
    action === "joinRoom"
  ) {

    if (ws.roomCode) {

      return send(ws, {

        type: "error",

        message:
          "Je zit al in een spel."
      });
    }


    const result =
      joinRoom(
        data.code,
        data.name,
        ws
      );


    if (result.error) {

      return send(ws, {

        type: "error",

        message:
          result.error
      });
    }


    send(ws, {

      type: "joined",

      code:
        result.room.code,

      player: {

        id:
          result.player.id,

        name:
          result.player.name,

        admin: false,

        balance:
          result.player.balance
      },

      state:
        state(result.room)
    });


    return broadcast(
      result.room,

      {

        type:
          "playerJoined",

        player: {

          id:
            result.player.id,

          name:
            result.player.name
        },

        state:
          state(result.room)
      }
    );
  }


  const room =
    rooms.get(ws.roomCode);


  if (!room) {

    return send(ws, {

      type: "error",

      message:
        "Je zit niet in een spel."
    });
  }


  const player =
    findPlayer(
      room,
      ws.playerId
    );


  if (!player) {

    return send(ws, {

      type: "error",

      message:
        "Speler niet gevonden."
    });
  }


  if (action === "state") {

    return send(ws, {

      type: "state",

      state:
        state(room)
    });
  }


  if (
    action === "start" ||
    action === "startGame"
  ) {

    if (
      player.id !==
      room.adminId
    ) {

      return send(ws, {

        type: "error",

        message:
          "Alleen de beheerder kan starten."
      });
    }


    if (
      room.players.length < 2
    ) {

      return send(ws, {

        type: "error",

        message:
          "Er moeten minimaal 2 spelers zijn."
      });
    }


    if (room.started) {

      return send(ws, {

        type: "error",

        message:
          "Het spel is al gestart."
      });
    }


    startGame(room);

    return;
  }


  if (
    action === "roll" ||
    action === "throw"
  ) {

    if (room.paused) {

      return send(ws, {

        type: "error",

        message:
          "Het spel staat op pauze."
      });
    }


    if (!room.started) {

      return send(ws, {

        type: "error",

        message:
          "Het spel is nog niet gestart."
      });
    }


    if (room.finished) {
      return;
    }


    if (
      room.turnPlayerId !==
      player.id
    ) {

      return send(ws, {

        type: "error",

        message:
          "Je bent niet aan de beurt."
      });
    }


    roll(room);

    return;
  }


  if (
    action === "hold" ||
    action === "holdDice"
  ) {

    if (
      room.turnPlayerId !==
      player.id
    ) {

      return send(ws, {

        type: "error",

        message:
          "Je bent niet aan de beurt."
      });
    }


    const indexes =
      Array.isArray(data.indexes)
        ? data.indexes
        : (
          Array.isArray(
            data.indices
          )
            ? data.indices
            : []
        );


    indexes.forEach(index => {

      if (
        Number.isInteger(index) &&
        index >= 0 &&
        index < DICE_COUNT
      ) {

        room.held[index] = true;
      }
    });


    return broadcastState(room);
  }


  if (action === "holdAll") {

    if (
      room.turnPlayerId !==
      player.id
    ) {

      return send(ws, {

        type: "error",

        message:
          "Je bent niet aan de beurt."
      });
    }


    room.held = [
      true,
      true,
      true,
      true,
      true
    ];


    return broadcastState(room);
  }


  if (
    action === "akkoord" ||
    action === "agree"
  ) {

    if (
      room.turnPlayerId !==
      player.id
    ) {

      return send(ws, {

        type: "error",

        message:
          "Je bent niet aan de beurt."
      });
    }


    room.akkoord[player.id] =
      true;


    const active =
      room.players.filter(
        p => p.balance > 0
      );


    const allAgreed =
      active.every(
        p =>
          room.akkoord[p.id]
      );


    if (allAgreed) {

      return finishTurn(room);
    }


    return broadcastState(room);
  }


  if (
    action === "pause" ||
    action === "togglePause"
  ) {

    if (
      player.id !==
      room.adminId
    ) {

      return send(ws, {

        type: "error",

        message:
          "Alleen de beheerder kan pauzeren."
      });
    }


    room.paused =
      !room.paused;


    return broadcast(room, {

      type: "paused",

      paused:
        room.paused,

      state:
        state(room)
    });
  }


  if (
    action === "delete" ||
    action === "deleteRoom"
  ) {

    if (
      player.id !==
      room.adminId
    ) {

      return send(ws, {

        type: "error",

        message:
          "Alleen de beheerder kan het spel verwijderen."
      });
    }


    broadcast(room, {

      type:
        "roomDeleted",

      message:
        "Het spel is verwijderd door de beheerder."
    });


    rooms.delete(
      room.code
    );


    return;
  }


  if (
    action === "chat" ||
    action === "message"
  ) {

    const message =
      typeof data.message === "string"
        ? data.message
            .trim()
            .slice(0, 300)
        : "";


    if (!message) {
      return;
    }


    return broadcast(room, {

      type: "chat",

      message: {

        id: id(),

        playerId:
          player.id,

        name:
          player.name,

        message,

        time:
          Date.now()
      }
    });
  }


  send(ws, {

    type: "error",

    message:
      "Onbekende opdracht: " +
      String(action)
  });
}


wss.on("connection", ws => {

  ws.roomCode = null;

  ws.playerId = null;


  send(ws, {

    type:
      "connected",

    message:
      "Verbonden met de spelserver."
  });


  ws.on("message", raw => {

    try {

      const data =
        JSON.parse(
          raw.toString()
        );


      handleMessage(
        ws,
        data
      );

    } catch (error) {

      send(ws, {

        type: "error",

        message:
          "Ongeldige opdracht."
      });
    }
  });


  ws.on("close", () => {

    const room =
      rooms.get(
        ws.roomCode
      );


    if (!room) {
      return;
    }


    const player =
      findPlayer(
        room,
        ws.playerId
      );


    if (!player) {
      return;
    }


    player.ws = null;


    broadcast(room, {

      type:
        "playerDisconnected",

      playerId:
        player.id,

      playerName:
        player.name,

      state:
        state(room)
    });
  });
});


server.listen(
  PORT,
  () => {

    console.log(
      "Dobbelspel server draait op poort " +
      PORT
    );
  }
);
