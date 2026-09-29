const http = require("http");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;

const rooms = new Map();
const sessions = new Map();

const HTML = String.raw`<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Dobbelen 11/24</title>

<style>
*{
  box-sizing:border-box;
  -webkit-tap-highlight-color:transparent;
}

html,body{
  margin:0;
  padding:0;
  background:#071d16;
  color:white;
  font-family:Arial,Helvetica,sans-serif;
}

body{
  min-height:100vh;
}

button{
  border:0;
  border-radius:12px;
  padding:13px 16px;
  font-size:15px;
  font-weight:800;
  cursor:pointer;
  color:white;
}

button:disabled{
  opacity:.35;
  cursor:not-allowed;
}

.app{
  width:min(980px,100%);
  margin:auto;
  padding:10px;
}

.header{
  background:linear-gradient(180deg,#321008,#170603);
  border:2px solid #b98b2d;
  border-radius:16px;
  padding:10px 12px;
  box-shadow:0 5px 25px #0008;
  text-align:center;
}

.title{
  color:#ffd76a;
  font-size:28px;
  font-weight:1000;
  letter-spacing:2px;
  text-shadow:0 2px 5px #000;
}

.subtitle{
  font-size:12px;
  color:#e8d6a0;
  margin-top:2px;
}

.turn{
  margin-top:8px;
  padding:8px;
  border-radius:10px;
  background:#0007;
  color:#fff;
  font-weight:900;
}

.players{
  display:grid;
  grid-template-columns:repeat(4,1fr);
  gap:6px;
  margin-top:8px;
}

.player{
  background:#12372b;
  border:1px solid #4e8a6c;
  border-radius:10px;
  padding:7px;
  text-align:center;
  min-width:0;
}

.player.active{
  border:2px solid #ffd35a;
  box-shadow:0 0 14px #ffd35a66;
}

.player.off{
  opacity:.45;
}

.pname{
  font-size:12px;
  font-weight:900;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}

.money{
  color:#8cff9a;
  font-weight:900;
  margin-top:3px;
}

.game{
  margin-top:8px;
  background:
    radial-gradient(circle at 50% 35%,#14633e 0,#0b472d 38%,#062d1e 100%);
  border:3px solid #b78a31;
  border-radius:18px;
  padding:10px;
  min-height:400px;
  box-shadow:inset 0 0 30px #0008,0 6px 20px #0009;
}

.message{
  min-height:36px;
  display:flex;
  align-items:center;
  justify-content:center;
  text-align:center;
  padding:7px;
  border-radius:10px;
  background:#0006;
  font-weight:900;
  font-size:15px;
}

.targetBox{
  display:none;
  margin:8px auto;
  max-width:500px;
  text-align:center;
  background:linear-gradient(180deg,#231505,#100a02);
  border:2px solid #d9a83d;
  border-radius:14px;
  padding:10px;
  box-shadow:0 4px 15px #0008;
}

.targetBox.show{
  display:block;
}

.targetNumber{
  font-size:28px;
  color:#ffd65a;
  font-weight:1000;
}

.targetText{
  font-size:13px;
  color:#fff;
  font-weight:900;
}

.actionText{
  margin-top:4px;
  font-size:21px;
  font-weight:1000;
}

.actionText.earn{
  color:#73ff86;
}

.actionText.pay{
  color:#ff7575;
}

.diceArea{
  position:relative;
  margin:10px auto;
  min-height:225px;
  max-width:850px;
  border-radius:18px;
  border:2px solid #98732c;
  background:
    radial-gradient(circle at 50% 50%,#175f3b,#0b412a 60%,#06291c);
  overflow:hidden;
  box-shadow:inset 0 0 40px #0008;
}

.diceTray{
  position:relative;
  min-height:225px;
  display:flex;
  flex-wrap:wrap;
  justify-content:center;
  align-items:center;
  align-content:center;
  gap:15px;
  padding:18px;
  perspective:1000px;
}

.die{
  position:relative;
  width:76px;
  height:76px;
  flex:0 0 76px;
  border-radius:15px;
  background:
    linear-gradient(135deg,#ff5040 0%,#cf1712 45%,#790603 100%);
  border:3px solid #ffd45b;
  box-shadow:
    inset 5px 5px 9px #ff8975aa,
    inset -8px -8px 12px #470000aa,
    0 9px 12px #0009;
  transform-style:preserve-3d;
  transition:transform .18s ease,filter .18s ease;
}

.die::after{
  content:"";
  position:absolute;
  inset:4px;
  border-radius:10px;
  border:1px solid #fff3;
  pointer-events:none;
}

.die.held{
  border-color:#ffe477;
  box-shadow:
    0 0 0 3px #ffcf38aa,
    0 0 22px #ffd83e99,
    inset 5px 5px 9px #ff9875aa,
    inset -8px -8px 12px #470000aa,
    0 9px 12px #0009;
}

.die.held::before{
  content:"VAST";
  position:absolute;
  left:50%;
  bottom:-23px;
  transform:translateX(-50%);
  background:#e0ad36;
  color:#241500;
  padding:3px 7px;
  border-radius:6px;
  font-size:9px;
  font-weight:1000;
  z-index:5;
}

.die.rolling{
  animation-duration:.72s;
  animation-timing-function:cubic-bezier(.18,.7,.22,1);
  animation-fill-mode:both;
}

.die.rollA{animation-name:tumbleA}
.die.rollB{animation-name:tumbleB}
.die.rollC{animation-name:tumbleC}
.die.rollD{animation-name:tumbleD}
.die.rollE{animation-name:tumbleE}

@keyframes tumbleA{
  0%{transform:translate(-100px,-75px) rotateX(0) rotateY(0) rotateZ(0) scale(.75)}
  30%{transform:translate(-45px,35px) rotateX(260deg) rotateY(120deg) rotateZ(160deg) scale(1.1)}
  65%{transform:translate(35px,-20px) rotateX(560deg) rotateY(300deg) rotateZ(300deg) scale(1.08)}
  100%{transform:translate(0,0) rotateX(720deg) rotateY(450deg) rotateZ(360deg) scale(1)}
}

@keyframes tumbleB{
  0%{transform:translate(110px,-65px) rotateX(0) rotateY(0) rotateZ(0) scale(.75)}
  30%{transform:translate(45px,30px) rotateX(180deg) rotateY(320deg) rotateZ(130deg) scale(1.1)}
  65%{transform:translate(-35px,-25px) rotateX(500deg) rotateY(170deg) rotateZ(300deg) scale(1.08)}
  100%{transform:translate(0,0) rotateX(720deg) rotateY(360deg) rotateZ(500deg) scale(1)}
}

@keyframes tumbleC{
  0%{transform:translate(-80px,80px) rotateX(0) rotateY(0) rotateZ(0) scale(.75)}
  35%{transform:translate(30px,-45px) rotateX(320deg) rotateY(180deg) rotateZ(260deg) scale(1.12)}
  70%{transform:translate(55px,20px) rotateX(600deg) rotateY(400deg) rotateZ(100deg) scale(1.06)}
  100%{transform:translate(0,0) rotateX(900deg) rotateY(540deg) rotateZ(360deg) scale(1)}
}

@keyframes tumbleD{
  0%{transform:translate(90px,70px) rotateX(0) rotateY(0) rotateZ(0) scale(.75)}
  30%{transform:translate(-35px,-30px) rotateX(240deg) rotateY(280deg) rotateZ(90deg) scale(1.12)}
  65%{transform:translate(-55px,25px) rotateX(620deg) rotateY(180deg) rotateZ(340deg) scale(1.06)}
  100%{transform:translate(0,0) rotateX(820deg) rotateY(460deg) rotateZ(600deg) scale(1)}
}

@keyframes tumbleE{
  0%{transform:translate(0,-100px) rotateX(0) rotateY(0) rotateZ(0) scale(.7)}
  30%{transform:translate(-60px,20px) rotateX(330deg) rotateY(220deg) rotateZ(190deg) scale(1.12)}
  70%{transform:translate(45px,35px) rotateX(640deg) rotateY(420deg) rotateZ(400deg) scale(1.06)}
  100%{transform:translate(0,0) rotateX(900deg) rotateY(600deg) rotateZ(540deg) scale(1)}
}

.pip{
  position:absolute;
  width:14px;
  height:14px;
  border-radius:50%;
  background:#fff;
  box-shadow:
    inset 2px 2px 2px #bbb,
    0 1px 2px #500;
}

.p1{left:8px;top:8px}
.p2{left:31px;top:8px}
.p3{right:8px;top:8px}
.p4{left:8px;top:31px}
.p5{left:31px;top:31px}
.p6{right:8px;top:31px}
.p7{left:8px;bottom:8px}
.p8{left:31px;bottom:8px}
.p9{right:8px;bottom:8px}

.controls{
  display:flex;
  flex-wrap:wrap;
  justify-content:center;
  gap:8px;
  margin-top:8px;
}

.btnBegin{
  background:linear-gradient(#d72e1f,#861108);
  border:2px solid #ff8b65;
}

.btnRoll{
  background:linear-gradient(#f0a52a,#b86c0b);
  border:2px solid #ffd56a;
}

.btnAccept{
  background:linear-gradient(#174b9c,#09285d);
  border:2px solid #79aaff;
}

.btnHold{
  background:linear-gradient(#25804a,#10512c);
  border:2px solid #77d795;
}

.btnUndo{
  background:#555;
}

.btnRound{
  width:min(600px,100%);
  font-size:18px;
  padding:16px;
  background:linear-gradient(#e7a52b,#a85d07);
  border:3px solid #ffdc70;
  box-shadow:0 0 18px #ffbd3d55;
}

.rules{
  margin-top:8px;
  background:#0006;
  border-radius:10px;
  padding:8px;
  font-size:11px;
  line-height:1.45;
  color:#ddd;
}

.chatBox{
  margin-top:8px;
  background:#09281e;
  border:1px solid #426d58;
  border-radius:12px;
  overflow:hidden;
}

.chatHead{
  padding:9px;
  font-weight:900;
  cursor:pointer;
}

.chatBody{
  display:none;
  padding:8px;
}

.chatBody.open{
  display:block;
}

.chatMessages{
  height:120px;
  overflow-y:auto;
  background:#03150f;
  border-radius:8px;
  padding:7px;
  font-size:12px;
}

.chatLine{
  margin-bottom:5px;
}

.chatForm{
  display:flex;
  gap:5px;
  margin-top:6px;
}

.chatForm input{
  flex:1;
  min-width:0;
  border:0;
  border-radius:8px;
  padding:10px;
}

.chatForm button{
  background:#1c6d48;
}

.log{
  margin-top:8px;
  max-height:150px;
  overflow:auto;
  background:#020c08aa;
  border-radius:10px;
  padding:8px;
  font-size:11px;
}

.log div{
  padding:3px 0;
  border-bottom:1px solid #ffffff0d;
}

@media(max-width:600px){
  .app{padding:5px}
  .title{font-size:23px}
  .players{grid-template-columns:repeat(2,1fr)}
  .die{
    width:64px;
    height:64px;
    flex-basis:64px;
  }
  .p1,.p2,.p3,.p4,.p5,.p6,.p7,.p8,.p9{
    transform:scale(.82);
  }
  .diceTray{
    gap:11px;
    padding:13px;
  }
  .diceArea{
    min-height:205px;
  }
}
</style>
</head>

<body>
<div class="app">

  <div class="header">
    <div class="title">🎲 DOBBELEN 11/24 🎲</div>
    <div class="subtitle">Casino Dice Game</div>
    <div id="turn" class="turn">Verbinden...</div>
  </div>

  <div id="players" class="players"></div>

  <div class="game">

    <div id="message" class="message">Welkom!</div>

    <div id="targetBox" class="targetBox">
      <div id="targetNumber" class="targetNumber">-</div>
      <div class="targetText">DOELSTEEN</div>
      <div id="actionText" class="actionText"></div>
    </div>

    <div class="diceArea">
      <div id="diceTray" class="diceTray"></div>
    </div>

    <div id="controls" class="controls">

      <button id="begin" class="btnBegin" onclick="act('begin')">
        🎲 BEGIN WORP
      </button>

      <button id="hold" class="btnHold" onclick="holdSelected()">
        🔒 VASTHOUDEN
      </button>

      <button id="reroll" class="btnRoll" onclick="act('reroll')">
        🎲 OPNIEUW GOOIEN
      </button>

      <button id="accept" class="btnAccept" onclick="act('accept')">
        ✓ AKKOORD
      </button>

      <button id="undoHold" class="btnUndo" onclick="act('undoHold')">
        ↩ VASTHOUDEN ANNULEREN
      </button>

    </div>

    <div id="roundControls" class="controls" style="display:none">
      <button id="roundRoll" class="btnRound" onclick="act('roundRoll')">
        🎲 GOOI VOOR VERDIENEN
      </button>
    </div>

    <div class="rules">
      <b>Spelregels:</b>
      Begin met 5 dobbelstenen. Na iedere worp moet je minimaal één nieuwe steen
      vasthouden voordat je opnieuw mag gooien. Bij AKKOORD wordt bepaald of je
      richting 11 of 24 gaat. Doelstenen worden automatisch vastgezet.
      Iedere nieuwe doelsteen telt mee voor verdienen/betalen.
      Bij volle bak worden na de vijf doelstenen automatisch opnieuw 5 dobbelstenen
      gegooid. Dit gaat door totdat er geen doelsteen meer valt.
    </div>

  </div>

  <div class="chatBox">
    <div class="chatHead" onclick="toggleChat()">💬 CHAT</div>
    <div id="chatBody" class="chatBody">
      <div id="chatMessages" class="chatMessages"></div>
      <div class="chatForm">
        <input id="chatInput" maxlength="200" placeholder="Typ een bericht...">
        <button onclick="sendChat()">VERSTUUR</button>
      </div>
    </div>
  </div>

  <div id="log" class="log"></div>

</div>

<script>
let state = null;
let player = null;
let lastVersion = -1;
let lastDiceKey = "";
let chatOpen = false;

const audio = {
  ctx:null
};

function sound(type){
  try{
    if(!audio.ctx){
      audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    const ctx = audio.ctx;

    if(ctx.state === "suspended"){
      ctx.resume();
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    let f = 300;
    let d = .08;

    if(type === "roll"){
      f = 110;
      d = .13;
    }

    if(type === "hold"){
      f = 520;
      d = .12;
    }

    if(type === "accept"){
      f = 700;
      d = .18;
    }

    if(type === "win"){
      f = 900;
      d = .25;
    }

    if(type === "pay"){
      f = 180;
      d = .22;
    }

    osc.frequency.value = f;
    osc.type = type === "roll" ? "triangle" : "sine";

    gain.gain.setValueAtTime(.001,ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.15,ctx.currentTime+.01);
    gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+d);

    osc.start();
    osc.stop(ctx.currentTime+d+.02);
  }catch(e){}
}

function esc(s){
  return String(s ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function api(url,body){
  return fetch(url,{
    method: body ? "POST" : "GET",
    headers: body ? {"Content-Type":"application/json"} : {},
    body: body ? JSON.stringify(body) : undefined
  }).then(r=>r.json());
}

function pipPositions(value){
  const map = {
    1:["p5"],
    2:["p1","p9"],
    3:["p1","p5","p9"],
    4:["p1","p3","p7","p9"],
    5:["p1","p3","p5","p7","p9"],
    6:["p1","p3","p4","p6","p7","p9"]
  };

  return map[value] || [];
}

function makeDie(value,index,rolling,held){
  const d = document.createElement("div");

  let cls = "die";

  if(held) cls += " held";

  if(rolling){
    cls += " rolling ";
    cls += ["rollA","rollB","rollC","rollD","rollE"][index % 5];
  }

  d.className = cls;

  pipPositions(value).forEach(pos=>{
    const p = document.createElement("span");
    p.className = "pip " + pos;
    d.appendChild(p);
  });

  return d;
}

function renderDice(){
  if(!state) return;

  const tray = document.getElementById("diceTray");
  const key = state.dice.join(",") + "|" + state.version;

  const shouldAnimate =
    state.version !== lastVersion &&
    lastVersion !== -1 &&
    state.hasRolled;

  tray.innerHTML = "";

  state.dice.forEach((value,i)=>{
    const held = !!state.held[i] || !!state.settled[i];

    /*
      Alleen niet-vastgehouden stenen krijgen de worp-animatie.
      Vastgezette stenen blijven volledig stil.
    */
    const rolling = shouldAnimate && !held;

    tray.appendChild(makeDie(value,i,rolling,held));
  });

  lastDiceKey = key;
}

function renderPlayers(){
  const el = document.getElementById("players");
  el.innerHTML = "";

  if(!state) return;

  state.players.forEach((p,i)=>{
    const div = document.createElement("div");
    div.className =
      "player " +
      (i === state.current ? "active " : "") +
      (!p.active ? "off" : "");

    div.innerHTML =
      '<div class="pname">' + esc(p.name) + '</div>' +
      '<div class="money">€ ' + Number(p.money).toFixed(2) + '</div>';

    el.appendChild(div);
  });
}

function renderChat(){
  const el = document.getElementById("chatMessages");

  if(!state){
    el.innerHTML = "";
    return;
  }

  el.innerHTML = state.chat.map(x =>
    '<div class="chatLine"><b>' +
    esc(x.name) +
    ':</b> ' +
    esc(x.text) +
    '</div>'
  ).join("");

  el.scrollTop = el.scrollHeight;
}

function renderLog(){
  const el = document.getElementById("log");

  if(!state){
    el.innerHTML = "";
    return;
  }

  el.innerHTML = state.log.map(x =>
    '<div>' + esc(x) + '</div>'
  ).join("");
}

function apply(){
  if(!state) return;

  const mine = state.me === state.current;
  const main = state.phase === "main";
  const round = state.phase === "round";

  document.getElementById("turn").textContent =
    state.players[state.current]
      ? "🎯 " + state.players[state.current].name + " is aan de beurt"
      : "";

  document.getElementById("message").textContent = state.banner || "";

  const targetBox = document.getElementById("targetBox");
  const targetNumber = document.getElementById("targetNumber");
  const actionText = document.getElementById("actionText");

  if(round){
    targetBox.classList.add("show");

    targetNumber.textContent =
      state.target + " – DOELSTEEN";

    if(state.mode === "earn"){
      actionText.textContent =
        "VERDIENEN: " + state.target + "'EN";
      actionText.className = "actionText earn";
    }else{
      actionText.textContent =
        "BETALEN: " + state.target + "'EN";
      actionText.className = "actionText pay";
    }
  }else{
    targetBox.classList.remove("show");
  }

  document.getElementById("begin").style.display =
    main ? "" : "none";

  document.getElementById("hold").style.display =
    main ? "" : "none";

  document.getElementById("reroll").style.display =
    main ? "" : "none";

  document.getElementById("accept").style.display =
    main ? "" : "none";

  document.getElementById("undoHold").style.display =
    main ? "" : "none";

  const rc = document.getElementById("roundControls");
  rc.style.display = round ? "flex" : "none";

  const rr = document.getElementById("roundRoll");

  if(round){
    rr.textContent =
      state.mode === "earn"
        ? "🎲 GOOI VOOR VERDIENEN"
        : "🎲 GOOI VOOR BETALEN";

    rr.disabled = !mine;
  }

  document.getElementById("begin").disabled =
    !mine || main && state.hasRolled;

  document.getElementById("hold").disabled =
    !mine ||
    !main ||
    !state.hasRolled ||
    !state.mustHold ||
    state.held.every(Boolean);

  document.getElementById("reroll").disabled =
    !mine ||
    !main ||
    !state.hasRolled ||
    state.mustHold ||
    state.held.every(Boolean);

  document.getElementById("accept").disabled =
    !mine ||
    !main ||
    !state.hasRolled ||
    state.mustHold;

  document.getElementById("undoHold").disabled =
    !mine ||
    !main ||
    !state.canUndo;

  renderPlayers();
  renderDice();
  renderChat();
  renderLog();
}

async function refresh(){
  try{
    const r = await api("/api/state");

    if(r.error){
      document.getElementById("message").textContent = r.error;
      return;
    }

    const old = state;

    state = r;
    player = r.me;

    if(old && old.version !== r.version){
      if(r.phase === "round"){
        if(r.mode === "earn") sound("win");
        else sound("pay");
      }
    }

    apply();

    lastVersion = r.version;

  }catch(e){
    console.log(e);
  }
}

async function act(action){
  sound("roll");

  try{
    const r = await api("/api/action",{action});

    if(r.error){
      alert(r.error);
      return;
    }

    if(r.sound === "hold") sound("hold");
    if(r.sound === "accept") sound("accept");
    if(r.sound === "win") sound("win");
    if(r.sound === "pay") sound("pay");
    if(r.sound === "roll") sound("roll");

    state = r;
    apply();
    lastVersion = r.version;

  }catch(e){
    alert("Verbinding mislukt.");
  }
}

async function holdSelected(){
  sound("hold");

  try{
    const r = await api("/api/action",{action:"hold"});

    if(r.error){
      alert(r.error);
      return;
    }

    state = r;
    apply();
    lastVersion = r.version;

  }catch(e){
    alert("Verbinding mislukt.");
  }
}

function toggleChat(){
  chatOpen = !chatOpen;
  document.getElementById("chatBody")
    .classList.toggle("open",chatOpen);
}

async function sendChat(){
  const input = document.getElementById("chatInput");
  const text = input.value.trim();

  if(!text) return;

  input.value = "";

  try{
    const r = await api("/api/chat",{text});

    if(r.error){
      alert(r.error);
      return;
    }

    state = r;
    renderChat();

  }catch(e){}
}

document.getElementById("chatInput").addEventListener("keydown",e=>{
  if(e.key === "Enter"){
    sendChat();
  }
});

async function boot(){
  let name = localStorage.getItem("dice_name");

  if(!name){
    name = prompt("Welke naam wil je gebruiken?");

    if(!name){
      name = "Speler";
    }

    name = name.trim().slice(0,20);

    if(!name){
      name = "Speler";
    }

    localStorage.setItem("dice_name",name);
  }

  const room =
    new URLSearchParams(location.search).get("room") || "casino";

  const r = await api("/api/join",{
    name,
    room
  });

  if(r.error){
    document.getElementById("message").textContent = r.error;
    return;
  }

  state = r;
  player = r.me;

  apply();
  lastVersion = r.version;

  setInterval(refresh,700);
}

boot();
</script>
</body>
</html>`;

function json(res, data, status=200){
  const body = JSON.stringify(data);

  res.writeHead(status,{
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "Access-Control-Allow-Origin":"*"
  });

  res.end(body);
}

function html(res){
  res.writeHead(200,{
    "Content-Type":"text/html; charset=utf-8",
    "Cache-Control":"no-store"
  });

  res.end(HTML);
}

function readBody(req){
  return new Promise((resolve,reject)=>{
    let data="";

    req.on("data",chunk=>{
      data += chunk;

      if(data.length > 1000000){
        req.destroy();
        reject(new Error("Body too large"));
      }
    });

    req.on("end",()=>{
      try{
        resolve(data ? JSON.parse(data) : {});
      }catch(e){
        resolve({});
      }
    });

    req.on("error",reject);
  });
}

function id(){
  return crypto.randomBytes(16).toString("hex");
}

function die(){
  return Math.floor(Math.random()*6)+1;
}

function createRoom(code){
  const r = {
    code,

    players:[],

    current:0,

    phase:"main",

    dice:[1,1,1,1,1],

    held:[false,false,false,false,false],

    settled:[false,false,false,false,false],

    hasRolled:false,

    /*
      In de normale fase:
      na iedere worp moet minstens één NIEUWE steen
      worden vastgehouden.
    */
    mustHold:false,

    target:null,

    mode:null,

    banner:"Klaar om te spelen.",

    canUndo:false,

    version:1,

    log:[],

    chat:[]
  };

  rooms.set(code,r);

  return r;
}

function getRoom(code){
  return rooms.get(code) || createRoom(code);
}

function getSession(req){
  const cookie = req.headers.cookie || "";

  const m = cookie.match(/sid=([^;]+)/);

  if(!m) return null;

  return sessions.get(m[1]) || null;
}

function sessionCookie(res,sid){
  res.setHeader(
    "Set-Cookie",
    "sid="+sid+"; Path=/; HttpOnly; SameSite=Lax"
  );
}

function getPlayer(req){
  const s = getSession(req);

  if(!s) return null;

  const r = rooms.get(s.room);

  if(!r) return null;

  const index = r.players.findIndex(
    p => p.id === s.player
  );

  if(index < 0) return null;

  return {
    room:r,
    player:r.players[index],
    index
  };
}

function pushLog(r,text){
  r.log.unshift(text);

  if(r.log.length > 40){
    r.log.length = 40;
  }
}

function pushChat(r,name,text){
  r.chat.push({
    name,
    text,
    time:Date.now()
  });

  if(r.chat.length > 80){
    r.chat.shift();
  }
}

function bump(r){
  r.version++;
}

function publicState(r,index){
  return {
    me:index,
    current:r.current,

    phase:r.phase,

    dice:r.dice,

    held:r.held,

    settled:r.settled,

    hasRolled:r.hasRolled,

    mustHold:r.mustHold,

    target:r.target,

    mode:r.mode,

    banner:r.banner,

    canUndo:r.canUndo,

    version:r.version,

    players:r.players.map(p=>({
      name:p.name,
      money:p.money,
      active:p.active
    })),

    log:r.log,

    chat:r.chat
  };
}

function activePlayers(r){
  return r.players.filter(p=>p.active);
}

function nextActivePlayer(r){
  if(!r.players.length) return;

  for(let n=1;n<=r.players.length;n++){
    const i=(r.current+n)%r.players.length;

    if(r.players[i] && r.players[i].active){
      r.current=i;
      return;
    }
  }
}

function resetTurn(r){
  r.phase="main";

  r.dice=[1,1,1,1,1];

  r.held=[false,false,false,false,false];

  r.settled=[false,false,false,false,false];

  r.hasRolled=false;

  r.mustHold=false;

  r.target=null;

  r.mode=null;

  r.canUndo=false;
}

function finishTurn(r){
  resetTurn(r);

  nextActivePlayer(r);

  r.banner =
    r.players[r.current]
      ? r.players[r.current].name + " is aan de beurt."
      : "Klaar.";

  bump(r);
}

function transfer(r,currentIndex,amount,earning){
  const current=r.players[currentIndex];

  if(!current) return;

  const others=r.players.filter(
    (p,i)=>i!==currentIndex && p.active
  );

  for(const p of others){
    if(earning){
      p.money += amount;
      current.money -= amount;
    }else{
      p.money -= amount;
      current.money += amount;
    }
  }
}

/*
  Bepaalt de doelsteen.

  < 11:
    richting 11 -> verdienen

  > 24:
    richting 24 -> verdienen

  11 t/m 24:
    betalen

  11 en 24 zijn speciale directe uitbetalingen.
*/
function targetFor(total){
  if(total < 11){
    return {
      target:Math.min(6,11-total),
      mode:"earn"
    };
  }

  if(total > 24){
    return {
      target:Math.min(6,total-24),
      mode:"earn"
    };
  }

  const distance = Math.min(
    total-11,
    24-total
  );

  return {
    target:Math.min(6,distance),
    mode:"pay"
  };
}

function isFiveOfKind(r){
  return r.dice.every(
    x=>x===r.dice[0]
  );
}

/*
  VERDIENEN/BETALEN

  Deze functie verwerkt uitsluitend NIEUWE doelstenen.

  Belangrijk:
  - doelsteen wordt automatisch vastgezet
  - iedere nieuwe doelsteen telt
  - oude doelstenen tellen niet opnieuw
  - bij 0 hits -> MIS
  - als alle 5 stenen doelstenen zijn:
      nieuwe volledige worp met 5 stenen
  - anders alleen losse stenen opnieuw gooien
*/
function resolveRound(r,playerIndex){
  const target=r.target;

  let hits=0;

  for(let i=0;i<5;i++){

    if(r.settled[i]){
      continue;
    }

    if(r.dice[i]===target){

      r.settled[i]=true;
      r.held[i]=true;

      hits++;
    }
  }

  if(hits===0){

    r.banner =
      "❌ MIS! Geen " +
      target +
      " gegooid.";

    pushLog(
      r,
      r.players[playerIndex].name +
      " mist de " +
      target +
      ". Beurt voorbij."
    );

    bump(r);

    finishTurn(r);

    return {
      sound:"pay"
    };
  }

  /*
    Iedere nieuwe doelsteen telt mee.

    Voorbeeld:
    3 doelstenen × €0,50 = €1,50 per tegenstander.
  */
  const amountPerDie=target*0.5;

  const totalAmount=amountPerDie*hits;

  transfer(
    r,
    playerIndex,
    totalAmount,
    r.mode==="earn"
  );

  const action =
    r.mode==="earn"
      ? "verdient"
      : "betaalt";

  r.banner =
    r.players[playerIndex].name +
    " " +
    action +
    " €" +
    totalAmount.toFixed(2) +
    " met " +
    hits +
    " nieuwe " +
    target +
    (hits===1 ? "" : "'en") +
    ".";

  pushLog(
    r,
    r.players[playerIndex].name +
    " " +
    action +
    " €" +
    totalAmount.toFixed(2) +
    " (" +
    hits +
    " nieuwe doelsteen" +
    (hits===1 ? "" : "stenen") +
    ")."
  );

  /*
    ALLE 5 doelstenen geraakt?

    Dan begint een NIEUWE worp met 5 nieuwe dobbelstenen.

    Dit is de belangrijke VOLLE BAK-regel.
  */
  if(r.settled.every(Boolean)){

    r.dice=[
      die(),
      die(),
      die(),
      die(),
      die()
    ];

    r.held=[
      false,
      false,
      false,
      false,
      false
    ];

    r.settled=[
      false,
      false,
      false,
      false,
      false
    ];

    r.hasRolled=true;
    r.mustHold=false;

    r.banner +=
      " 🎲 VOLLE BAK! Nieuwe worp met 5 dobbelstenen.";

    pushLog(
      r,
      "VOLLE BAK! Nieuwe worp met 5 dobbelstenen."
    );

    bump(r);

    return {
      sound:r.mode==="earn" ? "win" : "pay"
    };
  }

  /*
    Er zijn nog losse stenen.

    De doelstenen blijven vaststaan.
  */
  r.hasRolled=true;
  r.mustHold=false;

  bump(r);

  return {
    sound:r.mode==="earn" ? "win" : "pay"
  };
}

function beginTurn(r){
  r.phase="main";

  r.dice=[
    die(),
    die(),
    die(),
    die(),
    die()
  ];

  r.held=[
    false,
    false,
    false,
    false,
    false
  ];

  r.settled=[
    false,
    false,
    false,
    false,
    false
  ];

  r.hasRolled=true;

  /*
    Eerste worp moet minstens één steen
    worden vastgehouden voordat opnieuw
    gegooid mag worden.
  */
  r.mustHold=true;

  r.canUndo=false;

  r.banner =
    r.players[r.current].name +
    " heeft gegooid. Houd minimaal één nieuwe steen vast.";

  pushLog(
    r,
    r.players[r.current].name +
    " begint de beurt."
  );

  bump(r);
}

function holdTurn(r){
  const before=r.held.filter(Boolean).length;

  /*
    Voor eenvoud kiest het systeem automatisch
    de eerste nog niet vastgehouden steen.
  */
  const index=r.held.findIndex(
    x=>!x
  );

  if(index<0){
    throw new Error("Er is geen losse dobbelsteen.");
  }

  r.held[index]=true;

  const after=r.held.filter(Boolean).length;

  if(after>before){
    r.mustHold=false;
    r.canUndo=true;

    r.banner =
      r.players[r.current].name +
      " heeft een steen vastgehouden.";
  }

  bump(r);
}

function undoHold(r){
  const index=r.held.findIndex(Boolean);

  if(index<0){
    throw new Error("Geen vasthouding om terug te draaien.");
  }

  r.held[index]=false;

  r.mustHold=true;
  r.canUndo=false;

  r.banner =
    "Vasthouden ongedaan gemaakt. Houd minimaal één steen vast.";

  bump(r);
}

function mainReroll(r){
  if(r.mustHold){
    throw new Error(
      "Je moet eerst minimaal één nieuwe steen vasthouden."
    );
  }

  if(r.held.every(Boolean)){
    throw new Error(
      "Alle dobbelstenen zijn vastgehouden."
    );
  }

  for(let i=0;i<5;i++){
    if(!r.held[i]){
      r.dice[i]=die();
    }
  }

  /*
    Na iedere worp moet weer minimaal één
    nieuwe steen worden vastgehouden.
  */
  r.mustHold=true;
  r.canUndo=false;
  r.hasRolled=true;

  r.banner =
    r.players[r.current].name +
    " heeft opnieuw gegooid. Houd minimaal één nieuwe steen vast.";

  bump(r);
}

function acceptTurn(r,playerIndex){

  if(r.mustHold){
    throw new Error(
      "Je moet eerst minimaal één nieuwe steen vasthouden."
    );
  }

  const total =
    r.dice.reduce(
      (a,b)=>a+b,
      0
    );

  /*
    11 en 24:
    direct €0,50 per tegenstander.
  */
  if(total===11 || total===24){

    transfer(
      r,
      playerIndex,
      0.50,
      false
    );

    r.banner =
      total +
      "! €0,50 betalen aan iedere tegenstander.";

    pushLog(
      r,
      r.players[playerIndex].name +
      " gooide " +
      total +
      " en betaalt €0,50 aan iedere tegenstander."
    );

    bump(r);

    finishTurn(r);

    return {
      sound:"pay"
    };
  }

  let result=targetFor(total);

  /*
    VOLLE BAK:
    vijf dezelfde betekent doelsteen 6
    en VERDIENEN.
  */
  if(isFiveOfKind(r)){

    result={
      target:6,
      mode:"earn"
    };

    pushLog(
      r,
      "VOLLE BAK! Doelsteen is 6."
    );
  }

  r.target=result.target;
  r.mode=result.mode;

  r.phase="round";

  /*
    Oude main-phase holds worden leeg gemaakt.
    In de verdien/betaalfase worden doelstenen
    automatisch vastgezet.
  */
  r.held=[
    false,
    false,
    false,
    false,
    false
  ];

  r.settled=[
    false,
    false,
    false,
    false,
    false
  ];

  r.banner =
    result.mode==="earn"
      ? "VERDIENEN: " + result.target + "'EN"
      : "BETALEN: " + result.target + "'EN";

  pushLog(
    r,
    r.players[playerIndex].name +
    " moet " +
    (result.mode==="earn" ? "verdienen" : "betalen") +
    " met " +
    result.target +
    "'en."
  );

  bump(r);

  /*
    De huidige worp wordt direct verwerkt.
  */
  return resolveRound(
    r,
    playerIndex
  );
}

function roundRoll(r,playerIndex){

  /*
    Als alle stenen eerder doelstenen waren,
    heeft resolveRound al automatisch 5 nieuwe
    dobbelstenen klaargezet.
  */

  const loose=[];

  for(let i=0;i<5;i++){

    if(!r.settled[i]){
      loose.push(i);
    }
  }

  /*
    Veiligheidscontrole.
    Als er om een of andere reden geen losse stenen zijn,
    beginnen we een nieuwe set van 5.
  */
  if(loose.length===0){

    r.dice=[
      die(),
      die(),
      die(),
      die(),
      die()
    ];

    r.held=[
      false,
      false,
      false,
      false,
      false
    ];

    r.settled=[
      false,
      false,
      false,
      false,
      false
    ];

  }else{

    /*
      Alleen de losse dobbelstenen worden gegooid.
      Vastgezette doelstenen blijven exact hetzelfde.
    */
    for(const i of loose){
      r.dice[i]=die();
    }
  }

  r.hasRolled=true;

  bump(r);

  /*
    Nieuwe doelstenen verwerken.
  */
  return resolveRound(
    r,
    playerIndex
  );
}

function action(r,p,actionName){

  if(!r.players[p].active){
    throw new Error("Je bent niet actief.");
  }

  if(r.current!==p){
    throw new Error("Het is niet jouw beurt.");
  }

  if(actionName==="begin"){

    if(r.phase!=="main"){
      throw new Error("Je kunt nu niet beginnen.");
    }

    if(r.hasRolled){
      throw new Error("Je hebt al gegooid.");
    }

    beginTurn(r);

    return {
      sound:"roll"
    };
  }

  if(actionName==="hold"){

    if(r.phase!=="main"){
      throw new Error("Dit kan nu niet.");
    }

    if(!r.hasRolled){
      throw new Error("Je moet eerst gooien.");
    }

    if(!r.mustHold){
      throw new Error(
        "Je hebt al een steen vastgehouden."
      );
    }

    holdTurn(r);

    return {
      sound:"hold"
    };
  }

  if(actionName==="undoHold"){

    if(r.phase!=="main"){
      throw new Error("Dit kan nu niet.");
    }

    if(!r.canUndo){
      throw new Error(
        "Je kunt het vasthouden niet meer terugdraaien."
      );
    }

    undoHold(r);

    return {
      sound:"hold"
    };
  }

  if(actionName==="reroll"){

    if(r.phase!=="main"){
      throw new Error("Gebruik de knop voor verdienen/betalen.");
    }

    mainReroll(r);

    return {
      sound:"roll"
    };
  }

  if(actionName==="accept"){

    if(r.phase!=="main"){
      throw new Error("Dit kan nu niet.");
    }

    return acceptTurn(r,p);
  }

  if(actionName==="roundRoll"){

    if(r.phase!=="round"){
      throw new Error("Dit kan nu niet.");
    }

    return roundRoll(r,p);
  }

  throw new Error("Onbekende actie.");
}

const server=http.createServer(async(req,res)=>{

  try{

    if(req.url==="/health"){
      return json(res,{ok:true});
    }

    if(req.url==="/"){
      return html(res);
    }

    if(req.url==="/api/state"){

      const gp=getPlayer(req);

      if(!gp){
        return json(
          res,
          {error:"Geen sessie"},
          401
        );
      }

      return json(
        res,
        publicState(
          gp.room,
          gp.index
        )
      );
    }

    if(req.method==="POST" && req.url==="/api/join"){

      const body=await readBody(req);

      const name=
        String(body.name || "Speler")
          .trim()
          .slice(0,20) || "Speler";

      const roomCode=
        String(body.room || "casino")
          .trim()
          .slice(0,30) || "casino";

      const r=getRoom(roomCode);

      let p=r.players.find(
        x=>x.name.toLowerCase()===name.toLowerCase()
      );

      if(!p){

        if(r.players.length>=4){
          return json(
            res,
            {error:"Deze kamer zit vol (maximaal 4 spelers)."},
            400
          );
        }

        p={
          id:id(),
          name,
          money:100,
          active:true
        };

        r.players.push(p);

        if(r.players.length===1){
          r.current=0;
        }

        pushLog(
          r,
          name + " is de kamer binnengekomen."
        );

        bump(r);
      }else{
        p.active=true;
      }

      const sid=id();

      sessions.set(
        sid,
        {
          room:roomCode,
          player:p.id
        }
      );

      sessionCookie(res,sid);

      return json(
        res,
        publicState(
          r,
          r.players.findIndex(
            x=>x.id===p.id
          )
        )
      );
    }

    if(req.method==="POST" && req.url==="/api/action"){

      const gp=getPlayer(req);

      if(!gp){
        return json(
          res,
          {error:"Geen sessie"},
          401
        );
      }

      const body=await readBody(req);

      let result={};

      try{

        result=action(
          gp.room,
          gp.index,
          body.action
        );

      }catch(e){

        return json(
          res,
          {error:e.message || "Actie mislukt."},
          400
        );
      }

      return json(
        res,
        {
          ...publicState(
            gp.room,
            gp.index
          ),
          sound:result.sound
        }
      );
    }

    if(req.method==="POST" && req.url==="/api/chat"){

      const gp=getPlayer(req);

      if(!gp){
        return json(
          res,
          {error:"Geen sessie"},
          401
        );
      }

      const body=await readBody(req);

      const text=
        String(body.text || "")
          .trim()
          .slice(0,200);

      if(!text){
        return json(
          res,
          {error:"Leeg bericht."},
          400
        );
      }

      pushChat(
        gp.room,
        gp.player.name,
        text
      );

      bump(gp.room);

      return json(
        res,
        publicState(
          gp.room,
          gp.index
        )
      );
    }

    return json(
      res,
      {error:"Niet gevonden"},
      404
    );

  }catch(e){

    console.error(e);

    return json(
      res,
      {error:"Serverfout"},
      500
    );
  }

});

server.listen(PORT,()=>{
  console.log(
    "Dobbelen 11/24 server gestart op poort " +
    PORT
  );
});
