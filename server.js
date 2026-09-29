const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 10000;

const rooms = new Map();
const sessions = new Map();

const HTML = String.raw`<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DOBBELEN 11/24</title>

<style>

*{
 box-sizing:border-box;
}

body{
 margin:0;
 min-height:100vh;
 background:
 radial-gradient(circle at top,#182d48,#06090e 70%);
 color:#fff;
 font-family:Arial,sans-serif;
}

.wrap{
 max-width:1000px;
 margin:auto;
 padding:20px;
}

.logo{
 text-align:center;
 color:#ffd45a;
 font-size:34px;
 font-weight:900;
 letter-spacing:3px;
 text-shadow:0 2px 12px #000;
}

.sub{
 text-align:center;
 color:#aaa;
 margin:6px 0 22px;
}

.panel{
 background:rgba(12,18,27,.96);
 border:1px solid #354354;
 border-radius:18px;
 padding:20px;
 margin:12px 0;
 box-shadow:0 12px 35px #0008;
}

.table{
 background:
 radial-gradient(circle,#116b43,#063c27 72%);
 border:7px solid #6e4b20;
 border-radius:28px;
 padding:20px;
 box-shadow:
 inset 0 0 50px #0008,
 0 12px 35px #000;
}

.row{
 display:flex;
 gap:10px;
 align-items:center;
 flex-wrap:wrap;
}

.input{
 background:#080d13;
 color:#fff;
 border:1px solid #536273;
 border-radius:10px;
 padding:13px;
 font-size:16px;
 flex:1;
 min-width:180px;
}

.input:focus{
 outline:none;
 border-color:#ffd45a;
 box-shadow:0 0 0 2px #ffd45a33;
}

button{
 border:0;
 border-radius:10px;
 padding:13px 17px;
 font-weight:900;
 cursor:pointer;
 touch-action:manipulation;
}

.green{
 background:#18b968;
 color:#04140b;
}

.gold{
 background:#e6b93d;
 color:#211700;
}

.red{
 background:#d33b42;
 color:#fff;
}

.blue{
 background:#287bdc;
 color:#fff;
}

.gray{
 background:#47515e;
 color:#fff;
}

button:disabled{
 opacity:.35;
 cursor:not-allowed;
}

.center{
 text-align:center;
}

.title{
 font-size:25px;
 font-weight:900;
 color:#ffd45a;
 margin-bottom:15px;
}

.small{
 color:#aeb8c3;
 font-size:13px;
}

.error{
 color:#ff7777;
 font-weight:700;
}

.players{
 display:grid;
 grid-template-columns:
 repeat(auto-fit,minmax(170px,1fr));
 gap:10px;
}

.player{
 background:#101925;
 border:1px solid #3a4655;
 border-radius:12px;
 padding:12px;
}

.player.me{
 border-color:#ffd45a;
}

.player.turn{
 box-shadow:0 0 0 2px #18b968 inset;
}

.money{
 font-size:21px;
 color:#7dffb2;
 font-weight:900;
}

.dice{
 display:flex;
 justify-content:center;
 gap:13px;
 flex-wrap:wrap;
 margin:22px 0;
}

.die{
 width:72px;
 height:72px;
 background:linear-gradient(145deg,#fff,#c9c9c9);
 border:3px solid #8e8e8e;
 border-radius:15px;
 box-shadow:0 7px 13px #0008;
 display:grid;
 grid-template-columns:repeat(3,1fr);
 grid-template-rows:repeat(3,1fr);
 padding:9px;
 cursor:pointer;
}

.die.held{
 border:4px solid #ffd45a;
 transform:translateY(-5px);
 box-shadow:
 0 0 18px #ffd45a88,
 0 7px 13px #0008;
}

.pip{
 width:13px;
 height:13px;
 background:#161616;
 border-radius:50%;
 align-self:center;
 justify-self:center;
}

.d1 .pip:nth-child(1){
 grid-area:2/2;
}

.d2 .pip:nth-child(1){
 grid-area:1/1;
}

.d2 .pip:nth-child(2){
 grid-area:3/3;
}

.d3 .pip:nth-child(1){
 grid-area:1/1;
}

.d3 .pip:nth-child(2){
 grid-area:2/2;
}

.d3 .pip:nth-child(3){
 grid-area:3/3;
}

.d4 .pip:nth-child(1){
 grid-area:1/1;
}

.d4 .pip:nth-child(2){
 grid-area:1/3;
}

.d4 .pip:nth-child(3){
 grid-area:3/1;
}

.d4 .pip:nth-child(4){
 grid-area:3/3;
}

.d5 .pip:nth-child(1){
 grid-area:1/1;
}

.d5 .pip:nth-child(2){
 grid-area:1/3;
}

.d5 .pip:nth-child(3){
 grid-area:2/2;
}

.d5 .pip:nth-child(4){
 grid-area:3/1;
}

.d5 .pip:nth-child(5){
 grid-area:3/3;
}

.d6 .pip:nth-child(1){
 grid-area:1/1;
}

.d6 .pip:nth-child(2){
 grid-area:2/1;
}

.d6 .pip:nth-child(3){
 grid-area:3/1;
}

.d6 .pip:nth-child(4){
 grid-area:1/3;
}

.d6 .pip:nth-child(5){
 grid-area:2/3;
}

.d6 .pip:nth-child(6){
 grid-area:3/3;
}

.actions{
 display:flex;
 gap:10px;
 justify-content:center;
 flex-wrap:wrap;
}

.status{
 text-align:center;
 font-size:20px;
 font-weight:900;
 margin:10px;
}

.target{
 text-align:center;
 color:#ffd45a;
 font-size:22px;
 font-weight:900;
}

.chat{
 height:180px;
 overflow:auto;
 background:#070b10;
 border-radius:10px;
 padding:10px;
}

.msg{
 margin:5px 0;
}

.msg b{
 color:#ffd45a;
}

.invite{
 word-break:break-all;
 background:#070b10;
 padding:12px;
 border-radius:10px;
 margin:10px 0;
 color:#8ee7ff;
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

let S=null;

const qs=new URLSearchParams(location.search);

const invite=(qs.get('join')||'').toUpperCase();

const app=document.getElementById('app');

let refreshTimer=null;


function esc(s){

 return String(s??'').replace(
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


function euro(n){

 return '€'+
  Number(n||0)
   .toFixed(2)
   .replace('.',',');

}


function token(){

 return sessionStorage.getItem(KEY)||'';

}


async function api(url,opts={}){

 const o={
  ...opts,
  headers:{
   'Content-Type':'application/json',
   ...(opts.headers||{})
  }
 };

 const r=await fetch(url,o);

 let j={};

 try{
  j=await r.json();
 }catch(e){}

 if(!r.ok){

  throw new Error(
   j.error||'Er ging iets mis'
  );

 }

 return j;

}


function home(){

 app.innerHTML=

 '<section class="panel center">'+

 '<div class="title">NIEUW SPEL</div>'+

 '<div class="row">'+

 '<input id="name" '+
 'class="input" '+
 'maxlength="20" '+
 'autocomplete="name" '+
 'placeholder="Jouw naam">'+

 '<button class="green" onclick="createRoom()">'+
 'KAMER MAKEN'+
 '</button>'+

 '</div>'+

 '</section>'+

 '<section class="panel center">'+

 '<div class="title">MEESPELEN</div>'+

 '<div class="row">'+

 '<input id="code" '+
 'class="input" '+
 'maxlength="8" '+
 'placeholder="Kamercode">'+

 '<input id="jname2" '+
 'class="input" '+
 'maxlength="20" '+
 'autocomplete="name" '+
 'placeholder="Jouw naam">'+

 '<button class="gold" onclick="joinManual()">'+
 'MEEDOEN'+
 '</button>'+

 '</div>'+

 '</section>'+

 '<section class="panel small center">'+
 'Maximaal 4 spelers • Iedere speler start met €100,00'+
 '</section>';

}


async function createRoom(){

 const el=document.getElementById('name');

 if(!el){
  return;
 }

 const name=el.value.trim();

 if(!name){

  el.focus();

  return alert('Vul je naam in.');

 }

 try{

  const r=await api(
   '/api/create',
   {
    method:'POST',
    body:JSON.stringify({
     name
    })
   }
  );

  sessionStorage.setItem(
   KEY,
   r.playerToken
  );

  history.replaceState(
   {},
   '',
   '/?room='+r.room
  );

  await refresh();

 }catch(e){

  alert(e.message);

 }

}


async function joinManual(){

 const codeEl=
  document.getElementById('code');

 const nameEl=
  document.getElementById('jname2');

 if(!codeEl||!nameEl){
  return;
 }

 const room=
  codeEl.value
   .trim()
   .toUpperCase();

 const name=
  nameEl.value.trim();

 if(!room){

  codeEl.focus();

  return alert('Vul de kamercode in.');

 }

 if(!name){

  nameEl.focus();

  return alert('Vul je naam in.');

 }

 await doJoin(
  room,
  name
 );

}


async function joinRoom(){

 const el=
  document.getElementById('jname');

 if(!el){
  return;
 }

 const name=
  el.value.trim();

 if(!name){

  el.focus();

  return alert('Vul je naam in.');

 }

 await doJoin(
  invite,
  name
 );

}


async function doJoin(room,name){

 try{

  const r=await api(
   '/api/join',
   {
    method:'POST',
    body:JSON.stringify({
     room,
     name
    })
   }
  );

  sessionStorage.setItem(
   KEY,
   r.playerToken
  );

  history.replaceState(
   {},
   '',
   '/?room='+r.room
  );

  await refresh();

  startPolling();

 }catch(e){

  alert(e.message);

 }

}


function showInvite(){

 /*
  BELANGRIJK:
  Deze functie wordt alleen gebruikt op
  de uitnodigingspagina.

  Er wordt hier GEEN timer gestart.
  Het scherm blijft dus volledig stil.
 */

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

 '<input id="jname" '+
 'class="input" '+
 'maxlength="20" '+
 'autocomplete="name" '+
 'autocapitalize="words" '+
 'placeholder="Jouw naam">'+

 '<button class="green" '+
 'onclick="joinRoom()">'+
 'MEEDOEN'+
 '</button>'+

 '</div>'+

 '</section>';

}


function die(n,i,held){

 const p=Array.from(
  {length:n},
  ()=>'<i class="pip"></i>'
 ).join('');

 return '<div class="die d'+
  n+
  (held?' held':'')+
  '" onclick="selectDie('+
  i+
  ')">'+
  p+
  '</div>';

}


function render(){

 if(!S){

  if(invite&&!token()){

   showInvite();

  }else{

   home();

  }

  return;

 }

 const me=
  S.players.find(
   p=>p.me
  );

 const admin=
  me&&me.admin;

 let h=

 '<section class="panel">'+

 '<div class="row">'+

 '<div>'+

 '<b>KAMER '+
 esc(S.code)+
 '</b>'+

 '<div class="small">'+
 (
  S.started
  ?
  'Spel bezig'
  :
  'Wachten op spelers'
 )+
 '</div>'+

 '</div>'+

 '<div style="margin-left:auto">'+

 '<button class="gray" '+
 'onclick="copyInvite()">'+
 'UITNODIGING KOPIËREN'+
 '</button>'+

 '</div>'+

 '</div>';


 if(!S.started){

  h+=

  '<div class="invite">'+
  esc(
   location.origin+
   '/?join='+
   S.code
  )+
  '</div>'+

  '<div class="players">';

  S.players.forEach(
   p=>{

    h+=

    '<div class="player '+
    (p.me?'me':'')+
    '">' +

    '<b>'+
    esc(p.name)+
    '</b>'+

    (p.admin?' 👑':'')+

    '<div class="money">'+
    euro(p.money)+
    '</div>'+

    '</div>';

   }
  );

  h+='</div>';

  h+=

  '<div class="center" style="margin-top:18px">'+

  (
   admin

   ?

   '<button class="green" '+
   (S.players.length<2?'disabled':'')+
   ' onclick="startGame()">'+
   'START SPEL'+
   '</button>'

   :

   '<b class="small">'+
   'Wachten op de beheerder…'+
   '</b>'
  )+

  '</div></section>';

 }else{

  h+=

  '<div class="players">';

  S.players.forEach(
   p=>{

    h+=

    '<div class="player '+
    (p.me?'me ':'')+
    (p.index===S.current?'turn':'')+
    '">' +

    '<b>'+
    esc(p.name)+
    '</b>'+

    (p.admin?' 👑':'')+

    (
     p.index===S.current
     ?
     ' 🎲'
     :
     ''
    )+

    '<div class="money">'+
    euro(p.money)+
    '</div>'+

    '</div>';

   }
  );

  h+='</div></section>';

  h+=

  '<section class="table">';

  const cur=
   S.players[S.current];

  h+=

  '<div class="status">'+

  esc(cur?cur.name:'')+

  (
   cur&&cur.me
   ?
   ' — JIJ BENT AAN DE BEURT'
   :
   ''
  )+

  '</div>';

  if(S.phase==='earn'){

   h+=

   '<div class="target">'+
   'DOEL: '+
   S.target+
   '</div>';

  }

  if(S.message){

   h+=

   '<div class="status">'+
   esc(S.message)+
   '</div>';

  }

  h+=

  '<div class="dice">';

  (S.dice||[]).forEach(
   (d,i)=>{

    h+=die(
     d,
     i,
     (S.held||[]).includes(i)
    );

   }
  );

  h+='</div>';

  h+=

  '<div class="actions">';

  if(cur&&cur.me){

   if(
    S.phase==='main' &&
    !(S.dice||[]).length
   ){

    h+=

    '<button class="green" '+
    'onclick="action(\'begin\')">'+
    'BEGIN WORP'+
    '</button>';

   }

   if(
    S.phase==='main' &&
    (S.dice||[]).length
   ){

    h+=

    '<button class="gold" '+
    'onclick="action(\'hold\')">'+
    'VASTHOUDEN'+
    '</button>'+

    '<button class="blue" '+
    'onclick="action(\'reroll\')">'+
    'OPNIEUW GOOIEN'+
    '</button>'+

    '<button class="red" '+
    'onclick="action(\'undo\')">'+
    'VASTHOUDEN ANNULEREN'+
    '</button>';

   }

   if(S.phase==='earn'){

    h+=

    '<button class="green" '+
    'onclick="action(\'accept\')">'+
    'AKKOORD'+
    '</button>'+

    '<button class="red" '+
    'onclick="action(\'undo\')">'+
    'VASTHOUDEN ANNULEREN'+
    '</button>';

   }

  }

  h+='</div>';

  h+='</section>';

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
 )
 .join('')+

 '</div>'+

 '<div class="row" style="margin-top:10px">'+

 '<input id="chatin" '+
 'class="input" '+
 'maxlength="200" '+
 'placeholder="Typ een bericht…" '+
 'onkeydown="if(event.key===\'Enter\')sendChat()">'+

 '<button class="gold" '+
 'onclick="sendChat()">'+
 'VERSTUUR'+
 '</button>'+

 '</div>'+

 '</section>';

 app.innerHTML=h;

 const c=
  document.getElementById('chat');

 if(c){

  c.scrollTop=
   c.scrollHeight;

 }

}


async function refresh(){

 /*
  NOOIT refreshen op een uitnodigingspagina
  wanneer er nog geen speler-token is.
 */

 if(
  invite &&
  !token()
 ){

  return;

 }

 const t=token();

 if(!t){

  home();

  return;

 }

 try{

  const oldInput=
   document.activeElement;

  /*
   Niet opnieuw tekenen terwijl iemand
   in een invoerveld zit.
  */

  if(
   oldInput &&
   (
    oldInput.tagName==='INPUT' ||
    oldInput.tagName==='TEXTAREA'
   )
  ){

   return;

  }

  S=await api(
   '/api/state?token='+
   encodeURIComponent(t)
  );

  render();

 }catch(e){

  sessionStorage.removeItem(KEY);

  S=null;

  home();

 }

}


function startPolling(){

 if(refreshTimer){

  clearInterval(
   refreshTimer
  );

 }

 refreshTimer=
  setInterval(
   ()=>{

    /*
     Als de gebruiker op de
     uitnodigingspagina staat,
     helemaal niets doen.
    */

    if(
     invite &&
     !token()
    ){

     return;

    }

    if(!token()){

     return;

    }

    const active=
     document.activeElement;

    /*
     NIET verversen wanneer de
     gebruiker aan het typen is.
    */

    if(
     active &&
     (
      active.tagName==='INPUT' ||
      active.tagName==='TEXTAREA'
     )
    ){

     return;

    }

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
     token:token()
    })
   }
  );

  await refresh();

 }catch(e){

  alert(e.message);

 }

}


async function action(type){

 try{

  await api(
   '/api/action',
   {
    method:'POST',
    body:JSON.stringify({
     token:token(),
     action:type,
     selected:S.selected||[]
    })
   }
  );

  if(S){

   S.selected=[];

  }

  await refresh();

 }catch(e){

  alert(e.message);

 }

}


function selectDie(i){

 if(
  !S||
  !S.players[S.current]?.me||
  S.phase!=='main'
 ){

  return;

 }

 S.selected=
  S.selected||[];

 const x=
  S.selected.indexOf(i);

 if(x>=0){

  S.selected.splice(
   x,
   1
  );

 }else{

  S.selected.push(i);

 }

 render();

}


async function sendChat(){

 const el=
  document.getElementById(
   'chatin'
  );

 if(
  !el||
  !el.value.trim()
 ){

  return;

 }

 const text=
  el.value.trim();

 try{

  await api(
   '/api/chat',
   {
    method:'POST',
    body:JSON.stringify({
     token:token(),
     text
    })
   }
  );

  el.value='';

  await refresh();

  /*
   Geef het chatveld direct
   weer focus nadat het bericht
   is verstuurd.
  */

  const next=
   document.getElementById(
    'chatin'
   );

  if(next){

   next.focus();

  }

 }catch(e){

  alert(e.message);

 }

}


function copyInvite(){

 if(!S){

  return;

 }

 const link=
  location.origin+
  '/?join='+
  S.code;

 if(
  navigator.clipboard
 ){

  navigator.clipboard
   .writeText(link)
   .catch(()=>{});

 }

 alert(
  'Uitnodiging gekopieerd!'
 );

}


/*
 ==================================================
 START VAN DE CLIENT
 ==================================================

 BELANGRIJK:

 Als iemand via:

 /?join=ABC123

 binnenkomt en nog geen token heeft,
 wordt alleen het uitnodigingsscherm getoond.

 Er wordt GEEN refresh-timer gestart.

 Daardoor kan de gebruiker rustig zijn
 naam typen zonder dat het scherm verdwijnt
 en zonder dat het Android-toetsenbord
 wordt gesloten.
*/

if(
 invite &&
 !token()
){

 showInvite();

}else{

 refresh();

 startPolling();

}

</script>

</body>
</html>`;


/*
==================================================
SERVER FUNCTIES
==================================================
*/

function id(){

 return crypto
  .randomBytes(12)
  .toString('hex');

}


function roomCode(){

 let c;

 do{

  c=
   crypto
    .randomBytes(3)
    .toString('hex')
    .toUpperCase();

 }while(
  rooms.has(c)
 );

 return c;

}


function getRoomByToken(token){

 const s=
  sessions.get(token);

 if(!s){

  return null;

 }

 return rooms.get(
  s.room
 );

}


function send(res,status,data){

 res.writeHead(
  status,
  {
   'Content-Type':
    'application/json; charset=utf-8',

   'Cache-Control':
    'no-store'
  }
 );

 res.end(
  JSON.stringify(data)
 );

}


function body(req){

 return new Promise(
  (resolve,reject)=>{

   let s='';

   req.on(
    'data',
    d=>{
     s+=d;
    }
   );

   req.on(
    'end',
    ()=>{

     try{

      resolve(
       s
       ?
       JSON.parse(s)
       :
       {}
      );

     }catch(e){

      reject(e);

     }

    }
   );

  }
 );

}


function cleanName(n){

 return String(
  n||''
 )
 .trim()
 .slice(0,20);

}


function rollOne(){

 return 1+
  Math.floor(
   Math.random()*6
  );

}


function fullBak(dice){

 return(
  dice.length===5 &&
  dice.every(
   x=>x===dice[0]
  )
 );

}


/*
==================================================
 DOELTABEL
==================================================

5  = 6
6  = 5
7  = 4
8  = 3
9  = 2
10 = 1

11 = speciaal

12 = 1
13 = 2
14 = 3
15 = 4
16 = 5
17 = 6
18 = 6
19 = 5
20 = 4
21 = 3
22 = 2
23 = 1

24 = speciaal

25 = 1
26 = 2
27 = 3
28 = 4
29 = 5
30 = 6

Elke pip = €0,50.
==================================================
*/

function targetFromTotal(total){

 if(
  total>=5 &&
  total<=10
 ){

  return 11-total;

 }

 if(
  total>=12 &&
  total<=17
 ){

  return total-11;

 }

 if(
  total>=18 &&
  total<=23
 ){

  return 24-total;

 }

 if(
  total>=25 &&
  total<=30
 ){

  return total-24;

 }

 return null;

}


function euroAmount(target,count){

 return target*
  0.5*
  count;

}


/*
==================================================
 GELD UITBETALEN
==================================================
*/

function payoutToOpponents(
 room,
 player,
 amount
){

 const opponents=
  room.players.filter(
   p=>
    p!==player &&
    p.money>0
  );

 for(
  const opponent of opponents
 ){

  const payment=
   Math.min(
    amount,
    player.money
   );

  player.money-=
   payment;

  opponent.money+=
   payment;

  if(
   player.money<=0
  ){

   break;

  }

 }

}


/*
==================================================
 VOLGENDE BEURT
==================================================
*/

function nextTurn(room){

 if(
  room.players.length===0
 ){

  return;

 }

 let next=
  room.current;

 for(
  let i=0;
  i<room.players.length;
  i++
 ){

  next=
   (next+1)%
   room.players.length;

  if(
   room.players[next].money>0
  ){

   room.current=
    next;

   break;

  }

 }

 room.dice=[];

 room.held=[];

 room.target=null;

 room.phase='main';

 room.selected=[];

 room.message=
  'Gooi de dobbelstenen.';

}


/*
==================================================
 START BEURT
==================================================
*/

function startTurn(room){

 room.dice=[];

 room.held=[];

 room.target=null;

 room.phase='main';

 room.selected=[];

 room.message=
  'Gooi de dobbelstenen.';

}


/*
==================================================
 DOBBELSTENEN GOOIEN
==================================================
*/

function roll(room){

 const old=
  room.dice||[];

 const result=[];

 for(
  let i=0;
  i<5;
  i++
 ){

  if(
   room.held.includes(i)
  ){

   result[i]=
    old[i];

  }else{

   result[i]=
    rollOne();

  }

 }

 room.dice=
  result;

}


/*
==================================================
 ROL BEOORDELEN
==================================================
*/

function evaluateRoll(room){

 const dice=
  room.dice;

 /*
  VOLLE BAK
 */

 if(
  fullBak(dice)
 ){

  room.target=6;

  room.phase='earn';

  room.held=[
   0,1,2,3,4
  ];

  room.message=
   'VOLLE BAK! Doel 6.';

  return;

 }


 const total=
  dice.reduce(
   (a,b)=>a+b,
   0
  );


 /*
  11
 */

 if(
  total===11
 ){

  payoutToOpponents(
   room,
   room.players[room.current],
   0.5
  );

  room.message=
   '11! Je betaalt €0,50 aan iedere tegenstander. Beurt voorbij.';

  setTimeout(
   ()=>{

    if(
     rooms.has(room.code)
    ){

     nextTurn(room);

    }

   },
   400
  );

  return;

 }


 /*
  24
 */

 if(
  total===24
 ){

  payoutToOpponents(
   room,
   room.players[room.current],
   0.5
  );

  room.message=
   '24! Je betaalt €0,50 aan iedere tegenstander. Beurt voorbij.';

  setTimeout(
   ()=>{

    if(
     rooms.has(room.code)
    ){

     nextTurn(room);

    }

   },
   400
  );

  return;

 }


 const target=
  targetFromTotal(total);


 /*
  MIS
 */

 if(!target){

  room.message=
   'MIS! Geen geldig doel. Beurt voorbij.';

  setTimeout(
   ()=>{

    if(
     rooms.has(room.code)
    ){

     nextTurn(room);

    }

   },
   400
  );

  return;

 }


 room.target=
  target;

 room.message=
  'Doel '+target+
  '. Selecteer de dobbelstenen die je wilt vasthouden.';

}


/*
==================================================
 ACTIE
==================================================
*/

function doAction(
 room,
 player,
 action,
 selected
){

 if(
  room.players[room.current]!==player
 ){

  throw new Error(
   'Je bent niet aan de beurt.'
  );

 }


 /*
  MAIN
 */

 if(
  room.phase==='main'
 ){

  /*
   BEGIN WORP
  */

  if(
   action==='begin' &&
   room.dice.length===0
  ){

   roll(room);

   evaluateRoll(room);

   return;

  }


  /*
   VASTHOUDEN
  */

  if(
   action==='hold' &&
   room.dice.length===5
  ){

   const selectedClean=
    (selected||[])
     .filter(
      i=>
       Number.isInteger(i)&&
       i>=0&&
       i<5
     );


   room.held=[
    ...new Set(
     [
      ...room.held,
      ...selectedClean
     ]
    )
   ].sort(
    (a,b)=>a-b
   );


   /*
    Als er doelstenen zijn,
    betalen we die uit.

    Alleen nieuwe doelstenen
    worden betaald.
   */

   if(
    room.target
   ){

    const newTargets=
     selectedClean.filter(
      i=>
       room.dice[i]===
       room.target &&
       !room.paidHeld.includes(i)
     );


    if(
     newTargets.length
    ){

     const amount=
      euroAmount(
       room.target,
       newTargets.length
      );

     payoutToOpponents(
      room,
      player,
      amount
     );

     room.paidHeld=[
      ...room.paidHeld,
      ...newTargets
     ];

     room.message=
      'Uitbetaling: '+
      euro(amount);

    }

   }

   return;

  }


  /*
   OPNIEUW GOOIEN
  */

  if(
   action==='reroll' &&
   room.dice.length===5
  ){

   if(
    room.held.length===5
   ){

    room.phase='earn';

    room.message=
     'Alle dobbelstenen zijn vastgehouden. Klik AKKOORD.';

    return;

   }

   roll(room);

   evaluateRoll(room);

   return;

  }


  /*
   ANNULEREN
  */

  if(
   action==='undo'
  ){

   room.held=[];

   room.paidHeld=[];

   room.message=
    'Vasthouden geannuleerd.';

   return;

  }

 }


 /*
  EARN
 */

 if(
  room.phase==='earn'
 ){

  if(
   action==='accept'
  ){

   room.message=
    'Beurt akkoord.';

   nextTurn(room);

   return;

  }


  if(
   action==='undo'
  ){

   room.held=[];

   room.paidHeld=[];

   room.phase='main';

   room.message=
    'Vasthouden geannuleerd.';

   return;

  }

 }

}


/*
==================================================
 PUBLIEKE STATUS
==================================================
*/

function publicState(
 room,
 token
){

 return {

  code:room.code,

  started:room.started,

  players:
   room.players.map(
    (p,i)=>({

     index:i,

     name:p.name,

     money:p.money,

     admin:p.admin,

     me:
      p.token===token

    })
   ),

  current:
   room.current,

  phase:
   room.phase,

  dice:
   room.dice,

  held:
   room.held,

  target:
   room.target,

  message:
   room.message,

  chat:
   room.chat.slice(-50)

 };

}


/*
==================================================
 HTTP SERVER
==================================================
*/

const server=
 http.createServer(
  async(req,res)=>{

   try{

    const url=
     new URL(
      req.url,
      'http://localhost'
     );


    /*
     HEALTH
    */

    if(
     req.method==='GET' &&
     url.pathname==='/health'
    ){

     return send(
      res,
      200,
      {
       ok:true
      }
     );

    }


    /*
     HOME
    */

    if(
     req.method==='GET' &&
     url.pathname==='/'
    ){

     res.writeHead(
      200,
      {
       'Content-Type':
        'text/html; charset=utf-8'
      }
     );

     return res.end(
      HTML
     );

    }


    /*
     KAMER MAKEN
    */

    if(
     req.method==='POST' &&
     url.pathname==='/api/create'
    ){

     const data=
      await body(req);

     const name=
      cleanName(
       data.name
      );

     if(!name){

      return send(
       res,
       400,
       {
        error:
         'Naam ontbreekt.'
       }
      );

     }


     const room=
      roomCode();

     const playerToken=
      id();


     const game={
      code:room,

      started:false,

      players:[
       {
        token:playerToken,

        name:name,

        money:0,

        admin:true
       }
      ],

      current:0,

      phase:'main',

      dice:[],

      held:[],

      paidHeld:[],

      selected:[],

      target:null,

      message:
       'Wacht op minimaal 2 spelers.',

      chat:[]

     };


     rooms.set(
      room,
      game
     );

     sessions.set(
      playerToken,
      {
       room
      }
     );


     return send(
      res,
      200,
      {
       room,

       playerToken
      }
     );

    }


    /*
     MEEDOEN
    */

    if(
     req.method==='POST' &&
     url.pathname==='/api/join'
    ){

     const data=
      await body(req);

     const roomCodeValue=
      String(
       data.room||''
      )
      .trim()
      .toUpperCase();

     const name=
      cleanName(
       data.name
      );

     const room=
      rooms.get(
       roomCodeValue
      );


     if(!room){

      return send(
       res,
       404,
       {
        error:
         'Kamer niet gevonden.'
       }
      );

     }


     if(
      room.started
     ){

      return send(
       res,
       400,
       {
        error:
         'Het spel is al gestart.'
       }
      );

     }


     if(
      room.players.length>=4
     ){

      return send(
       res,
       400,
       {
        error:
         'Deze kamer zit vol.'
       }
      );

     }


     if(!name){

      return send(
       res,
       400,
       {
        error:
         'Naam ontbreekt.'
       }
      );

     }


     const playerToken=
      id();


     room.players.push(
      {
       token:playerToken,

       name:name,

       money:0,

       admin:false
      }
     );


     sessions.set(
      playerToken,
      {
       room:roomCodeValue
      }
     );


     room.chat.push(
      {
       name:'Systeem',

       text:
        name+
        ' is toegetreden.'
      }
     );


     return send(
      res,
      200,
      {
       room:
        roomCodeValue,

       playerToken
      }
     );

    }


    /*
     STATUS
    */

    if(
     req.method==='GET' &&
     url.pathname==='/api/state'
    ){

     const playerToken=
      url.searchParams.get(
       'token'
      );

     const room=
      getRoomByToken(
       playerToken
      );


     if(!room){

      return send(
       res,
       401,
       {
        error:
         'Sessie verlopen.'
       }
      );

     }


     return send(
      res,
      200,
      publicState(
       room,
       playerToken
      )
     );

    }


    /*
     START
    */

    if(
     req.method==='POST' &&
     url.pathname==='/api/start'
    ){

     const data=
      await body(req);

     const room=
      getRoomByToken(
       data.token
      );

     if(!room){

      return send(
       res,
       401,
       {
        error:
         'Sessie verlopen.'
       }
      );

     }


     const player=
      room.players.find(
      
