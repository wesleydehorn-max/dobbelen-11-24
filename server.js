const http=require('http');
const crypto=require('crypto');

const PORT=process.env.PORT||10000;
const rooms=new Map();

const rnd=n=>1+Math.floor(Math.random()*n);
const id=()=>crypto.randomBytes(12).toString('hex');

function code(){
 let c;
 do c=crypto.randomBytes(2).toString('hex').toUpperCase();
 while(rooms.has(c));
 return c;
}

function active(r){
 return r.players.filter(p=>p.active);
}

function find(r,t){
 return r.players.find(p=>p.token===t);
}

function json(res,s,o){
 res.writeHead(s,{
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store',
  'Access-Control-Allow-Origin':'*'
 });
 res.end(JSON.stringify(o));
}

function same(a){
 return a.length===5&&a.every(x=>x===a[0]);
}

function pay(r,pid,a){
 const ps=active(r);
 const me=ps.find(p=>p.id===pid);
 if(!me)return;

 ps.forEach(p=>{
  if(p.id!==pid){
   me.money=+(me.money+a).toFixed(2);
   p.money=+(p.money-a).toFixed(2);
  }
 });
}

const earn={
 5:6,6:5,7:4,8:3,9:2,10:1,
 25:1,26:2,27:3,28:4,29:5,30:6
};

const lose={
 12:1,13:2,14:3,15:4,16:5,17:6,
 18:6,19:5,20:4,21:3,22:2,23:1
};

function target(dir,sum){
 return (dir==='earn'?earn:lose)[sum]||0;
}

function next(r){
 const ps=active(r);
 if(!ps.length)return;

 let i=ps.findIndex(p=>p.id===r.turn);

 const n=ps[(i+1+ps.length)%ps.length];

 r.turn=n.id;
 r.phase='main';
 r.dice=[1,1,1,1,1];
 r.held=[false,false,false,false,false];
 r.rolled=false;
 r.target=0;
 r.targetHeld=[false,false,false,false,false];
 r.direction='';
 r.result='';
 r.undoHold=null;
 r.snapshot=null;
 r.message=n.name+' is aan de beurt.';
 r.rev++;
}

function start(r){
 const ps=active(r);

 if(ps.length<2)
  throw Error('Minimaal 2 spelers nodig.');

 const rolls={};

 ps.forEach(p=>{
  rolls[p.id]=rnd(6);
 });

 let max=Math.max(...Object.values(rolls));

 let tied=ps.filter(
  p=>rolls[p.id]===max
 );

 while(tied.length>1){

  tied.forEach(p=>{
   rolls[p.id]=rnd(6);
  });

  max=Math.max(
   ...tied.map(p=>rolls[p.id])
  );

  tied=tied.filter(
   p=>rolls[p.id]===max
  );
 }

 const winner=tied[0];

 r.opening=rolls;
 r.turn=winner.id;
 r.phase='main';

 r.dice=[1,1,1,1,1];
 r.held=[false,false,false,false,false];
 r.rolled=false;

 r.target=0;
 r.targetHeld=[false,false,false,false,false];

 r.direction='';
 r.result='';
 r.undoHold=null;
 r.snapshot=null;

 r.message=
  'Startworp: '+winner.name+' begint.';

 r.rev++;
}

function state(r,p){
 return{
  rev:r.rev,
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

  chat:r.chat,
  opening:r.opening,

  undoHold:!!r.undoHold,
  snapshot:!!r.snapshot,

  me:p.id
 };
}

function action(r,p,b){

 if(!p||!p.active)
  throw Error('Speler is niet actief.');

 const a=b.action;

 if(a==='chat'){

  const t=String(
   b.text||''
  ).trim().slice(0,200);

  if(t){
   r.chat.push({
    name:p.name,
    text:t
   });

   r.chat=r.chat.slice(-50);
   r.rev++;
  }

  return;
 }

 if(a==='start'){

  if(!p.admin)
   throw Error(
    'Alleen de beheerder kan starten.'
   );

  if(r.phase!=='lobby')
   throw Error(
    'Het spel is al gestart.'
   );

  start(r);
  return;
 }

 if(a==='newGame'){

  if(!p.admin)
   throw Error(
    'Alleen de beheerder.'
   );

  r.phase='lobby';
  r.turn=null;

  r.dice=[1,1,1,1,1];
  r.held=[false,false,false,false,false];
  r.rolled=false;

  r.target=0;
  r.targetHeld=[false,false,false,false,false];

  r.direction='';
  r.result='';

  r.undoHold=null;
  r.snapshot=null;
  r.opening=null;

  r.players.forEach(x=>{
   x.money=100;
   x.active=true;
  });

  r.message=
   'Nieuwe ronde. Wacht op spelers.';

  r.rev++;
  return;
 }

 if(a==='pause'||a==='remove'){

  if(!p.admin)
   throw Error(
    'Alleen de beheerder.'
   );

  const x=r.players.find(
   q=>q.id===b.id
  );

  if(!x||x.admin)
   throw Error(
    'Ongeldige speler.'
   );

  if(a==='pause')
   x.active=!x.active;
  else
   x.active=false;

  if(r.turn===x.id)
   next(r);

  r.rev++;
  return;
 }

 if(r.turn!==p.id)
  throw Error(
   'Niet jouw beurt.'
  );

 if(a==='roll'){

  if(r.phase!=='main')
   throw Error(
    'Je kunt nu niet gooien.'
   );

  if(
   r.rolled &&
   !r.held.some(Boolean)
  )
   throw Error(
    'Zet eerst minimaal 1 dobbelsteen vast.'
   );

  if(
   r.rolled &&
   r.held.every(Boolean)
  )
   throw Error(
    'Alle dobbelstenen staan al vast.'
   );

  for(let i=0;i<5;i++){

   if(!r.held[i])
    r.dice[i]=rnd(6);

  }

  r.rolled=true;
  r.message=p.name+' heeft gegooid.';
  r.result='';

  r.rev++;
  return;
 }

 if(a==='hold'){

  if(
   r.phase!=='main'||
   !r.rolled
  )
   throw Error(
    'Gooi eerst.'
   );

  const i=Number(b.index);

  if(i<0||i>4)
   throw Error(
    'Ongeldige dobbelsteen.'
   );

  r.undoHold={
   dice:[...r.dice],
   held:[...r.held]
  };

  r.held[i]=!r.held[i];

  r.message=
   r.held[i]
   ?'Dobbelsteen vastgezet.'
   :'Dobbelsteen losgemaakt.';

  r.rev++;
  return;
 }

 if(a==='accept'){

  if(
   r.phase!=='main'||
   !r.rolled
  )
   throw Error(
    'Gooi eerst.'
   );

  if(!r.held.some(Boolean))
   throw Error(
    'Zet minimaal 1 dobbelsteen vast.'
   );

  const sum=
   r.dice.reduce(
    (a,b)=>a+b,
    0
   );

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

  if(sum===11||sum===24){

   pay(r,p.id,-0.50);

   r.result=
    sum+': BETALEN €0,50';

   r.message=r.result;

   r.rev++;

   setTimeout(()=>{
    if(
     rooms.has(r.code)&&
     r.turn===p.id
    )
     next(r);
   },650);

   return;
  }

  const dir=
   (sum<11||sum>24)
   ?'earn'
   :'pay';

  const tar=
   same(r.dice)
   ?6
   :target(dir,sum);

  if(!tar){

   r.snapshot=null;

   throw Error(
    'Deze combinatie is niet geldig.'
   );
  }

  r.phase=dir;
  r.direction=dir;
  r.target=tar;

  r.targetHeld=[
   false,false,false,false,false
  ];

  r.held=[
   false,false,false,false,false
  ];

  r.result=
   (dir==='earn'
    ?'VERDIENEN: '
    :'BETALEN: ')+
   tar+"'EN";

  r.message=
   p.name+
   ' moet '+
   tar+
   "'en gooien.";

  r.rev++;
  return;
 }

 if(a==='undoHold'){

  if(!r.undoHold)
   throw Error(
    'Geen vastzetting om terug te zetten.'
   );

  r.dice=[
   ...r.undoHold.dice
  ];

  r.held=[
   ...r.undoHold.held
  ];

  r.undoHold=null;

  r.message=
   'Laatste vastzetting teruggedraaid.';

  r.rev++;
  return;
 }

 if(a==='undoAccept'){

  if(!r.snapshot)
   throw Error(
    'Geen akkoord om terug te zetten.'
   );

  const s=r.snapshot;

  r.phase=s.phase;
  r.dice=[...s.dice];
  r.held=[...s.held];
  r.rolled=s.rolled;
  r.target=s.target;
  r.targetHeld=[...s.targetHeld];
  r.direction=s.direction;
  r.result=s.result;

  s.money.forEach(m=>{

   const q=r.players.find(
    z=>z.id===m.id
   );

   if(q)
    q.money=m.money;
  });

  r.snapshot=null;

  r.message=
   'Laatste akkoord teruggedraaid.';

  r.rev++;
  return;
 }

 if(a==='targetRoll'){

  if(
   r.phase!=='earn'&&
   r.phase!=='pay'
  )
   throw Error(
    'Je kunt nu niet gooien.'
   );

  if(r.targetHeld.every(Boolean))
   r.targetHeld=[
    false,false,false,false,false
   ];

  let hits=0;

  for(let i=0;i<5;i++){

   if(!r.targetHeld[i]){

    r.dice[i]=rnd(6);

    if(r.dice[i]===r.target){

     r.targetHeld[i]=true;
     hits++;
    }
   }
  }

  if(!hits){

   r.message=
    'Geen nieuwe '+
    r.target+
    '. Beurt voorbij.';

   r.rev++;

   setTimeout(()=>{

    if(
     rooms.has(r.code)&&
     (
      r.phase==='earn'||
      r.phase==='pay'
     )
    )
     next(r);

   },650);

   return;
  }

  const amount=
   hits*r.target*0.5;

  pay(
   r,
   p.id,
   r.phase==='earn'
    ?amount
    :-amount
  );

  r.message=
   (
    r.phase==='earn'
    ?'VERDIEND: '
    :'BETAALD: '
   )+
   '€'+
   amount.toFixed(2)
    .replace('.',',');

  r.rev++;
  return;
 }

 throw Error(
  'Onbekende actie.'
 );
}

const HTML=`<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport"
content="width=device-width,initial-scale=1,maximum-scale=1">

<title>🎲 DOBBELEN 11/24</title>

<style>

*{
 box-sizing:border-box
}

body{
 margin:0;
 min-height:100vh;
 background:
 radial-gradient(
  circle at top,
  #65001b,
  #17000d 38%,
  #050506
 );
 color:#fff;
 font-family:Arial,sans-serif
}

.wrap{
 max-width:900px;
 margin:auto;
 padding:10px 12px 95px
}

.logo{
 text-align:center;
 color:#ffd84d;
 font-size:clamp(34px,8vw,58px);
 font-weight:1000;
 text-shadow:
 0 0 10px #ff1744,
 0 0 25px #ff1744;
 margin:14px 0 6px
}

.tag{
 text-align:center;
 color:#ffe9a0;
 letter-spacing:4px;
 font-size:12px;
 margin-bottom:15px
}

.panel{
 background:
 linear-gradient(
 145deg,
 #172338,
 #080e18
 );
 border:2px solid #d6a82c;
 border-radius:20px;
 padding:18px;
 margin:13px 0;
 box-shadow:
 0 0 20px #ff174433
}

.title{
 text-align:center;
 color:#ffd84d;
 font-size:24px;
 font-weight:1000;
 margin-bottom:12px
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
 margin-bottom:5px
}

input:focus{
 border-color:#ffd84d;
 box-shadow:0 0 8px #ffd84d55
}

button{
 border:0;
 border-radius:13px;
 padding:14px 18px;
 color:#fff;
 background:
 linear-gradient(
 145deg,
 #315b9f,
 #18396f
 );
 font-size:16px;
 font-weight:1000;
 box-shadow:0 4px 10px #0008;
 margin:5px;
 cursor:pointer
}

button:disabled{
 opacity:.35
}

.green{
 background:
 linear-gradient(
 145deg,
 #19a969,
 #08783f
 )
}

.orange{
 background:
 linear-gradient(
 145deg,
 #db9024,
 #a94d08
 )
}

.gold{
 background:
 linear-gradient(
 145deg,
 #d5a21e,
 #915900
 )
}

.red{
 background:
 linear-gradient(
 145deg,
 #b82b3b,
 #71151f
 )
}

.row{
 display:flex;
 gap:8px;
 flex-wrap:wrap
}

.row>*{
 flex:1;
 min-width:170px
}

.code{
 text-align:center;
 color:#ffd84d;
 font-size:40px;
 letter-spacing:8px;
 font-weight:1000
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
 margin:10px 0
}

.players{
 display:grid;
 grid-template-columns:
 repeat(4,1fr);
 gap:8px
}

.player{
 background:#0c1522;
 border:1px solid #344052;
 border-radius:13px;
 padding:11px;
 text-align:center
}

.current{
 outline:3px solid #ffd84d;
 box-shadow:
 0 0 18px #ffd84d55
}

.money{
 font-size:21px;
 margin:5px
}

.table{
 background:
 radial-gradient(
  circle,
  #147a49,
  #04351f
 );
 border:7px solid #a77e25;
 border-radius:25px;
 padding:22px 10px;
 min-height:185px;
 box-shadow:
 inset 0 0 30px #0008,
 0 0 15px #000
}

.dice{
 display:flex;
 justify-content:center;
 gap:13px;
 flex-wrap:wrap
}

.die{
 width:76px;
 height:76px;
 border-radius:16px;
 position:relative;
 background:
 linear-gradient(
 145deg,
 #ef3838,
 #900606
 );
 border:3px solid #fff;
 box-shadow:
 inset 4px 4px 10px #fff4,
 0 5px 12px #000;
 cursor:pointer;
 transition:.18s
}

.die.held{
 border:5px solid #39ff88;
 box-shadow:
 0 0 8px #39ff88,
 0 0 20px #20ff72,
 0 0 35px #20ff7266,
 inset 4px 4px 10px #fff4;
 transform:
 translateY(-8px)
 scale(1.04)
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
 text-shadow:
 0 0 8px #39ff88
}

.pip{
 position:absolute;
 width:15px;
 height:15px;
 border-radius:50%;
 background:#fff;
 box-shadow:
 inset 1px 1px 2px #888
}

.tl{
 left:11px;
 top:11px
}

.tc{
 left:50%;
 top:11px;
 transform:translateX(-50%)
}

.tr{
 right:11px;
 top:11px
}

.ml{
 left:11px;
 top:50%;
 transform:translateY(-50%)
}

.mc{
 left:50%;
 top:50%;
 transform:translate(-50%,-50%)
}

.mr{
 right:11px;
 top:50%;
 transform:translateY(-50%)
}

.bl{
 left:11px;
 bottom:11px
}

.bc{
 left:50%;
 bottom:11px;
 transform:translateX(-50%)
}

.br{
 right:11px;
 bottom:11px
}

.banner{
 text-align:center;
 padding:14px;
 border-radius:16px;
 border:3px solid #ffd84d;
 font-size:29px;
 margin:10px 0;
 background:#351c04
}

.banner.earn{
 border-color:#39ff88;
 background:#073c25;
 color:#7affb1
}

.chat{
 background:#05070b;
 border:1px solid #293242;
 border-radius:12px;
 padding:10px;
 max-height:190px;
 overflow:auto
}

.msg{
 padding:5px 0;
 border-bottom:
 1px solid #ffffff12
}

.msg b{
 color:#ffd84d
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
 box-shadow:
 0 0 12px #ffd84d33
}

@media(max-width:650px){

 .logo{
  font-size:35px
 }

 .players{
  grid-template-columns:
  repeat(2,1fr)
 }

 .die{
  width:65px;
  height:65px
 }

 .pip{
  width:12px;
  height:12px
 }

 .tl{
  left:9px;
  top:9px
 }

 .tc{
  top:9px
 }

 .tr{
  right:9px;
  top:9px
 }

 .ml{
  left:9px
 }

 .mr{
  right:9px
 }

 .bl{
  left:9px;
  bottom:9px
 }

 .bc{
  bottom:9px
 }

 .br{
  right:9px;
  bottom:9px
 }
}

</style>
</head>

<body>

<div class="wrap">

<div class="logo">
🎲 DOBBELEN 11/24
</div>

<div class="tag">
ONLINE MULTIPLAYER
</div>

<div id="app"></div>

</div>

<div class="rule">
🚩 Regel: 5 dezelfde = 6️⃣ verdienen
</div>

<script>

let token=
 sessionStorage.getItem(
  'd1124_token'
 )||'';

let state=null;
let busy=false;
let poll=null;

const invite=
 new URLSearchParams(
  location.search
 ).get('room')||'';

const app=
 document.getElementById('app');

const esc=x=>
 String(x??'')
 .replace(
  /[&<>"']/g,
  c=>({
   '&':'&amp;',
   '<':'&lt;',
   '>':'&gt;',
   '"':'&quot;',
   "'":'&#39;'
  }[c])
 );

const euro=x=>
 '€'+
 Number(x||0)
 .toFixed(2)
 .replace('.',',');

async function api(path,body){

 const o={
  method:body?'POST':'GET',
  headers:{
   'Content-Type':
    'application/json',
   'X-Token':token
  }
 };

 if(body)
  o.body=
   JSON.stringify(body);

 const r=
  await fetch(path,o);

 const j=
  await r.json();

 if(!r.ok)
  throw Error(
   j.error||
   'Er ging iets mis.'
  );

 return j;
}

function home(){

 if(document.getElementById('make'))
  return;

 app.innerHTML=`

<section class="panel">

<div class="title">
🎲 NIEUW SPEL
</div>

<input
 id="name"
 maxlength="20"
 placeholder="Jouw naam"
 autocomplete="name"
>

<button
 class="green"
 id="make"
>
🎲 SPEL MAKEN
</button>

</section>

<section class="panel">

<div class="title">
OF MEEDOEN
</div>

<input
 id="jname"
 maxlength="20"
 placeholder="Jouw naam"
 autocomplete="name"
>

<div class="row">

<input
 id="code"
 maxlength="4"
 placeholder="Spelcode"
>

<button id="join">
MEEDOEN
</button>

</div>

</section>
`;

 document.getElementById(
  'make'
 ).onclick=create;

 document.getElementById(
  'join'
 ).onclick=join;

 if(invite)
  document.getElementById(
   'code'
  ).value=invite;
}

async function create(){

 const n=
  document.getElementById(
   'name'
  ).value.trim();

 if(!n){
  alert(
   'Vul eerst je naam in.'
  );
  return;
 }

 try{

  const r=
   await api(
    '/api/create',
    {name:n}
   );

  token=r.token;

  sessionStorage.setItem(
   'd1124_token',
   token
  );

  history.replaceState(
   {},
   '',
   '/?room='+r.code
  );

  await refresh(true);

 }catch(e){

  alert(e.message);

 }
}

async function join(){

 const n=
  document.getElementById(
   'jname'
  ).value.trim();

 const c=
  document.getElementById(
   'code'
  ).value
   .trim()
   .toUpperCase();

 if(!n){
  alert(
   'Vul eerst je naam in.'
  );
  return;
 }

 if(!c){
  alert(
   'Vul de spelcode in.'
  );
  return;
 }

 try{

  const r=
   await api(
    '/api/join',
    {
     name:n,
     code:c
    }
   );

  token=r.token;

  sessionStorage.setItem(
   'd1124_token',
   token
  );

  history.replaceState(
   {},
   '',
   '/?room='+r.code
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

 const admin=
  !!me?.admin;

 const url=
  location.origin+
  '/?room='+
  state.code;

 app.innerHTML=`

<section class="panel">

<div class="title">
🎰 WACHTRUIMTE
</div>

<div class="code">
${esc(state.code)}
</div>

${
 admin
 ?
 `
 <div class="invite">
 ${esc(url)}
 </div>

 <button
 class="gold"
 id="copy"
 >
 🔗 LINK KOPIËREN
 </button>
 `
 :
 `
 <p style="text-align:center">
 Wacht tot de beheerder het spel start.
 </p>
 `
}

</section>

<section class="panel">

<div class="title">
👥 SPELERS
</div>

<div
 class="players"
 id="players"
></div>

${
 admin
 ?
 `
 <div style="text-align:center">

 <button
 class="green"
 id="start"
 >
 🎲 START SPEL
 </button>

 </div>
 `
 :
 ''
}

</section>
`;

 const box=
  document.getElementById(
   'players'
  );

 state.players.forEach(p=>{

  const d=
   document.createElement(
    'div'
   );

  d.className='player';

  d.innerHTML=
   '<b>'+
   esc(p.name)+
   '</b>'+
   '<div class="money">'+
   euro(p.money)+
   '</div>'+
   (
    p.admin
    ?
    '👑 BEHEERDER'
    :
    '🟢 SPELER'
   );

  if(admin&&!p.admin){

   const q=
    document.createElement(
     'button'
    );

   q.textContent=
    p.active
    ?
    '⏸️ PAUZE'
    :
    '🟢 ACTIEF';

   q.onclick=()=>
    act(
     'pause',
     {id:p.id}
    );

   d.appendChild(q);

   const x=
    document.createElement(
     'button'
    );

   x.className='red';

   x.textContent=
    '❌ VERWIJDER';

   x.onclick=()=>
    act(
     'remove',
     {id:p.id}
    );

   d.appendChild(x);
  }

  box.appendChild(d);

 });

 if(admin){

  const startButton=
   document.getElementById(
    'start'
   );

  startButton.disabled=
   state.players.filter(
    p=>p.active
   ).length<2;

  startButton.onclick=
   ()=>act('start');

  document.getElementById(
   'copy'
  ).onclick=
   async()=>{

    try{

     await navigator.clipboard
      .writeText(url);

     document.getElementById(
      'copy'
     ).textContent=
      '✅ LINK GEKOPIEERD';

    }catch(e){

     prompt(
      'Kopieer deze link:',
      url
     );

    }
   };
 }
}

const pm={
 1:['mc'],
 2:['tl','br'],
 3:['tl','mc','br'],
 4:['tl','tr','bl','br'],
 5:['tl','tr','mc','bl','br'],
 6:['tl','tr','ml','mr','bl','br']
};

function die(v,i,h){

 return `
 <div
 class="die ${h?'held':''}"
 onclick="hold(${i})"
 >
 ${
  pm[v]
   .map(
    x=>
     '<span class="pip '+x+'"></span>'
   )
   .join('')
 }
 </div>
 `;
}

function game(){

 const me=
  state.players.find(
   p=>p.id===state.me
  );

 const mine=
  me?.id===state.turn;

 const cur=
  state.players.find(
   p=>p.id===state.turn
  );

 let banner='';

 if(state.phase==='earn')
  banner=
   `
   <div class="banner earn">
   VERDIENEN:
   ${state.target}'EN
   </div>
   `;

 if(state.phase==='pay')
  banner=
   `
   <div class="banner">
   BETALEN:
   ${state.target}'EN
   </div>
   `;

 if(
  state.result&&
  state.phase==='main'
 )
  banner=
   `
   <div class="banner">
   ${esc(state.result)}
   </div>
   `;

 app.innerHTML=`

<section class="panel">

<div class="title">

🎯
${esc(cur?.name||'')}
IS AAN DE BEURT

</div>

<div style="text-align:center">

${esc(state.message||'')}

</div>

${banner}

<div class="table">

<div class="dice">

${
 state.dice
  .map(
   (v,i)=>
    die(
     v,
     i,
     state.held[i]||
     (
      state.phase!=='main'&&
      state.targetHeld[i]
     )
    )
  )
  .join('')
}

</div>

</div>

<div
 id="actions"
 style="text-align:center"
></div>

</section>

<section class="panel">

<div class="title">
👥 SPELERS
</div>

<div
 class="players"
 id="players"
></div>

</section>

<section class="panel">

<div class="title">
💬 CHAT
</div>

<div
 class="chat"
 id="chat"
></div>

<div class="row">

<input
 id="chatInput"
 maxlength="200"
 placeholder="Typ een bericht..."
 autocomplete="off"
>

<button id="send">
STUUR
</button>

</div>

</section>

${
 me?.admin
 ?
 `
 <section class="panel">
 <button
  class="gold"
  id="new"
 >
 🔄 NIEUW SPEL
 </button>
 </section>
 `
 :
 ''
}
`;

 const box=
  document.getElementById(
   'players'
  );

 state.players.forEach(p=>{

  const d=
   document.createElement(
    'div'
   );

  d.className=
   'player '+
   (
    p.id===state.turn
    ?
    'current'
    :
    ''
   );

  d.innerHTML=
   '<b>'+
   esc(p.name)+
   '</b>'+
   '<div class="money">'+
   euro(p.money)+
   '</div>'+
   (
    p.active
    ?
    '🟢 ACTIEF'
    :
    '⏸️ PAUZE'
   );

  box.appendChild(d);

 });

 const ch=
  document.getElementById(
   'chat'
  );

 ch.innerHTML=
  state.chat
   .map(
    m=>
     '<div class="msg">'+
     '<b>'+
     esc(m.name)+
     ':</b> '+
     esc(m.text)+
     '</div>'
   )
   .join('');

 ch.scrollTop=
  ch.scrollHeight;

 const ci=
  document.getElementById(
   'chatInput'
  );

 document.getElementById(
  'send'
 ).onclick=
  ()=>sendChat();

 ci.onkeydown=
  e=>{

   if(e.key==='Enter'){

    e.preventDefault();

    sendChat();
   }
  };

 if(me?.admin)
  document.getElementById(
   'new'
  ).onclick=
   ()=>act('newGame');

 const ac=
  document.getElementById(
   'actions'
  );

 if(
  mine&&
  state.phase==='main'
 ){

  const r=
   document.createElement(
    'button'
   );

  r.className=
   state.rolled
   ?
   'orange'
   :
   'green';

  r.textContent=
   state.rolled
   ?
   '🎲 OPNIEUW GOOIEN'
   :
   '🎲 BEGIN WORP';

  r.disabled=
   state.rolled&&
   (
    !state.held.some(Boolean)||
    state.held.every(Boolean)
   );

  r.onclick=
   ()=>act('roll');

  ac.appendChild(r);

  const ok=
   document.createElement(
    'button'
   );

  ok.textContent=
   '✓ AKKOORD';

  ok.disabled=
   !state.rolled||
   !state.held.some(Boolean);

  ok.onclick=
   ()=>act('accept');

  ac.appendChild(ok);

  if(state.undoHold){

   const u=
    document.createElement(
     'button'
    );

   u.className='gold';

   u.textContent=
    '↩️ LAATSTE VASTZETTING TERUG';

   u.onclick=
    ()=>act('undoHold');

   ac.appendChild(u);
  }

  if(state.snapshot){

   const v=
    document.createElement(
     'button'
    );

   v.className='gold';

   v.textContent=
    '↩️ AKKOORD TERUG';

   v.onclick=
    ()=>act('undoAccept');

   ac.appendChild(v);
  }

 }else if(
  mine&&
  (
   state.phase==='earn'||
   state.phase==='pay'
  )
 ){

  const b=
   document.createElement(
    'button'
   );

  b.className='orange';

  b.textContent=
   '🎲 OPNIEUW GOOIEN';

  b.onclick=
   ()=>act('targetRoll');

  ac.appendChild(b);
 }
}

window.hold=
 async i=>{

  if(
   state?.phase==='main'&&
   state.rolled
  )
   await act(
    'hold',
    {index:i}
   );
};

async function sendChat(){

 const i=
  document.getElementById(
   'chatInput'
  );

 const t=
  i.value.trim();

 if(!t)return;

 i.value='';

 await act(
  'chat',
  {text:t}
 );

 setTimeout(()=>{

  const x=
   document.getElementById(
    'chatInput'
   );

  if(x)
   x.focus();

 },30);
}

async function act(
 action,
 data
){

 if(busy)return;

 busy=true;

 try{

  await api(
   '/api/action',
   Object.assign(
    {action},
    data||{}
   )
  );

  await refresh(true);

 }catch(e){

  alert(e.message);

 }finally{

  busy=false;
 }
}

async function refresh(force){

 /*
  BELANGRIJK:

  Zolang de speler nog geen kamer
  heeft gemaakt of is binnengekomen,
  mag home() NIET iedere seconde
  opnieuw worden opgebouwd.

  Hierdoor blijft het Android
  toetsenbord gewoon open.
 */

 if(!token){

  home();

  return;
 }

 try{

  const r=
   await api(
    '/api/state'
   );

  state=r.state;

  if(state.phase==='lobby')
   lobby();
  else
   game();

 }catch(e){

  token='';

  sessionStorage.removeItem(
   'd1124_token'
  );

  state=null;

  home();
 }
}

function loop(){

 clearTimeout(poll);

 /*
  GEEN polling voordat de gebruiker
  is ingelogd.
 */

 if(!token){

  poll=
   setTimeout(
    loop,
    1500
   );

  return;
 }

 poll=
  setTimeout(
   async()=>{

    if(!busy)
     await refresh(false);

    loop();

   },
   900
  );
}

home();

if(token)
 refresh(true);

loop();

</script>

</body>
</html>`;

const server=
 http.createServer(
  (req,res)=>{

   const u=
    new URL(
     req.url,
     'http://x'
    );

   if(req.method==='OPTIONS'){

    res.writeHead(
     204,
     {
      'Access-Control-Allow-Origin':'*',
      'Access-Control-Allow-Headers':
       'Content-Type,X-Token',
      'Access-Control-Allow-Methods':
       'GET,POST,OPTIONS'
     }
    );

    return res.end();
   }

   if(
    u.pathname==='/'&&
    req.method==='GET'
   ){

    res.writeHead(
     200,
     {
      'Content-Type':
       'text/html; charset=utf-8',
      'Cache-Control':
       'no-store'
     }
    );

    return res.end(HTML);
   }

   if(
    u.pathname.startsWith('/api/')&&
    (
     req.method==='POST'||
     req.method==='GET'
    )
   ){

    let body='';

    req.on(
     'data',
     d=>body+=d
    );

    req.on(
     'end',
     ()=>{

      let b={};

      try{
       b=JSON.parse(
        body||'{}'
       );
      }catch(e){}

      if(
       u.pathname==='/api/create'&&
       req.method==='POST'
      ){

       const name=
        String(
         b.name||''
        )
        .trim()
        .slice(0,20);

       if(!name)
        return json(
         res,
         400,
         {
          error:
           'Vul eerst je naam in.'
         }
        );

       const c=code();
       const t=id();

       rooms.set(
        c,
        {
         code:c,
         rev:1,
         phase:'lobby',

         players:[
          {
           id:id(),
           token:t,
           name:name,
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
          false,false,false,false,false
         ],

         rolled:false,

         target:0,

         targetHeld:[
          false,false,false,false,false
         ],

         direction:'',
         result:'',

         message:
          'Wacht op spelers.',

         chat:[],

         opening:null,

         undoHold:null,
         snapshot:null
        }
       );

       return json(
        res,
        200,
        {
         code:c,
         token:t
        }
       );
      }

      if(
       u.pathname==='/api/join'&&
       req.method==='POST'
      ){

       const c=
        String(
         b.code||''
        )
        .trim()
        .toUpperCase();

       const name=
        String(
         b.name||''
        )
        .trim()
        .slice(0,20);

       const r=
        rooms.get(c);

       if(!r)
        return json(
         res,
         404,
         {
          error:
           'Deze kamer bestaat niet.'
         }
        );

       if(r.phase!=='lobby')
        return json(
         res,
         400,
         {
          error:
           'Het spel is al gestart.'
         }
        );

       if(
        active(r).length>=4
       )
        return json(
         res,
         400,
         {
          error:
           'Maximaal 4 spelers.'
         }
        );

       if(!name)
        return json(
         res,
         400,
         {
          error:
           'Vul eerst je naam in.'
         }
        );

       const t=id();

       r.players.push(
        {
         id:id(),
         token:t,
         name:name,
         money:100,
         admin:false,
         active:true
        }
       );

       r.message=
        name+
        ' is de kamer binnengekomen.';

       r.rev++;

       return json(
        res,
        200,
        {
         code:c,
         token:t
        }
       );
      }

      const t=
       req.headers['x-token']||'';

      for(
       const r of rooms.values()
      ){

       const p=
        find(r,t);

       if(!p)
        continue;

       if(
        u.pathname==='/api/state'&&
        req.method==='GET'
       )
        return json(
         res,
         200,
         {
          state:
           state(r,p)
         }
        );

       if(
        u.pathname==='/api/action'&&
        req.method==='POST'
       ){

        try{

         action(
          r,
          p,
          b
         );

         return json(
          res,
          200,
          {
           ok:true
          }
         );

        }catch(e){

         return json(
          res,
          400,
          {
           error:e.message
          }
         );
        }
       }
      }

      return json(
       res,
       401,
       {
        error:
         'Sessie verlopen.'
       }
      );
     }
    );

    return;
   }

   res.writeHead(404);
   res.end('Not found');
  }
);

server.listen(
 PORT,
 '0.0.0.0',
 ()=>{
  console.log(
   'Dobbelen 11/24 draait op poort '+
   PORT
  );
 }
);
