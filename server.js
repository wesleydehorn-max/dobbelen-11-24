const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 10000;
const rooms = new Map();

const EARN = {
  5: 6, 6: 5, 7: 4, 8: 3, 9: 2, 10: 1,
  25: 1, 26: 2, 27: 3, 28: 4, 29: 5, 30: 6
};

const PAY = {
  12: 1, 13: 2, 14: 3, 15: 4, 16: 5, 17: 6,
  18: 6, 19: 5, 20: 4, 21: 3, 22: 2, 23: 1
};

const HTML = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>🎲 DOBBELEN 11/24</title>

<style>
*{box-sizing:border-box}

html,body{
 margin:0;
 min-height:100%;
 font-family:Arial,sans-serif;
 background:#090107;
 color:#fff
}

body{
 background:
 radial-gradient(circle at 50% 10%,#4d001d 0,#130009 38%,#050005 100%);
 padding-bottom:85px
}

.wrap{
 max-width:900px;
 margin:auto;
 padding:18px 14px
}

.logo{
 text-align:center;
 font-weight:900;
 font-size:clamp(32px,8vw,64px);
 color:#ffd83d;
 text-shadow:0 0 12px #f00,3px 3px 0 #720018;
 margin:8px 0
}

.tag{
 text-align:center;
 letter-spacing:7px;
 color:#ffe9a0;
 font-size:14px;
 margin-bottom:22px
}

.card{
 background:rgba(20,3,13,.94);
 border:1px solid #8b173d;
 border-radius:18px;
 padding:18px;
 margin:12px 0;
 box-shadow:0 0 20px rgba(255,0,70,.16)
}

input{
 width:100%;
 padding:14px;
 border-radius:10px;
 border:1px solid #777;
 background:#fff;
 color:#111;
 font-size:18px;
 margin:7px 0
}

button{
 border:0;
 border-radius:11px;
 padding:13px 16px;
 font-size:17px;
 font-weight:800;
 cursor:pointer;
 margin:5px;
 background:#183b79;
 color:#fff
}

button.green{background:#159447}
button.red{background:#9e1831}
button.gold{background:#c8790c}
button.dark{background:#10264b}

button:disabled{
 opacity:.45;
 cursor:not-allowed
}

h2,h3{
 margin:6px 0 14px
}

.players{
 display:grid;
 grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
 gap:9px
}

.player{
 padding:12px;
 border-radius:12px;
 background:#170812;
 border:1px solid #5c1732
}

.player.me{
 border:2px solid #ffd43b
}

.money{
 font-size:22px;
 font-weight:900;
 color:#62ff8b
}

.dice-row{
 display:flex;
 gap:10px;
 justify-content:center;
 flex-wrap:wrap;
 margin:15px 0
}

.die{
 width:64px;
 height:64px;
 border-radius:12px;
 background:#f4f4f4;
 color:#c40028;
 display:grid;
 place-items:center;
 font-size:38px;
 font-weight:900;
 box-shadow:0 4px 0 #aaa;
 user-select:none
}

.die.held{
 background:#19a75a;
 color:#fff;
 box-shadow:0 0 0 4px #ffe03d,0 5px 0 #08753b;
 transform:translateY(-3px)
}

.total{
 text-align:center;
 font-size:30px;
 font-weight:900;
 margin:8px
}

.banner{
 text-align:center;
 font-size:25px;
 font-weight:900;
 padding:13px;
 border-radius:12px;
 background:#b5122e;
 box-shadow:0 0 18px rgba(255,0,0,.35);
 margin:12px 0
}

.chatlog{
 max-height:180px;
 overflow:auto;
 background:#07030a;
 border-radius:10px;
 padding:9px
}

.msg{
 padding:5px;
 border-bottom:1px solid #28101b
}

.rule{
 position:fixed;
 left:14px;
 bottom:14px;
 z-index:20;
 background:#10264b;
 border:1px solid #ffd63e;
 border-radius:18px;
 padding:10px 16px;
 font-size:16px;
 box-shadow:0 0 12px #000
}

.small{
 font-size:13px;
 color:#cdbdcc
}

.center{
 text-align:center
}

.code{
 font-size:30px;
 letter-spacing:7px;
 color:#ffd83d;
 font-weight:900
}

.actions{
 text-align:center
}

.status{
 padding:10px;
 border-radius:10px;
 background:#111;
 color:#ffe78b;
 margin:8px 0
}
</style>
</head>

<body>

<div class="wrap">

<div class="logo">🎲 DOBBELEN 11/24</div>

<div class="tag">
ONLINE MULTIPLAYER
</div>

<div id="app"></div>

</div>

<div class="rule">
🚩 Regel: 5 dezelfde = 6️⃣ verdienen
</div>

<script>
(function(){

'use strict';

var token=sessionStorage.getItem('d1124_token')||'';
var room=new URLSearchParams(location.search).get('room')||'';
var state=null;
var busy=false;
var lastRev=-1;

var app=document.getElementById('app');


function esc(s){
 return String(s||'').replace(/[&<>"']/g,function(c){
  return {
   '&':'&amp;',
   '<':'&lt;',
   '>':'&gt;',
   '"':'&quot;',
   "'":'&#39;'
  }[c];
 });
}


function api(path,method,body){

 return fetch(path,{
  method:method||'GET',
  headers:{
   'Content-Type':'application/json',
   'X-Token':token
  },
  body:body?JSON.stringify(body):undefined
 })
 .then(function(r){
  return r.json().then(function(x){
   if(!r.ok){
    throw new Error(x.error||'Fout');
   }
   return x;
  });
 });

}


function goHome(){

 history.replaceState({},'',location.pathname);

 room='';
 token='';

 sessionStorage.removeItem('d1124_token');

 state=null;
 lastRev=-1;

 home();
}


function create(){

 var n=document.getElementById('name').value.trim();

 if(!n){
  alert('Vul je naam in.');
  return;
 }

 api('/api/create','POST',{name:n})
 .then(function(x){

  token=x.token;
  room=x.room;

  sessionStorage.setItem('d1124_token',token);

  history.replaceState(
   {},
   '',
   location.pathname+'?room='+room
  );

  refresh(true);

 })
 .catch(function(e){
  alert(e.message);
 });

}


function join(){

 var n=document.getElementById('joinName').value.trim();
 var c=document.getElementById('joinCode').value.trim().toUpperCase();

 if(!n||!c){
  alert('Vul naam en spelcode in.');
  return;
 }

 api('/api/join','POST',{
  name:n,
  room:c
 })
 .then(function(x){

  token=x.token;
  room=c;

  sessionStorage.setItem('d1124_token',token);

  history.replaceState(
   {},
   '',
   location.pathname+'?room='+room
  );

  refresh(true);

 })
 .catch(function(e){
  alert(e.message);
 });

}


function start(){

 api('/api/action','POST',{
  action:'start'
 })
 .then(function(){
  refresh(true);
 })
 .catch(function(e){
  alert(e.message);
 });

}


function hold(i){

 api('/api/action','POST',{
  action:'hold',
  index:i
 })
 .then(function(){
  refresh(true);
 })
 .catch(function(e){
  alert(e.message);
 });

}


function roll(){

 api('/api/action','POST',{
  action:'roll'
 })
 .then(function(){
  refresh(true);
 })
 .catch(function(e){
  alert(e.message);
 });

}


function accept(){

 api('/api/action','POST',{
  action:'accept'
 })
 .then(function(){
  refresh(true);
 })
 .catch(function(e){
  alert(e.message);
 });

}


function undoHold(){

 api('/api/action','POST',{
  action:'undoHold'
 })
 .then(function(){
  refresh(true);
 })
 .catch(function(e){
  alert(e.message);
 });

}


function undoAccept(){

 api('/api/action','POST',{
  action:'undoAccept'
 })
 .then(function(){
  refresh(true);
 })
 .catch(function(e){
  alert(e.message);
 });

}


function sendChat(){

 var el=document.getElementById('chatInput');

 if(!el)return;

 var v=el.value.trim();

 if(!v)return;

 api('/api/action','POST',{
  action:'chat',
  text:v
 })
 .then(function(){

  el.value='';

  refresh(true);

 })
 .catch(function(e){
  alert(e.message);
 });

}


function pause(id){

 api('/api/action','POST',{
  action:'pause',
  id:id
 })
 .then(function(){
  refresh(true);
 })
 .catch(function(e){
  alert(e.message);
 });

}


function removePlayer(id){

 if(!confirm('Speler verwijderen?')){
  return;
 }

 api('/api/action','POST',{
  action:'remove',
  id:id
 })
 .then(function(){
  refresh(true);
 })
 .catch(function(e){
  alert(e.message);
 });

}


function home(){

 app.innerHTML=
 '<div class="card center">'+
 '<h2>NIEUW SPEL</h2>'+
 '<input id="name" maxlength="20" placeholder="Jouw naam" autocomplete="name">'+
 '<button class="green" onclick="create()">SPEL MAKEN</button>'+
 '</div>'+

 '<div class="card center">'+
 '<h2>OF MEEDOEN</h2>'+
 '<input id="joinName" maxlength="20" placeholder="Jouw naam" autocomplete="name">'+
 '<input id="joinCode" maxlength="6" placeholder="Spelcode" autocomplete="off">'+
 '<button onclick="join()">MEEDOEN</button>'+
 '</div>';

}


function lobby(){

 var list=state.players.map(function(p){

  return '<div class="player '+(p.id===state.me?'me':'')+'">'+
   '<b>'+esc(p.name)+'</b>'+
   '<div class="money">€'+p.money.toFixed(2)+'</div>'+
   '<div class="small">'+
   (p.active?'🟢 Actief':'⏸️ Pauze')+
   '</div>'+

   (
    state.admin===state.me &&
    p.id!==state.me

    ?

    '<button class="dark" onclick="pause(\\''+p.id+'\\')">'+
    (p.active?'PAUZE':'ACTIEF')+
    '</button>'+

    '<button class="red" onclick="removePlayer(\\''+p.id+'\\')">'+
    'VERWIJDER'+
    '</button>'

    :

    ''
   )+

   '</div>';

 }).join('');


 app.innerHTML=

 '<div class="card center">'+
 '<h2>WACHTRUIMTE</h2>'+
 '<div class="small">Spelcode</div>'+
 '<div class="code">'+esc(state.room)+'</div>'+
 '<p>Deel deze link met de andere spelers:</p>'+
 '<input readonly value="'+esc(location.href)+'" onclick="this.select()">'+
 '<button onclick="navigator.clipboard&&navigator.clipboard.writeText(location.href).then(function(){alert(\\'Link gekopieerd!\\')})">'+
 '📋 KOPIEER UITNODIGING'+
 '</button>'+
 '</div>'+

 '<div class="card">'+
 '<h3>Spelers ('+state.players.length+'/4)</h3>'+
 '<div class="players">'+list+'</div>'+
 '</div>'+

 (
  state.admin===state.me

  ?

  '<div class="card center">'+
  '<button class="green" onclick="start()">'+
  '🎲 START SPEL'+
  '</button>'+
  '</div>'

  :

  '<div class="card center status">'+
  'Wachten tot de beheerder het spel start…'+
  '</div>'
 )+

 chatHtml();

}


function chatHtml(){

 var msgs=(state.chat||[]).map(function(m){

  return '<div class="msg">'+
   '<b>'+esc(m.name)+':</b> '+
   esc(m.text)+
   '</div>';

 }).join('');


 return '<div class="card">'+
 '<h3>💬 CHAT</h3>'+
 '<div class="chatlog">'+
 (msgs||'<span class="small">Nog geen berichten.</span>')+
 '</div>'+
 '<input id="chatInput" maxlength="200" placeholder="Typ een bericht..." '+
 'onkeydown="if(event.key===\\'Enter\\'){sendChat();}">'+
 '<button onclick="sendChat()">VERSTUUR</button>'+
 '</div>';

}


function die(v){

 var dots=[
  '',
  '⚀',
  '⚁',
  '⚂',
  '⚃',
  '⚄',
  '⚅'
 ];

 return dots[v]||'⚀';

}


function game(){

 var dice=state.dice||[1,1,1,1,1];

 var ds=dice.map(function(v,i){

  var h=state.held&&state.held[i];

  return '<button class="die '+(h?'held':'')+'" '+
   'onclick="hold('+i+')" '+
   ((state.phase!=='main'||
     state.current!==state.me||
     h)
    ?'disabled':'')+
   '>'+
   die(v)+
   '</button>';

 }).join('');


 var banner='';

 if(state.direction==='earn'){
  banner='<div class="banner">VERDIENEN: '+state.target+'\\'EN</div>';
 }

 if(state.direction==='pay'){
  banner='<div class="banner">BETALEN: '+state.target+'\\'EN</div>';
 }


 var canRoll=
  state.current===state.me &&
  (
   state.phase==='target' ||
   (
    state.phase==='main' &&
    (
     !state.rolled ||
     state.heldCount>0
    )
   )
  );


 var canAccept=
  state.current===state.me &&
  state.phase==='main' &&
  state.rolled;


 var rollText=
  state.phase==='target'
   ?'🎲 DOORGOOIEN'
   :
   (
    !state.rolled
     ?'🎲 BEGIN WORP'
     :'🎲 OPNIEUW GOOIEN'
   );


 var status=
  state.current===state.me
   ?
   '👉 JIJ BENT AAN DE BEURT'
   :
   '⏳ '+esc(state.currentName)+' is aan de beurt';


 app.innerHTML=

 '<div class="card">'+

 banner+

 '<div class="status center">'+
 status+
 '</div>'+

 '<div class="dice-row">'+
 ds+
 '</div>'+

 '<div class="total">'+
 'TOTAAL: '+(state.total||0)+
 '</div>'+

 '<div class="actions">'+

 '<button class="gold" onclick="roll()" '+
 (canRoll?'':'disabled')+
 '>'+
 rollText+
 '</button>'+

 '<button class="dark" onclick="accept()" '+
 (canAccept?'':'disabled')+
 '>'+
 'AKKOORD'+
 '</button>'+

 '<button class="dark" onclick="undoHold()" '+
 (state.canUndoHold?'':'disabled')+
 '>'+
 '↩️ LAATSTE VASTZETTING TERUG'+
 '</button>'+

 '<button class="dark" onclick="undoAccept()" '+
 (state.canUndoAccept?'':'disabled')+
 '>'+
 '↩️ AKKOORD TERUG'+
 '</button>'+

 '</div>'+

 '</div>'+

 '<div class="card">'+
 '<h3>💰 SALDO</h3>'+
 '<div class="players">'+

 state.players.map(function(p){

  return '<div class="player '+(p.id===state.me?'me':'')+'">'+
   '<b>'+esc(p.name)+'</b>'+
   '<div class="money">€'+p.money.toFixed(2)+'</div>'+
   '</div>';

 }).join('')+

 '</div>'+
 '</div>'+

 chatHtml();

}


function refresh(force){

 if(!token){
  return;
 }

 busy=true;

 api('/api/state')
 .then(function(x){

  state=x;

  if(force||state.rev!==lastRev){

   lastRev=state.rev;

   if(state.phase==='lobby'){
    lobby();
   }else{
    game();
   }

  }

 })
 .catch(function(e){

  if(e.message==='Sessie verlopen'){
   goHome();
  }

 })
 .finally(function(){
  busy=false;
 });

}


window.create=create;
window.join=join;
window.start=start;
window.hold=hold;
window.roll=roll;
window.accept=accept;
window.undoHold=undoHold;
window.undoAccept=undoAccept;
window.sendChat=sendChat;
window.pause=pause;
window.removePlayer=removePlayer;


home();

if(token){
 refresh(true);
}

setInterval(function(){

 if(token&&!busy){
  refresh(false);
 }

},1000);

})();
</script>

</body>
</html>`;


function id(){
 return crypto.randomBytes(10).toString('hex');
}


function roomCode(){

 let c;

 do{
  c=crypto.randomBytes(3).toString('hex').toUpperCase();
 }while(rooms.has(c));

 return c;
}


function active(r){
 return r.players.filter(function(p){
  return p.active;
 });
}


function me(r,t){
 return r.players.find(function(p){
  return p.token===t;
 });
}


function same(a){
 return a.length===5 &&
        a.every(function(x){
         return x===a[0];
        });
}


function sum(a){
 return a.reduce(function(x,y){
  return x+y;
 },0);
}


function rnd(){
 return 1+Math.floor(Math.random()*6);
}


function money(n){
 return Math.round(n*100)/100;
}


function addLog(r,text){

 r.log.unshift(text);

 if(r.log.length>80){
  r.log.length=80;
 }

 r.rev++;
}


function nextPlayer(r){

 const ps=active(r);

 if(!ps.length){
  return;
 }

 const i=ps.findIndex(function(p){
  return p.id===r.current;
 });

 r.current=ps[
  (i<0?0:(i+1)%ps.length)
 ].id;

 r.currentName=
  ps.find(function(p){
   return p.id===r.current;
  }).name;
}


function transfer(r,pid,amount,dir){

 const sender=r.players.find(function(p){
  return p.id===pid;
 });

 if(!sender){
  return;
 }

 active(r).forEach(function(p){

  if(p.id===pid){
   return;
  }

  if(dir==='earn'){

   sender.money=money(sender.money+amount);
   p.money=money(p.money-amount);

  }else{

   sender.money=money(sender.money-amount);
   p.money=money(p.money+amount);

  }

 });

}


function classify(total){

 if(total===11||total===24){
  return {special:true};
 }

 if(total<11||total>30){
  return null;
 }

 if(EARN[total]){
  return {
   direction:'earn',
   target:EARN[total]
  };
 }

 if(PAY[total]){
  return {
   direction:'pay',
   target:PAY[total]
  };
 }

 return null;
}


function publicState(r,t){

 const p=me(r,t);

 if(!p){
  throw new Error('Sessie verlopen');
 }

 return {
  rev:r.rev,
  room:r.code,
  me:p.id,
  admin:r.admin,

  phase:r.phase,

  current:r.current,
  currentName:r.currentName,

  dice:r.dice,
  held:r.held,
  heldCount:r.held.filter(Boolean).length,

  rolled:r.rolled,

  total:sum(r.dice),

  direction:r.direction,
  target:r.target,

  canUndoHold:!!r.undoHold,
  canUndoAccept:!!r.undoAccept,

  players:r.players.map(function(x){
   return {
    id:x.id,
    name:x.name,
    money:x.money,
    active:x.active
   };
  }),

  chat:r.chat.slice(-30),
  log:r.log.slice(0,30)
 };

}


function newRoom(name){

 const code=roomCode();

 const token=id();

 const player={
  id:id(),
  token:token,
  name:name,
  money:100,
  active:true
 };

 const r={

  code:code,

  admin:player.id,

  players:[player],

  phase:'lobby',

  current:null,
  currentName:'',

  dice:[1,1,1,1,1],

  held:[
   false,
   false,
   false,
   false,
   false
  ],

  rolled:false,

  direction:null,
  target:null,

  chat:[],
  log:[],

  undoHold:null,
  undoAccept:null,

  rev:1
 };

 rooms.set(code,r);

 return {
  r:r,
  player:player
 };

}


function parseBody(req){

 return new Promise(function(resolve,reject){

  let b='';

  req.on('data',function(c){

   b+=c;

   if(b.length>10000){

    reject(new Error('Te veel data'));

    req.destroy();

   }

  });

  req.on('end',function(){

   try{

    resolve(
     b
      ?JSON.parse(b)
      :{}
    );

   }catch(e){

    reject(
     new Error('Ongeldige JSON')
    );

   }

  });

  req.on('error',reject);

 });

}


function send(res,status,obj){

 res.writeHead(
  status,
  {
   'Content-Type':
    'application/json; charset=utf-8',

   'Cache-Control':
    'no-store',

   'Access-Control-Allow-Origin':
    '*'
  }
 );

 res.end(
  JSON.stringify(obj)
 );

}


function errorMessage(e){

 return e&&e.message
  ?e.message
  :'Onbekende fout';

}


function action(r,p,body){

 const a=String(body.action||'');


 if(a==='chat'){

  const text=
   String(body.text||'')
    .trim()
    .slice(0,200);

  if(text){
   r.chat.push({
    name:p.name,
    text:text
   });
  }

  if(r.chat.length>50){
   r.chat.shift();
  }

  r.rev++;

  return;
 }


 if(a==='start'){

  if(r.admin!==p.id){
   throw new Error(
    'Alleen de beheerder kan starten.'
   );
  }

  if(r.phase!=='lobby'){
   throw new Error(
    'Het spel is al gestart.'
   );
  }

  const ps=active(r);

  if(!ps.length){
   throw new Error(
    'Geen actieve spelers.'
   );
  }


  let winner=null;

  while(!winner){

   const rolls=ps.map(function(x){

    return {
     p:x,
     v:rnd()
    };

   });

   const high=
    Math.max.apply(
     null,
     rolls.map(function(x){
      return x.v;
     })
    );

   const tied=
    rolls.filter(function(x){
     return x.v===high;
    });

   if(tied.length===1){
    winner=tied[0].p;
   }

  }


  r.phase='main';

  r.current=winner.id;
  r.currentName=winner.name;

  r.dice=[
   1,1,1,1,1
  ];

  r.held=[
   false,false,false,false,false
  ];

  r.rolled=false;

  r.direction=null;
  r.target=null;

  r.undoHold=null;
  r.undoAccept=null;

  addLog(
   r,
   '🎲 '+winner.name+' begint.'
  );

  return;

 }


 if(r.phase==='lobby'){

  throw new Error(
   'Wacht tot de beheerder het spel start.'
  );

 }


 if(r.current!==p.id){

  throw new Error(
   'Je bent niet aan de beurt.'
  );

 }


 if(!p.active){

  throw new Error(
   'Je staat op pauze.'
  );

 }


 if(a==='hold'){

  if(r.phase!=='main'||!r.rolled){

   throw new Error(
    'Gooi eerst.'
   );

  }

  const i=Number(body.index);

  if(
   !Number.isInteger(i)||
   i<0||
   i>4
  ){

   throw new Error(
    'Ongeldige dobbelsteen.'
   );

  }

  if(r.held[i]){

   throw new Error(
    'Deze steen staat al vast.'
   );

  }

  r.undoHold=
   r.held.slice();

  r.held[i]=true;

  r.rev++;

  return;

 }


 if(a==='undoHold'){

  if(
   r.phase!=='main'||
   !r.undoHold
  ){

   throw new Error(
    'Niets om terug te zetten.'
   );

  }

  r.held=
   r.undoHold.slice();

  r.undoHold=null;

  r.rev++;

  return;

 }


 if(a==='roll'){

  if(r.phase==='main'){

   if(
    r.rolled &&
    r.held.filter(Boolean).length===0
   ){

    throw new Error(
     'Zet minimaal 1 dobbelsteen vast.'
    );

   }


   r.undoAccept=null;


   for(let i=0;i<5;i++){

    if(!r.held[i]){
     r.dice[i]=rnd();
    }

   }


   r.rolled=true;

   r.rev++;

   return;

  }


  if(r.phase==='target'){

   if(r.held.every(Boolean)){

    r.held=[
     false,false,false,false,false
    ];

   }


   let hits=0;


   for(let i=0;i<5;i++){

    if(!r.held[i]){
     r.dice[i]=rnd();
    }

   }


   for(let i=0;i<5;i++){

    if(
     !r.held[i] &&
     r.dice[i]===r.target
    ){

     r.held[i]=true;

     hits++;

     transfer(
      r,
      p.id,
      r.target*0.5,
      r.direction
     );

    }

   }


   if(hits===0){

    addLog(
     r,
     '❌ Geen nieuwe '+r.target+
     ' gegooid. Beurt voorbij.'
    );

    r.phase='main';

    r.direction=null;
    r.target=null;

    r.rolled=false;

    r.held=[
     false,false,false,false,false
    ];

    r.undoHold=null;
    r.undoAccept=null;

    nextPlayer(r);

    return;

   }


   addLog(
    r,
    '💰 '+p.name+
    ' '+(
     r.direction==='earn'
      ?'verdient '
      :'betaalt '
    )+
    (hits*r.target*0.5).toFixed(2)+
    ' euro.'
   );

   r.rev++;

   return;

  }


  throw new Error(
   'Ongeldige fase.'
  );

 }


 if(a==='accept'){

  if(
   r.phase!=='main'||
   !r.rolled
  ){

   throw new Error(
    'Gooi eerst.'
   );

  }


  const total=sum(r.dice);


  if(total===11||total===24){

   transfer(
    r,
    p.id,
    0.50,
    'pay'
   );

   addLog(
    r,
    p.name+
    ' betaalt €0,50 per actieve tegenstander.'
   );

   r.undoAccept=null;

   r.held=[
    false,false,false,false,false
   ];

   r.rolled=false;

   nextPlayer(r);

   return;

  }


  const c=classify(total);


  if(!c){

   throw new Error(
    'Deze combinatie is niet geldig.'
   );

  }


  let target=c.target;


  if(same(r.dice)){
   target=6;
  }


  r.direction=c.direction;

  r.target=target;

  r.phase='target';


  r.held=[
   false,false,false,false,false
  ];


  addLog(
   r,
   (
    c.direction==='earn'
     ?'VERDIENEN'
     :'BETALEN'
   )+
   ': '+target+'-en.'
  );


  r.rev++;

  return;

 }


 if(a==='undoAccept'){

  if(!r.undoAccept){

   throw new Error(
    'Geen akkoord om terug te zetten.'
   );

  }

  const u=r.undoAccept;

  r.phase=u.phase;

  r.dice=u.dice.slice();

  r.held=u.held.slice();

  r.rolled=u.rolled;

  r.direction=u.direction;

  r.target=u.target;

  r.undoAccept=null;

  r.rev++;

  return;

 }


 if(a==='pause'){

  if(r.admin!==p.id){

   throw new Error(
    'Alleen de beheerder.'
   );

  }

  const q=r.players.find(function(x){
   return x.id===body.id;
  });


  if(!q){

   throw new Error(
    'Speler niet gevonden.'
   );

  }


  q.active=!q.active;


  if(
   !q.active &&
   r.current===q.id
  ){

   nextPlayer(r);

  }


  r.rev++;

  return;

 }


 if(a==='remove'){

  if(r.admin!==p.id){

   throw new Error(
    'Alleen de beheerder.'
   );

  }


  const q=r.players.find(function(x){
   return x.id===body.id;
  });


  if(
   !q||
   q.id===r.admin
  ){

   throw new Error(
    'Speler kan niet worden verwijderd.'
   );

  }


  r.players=
   r.players.filter(function(x){
    return x.id!==q.id;
   });


  if(r.current===q.id){
   nextPlayer(r);
  }


  r.rev++;

  return;

 }


 throw new Error(
  'Onbekende actie.'
 );

}


const server=http.createServer(
 async function(req,res){

  try{

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

    res.end();

    return;

   }


   if(req.url==='/'){

    res.writeHead(
     200,
     {
      'Content-Type':
       'text/html; charset=utf-8',

      'Cache-Control':
       'no-store'
     }
    );

    res.end(HTML);

    return;

   }


   if(
    req.url==='/api/create' &&
    req.method==='POST'
   ){

    const b=await parseBody(req);

    const name=
     String(b.name||'')
      .trim()
      .slice(0,20);


    if(!name){

     throw new Error(
      'Vul je naam in.'
     );

    }


    const x=newRoom(name);


    send(
     res,
     200,
     {
      room:x.r.code,
      token:x.player.token
     }
    );

    return;

   }


   if(
    req.url==='/api/join' &&
    req.method==='POST'
   ){

    const b=await parseBody(req);

    const name=
     String(b.name||'')
      .trim()
      .slice(0,20);

    const code=
     String(b.room||'')
      .trim()
      .toUpperCase();

    const r=rooms.get(code);


    if(!name){

     throw new Error(
      'Vul je naam in.'
     );

    }


    if(!r){

     throw new Error(
      'Spel bestaat niet meer.'
     );

    }


    if(r.phase!=='lobby'){

     throw new Error(
      'Het spel is al gestart.'
     );

    }


    if(r.players.length>=4){

     throw new Error(
      'Dit spel zit vol.'
     );

    }


    const player={
     id:id(),
     token:id(),
     name:name,
     money:100,
     active:true
    };


    r.players.push(player);

    r.rev++;


    send(
     res,
     200,
     {
      room:code,
      token:player.token
     }
    );

    return;

   }


   if(
    req.url==='/api/state' &&
    req.method==='GET'
   ){

    const t=
     req.headers['x-token']||'';

    const r=
     Array.from(rooms.values())
      .find(function(x){
       return !!me(x,t);
      });


    if(!r){

     throw new Error(
      'Sessie verlopen'
     );

    }


    send(
     res,
     200,
     publicState(r,t)
    );

    return;

   }


   if(
    req.url==='/api/action' &&
    req.method==='POST'
   ){

    const t=
     req.headers['x-token']||'';

    const r=
     Array.from(rooms.values())
      .find(function(x){
       return !!me(x,t);
      });


    if(!r){

     throw new Error(
      'Sessie verlopen'
     );

    }


    const p=me(r,t);

    const b=await parseBody(req);

    action(r,p,b);

    send(
     res,
     200,
     {ok:true}
    );

    return;

   }


   if(req.url==='/health'){

    send(
     res,
     200,
     {ok:true}
    );

    return;

   }


   res.writeHead(404);

   res.end('Not found');


  }catch(e){

   send(
    res,
    400,
    {
     error:errorMessage(e)
    }
   );

  }

 });


server.listen(
 PORT,
 '0.0.0.0',
 function(){

  console.log(
   'Dobbelen 11/24 draait op poort '+PORT
  );

 }
);
