const http = require("http");
const crypto = require("crypto");

const PORT = process.env.PORT || 10000;
const rooms = new Map();
const MAX_PLAYERS = 4;

function id() {
  return crypto.randomBytes(12).toString("hex");
}

function code4() {
  let c;
  do {
    c = crypto.randomBytes(2).toString("hex").toUpperCase();
  } while (rooms.has(c));
  return c;
}

function die() {
  return 1 + Math.floor(Math.random() * 6);
}

function activePlayers(r) {
  return r.players.filter(p => p.active);
}

function player(r, token) {
  return r.players.find(p => p.token === token);
}

function money(n) {
  return Math.round(n * 100) / 100;
}

function log(r, text) {
  r.history.unshift(text);
  r.history = r.history.slice(0, 40);
}

function publicRoom(r) {
  return {
    code: r.code,
    phase: r.phase,
    players: r.players.map(p => ({
      id: p.id,
      name: p.name,
      money: p.money,
      admin: p.admin,
      active: p.active
    })),
    turn: r.turn,
    dice: r.dice,
    held: r.held,
    rolled: r.rolled,
    target: r.target,
    targetHeld: r.targetHeld,
    direction: r.direction,
    result: r.result,
    message: r.message,
    history: r.history,
    chat: r.chat.slice(-40),
    startOrder: r.startOrder,
    undoHold: !!r.undoHold,
    undoAccept: !!r.undoAccept
  };
}

function transferEachOpponent(r, currentId, amount) {
  const ps = activePlayers(r);
  const cur = ps.find(p => p.id === currentId);

  if (!cur) return;

  for (const p of ps) {
    if (p.id === currentId) continue;

    if (amount > 0) {
      cur.money = money(cur.money + amount);
      p.money = money(p.money - amount);
    } else {
      const a = Math.abs(amount);
      cur.money = money(cur.money - a);
      p.money = money(p.money + a);
    }
  }
}

function allSame(dice) {
  return dice.length === 5 && dice.every(x => x === dice[0]);
}

function directionFor(sum) {
  if (sum < 11 || sum > 24) return "earn";
  return "pay";
}

function targetFor(direction, sum, full) {
  if (full) return 6;

  if (direction === "earn") {
    const map = {
      5: 6,
      6: 5,
      7: 4,
      8: 3,
      9: 2,
      10: 1,
      25: 1,
      26: 2,
      27: 3,
      28: 4,
      29: 5,
      30: 6
    };

    return map[sum] || 0;
  }

  const map = {
    12: 1,
    13: 2,
    14: 3,
    15: 4,
    16: 5,
    17: 6,
    18: 6,
    19: 5,
    20: 4,
    21: 3,
    22: 2,
    23: 1
  };

  return map[sum] || 0;
}

function resetTurn(r, next) {
  r.turn = next.id;
  r.phase = "main";
  r.dice = [1, 1, 1, 1, 1];
  r.held = [false, false, false, false, false];
  r.rolled = false;
  r.target = 0;
  r.targetHeld = [false, false, false, false, false];
  r.direction = "";
  r.result = "";
  r.undoHold = null;
  r.undoAccept = null;
  r.message = next.name + " is aan de beurt.";
}

function nextTurn(r) {
  const ps = activePlayers(r);

  if (!ps.length) return;

  let index = ps.findIndex(p => p.id === r.turn);

  if (index < 0) index = 0;

  const next = ps[(index + 1) % ps.length];

  resetTurn(r, next);
}

function startGame(r) {
  const ps = activePlayers(r);

  if (ps.length < 2) return false;

  let contenders = ps.map(p => ({
    p,
    roll: die()
  }));

  while (true) {
    const max = Math.max(...contenders.map(x => x.roll));
    const top = contenders.filter(x => x.roll === max);

    if (top.length === 1) {
      const first = top[0].p;
      const startIndex = ps.findIndex(p => p.id === first.id);

      const order =
        ps.slice(startIndex).concat(ps.slice(0, startIndex));

      r.startOrder = order.map(p => p.name);
      r.turn = order[0].id;
      r.phase = "main";
      r.dice = [1, 1, 1, 1, 1];
      r.held = [false, false, false, false, false];
      r.rolled = false;
      r.target = 0;
      r.targetHeld = [false, false, false, false, false];
      r.direction = "";
      r.result = "";
      r.undoHold = null;
      r.undoAccept = null;

      r.message = order[0].name + " begint.";
      log(r, "Startvolgorde: " + order.map(p => p.name).join(" → "));

      return true;
    }

    contenders = top.map(x => ({
      p: x.p,
      roll: die()
    }));
  }
}

function rollMain(r, p) {
  if (r.phase !== "main" || r.turn !== p.id) {
    return "Niet jouw beurt.";
  }

  if (r.rolled && !r.held.some(Boolean)) {
    return "Zet eerst minimaal 1 dobbelsteen vast.";
  }

  if (r.rolled && r.held.every(Boolean)) {
    return "Je kunt niet opnieuw gooien als alle dobbelstenen vaststaan.";
  }

  for (let i = 0; i < 5; i++) {
    if (!r.held[i]) {
      r.dice[i] = die();
    }
  }

  r.rolled = true;
  r.undoAccept = null;
  r.result = "";
  r.message = p.name + " gooide.";

  return "";
}

function hold(r, p, index) {
  if (r.phase !== "main" || r.turn !== p.id || !r.rolled) {
    return "Je kunt nu geen dobbelsteen vastzetten.";
  }

  if (index < 0 || index > 4) {
    return "Ongeldige dobbelsteen.";
  }

  r.undoHold = {
    dice: [...r.dice],
    held: [...r.held]
  };

  r.held[index] = !r.held[index];

  return "";
}

function accept(r, p) {
  if (r.phase !== "main" || r.turn !== p.id || !r.rolled) {
    return "Gooi eerst.";
  }

  if (!r.held.some(Boolean)) {
    return "Je moet minimaal 1 dobbelsteen vastzetten.";
  }

  r.undoAccept = {
    phase: r.phase,
    dice: [...r.dice],
    held: [...r.held],
    rolled: r.rolled,
    target: r.target,
    targetHeld: [...r.targetHeld],
    direction: r.direction,
    result: r.result,
    message: r.message
  };

  const sum = r.dice.reduce((a, b) => a + b, 0);

  if (sum === 11 || sum === 24) {
    transferEachOpponent(r, p.id, -0.50);

    r.result = sum + ": BETALEN €0,50";
    r.message = r.result;

    log(
      r,
      p.name +
        " gooide " +
        sum +
        " → betaalt €0,50 per actieve tegenstander."
    );

    setTimeout(() => {
      if (
        rooms.has(r.code) &&
        r.turn === p.id &&
        r.phase === "main"
      ) {
        nextTurn(r);
      }
    }, 700);

    return "";
  }

  const full = allSame(r.dice);
  const direction = directionFor(sum);
  const target = targetFor(direction, sum, full);

  if (!target) {
    r.undoAccept = null;
    return "Deze combinatie is niet geldig.";
  }

  r.direction = direction;
  r.target = target;
  r.phase = direction;
  r.targetHeld = [false, false, false, false, false];
  r.held = [false, false, false, false, false];

  r.result =
    direction === "earn"
      ? "VERDIENEN: " + target + "'EN"
      : "BETALEN: " + target + "'EN";

  r.message =
    p.name + " moet " + target + "'en gooien.";

  log(r, p.name + " → " + r.result);

  return "";
}

function targetRoll(r, p) {
  if (
    (r.phase !== "earn" && r.phase !== "pay") ||
    r.turn !== p.id
  ) {
    return "Niet jouw beurt.";
  }

  if (r.targetHeld.every(Boolean)) {
    r.targetHeld = [false, false, false, false, false];
  }

  let newly = 0;

  for (let i = 0; i < 5; i++) {
    if (!r.targetHeld[i]) {
      r.dice[i] = die();

      if (r.dice[i] === r.target) {
        r.targetHeld[i] = true;
        newly++;
      }
    }
  }

  if (newly === 0) {
    r.message =
      "Geen nieuwe " +
      r.target +
      ". Beurt voorbij.";

    log(
      r,
      p.name +
        " had geen nieuwe " +
        r.target +
        " → beurt voorbij."
    );

    setTimeout(() => {
      if (
        rooms.has(r.code) &&
        r.turn === p.id &&
        (r.phase === "earn" || r.phase === "pay")
      ) {
        nextTurn(r);
      }
    }, 650);

    return "";
  }

  const amount = money(
    newly * r.target * 0.50
  );

  const signed =
    r.phase === "earn"
      ? amount
      : -amount;

  transferEachOpponent(
    r,
    p.id,
    signed
  );

  r.message =
    (r.phase === "earn" ? "+" : "−") +
    "€" +
    amount.toFixed(2).replace(".", ",") +
    " (" +
    newly +
    " × " +
    r.target +
    ")";

  log(
    r,
    p.name +
      " " +
      (r.phase === "earn"
        ? "verdient "
        : "betaalt ") +
      "€" +
      amount.toFixed(2).replace(".", ",") +
      "."
  );

  return "";
}

function act(r, token, action, data) {
  const p = player(r, token);

  if (!p) {
    return "Speler niet gevonden.";
  }

  if (!p.active) {
    return "Je bent niet actief.";
  }

  if (action === "roll") {
    return rollMain(r, p);
  }

  if (action === "hold") {
    return hold(r, p, Number(data.index));
  }

  if (action === "accept") {
    return accept(r, p);
  }

  if (action === "targetRoll") {
    return targetRoll(r, p);
  }

  if (action === "undoHold") {
    if (
      r.phase !== "main" ||
      r.turn !== p.id ||
      !r.undoHold
    ) {
      return "Er is geen vastzetting om terug te zetten.";
    }

    r.dice = [...r.undoHold.dice];
    r.held = [...r.undoHold.held];
    r.undoHold = null;
    r.message = "Laatste vastzetting teruggedraaid.";

    return "";
  }

  if (action === "undoAccept") {
    if (
      r.turn !== p.id ||
      !r.undoAccept
    ) {
      return "Er is geen akkoord om terug te zetten.";
    }

    const u = r.undoAccept;

    r.phase = u.phase;
    r.dice = [...u.dice];
    r.held = [...u.held];
    r.rolled = u.rolled;
    r.target = u.target;
    r.targetHeld = [...u.targetHeld];
    r.direction = u.direction;
    r.result = u.result;
    r.message = "Laatste akkoord teruggedraaid.";
    r.undoAccept = null;

    return "";
  }

  if (action === "start") {
    if (!p.admin) {
      return "Alleen de beheerder kan het spel starten.";
    }

    if (activePlayers(r).length < 2) {
      return "Minimaal 2 actieve spelers nodig.";
    }

    if (r.phase !== "lobby") {
      return "Het spel is al gestart.";
    }

    startGame(r);
    return "";
  }

  if (action === "pause") {
    if (!p.admin) {
      return "Alleen de beheerder kan spelers beheren.";
    }

    const target = r.players.find(
      x => x.id === data.id
    );

    if (!target || target.id === p.id) {
      return "Ongeldige speler.";
    }

    target.active = !target.active;

    if (
      r.phase !== "lobby" &&
      r.turn === target.id
    ) {
      nextTurn(r);
    }

    return "";
  }

  if (action === "remove") {
    if (!p.admin) {
      return "Alleen de beheerder kan spelers beheren.";
    }

    const target = r.players.find(
      x => x.id === data.id
    );

    if (!target || target.id === p.id) {
      return "Ongeldige speler.";
    }

    target.active = false;

    if (
      r.phase !== "lobby" &&
      r.turn === target.id
    ) {
      nextTurn(r);
    }

    return "";
  }

  if (action === "chat") {
    const text = String(
      data.text || ""
    )
      .trim()
      .slice(0, 200);

    if (text) {
      r.chat.push({
        name: p.name,
        text,
        at: Date.now()
      });
    }

    return "";
  }

  return "Onbekende actie.";
}

function bodyJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", chunk => {
      data += chunk;

      if (data.length > 100000) {
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(
          data
            ? JSON.parse(data)
            : {}
        );
      } catch (e) {
        reject(e);
      }
    });

    req.on("error", reject);
  });
}

function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type":
      "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });

  res.end(JSON.stringify(data));
}

const HTML = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport"
content="width=device-width,initial-scale=1,maximum-scale=1">
<title>🎲 DOBBELEN 11/24</title>

<style>
*{box-sizing:border-box}

html,body{
 margin:0;
 min-height:100%;
 font-family:Arial,Helvetica,sans-serif;
 color:#fff;
 background:
 radial-gradient(circle at 50% 0,#650018 0,#1a000d 35%,#050507 78%);
 font-weight:700;
}

body:before{
 content:"";
 position:fixed;
 inset:0;
 pointer-events:none;
 opacity:.18;
 background:
 radial-gradient(circle,#ffd23f 1px,transparent 2px);
 background-size:36px 36px;
}

.wrap{
 max-width:900px;
 margin:auto;
 padding:14px 14px 95px;
}

.logo{
 text-align:center;
 font-size:clamp(31px,8vw,58px);
 font-weight:1000;
 color:#ffd85a;
 text-shadow:
 0 0 8px #ff1744,
 0 0 25px #ff1744;
 letter-spacing:1px;
 margin:12px 0;
}

.tag{
 text-align:center;
 color:#ffe9a0;
 font-size:12px;
 letter-spacing:3px;
 margin-bottom:12px;
}

.panel{
 background:
 linear-gradient(145deg,#172338,#0b111e);
 border:2px solid #d7a72c;
 border-radius:22px;
 padding:18px;
 margin:14px 0;
 box-shadow:
 0 0 20px #ff174433,
 inset 0 0 25px #0008;
}

.title{
 text-align:center;
 font-size:24px;
 color:#ffd85a;
 margin-bottom:13px;
}

.label{
 display:block;
 color:#ffd85a;
 font-size:13px;
 margin:8px 0 5px;
}

input{
 width:100%;
 background:#050a13;
 color:#fff;
 border:1px solid #667080;
 border-radius:14px;
 padding:14px 15px;
 font-size:17px;
 outline:none;
}

input:focus{
 border-color:#ffd23f;
 box-shadow:0 0 8px #ffd23f44;
}

.row{
 display:flex;
 gap:10px;
 flex-wrap:wrap;
}

.row>*{
 flex:1;
 min-width:180px;
}

button{
 border:1px solid #ffffff33;
 border-radius:14px;
 padding:14px 18px;
 color:#fff;
 font-size:16px;
 font-weight:1000;
 background:
 linear-gradient(145deg,#394d67,#1c293b);
 box-shadow:0 4px 10px #0008;
 cursor:pointer;
}

button:active{
 transform:translateY(2px);
}

button:disabled{
 opacity:.35;
 cursor:not-allowed;
}

.green{
 background:
 linear-gradient(145deg,#18a866,#08783f);
}

.orange{
 background:
 linear-gradient(145deg,#d48b21,#a94b08);
}

.blue{
 background:
 linear-gradient(145deg,#2856a0,#173b79);
}

.red{
 background:
 linear-gradient(145deg,#b72a39,#741520);
}

.gold{
 background:
 linear-gradient(145deg,#d6a21d,#9a5b00);
 color:#160f00;
}

.error{
 background:#551d25;
 border:1px solid #b64c5a;
 color:#ffb9c0;
 padding:11px;
 border-radius:12px;
 margin:10px 0;
 display:none;
}

.small{
 font-size:13px;
 color:#aebbd0;
}

.center{
 text-align:center;
}

.hidden{
 display:none!important;
}

.code{
 font-size:38px;
 letter-spacing:8px;
 text-align:center;
 color:#ffd85a;
 text-shadow:0 0 10px #ffcf33;
 margin:5px 0 14px;
}

.invite{
 margin-top:12px;
 padding:12px;
 border:1px dashed #a88a2d;
 border-radius:12px;
 background:#05070b;
 color:#ffe18a;
 word-break:break-all;
 font-family:monospace;
 font-size:13px;
}

.players{
 display:grid;
 grid-template-columns:repeat(4,1fr);
 gap:9px;
}

.player{
 background:
 linear-gradient(145deg,#101a2b,#071018);
 border:1px solid #ffffff22;
 border-radius:15px;
 padding:12px;
 text-align:center;
}

.player.current{
 outline:3px solid #ffd23f;
 box-shadow:0 0 18px #ff174466;
}

.money{
 font-size:21px;
 color:#fff;
 margin-top:5px;
}

.badge{
 display:inline-block;
 padding:4px 7px;
 border-radius:9px;
 font-size:10px;
 margin-top:6px;
}

.on{
 background:#08783f;
}

.pause{
 background:#8b6800;
}

.turn{
 text-align:center;
 font-size:20px;
 color:#ffd85a;
 margin-bottom:9px;
}

.message{
 text-align:center;
 min-height:25px;
 color:#fff0bd;
}

.result{
 display:none;
 text-align:center;
 padding:14px;
 border-radius:17px;
 font-size:29px;
 font-weight:1000;
 margin:10px 0;
 border:3px solid #ffd23f;
 background:#241107;
}

.result.show{
 display:block;
}

.result.earn{
 border-color:#19d27b;
 background:#073521;
}

.result.pay{
 border-color:#ffb52e;
 background:#3b2205;
}

.table{
 margin:12px auto;
 padding:22px 10px;
 border:7px solid #b48724;
 border-radius:25px;
 background:
 radial-gradient(circle,#157a49,#06492b 75%);
 box-shadow:
 inset 0 0 30px #0008,
 0 0 18px #000;
 min-height:190px;
}

.dice{
 display:flex;
 justify-content:center;
 gap:14px;
 flex-wrap:wrap;
}

.die{
 width:82px;
 height:82px;
 border-radius:16px;
 position:relative;
 background:
 linear-gradient(145deg,#ef3030,#9b0808);
 border:3px solid #ffdede;
 box-shadow:
 inset 4px 5px 10px #fff4,
 inset -7px -8px 12px #410000,
 0 7px 12px #0008;
 cursor:pointer;
}

.die.held{
 transform:translateY(-7px);
 filter:drop-shadow(0 0 10px #ffd65a);
}

.die.held:after{
 content:"VAST";
 position:absolute;
 left:0;
 right:0;
 bottom:-22px;
 text-align:center;
 color:#6affba;
 font-size:11px;
}

.pip{
 position:absolute;
 width:15px;
 height:15px;
 border-radius:50%;
 background:#fff;
 box-shadow:inset 1px 1px 2px #888;
}

.tl{left:13px;top:13px}
.tc{left:50%;top:13px;transform:translateX(-50%)}
.tr{right:13px;top:13px}
.ml{left:13px;top:50%;transform:translateY(-50%)}
.mc{left:50%;top:50%;transform:translate(-50%,-50%)}
.mr{right:13px;top:50%;transform:translateY(-50%)}
.bl{left:13px;bottom:13px}
.bc{left:50%;bottom:13px;transform:translateX(-50%)}
.br{right:13px;bottom:13px}

.actions{
 display:flex;
 justify-content:center;
 gap:10px;
 flex-wrap:wrap;
 margin:15px 0;
}

.actions button{
 min-width:180px;
}

.rule{
 position:fixed;
 left:12px;
 bottom:12px;
 background:
 linear-gradient(145deg,#111d2f,#07101c);
 border:1px solid #ffd23f;
 border-radius:12px;
 padding:9px 13px;
 color:#fff;
 font-size:13px;
 z-index:20;
 box-shadow:0 0 12px #ffd23f33;
}

.chat{
 background:#05070b;
 border:1px solid #ffffff22;
 border-radius:13px;
 padding:10px;
 max-height:190px;
 overflow:auto;
}

.msg{
 padding:5px 0;
 border-bottom:1px solid #ffffff0d;
}

.msg b{
 color:#ffd85a;
}

@media(max-width:650px){
 .wrap{
  padding:8px 9px 85px;
 }

 .players{
  grid-template-columns:repeat(2,1fr);
 }

 .die{
  width:65px;
  height:65px;
 }

 .pip{
  width:11px;
  height:11px;
 }

 .tl{left:9px;top:9px}
 .tc{top:9px}
 .tr{right:9px;top:9px}
 .ml{left:9px}
 .mr{right:9px}
 .bl{left:9px;bottom:9px}
 .bc{bottom:9px}
 .br{right:9px;bottom:9px}

 .table{
  padding:15px 7px;
 }

 .code{
  font-size:32px;
 }
}
</style>
</head>

<body>

<div class="wrap">

<div class="logo">🎲 DOBBELEN 11/24</div>
<div class="tag">ONLINE MULTIPLAYER</div>

<div id="error" class="error"></div>
<div id="app"></div>

</div>

<div class="rule">
🚩 Regel: 5 dezelfde = 6️⃣ verdienen
</div>

<script>

const tokenKey="d1124_token";

let token=sessionStorage.getItem(tokenKey)||"";
let state=null;

const params=new URLSearchParams(location.search);
const inviteRoom=(params.get("room")||"").toUpperCase();

const app=document.getElementById("app");
const errorEl=document.getElementById("error");

const esc=x =>
 String(x??"")
 .replace(/[&<>"']/g,c=>({
  "&":"&amp;",
  "<":"&lt;",
  ">":"&gt;",
  "\"":"&quot;",
  "'":"&#39;"
 }[c]||c));

const euro=x =>
 "€"+Number(x||0)
 .toFixed(2)
 .replace(".",",");

async function api(path,method="GET",data){

 const options={
  method,
  headers:{
   "Content-Type":"application/json",
   "X-Player-Token":token
  }
 };

 if(data){
  options.body=JSON.stringify(data);
 }

 const response=await fetch(path,options);

 let json={};

 try{
  json=await response.json();
 }catch(e){}

 if(!response.ok){
  throw new Error(
   json.error||"Er ging iets mis."
  );
 }

 return json;
}

function showError(message){

 errorEl.textContent=message||"";
 errorEl.style.display=
  message?"block":"none";
}

function home(){

 app.innerHTML=

 '<section class="panel">'+
 '<div class="title">🎲 NIEUW SPEL</div>'+
 '<label class="label">NAAM</label>'+
 '<div class="row">'+
 '<input id="createName" maxlength="20" placeholder="Bijvoorbeeld Wesley">'+
 '<button class="green" id="createBtn">🎲 SPEL MAKEN</button>'+
 '</div>'+
 '</section>'+

 '<section class="panel">'+
 '<div class="title">OF MEEDOEN</div>'+
 '<label class="label">NAAM</label>'+
 '<input id="joinName" maxlength="20" placeholder="Bijvoorbeeld Jan">'+
 '<label class="label">SPEL CODE</label>'+
 '<div class="row">'+
 '<input id="joinCode" maxlength="4" placeholder="ABCD">'+
 '<button class="blue" id="joinBtn">MEEDOEN</button>'+
 '</div>'+
 '</section>';

 document.getElementById("createBtn")
  .onclick=createRoom;

 document.getElementById("joinBtn")
  .onclick=joinRoom;

 if(inviteRoom){

  document.getElementById("joinCode")
   .value=inviteRoom;

  document.getElementById("joinName")
   .focus();
 }
}

async function createRoom(){

 showError("");

 const name=
  document.getElementById("createName")
  .value.trim();

 if(!name){
  showError("Vul eerst je naam in.");
  return;
 }

 try{

  const result=
   await api(
    "/api/create",
    "POST",
    {name}
   );

  token=result.token;

  sessionStorage.setItem(
   tokenKey,
   token
  );

  history.replaceState(
   {},
   "",
   "/?room="+result.code
  );

  await refresh();

 }catch(e){

  showError(e.message);
 }
}

async function joinRoom(){

 showError("");

 const name=
  document.getElementById("joinName")
  .value.trim();

 const code=
  document.getElementById("joinCode")
  .value
  .trim()
  .toUpperCase();

 if(!name){
  showError("Vul eerst je naam in.");
  return;
 }

 if(!code){
  showError("Vul de spelcode in.");
  return;
 }

 try{

  const result=
   await api(
    "/api/join",
    "POST",
    {
     name,
     code
    }
   );

  token=result.token;

  sessionStorage.setItem(
   tokenKey,
   token
  );

  history.replaceState(
   {},
   "",
   "/?room="+result.code
  );

  await refresh();

 }catch(e){

  showError(e.message);
 }
}

function renderLobby(){

 const me=
  state.players.find(
   p=>p.id===state.me
  );

 const isAdmin=
  me&&me.admin;

 const url=
  location.origin+
  "/?room="+state.code;

 app.innerHTML=

 '<section class="panel center">'+
 '<div class="title">🎰 WACHTRUIMTE</div>'+
 '<div class="small">SPEL CODE</div>'+
 '<div class="code">'+
 esc(state.code)+
 '</div>'+

 (
  isAdmin
  ?
  '<div class="invite">'+
  esc(url)+
  '</div>'+
  '<div class="actions">'+
  '<button class="gold" id="copy">'+
  '🔗 LINK KOPIËREN'+
  '</button>'+
  '</div>'
  :
  '<div class="wait">'+
  'Wacht tot de beheerder het spel start.'+
  '</div>'
 )+

 '</section>'+

 '<section class="panel">'+
 '<div class="title">👥 SPELERS</div>'+
 '<div class="players" id="lobbyPlayers"></div>'+

 (
  isAdmin
  ?
  '<div class="actions">'+
  '<button class="green" id="start">'+
  '🎲 START SPEL'+
  '</button>'+
  '</div>'
  :
  ''
 )+

 '</section>';

 const box=
  document.getElementById(
   "lobbyPlayers"
  );

 state.players.forEach(p=>{

  const div=
   document.createElement("div");

  div.className="player";

  div.innerHTML=
   "<b>"+
   esc(p.name)+
   "</b>"+
   "<div class='money'>"+
   euro(p.money)+
   "</div>"+
   "<span class='badge "+
   (p.active?"on":"pause")+
   "'>"+
   (p.admin?"👑 BEHEERDER • ":"")+
   (p.active?"🟢 ACTIEF":"⏸️ PAUZE")+
   "</span>";

  if(isAdmin&&!p.admin){

   const pause=
    document.createElement("button");

   pause.style.marginTop="8px";
   pause.style.padding="8px";

   pause.textContent=
    p.active
    ?"⏸️ PAUZE"
    :"🟢 ACTIEF";

   pause.onclick=
    ()=>doAction(
     "pause",
     {id:p.id}
    );

   div.appendChild(pause);

   const remove=
    document.createElement("button");

   remove.className="red";
   remove.style.marginTop="6px";
   remove.style.padding="8px";

   remove.textContent=
    "❌ VERWIJDER";

   remove.onclick=
    ()=>doAction(
     "remove",
     {id:p.id}
    );

   div.appendChild(remove);
  }

  box.appendChild(div);
 });

 if(isAdmin){

  document.getElementById(
   "copy"
  ).onclick=async()=>{

   try{

    await navigator.clipboard
     .writeText(url);

    document.getElementById(
     "copy"
    ).textContent=
     "✅ LINK GEKOPIEERD";

   }catch(e){

    prompt(
     "Kopieer deze link:",
     url
    );
   }
  };

  const start=
   document.getElementById("start");

  start.disabled=
   state.players.filter(
    p=>p.active
   ).length<2;

  start.onclick=
   ()=>doAction("start");
 }
}

const pipMap={
 1:["mc"],
 2:["tl","br"],
 3:["tl","mc","br"],
 4:["tl","tr","bl","br"],
 5:["tl","tr","mc","bl","br"],
 6:["tl","tr","ml","mr","bl","br"]
};

function dieHTML(v,i,held){

 return '<div class="die '+
  (held?"held":"")+
  '" data-i="'+i+'">'+

  pipMap[v]
   .map(c=>
    '<span class="pip '+c+'"></span>'
   )
   .join("")+

  '</div>';
}

function renderDice(){

 let html="";

 for(let i=0;i<5;i++){

  html+=
   dieHTML(
    state.dice[i],
    i,
    state.held[i]
   );
 }

 return html;
}

function renderGame(){

 const me=
  state.players.find(
   p=>p.id===state.me
  );

 const current=
  state.players.find(
   p=>p.id===state.turn
  );

 const mine=
  me&&me.id===state.turn;

 const isAdmin=
  me&&me.admin;

 let banner="";

 if(state.phase==="earn"){

  banner=
   '<div class="result earn show">'+
   'VERDIENEN: '+
   state.target+
   "'EN</div>";
 }

 if(state.phase==="pay"){

  banner=
   '<div class="result pay show">'+
   'BETALEN: '+
   state.target+
   "'EN</div>";
 }

 if(
  state.result&&
  state.phase==="main"
 ){

  banner=
   '<div class="result pay show">'+
   esc(state.result)+
   '</div>';
 }

 app.innerHTML=

 '<section class="panel">'+

 '<div class="turn">'+
 '🎯 '+
 (current?esc(current.name):"")+
 ' IS AAN DE BEURT'+
 '</div>'+

 '<div class="message">'+
 esc(state.message||"")+
 '</div>'+

 banner+

 '<div class="table">'+
 '<div class="dice" id="dice"></div>'+
 '</div>'+

 '<div class="actions" id="actions"></div>'+

 '</section>'+

 '<section class="panel">'+
 '<div class="title">👥 SPELERS</div>'+
 '<div class="players" id="players"></div>'+
 '</section>'+

 '<section class="panel">'+
 '<div class="title">📜 GESCHIEDENIS</div>'+
 '<div class="chat" id="history"></div>'+
 '</section>'+

 '<section class="panel">'+
 '<button class="blue" id="chatToggle">'+
 '💬 CHAT'+
 '</button>'+
 '<div id="chatArea" class="hidden">'+
 '<div class="chat" id="chat"></div>'+
 '<div class="row" style="margin-top:8px">'+
 '<input id="chatInput" maxlength="200" placeholder="Typ een bericht...">'+
 '<button class="blue" id="chatSend">VERSTUUR</button>'+
 '</div>'+
 '</div>'+
 '</section>'+

 (
  isAdmin
  ?
  '<section class="panel">'+
  '<div class="title">⚙️ BEHEERDER</div>'+
  '<div class="actions">'+
  '<button class="gold" id="newGame">'+
  '🔄 NIEUW SPEL'+
  '</button>'+
  '</div>'+
  '</section>'
  :
  ''
 );

 document.getElementById(
  "dice"
 ).innerHTML=
  renderDice();

 document
  .querySelectorAll(".die")
  .forEach(el=>{

   el.onclick=()=>{

    if(
     mine&&
     state.phase==="main"&&
     state.rolled
    ){

     doAction(
      "hold",
      {
       index:
        Number(
         el.dataset.i
        )
      }
     );
    }
   };
  });

 const actions=
  document.getElementById(
   "actions"
  );

 if(
  mine&&
  state.phase==="main"
 ){

  const roll=
   document.createElement(
    "button"
   );

  roll.className=
   state.rolled
   ?"orange"
   :"green";

  roll.textContent=
   state.rolled
   ?"🎲 OPNIEUW GOOIEN"
   :"🎲 BEGIN WORP";

  roll.disabled=
   state.rolled&&
   (
    !state.held.some(Boolean)||
    state.held.every(Boolean)
   );

  roll.onclick=
   ()=>doAction("roll");

  actions.appendChild(roll);

  const accept=
   document.createElement(
    "button"
   );

  accept.className="blue";
  accept.textContent=
   "✓ AKKOORD";

  accept.disabled=
   !state.rolled||
   !state.held.some(Boolean);

  accept.onclick=
   ()=>doAction("accept");

  actions.appendChild(accept);

  if(state.undoHold){

   const undo=
    document.createElement(
     "button"
    );

   undo.className="gold";

   undo.textContent=
    "↩️ LAATSTE VASTZETTING TERUG";

   undo.onclick=
    ()=>doAction("undoHold");

   actions.appendChild(undo);
  }

  if(state.undoAccept){

   const undoAccept=
    document.createElement(
     "button"
    );

   undoAccept.className="gold";

   undoAccept.textContent=
    "↩️ AKKOORD TERUG";

   undoAccept.onclick=
    ()=>doAction("undoAccept");

   actions.appendChild(
    undoAccept
   );
  }

 }else if(
  mine&&
  (
   state.phase==="earn"||
   state.phase==="pay"
  )
 ){

  const button=
   document.createElement(
    "button"
   );

  button.className="orange";

  button.textContent=
   state.phase==="earn"
   ?
   "🎲 OPNIEUW GOOIEN OM TE VERDIENEN"
   :
   "🎲 OPNIEUW GOOIEN OM TE BETALEN";

  button.onclick=
   ()=>doAction(
    "targetRoll"
   );

  actions.appendChild(
   button
  );
 }

 const players=
  document.getElementById(
   "players"
  );

 state.players.forEach(p=>{

  const div=
   document.createElement("div");

  div.className=
   "player "+
   (
    p.id===state.turn
    ?"current"
    :""
   );

  div.innerHTML=
   "<b>"+
   esc(p.name)+
   "</b>"+
   "<div class='money'>"+
   euro(p.money)+
   "</div>"+
   "<span class='badge "+
   (p.active?"on":"pause")+
   "'>"+
   (p.admin?"👑 ":"")+
   (p.active?"🟢 ACTIEF":"⏸️ PAUZE")+
   "</span>";

  if(isAdmin&&!p.admin){

   const pause=
    document.createElement(
     "button"
    );

   pause.style.marginTop="8px";
   pause.style.padding="7px";

   pause.textContent=
    p.active
    ?"⏸️ PAUZE"
    :"🟢 ACTIEF";

   pause.onclick=
    ()=>doAction(
     "pause",
     {id:p.id}
    );

   div.appendChild(
    pause
   );

   const remove=
    document.createElement(
     "button"
    );

   remove.className="red";
   remove.style.marginTop="5px";
   remove.style.padding="7px";

   remove.textContent=
    "❌ VERWIJDER";

   remove.onclick=
    ()=>doAction(
     "remove",
     {id:p.id}
    );

   div.appendChild(
    remove
   );
  }

  players.appendChild(
   div
  );
 });

 const history=
  document.getElementById(
   "history"
  );

 (state.history||[])
  .forEach(text=>{

   const div=
    document.createElement(
     "div"
    );

   div.className="msg";
   div.textContent=text;

   history.appendChild(
    div
   );
  });

 const chat=
  document.getElementById(
   "chat"
  );

 (state.chat||[])
  .forEach(m=>{

   const div=
    document.createElement(
     "div"
    );

   div.className="msg";

   div.innerHTML=
    "<b>"+
    esc(m.name)+
    ":</b> "+
    esc(m.text);

   chat.appendChild(
    div
   );
  });

 chat.scrollTop=
  chat.scrollHeight;

 document.getElementById(
  "chatToggle"
 ).onclick=()=>{

  document.getElementById(
   "chatArea"
  ).classList.toggle(
   "hidden"
  );
 };

 document.getElementById(
  "chatSend"
 ).onclick=sendChat;

 document.getElementById(
  "chatInput"
 ).onkeydown=e=>{

  if(e.key==="Enter"){
   sendChat();
  }
 };

 if(isAdmin){

  document.getElementById(
   "newGame"
  ).onclick=()=>{

   if(
    confirm(
     "Nieuw spel starten?"
    )
   ){

    doAction(
     "newGame"
    );
   }
  };
 }
}

async function sendChat(){

 const input=
  document.getElementById(
   "chatInput"
  );

 if(
  !input||
  !input.value.trim()
 ){
  return;
 }

 await doAction(
  "chat",
  {
   text:
    input.value.trim()
  }
 );
}

async function doAction(
 action,
 data
){

 try{

  await api(
   "/api/action",
   "POST",
   {
    action,
    ...(data||{})
   }
  );

  await refresh();

 }catch(e){

  showError(
   e.message
  );
 }
}

async function refresh(){

 try{

  const result=
   await api(
    "/api/state"
   );

  state=result.state;
  state.me=result.me;

  showError("");

  if(
   state.phase==="lobby"
  ){
   renderLobby();
  }else{
   renderGame();
  }

 }catch(e){

  if(!token){
   home();
   return;
  }

  token="";
  sessionStorage.removeItem(
   tokenKey
  );

  history.replaceState(
   {},
   "",
   location.pathname+
   (
    inviteRoom
    ?
    "?room="+inviteRoom
    :
    ""
   )
  );

  home();

  showError(
   e.message
  );
 }
}

home();

if(token){
 refresh();
}

setInterval(
 ()=>{
  if(token){
   refresh();
  }
 },
 1000
);

</script>

</body>
</html>`;

function resetRoom(r){

 r.phase="lobby";
 r.turn=null;
 r.dice=[1,1,1,1,1];
 r.held=[
  false,
  false,
  false,
  false,
  false
 ];
 r.rolled=false;
 r.target=0;
 r.targetHeld=[
  false,
  false,
  false,
  false,
  false
 ];
 r.direction="";
 r.result="";
 r.message=
  "Nieuwe speelkamer. Wacht op spelers.";
 r.history=[];
 r.chat=[];
 r.startOrder=[];
 r.undoHold=null;
 r.undoAccept=null;

 r.players.forEach(p=>{
  p.money=100;
  p.active=true;
 });
}

const server=
 http.createServer(
  async(req,res)=>{

   const url=
    new URL(
     req.url,
     "http://localhost"
    );

   if(
    req.method==="OPTIONS"
   ){

    res.writeHead(
     204,
     {
      "Access-Control-Allow-Origin":"*",
      "Access-Control-Allow-Headers":
       "Content-Type,X-Player-Token",
      "Access-Control-Allow-Methods":
       "GET,POST,OPTIONS"
     }
    );

    return res.end();
   }

   if(
    url.pathname==="/"
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

   if(
    url.pathname==="/api/create"&&
    req.method==="POST"
   ){

    try{

     const body=
      await bodyJson(req);

     const name=
      String(
       body.name||""
      )
      .trim()
      .slice(0,20);

     if(!name){

      return send(
       res,
       400,
       {
        error:
         "Vul eerst je naam in."
       }
      );
     }

     const code=
      code4();

     const token=
      id();

     const room={
      code,
      phase:"lobby",

      players:[
       {
        id:id(),
        token,
        name,
        money:100,
        admin:true,
        active:true
       }
      ],

      turn:null,

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

      rolled:false,

      target:0,

      targetHeld:[
       false,
       false,
       false,
       false,
       false
      ],

      direction:"",
      result:"",
      message:
       "Wacht op andere spelers.",

      history:[],
      chat:[],
      startOrder:[],

      undoHold:null,
      undoAccept:null
     };

     rooms.set(
      code,
      room
     );

     return send(
      res,
      200,
      {
       code,
       token
      }
     );

    }catch(e){

     return send(
      res,
      400,
      {
       error:
        "Ongeldige aanvraag."
      }
     );
    }
   }

   if(
    url.pathname==="/api/join"&&
    req.method==="POST"
   ){

    try{

     const body=
      await bodyJson(req);

     const code=
      String(
       body.code||""
      )
      .trim()
      .toUpperCase();

     const name=
      String(
       body.name||""
      )
      .trim()
      .slice(0,20);

     const room=
      rooms.get(code);

     if(!room){

      return send(
       res,
       404,
       {
        error:
         "Deze kamer bestaat niet meer."
       }
      );
     }

     if(
      room.phase!=="lobby"
     ){

      return send(
       res,
       400,
       {
        error:
         "Het spel is al gestart."
       }
      );
     }

     if(
      activePlayers(room)
       .length>=MAX_PLAYERS
     ){

      return send(
       res,
       400,
       {
        error:
         "De kamer zit vol. Maximaal 4 spelers."
       }
      );
     }

     if(!name){

      return send(
       res,
       400,
       {
        error:
         "Vul eerst je naam in."
       }
      );
     }

     const token=id();

     room.players.push({
      id:id(),
      token,
      name,
      money:100,
      admin:false,
      active:true
     });

     room.message=
      name+
      " is de kamer binnengekomen.";

     return send(
      res,
      200,
      {
       code,
       token
      }
     );

    }catch(e){

     return send(
      res,
      400,
      {
       error:
        "Ongeldige aanvraag."
      }
     );
    }
   }

   if(
    url.pathname==="/api/state"&&
    req.method==="GET"
   ){

    const token=
     req.headers[
      "x-player-token"
     ]||"";

    let found=null;

    for(
     const room of rooms.values()
    ){

     const p=
      player(
       room,
       token
      );

     if(p){

      found={
       room,
       player:p
      };

      break;
     }
    }

    if(!found){

     return send(
      res,
      401,
      {
       error:
        "Sessie verlopen. Maak of join opnieuw."
      }
     );
    }

    return send(
     res,
     200,
     {
      state:publicRoom(
       found.room
      ),
      me:found.player.id
     }
    );
   }

   if(
    url.pathname==="/api/action"&&
    req.method==="POST"
   ){

    const token=
     req.headers[
      "x-player-token"
     ]||"";

    let found=null;

    for(
     const room of rooms.values()
    ){

     const p=
      player(
       room,
       token
      );

     if(p){

      found={
       room,
       player:p
      };

      break;
     }
    }

    if(!found){

     return send(
      res,
      401,
      {
       error:
        "Sessie verlopen."
      }
     );
    }

    try{

     const body=
      await bodyJson(req);

     if(
      body.action==="newGame"
     ){

      if(
       !found.player.admin
      ){

       return send(
        res,
        403,
        {
         error:
          "Alleen de beheerder kan een nieuw spel starten."
        }
       );
      }

      resetRoom(
       found.room
      );

      return send(
       res,
       200,
       {ok:true}
      );
     }

     const error=
      act(
       found.room,
       token,
       body.action,
       body
      );

     if(error){

      return send(
       res,
       400,
       {
        error
       }
      );
     }

     return send(
      res,
      200,
      {
       ok:true
      }
     );

    }catch(e){

     return send(
      res,
      400,
      {
       error:
        "Ongeldige actie."
      }
     );
    }
   }

   res.writeHead(
    404
   );

   res.end(
    "Not found"
   );
  }
);

server.listen(
 PORT,
 "0.0.0.0",
 ()=>{
  console.log(
   "Dobbelen 11/24 draait op poort "+
   PORT
  );
 }
);
