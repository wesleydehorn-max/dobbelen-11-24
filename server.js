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
  min-height:100%;
  background:#061b13;
  color:#fff;
  font-family:Arial,Helvetica,sans-serif;
}

body{
  min-height:100vh;
}

button{
  border:0;
  cursor:pointer;
  font-weight:900;
  color:#fff;
}

button:disabled{
  opacity:.35;
  cursor:not-allowed;
}

.app{
  width:min(980px,100%);
  margin:auto;
  padding:7px;
}

/* HEADER */

.header{
  background:
    linear-gradient(180deg,#381209,#180604);
  border:3px solid #c79a35;
  border-radius:18px;
  padding:10px;
  box-shadow:
    0 6px 22px #0009,
    inset 0 0 20px #0007;
  text-align:center;
}

.title{
  color:#ffd75b;
  font-size:27px;
  font-weight:1000;
  letter-spacing:1.5px;
  text-shadow:0 3px 5px #000;
}

.subtitle{
  color:#ead8a7;
  font-size:12px;
  margin-top:2px;
}

.turn{
  margin-top:8px;
  padding:9px;
  border-radius:11px;
  background:#050505b8;
  font-weight:900;
  font-size:15px;
}

/* PLAYERS */

.players{
  display:grid;
  grid-template-columns:repeat(4,1fr);
  gap:6px;
  margin-top:7px;
}

.player{
  background:#10372a;
  border:2px solid #42735a;
  border-radius:11px;
  padding:7px;
  text-align:center;
}

.player.active{
  border-color:#ffd45b;
  box-shadow:0 0 15px #ffd45b66;
}

.player.off{
  opacity:.4;
}

.pname{
  font-size:12px;
  font-weight:900;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}

.money{
  color:#7dff8b;
  font-weight:1000;
  margin-top:3px;
}

/* GAME */

.game{
  margin-top:7px;
  padding:9px;
  border-radius:19px;
  border:3px solid #b88a2f;

  background:
    radial-gradient(
      circle at 50% 45%,
      #17633f 0%,
      #0b452d 50%,
      #05281b 100%
    );

  box-shadow:
    inset 0 0 45px #0009,
    0 6px 22px #0009;
}

.message{
  min-height:40px;
  display:flex;
  justify-content:center;
  align-items:center;
  text-align:center;
  background:#00150dcc;
  border-radius:12px;
  padding:8px;
  font-size:15px;
  font-weight:900;
}

/* TARGET */

.targetBox{
  display:none;
  margin:8px auto;
  max-width:550px;
  text-align:center;
  background:
    linear-gradient(180deg,#271904,#100a02);
  border:2px solid #d8a73d;
  border-radius:14px;
  padding:9px;
  box-shadow:0 5px 15px #0009;
}

.targetBox.show{
  display:block;
}

.targetNumber{
  color:#ffd75a;
  font-size:27px;
  font-weight:1000;
}

.targetText{
  font-size:12px;
  font-weight:900;
}

.actionText{
  margin-top:4px;
  font-size:20px;
  font-weight:1000;
}

.actionText.earn{
  color:#75ff88;
}

.actionText.pay{
  color:#ff7474;
}

/* DICE TABLE */

.diceArea{
  position:relative;
  min-height:300px;
  margin-top:9px;

  border-radius:19px;
  border:2px solid #9f7629;

  overflow:hidden;

  background:
    radial-gradient(
      ellipse at center,
      #196743 0%,
      #0b492e 52%,
      #062c1e 100%
    );

  box-shadow:
    inset 0 0 40px #0009;
}

/* DOBBELBAK */

.diceCup{
  position:absolute;
  top:9px;
  left:50%;
  transform:translateX(-50%);

  width:105px;
  height:43px;

  border-radius:10px 10px 42px 42px;

  background:
    linear-gradient(
      160deg,
      #e4b23f,
      #9a6814 42%,
      #4b2d05 100%
    );

  border:3px solid #ffd76a;

  box-shadow:
    0 5px 12px #000a,
    inset 0 4px 5px #ffe79b55;

  z-index:2;
}

.diceCup::before{
  content:"";
  position:absolute;

  width:74px;
  height:20px;

  left:50%;
  top:6px;

  transform:translateX(-50%);

  border-radius:50%;

  background:#160e04;

  border:2px solid #f0c557;

  box-shadow:
    inset 0 0 12px #000;
}

.diceCup::after{
  content:"DOBBELBAK";

  position:absolute;

  left:50%;
  top:29px;

  transform:translateX(-50%);

  font-size:7px;
  font-weight:1000;

  color:#271800;
  white-space:nowrap;
}

/* DICE TRAY */

.diceTray{
  position:relative;

  min-height:300px;

  display:flex;
  flex-wrap:wrap;

  align-content:center;
  justify-content:center;
  align-items:center;

  gap:15px;

  padding:65px 14px 25px;

  perspective:1200px;
}

/* DIE */

.die{
  position:relative;

  width:76px;
  height:76px;

  flex:0 0 76px;

  border-radius:15px;

  background:
    linear-gradient(
      135deg,
      #ff5544 0%,
      #d51a14 45%,
      #760500 100%
    );

  border:3px solid #ffd65a;

  box-shadow:
    inset 5px 5px 9px #ff9a87aa,
    inset -9px -9px 13px #430000aa,
    0 9px 13px #000a;

  transform-style:preserve-3d;

  user-select:none;
  touch-action:manipulation;

  transition:
    filter .15s,
    box-shadow .15s,
    transform .15s;
}

.die.selectable{
  cursor:pointer;
}

.die.selectable:active{
  transform:scale(.92);
}

.die.held{
  border-color:#fff08a;

  box-shadow:
    0 0 0 3px #ffcf38aa,
    0 0 24px #ffd83eaa,
    inset 5px 5px 9px #ff9a87aa,
    inset -9px -9px 13px #430000aa,
    0 9px 13px #000a;
}

.die.held::before{
  content:"VAST";

  position:absolute;

  left:50%;
  bottom:-22px;

  transform:translateX(-50%);

  background:#e0ad36;
  color:#211500;

  padding:3px 8px;

  border-radius:6px;

  font-size:8px;
  font-weight:1000;

  z-index:10;
}

.die.settled{
  border-color:#fff08a;

  box-shadow:
    0 0 0 3px #ffcf38aa,
    0 0 25px #ffd83e99,
    inset 5px 5px 9px #ff9a87aa,
    inset -9px -9px 13px #430000aa,
    0 9px 13px #000a;
}

/* PIPS */

.pip{
  position:absolute;

  width:14px;
  height:14px;

  border-radius:50%;

  background:#fff;

  box-shadow:
    inset 2px 2px 2px #aaa,
    0 1px 2px #550000;
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

/* TUMBLE */

.die.rolling{
  animation-duration:.85s;
  animation-fill-mode:both;
  animation-timing-function:cubic-bezier(.16,.72,.2,1);
}

.rollA{
  animation-name:tumbleA;
}

.rollB{
  animation-name:tumbleB;
}

.rollC{
  animation-name:tumbleC;
}

.rollD{
  animation-name:tumbleD;
}

.rollE{
  animation-name:tumbleE;
}

@keyframes tumbleA{
  0%{
    transform:
      translate(-125px,-100px)
      rotateX(0deg)
      rotateY(0deg)
      rotateZ(0deg)
      scale(.65);
  }

  35%{
    transform:
      translate(-45px,45px)
      rotateX(310deg)
      rotateY(160deg)
      rotateZ(190deg)
      scale(1.12);
  }

  70%{
    transform:
      translate(35px,-20px)
      rotateX(590deg)
      rotateY(350deg)
      rotateZ(390deg)
      scale(1.05);
  }

  100%{
    transform:
      translate(0,0)
      rotateX(760deg)
      rotateY(520deg)
      rotateZ(480deg)
      scale(1);
  }
}

@keyframes tumbleB{
  0%{
    transform:
      translate(130px,-85px)
      rotateX(0)
      rotateY(0)
      rotateZ(0)
      scale(.65);
  }

  30%{
    transform:
      translate(55px,40px)
      rotateX(240deg)
      rotateY(330deg)
      rotateZ(160deg)
      scale(1.12);
  }

  70%{
    transform:
      translate(-35px,-30px)
      rotateX(560deg)
      rotateY(190deg)
      rotateZ(400deg)
      scale(1.06);
  }

  100%{
    transform:
      translate(0,0)
      rotateX(780deg)
      rotateY(490deg)
      rotateZ(610deg)
      scale(1);
  }
}

@keyframes tumbleC{
  0%{
    transform:
      translate(-110px,100px)
      rotateX(0)
      rotateY(0)
      rotateZ(0)
      scale(.65);
  }

  32%{
    transform:
      translate(35px,-55px)
      rotateX(350deg)
      rotateY(190deg)
      rotateZ(270deg)
      scale(1.12);
  }

  70%{
    transform:
      translate(65px,25px)
      rotateX(620deg)
      rotateY(430deg)
      rotateZ(110deg)
      scale(1.05);
  }

  100%{
    transform:
      translate(0,0)
      rotateX(900deg)
      rotateY(610deg)
      rotateZ(470deg)
      scale(1);
  }
}

@keyframes tumbleD{
  0%{
    transform:
      translate(105px,100px)
      rotateX(0)
      rotateY(0)
      rotateZ(0)
      scale(.65);
  }

  32%{
    transform:
      translate(-40px,-40px)
      rotateX(290deg)
      rotateY(300deg)
      rotateZ(130deg)
      scale(1.12);
  }

  70%{
    transform:
      translate(-65px,30px)
      rotateX(650deg)
      rotateY(220deg)
      rotateZ(380deg)
      scale(1.06);
  }

  100%{
    transform:
      translate(0,0)
      rotateX(820deg)
      rotateY(560deg)
      rotateZ(650deg)
      scale(1);
  }
}

@keyframes tumbleE{
  0%{
    transform:
      translate(0,-120px)
      rotateX(0)
      rotateY(0)
      rotateZ(0)
      scale(.65);
  }

  30%{
    transform:
      translate(-70px,25px)
      rotateX(360deg)
      rotateY(230deg)
      rotateZ(200deg)
      scale(1.12);
  }

  70%{
    transform:
      translate(50px,45px)
      rotateX(690deg)
      rotateY(440deg)
      rotateZ(430deg)
      scale(1.06);
  }

  100%{
    transform:
      translate(0,0)
      rotateX(940deg)
      rotateY(650deg)
      rotateZ(570deg)
      scale(1);
  }
}

/* CONTROLS */

.controls{
  display:flex;
  flex-wrap:wrap;
  justify-content:center;
  gap:8px;
  margin-top:8px;
}

.btn{
  padding:13px 17px;
  border-radius:12px;
  font-size:15px;
}

.begin{
  background:linear-gradient(#d93322,#850e06);
  border:2px solid #ff9a75;
}

.roll{
  background:linear-gradient(#f0a72c,#ad6308);
  border:2px solid #ffdc70;
}

.accept{
  background:linear-gradient(#18509f,#08265d);
  border:2px solid #82b0ff;
}

.undo{
  background:#555;
}

.roundRoll{
  width:min(600px,100%);
  padding:16px;
  border-radius:13px;
  font-size:18px;

  background:
    linear-gradient(#f0a72c,#a95e07);

  border:3px solid #ffdc70;

  box-shadow:
    0 0 20px #ffbd3d55;
}

/* RULES */

.rules{
  margin-top:8px;
  padding:8px;

  background:#0006;

  border-radius:10px;

  color:#ddd;

  font-size:11px;
  line-height:1.45;
}

/* CHAT */

.chatBox{
  margin-top:8px;

  background:#08271d;

  border:1px solid #416c57;

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

  background:#03140e;

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
  background:#1b6b47;
  border-radius:8px;
  padding:10px;
}

/* LOG */

.log{
  margin-top:8px;

  max-height:140px;

  overflow-y:auto;

  background:#020b07cc;

  border-radius:10px;

  padding:7px;

  font-size:11px;
}

.log div{
  padding:3px 0;
  border-bottom:1px solid #ffffff0d;
}

/* MOBILE */

@media(max-width:600px){

  .app{
    padding:5px;
  }

  .title{
    font-size:23px;
  }

  .players{
    grid-template-columns:repeat(2,1fr);
  }

  .diceArea{
    min-height:290px;
  }

  .diceTray{
    min-height:290px;
    gap:11px;
    padding-left:8px;
    padding-right:8px;
  }

  .die{
    width:67px;
    height:67px;
    flex-basis:67px;
  }

  .p1,.p2,.p3,.p4,.p5,.p6,.p7,.p8,.p9{
    transform:scale(.85);
  }

}

</style>
</head>

<body>

<div class="app">

  <div class="header">

    <div class="title">
      🎲 DOBBELEN 11/24 🎲
    </div>

    <div class="subtitle">
      Casino Dice Game
    </div>

    <div id="turn" class="turn">
      Verbinden...
    </div>

  </div>

  <div id="players" class="players"></div>

  <div class="game">

    <div id="message" class="message">
      Welkom!
    </div>

    <div id="targetBox" class="targetBox">

      <div id="targetNumber" class="targetNumber">
        -
      </div>

      <div class="targetText">
        DOELSTEEN
      </div>

      <div id="actionText" class="actionText"></div>

    </div>

    <div class="diceArea">

      <div class="diceCup"></div>

      <div id="diceTray" class="diceTray"></div>

    </div>

    <div id="mainControls" class="controls">

      <button
        id="begin"
        class="btn begin"
        onclick="act('begin')">
        🎲 BEGIN WORP
      </button>

      <button
        id="reroll"
        class="btn roll"
        onclick="act('reroll')">
        🎲 OPNIEUW GOOIEN
      </button>

      <button
        id="accept"
        class="btn accept"
        onclick="act('accept')">
        ✓ AKKOORD
      </button>

      <button
        id="undo"
        class="btn undo"
        onclick="act('undo')">
        ↩ LAATSTE VASTHOUDEN ANNULEREN
      </button>

    </div>

    <div
      id="roundControls"
      class="controls"
      style="display:none">

      <button
        id="roundRoll"
        class="roundRoll"
        onclick="act('roundRoll')">
        🎲 GOOI VOOR VERDIENEN
      </button>

    </div>

    <div class="rules">

      <b>Normale worp:</b>
      na iedere worp moet je minimaal één nieuwe dobbelsteen aantikken
      om hem vast te houden voordat je opnieuw mag gooien.
      Vastgezette stenen blijven staan.

      <br><br>

      <b>Verdienen/betalen:</b>
      doelstenen worden automatisch vastgezet.
      Iedere nieuwe doelsteen telt mee.

      <br><br>

      <b>Volle bak:</b>
      vijf dezelfde doelstenen betekent dat alle vijf tellen.
      Daarna krijg je automatisch een nieuwe worp met vijf nieuwe dobbelstenen.
      Dit gaat door zolang je opnieuw doelstenen gooit.

    </div>

  </div>

  <div class="chatBox">

    <div
      class="chatHead"
      onclick="toggleChat()">
      💬 CHAT
    </div>

    <div id="chatBody" class="chatBody">

      <div
        id="chatMessages"
        class="chatMessages">
      </div>

      <div class="chatForm">

        <input
          id="chatInput"
          maxlength="200"
          placeholder="Typ een bericht...">

        <button onclick="sendChat()">
          VERSTUUR
        </button>

      </div>

    </div>

  </div>

  <div id="log" class="log"></div>

</div>

<script>

let state=null;
let lastRollSeq=-1;
let chatOpen=false;

const audio={
  ctx:null
};

function sound(type){

  try{

    if(!audio.ctx){
      audio.ctx =
        new (window.AudioContext ||
             window.webkitAudioContext)();
    }

    if(audio.ctx.state==="suspended"){
      audio.ctx.resume();
    }

    const ctx=audio.ctx;

    const osc=ctx.createOscillator();
    const gain=ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    let frequency=400;
    let duration=.1;

    if(type==="roll"){
      frequency=120;
      duration=.15;
      osc.type="triangle";
    }

    if(type==="hold"){
      frequency=520;
      duration=.12;
    }

    if(type==="accept"){
      frequency=700;
      duration=.18;
    }

    if(type==="win"){
      frequency=900;
      duration=.22;
    }

    if(type==="pay"){
      frequency=170;
      duration=.2;
    }

    gain.gain.setValueAtTime(
      .001,
      ctx.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      .15,
      ctx.currentTime+.01
    );

    gain.gain.exponentialRampToValueAtTime(
      .001,
      ctx.currentTime+duration
    );

    osc.frequency.value=frequency;

    osc.start();

    osc.stop(
      ctx.currentTime+duration+.02
    );

  }catch(e){}

}

function esc(value){

  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");

}

function api(url,body){

  return fetch(
    url,
    {
      method:body ? "POST" : "GET",

      headers:
        body
          ? {"Content-Type":"application/json"}
          : {},

      body:
        body
          ? JSON.stringify(body)
          : undefined
    }
  ).then(r=>r.json());

}

/* PIP POSITIES */

function pipPositions(value){

  const map={

    1:["p5"],

    2:["p1","p9"],

    3:["p1","p5","p9"],

    4:["p1","p3","p7","p9"],

    5:["p1","p3","p5","p7","p9"],

    6:["p1","p3","p4","p6","p7","p9"]

  };

  return map[value] || [];

}

/* DOBBELSTEEN */

function createDie(
  value,
  index,
  rolling,
  held,
  settled,
  selectable
){

  const die=document.createElement("div");

  let classes="die";

  if(rolling){

    classes += " rolling ";

    classes +=
      ["rollA","rollB","rollC","rollD","rollE"]
      [index%5];

  }

  if(held){
    classes += " held";
  }

  if(settled){
    classes += " settled";
  }

  if(selectable){
    classes += " selectable";
  }

  die.className=classes;

  pipPositions(value).forEach(position=>{

    const pip=document.createElement("span");

    pip.className=
      "pip " + position;

    die.appendChild(pip);

  });

  if(selectable){

    die.addEventListener(
      "click",
      ()=>{
        holdDie(index);
      }
    );

  }

  return die;

}

/* DOBBELSTENEN TEKENEN */

function renderDice(){

  if(!state) return;

  const tray=
    document.getElementById("diceTray");

  const animate =
    state.rollSeq !== lastRollSeq;

  tray.innerHTML="";

  for(let i=0;i<5;i++){

    const held=!!state.held[i];
    const settled=!!state.settled[i];

    /*
      Alleen nieuwe losse stenen animeren.
      Vastgezette stenen blijven volledig stil.
    */
    const rolling=
      animate &&
      !held &&
      !settled;

    const selectable=
      state.phase==="main" &&
      state.me===state.current &&
      state.hasRolled &&
      !held;

    const die=createDie(
      state.dice[i],
      i,
      rolling,
      held,
      settled,
      selectable
    );

    tray.appendChild(die);

  }

}

/* SPELERS */

function renderPlayers(){

  const el=
    document.getElementById("players");

  el.innerHTML="";

  if(!state) return;

  state.players.forEach(
    (p,index)=>{

      const div=
        document.createElement("div");

      div.className=
        "player " +
        (index===state.current
          ? "active "
          : "") +
        (!p.active
          ? "off"
          : "");

      div.innerHTML=
        '<div class="pname">' +
        esc(p.name) +
        '</div>' +

        '<div class="money">€ ' +
        Number(p.money).toFixed(2) +
        '</div>';

      el.appendChild(div);

    }
  );

}

/* CHAT */

function renderChat(){

  const el=
    document.getElementById("chatMessages");

  if(!state){
    el.innerHTML="";
    return;
  }

  el.innerHTML=
    state.chat.map(
      x=>
        '<div class="chatLine">' +
        '<b>' +
        esc(x.name) +
        ':</b> ' +
        esc(x.text) +
        '</div>'
    ).join("");

  el.scrollTop=el.scrollHeight;

}

/* LOG */

function renderLog(){

  const el=
    document.getElementById("log");

  if(!state){
    el.innerHTML="";
    return;
  }

  el.innerHTML=
    state.log.map(
      x=>
        "<div>" +
        esc(x) +
        "</div>"
    ).join("");

}

/* UI */

function apply(){

  if(!state) return;

  const mine=
    state.me===state.current;

  const main=
    state.phase==="main";

  const round=
    state.phase==="round";

  const turnPlayer=
    state.players[state.current];

  document.getElementById("turn").textContent=
    turnPlayer
      ? "🎯 " +
        turnPlayer.name +
        " is aan de beurt"
      : "";

  document.getElementById("message").textContent=
    state.banner || "";

  const targetBox=
    document.getElementById("targetBox");

  const actionText=
    document.getElementById("actionText");

  const targetNumber=
    document.getElementById("targetNumber");

  if(round){

    targetBox.classList.add("show");

    targetNumber.textContent=
      state.target +
      " – DOELSTEEN";

    if(state.mode==="earn"){

      actionText.textContent=
        "VERDIENEN: " +
        state.target +
        "'EN";

      actionText.className=
        "actionText earn";

    }else{

      actionText.textContent=
        "BETALEN: " +
        state.target +
        "'EN";

      actionText.className=
        "actionText pay";

    }

  }else{

    targetBox.classList.remove("show");

  }

  document.getElementById(
    "mainControls"
  ).style.display=
    main
      ? "flex"
      : "none";

  document.getElementById(
    "roundControls"
  ).style.display=
    round
      ? "flex"
      : "none";

  document.getElementById(
    "begin"
  ).disabled=
    !mine ||
    !main ||
    state.hasRolled;

  document.getElementById(
    "reroll"
  ).disabled=
    !mine ||
    !main ||
    !state.hasRolled ||
    state.mustHold ||
    state.held.every(Boolean);

  document.getElementById(
    "accept"
  ).disabled=
    !mine ||
    !main ||
    !state.hasRolled ||
    state.mustHold;

  document.getElementById(
    "undo"
  ).disabled=
    !mine ||
    !main ||
    !state.canUndo;

  const roundRoll=
    document.getElementById(
      "roundRoll"
    );

  if(round){

    roundRoll.textContent=
      state.mode==="earn"
        ? "🎲 GOOI VOOR VERDIENEN"
        : "🎲 GOOI VOOR BETALEN";

    roundRoll.disabled=!mine;

  }

  renderPlayers();
  renderDice();
  renderChat();
  renderLog();

}

/* ACTIE */

async function act(action){

  if(
    action==="begin" ||
    action==="reroll" ||
    action==="roundRoll"
  ){
    sound("roll");
  }

  try{

    const result=
      await api(
        "/api/action",
        {action}
      );

    if(result.error){

      alert(result.error);
      return;

    }

    state=result;

    if(result.sound){
      sound(result.sound);
    }

    apply();

  }catch(e){

    alert("Verbinding mislukt.");

  }

}

/* DOBBELSTEEN VASTHOUDEN */

async function holdDie(index){

  if(!state) return;

  if(
    state.phase!=="main" ||
    state.me!==state.current
  ){
    return;
  }

  if(state.held[index]){
    return;
  }

  sound("hold");

  try{

    const result=
      await api(
        "/api/action",
        {
          action:"holdDie",
          index
        }
      );

    if(result.error){

      alert(result.error);
      return;

    }

    state=result;

    apply();

  }catch(e){

    alert("Verbinding mislukt.");

  }

}

/* CHAT */

function toggleChat(){

  chatOpen=!chatOpen;

  document
    .getElementById("chatBody")
    .classList.toggle(
      "open",
      chatOpen
    );

}

async function sendChat(){

  const input=
    document.getElementById(
      "chatInput"
    );

  const text=
    input.value.trim();

  if(!text) return;

  input.value="";

  try{

    const result=
      await api(
        "/api/chat",
        {text}
      );

    if(result.error){

      alert(result.error);
      return;

    }

    state=result;

    renderChat();

  }catch(e){}

}

document
  .getElementById("chatInput")
  .addEventListener(
    "keydown",
    e=>{
      if(e.key==="Enter"){
        sendChat();
      }
    }
  );

/* REFRESH */

async function refresh(){

  try{

    const result=
      await api("/api/state");

    if(result.error){
      return;
    }

    if(
      state &&
      result.version!==state.version
    ){

      state=result;

      apply();

    }else if(!state){

      state=result;

      apply();

    }

  }catch(e){}

}

/* START */

async function boot(){

  let name=
    localStorage.getItem(
      "dice_name"
    );

  if(!name){

    name=
      prompt(
        "Welke naam wil je gebruiken?"
      );

    if(!name){
      name="Speler";
    }

    name=
      name
      .trim()
      .slice(0,20);

    if(!name){
      name="Speler";
    }

    localStorage.setItem(
      "dice_name",
      name
    );

  }

  const params=
    new URLSearchParams(
      location.search
    );

  const room=
    params.get("room") ||
    "casino";

  try{

    const result=
      await api(
        "/api/join",
        {
          name,
          room
        }
      );

    if(result.error){

      document.getElementById(
        "message"
      ).textContent=
        result.error;

      return;

    }

    state=result;

    lastRollSeq=
      result.rollSeq;

    apply();

    setInterval(
      refresh,
      600
    );

  }catch(e){

    document.getElementById(
      "message"
    ).textContent=
      "Kan geen verbinding maken.";

  }

}

boot();

</script>

</body>
</html>`;

/* =========================
   SERVER FUNCTIES
========================= */

function json(res,data,status=200){

  const body=
    JSON.stringify(data);

  res.writeHead(
    status,
    {
      "Content-Type":
        "application/json; charset=utf-8",

      "Cache-Control":
        "no-store"
    }
  );

  res.end(body);

}

function sendHtml(res){

  res.writeHead(
    200,
    {
      "Content-Type":
        "text/html; charset=utf-8",

      "Cache-Control":
        "no-store"
    }
  );

  res.end(HTML);

}

function readBody(req){

  return new Promise(
    (resolve,reject)=>{

      let data="";

      req.on(
        "data",
        chunk=>{
          data+=chunk;

          if(data.length>1000000){

            reject(
              new Error(
                "Request te groot"
              )
            );

            req.destroy();

          }
        }
      );

      req.on(
        "end",
        ()=>{

          try{

            resolve(
              data
                ? JSON.parse(data)
                : {}
            );

          }catch(e){

            resolve({});

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

function randomId(){

  return crypto
    .randomBytes(16)
    .toString("hex");

}

function rollDie(){

  return Math.floor(
    Math.random()*6
  )+1;

}

/* =========================
   ROOM
========================= */

function createRoom(code){

  const room={

    code,

    players:[],

    current:0,

    phase:"main",

    dice:[
      1,1,1,1,1
    ],

    held:[
      false,false,false,false,false
    ],

    settled:[
      false,false,false,false,false
    ],

    hasRolled:false,

    mustHold:false,

    canUndo:false,

    target:null,

    mode:null,

    banner:
      "Klaar om te spelen.",

    version:1,

    rollSeq:0,

    log:[],

    chat:[]

  };

  rooms.set(
    code,
    room
  );

  return room;

}

function getRoom(code){

  return (
    rooms.get(code) ||
    createRoom(code)
  );

}

/* =========================
   SESSION
========================= */

function getSession(req){

  const cookie=
    req.headers.cookie || "";

  const match=
    cookie.match(
      /sid=([^;]+)/
    );

  if(!match){
    return null;
  }

  return (
    sessions.get(
      match[1]
    ) || null
  );

}

function setSessionCookie(
  res,
  sid
){

  res.setHeader(
    "Set-Cookie",
    "sid="+
    sid+
    "; Path=/; HttpOnly; SameSite=Lax"
  );

}

function getPlayer(req){

  const session=
    getSession(req);

  if(!session){
    return null;
  }

  const room=
    rooms.get(
      session.room
    );

  if(!room){
    return null;
  }

  const index=
    room.players.findIndex(
      p=>
        p.id===
        session.player
    );

  if(index<0){
    return null;
  }

  return {
    room,
    index,
    player:room.players[index]
  };

}

/* =========================
   STATE
========================= */

function publicState(
  room,
  index
){

  return {

    me:index,

    current:
      room.current,

    phase:
      room.phase,

    dice:
      room.dice,

    held:
      room.held,

    settled:
      room.settled,

    hasRolled:
      room.hasRolled,

    mustHold:
      room.mustHold,

    canUndo:
      room.canUndo,

    target:
      room.target,

    mode:
      room.mode,

    banner:
      room.banner,

    version:
      room.version,

    rollSeq:
      room.rollSeq,

    players:
      room.players.map(
        p=>({
          name:p.name,
          money:p.money,
          active:p.active
        })
      ),

    log:
      room.log,

    chat:
      room.chat

  };

}

function bump(room){

  room.version++;

}

/* =========================
   LOG / CHAT
========================= */

function log(room,text){

  room.log.unshift(text);

  if(room.log.length>50){
    room.log.length=50;
  }

}

function chat(
  room,
  name,
  text
){

  room.chat.push({
    name,
    text,
    time:Date.now()
  });

  if(room.chat.length>80){
    room.chat.shift();
  }

}

/* =========================
   PLAYERS
========================= */

function activePlayers(room){

  return room.players.filter(
    p=>p.active
  );

}

function nextPlayer(room){

  if(room.players.length===0){
    return;
  }

  for(
    let step=1;
    step<=room.players.length;
    step++
  ){

    const index=
      (
        room.current+
        step
      ) %
      room.players.length;

    if(
      room.players[index] &&
      room.players[index].active
    ){

      room.current=index;

      return;

    }

  }

}

/* =========================
   MONEY
========================= */

function transfer(
  room,
  currentIndex,
  amount,
  earn
){

  const current=
    room.players[currentIndex];

  if(!current){
    return;
  }

  const others=
    room.players.filter(
      (p,index)=>
        index!==currentIndex &&
        p.active
    );

  for(const player of others){

    if(earn){

      player.money+=amount;
      current.money-=amount;

    }else{

      player.money-=amount;
      current.money+=amount;

    }

  }

}

/* =========================
   RESET TURN
========================= */

function resetTurn(room){

  room.phase="main";

  room.dice=[
    1,1,1,1,1
  ];

  room.held=[
    false,false,false,false,false
  ];

  room.settled=[
    false,false,false,false,false
  ];

  room.hasRolled=false;

  room.mustHold=false;

  room.canUndo=false;

  room.target=null;

  room.mode=null;

}

function finishTurn(room){

  resetTurn(room);

  nextPlayer(room);

  const p=
    room.players[room.current];

  room.banner=
    p
      ? p.name+
        " is aan de beurt."
      : "Klaar.";

  bump(room);

}

/* =========================
   TARGET
========================= */

function getTarget(total){

  /*
    < 11 = VERDIENEN richting 11
    > 24 = VERDIENEN richting 24
    11 t/m 24 = BETALEN
  */

  if(total<11){

    return {
      target:Math.min(
        6,
        11-total
      ),
      mode:"earn"
    };

  }

  if(total>24){

    return {
      target:Math.min(
        6,
        total-24
      ),
      mode:"earn"
    };

  }

  const distance=
    Math.min(
      total-11,
      24-total
    );

  return {
    target:Math.min(
      6,
      distance
    ),
    mode:"pay"
  };

}

/* =========================
   VOLLE BAK
========================= */

function fullHouse(room){

  return room.dice.every(
    value=>
      value===room.dice[0]
  );

}

/* =========================
   BEGIN
========================= */

function begin(room){

  room.phase="main";

  room.dice=[
    rollDie(),
    rollDie(),
    rollDie(),
    rollDie(),
    rollDie()
  ];

  room.held=[
    false,false,false,false,false
  ];

  room.settled=[
    false,false,false,false,false
  ];

  room.hasRolled=true;

  room.mustHold=true;

  room.canUndo=false;

  room.rollSeq++;

  room.banner=
    room.players[room.current].name+
    " heeft gegooid. Tik minimaal één steen aan om hem vast te houden.";

  log(
    room,
    room.players[room.current].name+
    " begint de beurt."
  );

  bump(room);

}

/* =========================
   HOLD DIE
========================= */

function holdDie(
  room,
  index
){

  if(
    !Number.isInteger(index) ||
    index<0 ||
    index>4
  ){

    throw new Error(
      "Ongeldige dobbelsteen."
    );

  }

  if(room.held[index]){

    throw new Error(
      "Deze steen staat al vast."
    );

  }

  room.held[index]=true;

  /*
    Zodra er minimaal één NIEUWE steen
    is vastgehouden mag opnieuw worden gegooid.
  */
  room.mustHold=false;

  room.canUndo=true;

  room.banner=
    "Steen vastgezet. Je mag opnieuw gooien.";

  bump(room);

}

/* =========================
   UNDO
========================= */

function undoLastHold(room){

  /*
    Laatste vastgezette steen zoeken.
  */
  let index=-1;

  for(
    let i=4;
    i>=0;
    i--
  ){

    if(room.held[i]){
      index=i;
      break;
    }

  }

  if(index<0){

    throw new Error(
      "Geen steen om terug te draaien."
    );

  }

  room.held[index]=false;

  room.mustHold=true;

  room.canUndo=false;

  room.banner=
    "Vasthouden teruggedraaid. Tik opnieuw minimaal één steen aan.";

  bump(room);

}

/* =========================
   NORMALE HERWORP
========================= */

function rerollMain(room){

  if(room.mustHold){

    throw new Error(
      "Tik eerst minimaal één nieuwe dobbelsteen aan om hem vast te houden."
    );

  }

  if(room.held.every(Boolean)){

    throw new Error(
      "Alle vijf dobbelstenen zijn vastgezet."
    );

  }

  for(
    let i=0;
    i<5;
    i++
  ){

    if(!room.held[i]){

      room.dice[i]=rollDie();

    }

  }

  /*
    Na iedere worp moet opnieuw
    minimaal één nieuwe steen
    worden vastgezet.
  */
  room.mustHold=true;

  room.canUndo=false;

  room.hasRolled=true;

  room.rollSeq++;

  room.banner=
    "Nieuwe worp. Tik minimaal één nieuwe steen aan.";

  bump(room);

}

/* =========================
   VERDIENEN / BETALEN
========================= */

function resolveRound(
  room,
  playerIndex
){

  let hits=0;

  /*
    Alleen NIEUWE doelstenen tellen.
  */
  for(
    let i=0;
    i<5;
    i++
  ){

    if(room.settled[i]){
      continue;
    }

    if(
      room.dice[i]===
      room.target
    ){

      room.settled[i]=true;

      room.held[i]=true;

      hits++;

    }

  }

  /*
    Geen doelsteen = MIS.
  */
  if(hits===0){

    room.banner=
      "❌ MIS! Geen "+
      room.target+
      " gegooid.";

    log(
      room,
      room.players[playerIndex].name+
      " mist de doelsteen."
    );

    bump(room);

    finishTurn(room);

    return {
      sound:
        room.mode==="earn"
          ? "pay"
          : "pay"
    };

  }

  /*
    Iedere nieuwe doelsteen
    heeft zijn eigen bedrag.

    Bijvoorbeeld:
    doel = 5
    1 nieuwe 5 = €2,50
    3 nieuwe 5'en = €7,50
  */
  const amountPerDie=
    room.target*0.50;

  const totalAmount=
    amountPerDie*hits;

  transfer(
    room,
    playerIndex,
    totalAmount,
    room.mode==="earn"
  );

  const action=
    room.mode==="earn"
      ? "verdient"
      : "betaalt";

  room.banner=
    room.players[playerIndex].name+
    " "+
    action+
    " €"+
    totalAmount.toFixed(2)+
    " met "+
    hits+
    " nieuwe "+
    room.target+
    "'en.";

  log(
    room,
    room.players[playerIndex].name+
    " "+
    action+
    " €"+
    totalAmount.toFixed(2)+
    "."
  );

  /*
    VOLLE BAK / ALLE 5 DOELSTENEN
  */
  if(
    room.settled.every(Boolean)
  ){

    /*
      Nieuwe set van 5.
      Dit is precies de regel die je hebt uitgelegd.
    */
    room.dice=[
      rollDie(),
      rollDie(),
      rollDie(),
      rollDie(),
      rollDie()
    ];

    room.held=[
      false,false,false,false,false
    ];

    room.settled=[
      false,false,false,false,false
    ];

    room.hasRolled=true;

    room.mustHold=false;

    room.canUndo=false;

    room.rollSeq++;

    room.banner+=
      " 🎲 VOLLE BAK! Nieuwe worp met 5 dobbelstenen.";

    log(
      room,
      "VOLLE BAK: nieuwe worp met 5 dobbelstenen."
    );

    bump(room);

    return {
      sound:
        room.mode==="earn"
          ? "win"
          : "pay"
    };

  }

  /*
    Er zijn nog losse dobbelstenen.
    De speler kan ze opnieuw gooien.
  */
  room.hasRolled=true;

  room.mustHold=false;

  room.canUndo=false;

  bump(room);

  return {
    sound:
      room.mode==="earn"
        ? "win"
        : "pay"
  };

}

/* =========================
   AKKOORD
========================= */

function accept(
  room,
  playerIndex
){

  if(room.mustHold){

    throw new Error(
      "Je moet eerst minimaal één nieuwe steen vasthouden."
    );

  }

  const total=
    room.dice.reduce(
      (sum,value)=>
        sum+value,
      0
    );

  /*
    11 / 24
  */
  if(
    total===11 ||
    total===24
  ){

    transfer(
      room,
      playerIndex,
      0.50,
      false
    );

    room.banner=
      total+
      "! €0,50 betalen aan iedere tegenstander.";

    log(
      room,
      room.players[playerIndex].name+
      " gooide "+
      total+
      " en betaalt €0,50."
    );

    bump(room);

    finishTurn(room);

    return {
      sound:"pay"
    };

  }

  let result=
    getTarget(total);

  /*
    VOLLE BAK:
    vijf dezelfde = 6 verdienen
  */
  if(fullHouse(room)){

    result={
      target:6,
      mode:"earn"
    };

    log(
      room,
      "VOLLE BAK! Doelsteen 6."
    );

  }

  room.phase="round";

  room.target=
    result.target;

  room.mode=
    result.mode;

  /*
    Oude normale holds verdwijnen.
    In de ronde worden doelstenen
    automatisch vastgezet.
  */
  room.held=[
    false,false,false,false,false
  ];

  room.settled=[
    false,false,false,false,false
  ];

  room.mustHold=false;

  room.canUndo=false;

  room.banner=
    result.mode==="earn"
      ? "VERDIENEN: "+
        result.target+
        "'EN"
      : "BETALEN: "+
        result.target+
        "'EN";

  bump(room);

  /*
    De huidige worp meteen verwerken.
  */
  return resolveRound(
    room,
    playerIndex
  );

}

/* =========================
   VERDIENEN/BETALEN OPNIEUW
========================= */

function roundRoll(
  room,
  playerIndex
){

  const loose=[];

  for(
    let i=0;
    i<5;
    i++
  ){

    if(!room.settled[i]){
      loose.push(i);
    }

  }

  /*
    Bij volle bak zijn alle vijf
    automatisch vervangen door een
    nieuwe set van vijf.

    Normaliter heeft resolveRound
    deze nieuwe worp al gemaakt.
  */
  if(loose.length===0){

    room.dice=[
      rollDie(),
      rollDie(),
      rollDie(),
      rollDie(),
      rollDie()
    ];

    room.held=[
      false,false,false,false,false
    ];

    room.settled=[
      false,false,false,false,false
    ];

    room.rollSeq++;

  }else{

    /*
      Alleen losse dobbelstenen gooien.
      Vastgezette doelstenen blijven stil.
    */
    for(
      const index of loose
    ){

      room.dice[index]=rollDie();

    }

    room.rollSeq++;

  }

  room.hasRolled=true;

  bump(room);

  /*
    Nieuwe doelstenen meteen verwerken.
  */
  return resolveRound(
    room,
    playerIndex
  );

}

/* =========================
   ACTION
========================= */

function doAction(
  room,
  playerIndex,
  action,
  body
){

  if(
    !room.players[playerIndex] ||
    !room.players[playerIndex].active
  ){

    throw new Error(
      "Je bent niet actief."
    );

  }

  if(
    room.current!==playerIndex
  ){

    throw new Error(
      "Het is niet jouw beurt."
    );

  }

  if(action==="begin"){

    if(
      room.phase!=="main" ||
      room.hasRolled
    ){

      throw new Error(
        "Je kunt nu niet beginnen."
      );

    }

    begin(room);

    return {
      sound:"roll"
    };

  }

  if(action==="holdDie"){

    if(
      room.phase!=="main" ||
      !room.hasRolled
    ){

      throw new Error(
        "Je kunt nu geen steen vasthouden."
      );

    }

    holdDie(
      room,
      Number(body.index)
    );

    return {
      sound:"hold"
    };

  }

  if(action==="undo"){

    if(
      room.phase!=="main"
    ){

      throw new Error(
        "Dit kan nu niet."
      );

    }

    if(!room.canUndo){

      throw new Error(
        "Er is niets om terug te draaien."
      );

    }

    undoLastHold(room);

    return {
      sound:"hold"
    };

  }

  if(action==="reroll"){

    if(
      room.phase!=="main"
    ){

      throw new Error(
        "Gebruik de knop voor verdienen/betalen."
      );

    }

    rerollMain(room);

    return {
      sound:"roll"
    };

  }

  if(action==="accept"){

    if(
      room.phase!=="main"
    ){

      throw new Error(
        "Je kunt nu niet akkoord gaan."
      );

    }

    return accept(
      room,
      playerIndex
    );

  }

  if(action==="roundRoll"){

    if(
      room.phase!=="round"
    ){

      throw new Error(
        "Je kunt nu niet gooien."
      );

    }

    return roundRoll(
      room,
      playerIndex
    );

  }

  throw new Error(
    "Onbekende actie."
  );

}

/* =========================
   HTTP SERVER
========================= */

const server=
  http.createServer(
    async(req,res)=>{

      try{

        /*
          BELANGRIJK:
          We gebruiken alleen pathname.
          Daardoor werken ook links met
          ?utm_source=...
        */
        const url=
          new URL(
            req.url,
            "http://"+
            (
              req.headers.host ||
              "localhost"
            )
          );

        const pathname=
          url.pathname;

        /* HOME */

        if(
          req.method==="GET" &&
          pathname==="/"
        ){

          return sendHtml(res);

        }

        /* HEALTH */

        if(
          req.method==="GET" &&
          pathname==="/health"
        ){

          return json(
            res,
            {
              ok:true
            }
          );

        }

        /* STATE */

        if(
          req.method==="GET" &&
          pathname==="/api/state"
        ){

          const gp=
            getPlayer(req);

          if(!gp){

            return json(
              res,
              {
                error:
                  "Geen sessie"
              },
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

        /* JOIN */

        if(
          req.method==="POST" &&
          pathname==="/api/join"
        ){

          const body=
            await readBody(req);

          let name=
            String(
              body.name ||
              "Speler"
            )
            .trim()
            .slice(0,20);

          if(!name){
            name="Speler";
          }

          const roomCode=
            String(
              body.room ||
              "casino"
            )
            .trim()
            .slice(0,30) ||
            "casino";

          const room=
            getRoom(roomCode);

          let player=
            room.players.find(
              p=>
                p.name.toLowerCase()===
                name.toLowerCase()
            );

          if(!player){

            if(
              room.players.length>=4
            ){

              return json(
                res,
                {
                  error:
                    "Deze kamer zit vol. Maximaal 4 spelers."
                },
                400
              );

            }

            player={

              id:
                randomId(),

              name,

              money:
                100,

              active:true

            };

            room.players.push(
              player
            );

            log(
              room,
              name+
              " is de kamer binnengekomen."
            );

            bump(room);

          }else{

            player.active=true;

          }

          const sid=
            randomId();

          sessions.set(
            sid,
            {
              room:roomCode,
              player:player.id
            }
          );

          setSessionCookie(
            res,
            sid
          );

          return json(
            res,
            publicState(
              room,
              room.players.findIndex(
                p=>
                  p.id===player.id
              )
            )
          );

        }

        /* ACTION */

        if(
          req.method==="POST" &&
          pathname==="/api/action"
        ){

          const gp=
            getPlayer(req);

          if(!gp){

            return json(
              res,
              {
                error:
                  "Geen sessie"
              },
              401
            );

          }

          const body=
            await readBody(req);

          try{

            const result=
              doAction(
                gp.room,
                gp.index,
                body.action,
                body
              );

            return json(
              res,
              {
                ...publicState(
                  gp.room,
                  gp.index
                ),

                sound:
                  result.sound
              }
            );

          }catch(error){

            return json(
              res,
              {
                error:
                  error.message ||
                  "Actie mislukt."
              },
              400
            );

          }

        }

        /* CHAT */

        if(
          req.method==="POST" &&
          pathname==="/api/chat"
        ){

          const gp=
            getPlayer(req);

          if(!gp){

            return json(
              res,
              {
                error:
                  "Geen sessie"
              },
              401
            );

          }

          const body=
            await readBody(req);

          const text=
            String(
              body.text ||
              ""
            )
            .trim()
            .slice(0,200);

          if(!text){

            return json(
              res,
              {
                error:
                  "Leeg bericht."
              },
              400
            );

          }

          chat(
            gp.room,
            gp.player.name,
            text
          );

          bump(
            gp.room
          );

          return json(
            res,
            publicState(
              gp.room,
              gp.index
            )
          );

        }

        /* NOT FOUND */

        return json(
          res,
          {
            error:
              "Niet gevonden"
          },
          404
        );

      }catch(error){

        console.error(error);

        return json(
          res,
          {
            error:
              "Serverfout"
          },
          500
        );

      }

    }
  );

server.listen(
  PORT,
  ()=>{
    console.log(
      "Dobbelen 11/24 gestart op poort "+
      PORT
    );
  }
);
