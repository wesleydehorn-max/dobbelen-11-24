const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const rooms = new Map();

function makeCode() {
  let code;
  do {
    code = Math.random().toString(36).substring(2, 6).toUpperCase();
  } while (rooms.has(code));
  return code;
}

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(room) {
  const state = {
    type: "state",
    code: room.code,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      money: p.money,
      admin: p.admin,
      active: p.active
    })),
    messages: room.messages
  };

  room.players.forEach(p => send(p.ws, state));
}

function createRoom() {
  const room = {
    code: makeCode(),
    players: [],
    messages: []
  };

  rooms.set(room.code, room);
  return room;
}

function randomDice() {
  return [
    1 + Math.floor(Math.random() * 6),
    1 + Math.floor(Math.random() * 6),
    1 + Math.floor(Math.random() * 6),
    1 + Math.floor(Math.random() * 6),
    1 + Math.floor(Math.random() * 6)
  ];
}

const html = `
<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport"
content="width=device-width,initial-scale=1">

<title>Dobbelen 11/24</title>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #075b3b;
  color: white;
  font-family: Arial, sans-serif;
  text-align: center;
}

.page {
  max-width: 650px;
  margin: auto;
  padding: 20px;
}

h1 {
  font-size: 42px;
  margin: 25px 0;
}

.card {
  background: #06452d;
  border: 3px solid #d4af37;
  border-radius: 22px;
  padding: 25px;
  margin: 20px 0;
}

input {
  width: 90%;
  max-width: 400px;
  padding: 16px;
  margin: 8px;
  border: 0;
  border-radius: 12px;
  font-size: 19px;
}

button {
  background: #d4af37;
  color: #111;
  border: 0;
  border-radius: 12px;
  padding: 16px 25px;
  margin: 8px;
  font-size: 19px;
  font-weight: bold;
  cursor: pointer;
}

button:active {
  transform: scale(.97);
}

.hidden {
  display: none;
}

.code {
  font-size: 46px;
  font-weight: bold;
  letter-spacing: 8px;
  margin: 15px;
}

.player {
  background: #0b7049;
  padding: 14px;
  border-radius: 12px;
  margin: 8px 0;
  font-size: 18px;
}

.dice {
  font-size: 58px;
  margin: 20px 0;
}

.chat {
  height: 160px;
  overflow-y: auto;
  background: #033a25;
  border-radius: 12px;
  padding: 12px;
  text-align: left;
  margin-bottom: 10px;
}

.status {
  margin: 12px;
  font-size: 17px;
  opacity: .9;
}

.small {
  opacity: .75;
}
</style>
</head>

<body>

<div class="page">

  <h1>🎲 Dobbelen 11/24</h1>

  <div id="login" class="card">

    <h2>Online spelen</h2>

    <input
      id="name"
      placeholder="Je naam"
      autocomplete="off"
    >

    <br>

    <button id="newGame">
      🎟️ NIEUW SPEL
    </button>

    <br>

    <input
      id="room"
      placeholder="Spelcode"
      autocomplete="off"
      maxlength="4"
    >

    <br>

    <button id="joinGame">
      ➡️ DEELNEMEN
    </button>

    <div id="loginStatus" class="status"></div>

  </div>


  <div id="game" class="hidden">

    <div class="card">

      <h2>🎟️ Spelcode</h2>

      <div id="code" class="code">----</div>

      <div class="small">
        Deel deze code met de andere spelers
      </div>

    </div>


    <div class="card">

      <h2>👥 Spelers</h2>

      <div id="players"></div>

    </div>


    <div class="card">

      <h2>🎲 Dobbelen</h2>

      <div id="dice" class="dice">
        🎲 🎲 🎲 🎲 🎲
      </div>

      <button id="rollButton">
        BEGIN WORP
      </button>

      <div id="result" class="status">
        Wacht op de eerste worp
      </div>

    </div>


    <div class="card">

      <h2>💬 Chat</h2>

      <div id="chat" class="chat"></div>

      <input
        id="message"
        placeholder="Typ een bericht..."
        autocomplete="off"
      >

      <br>

      <button id="sendMessage">
        VERSTUUR
      </button>

    </div>

  </div>

</div>


<script>

let socket = null;
let myId = null;
let connected = false;


function setLoginStatus(text) {
  document.getElementById("loginStatus").textContent = text;
}


function connect(action, data) {

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      action: action,
      ...data
    }));
    return;
  }

  setLoginStatus("Verbinden...");

  const protocol =
    location.protocol === "https:"
      ? "wss://"
      : "ws://";

  socket = new WebSocket(
    protocol + location.host
  );


  socket.onopen = function() {

    connected = true;

    socket.send(JSON.stringify({
      action: action,
      ...data
    }));

  };


  socket.onmessage = function(event) {

    let data;

    try {
      data = JSON.parse(event.data);
    } catch (e) {
      return;
    }


    if (data.type === "joined") {

      myId = data.id;

      document
        .getElementById("login")
        .classList.add("hidden");

      document
        .getElementById("game")
        .classList.remove("hidden");

      document
        .getElementById("code")
        .textContent = data.code;

      setLoginStatus("");

      return;
    }


    if (data.type === "state") {

      document
        .getElementById("code")
        .textContent = data.code;

      renderPlayers(data.players);
      renderChat(data.messages);

      return;
    }


    if (data.type === "roll") {

      showDice(data.dice);

      return;
    }


    if (data.type === "error") {

      alert(data.message);

      setLoginStatus("");

      return;
    }

  };


  socket.onerror = function() {

    setLoginStatus(
      "Verbinding mislukt. Probeer opnieuw."
    );

  };


  socket.onclose = function() {

    connected = false;

  };

}


function createGame() {

  const name =
    document
      .getElementById("name")
      .value
      .trim();

  if (!name) {

    alert("Vul eerst je naam in.");

    return;
  }

  connect("create", {
    name: name
  });

}


function joinGame() {

  const name =
    document
      .getElementById("name")
      .value
      .trim();

  const code =
    document
      .getElementById("room")
      .value
      .trim()
      .toUpperCase();

  if (!name) {

    alert("Vul eerst je naam in.");

    return;
  }

  if (!code) {

    alert("Vul een spelcode in.");

    return;
  }

  connect("join", {
    name: name,
    code: code
  });

}


function renderPlayers(players) {

  const box =
    document.getElementById("players");

  box.innerHTML = "";

  players.forEach(function(player) {

    const div =
      document.createElement("div");

    div.className = "player";

    let admin =
      player.admin ? " 👑" : "";

    let status =
      player.active ? " 🟢" : " ⏸️";

    div.textContent =
      player.name +
      admin +
      " — €" +
      Number(player.money).toFixed(2) +
      status;

    box.appendChild(div);

  });

}


function renderChat(messages) {

  const box =
    document.getElementById("chat");

  box.innerHTML = "";

  messages.forEach(function(message) {

    const div =
      document.createElement("div");

    div.innerHTML = message;

    box.appendChild(div);

  });

  box.scrollTop = box.scrollHeight;

}


function showDice(dice) {

  const symbols = [
    "",
    "⚀",
    "⚁",
    "⚂",
    "⚃",
    "⚄",
    "⚅"
  ];

  document
    .getElementById("dice")
    .textContent =
      dice
        .map(function(value) {
          return symbols[value];
        })
        .join(" ");

  const total =
    dice.reduce(
     
