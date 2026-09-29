const http = require("http");
const crypto = require("crypto");

const PORT = process.env.PORT || 10000;
const rooms = new Map();

function id() {
  return crypto.randomBytes(8).toString("hex");
}

function roomCode() {
  let c;
  do {
    c = Math.random().toString(36).substring(2, 6).toUpperCase();
  } while (rooms.has(c));
  return c;
}

function euro(n) {
  return "€" + Number(n).toFixed(2).replace(".", ",");
}

function targetFor(total) {
  const m = {
    5:6, 6:5, 7:4, 8:3, 9:2, 10:1,
    12:1, 13:2, 14:3, 15:4, 16:5, 17:6,
    18:6, 19:5, 20:4, 21:3, 22:2, 23:1,
    25:1, 26:2, 27:3, 28:4, 29:5, 30:6
  };
  return m[total] || 0;
}

function isSpecial(total) {
  return total === 11 || total === 24;
}

function diceSum(dice) {
  return dice.reduce((a, b) => a + b, 0);
}

function sameFive(dice) {
  return dice.length === 5 && dice.every(x => x === dice[0]);
}

function roll(n) {
  const a = [];
  for (let i = 0; i < n; i++) {
    a.push(Math.floor(Math.random() * 6) + 1);
  }
  return a;
}

function nextPlayer(room) {
  room.current = (room.current + 1) % room.players.length;
  room.held = [];
  room.dice = [];
  room.phase = "ready";
  room.message = room.players[room.current].name + " is aan de beurt.";
}

function collect(room, player, amount) {
  for (const p of room.players) {
    if (p.id === player.id) continue;

    const take = Math.min(p.money, amount);
    p.money -= take;
    player.money += take;
  }
}

function pay(room, player, amount) {
  for (const p of room.players) {
    if (p.id === player.id) continue;

    const take = Math.min(player.money, amount);
    player.money -= take;
    p.money += take;
  }
}

function settle(room, player, dice) {
  const total = diceSum(dice);

  if (total === 11 || total === 24) {
    pay(room, player, 0.50);
    room.message =
      player.name +
      " gooide " +
      total +
      ". €0,50 naar iedere tegenstander.";
    room.phase = "done";
    return "special";
  }

  const target = targetFor(total);

  if (!target) {
    room.message =
      player.name +
      " heeft geen doelsteen gevonden. MIS!";
    room.phase = "done";
    return "miss";
  }

  const count = dice.filter(x => x === target).length;
  const amount = count * target * 0.50;

  if (amount > 0) {
    collect(room, player, amount);
    room.message =
      player.name +
      " vindt " +
      count +
      "x " +
      target +
      " → +" +
      euro(amount) +
      " per tegenstander.";
  }

  for (const d of dice) {
    room.held.push(d);
  }

  room.phase = room.held.length >= 5 ? "earn" : "can-reroll";

  return "target";
}

function publicRoom(room) {
  return {
    code: room.code,
    started: room.started,
    host: room.host,
    current: room.current,
    phase: room.phase,
    dice: room.dice,
    held: room.held,
    target: room.target,
    message: room.message,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      money: Number(p.money.toFixed(2))
    }))
  };
}

function playerByToken(room, token) {
  return room.players.find(p => p.token === token);
}

function json(res, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function readBody(req) {
  return new Promise(resolve => {
    let data = "";
    req.on("data", c => data += c);
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

const HTML = String.raw`<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>DOBBELEN 11/24</title>

<style>
*{
  box-sizing:border-box;
  -webkit-tap-highlight-color:transparent;
}

body{
  margin:0;
  font-family:Arial,sans-serif;
  background:
    radial-gradient(circle at top,#243044 0,#10151d 45%,#070a0e 100%);
  color:white;
  min-height:100vh;
}

button,input{
  font:inherit;
}

.app{
  max-width:900px;
  margin:auto;
  padding:14px;
}

.logo{
  text-align:center;
  font-size:32px;
  font-weight:900;
  letter-spacing:2px;
  margin:10px 0 18px;
  color:#f4c542;
  text-shadow:0 3px 10px #000;
}

.card{
  background:rgba(20,27,37,.96);
  border:1px solid #3b4657;
  border-radius:18px;
  padding:18px;
  margin-bottom:14px;
  box-shadow:0 10px 30px #0008;
}

h2{
  margin:0 0 14px;
}

input{
  width:100%;
  padding:15px;
  border-radius:12px;
  border:1px solid #566273;
  background:#0d1219;
  color:white;
  outline:none;
  margin-bottom:10px;
}

input:focus{
  border-color:#f4c542;
}

button{
  border:0;
  border-radius:12px;
  padding:14px 18px;
  font-weight:900;
  cursor:pointer;
  margin:4px;
}

.green{
  background:#18b66a;
  color:white;
}

.yellow{
  background:#f4c542;
  color:#111;
}

.red{
  background:#d94b4b;
  color:white;
}

.blue{
  background:#3276d8;
  color:white;
}

.dark{
  background:#293342;
  color:white;
}

button:disabled{
  opacity:.4;
}

.center{
  text-align:center;
}

.players{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
  gap:10px;
}

.player{
  background:#111821;
  border:1px solid #3d4858;
  border-radius:12px;
  padding:12px;
}

.player.active{
  border:2px solid #f4c542;
  box-shadow:0 0 14px #f4c54255;
}

.money{
  color:#63e69b;
  font-weight:bold;
  margin-top:5px;
}

.dice{
  display:flex;
  flex-wrap:wrap;
  justify-content:center;
  gap:10px;
  margin:15px 0;
}

.die{
  width:64px;
  height:64px;
  background:#fff;
  color:#111;
  border-radius:12px;
  display:grid;
  place-items:center;
  font-size:0;
  box-shadow:0 5px 15px #0008;
  position:relative;
}

.die.held{
  background:#f4c542;
  transform:translateY(-5px);
  box-shadow:0 8px 18px #f4c54255;
}

.pips{
  width:46px;
  height:46px;
  display:grid;
  grid-template-columns:repeat(3,1fr);
  grid-template-rows:repeat(3,1fr);
  gap:3px;
}

.pip{
  width:9px;
  height:9px;
  background:#111;
  border-radius:50%;
  align-self:center;
  justify-self:center;
}

.empty{
  visibility:hidden;
}

.status{
  text-align:center;
  font-size:18px;
  font-weight:bold;
  min-height:28px;
  margin:10px 0;
}

.big{
  font-size:24px;
  color:#f4c542;
}

.small{
  color:#aeb7c5;
  font-size:13px;
}

.chat{
  max-height:180px;
  overflow:auto;
  background:#0b1016;
  padding:10px;
  border-radius:10px;
  margin-bottom:10px;
}

.chatline{
  margin-bottom:6px;
}

.chatname{
  color:#f4c542;
  font-weight:bold;
}

.row{
  display:flex;
  gap:6px;
}

.row input{
  margin:0;
  flex:1;
}

.invite{
  background:#0b1016;
  border:1px dashed #596779;
  border-radius:10px;
  padding:12px;
  word-break:break-all;
  margin:10px 0;
}

.hidden{
  display:none!important;
}

@media(max-width:600px){
  .logo{
    font-size:25px;
  }

  .die{
    width:56px;
    height:56px;
  }

  .pip{
    width:8px;
    height:8px;
  }

  button{
    padding:13px 12px;
  }
}
</style>
</head>

<body>
<div class="app">
  <div class="logo">🎲 DOBBELEN 11/24 🎲</div>
  <div id="app"></div>
</div>

<script>
var KEY = "dob11_session";

function token(){
  return sessionStorage.getItem(KEY) || "";
}

function setToken(t){
  sessionStorage.setItem(KEY,t);
}

function esc(s){
  return String(s || "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function api(url,data){
  return fetch(url,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(data || {})
  }).then(function(r){return r.json();});
}

function getState(){
  return api("/api/state",{token:token()});
}

function home(){
  document.getElementById("app").innerHTML =
    '<div class="card">' +
      '<h2>🎰 Nieuw spel</h2>' +
      '<input id="name" placeholder="Jouw naam" autocomplete="off">' +
      '<button class="green" onclick="createRoom()">KAMER MAKEN</button>' +
    '</div>' +

    '<div class="card">' +
      '<h2>🚪 Meespelen</h2>' +
      '<input id="room" placeholder="Kamercode" autocomplete="off">' +
      '<input id="joinname" placeholder="Jouw naam" autocomplete="off">' +
      '<button class="yellow" onclick="joinRoom()">MEEDOEN</button>' +
    '</div>' +

    '<div class="card center">' +
      '<div class="small">Maximaal 4 spelers • Startsaldo €100</div>' +
    '</div>';
}

function createRoom(){
  var n=document.getElementById("name").value.trim();
  if(!n){
    alert("Vul eerst je naam in.");
    return;
  }

  api("/api/create",{name:n}).then(function(r){
    if(!r.ok){
      alert(r.error || "Fout");
      return;
    }

    setToken(r.token);
    history.replaceState({},"","/?room="+r.room);
    renderLobby(r.room);
  });
}

function joinRoom(){
  var code=document.getElementById("room").value.trim().toUpperCase();
  var n=document.getElementById("joinname").value.trim();

  if(!code || !n){
    alert("Vul kamercode en naam in.");
    return;
  }

  api("/api/join",{room:code,name:n}).then(function(r){
    if(!r.ok){
      alert(r.error || "Kan niet meedoen");
      return;
    }

    setToken(r.token);
    history.replaceState({},"","/?room="+r.room);
    renderLobby(r.room);
  });
}

function invitePage(code){
  document.getElementById("app").innerHTML =
    '<div class="card center">' +
      '<h2>🎲 Uitnodiging</h2>' +
      '<div class="big">Kamer '+esc(code)+'</div>' +
      '<input id="inviteName" placeholder="Jouw naam" autocomplete="off">' +
      '<button class="green" onclick="joinInvite(\''+code+'\')">MEESPELEN</button>' +
      '<div class="small">Vul je naam in om mee te doen.</div>' +
    '</div>';
}

function joinInvite(code){
  var n=document.getElementById("inviteName").value.trim();

  if(!n){
    alert("Vul eerst je naam in.");
    return;
  }

  api("/api/join",{room:code,name:n}).then(function(r){
    if(!r.ok){
      alert(r.error || "Kan niet meedoen");
      return;
    }

    setToken(r.token);
    history.replaceState({},"","/?room="+r.room);
    renderLobby(r.room);
  });
}

function renderLobby(code){
  getState().then(function(s){
    if(!s.ok){
      home();
      return;
    }

    var me=s.me;

    var players=s.room.players.map(function(p){
      return '<div class="player '+(p.id===s.room.players[s.room.current]?.id?"active":"")+'">' +
        '<b>'+esc(p.name)+'</b>' +
        (p.id===s.room.host ? ' 👑' : '') +
        '<div class="money">'+euro(p.money)+'</div>' +
      '</div>';
    }).join("");

    var start="";

    if(s.room.host===me.id && !s.room.started){
      start =
        '<button class="green" onclick="startGame()">BEGIN WORP</button>';
    }

    document.getElementById("app").innerHTML =
      '<div class="card">' +
        '<h2>Lobby</h2>' +
        '<div class="small">Kamercode</div>' +
        '<div class="big">'+esc(code)+'</div>' +
        '<div class="invite">'+esc(location.origin+'/?join='+code)+'</div>' +
        '<button class="yellow" onclick="copyInvite()">LINK KOPIËREN</button>' +
        '<div class="players">'+players+'</div>' +
        '<div class="center">'+start+'</div>' +
        '<div class="center small">Wachten tot de beheerder het spel start.</div>' +
      '</div>' +

      chatHtml(s);
      
    if(!s.room.started){
      setTimeout(function(){
        if(!document.querySelector("input:focus,textarea:focus")) {
          renderLobby(code);
        }
      },1500);
    }
  });
}

function copyInvite(){
  var text=location.origin+"/?join="+new URLSearchParams(location.search).get("room");

  navigator.clipboard.writeText(text).then(function(){
    alert("Uitnodigingslink gekopieerd.");
  });
}

function startGame(){
  api("/api/action",{token:token(),action:"start"}).then(function(r){
    if(!r.ok){
      alert(r.error || "Kan niet starten");
      return;
    }
    renderGame(r);
  });
}

function dieHtml(v,held){
  var positions={
    1:[4],
    2:[0,8],
    3:[0,4,8],
    4:[0,2,6,8],
    5:[0,2,4,6,8],
    6:[0,2,3,5,6,8]
  };

  var arr=[];
  for(var i=0;i<9;i++){
    arr.push(
      '<span class="pip '+(positions[v].indexOf(i)<0?"empty":"")+'"></span>'
    );
  }

  return '<div class="die '+(held?"held":"")+'">' +
    '<div class="pips">'+arr.join("")+'</div>' +
  '</div>';
}

function diceHtml(s){
  var h=s.room.held || [];
  var d=s.room.dice || [];

  return '<div class="dice">' +
    h.map(function(x){return dieHtml(x,true);}).join("") +
    d.map(function(x){return dieHtml(x,false);}).join("") +
  '</div>';
}

function chatHtml(s){
  var lines=s.chat || [];

  return '<div class="card">' +
    '<h2>💬 Chat</h2>' +
    '<div class="chat">' +
      lines.map(function(x){
        return '<div class="chatline"><span class="chatname">'+
          esc(x.name)+':</span> '+esc(x.text);
      }).join("") +
    '</div>' +
    '<div class="row">' +
      '<input id="chatInput" placeholder="Bericht..." autocomplete="off">' +
      '<button class="blue" onclick="sendChat()">VERSTUUR</button>' +
    '</div>' +
  '</div>';
}

function renderGame(s){
  if(!s.ok){
    home();
    return;
  }

  var r=s.room;
  var me=s.me;
  var current=r.players[r.current];

  var players=r.players.map(function(p){
    return '<div class="player '+(p.id===current.id?"active":"")+'">' +
      '<b>'+esc(p.name)+'</b>' +
      (p.id===r.host ? ' 👑' : '') +
      '<div class="money">'+euro(p.money)+'</div>' +
    '</div>';
  }).join("");

  var controls="";

  if(r.started && current.id===me.id){
    if(r.phase==="ready"){
      controls='<button class="green" onclick="doAction(\'begin\')">🎲 BEGIN WORP</button>';
    }

    if(r.phase==="can-reroll"){
      controls=
        '<button class="yellow" onclick="doAction(\'reroll\')">🎲 OPNIEUW GOOIEN</button>';
    }

    if(r.phase==="done"){
      controls=
        '<button class="green" onclick="doAction(\'next\')">VOLGENDE BEURT</button>';
    }

    if(r.phase==="earn"){
      controls=
        '<button class="green" onclick="doAction(\'next\')">AKKOORD / VOLGENDE</button>';
    }
  }

  document.getElementById("app").innerHTML =
    '<div class="card">' +
      '<div class="players">'+players+'</div>' +
    '</div>' +

    '<div class="card center">' +
      '<div class="small">AAN DE BEURT</div>' +
      '<div class="big">'+esc(current.name)+'</div>' +
      '<div class="status">'+esc(r.message || "")+'</div>' +
      diceHtml(r) +
      '<div>'+controls+'</div>' +
      '<div class="small">Doelstenen worden automatisch vastgehouden.</div>' +
    '</div>' +

    chatHtml(s);

  if(document.activeElement && document.activeElement.tagName==="INPUT"){
    return;
  }
}

function doAction(action){
  api("/api/action",{token:token(),action:action}).then(function(r){
    if(!r.ok){
      alert(r.error || "Actie niet toegestaan");
      return;
    }

    renderGame(r);
  });
}

function sendChat(){
  var el=document.getElementById("chatInput");
  if(!el) return;

  var text=el.value.trim();
  if(!text) return;

  api("/api/chat",{token:token(),text:text}).then(function(){
    renderCurrent();
  });
}

function renderCurrent(){
  getState().then(function(s){
    if(!s.ok){
      home();
      return;
    }

    if(s.room.started){
      renderGame(s);
    }else{
      renderLobby(s.room.code);
    }
  });
}

function startPolling(){
  setInterval(function(){
    if(!token()) return;

    if(document.querySelector("input:focus,textarea:focus")){
      return;
    }

    renderCurrent();
  },1500);
}

function euro(n){
  return "€"+Number(n).toFixed(2).replace(".",",");
}

(function(){
  var q=new URLSearchParams(location.search);
  var join=q.get("join");
  var room=q.get("room");

  if(join){
    invitePage(join.toUpperCase());
  }else if(room && token()){
    renderCurrent();
  }else{
    home();
  }

  startPolling();
})();
</script>
</body>
</html>`;

function sendHtml(res) {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(HTML);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://" + req.headers.host);

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, { ok: true });
  }

  if (req.method === "GET") {
    return sendHtml(res);
  }

  if (req.method !== "POST") {
    res.writeHead(405);
    return res.end();
  }

  const body = await readBody(req);

  if (url.pathname === "/api/create") {
    const name = String(body.name || "").trim().substring(0, 20);

    if (!name) {
      return json(res, { ok: false, error: "Naam ontbreekt." });
    }

    const code = roomCode();
    const token = id();

    const player = {
      id: id(),
      token,
      name,
      money: 100
    };

    rooms.set(code, {
      code,
      host: player.id,
      players: [player],
      started: false,
      current: 0,
      dice: [],
      held: [],
      target: 0,
      phase: "lobby",
      message: "Wachten op spelers...",
      chat: []
    });

    return json(res, {
      ok: true,
      room: code,
      token
    });
  }

  if (url.pathname === "/api/join") {
    const code = String(body.room || "").trim().toUpperCase();
    const name = String(body.name || "").trim().substring(0, 20);

    const room = rooms.get(code);

    if (!room) {
      return json(res, {
        ok: false,
        error: "Kamer bestaat niet."
      });
    }

    if (room.players.length >= 4) {
      return json(res, {
        ok: false,
        error: "De kamer zit vol."
      });
    }

    if (room.started) {
      return json(res, {
        ok: false,
        error: "Het spel is al gestart."
      });
    }

    if (!name) {
      return json(res, {
        ok: false,
        error: "Naam ontbreekt."
      });
    }

    if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      return json(res, {
        ok: false,
        error: "Deze naam is al in gebruik."
      });
    }

    const token = id();

    room.players.push({
      id: id(),
      token,
      name,
      money: 100
    });

    room.chat.push({
      name: "Systeem",
      text: name + " is toegetreden."
    });

    return json(res, {
      ok: true,
      room: code,
      token
    });
  }

  if (url.pathname === "/api/state") {
    const token = String(body.token || "");

    let foundRoom = null;
    let me = null;

    for (const room of rooms.values()) {
      const p = playerByToken(room, token);
      if (p) {
        foundRoom = room;
        me = p;
        break;
      }
    }

    if (!foundRoom) {
      return json(res, {
        ok: false,
        error: "Sessie verlopen."
      });
    }

    return json(res, {
      ok: true,
      room: publicRoom(foundRoom),
      me: {
        id: me.id,
        name: me.name,
        money: me.money
      },
      chat: foundRoom.chat.slice(-50)
    });
  }

  if (url.pathname === "/api/chat") {
    const token = String(body.token || "");
    const text = String(body.text || "").trim().substring(0, 300);

    let room = null;
    let me = null;

    for (const r of rooms.values()) {
      const p = playerByToken(r, token);
      if (p) {
        room = r;
        me = p;
        break;
      }
    }

    if (!room || !me) {
      return json(res, {
        ok: false,
        error: "Sessie verlopen."
      });
    }

    if (text) {
      room.chat.push({
        name: me.name,
        text
      });

      if (room.chat.length > 100) {
        room.chat.shift();
      }
    }

    return json(res, {
      ok: true,
      room: publicRoom(room),
      me: {
        id: me.id,
        name: me.name,
        money: me.money
      },
      chat: room.chat.slice(-50)
    });
  }

  if (url.pathname === "/api/action") {
    const token = String(body.token || "");
    const action = String(body.action || "");

    let room = null;
    let me = null;

    for (const r of rooms.values()) {
      const p = playerByToken(r, token);
      if (p) {
        room = r;
        me = p;
        break;
      }
    }

    if (!room || !me) {
      return json(res, {
        ok: false,
        error: "Sessie verlopen."
      });
    }

    if (action === "start") {
      if (room.host !== me.id) {
        return json(res, {
          ok: false,
          error: "Alleen de beheerder kan starten."
        });
      }

      if (room.players.length < 2) {
        return json(res, {
          ok: false,
          error: "Er zijn minimaal 2 spelers nodig."
        });
      }

      room.started = true;
      room.current = 0;
      room.phase = "ready";
      room.message =
        room.players[0].name + " is aan de beurt.";

      return json(res, {
        ok: true,
        room: publicRoom(room),
        me: {
          id: me.id,
          name: me.name,
          money: me.money
        },
        chat: room.chat.slice(-50)
      });
    }

    if (!room.started) {
      return json(res, {
        ok: false,
        error: "Het spel is nog niet gestart."
      });
    }

    if (room.players[room.current].id !== me.id) {
      return json(res, {
        ok: false,
        error: "Je bent niet aan de beurt."
      });
    }

    if (action === "begin") {
      if (room.phase !== "ready") {
        return json(res, {
          ok: false,
          error: "Je kunt nu niet gooien."
        });
      }

      room.held = [];
      room.dice = roll(5);

      const total = diceSum(room.dice);

      if (sameFive(room.dice)) {
        room.held = room.dice.slice();
        room.target = 6;

        const amount = 5 * 6 * 0.50;
        collect(room, me, amount);

        room.message =
          "VOLLE BAK! 5 gelijke stenen. Doel = 6. +" +
          euro(amount) +
          " per tegenstander.";

        room.phase = "earn";
      } else {
        const target = targetFor(total);

        if (isSpecial(total)) {
          pay(room, me, 0.50);

          room.message =
            total +
            "! €0,50 naar iedere tegenstander.";

          room.phase = "done";
        } else if (target) {
          room.target = target;

          const found = room.dice.filter(x => x === target);

          found.forEach(x => room.held.push(x));

          const amount = found.length * target * 0.50;

          collect(room, me, amount);

          room.message =
            "Doelsteen gevonden: " +
            found.length +
            "x " +
            target +
            " → +" +
            euro(amount) +
            " per tegenstander.";

          room.phase =
            room.held.length >= 5
              ? "earn"
              : "can-reroll";
        } else {
          room.message =
            "Geen doelsteen. MIS!";

          room.phase = "done";
        }
      }

      room.dice = room.dice.filter(function(x){
        return room.held.indexOf(x) === -1;
      });

      return json(res, {
        ok: true,
        room: publicRoom(room),
        me: {
          id: me.id,
          name: me.name,
          money: me.money
        },
        chat: room.chat.slice(-50)
      });
    }

    if (action === "reroll") {
      if (room.phase !== "can-reroll") {
        return json(res, {
          ok: false,
          error: "Je mag nu niet opnieuw gooien."
        });
      }

      if (room.held.length < 1) {
        return json(res, {
          ok: false,
          error: "Je moet minimaal 1 steen vasthouden."
        });
      }

      const numberToRoll = 5 - room.held.length;

      if (numberToRoll <= 0) {
        room.phase = "earn";

        return json(res, {
          ok: true,
          room: publicRoom(room),
          me: {
            id: me.id,
            name: me.name,
            money: me.money
          },
          chat: room.chat.slice(-50)
        });
      }

      room.dice = roll(numberToRoll);

      const total = diceSum(
        room.held.concat(room.dice)
      );

      if (sameFive(room.held.concat(room.dice))) {
        room.held = room.held.concat(room.dice);
        room.dice = [];
        room.target = 6;

        const amount = 5 * 6 * 0.50;
        collect(room, me, amount);

        room.message =
          "VOLLE BAK! Doel = 6. +" +
          euro(amount) +
          " per tegenstander.";

        room.phase = "earn";
      } else if (isSpecial(total)) {
        pay(room, me, 0.50);

        room.message =
          total +
          "! €0,50 naar iedere tegenstander.";

        room.phase = "done";
      } else {
        const target = targetFor(total);

        if (!target) {
          room.message =
            "Geen doelsteen bij deze worp. MIS!";

          room.phase = "done";
        } else {
          room.target = target;

          const found = room.dice.filter(x => x === target);

          if (found.length < 1) {
            room.message =
              "Geen doelsteen gevonden bij de worp. MIS!";

            room.phase = "done";
          } else {
            found.forEach(x => room.held.push(x));

            const amount = found.length * target * 0.50;

            collect(room, me, amount);

            room.message =
              "Doelsteen gevonden: " +
              found.length +
              "x " +
              target +
              " → +" +
              euro(amount) +
              " per tegenstander.";

            room.dice = room.dice.filter(function(x){
              return found.indexOf(x) === -1;
            });

            room.phase =
              room.held.length >= 5
                ? "earn"
                : "can-reroll";
          }
        }
      }

      return json(res, {
        ok: true,
        room: publicRoom(room),
        me: {
          id: me.id,
          name: me.name,
          money: me.money
        },
        chat: room.chat.slice(-50)
      });
    }

    if (action === "next") {
      if (room.phase !== "done" && room.phase !== "earn") {
        return json(res, {
          ok: false,
          error: "Deze beurt is nog niet afgelopen."
        });
      }

      nextPlayer(room);

      return json(res, {
        ok: true,
        room: publicRoom(room),
        me: {
          id: me.id,
          name: me.name,
          money: me.money
        },
        chat: room.chat.slice(-50)
      });
    }

    return json(res, {
      ok: false,
      error: "Onbekende actie."
    });
  }

  return json(res, {
    ok: false,
    error: "Onbekend verzoek."
  });
});

server.listen(PORT, () => {
  console.log("Dobbelen 11/24 draait op poort " + PORT);
});
