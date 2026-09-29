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
  opacity:.32;
  cursor:not-allowed;
}

.app{
  width:min(980px,100%);
  margin:auto;
  padding:7px;
}

/* =========================
   HEADER
========================= */

.header{
  background:linear-gradient(180deg,#381209,#180604);
  border:3px solid #c79a35;
  border-radius:18px;
  padding:10px;
  box-shadow:0 6px 22px #0009;
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
  background:#050505c7;
  font-weight:900;
  font-size:15px;
}

/* =========================
   PLAYERS
========================= */

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

/* =========================
   GAME
========================= */

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

/* =========================
   TARGET
========================= */

.targetBox{
  display:none;
  margin:8px auto;
  max-width:550px;
  text-align:center;
  background:linear-gradient(180deg,#271904,#100a02);
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

/* =========================
   DICE TABLE
========================= */

.diceArea{
  position:relative;
  min-height:310px;
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

  box-shadow:inset 0 0 40px #0009;
}

/* =========================
   DICE CUP
========================= */

.diceCup{
  position:absolute;
  top:10px;
  left:50%;
  transform:translateX(-50%);

  width:110px;
  height:47px;

  border-radius:10px 10px 45px 45px;

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

  z-index:5;
}

.diceCup::before{
  content:"";

  position:absolute;

  width:78px;
  height:21px;

  left:50%;
  top:6px;

  transform:translateX(-50%);

  border-radius:50%;

  background:#160e04;

  border:2px solid #f0c557;

  box-shadow:inset 0 0 12px #000;
}

.diceCup::after{
  content:"DOBBELBAK";

  position:absolute;

  left:50%;
  top:31px;

  transform:translateX(-50%);

  color:#271800;
  font-size:7px;
  font-weight:1000;
  white-space:nowrap;
}

/* =========================
   DICE TRAY
========================= */

.diceTray{
  position:relative;

  min-height:310px;

  display:flex;
  flex-wrap:wrap;

  justify-content:center;
  align-items:center;
  align-content:center;

  gap:14px;

  padding:70px 12px 24px;

  perspective:900px;
}

/* =========================
   DICE
========================= */

.die{
  position:relative;

  width:74px;
  height:74px;

  flex:0 0 74px;

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

  transform-origin:center center;

  user-select:none;
  touch-action:manipulation;

  transition:
    box-shadow .15s,
    filter .15s;
}

.die.selectable{
  cursor:pointer;
}

.die.selectable:active{
  filter:brightness(1.25);
}

.die.held,
.die.settled{
  border-color:#fff08a;

  box-shadow:
    0 0 0 3px #ffcf38aa,
    0 0 24px #ffd83eaa,
    inset 5px 5px 9px #ff9a87aa,
    inset -9px -9px 13px #430000aa,
    0 9px 13px #000a;
}

.die.held::before,
.die.settled::before{
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

  z-index:20;
}

/*
  BELANGRIJK:
  Geen rotateX/rotateY.
  Daardoor blijft de dobbelsteen altijd
  mooi vierkant tijdens de animatie.
*/

.die.rolling{
  animation-duration:.85s;
  animation-fill-mode:both;
  animation-timing-function:cubic-bezier(.18,.72,.2,1);
}

.rollA{
  animation-name:rollA;
}

.rollB{
  animation-name:rollB;
}

.rollC{
  animation-name:rollC;
}

.rollD{
  animation-name:rollD;
}

.rollE{
  animation-name:rollE;
}

/* Elke steen heeft een eigen baan */

@keyframes rollA{

  0%{
    transform:
      translate(-120px,-110px)
      rotate(-20deg)
      scale(.82);
  }

  20%{
    transform:
      translate(-75px,-35px)
      rotate(130deg)
      scale(1.04);
  }

  45%{
    transform:
      translate(-20px,30px)
      rotate(310deg)
      scale(1.08);
  }

  70%{
    transform:
      translate(45px,-10px)
      rotate(510deg)
      scale(1.04);
  }

  100%{
    transform:
      translate(0,0)
      rotate(690deg)
      scale(1);
  }

}

@keyframes rollB{

  0%{
    transform:
      translate(125px,-105px)
      rotate(35deg)
      scale(.82);
  }

  20%{
    transform:
      translate(75px,-20px)
      rotate(-100deg)
      scale(1.05);
  }

  45%{
    transform:
      translate(20px,45px)
      rotate(-300deg)
      scale(1.08);
  }

  70%{
    transform:
      translate(-45px,-15px)
      rotate(-500deg)
      scale(1.04);
  }

  100%{
    transform:
      translate(0,0)
      rotate(-690deg)
      scale(1);
  }

}

@keyframes rollC{

  0%{
    transform:
      translate(-105px,105px)
      rotate(-45deg)
      scale(.82);
  }

  20%{
    transform:
      translate(-30px,65px)
      rotate(110deg)
      scale(1.05);
  }

  45%{
    transform:
      translate(55px,20px)
      rotate(280deg)
      scale(1.08);
  }

  70%{
    transform:
      translate(20px,-40px)
      rotate(470deg)
      scale(1.04);
  }

  100%{
    transform:
      translate(0,0)
      rotate(650deg)
      scale(1);
  }

}

@keyframes rollD{

  0%{
    transform:
      translate(110px,105px)
      rotate(40deg)
      scale(.82);
  }

  20%{
    transform:
      translate(45px,65px)
      rotate(-120deg)
      scale(1.05);
  }

  45%{
    transform:
      translate(-50px,20px)
      rotate(-300deg)
      scale(1.08);
  }

  70%{
    transform:
      translate(-20px,-45px)
      rotate(-500deg)
      scale(1.04);
  }

  100%{
    transform:
      translate(0,0)
      rotate(-680deg)
      scale(1);
  }

}

@keyframes rollE{

  0%{
    transform:
      translate(0,-125px)
      rotate(-30deg)
      scale(.82);
  }

  20%{
    transform:
      translate(55px,-55px)
      rotate(120deg)
      scale(1.05);
  }

  45%{
    transform:
      translate(-45px,10px)
      rotate(310deg)
      scale(1.08);
  }

  70%{
    transform:
      translate(35px,45px)
      rotate(520deg)
      scale(1.04);
  }

  100%{
    transform:
      translate(0,0)
      rotate(700deg)
      scale(1);
  }

}

/* =========================
   PIPS
========================= */

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
.p2{left:30px;top:8px}
.p3{right:8px;top:8px}
.p4{left:8px;top:30px}
.p5{left:30px;top:30px}
.p6{right:8px;top:30px}
.p7{left:8px;bottom:8px}
.p8{left:30px;bottom:8px}
.p9{right:8px;bottom:8px}

/* =========================
   BUTTONS
========================= */

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

  background:linear-gradient(#f0a72c,#a95e07);

  border:3px solid #ffdc70;

  box-shadow:
    0 0 20px #ffbd3d55;
}

/* =========================
   RULES
========================= */

.rules{
  margin-top:8px;
  padding:8px;

  background:#0006;

  border-radius:10px;

  color:#ddd;

  font-size:11px;
  line-height:1.45;
}

/* =========================
   CHAT
========================= */

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

/* =========================
   LOG
========================= */

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

/* =========================
   MOBILE
========================= */

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
    min-height:300px;
  }

  .diceTray{
    min-height:300px;
    gap:10px;
    padding:70px 7px 24px;
  }

  .die{
    width:67px;
    height:67px;
    flex-basis:67px;
  }

  .p1,.p2,.p3,
  .p4,.p5,.p6,
  .p7,.p8,.p9{
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
      vijf dezelfde doelstenen worden verwerkt.
      Daarna krijg je automatisch vijf nieuwe dobbelstenen.
      Dit gaat door zolang er nieuwe doelstenen worden gegooid.

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
let chatOpen=false;

const audio={
  ctx:null
};

function sound(type){

  try{

    if(!audio.ctx){

      audio.ctx=
        new(
          window.AudioContext ||
          window.webkitAudioContext
        )();

    }

    if(
      audio.ctx.state===
      "suspended"
    ){
      audio.ctx.resume();
    }

    const ctx=audio.ctx;

    const osc=
      ctx.createOscillator();

    const gain=
      ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    let frequency=400;
    let duration=.1;

    if(type==="roll"){
      frequency=120;
      duration=.16;
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

    osc.frequency.value=
      frequency;

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

    osc.start();

    osc.stop(
      ctx.currentTime+
      duration+
      .02
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
      method:
        body
          ? "POST"
          : "GET",

      headers:
        body
          ? {
              "Content-Type":
                "application/json"
            }
          : {},

      body:
        body
          ? JSON.stringify(body)
          : undefined
    }
  ).then(
    response=>
      response.json()
  );

}

/* =========================
   PIPS
========================= */

function pipPositions(value){

  const map={

    1:["p5"],

    2:["p1","p9"],

    3:["p1","p5","p9"],

    4:[
      "p1",
      "p3",
      "p7",
      "p9"
    ],

    5:[
      "p1",
      "p3",
      "p5",
      "p7",
      "p9"
    ],

    6:[
      "p1",
      "p3",
      "p4",
      "p6",
      "p7",
      "p9"
    ]

  };

  return map[value] || [];

}

/* =========================
   DICE
========================= */

function createDie(
  value,
  index,
  rolling,
  held,
  settled,
  selectable
){

  const die=
    document.createElement(
      "div"
    );

  let classes="die";

  if(rolling){

    classes+=" rolling ";

    classes+=
      [
        "rollA",
        "rollB",
        "rollC",
        "rollD",
        "rollE"
      ][index%5];

  }

  if(held){
    classes+=" held";
  }

  if(settled){
    classes+=" settled";
  }

  if(selectable){
    classes+=" selectable";
  }

  die.className=classes;

  pipPositions(value)
    .forEach(
      position=>{

        const pip=
          document.createElement(
            "span"
          );

        pip.className=
          "pip "+position;

        die.appendChild(pip);

      }
    );

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

/* =========================
   RENDER DICE
========================= */

function renderDice(){

  if(!state){
    return;
  }

  const tray=
    document.getElementById(
      "diceTray"
    );

  const animate=
    state.rollSeq>
    (
      state.lastRenderedRollSeq ??
      -1
    );

  tray.innerHTML="";

  for(
    let i=0;
    i<5;
    i++
  ){

    const held=
      !!state.held[i];

    const settled=
      !!state.settled[i];

    const rolling=
      animate &&
      !held &&
      !settled;

    const selectable=
      state.phase==="main" &&
      state.me===
        state.current &&
      state.hasRolled &&
      !held &&
      state.mustHold;

    tray.appendChild(
      createDie(
        state.dice[i],
        i,
        rolling,
        held,
        settled,
        selectable
      )
    );

  }

  state.lastRenderedRollSeq=
    state.rollSeq;

}

/* =========================
   PLAYERS
========================= */

function renderPlayers(){

  const el=
    document.getElementById(
      "players"
    );

  el.innerHTML="";

  if(!state){
    return;
  }

  state.players.forEach(
    (p,index)=>{

      const div=
        document.createElement(
          "div"
        );

      div.className=
        "player "+
        (
          index===
          state.current
            ? "active "
            : ""
        )+
        (
          !p.active
            ? "off"
            : ""
        );

      div.innerHTML=
        '<div class="pname">'+
        esc(p.name)+
        '</div>'+
        '<div class="money">€ '+
        Number(p.money)
          .toFixed(2)+
        '</div>';

      el.appendChild(div);

    }
  );

}

/* =========================
   CHAT
========================= */

function renderChat(){

  const el=
    document.getElementById(
      "chatMessages"
    );

  if(!state){

    el.innerHTML="";

    return;

  }

  el.innerHTML=
    state.chat
      .map(
        item=>
          '<div class="chatLine">'+
          '<b>'+
          esc(item.name)+
          ':</b> '+
          esc(item.text)+
          '</div>'
      )
      .join("");

  el.scrollTop=
    el.scrollHeight;

}

/* =========================
   LOG
========================= */

function renderLog(){

  const el=
    document.getElementById(
      "log"
    );

  if(!state){

    el.innerHTML="";

    return;

  }

  el.innerHTML=
    state.log
      .map(
        item=>
          "<div>"+
          esc(item)+
          "</div>"
      )
      .join("");

}

/* =========================
   APPLY
========================= */

function apply(){

  if(!state){
    return;
  }

  const mine=
    state.me===
    state.current;

  const main=
    state.phase==="main";

  const round=
    state.phase==="round";

  const currentPlayer=
    state.players[
      state.current
    ];

  document.getElementById(
    "turn"
  ).textContent=
    currentPlayer
      ? "🎯 "+
        currentPlayer.name+
        " is aan de beurt"
      : "";

  document.getElementById(
    "message"
  ).textContent=
    state.banner || "";

  const targetBox=
    document.getElementById(
      "targetBox"
    );

  const targetNumber=
    document.getElementById(
      "targetNumber"
    );

  const actionText=
    document.getElementById(
      "actionText"
    );

  if(round){

    targetBox.classList.add(
      "show"
    );

    targetNumber.textContent=
      state.target+
      " – DOELSTEEN";

    if(
      state.mode===
      "earn"
    ){

      actionText.textContent=
        "VERDIENEN: "+
        state.target+
        "'EN";

      actionText.className=
        "actionText earn";

    }else{

      actionText.textContent=
        "BETALEN: "+
        state.target+
        "'EN";

      actionText.className=
        "actionText pay";

    }

  }else{

    targetBox.classList.remove(
      "show"
    );

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

  const beginButton=
    document.getElementById(
      "begin"
    );

  /*
    MINIMAAL 2 SPELERS
  */
  const playerCount=
    state.players.filter(
      p=>p.active
    ).length;

  beginButton.disabled=
    !mine ||
    !main ||
    state.hasRolled ||
    playerCount<2;

  if(
    playerCount<2 &&
    mine &&
    main &&
    !state.hasRolled
  ){

    beginButton.textContent=
      "👥 WACHT OP SPELER";

  }else{

    beginButton.textContent=
      "🎲 BEGIN WORP";

  }

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

  const roundButton=
    document.getElementById(
      "roundRoll"
    );

  if(round){

    roundButton.textContent=
      state.mode===
      "earn"
        ? "🎲 GOOI VOOR VERDIENEN"
        : "🎲 GOOI VOOR BETALEN";

    roundButton.disabled=
      !mine;

  }

  renderPlayers();
  renderDice();
  renderChat();
  renderLog();

}

/* =========================
   ACTION
========================= */

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
        {
          action
        }
      );

    if(result.error){

      alert(
        result.error
      );

      return;

    }

    state=result;

    if(result.sound){
      sound(
        result.sound
      );
    }

    apply();

  }catch(error){

    alert(
      "Verbinding mislukt."
    );

  }

}

/* =========================
   HOLD DIE
========================= */

async function holdDie(index){

  if(!state){
    return;
  }

  if(
    state.phase!=="main" ||
    state.me!==state.current ||
    !state.mustHold
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

      alert(
        result.error
      );

      return;

    }

    state=result;

    apply();

  }catch(error){

    alert(
      "Verbinding mislukt."
    );

  }

}

/* =========================
   CHAT
========================= */

function toggleChat(){

  chatOpen=
    !chatOpen;

  document
    .getElementById(
      "chatBody"
    )
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

  if(!text){
    return;
  }

  input.value="";

  try{

    const result=
      await api(
        "/api/chat",
        {
          text
        }
      );

    if(result.error){

      alert(
        result.error
      );

      return;

    }

    state=result;

    renderChat();

  }catch(error){}

}

document
  .getElementById(
    "chatInput"
  )
  .addEventListener(
    "keydown",
    event=>{

      if(
        event.key===
        "Enter"
      ){

        sendChat();

      }

    }
  );

/* =========================
   REFRESH
========================= */

async function refresh(){

  try{

    const result=
      await api(
        "/api/state"
      );

    if(result.error){
      return;
    }

    if(
      !state ||
      result.version!==
      state.version
    ){

      state=result;

      apply();

    }

  }catch(error){}

}

/* =========================
   BOOT
========================= */

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

    apply();

    setInterval(
      refresh,
      600
    );

  }catch(error){

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

/* =========================================================
   SERVER
========================================================= */

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

          }catch(error){

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

function die(){

  return Math.floor(
    Math.random()*6
  )+1;

}

/* =========================================================
   ROOM
========================================================= */

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
      false,
      false,
      false,
      false,
      false
    ],

    settled:[
      false,
      false,
      false,
      false,
      false
    ],

    hasRolled:false,

    mustHold:false,

    canUndo:false,

    target:null,

    mode:null,

    banner:
      "Wacht op spelers...",

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

/* =========================================================
   SESSION
========================================================= */

function getSession(req){

  const cookie=
    req.headers.cookie ||
    "";

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

function setCookie(
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
    player:
      room.players[index]
  };

}

/* =========================================================
   STATE
========================================================= */

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

function addLog(
  room,
  text
){

  room.log.unshift(
    text
  );

  if(room.log.length>50){
    room.log.length=50;
  }

}

function addChat(
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

/* =========================================================
   PLAYERS
========================================================= */

function activeCount(room){

  return room.players.filter(
    p=>p.active
  ).length;

}

function nextPlayer(room){

  if(!room.players.length){
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

      room.current=
        index;

      return;

    }

  }

}

/* =========================================================
   MONEY
========================================================= */

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

  for(
    const player of others
  ){

    if(earn){

      player.money+=amount;

      current.money-=amount;

    }else{

      player.money-=amount;

      current.money+=amount;

    }

  }

}

/* =========================================================
   TURN
========================================================= */

function resetTurn(room){

  room.phase="main";

  room.dice=[
    1,1,1,1,1
  ];

  room.held=[
    false,
    false,
    false,
    false,
    false
  ];

  room.settled=[
    false,
    false,
    false,
    false,
    false
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

  const player=
    room.players[
      room.current
    ];

  room.banner=
    player
      ? player.name+
        " is aan de beurt."
      : "Wacht op spelers.";

  bump(room);

}

/* =========================================================
   TARGET
========================================================= */

function targetFor(total){

  if(total<11){

    return {
      target:
        Math.min(
          6,
          11-total
        ),

      mode:
        "earn"
    };

  }

  if(total>24){

    return {
      target:
        Math.min(
          6,
          total-24
        ),

      mode:
        "earn"
    };

  }

  const distance=
    Math.min(
      total-11,
      24-total
    );

  return {

    target:
      Math.min(
        6,
        distance
      ),

    mode:
      "pay"

  };

}

function fullHouse(room){

  return room.dice.every(
    value=>
      value===
      room.dice[0]
  );

}

/* =========================================================
   BEGIN
========================================================= */

function begin(room){

  /*
    SERVER-SIDE:
    minimaal twee spelers.
  */
  if(
    activeCount(room)<2
  ){

    throw new Error(
      "Er moeten minimaal 2 spelers zijn om te beginnen."
    );

  }

  room.phase="main";

  room.dice=[
    die(),
    die(),
    die(),
    die(),
    die()
  ];

  room.held=[
    false,
    false,
    false,
    false,
    false
  ];

  room.settled=[
    false,
    false,
    false,
    false,
    false
  ];

  room.hasRolled=true;

  /*
    VERPLICHT:
    na deze worp eerst minstens
    één steen aantikken.
  */
  room.mustHold=true;

  room.canUndo=false;

  room.rollSeq++;

  room.banner=
    room.players[room.current].name+
    " heeft gegooid. Tik minimaal één dobbelsteen aan.";

  addLog(
    room,
    room.players[room.current].name+
    " begint de beurt."
  );

  bump(room);

}

/* =========================================================
   HOLD
========================================================= */

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
      "Deze dobbelsteen staat al vast."
    );

  }

  room.held[index]=true;

  room.mustHold=false;

  room.canUndo=true;

  room.banner=
    "Steen vastgezet. Je mag opnieuw gooien.";

  bump(room);

}

/* =========================================================
   UNDO
========================================================= */

function undoHold(room){

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
    "Vasthouden teruggedraaid.";

  bump(room);

}

/* =========================================================
   NORMAL REROLL
========================================================= */

function rerollMain(room){

  if(room.mustHold){

    throw new Error(
      "Tik eerst minimaal één nieuwe dobbelsteen aan."
    );

  }

  if(room.held.every(Boolean)){

    throw new Error(
      "Alle vijf dobbelstenen staan vast."
    );

  }

  for(
    let i=0;
    i<5;
    i++
  ){

    if(!room.held[i]){

      room.dice[i]=die();

    }

  }

  room.mustHold=true;

  room.canUndo=false;

  room.hasRolled=true;

  room.rollSeq++;

  room.banner=
    "Nieuwe worp. Tik minimaal één nieuwe steen aan.";

  bump(room);

}

/* =========================================================
   ROUND RESOLVE
========================================================= */

function resolveRound(
  room,
  playerIndex
){

  let hits=0;

  /*
    Alleen nieuwe doelstenen tellen.
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
    Geen doelsteen.
  */
  if(hits===0){

    room.banner=
      "❌ MIS! Geen "+
      room.target+
      " gegooid.";

    addLog(
      room,
      room.players[playerIndex].name+
      " heeft geen "+
      room.target+
      " gegooid."
    );

    bump(room);

    finishTurn(room);

    return {
      sound:"pay"
    };

  }

  /*
    Iedere nieuwe doelsteen
    telt afzonderlijk.
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

  addLog(
    room,
    room.players[playerIndex].name+
    " "+
    action+
    " €"+
    totalAmount.toFixed(2)+
    "."
  );

  /*
    VOLLE BAK:
    alle vijf zijn doelstenen.

    Dan NIET stoppen.

    Nieuwe vijf dobbelstenen.
  */
  if(
    room.settled.every(Boolean)
  ){

    room.dice=[
      die(),
      die(),
      die(),
      die(),
      die()
    ];

    room.held=[
      false,
      false,
      false,
      false,
      false
    ];

    room.settled=[
      false,
      false,
      false,
      false,
      false
    ];

    room.hasRolled=true;

    room.mustHold=false;

    room.canUndo=false;

    room.rollSeq++;

    room.banner+=
      " 🎲 VOLLE BAK! Nieuwe worp met 5 dobbelstenen.";

    addLog(
      room,
      "VOLLE BAK → nieuwe worp met 5 dobbelstenen."
    );

    bump(room);

    return {
      sound:
        room.mode==="earn"
          ? "win"
          : "pay"
    };

  }

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

/* =========================================================
   ACCEPT
========================================================= */

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
      (a,b)=>
        a+b,
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

    addLog(
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
    targetFor(total);

  /*
    VOLLE BAK:
    vijf dezelfde = 6 verdienen.
  */
  if(fullHouse(room)){

    result={
      target:6,
      mode:"earn"
    };

    addLog(
      room,
      "VOLLE BAK! Doelsteen 6."
    );

  }

  room.phase="round";

  room.target=
    result.target;

  room.mode=
    result.mode;

  room.held=[
    false,
    false,
    false,
    false,
    false
  ];

  room.settled=[
    false,
    false,
    false,
    false,
    false
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
    De geaccepteerde worp meteen verwerken.
  */
  return resolveRound(
    room,
    playerIndex
  );

}

/* =========================================================
   ROUND ROLL
========================================================= */

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

    if(
      !room.settled[i]
    ){

      loose.push(i);

    }

  }

  /*
    Veiligheid:
    als alle vijf doelstenen zijn,
    nieuwe vijf.
  */
  if(
    loose.length===0
  ){

    room.dice=[
      die(),
      die(),
      die(),
      die(),
      die()
    ];

    room.held=[
      false,
      false,
      false,
      false,
      false
    ];

    room.settled=[
      false,
      false,
      false,
      false,
      false
    ];

  }else{

    /*
      Alleen losse dobbelstenen.
    */
    for(
      const index of loose
    ){

      room.dice[index]=die();

    }

  }

  room.hasRolled=true;

  room.rollSeq++;

  bump(room);

  return resolveRound(
    room,
    playerIndex
  );

}

/* =========================================================
   ACTION
========================================================= */

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

  if(
    action==="begin"
  ){

    begin(room);

    return {
      sound:"roll"
    };

  }

  if(
    action==="holdDie"
  ){

    if(
      room.phase!=="main"
    ){

      throw new Error(
        "Je kunt nu geen steen vasthouden."
      );

    }

    if(
      !room.hasRolled
    ){

      throw new Error(
        "Je moet eerst gooien."
      );

    }

    if(
      !room.mustHold
    ){

      throw new Error(
        "Je hebt al een nieuwe steen vastgehouden."
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

  if(
    action==="undo"
  ){

    if(
      room.phase!=="main"
    ){

      throw new Error(
        "Dit kan nu niet."
      );

    }

    undoHold(room);

    return {
      sound:"hold"
    };

  }

  if(
    action==="reroll"
  ){

    rerollMain(room);

    return {
      sound:"roll"
    };

  }

  if(
    action==="accept"
  ){

    return accept(
      room,
      playerIndex
    );

  }

  if(
    action==="roundRoll"
  ){

    return roundRoll(
      room,
      playerIndex
    );

  }

  throw new Error(
    "Onbekende actie."
  );

}

/* =========================================================
   HTTP
========================================================= */

const server=
  http.createServer(
    async(req,res)=>{

      try{

        /*
          URL.pathname gebruiken.
          Daardoor werkt ook:

          /?utm_source=chatgpt.com
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
            getRoom(
              roomCode
            );

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
                    "Maximaal 4 spelers."
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

            if(
              room.players.length===1
            ){

              room.current=0;

            }

            /*
              Zodra er een tweede speler komt,
              wordt de eerste speler duidelijk
              geïnformeerd.
            */
            if(
              activeCount(room)>=2 &&
              !room.hasRolled
            ){

              room.banner=
                room.players[
                  room.current
                ].name+
                " is aan de beurt. Klaar om te spelen.";

            }

            addLog(
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

          setCookie(
            res,
            sid
          );

          return json(
            res,
            publicState(
              room,
              room.players.findIndex(
                p=>
                  p.id===
                  player.id
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

          addChat(
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

        return json(
          res,
          {
            error:
              "Niet gevonden"
          },
          404
        );

      }catch(error){

        console.error(
          error
        );

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
