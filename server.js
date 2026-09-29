const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const rooms = new Map();

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = "";
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));
  return code;
}

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(room, data) {
  room.players.forEach(function(player) {
    send(player.ws, data);
  });
}

function publicState(room) {
  return {
    code: room.code,
    started: room.started,
    turn: room.turn,
    dice: room.dice,
    players: room.players.map(function(player) {
      return {
        id: player.id,
        name: player.name,
        money: player.money,
        admin: player.admin,
        connected: !!player.ws
      };
    }),
    messages: room.messages.slice(-30)
  };
}

function state(room) {
  broadcast(room, {
    type: "state",
    state: publicState(room)
  });
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2) +
         Date.now().toString(36);
}

function createRoom(name, ws) {
  const code = makeCode();

  const player = {
    id: cryptoRandomId(),
    name: name,
    money: 100,
    admin: true,
    ws: ws
  };

  const room = {
    code: code,
    players: [player],
    started: false,
    turn: 0,
    dice: [1, 1, 1, 1, 1],
    messages: []
  };

  rooms.set(code, room);

  ws.roomCode = code;
  ws.playerId = player.id;

  return room;
}

function joinRoom(code, name, ws) {
  const room = rooms.get(code.toUpperCase());

  if (!room) {
    return {
      error: "Spelcode bestaat niet."
    };
  }

  if (room.players.length >= 4) {
    return {
      error: "Dit spel zit al vol (maximaal 4 spelers)."
    };
  }

  const existing = room.players.find(function(player) {
    return player.name.toLowerCase() === name.toLowerCase();
  });

  if (existing) {
    return {
      error: "Deze naam zit al in het spel."
    };
  }

  const player = {
    id: cryptoRandomId(),
    name: name,
    money: 100,
    admin: false,
    ws: ws
  };

  room.players.push(player);

  ws.roomCode = room.code;
  ws.playerId = player.id;

  return {
    room: room,
    player: player
  };
}

function startGame(room) {
  if (room.players.length < 2) {
    return false;
  }

  room.started = true;
  room.turn = Math.floor(Math.random() * room.players.length);
  room.dice = [1, 1, 1, 1, 1];

  return true;
}

function roll(room, ws) {
  const playerIndex = room.players.findIndex(function(player) {
    return player.id === ws.playerId;
  });

  if (playerIndex < 0) {
    return;
  }

  if (!room.started) {
    if (room.players[0].id !== ws.playerId) {
      return send(ws, {
        type: "error",
        message: "De beheerder moet het spel starten."
      });
    }

    if (!startGame(room)) {
      return send(ws, {
        type: "error",
        message: "Er zijn minimaal 2 spelers nodig."
      });
    }
  }

  if (room.turn !== playerIndex) {
    return send(ws, {
      type: "error",
      message: "Het is niet jouw beurt."
    });
  }

  room.dice = Array.from(
    { length: 5 },
    function() {
      return Math.floor(Math.random() * 6) + 1;
    }
  );

  room.turn = (room.turn + 1) % room.players.length;
}

const html = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport"
content="width=device-width,initial-scale=1">
<title>Dobbelen 11/24</title>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #075c3b;
  color: #fff;
  font-family: Arial, sans-serif;
  min-height: 100vh;
}

h1 {
  font-size: 38px;
  margin: 20px 0;
  text-align: center;
}

.wrap {
  max-width: 720px;
  margin: auto;
  padding: 18px;
}

.card {
  border: 4px solid #d4af37;
  border-radius: 28px;
  background: #06472f;
  padding: 24px;
  margin: 18px 0;
  box-shadow: 0 8px 25px #0003;
}

input {
  width: 100%;
  padding: 17px;
  border: 0;
  border-radius: 14px;
  font-size: 20px;
  margin: 8px 0 14px;
}

button {
  border: 0;
  border-radius: 14px;
  padding: 15px 22px;
  background: #d4af37;
  color: #111;
  font-size: 19px;
  font-weight: 800;
  margin: 6px;
  cursor: pointer;
}

button.blue {
  background: #174a9c;
  color: #fff;
}

button:disabled {
  opacity: 0.45;
}

.row {
  text-align: center;
}

.code {
  font-size: 52px;
  font-weight: 900;
  letter-spacing: 9px;
  text-align: center;
  margin: 15px 0;
}

.players div {
  background: #0d7a4d;
  padding: 13px;
  border-radius: 13px;
  margin: 8px 0;
  font-size: 18px;
}

.dice {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin: 20px 0;
}

.die {
  width: 78px;
  height: 78px;
  background: #fff;
  color: #111;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 52px;
  font-weight: 900;
  box-shadow: 0 5px 10px #0005;
}

.turn {
  text-align: center;
  font-size: 23px;
  font-weight: 800;
  margin: 15px;
}

.chat {
  height: 190px;
  overflow: auto;
  background: #032f20;
  border-radius: 12px;
  padding: 12px;
  text-align: left;
}

.chat p {
  margin: 6px 0;
}

.hidden {
  display: none;
}

.small {
  opacity: 0.8;
  text-align: center;
}

.error {
  background: #8d1f1f;
  padding: 12px;
  border-radius: 12px;
  margin: 10px 0;
  font-weight: 700;
}
</style>
</head>

<body>

<div class="wrap">

<h1>🎲 Dobbelen 11/24</h1>

<div id="lobby" class="card">

<h2 style="text-align:center">
Online spelen
</h2>

<input
id="name"
placeholder="Jouw naam"
maxlength="20">

<div class="row">
<button onclick="createGame()">
🎟️ NIEUW SPEL
</button>
</div>

<input
id="code"
placeholder="Spelcode"
maxlength="4"
style="text-transform:uppercase">

<div class="row">
<button onclick="joinGame()">
➡️ DEELNEMEN
</button>
</div>

<div id="status" class="small"></div>
<div id="error"></div>

</div>

<div id="game" class="hidden">

<div class="card">

<h2 style="text-align:center">
🎟️ Spelcode
</h2>

<div id="roomCode" class="code"></div>

<div class="small">
Geef deze code aan de andere spelers.
</div>

</div>

<div class="card">

<h2>👥 Spelers</h2>

<div id="players" class="players"></div>

</div>

<div class="card">

<h2 style="text-align:center">
🎲 Dobbelen
</h2>

<div id="turn" class="turn"></div>

<div id="dice" class="dice"></div>

<div class="row">

<button
id="startRoll"
onclick="doRoll()">
BEGIN WORP
</button>

</div>

<div class="small">
Dit is eerst een multiplayer-test.
De volledige 11/24-regels voegen we daarna toe.
</div>

</div>

<div class="card">

<h2>💬 Chat</h2>

<div id="chat" class="chat"></div>

<input
id="msg"
placeholder="Typ een bericht"
maxlength="200">

<div class="row">

<button
class="blue"
onclick="sendChat()">
VERSTUUR
</button>

</div>

</div>

</div>

</div>

<script>

let ws = null;
let myId = null;
let room = null;

const $ = function(id) {
  return document.getElementById(id);
};

function showError(text) {
  $("error").textContent = text || "";

  if (text) {
    $("error").className = "error";
  } else {
    $("error").className = "";
  }
}

function connect(action, data) {

  showError("");
  $("status").textContent = "Verbinden...";

  const protocol =
    location.protocol === "https:"
      ? "wss://"
      : "ws://";

  ws = new WebSocket(
    protocol + location.host
  );

  ws.onopen = function() {
    ws.send(JSON.stringify({
      action: action,
      ...data
    }));
  };

  ws.onmessage = function(event) {

    const message =
      JSON.parse(event.data);

    if (message.type === "error") {

      showError(message.message);
      $("status").textContent = "";

      return;
    }

    if (message.type === "connected") {

      myId = message.id;
      $("status").textContent = "";
    }

    if (message.type === "state") {

      room = message.state;
      render();
    }
  };

  ws.onclose = function() {

    if (room) {
      $("status").textContent =
        "Verbinding verbroken.";
    }
  };
}

function validName() {

  const name =
    $("name").value.trim();

  if (!name) {

    showError(
      "Vul eerst je naam in."
    );

    return null;
  }

  return name;
}

function createGame() {

  const name = validName();

  if (!name) return;

  connect("create", {
    name: name
  });
}

function joinGame() {

  const name = validName();

  if (!name) return;

  const code =
    $("code").value.trim().toUpperCase();

  if (!code) {

    showError(
      "Vul eerst de spelcode in."
    );

    return;
  }

  connect("join", {
    name: name,
    code: code
  });
}

function render() {

  $("lobby").classList.add("hidden");
  $("game").classList.remove("hidden");

  $("roomCode").textContent =
    room.code;

  $("players").innerHTML =
    room.players.map(function(player, index) {

      return "<div>" +
        (player.admin ? "👑 " : "") +
        esc(player.name) +
        " — €" +
        Number(player.money).toFixed(2) +
        " " +
        (player.connected ? "🟢" : "⚪") +
        (index === room.turn ? " 🎲" : "") +
        "</div>";

    }).join("");

  $("dice").innerHTML =
    room.dice.map(function(value) {

      return '<div class="die">' +
        value +
        "</div>";

    }).join("");

  const current =
    room.players[room.turn];

  if (room.started) {

    $("turn").textContent =
      current
        ? "Aan de beurt: " + current.name
        : "";

  } else {

    $("turn").textContent =
      "Wacht op minimaal 2 spelers.";
  }

  $("startRoll").textContent =
    room.started
      ? "🎲 GOOIEN"
      : "🎲 BEGIN WORP";

  $("startRoll").disabled =
    room.started &&
    (!current || current.id !== myId);

  $("chat").innerHTML =
    room.messages.map(function(message) {

      return "<p><b>" +
        esc(message.name) +
        ":</b> " +
        esc(message.text) +
        "</p>";

    }).join("");

  $("chat").scrollTop =
    $("chat").scrollHeight;
}

function doRoll() {

  if (ws && ws.readyState === 1) {

    ws.send(JSON.stringify({
      action: "roll"
    }));
  }
}

function sendChat() {

  const text =
    $("msg").value.trim();

  if (
    !text ||
    !ws ||
    ws.readyState !== 1
  ) {
    return;
  }

  ws.send(JSON.stringify({
    action: "chat",
    text: text
  }));

  $("msg").value = "";
}

$("msg").addEventListener(
  "keydown",
  function(event) {

    if (event.key === "Enter") {
      sendChat();
    }

  }
);

function esc(value) {

  return String(value).replace(
    /[&<>"']/g,
    function(character) {

      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[character];

    }
  );
}

</script>

</body>
</html>`;

const server = http.createServer(
  function(req, res) {

    res.writeHead(200, {
      "Content-Type":
        "text/html; charset=utf-8",
      "Cache-Control":
        "no-store"
    });

    res.end(html);
  }
);

const wss =
  new WebSocket.Server({
    server: server
  });

wss.on("connection", function(ws) {

  ws.isAlive = true;

  ws.on("pong", function() {
    ws.isAlive = true;
  });

  ws.on("message", function(raw) {

    let data;

    try {
      data = JSON.parse(
        raw.toString()
      );
    } catch {
      return;
    }

    if (data.action === "create") {

      const name =
        String(data.name || "")
          .trim()
          .slice(0, 20);

      if (!name) {

        return send(ws, {
          type: "error",
          message: "Vul een naam in."
        });
      }

      const room =
        createRoom(name, ws);

      send(ws, {
        type: "connected",
        id: ws.playerId
      });

      state(room);

      return;
    }

    if (data.action === "join") {

      const name =
        String(data.name || "")
          .trim()
          .slice(0, 20);

      const code =
        String(data.code || "")
          .trim()
          .toUpperCase();

      if (!name) {

        return send(ws, {
          type: "error",
          message: "Vul een naam in."
        });
      }

      const result =
        joinRoom(code, name, ws);

      if (result.error) {

        return send(ws, {
          type: "error",
          message: result.error
        });
      }

      send(ws, {
        type: "connected",
        id: ws.playerId
      });

      state(result.room);

      return;
    }

    const room =
      ws.roomCode
        ? rooms.get(ws.roomCode)
        : null;

    if (!room) return;

    if (data.action === "roll") {

      roll(room, ws);
      state(room);

      return;
    }

    if (data.action === "chat") {

      const player =
        room.players.find(function(p) {
          return p.id === ws.playerId;
        });

      const text =
        String(data.text || "")
          .trim()
          .slice(0, 200);

      if (player && text) {

        room.messages.push({
          name: player.name,
          text: text
        });

        state(room);
      }
    }
  });

  ws.on("close", function() {

    const room =
      ws.roomCode
        ? rooms.get(ws.roomCode)
        : null;

    if (room) {

      const player =
        room.players.find(function(p) {
          return p.id === ws.playerId;
        });

      if (player) {
        player.ws = null;
      }

      state(room);
    }
  });
});

setInterval(function() {

  wss.clients.forEach(function(ws) {

    if (!ws.isAlive) {
      return ws.terminate();
    }

    ws.isAlive = false;
    ws.ping();

  });

}, 30000);

server.listen(
  PORT,
  "0.0.0.0",
  function() {

    console.log(
      "Dobbelen 11/24 draait op poort " +
      PORT
    );
  }
);
