const http=require("http");
const crypto=require("crypto");

const PORT=process.env.PORT||10000;
const rooms=new Map();

function uid(){
  return crypto.randomBytes(12).toString("hex");
}

function code(){
  let c;
  do{
    c=crypto.randomBytes(2).toString("hex").toUpperCase();
  }while(rooms.has(c));
  return c;
}

function roll(){
  return 1+Math.floor(Math.random()*6);
}

function active(r){
  return r.players.filter(p=>p.active);
}

function findPlayer(r,token){
  return r.players.find(p=>p.token===token);
}

function send(res,status,data){
  res.writeHead(status,{
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "Access-Control-Allow-Origin":"*"
  });
  res.end(JSON.stringify(data));
}

function bump(r){
  r.rev=(r.rev||0)+1;
}

function same(d){
  return d.length===5&&d.every(x=>x===d[0]);
}

function transfer(r,id,amount){
  const ps=active(r);
  const me=ps.find(p=>p.id===id);
  if(!me)return;

  ps.forEach(p=>{
    if(p.id!==id){
      me.money=Math.round((me.money+amount)*100)/100;
      p.money=Math.round((p.money-amount)*100)/100;
    }
  });
}

function targetFor(dir,sum){
  const earn={
    5:6,6:5,7:4,8:3,9:2,10:1,
    25:1,26:2,27:3,28:4,29:5,30:6
  };

  const pay={
    12:1,13:2,14:3,15:4,16:5,17:6,
    18:6,19:5,20:4,21:3,22:2,23:1
  };

  return (dir==="earn"?earn:pay)[sum]||0;
}

function nextTurn(r){
  const ps=active(r);
  if(!ps.length)return;

  let i=ps.findIndex(p=>p.id===r.turn);
  if(i<0)i=0;

  const p=ps[(i+1)%ps.length];

  r.turn=p.id;
  r.phase="main";
  r.dice=[1,1,1,1,1];
  r.held=[false,false,false,false,false];
  r.rolled=false;
  r.target=0;
  r.targetHeld=[false,false,false,false,false];
  r.direction="";
  r.result="";
  r.undoHold=null;
  r.snapshot=null;
  r.message=p.name+" is aan de beurt.";
  bump(r);
}

function startGame(r){
  const ps=active(r);
  if(ps.length<2)return false;

  let winner=-1;

  while(winner<0){
    const a=ps.map(()=>roll());
    const max=Math.max(...a);
    const w=a.map((v,i)=>v===max?i:-1).filter(i=>i>=0);

    if(w.length===1)winner=w[0];
  }

  const order=ps.slice(winner).concat(ps.slice(0,winner));

  r.turn=order[0].id;
  r.phase="main";
  r.dice=[1,1,1,1,1];
  r.held=[false,false,false,false,false];
  r.rolled=false;
  r.target=0;
  r.targetHeld=[false,false,false,false,false];
  r.direction="";
  r.result="";
  r.undoHold=null;
  r.snapshot=null;
  r.message=order[0].name+" begint.";
  bump(r);

  return true;
}

function publicState(r,p){
  return {
    rev:r.rev||0,
    code:r.code,
    phase:r.phase,
    players:r.players.map(x=>({
      id:x.id,
      name:x.name,
      money:x.money,
      admin:x.admin,
      active:x.active
    })),
    turn:r.turn,
    dice:r.dice,
    held:r.held,
    rolled:r.rolled,
    target:r.target,
    targetHeld:r.targetHeld,
    direction:r.direction,
    result:r.result,
    message:r.message,
    history:r.history,
    chat:r.chat,
    undoHold:!!r.undoHold,
    snapshot:!!r.snapshot,
    me:p.id
  };
}

function doAction(r,p,b){
  if(!p||!p.active)throw Error("Speler is niet actief.");

  const a=b.action;

  if(a==="chat"){
    const text=String(b.text||"").trim().slice(0,200);
    if(text){
      r.chat.push({
        name:p.name,
        text,
        time:Date.now()
      });
      r.chat=r.chat.slice(-40);
      bump(r);
    }
    return;
  }

  if(a==="start"){
    if(!p.admin)throw Error("Alleen de beheerder kan starten.");
    if(r.phase!=="lobby")throw Error("Het spel is al gestart.");
    if(active(r).length<2)throw Error("Minimaal 2 spelers nodig.");
    startGame(r);
    return;
  }

  if(a==="newGame"){
    if(!p.admin)throw Error("Alleen de beheerder.");
    r.phase="lobby";
    r.turn=null;
    r.dice=[1,1,1,1,1];
    r.held=[false,false,false,false,false];
    r.rolled=false;
    r.target=0;
    r.targetHeld=[false,false,false,false,false];
    r.direction="";
    r.result="";
    r.undoHold=null;
    r.snapshot=null;
    r.players.forEach(x=>{
      x.money=100;
      x.active=true;
    });
    r.message="Nieuwe speelronde. Wacht op spelers.";
    bump(r);
    return;
  }

  if(a==="pause"||a==="remove"){
    if(!p.admin)throw Error("Alleen de beheerder.");
    const x=r.players.find(q=>q.id===b.id);
    if(!x||x.admin)throw Error("Ongeldige speler.");

    if(a==="pause"){
      x.active=!x.active;
    }else{
      x.active=false;
    }

    if(r.turn===x.id)nextTurn(r);
    bump(r);
    return;
  }

  if(r.turn!==p.id)throw Error("Niet jouw beurt.");

  if(a==="roll"){
    if(r.phase!=="main")throw Error("Je kunt nu niet gooien.");

    if(r.rolled){
      if(!r.held.some(Boolean))
        throw Error("Zet eerst minimaal 1 dobbelsteen vast.");

      if(r.held.every(Boolean))
        throw Error("Alle dobbelstenen staan al vast.");
    }

    for(let i=0;i<5;i++){
      if(!r.held[i])r.dice[i]=roll();
    }

    r.rolled=true;
    r.message=p.name+" heeft gegooid.";
    r.result="";
    bump(r);
    return;
  }

  if(a==="hold"){
    if(r.phase!=="main"||!r.rolled)
      throw Error("Gooi eerst.");

    const i=Number(b.index);

    if(i<0||i>4)throw Error("Ongeldige dobbelsteen.");

    r.undoHold={
      dice:[...r.dice],
      held:[...r.held]
    };

    r.held[i]=!r.held[i];
    r.message=
      r.held[i]
      ? "Dobbelsteen vastgezet."
      : "Dobbelsteen losgemaakt.";

    bump(r);
    return;
  }

  if(a==="accept"){
    if(r.phase!=="main"||!r.rolled)
      throw Error("Gooi eerst.");

    if(!r.held.some(Boolean))
      throw Error("Zet minimaal 1 dobbelsteen vast.");

    r.snapshot={
      phase:r.phase,
      dice:[...r.dice],
      held:[...r.held],
      rolled:r.rolled,
      target:r.target,
      targetHeld:[...r.targetHeld],
      direction:r.direction,
      result:r.result,
      money:r.players.map(x=>({
        id:x.id,
        money:x.money
      }))
    };

    const sum=r.dice.reduce((a,b)=>a+b,0);

    if(sum===11||sum===24){
      transfer(r,p.id,-0.50);
      r.result=sum+": BETALEN €0,50";
      r.message=r.result;
      bump(r);

      setTimeout(()=>{
        if(rooms.has(r.code)&&r.turn===p.id)
          nextTurn(r);
      },650);

      return;
    }

    const dir=(sum<11||sum>24)?"earn":"pay";

    const target=same(r.dice)
      ?6
      :targetFor(dir,sum);

    if(!target){
      r.snapshot=null;
      throw Error("Deze combinatie is niet geldig.");
    }

    r.phase=dir;
    r.direction=dir;
    r.target=target;
    r.targetHeld=[false,false,false,false,false];
    r.held=[false,false,false,false,false];

    r.result=
      dir==="earn"
      ?"VERDIENEN: "+target+"'EN"
      :"BETALEN: "+target+"'EN";

    r.message=
      p.name+" moet "+target+"'en gooien.";

    bump(r);
    return;
  }

  if(a==="undoHold"){
    if(!r.undoHold)throw Error("Geen vastzetting om terug te zetten.");

    r.dice=[...r.undoHold.dice];
    r.held=[...r.undoHold.held];
    r.undoHold=null;
    r.message="Laatste vastzetting teruggedraaid.";
    bump(r);
    return;
  }

  if(a==="undoAccept"){
    if(!r.snapshot)throw Error("Geen akkoord om terug te zetten.");

    const x=r.snapshot;

    r.phase=x.phase;
    r.dice=[...x.dice];
    r.held=[...x.held];
    r.rolled=x.rolled;
    r.target=x.target;
    r.targetHeld=[...x.targetHeld];
    r.direction=x.direction;
    r.result=x.result;

    x.money.forEach(m=>{
      const p2=r.players.find(q=>q.id===m.id);
      if(p2)p2.money=m.money;
    });

    r.snapshot=null;
    r.message="Laatste akkoord teruggedraaid.";
    bump(r);
    return;
  }

  if(a==="targetRoll"){
    if(r.phase!=="earn"&&r.phase!=="pay")
      throw Error("Je kunt nu niet gooien.");

    if(r.targetHeld.every(Boolean))
      r.targetHeld=[false,false,false,false,false];

    let hits=0;

    for(let i=0;i<5;i++){
      if(!r.targetHeld[i]){
        r.dice[i]=roll();

        if(r.dice[i]===r.target){
          r.targetHeld[i]=true;
          hits++;
        }
      }
    }

    if(hits===0){
      r.message="Geen nieuwe "+r.target+". Beurt voorbij.";
      bump(r);

      setTimeout(()=>{
        if(
          rooms.has(r.code)&&
          (r.phase==="earn"||r.phase==="pay")
        )nextTurn(r);
      },650);

      return;
    }

    const amount=hits*r.target*0.50;

    transfer(
      r,
      p.id,
      r.phase==="earn"?amount:-amount
    );

    r.message=
      (r.phase==="earn"?"VERDIEND: ":"BETAALD: ")+
      "€"+amount.toFixed(2).replace(".",",");

    bump(r);
    return;
  }

  throw Error("Onbekende actie.");
}

const HTML=String.raw`<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>🎲 DOBBELEN 11/24</title>

<style>
*{box-sizing:border-box}

body{
 margin:0;
 background:
 radial-gradient(circle at top,#65001b,#17000d 38%,#050506);
 color:#fff;
 font-family:Arial,Helvetica,sans-serif;
 min-height:100vh;
}

.wrap{
 max-width:900px;
 margin:auto;
 padding:10px 12px 95px;
}

.logo{
 text-align:center;
 color:#ffd84d;
 font-size:clamp(34px,8vw,58px);
 font-weight:1000;
 text-shadow:0 0 10px #ff1744,0 0 25px #ff1744;
 margin:14px 0 6px;
}

.tag{
 text-align:center;
 color:#ffe9a0;
 letter-spacing:4px;
 font-size:12px;
 margin-bottom:15px;
}

.panel{
 background:linear-gradient(145deg,#172338,#080e18);
 border:2px solid #d6a82c;
 border-radius:20px;
 padding:18px;
 margin:13px 0;
 box-shadow:0 0 20px #ff174433;
}

.title{
 text-align:center;
 color:#ffd84d;
 font-size:24px;
 font-weight:1000;
 margin-bottom:12px;
}

input{
 width:100%;
 background:#050a12;
 color:#fff;
 border:1px solid #667080;
 border-radius:13px;
 padding:14px;
 font-size:17px;
 outline:none;
}

input:focus{
 border-color:#ffd84d;
 box-shadow:0 0 8px #ffd84d55;
}

button{
 border:0;
 border-radius:13px;
 padding:14px 18px;
 color:#fff;
 background:linear-gradient(145deg,#315b9f,#18396f);
 font-size:16px;
 font-weight:1000;
 box-shadow:0 4px 10px #0008;
 margin:5px;
}

button:active{
 transform:translateY(2px);
}

button:disabled{
 opacity:.35;
}

.green{
 background:linear-gradient(145deg,#19a969,#08783f);
}

.orange{
 background:linear-gradient(145deg,#db9024,#a94d08);
}

.gold{
 background:linear-gradient(145deg,#d5a21e,#915900);
}

.red{
 background:linear-gradient(145deg,#b82b3b,#71151f);
}

.row{
 display:flex;
 gap:8px;
 flex-wrap:wrap;
}

.row>*{
 flex:1;
 min-width:170px;
}

.code{
 text-align:center;
 color:#ffd84d;
 font-size:40px;
 letter-spacing:8px;
 font-weight:1000;
}

.invite{
 background:#05070b;
 border:1px dashed #a88b2e;
 border-radius:12px;
 padding:12px;
 color:#ffe49a;
 word-break:break-all;
 font-family:monospace;
 font-size:13px;
 margin:10px 0;
}

.players{
 display:grid;
 grid-template-columns:repeat(4,1fr);
 gap:8px;
}

.player{
 background:#0c1522;
 border:1px solid #344052;
 border-radius:13px;
 padding:11px;
 text-align:center;
}

.current{
 outline:3px solid #ffd84d;
 box-shadow:0 0 18px #ffd84d55;
}

.money{
 font-size:21px;
 margin:5px;
 color:#fff;
}

.table{
 background:
 radial-gradient(circle,#147a49,#04351f);
 border:7px solid #a77e25;
 border-radius:25px;
 padding:22px 10px;
 min-height:185px;
 box-shadow:inset 0 0 30px #0008,0 0 15px #000;
}

.dice{
 display:flex;
 justify-content:center;
 gap:13px;
 flex-wrap:wrap;
}

.die{
 width:76px;
 height:76px;
 border-radius:16px;
 position:relative;
 background:linear-gradient(145deg,#ef3838,#900606);
 border:3px solid #fff;
 box-shadow:inset 4px 4px 10px #fff4,0 5px 12px #000;
 cursor:pointer;
 transition:.18s;
}

.die.held{
 border:5px solid #39ff88;
 box-shadow:
 0 0 8px #39ff88,
 0 0 20px #20ff72,
 0 0 35px #20ff7266,
 inset 4px 4px 10px #fff4;
 transform:translateY(-8px) scale(1.04);
}

.die.held:after{
 content:"VAST";
 position:absolute;
 left:0;
 right:0;
 bottom:-29px;
 text-align:center;
 color:#39ff88;
 font-size:13px;
 font-weight:1000;
 text-shadow:0 0 8px #39ff88;
}

.pip{
 position:absolute;
 width:15px;
 height:15px;
 border-radius:50%;
 background:#fff;
 box-shadow:inset 1px 1px 2px #888;
}

.tl{left:11px;top:11px}
.tc{left:50%;top:11px;transform:translateX(-50%)}
.tr{right:11px;top:11px}
.ml{left:11px;top:50%;transform:translateY(-50%)}
.mc{left:50%;top:50%;transform:translate(-50%,-50%)}
.mr{right:11px;top:50%;transform:translateY(-50%)}
.bl{left:11px;bottom:11px}
.bc{left:50%;bottom:11px;transform:translateX(-50%)}
.br{right:11px;bottom:11px}

.banner{
 text-align:center;
 padding:14px;
 border-radius:16px;
 border:3px solid #ffd84d;
 font-size:29px;
 margin:10px 0;
 background:#351c04;
}

.banner.earn{
 border-color:#39ff88;
 background:#073c25;
 color:#7affb1;
}

.chat{
 background:#05070b;
 border:1px solid #293242;
 border-radius:12px;
 padding:10px;
 max-height:190px;
 overflow:auto;
}

.msg{
 padding:5px 0;
 border-bottom:1px solid #ffffff12;
}

.msg b{
 color:#ffd84d;
}

.rule{
 position:fixed;
 left:12px;
 bottom:10px;
 background:#101b2b;
 border:1px solid #ffd84d;
 border-radius:12px;
 padding:9px 13px;
 color:#fff;
 z-index:50;
 box-shadow:0 0 12px #ffd84d33;
}

@media(max-width:650px){
 .logo{font-size:35px}
 .players{grid-template-columns:repeat(2,1fr)}
 .die{width:65px;height:65px}
 .pip{width:12px;height:12px}
 .tl{left:9px;top:9px}
 .tc{top:9px}
 .tr{right:9px;top:9px}
 .ml{left:9px}
 .mr{right:9px}
 .bl{left:9px;bottom:9px}
 .bc{bottom:9px}
 .br{right:9px;bottom:9px}
}
</style>
</head>

<body>

<div class="wrap">
<div class="logo">🎲 DOBBELEN 11/24</div>
<div class="tag">ONLINE MULTIPLAYER</div>
<div id="app"></div>
</div>

<div class="rule">🚩 Regel: 5 dezelfde = 6️⃣ verdienen</div>

<script>

let token=sessionStorage.getItem("d1124_token")||"";
let state=null;
let lastRev=-1;
let busy=false;
let pollTimer=null;

const invite=
 new URLSearchParams(location.search)
 .get("room")||"";

const app=document.getElementById("app");

function esc(x){
 return String(x??"").replace(/[&<>"']/g,c=>({
  "&":"&amp;",
  "<":"&lt;",
  ">":"&gt;",
  '"':"&quot;",
  "'":"&#39;"
 }[c]));
}

function euro(x){
 return "€"+Number(x||0)
 .toFixed(2)
 .replace(".",",");
}

async function api(path,method="GET",body){

 const o={
  method,
  headers:{
   "Content-Type":"application/json",
   "X-Token":token
  }
 };

 if(body)o.body=JSON.stringify(body);

 const r=await fetch(path,o);
 const j=await r.json();

 if(!r.ok)throw Error(j.error||"Er ging iets mis.");

 return j;
}

function home(){

 app.innerHTML=`

 <section class="panel">
  <div class="title">🎲 NIEUW SPEL</div>

  <input id="name"
   maxlength="20"
   placeholder="Jouw naam">

  <button class="green"
   id="make">
   🎲 SPEL MAKEN
  </button>
 </section>

 <section class="panel">
  <div class="title">OF MEEDOEN</div>

  <input id="jname"
   maxlength="20"
   placeholder="Jouw naam">

  <div class="row">
   <input id="code"
    maxlength="4"
    placeholder="Spelcode">

   <button id="join">
    MEEDOEN
   </button>
  </div>
 </section>
 `;

 document.getElementById("make")
  .onclick=createRoom;

 document.getElementById("join")
  .onclick=joinRoom;

 if(invite){
  document.getElementById("code")
   .value=invite;
 }
}

async function createRoom(){

 const name=
  document.getElementById("name")
  .value.trim();

 if(!name){
  alert("Vul eerst je naam in.");
  return;
 }

 try{

  const r=
   await api(
    "/api/create",
    "POST",
    {name}
   );

  token=r.token;

  sessionStorage.setItem(
   "d1124_token",
   token
  );

  history.replaceState(
   {},
   "",
   "/?room="+r.code
  );

  await refresh(true);

 }catch(e){
  alert(e.message);
 }
}

async function joinRoom(){

 const name=
  document.getElementById("jname")
  .value.trim();

 const code=
  document.getElementById("code")
  .value.trim().toUpperCase();

 if(!name){
  alert("Vul eerst je naam in.");
  return;
 }

 if(!code){
  alert("Vul de spelcode in.");
  return;
 }

 try{

  const r=
   await api(
    "/api/join",
    "POST",
    {name,code}
   );

  token=r.token;

  sessionStorage.setItem(
   "d1124_token",
   token
  );

  history.replaceState(
   {},
   "",
   "/?room="+r.code
  );

  await refresh(true);

 }catch(e){
  alert(e.message);
 }
}

function lobby(){

 const me=
  state.players.find(
   p=>p.id===state.me
  );

 const admin=!!me?.admin;

 const url=
  location.origin+
  "/?room="+
  state.code;

 app.innerHTML=`

 <section class="panel">
  <div class="title">🎰 WACHTRUIMTE</div>

  <div class="code">
   ${esc(state.code)}
  </div>

  ${
   admin
   ?
   `<div class="invite">
      ${esc(url)}
    </div>
    <button class="gold" id="copy">
      🔗 LINK KOPIËREN
    </button>`
   :
   `<p style="text-align:center">
      Wacht tot de beheerder het spel start.
    </p>`
  }
 </section>

 <section class="panel">
  <div class="title">👥 SPELERS</div>
  <div class="players" id="players"></div>

  ${
   admin
   ?
   `<div style="text-align:center">
     <button class="green" id="start">
      🎲 START SPEL
     </button>
    </div>`
   :""
  }
 </section>
 `;

 const box=
  document.getElementById("players");

 state.players.forEach(p=>{

  const d=
   document.createElement("div");

  d.className="player";

  d.innerHTML=
   "<b>"+esc(p.name)+"</b>"+
   "<div class='money'>"+
   euro(p.money)+
   "</div>"+
   (p.admin?"👑 BEHEERDER":"🟢 SPELER");

  if(admin&&!p.admin){

   const pause=
    document.createElement("button");

   pause.textContent=
    p.active?"⏸️ PAUZE":"🟢 ACTIEF";

   pause.onclick=()=>action(
    "pause",
    {id:p.id}
   );

   d.appendChild(pause);

   const remove=
    document.createElement("button");

   remove.className="red";
   remove.textContent="❌ VERWIJDER";

   remove.onclick=()=>action(
    "remove",
    {id:p.id}
   );

   d.appendChild(remove);
  }

  box.appendChild(d);
 });

 if(admin){

  const start=
   document.getElementById("start");

  start.disabled=
   state.players.filter(
    p=>p.active
   ).length<2;

  start.onclick=()=>action("start");

  document.getElementById("copy")
   .onclick=async()=>{

    try{

     await navigator.clipboard.writeText(url);

     document.getElementById("copy")
      .textContent="✅ LINK GEKOPIEERD";

    }catch(e){

     prompt(
      "Kopieer deze link:",
      url
     );
    }
   };
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

 return `
 <div
  class="die ${held?"held":""}"
  onclick="holdDie(${i})"
 >
  ${pipMap[v].map(
   x=>`<span class="pip ${x}"></span>`
  ).join("")}
 </div>`;
}

function game(){

 const me=
  state.players.find(
   p=>p.id===state.me
  );

 const mine=
  me?.id===state.turn;

 const current=
  state.players.find(
   p=>p.id===state.turn
  );

 let banner="";

 if(state.phase==="earn"){
  banner=
   `<div class="banner earn">
    VERDIENEN: ${state.target}'EN
   </div>`;
 }

 if(state.phase==="pay"){
  banner=
   `<div class="banner">
    BETALEN: ${state.target}'EN
   </div>`;
 }

 if(
  state.result&&
  state.phase==="main"
 ){
  banner=
   `<div class="banner">
    ${esc(state.result)}
   </div>`;
 }

 app.innerHTML=`

 <section class="panel">

  <div class="title">
   🎯 ${esc(current?.name||"")}
   IS AAN DE BEURT
  </div>

  <div style="text-align:center">
   ${esc(state.message||"")}
  </div>

  ${banner}

  <div class="table">
   <div class="dice">
    ${state.dice.map(
     (v,i)=>
      dieHTML(
       v,
       i,
       state.held[i]
      )
    ).join("")}
   </div>
  </div>

  <div
   id="actions"
   style="text-align:center"
  ></div>

 </section>

 <section class="panel">
  <div class="title">👥 SPELERS</div>
  <div class="players" id="players"></div>
 </section>

 <section class="panel">
  <div class="title">💬 CHAT</div>

  <div class="chat" id="chat"></div>

  <div class="row">
   <input
    id="chatInput"
    maxlength="200"
    placeholder="Typ een bericht..."
    autocomplete="off">

   <button id="sendChat">
    STUUR
   </button>
  </div>
 </section>

 ${
  me?.admin
  ?
  `<section class="panel">
    <button class="gold" id="newGame">
     🔄 NIEUW SPEL
    </button>
   </section>`
  :""
 }
 `;

 const players=
  document.getElementById("players");

 state.players.forEach(p=>{

  const d=
   document.createElement("div");

  d.className=
   "player "+
   (p.id===state.turn?"current":"");

  d.innerHTML=
   "<b>"+esc(p.name)+"</b>"+
   "<div class='money'>"+
   euro(p.money)+
   "</div>"+
   (p.active?"🟢 ACTIEF":"⏸️ PAUZE");

  players.appendChild(d);
 });

 const chat=
  document.getElementById("chat");

 chat.innerHTML=
  state.chat.map(m=>
   `<div class="msg">
    <b>${esc(m.name)}:</b>
    ${esc(m.text)}
   </div>`
  ).join("");

 chat.scrollTop=chat.scrollHeight;

 const input=
  document.getElementById("chatInput");

 const send=
  document.getElementById("sendChat");

 async function sendChat(){

  const text=input.value.trim();

  if(!text)return;

  input.value="";

  await action(
   "chat",
   {text}
  );

  setTimeout(()=>{
   input.focus();
  },20);
 }

 send.onclick=sendChat;

 input.onkeydown=e=>{
  if(e.key==="Enter"){
   e.preventDefault();
   sendChat();
  }
 };

 if(me?.admin){
  document.getElementById("newGame")
   .onclick=()=>action("newGame");
 }

 const actions=
  document.getElementById("actions");

 if(
  mine&&
  state.phase==="main"
 ){

  const rollBtn=
   document.createElement("button");

  rollBtn.className=
   state.rolled
   ?"orange"
   :"green";

  rollBtn.textContent=
   state.rolled
   ?"🎲 OPNIEUW GOOIEN"
   :"🎲 BEGIN WORP";

  rollBtn.disabled=
   state.rolled&&
   (
    !state.held.some(Boolean)||
    state.held.every(Boolean)
   );

  rollBtn.onclick=()=>action("roll");

  actions.appendChild(rollBtn);

  const ok=
   document.createElement("button");

  ok.textContent="✓ AKKOORD";

  ok.disabled=
   !state.rolled||
   !state.held.some(Boolean);

  ok.onclick=()=>action("accept");

  actions.appendChild(ok);

  if(state.undoHold){

   const u=
    document.createElement("button");

   u.className="gold";
   u.textContent=
    "↩️ LAATSTE VASTZETTING TERUG";

   u.onclick=()=>action("undoHold");

   actions.appendChild(u);
  }

  if(state.snapshot){

   const u=
    document.createElement("button");

   u.className="gold";
   u.textContent=
    "↩️ AKKOORD TERUG";

   u.onclick=()=>action("undoAccept");

   actions.appendChild(u);
  }

 }else if(
  mine&&
  (
   state.phase==="earn"||
   state.phase==="pay"
  )
 ){

  const b=
   document.createElement("button");

  b.className="orange";
  b.textContent="🎲 OPNIEUW GOOIEN";

  b.onclick=()=>action("targetRoll");

  actions.appendChild(b);
 }
}

async function holdDie(i){

 if(
  state&&
  state.phase==="main"&&
  state.rolled
 ){
  await action(
   "hold",
   {index:i}
  );
 }
}

async function action(name,data={}){

 if(busy)return;

 busy=true;

 try{

  const oldRev=
   state?.rev??-1;

  await api(
   "/api/action",
   "POST",
   {
    action:name,
    ...data
   }
  );

  /*
   Wacht heel kort zodat de server
   de nieuwe versie heeft verwerkt.
  */
  await new Promise(
   r=>setTimeout(r,80)
  );

  await refresh(true);

 }catch(e){

  alert(e.message);

 }finally{

  busy=false;
 }
}

async function refresh(force=false){

 if(!token){
  home();
  return;
 }

 try{

  const r=
   await api("/api/state");

  /*
   Nooit een oudere serverstatus
   over een nieuwere status heen
   laten schrijven.
  */
  if(
   !force&&
   state&&
   r.state.rev<state.rev
  ){
   return;
  }

  const activeElement=
   document.activeElement;

  const typing=
   activeElement&&
   (
    activeElement.id==="chatInput"||
    activeElement.tagName==="INPUT"||
    activeElement.tagName==="TEXTAREA"
   );

  const oldChatValue=
   typing&&
   activeElement.id==="chatInput"
   ?
   activeElement.value
   :
   "";

  state=r.state;

  if(state.phase==="lobby"){
   lobby();
  }else{
   game();
  }

  /*
   Als de speler aan het typen was,
   blijft de tekst en focus behouden.
  */
  if(
   typing&&
   state.phase!=="lobby"
  ){

   const input=
    document.getElementById("chatInput");

   if(input){

    input.value=oldChatValue;

    input.focus();

    try{
     input.setSelectionRange(
      input.value.length,
      input.value.length
     );
    }catch(e){}
   }
  }

 }catch(e){

  token="";

  sessionStorage.removeItem(
   "d1124_token"
  );

  state=null;

  home();
 }
}

function schedulePoll(){

 clearTimeout(pollTimer);

 pollTimer=
  setTimeout(
   async()=>{

    /*
     Tijdens een actie niet
     opnieuw renderen.
    */
    if(!busy){
     await refresh(false);
    }

    schedulePoll();

   },
   1000
  );
}

home();

if(token)
refresh(true);

schedulePoll();

</script>
</body>
</html>`;

const server=http.createServer(
 async(req,res)=>{

  const u=
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
      "Content-Type,X-Token",
     "Access-Control-Allow-Methods":
      "GET,POST,OPTIONS"
    }
   );
   return res.end();
  }

  if(
   u.pathname==="/"&&
   req.method==="GET"
  ){
   res.writeHead(
    200,
    {
     "Content-Type":
      "text/html; charset=utf-8",
     "Cache-Control":"no-store"
    }
   );
   return res.end(HTML);
  }

  if(
   u.pathname==="/api/create"&&
   req.method==="POST"
  ){

   let body="";

   req.on("data",x=>body+=x);

   await new Promise(
    resolve=>req.on("end",resolve)
   );

   let b={};

   try{
    b=JSON.parse(body||"{}");
   }catch(e){}

   const name=
    String(b.name||"")
    .trim()
    .slice(0,20);

   if(!name)
    return send(
     res,
     400,
     {error:"Vul eerst je naam in."}
    );

   const c=code();
   const token=uid();

   const r={
    code:c,
    rev:1,
    phase:"lobby",
    players:[{
     id:uid(),
     token,
     name,
     money:100,
     admin:true,
     active:true
    }],
    turn:null,
    dice:[1,1,1,1,1],
    held:[false,false,false,false,false],
    rolled:false,
    target:0,
    targetHeld:[false,false,false,false,false],
    direction:"",
    result:"",
    message:"Wacht op spelers.",
    history:[],
    chat:[],
    undoHold:null,
    snapshot:null
   };

   rooms.set(c,r);

   return send(
    res,
    200,
    {
     code:c,
     token
    }
   );
  }

  if(
   u.pathname==="/api/join"&&
   req.method==="POST"
  ){

   let body="";

   req.on("data",x=>body+=x);

   await new Promise(
    resolve=>req.on("end",resolve)
   );

   let b={};

   try{
    b=JSON.parse(body||"{}");
   }catch(e){}

   const c=
    String(b.code||"")
    .trim()
    .toUpperCase();

   const name=
    String(b.name||"")
    .trim()
    .slice(0,20);

   const r=rooms.get(c);

   if(!r)
    return send(
     res,
     404,
     {error:"Deze kamer bestaat niet."}
    );

   if(r.phase!=="lobby")
    return send(
     res,
     400,
     {error:"Het spel is al gestart."}
    );

   if(active(r).length>=4)
    return send(
     res,
     400,
     {error:"Maximaal 4 spelers."}
    );

   if(!name)
    return send(
     res,
     400,
     {error:"Vul eerst je naam in."}
    );

   const token=uid();

   r.players.push({
    id:uid(),
    token,
    name,
    money:100,
    admin:false,
    active:true
   });

   r.message=
    name+
    " is de kamer binnengekomen.";

   bump(r);

   return send(
    res,
    200,
    {
     code:c,
     token
    }
   );
  }

  if(
   u.pathname==="/api/state"&&
   req.method==="GET"
  ){

   const token=
    req.headers["x-token"]||"";

   for(
    const r of rooms.values()
   ){

    const p=
     findPlayer(r,token);

    if(p){

     return send(
      res,
      200,
      {
       state:publicState(r,p),
       me:p.id
      }
     );
    }
   }

   return send(
    res,
    401,
    {error:"Sessie verlopen."}
   );
  }

  if(
   u.pathname==="/api/action"&&
   req.method==="POST"
  ){

   const token=
    req.headers["x-token"]||"";

   let body="";

   req.on("data",x=>body+=x);

   await new Promise(
    resolve=>req.on("end",resolve)
   );

   let b={};

   try{
    b=JSON.parse(body||"{}");
   }catch(e){}

   for(
    const r of rooms.values()
   ){

    const p=
     findPlayer(r,token);

    if(p){

     try{

      doAction(r,p,b);

      return send(
       res,
       200,
       {ok:true}
      );

     }catch(e){

      return send(
       res,
       400,
       {error:e.message}
      );
     }
    }
   }

   return send(
    res,
    401,
    {error:"Sessie verlopen."}
   );
  }

  res.writeHead(404);
  res.end("Not found");
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
