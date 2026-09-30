const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 10000;
const rooms = new Map();

const EARN = {
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

const PAY = {
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

const HTML = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>🎲 DOBBELEN 11/24</title>

<style>
*{
  box-sizing:border-box;
}

html,body{
  margin:0;
  min-height:100%;
  font-family:Arial,sans-serif;
  background:#090107;
  color:#fff;
}

body{
  background:
    radial-gradient(circle at 50% 5%,#60001f 0,#23000e 28%,#0b0107 72%,#050005 100%);
  padding-bottom:90px;
}

.wrap{
  max-width:900px;
  margin:auto;
  padding:18px 14px;
}

.logo{
  text-align:center;
  font-weight:900;
  font-size:clamp(32px,8vw,64px);
  color:#ffd83d;
  text-shadow:
    0 0 12px #ff0000,
    3px 3px 0 #720018;
  margin:8px 0;
}

.tag{
  text-align:center;
  letter-spacing:7px;
  color:#ffe9a0;
  font-size:14px;
  margin-bottom:22px;
}

.card{
  background:rgba(20,3,13,.94);
  border:1px solid #8b173d;
  border-radius:18px;
  padding:18px;
  margin:12px 0;
  box-shadow:0 0 20px rgba(255,0,70,.16);
}

input{
  width:100%;
  padding:14px;
  border-radius:10px;
  border:1px solid #777;
  background:#fff;
  color:#111;
  font-size:18px;
  margin:7px 0;
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
  color:#fff;
}

button.green{
  background:#159447;
}

button.red{
  background:#9e1831;
}

button.gold{
  background:#c8790c;
}

button.dark{
  background:#10264b;
}

button:disabled{
  opacity:.45;
}

h2,h3{
  margin:6px 0 14px;
}

.players{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
  gap:9px;
}

.player{
  padding:12px;
  border-radius:12px;
  background:#170812;
  border:1px solid #5c1732;
}

.player.me{
  border:2px solid #ffd43b;
}

.money{
  font-size:22px;
  font-weight:900;
  color:#62ff8b;
}

.dice-row{
  display:flex;
  gap:16px;
  justify-content:center;
  flex-wrap:wrap;
  margin:20px 0;
}

.die{
  width:72px;
  height:72px;
  border-radius:13px;
  background:linear-gradient(145deg,#fff,#e9e9e9);
  color:#c40028;
  display:grid;
  grid-template-columns:repeat(3,1fr);
  grid-template-rows:repeat(3,1fr);
  padding:10px;
  box-shadow:
    0 5px 0 #aaa,
    0 8px 12px rgba(0,0,0,.35);
  user-select:none;
  position:relative;
}

.die:disabled{
  opacity:1;
}

.pip{
  width:13px;
  height:13px;
  border-radius:50%;
  background:#c40028;
  box-shadow:inset 1px 1px 2px rgba(0,0,0,.25);
  justify-self:center;
  align-self:center;
}

.die.held{
  background:linear-gradient(145deg,#168f55,#075b35);
  box-shadow:
    0 0 0 5px #ffd83d,
    0 6px 0 #064c2d,
    0 9px 15px rgba(0,0,0,.4);
  transform:translateY(-4px);
}

.die.held .pip{
  background:#fff;
  box-shadow:none;
}

.total{
  text-align:center;
  font-size:30px;
  font-weight:900;
  margin:8px;
}

.banner{
  text-align:center;
  font-size:25px;
  font-weight:900;
  padding:13px;
  border-radius:12px;
  background:#b5122e;
  box-shadow:0 0 18px rgba(255,0,0,.35);
  margin:12px 0;
}

.chatlog{
  max-height:180px;
  overflow:auto;
  background:#07030a;
  border-radius:10px;
  padding:9px;
}

.msg{
  padding:5px;
  border-bottom:1px solid #28101b;
}

.rule{
  position:fixed;
  left:14px;
  right:14px;
  bottom:14px;
  z-index:20;
  max-width:530px;
  margin:auto;
  background:#10264b;
  border:1px solid #ffd63e;
  border-radius:18px;
  padding:10px 16px;
  font-size:16px;
  box-shadow:0 0 12px #000;
  text-align:center;
}

.small{
  font-size:13px;
  color:#cdbdcc;
}

.center{
  text-align:center;
}

.code{
  font-size:30px;
  letter-spacing:7px;
  color:#ffd83d;
  font-weight:900;
}

.actions{
  text-align:center;
}

.status{
  padding:10px;
  border-radius:10px;
  background:#111;
  color:#ffe78b;
  margin:8px 0;
}

a{
  color:#ffd83d;
}

.target-info{
  text-align:center;
  color:#ffe78b;
  font-weight:bold;
  font-size:18px;
  margin:8px 0;
}

.history{
  max-height:220px;
  overflow:auto;
  background:#080308;
  border-radius:10px;
  padding:10px;
}

.history div{
  padding:5px 0;
  border-bottom:1px solid #27101c;
  font-size:14px;
}

@media(max-width:600px){

  .wrap{
    padding:12px 10px;
  }

  .logo{
    font-size:39px;
  }

  .tag{
    font-size:12px;
    letter-spacing:5px;
  }

  .die{
    width:68px;
    height:68px;
  }

  .pip{
    width:12px;
    height:12px;
  }

  button{
    font-size:16px;
  }

  .rule{
    font-size:15px;
  }
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

  function home(){

  if(room){

    app.innerHTML=
      '<div class="card center">'+
        '<h2>🎲 JE BENT UITGENODIGD</h2>'+
        '<p>Vul alleen je naam in om mee te doen.</p>'+
        '<div class="small">Spelcode</div>'+
        '<div class="code">'+esc(room)+'</div>'+
        '<input id="joinName" maxlength="20" placeholder="Jouw naam" autocomplete="name">'+
        '<button class="green" onclick="joinFromInvite()">'+
          'MEEDOEN MET DIT SPEL'+
        '</button>'+
      '</div>';

    return;
  }

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
}

function create(){

  var n=document.getElementById('name').value.trim();

  if(!n){
    alert('Vul je naam in.');
    return;
  }

  api('/api/create','POST',{
    name:n
  })
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

  if(!el){
    return;
  }

  var v=el.value.trim();

  if(!v){
    return;
  }

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

function copyInvite(){

  var url=location.href;

  if(navigator.clipboard){

    navigator.clipboard.writeText(url)
    .then(function(){
      alert('Uitnodigingslink gekopieerd!');
    })
    .catch(function(){
      alert(url);
    });

  }else{

    alert(url);

  }
}

function home(){

  app.innerHTML=

    '<div class="card center">'+

      '<h2>NIEUW SPEL</h2>'+

      '<input id="name" maxlength="20" placeholder="Jouw naam" autocomplete="name">'+

      '<button class="green" onclick="create()">'+
        'SPEL MAKEN'+
      '</button>'+

    '</div>'+

    '<div class="card center">'+

      '<h2>OF MEEDOEN</h2>'+

      '<input id="joinName" maxlength="20" placeholder="Jouw naam" autocomplete="name">'+

      '<input id="joinCode" maxlength="6" placeholder="Spelcode" autocomplete="off">'+

      '<button onclick="join()">'+
        'MEEDOEN'+
      '</button>'+

    '</div>';

}

function lobby(){

  var list=state.players.map(function(p){

    var controls='';

    if(
      state.admin===state.me &&
      p.id!==state.me
    ){

      controls=

        '<button class="dark" onclick="pause(\\''+
          p.id+
        '\\')">'+

          (p.active?'PAUZE':'ACTIEF')+

        '</button>'+

        '<button class="red" onclick="removePlayer(\\''+
          p.id+
        '\\')">'+
          'VERWIJDER'+
        '</button>';

    }

    return

      '<div class="player '+
        (p.id===state.me?'me':'')+
      '">'+

        '<b>'+esc(p.name)+'</b>'+

        '<div class="money">'+
          '€'+p.money.toFixed(2)+
        '</div>'+

        '<div class="small">'+
          (p.active?'🟢 Actief':'⏸️ Pauze')+
        '</div>'+

        controls+

      '</div>';

  }).join('');

  app.innerHTML=

    '<div class="card center">'+

      '<h2>WACHTRUIMTE</h2>'+

      '<div class="small">Spelcode</div>'+

      '<div class="code">'+
        esc(state.room)+
      '</div>'+

      '<p>Deel deze link met de andere spelers:</p>'+

      '<input readonly value="'+
        esc(location.href)+
      '" onclick="this.select()">'+

      '<button onclick="copyInvite()">'+
        '📋 KOPIEER UITNODIGING'+
      '</button>'+

    '</div>'+

    '<div class="card">'+

      '<h3>Spelers ('+
        state.players.length+
        '/4)</h3>'+

      '<div class="players">'+
        list+
      '</div>'+

    '</div>'+

    (

      state.admin===state.me

      ?

      '<div class="card center">'+

        '<button class="green" onclick="start()" '+
          (state.players.length<1?'disabled':'')+
        '>'+
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

    return

      '<div class="msg">'+
        '<b>'+esc(m.name)+':</b> '+
        esc(m.text)+
      '</div>';

  }).join('');

  return

    '<div class="card">'+

      '<h3>💬 CHAT</h3>'+

      '<div class="chatlog">'+

        (
          msgs ||
          '<span class="small">Nog geen berichten.</span>'
        )+

      '</div>'+

      '<input id="chatInput" maxlength="200" placeholder="Typ een bericht..." onkeydown="if(event.key===\\'Enter\\'){sendChat();}">'+

      '<button onclick="sendChat()">VERSTUUR</button>'+

    '</div>';

}

function die(v){

  var maps={
    1:[4],
    2:[0,8],
    3:[0,4,8],
    4:[0,2,6,8],
    5:[0,2,4,6,8],
    6:[0,2,3,5,6,8]
  };

  return (maps[v]||maps[1]).map(function(pos){

    return

      '<span class="pip" style="grid-area:'+
      (Math.floor(pos/3)+1)+
      ' / '+
      (pos%3+1)+
      '"></span>';

  }).join('');

}

function game(){

  var dice=state.dice||[1,1,1,1,1];

  var ds=dice.map(function(v,i){

    var h=state.held&&state.held[i];

    var disabled=
      state.phase!=='main' ||
      state.current!==state.me ||
      h;

    return

      '<button class="die '+
        (h?'held':'')+
      '" onclick="hold('+i+')" '+
        (disabled?'disabled':'')+
      '>'+
        die(v)+
      '</button>';

  }).join('');

  var banner='';

  if(state.direction==='earn'){

    banner=
      '<div class="banner">'+
        'VERDIENEN: '+state.target+'-EN'+
      '</div>';

  }

  if(state.direction==='pay'){

    banner=
      '<div class="banner">'+
        'BETALEN: '+state.target+'-EN'+
      '</div>';

  }

  var targetInfo='';

  if(state.phase==='target'){

    targetInfo=

      '<div class="target-info">'+

        (
          state.direction==='earn'
          ? '💰 Elke '+state.target+' = €'+
              (state.target*0.5).toFixed(2)+
              ' verdienen per actieve tegenstander'
          : '💸 Elke '+state.target+' = €'+
              (state.target*0.5).toFixed(2)+
              ' betalen per actieve tegenstander'
        )+

      '</div>';

  }

  var canRoll=false;

  if(state.current===state.me){

    if(state.phase==='target'){

      canRoll=true;

    }else if(state.phase==='main'){

      if(!state.rolled){

        canRoll=true;

      }else{

        canRoll=state.heldCount>0;

      }

    }

  }

  var canAccept=
    state.current===state.me &&
    state.phase==='main' &&
    state.rolled;

  var status=
    state.current===state.me
    ? '👉 JIJ BENT AAN DE BEURT'
    : '⏳ '+esc(state.currentName)+' is aan de beurt';

  var rollText=
    state.phase==='target'
    ? '🎲 DOORGOOIEN'
    : (!state.rolled
      ? '🎲 BEGIN WORP'
      : '🎲 OPNIEUW GOOIEN');

  app.innerHTML=

    '<div class="card">'+

      banner+

      targetInfo+

      '<div class="status center">'+
        status+
      '</div>'+

      '<div class="dice-row">'+
        ds+
      '</div>'+

      '<div class="total">'+
        'TOTAAL: '+
        (state.total||0)+
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

          return

            '<div class="player '+
              (p.id===state.me?'me':'')+
            '">'+

              '<b>'+esc(p.name)+'</b>'+

              '<div class="money">'+
                '€'+p.money.toFixed(2)+
              '</div>'+

              '<div class="small">'+
                (p.active?'🟢 Actief':'⏸️ Pauze')+
              '</div>'+

            '</div>';

        }).join('')+

      '</div>'+

    '</div>'+

    '<div class="card">'+

      '<h3>📜 SPELGESCHIEDENIS</h3>'+

      '<div class="history">'+

        (
          (state.log||[]).length

          ?

          state.log.map(function(x){
            return '<div>'+esc(x)+'</div>';
          }).join('')

          :

          '<span class="small">Nog geen spelgeschiedenis.</span>'
        )+

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

      if(
        force ||
        state.rev!==lastRev
      ){

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
window.copyInvite=copyInvite;

home();

if(token){
  refresh(true);
}

setInterval(function(){

  if(token && !busy){
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

  return (
    a.length===5 &&
    a.every(function(x){
      return x===a[0];
    })
  );

}

function sum(a){

  return a.reduce(function(x,y){
    return x+y;
  },0);

}

function rnd(){
  return 1+Math.floor(Math.random()*6);
}

function roll5(){
  return [
    rnd(),
    rnd(),
    rnd(),
    rnd(),
    rnd()
  ];
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

  var ps=active(r);

  if(!ps.length){
    return;
  }

  var i=ps.findIndex(function(p){
    return p.id===r.current;
  });

  var next;

  if(i<0){
    next=ps[0];
  }else{
    next=ps[(i+1)%ps.length];
  }

  r.current=next.id;
  r.currentName=next.name;
}

function transfer(r,pid,amount,dir){

  var sender=r.players.find(function(p){
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

      sender.money=money(
        sender.money+amount
      );

      p.money=money(
        p.money-amount
      );

    }else{

      sender.money=money(
        sender.money-amount
      );

      p.money=money(
        p.money+amount
      );

    }

  });

}

function classify(total){

  if(total===11 || total===24){
    return {
      special:true
    };
  }

  if(total<5 || total>30){
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

  var p=me(r,t);

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

  var code=roomCode();

  var token=id();

  var player={
    id:id(),
    token:token,
    name:name,
    money:100,
    active:true
  };

  var r={

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

    var b='';

    req.on('data',function(c){

      b+=c;

      if(b.length>10000){

        reject(
          new Error('Te veel data')
        );

        req.destroy();

      }

    });

    req.on('end',function(){

      try{

        resolve(
          b ? JSON.parse(b) : {}
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

  res.writeHead(status,{

    'Content-Type':
      'application/json; charset=utf-8',

    'Cache-Control':
      'no-store',

    'Access-Control-Allow-Origin':
      '*'

  });

  res.end(
    JSON.stringify(obj)
  );

}

function errorMessage(e){

  return e && e.message
    ? e.message
    : 'Onbekende fout';

}

function action(r,p,body){

  var a=String(
    body.action||''
  );

  if(a==='chat'){

    var text=String(
      body.text||''
    ).trim().slice(0,200);

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

    var ps=active(r);

    if(!ps.length){
      throw new Error(
        'Geen actieve spelers.'
      );
    }

    /*
      BEGINWORP:
      iedere actieve speler krijgt
      één dobbelsteen.

      Hoogste begint.

      Bij gelijkstand gooien alleen
      de spelers met de hoogste waarde
      opnieuw.
    */

    var winner=null;

    var contenders=ps.slice();

    while(!winner){

      var rolls=contenders.map(function(x){

        return {
          p:x,
          v:rnd()
        };

      });

      var high=Math.max.apply(
        null,
        rolls.map(function(x){
          return x.v;
        })
      );

      var tied=rolls.filter(function(x){
        return x.v===high;
      });

      if(tied.length===1){

        winner=tied[0].p;

      }else{

        contenders=tied.map(function(x){
          return x.p;
        });

      }

    }

    r.phase='main';

    r.current=winner.id;

    r.currentName=winner.name;

    r.dice=[
      1,1,1,1,1
    ];

    r.held=[
      false,
      false,
      false,
      false,
      false
    ];

    r.rolled=false;

    r.direction=null;

    r.target=null;

    r.undoHold=null;

    r.undoAccept=null;

    addLog(
      r,
      '🎲 '+winner.name+
      ' begint de eerste beurt.'
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

  /*
    ================================
    HOOFDFASE
    ================================
  */

  if(a==='hold'){

    if(r.phase!=='main' || !r.rolled){

      throw new Error(
        'Gooi eerst.'
      );

    }

    var i=Number(body.index);

    if(
      !Number.isInteger(i) ||
      i<0 ||
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

    /*
      Alleen de laatst vastgezette
      toestand kan worden teruggezet.
    */

    r.undoHold=r.held.slice();

    r.held[i]=true;

    r.rev++;

    return;

  }

  if(a==='undoHold'){

    if(
      r.phase!=='main' ||
      !r.undoHold
    ){

      throw new Error(
        'Niets om terug te zetten.'
      );

    }

    r.held=r.undoHold.slice();

    r.undoHold=null;

    r.rev++;

    return;

  }

  /*
    ================================
    GOOIEN
    ================================
  */

  if(a==='roll'){

    /*
      HOOFDFASE
    */

    if(r.phase==='main'){

      /*
        Na de eerste worp moet
        minimaal één steen worden
        vastgezet voordat opnieuw
        mag worden gegooid.
      */

      if(
        r.rolled &&
        r.held.filter(Boolean).length===0
      ){

        throw new Error(
          'Zet minimaal 1 dobbelsteen vast voordat je opnieuw gooit.'
        );

      }

      /*
        Alleen niet-vastgezette
        stenen worden opnieuw gegooid.
      */

      for(
        var j=0;
        j<5;
        j++
      ){

        if(!r.held[j]){
          r.dice[j]=rnd();
        }

      }

      r.rolled=true;

      r.undoAccept=null;

      r.rev++;

      return;

    }

    /*
      ================================
      VERDIEN / BETALEN FASE
      ================================
    */

    if(r.phase==='target'){

      /*
        Als alle vijf doelstenen
        geraakt zijn, mogen alle vijf
        opnieuw worden gegooid.
      */

      if(
        r.held.every(function(x){
          return x;
        })
      ){

        r.held=[
          false,
          false,
          false,
          false,
          false
        ];

      }

      var hits=0;

      /*
        Eerst worden alleen de nog
        niet-vastgezette stenen gegooid.
      */

      for(
        var k=0;
        k<5;
        k++
      ){

        if(!r.held[k]){
          r.dice[k]=rnd();
        }

      }

      /*
        Nieuwe doelstenen automatisch
        vastzetten.

        Reeds vastgezette doelstenen
        tellen NIET opnieuw.
      */

      for(
        var m=0;
        m<5;
        m++
      ){

        if(
          !r.held[m] &&
          r.dice[m]===r.target
        ){

          r.held[m]=true;

          hits++;

          transfer(
            r,
            p.id,
            r.target*0.5,
            r.direction
          );

        }

      }

      /*
        GEEN nieuwe doelsteen:
        beurt onmiddellijk beëindigen.
      */

      if(hits===0){

        addLog(
          r,
          '❌ Geen nieuwe '+
          r.target+
          ' gegooid. Beurt voorbij.'
        );

        r.phase='main';

        r.direction=null;

        r.target=null;

        r.rolled=false;

        r.held=[
          false,
          false,
          false,
          false,
          false
        ];

        r.undoHold=null;

        r.undoAccept=null;

        nextPlayer(r);

        return;

      }

      addLog(
        r,
        '💰 '+
        p.name+
        ' '+
        (
          r.direction==='earn'
          ? 'verdient '
          : 'betaalt '
        )+
        (hits*r.target*0.5).toFixed(2)+
        ' euro.'
      );

      /*
        Vanaf het moment dat de
        verdien/betaal fase werkelijk
        heeft gedraaid, kan AKKOORD
        niet meer worden teruggedraaid.
      */

      r.undoAccept=null;

      r.rev++;

      return;

    }

    throw new Error(
      'Ongeldige fase.'
    );

  }

  /*
    ================================
    AKKOORD
    ================================
  */

  if(a==='accept'){

    if(
      r.phase!=='main' ||
      !r.rolled
    ){

      throw new Error(
        'Gooi eerst.'
      );

    }

    var total=sum(r.dice);

    /*
      11 en 24 zijn speciale directe
      betalingen.

      Daarna is de beurt voorbij.
    */

    if(
      total===11 ||
      total===24
    ){

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
        false,
        false,
        false,
        false,
        false
      ];

      r.rolled=false;

      nextPlayer(r);

      return;

    }

    var c=classify(total);

    if(!c){

      throw new Error(
        'Deze combinatie is niet geldig.'
      );

    }

    /*
      AKKOORD kan alleen worden
      teruggedraaid zolang de nieuwe
      verdien/betaal-worp nog niet
      heeft plaatsgevonden.
    */

    r.undoAccept={
      phase:r.phase,
      dice:r.dice.slice(),
      held:r.held.slice(),
      rolled:r.rolled,
      direction:r.direction,
      target:r.target
    };

    var target=c.target;

    /*
      5 dezelfde = altijd 6.
    */

    if(same(r.dice)){
      target=6;
    }

    r.direction=c.direction;

    r.target=target;

    r.phase='target';

    r.held=[
      false,
      false,
      false,
      false,
      false
    ];

    addLog(
      r,
      (
        c.direction==='earn'
        ? 'VERDIENEN: '
        : 'BETALEN: '
      )+
      target+
      '-en.'
    );

    r.rev++;

    return;

  }

  /*
    ================================
    AKKOORD TERUG
    ================================
  */

  if(a==='undoAccept'){

    if(!r.undoAccept){

      throw new Error(
        'Geen akkoord om terug te zetten.'
      );

    }

    var u=r.undoAccept;

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

  /*
    ================================
    PAUZE
    ================================
  */

  if(a==='pause'){

    if(r.admin!==p.id){

      throw new Error(
        'Alleen de beheerder.'
      );

    }

    var q=r.players.find(function(x){
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

  /*
    ================================
    VERWIJDEREN
    ================================
  */

  if(a==='remove'){

    if(r.admin!==p.id){

      throw new Error(
        'Alleen de beheerder.'
      );

    }

    var q2=r.players.find(function(x){
      return x.id===body.id;
    });

    if(
      !q2 ||
      q2.id===r.admin
    ){

      throw new Error(
        'Speler kan niet worden verwijderd.'
      );

    }

    r.players=r.players.filter(function(x){
      return x.id!==q2.id;
    });

    if(r.current===q2.id){
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

      if(req.url==='/' && req.method==='GET'){

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

        var b=await parseBody(req);

        var name=String(
          b.name||''
        ).trim().slice(0,20);

        if(!name){

          throw new Error(
            'Vul je naam in.'
          );

        }

        var x=newRoom(name);

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

        var b2=await parseBody(req);

        var name2=String(
          b2.name||''
        ).trim().slice(0,20);

        var code=String(
          b2.room||''
        ).trim().toUpperCase();

        var r=rooms.get(code);

        if(!name2){

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

        var player={
          id:id(),
          token:id(),
          name:name2,
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

        var t=req.headers['x-token']||'';

        var found=null;

        for(
          var roomEntry of rooms.values()
        ){

          if(me(roomEntry,t)){

            found=roomEntry;

            break;

          }

        }

        if(!found){

          throw new Error(
            'Sessie verlopen'
          );

        }

        send(
          res,
          200,
          publicState(found,t)
        );

        return;

      }

      if(
        req.url==='/api/action' &&
        req.method==='POST'
      ){

        var t2=req.headers['x-token']||'';

        var found2=null;

        for(
          var roomEntry2 of rooms.values()
        ){

          if(me(roomEntry2,t2)){

            found2=roomEntry2;

            break;

          }

        }

        if(!found2){

          throw new Error(
            'Sessie verlopen'
          );

        }

        var p=me(found2,t2);

        var body=await parseBody(req);

        action(
          found2,
          p,
          body
        );

        send(
          res,
          200,
          {
            ok:true
          }
        );

        return;

      }

      if(
        req.url==='/health' &&
        req.method==='GET'
      ){

        send(
          res,
          200,
          {
            ok:true
          }
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

  }
);

server.listen(
  PORT,
  '0.0.0.0',
  function(){

    console.log(
      'Dobbelen 11/24 draait op poort '+
      PORT
    );

  }
);
