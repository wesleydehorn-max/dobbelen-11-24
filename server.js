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
*{box-sizing:border-box}

body{
 margin:0;
 background:radial-gradient(circle at top,#14253b,#05080d 70%);
 color:#fff;
 font-family:Arial,sans-serif;
 min-height:100vh
}

.wrap{
 max-width:1000px;
 margin:auto;
 padding:22px
}

.logo{
 text-align:center;
 color:#ffd45a;
 font-size:34px;
 font-weight:900;
 letter-spacing:3px;
 text-shadow:0 2px 12px #000
}

.sub{
 text-align:center;
 color:#aaa;
 margin:5px 0 22px
}

.panel{
 background:rgba(12,18,27,.94);
 border:1px solid #354354;
 border-radius:18px;
 padding:20px;
 margin:12px 0;
 box-shadow:0 12px 35px #0008
}

.table{
 background:radial-gradient(circle,#116b43,#063c27 72%);
 border:7px solid #6e4b20;
 border-radius:28px;
 padding:20px;
 box-shadow:inset 0 0 50px #0008,0 12px 35px #000
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

button{
 border:0;
 border-radius:10px;
 padding:13px 17px;
 font-weight:900;
 cursor:pointer
}

.green{
 background:#18b968;
 color:#04140b
}

.gold{
 background:#e6b93d;
 color:#211700
}

.red{
 background:#d33b42;
 color:#fff
}

.blue{
 background:#287bdc;
 color:#fff
}

.gray{
 background:#47515e;
 color:#fff
}

button:disabled{
 opacity:.35;
 cursor:not-allowed
}

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

.error{
 color:#ff7777;
 font-weight:700
}

.players{
 display:grid;
 grid-template-columns:repeat(auto-fit,minmax(170px,1fr));
 gap:10px
}

.player{
 background:#101925;
 border:1px solid #3a4655;
 border-radius:12px;
 padding:12px
}

.player.me{
 border-color:#ffd45a
}

.player.turn{
 box-shadow:0 0 0 2px #18b968 inset
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
 background:linear-gradient(145deg,#fff,#c9c9c9);
 border:3px solid #8e8e8e;
 border-radius:15px;
 box-shadow:0 7px 13px #0008;
 display:grid;
 grid-template-columns:repeat(3,1fr);
 grid-template-rows:repeat(3,1fr);
 padding:9px;
 cursor:pointer
}

.die.held{
 border:4px solid #ffd45a;
 transform:translateY(-5px);
 box-shadow:0 0 18px #ffd45a88,0 7px 13px #0008
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

let S=null;

const qs=new URLSearchParams(location.search);

const invite=(qs.get('join')||'').toUpperCase();

const roomCode=(qs.get('room')||'').toUpperCase();

const app=document.getElementById('app');


function esc(s){
 return String(s??'').replace(/[&<>"']/g,m=>({
  '&':'&amp;',
  '<':'&lt;',
  '>':'&gt;',
  '"':'&quot;',
  "'":'&#39;'
 }[m]));
}


function euro(n){
 return '€'+Number(n||0).toFixed(2).replace('.',',');
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
 }catch{}

 if(!r.ok){
  throw new Error(j.error||'Er ging iets mis');
 }

 return j;
}


function token(){
 return sessionStorage.getItem(KEY)||'';
}


function home(){

 app.innerHTML=

 '<section class="panel center">'+
 '<div class="title">NIEUW SPEL</div>'+
 '<div class="row">'+
 '<input id="name" class="input" maxlength="20" placeholder="Jouw naam">'+
 '<button class="green" onclick="createRoom()">KAMER MAKEN</button>'+
 '</div>'+
 '</section>'+

 '<section class="panel center">'+
 '<div class="title">MEESPELEN</div>'+
 '<div class="row">'+
 '<input id="code" class="input" maxlength="8" placeholder="Kamercode">'+
 '<input id="jname2" class="input" maxlength="20" placeholder="Jouw naam">'+
 '<button class="gold" onclick="joinManual()">MEEDOEN</button>'+
 '</div>'+
 '</section>'+

 '<section class="panel small center">'+
 'Maximaal 4 spelers • Iedere speler start met €100,00'+
 '</section>';
}


async function createRoom(){

 const name=document.getElementById('name').value.trim();

 if(!name){
  return alert('Vul je naam in.');
 }

 try{

  const r=await api(
   '/api/create',
   {
    method:'POST',
    body:JSON.stringify({name})
   }
  );

  sessionStorage.setItem(KEY,r.playerToken);

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

 const room=document
  .getElementById('code')
  .value
  .trim()
  .toUpperCase();

 const name=document
  .getElementById('jname2')
  .value
  .trim();

 if(!room||!name){
  return alert('Vul kamercode en naam in.');
 }

 await doJoin(room,name);
}


async function joinRoom(){

 const name=document
  .getElementById('jname')
  .value
  .trim();

 if(!name){
  return alert('Vul je naam in.');
 }

 await doJoin(invite,name);
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

 }catch(e){
  alert(e.message);
 }
}


function die(n,i,held){

 const p=Array
  .from(
   {length:n},
   ()=>'<i class="pip"></i>'
  )
  .join('');

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
  home();
  return;
 }

 const me=S.players.find(
  p=>p.me
 );

 const admin=me&&me.admin;

 let h=

 '<section class="panel">'+

 '<div class="row">'+

 '<div>'+
 '<b>KAMER '+esc(S.code)+'</b>'+
 '<div class="small">'+
 (S.started?'Spel bezig':'Wachten op spelers')+
 '</div>'+
 '</div>'+

 '<div style="margin-left:auto">'+
 '<button class="gray" onclick="copyInvite()">'+
 'UITNODIGING KOPIËREN'+
 '</button>'+
 '</div>'+

 '</div>';


 if(!S.started){

  h+=

  '<div class="invite">'+
  esc(location.origin+'/?join='+S.code)+
  '</div>'+

  '<div class="players">';

  S.players.forEach(p=>{

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

  });

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

  S.players.forEach(p=>{

   h+=

   '<div class="player '+
   (p.me?'me ':'')+
   (p.index===S.current?'turn':'')+
   '">' +

   '<b>'+
   esc(p.name)+
   '</b>'+

   (p.admin?' 👑':'')+
   (p.index===S.current?' 🎲':'')+

   '<div class="money">'+
   euro(p.money)+
   '</div>'+

   '</div>';

  });

  h+='</div></section>';

  h+=

  '<section class="table">';

  const cur=S.players[S.current];

  h+=

  '<div class="status">'+
  esc(cur?cur.name:'')+
  (cur&&cur.me?
   ' — JIJ BENT AAN DE BEURT':
   '')+
  '</div>';

  if(S.phase==='earn'){

   h+=
   '<div class="target">'+
   'DOEL: '+
   S.target+
   ' • VASTGEHOUDEN DICE WORDEN UITBETAALD'+
   '</div>';

  }

  if(S.message){

   h+=
   '<div class="status">'+
   esc(S.message)+
   '</div>';

  }

  h+='<div class="dice">';

  (S.dice||[]).forEach(
   (d,i)=>
    h+=die(
     d,
     i,
     (S.held||[]).includes(i)
    )
  );

  h+='</div>';

  h+='<div class="actions">';

  if(cur&&cur.me){

   if(
    S.phase==='main' &&
    !(S.dice||[]).length
   ){

    h+=
    '<button class="green" onclick="action(\'begin\')">'+
    'BEGIN WORP'+
    '</button>';

   }

   if(
    S.phase==='main' &&
    (S.dice||[]).length
   ){

    h+=
    '<button class="gold" onclick="action(\'hold\')">'+
    'VASTHOUDEN'+
    '</button>'+

    '<button class="blue" onclick="action(\'reroll\')">'+
    'OPNIEUW GOOIEN'+
    '</button>'+

    '<button class="red" onclick="action(\'undo\')">'+
    'VASTHOUDEN ANNULEREN'+
    '</button>';

   }

   if(S.phase==='earn'){

    h+=
    '<button class="green" onclick="action(\'accept\')">'+
    'AKKOORD'+
    '</button>'+

    '<button class="red" onclick="action(\'undo\')">'+
    'VASTHOUDEN ANNULEREN'+
    '</button>';

   }

  }

  h+='</div></section>';
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

 '<input id="chatin" class="input" maxlength="200" placeholder="Typ een bericht…" onkeydown="if(event.key===\'Enter\')sendChat()">'+

 '<button class="gold" onclick="sendChat()">'+
 'VERSTUUR'+
 '</button>'+

 '</div>'+

 '</section>';


 app.innerHTML=h;

 const c=document.getElementById('chat');

 if(c){
  c.scrollTop=c.scrollHeight;
 }
}


async function refresh(){

 const t=token();

 if(!t){

  if(invite){
   showInvite();
   return;
  }

  home();
  return;
 }

 try{

  S=await api(
   '/api/state?token='+
   encodeURIComponent(t)
  );

  render();

 }catch(e){

  sessionStorage.removeItem(KEY);

  S=null;

  if(invite){
   showInvite();
  }else{
   home();
  }
 }
}


function showInvite(){

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

 '<input id="jname" class="input" maxlength="20" placeholder="Jouw naam">'+

 '<button class="green" onclick="joinRoom()">'+
 'MEEDOEN'+
 '</button>'+

 '</div>'+

 '</section>';
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

  S.selected=[];

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

 S.selected=S.selected||[];

 const x=S.selected.indexOf(i);

 if(x>=0){
  S.selected.splice(x,1);
 }else{
  S.selected.push(i);
 }

 render();
}


async function sendChat(){

 const el=document.getElementById('chatin');

 if(!el||!el.value.trim()){
  return;
 }

 try{

  await api(
   '/api/chat',
   {
    method:'POST',
    body:JSON.stringify({
     token:token(),
     text:el.value.trim()
    })
   }
  );

  el.value='';

  await refresh();

 }catch(e){
  alert(e.message);
 }
}


function copyInvite(){

 const link=
  location.origin+
  '/?join='+
  S.code;

 if(navigator.clipboard){

  navigator.clipboard.writeText(link);

 }

 alert('Uitnodiging gekopieerd!');
}


/*
 BELANGRIJK:

 Op een uitnodigingspagina wordt NIET automatisch
 elke 1,2 seconde refresh() uitgevoerd.

 Daardoor blijft het uitnodigingsscherm staan.
*/

if(invite && !token()){

 showInvite();

}else{

 refresh();

 setInterval(
  refresh,
  1200
 );

}

</script>
</body>
</html>`;


function id(){
 return crypto.randomBytes(12).toString('hex');
}


function code(){

 let c;

 do{
  c=crypto
   .randomBytes(3)
   .toString('hex')
   .toUpperCase();
 }
 while(rooms.has(c));

 return c;
}


function playerFor(token){
 return sessions.get(token);
}


function getRoomByToken(token){

 const x=playerFor(token);

 return x ? rooms.get(x.room) : null;
}


function publicState(room,token){

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

     me:p.token===token

    })
   ),

  current:room.current,

  phase:room.phase,

  dice:room.dice,

  held:room.held,

  target:room.target,

  message:room.message,

  chat:room.chat.slice(-50)

 };

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
    d=>s+=d
   );

   req.on(
    'end',
    ()=>{
     try{
      resolve(
       s ? JSON.parse(s) : {}
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

 return String(n||'')
  .trim()
  .slice(0,20);

}


function nextTurn(room){

 if(room.players.length===0){
  return;
 }

 let n=room.current;

 for(
  let z=0;
  z<room.players.length;
  z++
 ){

  n=(n+1)%room.players.length;

  if(room.players[n].money>0){

   room.current=n;

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


function rollOne(){

 return 1+
  Math.floor(
   Math.random()*6
  );

}


function roll(room){

 room.dice=
  room.dice.map(
   (d,i)=>
    room.held.includes(i)
     ?d
     :rollOne()
  );

 while(
  room.dice.length<5
 ){

  room.dice.push(
   rollOne()
  );

 }

}


function full(d){

 return d.length===5 &&
  d.every(
   x=>x===d[0]
  );

}


/*
 5  -> 6
 6  -> 5
 7  -> 4
 8  -> 3
 9  -> 2
 10 -> 1

 11 -> speciaal

 12 -> 1
 13 -> 2
 14 -> 3
 15 -> 4
 16 -> 5
 17 -> 6
 18 -> 6
 19 -> 5
 20 -> 4
 21 -> 3
 22 -> 2
 23 -> 1

 24 -> speciaal

 25 -> 1
 26 -> 2
 27 -> 3
 28 -> 4
 29 -> 5
 30 -> 6
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
  total<=23
 ){
  return Math.min(
   total-11,
   24-total
  );
 }

 if(
  total>=25 &&
  total<=30
 ){
  return total-24;
 }

 return null;
}


function moneyForTarget(t){

 return t*0.5;
}


function payout(room,p,amount){

 const others=
  room.players.filter(
   x=>
    x!==p &&
    x.money>0
  );

 for(
  const o of others
 ){

  const pay=
   Math.min(
    amount,
    p.money
   );

  p.money-=pay;

  o.money+=pay;

  if(p.money<=0){
   break;
  }

 }

}


function startTurn(room){

 room.dice=[];

 room.held=[];

 room.selected=[];

 room.target=null;

 room.phase='main';

 room.message=
  'Gooi de dobbelstenen.';

}


function evaluateRoll(room){

 const d=room.dice;

 /*
  VOLLE BAK
 */

 if(full(d)){

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
  d.reduce(
   (a,b)=>a+b,
   0
  );


 /*
  11 EN 24
 */

 if(
  total===11 ||
  total===24
 ){

  payout(
   room,
   room.players[room.current],
   0.5
  );

  room.message=
   '11/24! €0,50 naar iedere tegenstander. Beurt voorbij.';

  setTimeout(
   ()=>{
    if(rooms.has(room.code)){
     nextTurn(room);
    }
   },
   250
  );

  return;
 }


 const t=
  targetFromTotal(total);


 /*
  MIS
 */

 if(!t){

  room.message=
   'MIS! Geen geldig doel. Beurt voorbij.';

  setTimeout(
   ()=>{
    if(rooms.has(room.code)){
     nextTurn(room);
    }
   },
   250
  );

  return;
 }


 room.target=t;

 room.message=
  'Doel '+
  t+
  '. Selecteer de dobbelstenen die je wilt vasthouden.';

}


function action(
 room,
 p,
 a,
 selected
){

 if(
  room.players[room.current]!==p
 ){
  throw Error(
   'Je bent niet aan de beurt.'
  );
 }


 /*
  HOOFDFASE
 */

 if(room.phase==='main'){

  /*
   BEGIN WORP
  */

  if(
   a==='begin' &&
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
   a==='hold' &&
   room.dice.length
  ){

   const valid=
    (selected||[])
    .filter(
     i=>
      Number.isInteger(i)&&
      i>=0&&
      i<5&&
      !room.held.includes(i)
    );

   room.held=[
    ...new Set(
     [
      ...room.held,
      ...valid
     ]
    )
   ].sort(
    (a,b)=>a-b
   );


   /*
    Als er doelstenen zijn
    worden ze uitbetaald.

    Iedere pip is €0,50.
    Bijvoorbeeld:
    3 vieren = 3 x €2 = €6.
   */

   if(
    room.target &&
    room.held.length
   ){

    const matching=
     room.held.filter(
      i=>
       room.dice[i]===
       room.target
     ).length;

    if(matching){

     const amount=
      room.target*
      0.5*
      matching;

     payout(
      room,
      p,
      amount
     );

     room.message=
      'Vastgehouden doelstenen uitbetaald: '+
      euro(amount)+
      '.';
    }

   }

   return;
  }


  /*
   OPNIEUW GOOIEN
  */

  if(
   a==='reroll' &&
   room.dice.length
  ){

   if(
    room.held.length===5
   ){

    room.phase='earn';

    room.message=
     'Alle stenen zijn vastgehouden. Akkoord om de beurt af te sluiten.';

    return;
   }

   roll(room);

   evaluateRoll(room);

   return;
  }


  /*
   ANNULEREN
  */

  if(a==='undo'){

   room.held=[];

   room.message=
    'Vasthouden geannuleerd.';

   return;
  }

 }


 /*
  UITBETAALFASE
 */

 else if(
  room.phase==='earn'
 ){

  if(a==='accept'){

   room.message=
    'Beurt akkoord.';

   nextTurn(room);

   return;
  }


  if(a==='undo'){

   room.held=[];

   room.phase='main';

   room.message=
    'Vasthouden geannuleerd.';

   return;
  }

 }

}


const server=
 http.createServer(
  async(req,res)=>{

   try{

    const u=
     new URL(
      req.url,
      'http://localhost'
     );


    /*
     HEALTH
    */

    if(
     req.method==='GET' &&
     u.pathname==='/health'
    ){

     return send(
      res,
      200,
      {ok:true}
     );

    }


    /*
     HOMEPAGE
    */

    if(
     req.method==='GET' &&
     u.pathname==='/'
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
     u.pathname==='/api/create'
    ){

     const b=
      await body(req);

     const name=
      cleanName(b.name);

     if(!name){

      return send(
       res,
       400,
       {error:'Naam ontbreekt'}
      );

     }


     const c=code();

     const t=id();


     const room={

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

      selected:[],

      target:null,

      message:
       'Wacht op minimaal 2 spelers.',

      chat:[]

     };


     rooms.set(
      c,
      room
     );

     sessions.set(
      t,
      {room:c}
     );


     return send(
      res,
      200,
      {
       room:c,
       playerToken:t
      }
     );

    }


    /*
     MEESPELER
    */

    if(
     req.method==='POST' &&
     u.pathname==='/api/join'
    ){

     const b=
      await body(req);

     const c=
      String(
       b.room||''
      )
      .toUpperCase();

     const name=
      cleanName(b.name);

     const room=
      rooms.get(c);


     if(!room){

      return send(
       res,
       404,
       {
        error:
         'Kamer niet gevonden'
       }
      );

     }


     if(room.started){

      return send(
       res,
       400,
       {
        error:
         'Spel is al gestart'
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
         'Kamer is vol'
       }
      );

     }


     if(!name){

      return send(
       res,
       400,
       {
        error:
         'Naam ontbreekt'
       }
      );

     }


     const t=id();


     room.players.push({

      token:t,

      name,

      money:0,

      admin:false

     });


     sessions.set(
      t,
      {room:c}
     );


     room.chat.push({

      name:'Systeem',

      text:
       name+
       ' is toegetreden.'

     });


     return send(
      res,
      200,
      {
       room:c,
       playerToken:t
      }
     );

    }


    /*
     STATUS
    */

    if(
     req.method==='GET' &&
     u.pathname==='/api/state'
    ){

     const t=
      u.searchParams.get(
       'token'
      );

     const room=
      getRoomByToken(t);


     if(!room){

      return send(
       res,
       401,
       {
        error:
         'Sessie verlopen'
       }
      );

     }


     return send(
      res,
      200,
      publicState(
       room,
       t
      )
     );

    }


    /*
     START SPEL
    */

    if(
     req.method==='POST' &&
     u.pathname==='/api/start'
    ){

     const b=
      await body(req);

     const room=
      getRoomByToken(
       b.token
      );

     const p=
      room &&
      room.players.find(
       x=>x.token===b.token
      );


     if(!room||!p){

      return send(
       res,
       401,
       {
        error:
         'Sessie verlopen'
       }
      );

     }


     if(!p.admin){

      return send(
       res,
       403,
       {
        error:
         'Alleen de beheerder kan starten'
       }
      );

     }


     if(
      room.players.length<2
     ){

      return send(
       res,
       400,
       {
        error:
         'Minimaal 2 spelers nodig'
       }
      );

     }


     room.started=true;


     room.players.forEach(
      x=>{
       x.money=100;
      }
     );


     room.current=0;


     startTurn(room);


     room.chat.push({

      name:'Systeem',

      text:
       'Het spel is gestart. Iedereen begint met €100,00.'

     });


     return send(
      res,
      200,
      {ok:true}
     );

    }


    /*
     SPELACTIE
    */

    if(
     req.method==='POST' &&
     u.pathname==='/api/action'
    ){

     const b=
      await body(req);

     const room=
      getRoomByToken(
       b.token
      );

     const p=
      room &&
      room.players.find(
       x=>x.token===b.token
      );


     if(!room||!p){

      return send(
       res,
       401,
       {
        error:
         'Sessie verlopen'
       }
      );

     }


     if(!room.started){

      return send(
       res,
       400,
       {
        error:
         'Spel is nog niet gestart'
       }
      );

     }


     action(
      room,
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


    /*
     CHAT
    */

    if(
     req.method==='POST' &&
     u.pathname==='/api/chat'
    ){

     const b=
      await body(req);

     const room=
      getRoomByToken(
       b.token
      );

     const p=
      room &&
      room.players.find(
       x=>x.token===b.token
      );


     if(!room||!p){

      return send(
       res,
       401,
       {
        error:
         'Sessie verlopen'
       }
      );

     }


     const text=
      String(
       b.text||''
      )
      .trim()
      .slice(0,200);


     if(text){

      room.chat.push({

       name:p.name,

       text

      });

     }


     return send(
      res,
      200,
      {ok:true}
     );

    }


    send(
     res,
     404,
     {
      error:
       'Niet gevonden'
     }
    );


   }catch(e){

    send(
     res,
     500,
     {
      error:
       e.message||
       'Serverfout'
     }
    );

   }

  }
 );


server.listen(
 PORT,
 ()=>console.log(
  'Dobbelen 11/24 draait op poort '+
  PORT
 )
);
