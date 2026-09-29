const http=require('http');
const crypto=require('crypto');

const PORT=process.env.PORT||10000;
const rooms=new Map(),sessions=new Map();

const uid=()=>crypto.randomBytes(10).toString('hex');
const clean=s=>String(s||'').trim().slice(0,20);

const send=(res,n,x)=>{
 res.writeHead(n,{
  'Content-Type':'application/json',
  'Cache-Control':'no-store'
 });
 res.end(JSON.stringify(x));
};

const read=req=>new Promise((ok,bad)=>{
 let s='';
 req.on('data',x=>s+=x);
 req.on('end',()=>{
  try{ok(s?JSON.parse(s):{})}
  catch(e){bad(e)}
 });
});

const code=()=>{
 let c;
 do{
  c=crypto.randomBytes(3).toString('hex').toUpperCase();
 }while(rooms.has(c));
 return c;
};

const roomByToken=t=>{
 const s=sessions.get(t);
 return s&&rooms.get(s.room);
};

const state=(r,t)=>({
 code:r.code,
 started:r.started,
 players:r.players.map((p,i)=>({
  index:i,
  name:p.name,
  money:p.money,
  admin:p.admin,
  me:p.token===t
 })),
 current:r.current,
 phase:r.phase,
 dice:r.dice,
 held:r.held,
 target:r.target,
 message:r.message,
 chat:r.chat.slice(-40)
});

function target(total){

 if(total>=5&&total<=10)
  return 11-total;

 if(total>=12&&total<=17)
  return total-11;

 if(total>=18&&total<=23)
  return 24-total;

 if(total>=25&&total<=30)
  return total-24;

 return null;
}

function roll(r){

 r.dice=r.dice.map((d,i)=>
  r.held.includes(i)
   ? d
   : 1+Math.floor(Math.random()*6)
 );

}

function full(r){

 return r.dice.length===5 &&
 r.dice.every(x=>x===r.dice[0]);

}

function pay(r,p,amount){

 for(const q of r.players.filter(
  x=>x!==p&&x.money>0
 )){

  const a=Math.min(
   amount,
   p.money
  );

  p.money-=a;
  q.money+=a;

  if(p.money<=0)break;
 }

}

function next(r){

 r.current=
  (r.current+1)%r.players.length;

 r.dice=[];
 r.held=[];
 r.paid=[];
 r.target=null;
 r.phase='main';

 r.message=
  'Gooi de dobbelstenen.';

}

function evaluate(r){

 if(full(r)){

  r.target=6;
  r.phase='earn';
  r.held=[0,1,2,3,4];

  r.message=
   'VOLLE BAK! Doel 6.';

  return;
 }

 const total=
  r.dice.reduce(
   (a,b)=>a+b,
   0
  );

 if(total===11||total===24){

  pay(
   r,
   r.players[r.current],
   .5
  );

  r.message=
   total+
   '! €0,50 naar iedere tegenstander.';

  setTimeout(()=>{
   if(rooms.has(r.code))next(r);
  },400);

  return;
 }

 const t=target(total);

 if(!t){

  r.message=
   'MIS! Beurt voorbij.';

  setTimeout(()=>{
   if(rooms.has(r.code))next(r);
  },400);

  return;
 }

 r.target=t;

 r.message=
  'Doel '+t+
  '. Selecteer dobbelstenen en druk VASTHOUDEN.';
}

function act(r,p,a,sel){

 if(
  r.players[r.current]!==p
 )
  throw Error(
   'Je bent niet aan de beurt.'
  );

 if(r.phase==='main'){

  if(
   a==='begin'&&
   !r.dice.length
  ){

   r.dice=[0,0,0,0,0];
   r.held=[];
   r.paid=[];

   roll(r);
   evaluate(r);

   return;
  }

  if(
   a==='hold'&&
   r.dice.length===5
  ){

   for(const i of sel||[]){

    if(
     Number.isInteger(i)&&
     i>=0&&
     i<5&&
     !r.held.includes(i)
    ){

     r.held.push(i);
    }
   }

   r.held.sort(
    (a,b)=>a-b
   );

   if(r.target){

    const fresh=(sel||[])
     .filter(i=>
      r.dice[i]===r.target&&
      !r.paid.includes(i)
     );

    if(fresh.length){

     const amount=
      r.target*
      .5*
      fresh.length;

     pay(
      r,
      p,
      amount
     );

     r.paid.push(...fresh);

     r.message=
      'Uitbetaling: €'+
      amount.toFixed(2)
       .replace('.',',');
    }
   }

   return;
  }

  if(
   a==='reroll'&&
   r.dice.length===5
  ){

   if(r.held.length===5){

    r.phase='earn';

    r.message=
     'Alle stenen vastgehouden. Klik AKKOORD.';

    return;
   }

   roll(r);
   evaluate(r);

   return;
  }

  if(a==='undo'){

   r.held=[];
   r.paid=[];

   r.message=
    'Vasthouden geannuleerd.';

   return;
  }
 }

 if(r.phase==='earn'){

  if(a==='accept'){

   next(r);
   return;
  }

  if(a==='undo'){

   r.held=[];
   r.paid=[];
   r.phase='main';

   r.message=
    'Vasthouden geannuleerd.';
  }
 }
}


/* =========================
   WEBSITE
========================= */

const HTML=String.raw`<!doctype html>
<html lang="nl">
<head>

<meta charset="utf-8">

<meta name="viewport"
content="width=device-width,initial-scale=1">

<title>DOBBELEN 11/24</title>

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
  #182d48,
  #05080d 70%
 );
 color:#fff;
 font-family:Arial
}

.wrap{
 max-width:1000px;
 margin:auto;
 padding:20px
}

.logo{
 text-align:center;
 color:#ffd45a;
 font-size:34px;
 font-weight:900;
 letter-spacing:3px
}

.sub{
 text-align:center;
 color:#aaa;
 margin:6px 0 20px
}

.panel{
 background:#0c121bf5;
 border:1px solid #354354;
 border-radius:18px;
 padding:20px;
 margin:12px 0
}

.table{
 background:
 radial-gradient(
  circle,
  #116b43,
  #063c27 72%
 );
 border:7px solid #6e4b20;
 border-radius:28px;
 padding:20px
}

.row{
 display:flex;
 gap:10px;
 align-items:center;
 flex-wrap:wrap
}

.input{
 background:#080d13;
 color:#fff;
 border:1px solid #536273;
 border-radius:10px;
 padding:13px;
 font-size:16px;
 flex:1;
 min-width:180px
}

.input:focus{
 outline:0;
 border-color:#ffd45a
}

button{
 border:0;
 border-radius:10px;
 padding:13px 17px;
 font-weight:900;
 cursor:pointer
}

.green{background:#18b968}
.gold{background:#e6b93d}
.red{background:#d33b42;color:#fff}
.blue{background:#287bdc;color:#fff}
.gray{background:#47515e;color:#fff}

.center{
 text-align:center
}

.title{
 font-size:25px;
 font-weight:900;
 color:#ffd45a;
 margin-bottom:15px
}

.small{
 color:#aeb8c3;
 font-size:13px
}

.players{
 display:grid;
 grid-template-columns:
 repeat(auto-fit,minmax(160px,1fr));
 gap:10px
}

.player{
 background:#101925;
 border:1px solid #3a4655;
 border-radius:12px;
 padding:12px
}

.me{
 border-color:#ffd45a
}

.turn{
 box-shadow:
 0 0 0 2px #18b968 inset
}

.money{
 font-size:21px;
 color:#7dffb2;
 font-weight:900
}

.dice{
 display:flex;
 justify-content:center;
 gap:13px;
 flex-wrap:wrap;
 margin:22px 0
}

.die{
 width:72px;
 height:72px;
 background:
 linear-gradient(
  145deg,
  #fff,
  #c9c9c9
 );
 border:3px solid #888;
 border-radius:15px;
 display:grid;
 grid-template-columns:
 repeat(3,1fr);
 grid-template-rows:
 repeat(3,1fr);
 padding:9px
}

.held{
 border-color:#ffd45a!important;
 transform:translateY(-5px)
}

.pip{
 width:13px;
 height:13px;
 background:#161616;
 border-radius:50%;
 align-self:center;
 justify-self:center
}

.d1 .pip:nth-child(1){
 grid-area:2/2
}

.d2 .pip:nth-child(1){
 grid-area:1/1
}

.d2 .pip:nth-child(2){
 grid-area:3/3
}

.d3 .pip:nth-child(1){
 grid-area:1/1
}

.d3 .pip:nth-child(2){
 grid-area:2/2
}

.d3 .pip:nth-child(3){
 grid-area:3/3
}

.d4 .pip:nth-child(1){
 grid-area:1/1
}

.d4 .pip:nth-child(2){
 grid-area:1/3
}

.d4 .pip:nth-child(3){
 grid-area:3/1
}

.d4 .pip:nth-child(4){
 grid-area:3/3
}

.d5 .pip:nth-child(1){
 grid-area:1/1
}

.d5 .pip:nth-child(2){
 grid-area:1/3
}

.d5 .pip:nth-child(3){
 grid-area:2/2
}

.d5 .pip:nth-child(4){
 grid-area:3/1
}

.d5 .pip:nth-child(5){
 grid-area:3/3
}

.d6 .pip:nth-child(1){
 grid-area:1/1
}

.d6 .pip:nth-child(2){
 grid-area:2/1
}

.d6 .pip:nth-child(3){
 grid-area:3/1
}

.d6 .pip:nth-child(4){
 grid-area:1/3
}

.d6 .pip:nth-child(5){
 grid-area:2/3
}

.d6 .pip:nth-child(6){
 grid-area:3/3
}

.actions{
 display:flex;
 gap:10px;
 justify-content:center;
 flex-wrap:wrap
}

.status{
 text-align:center;
 font-size:20px;
 font-weight:900;
 margin:10px
}

.target{
 text-align:center;
 color:#ffd45a;
 font-size:22px;
 font-weight:900
}

.chat{
 height:180px;
 overflow:auto;
 background:#070b10;
 border-radius:10px;
 padding:10px
}

.msg{
 margin:5px 0
}

.msg b{
 color:#ffd45a
}

.invite{
 word-break:break-all;
 background:#070b10;
 padding:12px;
 border-radius:10px;
 margin:10px 0;
 color:#8ee7ff
}

</style>
</head>

<body>

<div class="wrap">

<div class="logo">
DOBBELEN 11/24
</div>

<div class="sub">
LAS VEGAS • ONLINE MULTIPLAYER
</div>

<main id="app"></main>

</div>

<script>

const KEY='d1124token';

const qs=
 new URLSearchParams(
  location.search
 );

const invite=
 (qs.get('join')||'')
 .toUpperCase();

const app=
 document.getElementById('app');

let S=null;
let timer=null;

const tok=()=>
 sessionStorage.getItem(KEY)||'';

const eur=n=>
 '€'+
 Number(n||0)
 .toFixed(2)
 .replace('.',',');

function esc(s){

 return String(s??'')
  .replace(
   /[&<>"']/g,
   m=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
   }[m])
  );
}

async function api(u,o={}){

 const r=
  await fetch(
   u,
   {
    ...o,
    headers:{
     'Content-Type':
      'application/json',
     ...(o.headers||{})
    }
   }
  );

 let j={};

 try{
  j=await r.json();
 }catch{}

 if(!r.ok)
  throw Error(
   j.error||'Er ging iets mis'
  );

 return j;
}

function home(){

 app.innerHTML=
 '<section class="panel center">'+
 '<div class="title">NIEUW SPEL</div>'+
 '<div class="row">'+
 '<input id="name" class="input" '+
 'maxlength="20" autocomplete="name" '+
 'placeholder="Jouw naam">'+
 '<button class="green" '+
 'onclick="create()">KAMER MAKEN</button>'+
 '</div>'+
 '</section>'+
 '<section class="panel center">'+
 '<div class="title">MEESPELEN</div>'+
 '<div class="row">'+
 '<input id="code" class="input" '+
 'maxlength="8" placeholder="Kamercode">'+
 '<input id="jn" class="input" '+
 'maxlength="20" autocomplete="name" '+
 'placeholder="Jouw naam">'+
 '<button class="gold" '+
 'onclick="joinManual()">MEEDOEN</button>'+
 '</div>'+
 '</section>';
}

function invitePage(){

 app.innerHTML=
 '<section class="panel center">'+
 '<div class="title">'+
 'UITNODIGING VOOR KAMER '+
 esc(invite)+
 '</div>'+
 '<p class="small">'+
 'Je bent uitgenodigd om mee te spelen.'+
 '</p>'+
 '<div class="row">'+
 '<input id="jname" class="input" '+
 'maxlength="20" autocomplete="name" '+
 'autocapitalize="words" '+
 'placeholder="Jouw naam">'+
 '<button class="green" '+
 'onclick="joinInvite()">MEEDOEN</button>'+
 '</div>'+
 '</section>';

}

async function create(){

 const n=
  document
   .getElementById('name')
   .value.trim();

 if(!n)
  return alert(
   'Vul je naam in.'
  );

 try{

  const r=
   await api(
    '/api/create',
    {
     method:'POST',
     body:JSON.stringify({
      name:n
     })
    }
   );

  sessionStorage.setItem(
   KEY,
   r.token
  );

  history.replaceState(
   {},
   '',
   '/?room='+r.room
  );

  await refresh();

  startPoll();

 }catch(e){

  alert(e.message);

 }
}

async function joinManual(){

 const r=
  document
   .getElementById('code')
   .value
   .trim()
   .toUpperCase();

 const n=
  document
   .getElementById('jn')
   .value
   .trim();

 if(!r||!n)
  return alert(
   'Vul kamercode en naam in.'
  );

 join(r,n);
}

async function joinInvite(){

 const n=
  document
   .getElementById('jname')
   .value
   .trim();

 if(!n)
  return alert(
   'Vul je naam in.'
  );

 join(invite,n);
}

async function join(r,n){

 try{

  const x=
   await api(
    '/api/join',
    {
     method:'POST',
     body:JSON.stringify({
      room:r,
      name:n
     })
    }
   );

  sessionStorage.setItem(
   KEY,
   x.token
  );

  history.replaceState(
   {},
   '',
   '/?room='+r
  );

  await refresh();

  startPoll();

 }catch(e){

  alert(e.message);

 }
}

function die(n,i){

 return '<div class="die '+
  (
   (S.held||[]).includes(i)
   ?
   'held'
   :
   ''
  )+
  '" onclick="sel('+i+')">'+
  Array.from(
   {length:n},
   ()=>'<i class="pip"></i>'
  ).join('')+
  '</div>';
}

function render(){

 if(!S)return;

 const me=
  S.players.find(
   p=>p.me
  );

 const cur=
  S.players[S.current];

 let h=
 '<section class="panel">'+
 '<div class="row">'+
 '<b>KAMER '+
 esc(S.code)+
 '</b>'+
 '<button class="gray" '+
 'style="margin-left:auto" '+
 'onclick="copyLink()">'+
 'UITNODIGING KOPIËREN'+
 '</button>'+
 '</div>';

 if(!S.started){

  h+=
   '<div class="invite">'+
   esc(
    location.origin+
    '/?join='+S.code
   )+
   '</div>';

  h+=
   '<div class="players">'+
   S.players.map(
    p=>
     '<div class="player '+
     (p.me?'me':'')+
     '">'+
     '<b>'+
     esc(p.name)+
     '</b>'+
     (p.admin?' 👑':'')+
     '<div class="money">'+
     eur(p.money)+
     '</div>'+
     '</div>'
   ).join('')+
   '</div>';

  h+=
   '<div class="center" '+
   'style="margin-top:18px">'+
   (
    me.admin
    ?
    '<button class="green" '+
    (S.players.length<2?'disabled':'')+
    ' onclick="startGame()">'+
    'START SPEL</button>'
    :
    '<b class="small">'+
    'Wachten op de beheerder…'+
    '</b>'
   )+
   '</div></section>';

 }else{

  h+=
   '<div class="players">'+
   S.players.map(
    p=>
     '<div class="player '+
     (p.me?'me ':'')+
     (p.index===S.current?
      'turn':'')+
     '">'+
     '<b>'+
     esc(p.name)+
     '</b>'+
     (p.admin?' 👑':'')+
     (p.index===S.current?
      ' 🎲':'')+
     '<div class="money">'+
     eur(p.money)+
     '</div>'+
     '</div>'
   ).join('')+
   '</div></section>';

  h+=
   '<section class="table">'+
   '<div class="status">'+
   esc(cur.name)+
   (
    cur.me
    ?
    ' — JIJ BENT AAN DE BEURT'
    :
    ''
   )+
   '</div>';

  if(S.target){

   h+=
    '<div class="target">'+
    'DOEL: '+
    S.target+
    '</div>';
  }

  h+=
   '<div class="status">'+
   esc(S.message||'')+
   '</div>';

  h+=
   '<div class="dice">'+
   (S.dice||[])
    .map(
     (d,i)=>die(d,i)
    ).join('')+
   '</div>';

  h+=
   '<div class="actions">';

  if(cur.me){

   if(
    S.phase==='main'&&
    !S.dice.length
   ){

    h+=
     '<button class="green" '+
     'onclick="act(\'begin\')">'+
     'BEGIN WORP</button>';
   }

   if(
    S.phase==='main'&&
    S.dice.length
   ){

    h+=
     '<button class="gold" '+
     'onclick="act(\'hold\')">'+
     'VASTHOUDEN</button>'+
     '<button class="blue" '+
     'onclick="act(\'reroll\')">'+
     'OPNIEUW GOOIEN</button>'+
     '<button class="red" '+
     'onclick="act(\'undo\')">'+
     'ANNULEREN</button>';
   }

   if(S.phase==='earn'){

    h+=
     '<button class="green" '+
     'onclick="act(\'accept\')">'+
     'AKKOORD</button>'+
     '<button class="red" '+
     'onclick="act(\'undo\')">'+
     'ANNULEREN</button>';
   }
  }

  h+=
   '</div></section>';
 }

 h+=
  '<section class="panel">'+
  '<div class="title">CHAT</div>'+
  '<div class="chat" id="chat">'+
  (S.chat||[])
   .map(
    m=>
     '<div class="msg">'+
     '<b>'+
     esc(m.name)+
     ':</b> '+
     esc(m.text)+
     '</div>'
   ).join('')+
  '</div>'+
  '<div class="row" '+
  'style="margin-top:10px">'+
  '<input id="chatin" class="input" '+
  'maxlength="200" '+
  'placeholder="Typ een bericht…">'+
  '<button class="gold" '+
  'onclick="chat()">VERSTUUR</button>'+
  '</div>'+
  '</section>';

 app.innerHTML=h;

 const c=
  document.getElementById('chat');

 if(c)
  c.scrollTop=c.scrollHeight;
}

async function refresh(){

 /*
  BELANGRIJK:
  Op een uitnodigingslink zonder token
  wordt NIET ververst.
 */

 if(
  invite&&
  !tok()
 )
  return;

 if(!tok()){

  home();
  return;
 }

 /*
  Tijdens typen niets opnieuw tekenen.
 */

 const a=
  document.activeElement;

 if(
  a&&
  (
   a.tagName==='INPUT'||
   a.tagName==='TEXTAREA'
  )
 )
  return;

 try{

  S=
   await api(
    '/api/state?token='+
    encodeURIComponent(tok())
   );

  render();

 }catch(e){

  sessionStorage.removeItem(
   KEY
  );

  S=null;

  home();
 }
}

function startPoll(){

 if(timer)
  clearInterval(timer);

 timer=
  setInterval(
   ()=>{
    if(!tok())return;

    const a=
     document.activeElement;

    if(
     a&&
     (
      a.tagName==='INPUT'||
      a.tagName==='TEXTAREA'
     )
    )
     return;

    refresh();
   },
   1200
  );
}

async function startGame(){

 try{

  await api(
   '/api/start',
   {
    method:'POST',
    body:JSON.stringify({
     token:tok()
    })
   }
  );

  await refresh();

 }catch(e){

  alert(e.message);
 }
}

async function act(a){

 try{

  await api(
   '/api/action',
   {
    method:'POST',
    body:JSON.stringify({
     token:tok(),
     action:a,
     selected:S.sel||[]
    })
   }
  );

  S.sel=[];

  await refresh();

 }catch(e){

  alert(e.message);
 }
}

function sel(i){

 if(
  !S||
  S.phase!=='main'||
  !S.players[S.current].me
 )
  return;

 S.sel=S.sel||[];

 const x=
  S.sel.indexOf(i);

 if(x>=0)
  S.sel.splice(x,1);
 else
  S.sel.push(i);

 render();
}

async function chat(){

 const e=
  document.getElementById(
   'chatin'
  );

 const v=
  e.value.trim();

 if(!v)return;

 try{

  await api(
   '/api/chat',
   {
    method:'POST',
    body:JSON.stringify({
     token:tok(),
     text:v
    })
   }
  );

  await refresh();

  const n=
   document.getElementById(
    'chatin'
   );

  if(n)n.focus();

 }catch(x){

  alert(x.message);
 }
}

function copyLink(){

 if(
  navigator.clipboard
 )
  navigator.clipboard.writeText(
   location.origin+
   '/?join='+S.code
  );

 alert(
  'Uitnodiging gekopieerd!'
 );
}


/*
 GEEN POLLING OP UITNODIGINGSPAGINA
 */

if(
 invite&&
 !tok()
){

 invitePage();

}else{

 refresh();
 startPoll();

}

</script>

</body>
</html>`;

const server=http.createServer(
 async(req,res)=>{

  try{

   const u=
    new URL(
     req.url,
     'http://localhost'
    );

   if(
    req.method==='GET'&&
    u.pathname==='/health'
   ){

    return send(
     res,
     200,
     {ok:true}
    );
   }

   if(
    req.method==='GET'&&
    u.pathname==='/'
   ){

    res.writeHead(
     200,
     {
      'Content-Type':
       'text/html; charset=utf-8'
     }
    );

    return res.end(HTML);
   }

   if(
    req.method==='POST'&&
    u.pathname==='/api/create'
   ){

    const b=await read(req);
    const name=clean(b.name);

    if(!name)
     return send(
      res,
      400,
      {error:'Naam ontbreekt'}
     );

    const c=code();
    const t=uid();

    const r={
     code:c,
     started:false,
     players:[
      {
       token:t,
       name,
       money:0,
       admin:true
      }
     ],
     current:0,
     phase:'main',
     dice:[],
     held:[],
     paid:[],
     target:null,
     message:
      'Wacht op minimaal 2 spelers.',
     chat:[]
    };

    rooms.set(c,r);
    sessions.set(t,{room:c});

    return send(
     res,
     200,
     {
      room:c,
      token:t
     }
    );
   }

   if(
    req.method==='POST'&&
    u.pathname==='/api/join'
   ){

    const b=await read(req);

    const c=
     String(b.room||'')
      .trim()
      .toUpperCase();

    const name=
     clean(b.name);

    const r=rooms.get(c);

    if(!r)
     return send(
      res,
      404,
      {error:'Kamer niet gevonden'}
     );

    if(r.started)
     return send(
      res,
      400,
      {error:'Spel is al gestart'}
     );

    if(r.players.length>=4)
     return send(
      res,
      400,
      {error:'Kamer is vol'}
     );

    if(!name)
     return send(
      res,
      400,
      {error:'Naam ontbreekt'}
     );

    const t=uid();

    r.players.push({
     token:t,
     name,
     money:0,
     admin:false
    });

    sessions.set(
     t,
     {room:c}
    );

    r.chat.push({
     name:'Systeem',
     text:name+
      ' is toegetreden.'
    });

    return send(
     res,
     200,
     {
      room:c,
      token:t
     }
    );
   }

   if(
    req.method==='GET'&&
    u.pathname==='/api/state'
   ){

    const t=
     u.searchParams.get(
      'token'
     );

    const r=
     roomByToken(t);

    if(!r)
     return send(
      res,
      401,
      {error:'Sessie verlopen'}
     );

    return send(
     res,
     200,
     state(r,t)
    );
   }

   if(
    req.method==='POST'&&
    u.pathname==='/api/start'
   ){

    const b=await read(req);

    const r=
     roomByToken(b.token);

    const p=
     r&&
     r.players.find(
      x=>x.token===b.token
     );

    if(!r||!p)
     return send(
      res,
      401,
      {error:'Sessie verlopen'}
     );

    if(!p.admin)
     return send(
      res,
      403,
      {
       error:
        'Alleen beheerder'
      }
     );

    if(r.players.length<2)
     return send(
      res,
      400,
      {
       error:
        'Minimaal 2 spelers'
      }
     );

    r.started=true;

    r.players.forEach(
     x=>x.money=100
    );

    r.current=0;
    r.dice=[];
    r.held=[];
    r.paid=[];
    r.target=null;
    r.phase='main';

    r.message=
     'Gooi de dobbelstenen.';

    return send(
     res,
     200,
     {ok:true}
    );
   }

   if(
    req.method==='POST'&&
    u.pathname==='/api/action'
   ){

    const b=await read(req);

    const r=
     roomByToken(b.token);

    const p=
     r&&
     r.players.find(
      x=>x.token===b.token
     );

    if(!r||!p)
     return send(
      res,
      401,
      {error:'Sessie verlopen'}
     );

    act(
     r,
     p,
     b.action,
     b.selected||[]
    );

    return send(
     res,
     200,
     {ok:true}
    );
   }

   if(
    req.method==='POST'&&
    u.pathname==='/api/chat'
   ){

    const b=await read(req);

    const r=
     roomByToken(b.token);

    const p=
     r&&
     r.players.find(
      x=>x.token===b.token
     );

    if(!r||!p)
     return send(
      res,
      401,
      {error:'Sessie verlopen'}
     );

    const text=
     String(b.text||'')
      .trim()
      .slice(0,200);

    if(text)
     r.chat.push({
      name:p.name,
      text
     });

    return send(
     res,
     200,
     {ok:true}
    );
   }

   return send(
    res,
    404,
    {error:'Niet gevonden'}
   );

  }catch(e){

   console.error(e);

   return send(
    res,
    500,
    {
     error:
      e.message||
      'Serverfout'
    }
   );
  }
});

server.listen(
 PORT,
 ()=>{
  console.log(
   'Dobbelen 11/24 draait op poort '+
   PORT
  );
 }
);
