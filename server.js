const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const sessions = new Map();

const HTML = String.raw`<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Dobbelen 11/24</title>
<style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;background:#070a13;color:#fff;font-family:Arial,sans-serif}
body{min-height:100vh;background:radial-gradient(circle at 50% 0,#5c001f 0,#16000c 34%,#070a13 75%)}
button,input{font:inherit}
button{border:0;cursor:pointer;font-weight:900;color:#fff}
button:disabled{opacity:.3;cursor:not-allowed}
.app{max-width:760px;margin:auto;padding:8px}

.hero{text-align:center;padding:15px 10px 12px}
.logo{font-size:31px;font-weight:1000;color:#ffd84d;text-shadow:0 0 15px #ff304d,0 3px 4px #000}
.sub{font-weight:800;color:#ffe7b0;margin-top:3px}
.dots{color:#ffd43d;letter-spacing:5px;font-size:17px;margin:9px}

.panel{
  background:linear-gradient(145deg,#172236,#0b111e);
  border:3px solid #d9a935;
  border-radius:25px;
  padding:14px;
  box-shadow:0 0 20px #0008;
  margin-bottom:10px
}

.roomCode{
  font-size:28px;
  color:#ffd84d;
  font-weight:1000;
  letter-spacing:7px;
  text-align:center
}

.small{text-align:center;color:#bfc7d6;font-size:13px}

.players{
  display:grid;
  grid-template-columns:repeat(2,1fr);
  gap:8px;
  margin-top:12px
}

.player{
  background:#080f1c;
  border:1px solid #29364c;
  border-radius:16px;
  padding:12px
}

.player.current{
  border:3px solid #ffd64e;
  box-shadow:0 0 15px #ffd64e44
}

.name{font-size:18px;font-weight:900}
.money{font-size:25px;font-weight:1000;margin-top:4px}
.green{color:#71ff80}
.status{font-size:12px;color:#9effa8;margin-top:3px}

.msg{
  padding:14px;
  text-align:center;
  background:#080c15;
  border:2px solid #ffd64e;
  border-radius:17px;
  font-size:20px;
  font-weight:1000;
  margin:10px 0
}

.invite{
  width:100%;
  padding:14px;
  border-radius:14px;
  background:linear-gradient(#2475d9,#17468e);
  border:2px solid #83bbff;
  margin-top:10px
}

.adminBox{
  border:1px solid #514827;
  border-radius:16px;
  padding:12px;
  margin-top:12px
}

.adminTitle{
  font-size:20px;
  font-weight:1000;
  color:#ffd84d
}

.row{
  display:flex;
  gap:8px;
  flex-wrap:wrap
}

.btn{
  padding:13px 16px;
  border-radius:13px;
  margin-top:8px
}

.start{
  background:linear-gradient(#16b878,#08724d);
  border:2px solid #5bffbb
}

.new{
  background:linear-gradient(#3c5d83,#243c5b);
  border:2px solid #8eb8e8
}

.game{
  background:linear-gradient(145deg,#0c4d32,#062719);
  border:3px solid #d6a534;
  border-radius:24px;
  padding:10px
}

.turn{
  background:#07140e;
  border-radius:14px;
  padding:12px;
  text-align:center;
  font-size:18px;
  font-weight:1000
}

.target{
  display:none;
  text-align:center;
  background:#170d04;
  border:2px solid #e2b13d;
  border-radius:14px;
  padding:9px;
  margin:8px 0
}

.target.show{display:block}

.targetN{
  font-size:27px;
  color:#ffd85c;
  font-weight:1000
}

.earn{
  color:#70ff82;
  font-size:21px;
  font-weight:1000
}

.pay{
  color:#ff7373;
  font-size:21px;
  font-weight:1000
}

.tray{
  position:relative;
  min-height:330px;
  margin-top:9px;
  border:2px solid #a87d29;
  border-radius:19px;
  overflow:hidden;
  background:radial-gradient(circle,#176a43,#0b432c 58%,#05271a);
  display:flex;
  align-items:center;
  justify-content:center;
  flex-wrap:wrap;
  gap:12px;
  padding:70px 10px 30px;
  perspective:1000px
}

.cup{
  position:absolute;
  top:10px;
  left:50%;
  transform:translateX(-50%);
  width:110px;
  height:48px;
  border-radius:10px 10px 45px 45px;
  background:linear-gradient(160deg,#f1c75a,#80520d);
  border:3px solid #ffe07a;
  box-shadow:0 6px 12px #000
}

.cup:before{
  content:"";
  position:absolute;
  left:50%;
  top:6px;
  transform:translateX(-50%);
  width:78px;
  height:20px;
  border-radius:50%;
  background:#140d04;
  border:2px solid #f2c85c
}

.cup:after{
  content:"DOBBELBAK";
  position:absolute;
  left:50%;
  top:31px;
  transform:translateX(-50%);
  font-size:7px;
  color:#2b1b00;
  font-weight:1000
}

.die{
  position:relative;
  width:72px;
  height:72px;
  flex:0 0 72px;
  border-radius:15px;
  background:linear-gradient(135deg,#ff5948,#d81713 50%,#760500);
  border:3px solid #ffd85b;
  box-shadow:
    inset 4px 4px 9px #ff9c8c99,
    inset -9px -9px 12px #43000099,
    0 9px 13px #000a;
  transform-origin:center;
  touch-action:manipulation
}

.die.clickable{cursor:pointer}

.die.held{
  box-shadow:
    0 0 0 3px #ffd43d99,
    0 0 24px #ffd43d99,
    inset 4px 4px 9px #ff9c8c99,
    inset -9px -9px 12px #43000099,
    0 9px 13px #000a
}

.die.held:after{
  content:"VAST";
  position:absolute;
  bottom:-22px;
  left:50%;
  transform:translateX(-50%);
  background:#e3ad34;
  color:#261700;
  border-radius:6px;
  padding:3px 8px;
  font-size:8px;
  font-weight:1000
}

.pip{
  position:absolute;
  width:14px;
  height:14px;
  border-radius:50%;
  background:#fff;
  box-shadow:inset 2px 2px 2px #aaa,0 1px 2px #500
}

.p1{left:8px;top:8px}
.p2{left:29px;top:8px}
.p3{right:8px;top:8px}
.p4{left:8px;top:29px}
.p5{left:29px;top:29px}
.p6{right:8px;top:29px}
.p7{left:8px;bottom:8px}
.p8{left:29px;bottom:8px}
.p9{right:8px;bottom:8px}

.rolling{
  animation-duration:.8s;
  animation-fill-mode:both;
  animation-timing-function:cubic-bezier(.18,.72,.2,1)
}

.ra{animation-name:ra}
.rb{animation-name:rb}
.rc{animation-name:rc}
.rd{animation-name:rd}
.re{animation-name:re}

@keyframes ra{
0%{transform:translate(-130px,-100px) rotate(-20deg) scale(.8)}
35%{transform:translate(-45px,35px) rotate(180deg) scale(1.08)}
70%{transform:translate(45px,-20px) rotate(420deg) scale(1.04)}
100%{transform:translate(0) rotate(700deg) scale(1)}
}

@keyframes rb{
0%{transform:translate(130px,-100px) rotate(25deg) scale(.8)}
35%{transform:translate(50px,35px) rotate(-180deg) scale(1.08)}
70%{transform:translate(-40px,-15px) rotate(-420deg) scale(1.04)}
100%{transform:translate(0) rotate(-700deg) scale(1)}
}

@keyframes rc{
0%{transform:translate(-110px,100px) rotate(-35deg) scale(.8)}
35%{transform:translate(55px,40px) rotate(200deg) scale(1.08)}
70%{transform:translate(-40px,-35px) rotate(430deg) scale(1.04)}
100%{transform:translate(0) rotate(680deg) scale(1)}
}

@keyframes rd{
0%{transform:translate(110px,100px) rotate(35deg) scale(.8)}
35%{transform:translate(-50px,40px) rotate(-200deg) scale(1.08)}
70%{transform:translate(40px,-35px) rotate(-440deg) scale(1.04)}
100%{transform:translate(0) rotate(-680deg) scale(1)}
}

@keyframes re{
0%{transform:translate(0,-125px) rotate(-30deg) scale(.8)}
35%{transform:translate(60px,20px) rotate(170deg) scale(1.08)}
70%{transform:translate(-45px,45px) rotate(420deg) scale(1.04)}
100%{transform:translate(0) rotate(710deg) scale(1)}
}

.controls{
  display:flex;
  justify-content:center;
  flex-wrap:wrap;
  gap:8px;
  margin-top:8px
}

.roll{
  background:linear-gradient(#f2aa2d,#a95d08);
  border:2px solid #ffdc70
}

.accept{
  background:linear-gradient(#2459ad,#09295f);
  border:2px solid #84b4ff
}

.undo{
  background:#5a5f68
}

.roundRoll{
  width:100%;
  padding:16px;
  border-radius:14px;
  background:linear-gradient(#f2aa2d,#a95d08);
  border:3px solid #ffdc70;
  font-size:18px
}

.log{
  margin-top:10px;
  background:#03060c;
  border-radius:13px;
  padding:8px;
  max-height:180px;
  overflow:auto;
  font-size:12px
}

.log div{
  padding:5px;
  border-bottom:1px solid #ffffff10
}

.chat{
  margin-top:10px;
  background:#111b2a;
  border:2px solid #3778c8;
  border-radius:18px;
  overflow:hidden
}

.chatHead{
  padding:14px;
  text-align:center;
  font-size:20px;
  font-weight:1000;
  cursor:pointer
}

.chatBody{
  display:none;
  padding:10px
}

.chatBody.open{display:block}

.chatMsgs{
  height:130px;
  overflow:auto;
  background:#050913;
  border-radius:10px;
  padding:8px;
  font-size:12px
}

.chatForm{
  display:flex;
  gap:6px;
  margin-top:7px
}

.chatForm input{
  flex:1;
  min-width:0;
  padding:11px;
  border-radius:9px;
  border:0
}

.chatForm button{
  padding:11px;
  border-radius:9px;
  background:#2264a7
}

.hidden{display:none!important}

@media(max-width:600px){
  .logo{font-size:26px}
  .players{grid-template-columns:repeat(2,1fr)}
  .die{
    width:66px;
    height:66px;
    flex-basis:66px
  }
  .tray{
    min-height:310px;
    gap:9px
  }
}
</style>
</head>

<body>

<div class="app">

  <div class="hero">
    <div class="logo">🎲 DOBBELEN 11/24 🎲</div>
    <div class="sub">Online • gedeelde tafel</div>
    <div class="dots">● ● ● ● ● ● ● ● ● ● ●</div>
  </div>

  <div class="panel" id="lobby">

    <div class="small">
      PRIVÉ SPELKAMER
    </div>

    <div class="roomCode" id="roomCode">
      ------
    </div>

    <div class="small" id="roomHint">
      Stuur de uitnodigingslink naar je medespeler.
    </div>

    <button
      class="invite"
      onclick="copyInvite()">
      🔗 SPELERS UITNODIGEN / LINK KOPIËREN
    </button>

    <div id="players" class="players"></div>

    <div id="lobbyMsg" class="msg">
      Wacht op spelers...
    </div>

    <div id="adminBox" class="adminBox hidden">

      <div class="adminTitle">
        👑 ADMIN
      </div>

      <div class="row">

        <button
          id="start"
          class="btn start"
          onclick="action('start')">
          ▶️ START SPEL
        </button>

        <button
          id="newGame"
          class="btn new"
          onclick="action('newGame')">
          🔄 NIEUW SPEL
        </button>

      </div>

    </div>

  </div>

  <div id="gamePanel" class="panel hidden">

    <div id="turn" class="turn"></div>

    <div id="message" class="msg"></div>

    <div id="target" class="target">

      <div
        id="targetN"
        class="targetN">
      </div>

      <div>
        DOELSTEEN
      </div>

      <div id="targetAction"></div>

    </div>

    <div class="game">

      <div class="tray">

        <div class="cup"></div>

        <div
          id="dice"
          class="trayInner">
        </div>

      </div>

      <div
        id="mainControls"
        class="controls">

        <button
          id="reroll"
          class="btn roll"
          onclick="action('reroll')">
          🎲 OPNIEUW GOOIEN
        </button>

        <button
          id="accept"
          class="btn accept"
          onclick="action('accept')">
          ✓ AKKOORD
        </button>

        <button
          id="undo"
          class="btn undo"
          onclick="action('undo')">
          ↩ VASTZETTING TERUG
        </button>

      </div>

      <div
        id="roundControls"
        class="controls hidden">

        <button
          id="roundRoll"
          class="roundRoll"
          onclick="action('roundRoll')">
          🎲 GOOI VOOR VERDIENEN
        </button>

      </div>

      <div
        class="small"
        style="margin-top:9px">

        In de hoofdronde moet vóór iedere nieuwe worp minimaal 1 nieuwe steen vaststaan.

      </div>

    </div>

    <div id="log" class="log"></div>

  </div>

  <div class="chat">

    <div
      class="chatHead"
      onclick="toggleChat()">
      💬 CHAT
    </div>

    <div
      id="chatBody"
      class="chatBody">

      <div
        id="chatMsgs"
        class="chatMsgs">
      </div>

      <div class="chatForm">

        <input
          id="chatInput"
          maxlength="200"
          placeholder="Typ een bericht...">

        <button
          onclick="sendChat()">
          VERSTUUR
        </button>

      </div>

    </div>

  </div>

</div>

<script>

let state=null;
let lastRoll=-1;
let chatOpen=false;

function esc(v){
  return String(v??'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
}

function api(url,body){

  return fetch(
    url,
    {
      method:body?'POST':'GET',

      headers:
        body
          ? {'Content-Type':'application/json'}
          : {},

      body:
        body
          ? JSON.stringify(body)
          : undefined

    }
  ).then(
    r=>r.json()
  )

}

function sound(type){

  try{

    const C=
      window.AudioContext ||
      window.webkitAudioContext;

    if(!window.ac){
      window.ac=new C()
    }

    const c=window.ac;

    c.resume();

    const o=
      c.createOscillator();

    const g=
      c.createGain();

    o.connect(g);
    g.connect(c.destination);

    o.frequency.value=
      type==='roll'
        ? 130
        : type==='hold'
          ? 520
          : type==='win'
            ? 900
            : type==='pay'
              ? 170
              : 650;

    g.gain.setValueAtTime(
      .001,
      c.currentTime
    );

    g.gain.exponentialRampToValueAtTime(
      .13,
      c.currentTime+.01
    );

    g.gain.exponentialRampToValueAtTime(
      .001,
      c.currentTime+.18
    );

    o.start();

    o.stop(
      c.currentTime+.2
    );

  }catch(e){}

}

function pips(v){

  return (
    {
      1:['p5'],
      2:['p1','p9'],
      3:['p1','p5','p9'],
      4:['p1','p3','p7','p9'],
      5:['p1','p3','p5','p7','p9'],
      6:['p1','p3','p4','p6','p7','p9']
    }
  )[v]||[];

}

function renderDice(){

  if(!state){
    return;
  }

  const d=
    document.getElementById(
      'dice'
    );

  d.innerHTML='';

  const animate=
    state.rollSeq>
    lastRoll;

  for(
    let i=0;
    i<5;
    i++
  ){

    const x=
      document.createElement(
        'div'
      );

    let c='die';

    if(
      state.held[i]
    ){

      c+=' held';

    }

    if(
      animate &&
      !state.held[i] &&
      !state.settled[i]
    ){

      c+=' rolling '+
        [
          'ra',
          'rb',
          'rc',
          'rd',
          're'
        ][i];

    }

    const selectable=
      state.phase==='main' &&
      state.me===state.current &&
      state.mustHold &&
      !state.held[i];

    if(selectable){
      c+=' clickable';
    }

    x.className=c;

    pips(
      state.dice[i]
    ).forEach(
      p=>{

        const s=
          document.createElement(
            'span'
          );

        s.className=
          'pip '+p;

        x.appendChild(s);

      }
    );

    if(selectable){

      x.onclick=
        ()=>action(
          'hold',
          {
            index:i
          }
        );

    }

    d.appendChild(x);

  }

  lastRoll=
    state.rollSeq;

}

function render(){

  if(!state){
    return;
  }

  document.getElementById(
    'roomCode'
  ).textContent=
    state.room;

  document.getElementById(
    'players'
  ).innerHTML=
    state.players
      .map(
        (p,i)=>
          '<div class="player '+
          (
            i===state.current
              ? 'current'
              : ''
          )+
          '">'+

          '<div class="name">'+
          (
            i===state.admin
              ? '👑 '
              : ''
          )+
          esc(p.name)+
          '</div>'+

          '<div class="money">€'+
          Number(p.money)
            .toFixed(2)
            .replace('.',',')+
          '</div>'+

          '<div class="status">🟢 Actief</div>'+

          '</div>'
      )
      .join('');

  document.getElementById(
    'lobbyMsg'
  ).textContent=
    state.phase==='lobby'
      ? 'WACHT OP SPELERS / START DOOR ADMIN.'
      : '';

  document.getElementById(
    'adminBox'
  ).classList.toggle(
    'hidden',
    state.me!==state.admin
  );

  document.getElementById(
    'start'
  ).disabled=
    state.me!==state.admin ||
    state.players.filter(
      p=>p.active
    ).length<2 ||
    state.phase!=='lobby';

  document.getElementById(
    'newGame'
  ).disabled=
    state.me!==state.admin;

  const gp=
    document.getElementById(
      'gamePanel'
    );

  gp.classList.toggle(
    'hidden',
    state.phase==='lobby'
  );

  if(
    state.phase!=='lobby'
  ){

    document.getElementById(
      'turn'
    ).textContent=
      state.players[
        state.current
      ]?.name+
      ' is aan de beurt.';

    document.getElementById(
      'message'
    ).textContent=
      state.banner;

    document.getElementById(
      'reroll'
    ).disabled=
      state.me!==state.current ||
      state.phase!=='main' ||
      !state.hasRolled ||
      state.mustHold ||
      state.held.every(Boolean);

    document.getElementById(
      'accept'
    ).disabled=
      state.me!==state.current ||
      state.phase!=='main' ||
      !state.hasRolled ||
      state.mustHold;

    document.getElementById(
      'undo'
    ).disabled=
      state.me!==state.current ||
      !state.canUndo;

    const t=
      document.getElementById(
        'target'
      );

    t.classList.toggle(
      'show',
      state.phase==='round'
    );

    if(
      state.phase==='round'
    ){

      document.getElementById(
        'targetN'
      ).textContent=
        state.target+
        ' – DOELSTEEN';

      const a=
        document.getElementById(
          'targetAction'
        );

      a.textContent=
        (
          state.mode==='earn'
            ? 'VERDIENEN: '
            : 'BETALEN: '
        )+
        state.target+
        "'EN";

      a.className=
        state.mode==='earn'
          ? 'earn'
          : 'pay';

      document.getElementById(
        'roundControls'
      ).classList.remove(
        'hidden'
      );

      document.getElementById(
        'roundRoll'
      ).textContent=
        state.mode==='earn'
          ? '🎲 GOOI VOOR VERDIENEN'
          : '🎲 GOOI VOOR BETALEN';

      document.getElementById(
        'roundRoll'
      ).disabled=
        state.me!==state.current;

    }else{

      document.getElementById(
        'roundControls'
      ).classList.add(
        'hidden'
      );

    }

    renderDice();

    document.getElementById(
      'log'
    ).innerHTML=
      state.log
        .map(
          x=>
            '<div>'+
            esc(x)+
            '</div>'
        )
        .join('');

  }

  document.getElementById(
    'chatMsgs'
  ).innerHTML=
    state.chat
      .map(
        x=>
          '<div><b>'+
          esc(x.name)+
          ':</b> '+
          esc(x.text)+
          '</div>'
      )
      .join('');

  document.getElementById(
    'chatMsgs'
  ).scrollTop=
    999999;

}

async function action(
  a,
  extra={}
){

  if(
    a==='start' ||
    a==='reroll' ||
    a==='roundRoll'
  ){

    sound('roll');

  }

  try{

    const r=
      await api(
        '/api/action',
        {
          action:a,
          ...extra
        }
      );

    if(r.error){

      alert(r.error);

      return;

    }

    state=r;

    if(r.sound){
      sound(r.sound);
    }

    render();

  }catch(e){

    alert(
      'Verbinding mislukt.'
    );

  }

}

function toggleChat(){

  chatOpen=
    !chatOpen;

  document
    .getElementById(
      'chatBody'
    )
    .classList.toggle(
      'open',
      chatOpen
    );

}

async function sendChat(){

  const i=
    document.getElementById(
      'chatInput'
    );

  const text=
    i.value.trim();

  if(!text){
    return;
  }

  i.value='';

  const r=
    await api(
      '/api/chat',
      {
        text
      }
    );

  if(!r.error){

    state=r;

    render();

  }

}

async function copyInvite(){

  const url=
    location.origin+
    '/?room='+
    encodeURIComponent(
      state.room
    );

  try{

    await navigator.clipboard.writeText(
      url
    );

    alert(
      'Uitnodigingslink gekopieerd:\n\n'+
      url
    );

  }catch(e){

    prompt(
      'Kopieer deze link:',
      url
    );

  }

}

async function boot(){

  const qs=
    new URLSearchParams(
      location.search
    );

  const room=
    qs.get('room') ||
    '';

  let name=
    localStorage.getItem(
      'dice_name'
    );

  if(!name){

    name=
      prompt(
        'Welke naam wil je gebruiken?'
      ) ||
      'Speler';

    name=
      name
        .trim()
        .slice(0,20) ||
      'Speler';

    localStorage.setItem(
      'dice_name',
      name
    );

  }

  const r=
    await api(
      '/api/join',
      {
        room,
        name
      }
    );

  if(r.error){

    alert(r.error);

    return;

  }

  state=r;

  if(!room){

    history.replaceState(
      {},
      '',
      '/?room='+
      encodeURIComponent(
        r.room
      )
    );

  }

  render();

  setInterval(
    async()=>{

      try{

        const s=
          await api(
            '/api/state'
          );

        if(
          !s.error &&
          (
            !state ||
            s.version!==
            state.version
          )
        ){

          state=s;

          render();

        }

      }catch(e){}

    },
    600
  );

}

document
  .getElementById(
    'chatInput'
  )
  .addEventListener(
    'keydown',
    e=>{

      if(
        e.key==='Enter'
      ){

        sendChat();

      }

    }
  );

boot();

</script>

</body>
</html>`;

function id(){
  return crypto
    .randomBytes(8)
    .toString('hex');
}

function code(){

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

function die(){

  return 1+
    Math.floor(
      Math.random()*6
    );

}

function roomFor(
  codeValue
){

  let r=
    rooms.get(
      codeValue
    );

  if(!r){

    const c=
      code();

    r={
      code:c,
      players:[],
      admin:null,
      current:0,
      phase:'lobby',

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
        'Wacht op spelers...',

      version:1,
      rollSeq:0,

      log:[],
      chat:[]
    };

    rooms.set(
      c,
      r
    );

  }

  return r;

}

function active(r){

  return r.players.filter(
    p=>p.active
  ).length;

}

function pub(r,i){

  return {

    room:r.code,

    me:i,

    admin:r.admin,

    current:r.current,

    phase:r.phase,

    dice:r.dice,

    held:r.held,

    settled:r.settled,

    hasRolled:r.hasRolled,

    mustHold:r.mustHold,

    canUndo:r.canUndo,

    target:r.target,

    mode:r.mode,

    banner:r.banner,

    version:r.version,

    rollSeq:r.rollSeq,

    players:
      r.players.map(
        p=>({
          name:p.name,
          money:p.money,
          active:p.active
        })
      ),

    log:r.log,
    chat:r.chat

  };

}

function bump(r){
  r.version++;
}

function log(r,t){

  r.log.unshift(t);

  if(
    r.log.length>60
  ){

    r.log.pop();

  }

}

function next(r){

  for(
    let n=1;
    n<=r.players.length;
    n++
  ){

    const i=
      (
        r.current+n
      )%
      r.players.length;

    if(
      r.players[i]?.active
    ){

      r.current=i;

      return;

    }

  }

}

function resetTurn(r){

  r.phase='main';

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

  r.settled=[
    false,
    false,
    false,
    false,
    false
  ];

  r.hasRolled=false;
  r.mustHold=false;
  r.canUndo=false;

  r.target=null;
  r.mode=null;

}

function finish(r){

  resetTurn(r);

  next(r);

  r.banner=
    r.players[
      r.current
    ]?.name+
    ' is aan de beurt. Klik op BEGIN WORP.';

  bump(r);

}

function transfer(
  r,
  pi,
  amount,
  earn
){

  const me=
    r.players[pi];

  for(
    const p of r.players
  ){

    if(
      !p.active ||
      p===me
    ){

      continue;

    }

    if(earn){

      p.money-=amount;
      me.money+=amount;

    }else{

      p.money+=amount;
      me.money-=amount;

    }

  }

}

function targetFor(
  total
){

  if(
    total<11
  ){

    return {

      target:
        Math.min(
          6,
          11-total
        ),

      mode:'earn'

    };

  }

  if(
    total>24
  ){

    return {

      target:
        Math.min(
          6,
          total-24
        ),

      mode:'earn'

    };

  }

  return {

    target:
      Math.min(
        6,
        Math.min(
          total-11,
          24-total
        )
      ),

    mode:'pay'

  };

}

function full(r){

  return r.dice.every(
    x=>
      x===
      r.dice[0]
  );

}

function begin(r){

  if(
    active(r)<2
  ){

    throw Error(
      'Minimaal 2 actieve spelers nodig.'
    );

  }

  r.phase='main';

  r.dice=[
    die(),
    die(),
    die(),
    die(),
    die()
  ];

  r.held=[
    false,
    false,
    false,
    false,
    false
  ];

  r.settled=[
    false,
    false,
    false,
    false,
    false
  ];

  r.hasRolled=true;

  /*
    Na iedere worp moet minimaal
    één nieuwe steen worden vastgezet.
  */
  r.mustHold=true;

  r.canUndo=false;

  r.rollSeq++;

  r.banner=
    'Nieuwe worp. Tik minimaal één dobbelsteen aan.';

  log(
    r,
    r.players[
      r.current
    ].name+
    ' heeft gegooid.'
  );

  bump(r);

}

function hold(
  r,
  i
){

  if(
    !Number.isInteger(i) ||
    i<0 ||
    i>4
  ){

    throw Error(
      'Ongeldige steen.'
    );

  }

  if(
    !r.mustHold
  ){

    throw Error(
      'Je hebt al een nieuwe steen vastgezet.'
    );

  }

  if(
    r.held[i]
  ){

    throw Error(
      'Deze steen staat al vast.'
    );

  }

  r.held[i]=true;

  r.mustHold=false;

  r.canUndo=true;

  r.banner=
    'Steen vastgezet. Je mag opnieuw gooien.';

  bump(r);

}

function undo(r){

  let i=-1;

  for(
    let n=4;
    n>=0;
    n--
  ){

    if(
      r.held[n]
    ){

      i=n;

      break;

    }

  }

  if(
    i<0
  ){

    throw Error(
      'Geen vasthouding om terug te draaien.'
    );

  }

  r.held[i]=false;

  r.mustHold=true;

  r.canUndo=false;

  bump(r);

}

function reroll(r){

  if(
    r.mustHold
  ){

    throw Error(
      'Tik eerst minimaal één nieuwe dobbelsteen aan.'
    );

  }

  if(
    r.held.every(Boolean)
  ){

    throw Error(
      'Alle dobbelstenen staan vast.'
    );

  }

  for(
    let i=0;
    i<5;
    i++
  ){

    if(
      !r.held[i]
    ){

      r.dice[i]=die();

    }

  }

  r.mustHold=true;
  r.canUndo=false;
  r.rollSeq++;

  r.banner=
    'Nieuwe worp. Tik minimaal één nieuwe steen aan.';

  bump(r);

}

function resolveRound(
  r,
  pi
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

    if(
      !r.settled[i] &&
      r.dice[i]===
      r.target
    ){

      r.settled[i]=true;
      r.held[i]=true;

      hits++;

    }

  }

  /*
    Geen doelsteen = MIS.
  */
  if(
    hits===0
  ){

    r.banner=
      '❌ MIS! Geen '+
      r.target+
      ' gegooid.';

    log(
      r,
      r.players[pi].name+
      ' heeft geen '+
      r.target+
      ' gegooid.'
    );

    finish(r);

    return {
      sound:'pay'
    };

  }

  /*
    Iedere nieuwe doelsteen
    betaalt/verdient afzonderlijk.
  */
  const amount=
    r.target*
    0.5*
    hits;

  transfer(
    r,
    pi,
    amount,
    r.mode==='earn'
  );

  log(
    r,
    r.players[pi].name+
    ' '+
    (
      r.mode==='earn'
        ? 'verdient '
        : 'betaalt '
    )+
    '€'+
    amount.toFixed(2)+
    ' met '+
    hits+
    ' nieuwe '+
    r.target+
    "'en."
  );

  r.banner=
    (
      r.mode==='earn'
        ? 'VERDIEND: '
        : 'BETAALD: '
    )+
    '€'+
    amount.toFixed(2)+
    ' met '+
    hits+
    ' nieuwe '+
    r.target+
    "'en.";

  /*
    VOLLE BAK:
    alle vijf zijn doelstenen.

    Dan opnieuw vijf dobbelstenen.
  */
  if(
    r.settled.every(Boolean)
  ){

    r.dice=[
      die(),
      die(),
      die(),
      die(),
      die()
    ];

    r.held=[
      false,
      false,
      false,
      false,
      false
    ];

    r.settled=[
      false,
      false,
      false,
      false,
      false
    ];

    r.hasRolled=true;
    r.mustHold=false;
    r.canUndo=false;

    r.rollSeq++;

    r.banner+=
      ' 🎲 VOLLE BAK! Nieuwe 5 dobbelstenen.';

    log(
      r,
      'VOLLE BAK → nieuwe 5 dobbelstenen.'
    );

    bump(r);

    return {
      sound:
        r.mode==='earn'
          ? 'win'
          : 'pay'
    };

  }

  r.hasRolled=true;
  r.mustHold=false;
  r.canUndo=false;

  bump(r);

  return {
    sound:
      r.mode==='earn'
        ? 'win'
        : 'pay'
  };

}

function accept(
  r,
  pi
){

  if(
    r.mustHold
  ){

    throw Error(
      'Je moet eerst minimaal één nieuwe steen vasthouden.'
    );

  }

  const total=
    r.dice.reduce(
      (a,b)=>
        a+b,
      0
    );

  /*
    11 of 24.
  */
  if(
    total===11 ||
    total===24
  ){

    transfer(
      r,
      pi,
      .5,
      false
    );

    log(
      r,
      r.players[pi].name+
      ' gooide '+
      total+
      ' en betaalt €0,50 aan iedere tegenstander.'
    );

    r.banner=
      total+
      '! €0,50 betalen aan iedere tegenstander.';

    finish(r);

    return {
      sound:'pay'
    };

  }

  /*
    Vijf dezelfde = volle bak.
  */
  const t=
    full(r)
      ? {
          target:6,
          mode:'earn'
        }
      : targetFor(total);

  r.phase='round';

  r.target=t.target;
  r.mode=t.mode;

  r.held=[
    false,
    false,
    false,
    false,
    false
  ];

  r.settled=[
    false,
    false,
    false,
    false,
    false
  ];

  r.mustHold=false;
  r.canUndo=false;

  r.banner=
    t.mode==='earn'
      ? 'VERDIENEN: '+
        t.target+
        "'EN"
      : 'BETALEN: '+
        t.target+
        "'EN";

  bump(r);

  /*
    De doelstenen van de geaccepteerde worp
    worden direct verwerkt.
  */
  return resolveRound(
    r,
    pi
  );

}

function roundRoll(
  r,
  pi
){

  /*
    Alleen losse dobbelstenen opnieuw gooien.
  */
  for(
    let i=0;
    i<5;
    i++
  ){

    if(
      !r.settled[i]
    ){

      r.dice[i]=die();

    }

  }

  r.rollSeq++;

  return resolveRound(
    r,
    pi
  );

}

function action(
  r,
  pi,
  b
){

  /*
    Alleen de admin mag START/NIEUW SPEL.
  */
  if(
    r.current!==pi &&
    b.action!=='newGame'
  ){

    throw Error(
      'Het is niet jouw beurt.'
    );

  }

  if(
    b.action==='start'
  ){

    if(
      pi!==r.admin
    ){

      throw Error(
        'Alleen de admin kan starten.'
      );

    }

    if(
      r.phase!=='lobby'
    ){

      throw Error(
        'Het spel is al gestart.'
      );

    }

    begin(r);

    return {
      sound:'roll'
    };

  }

  if(
    b.action==='newGame'
  ){

    if(
      pi!==r.admin
    ){

      throw Error(
        'Alleen de admin kan een nieuw spel starten.'
      );

    }

    r.phase='lobby';

    r.current=0;

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

    r.settled=[
      false,
      false,
      false,
      false,
      false
    ];

    r.hasRolled=false;
    r.mustHold=false;
    r.canUndo=false;

    r.target=null;
    r.mode=null;

    r.banner=
      'Wacht op spelers...';

    r.players.forEach(
      p=>{
        p.money=100;
      }
    );

    log(
      r,
      'Nieuw spel aangemaakt door de admin.'
    );

    bump(r);

    return {};

  }

  if(
    b.action==='hold'
  ){

    if(
      r.phase!=='main'
    ){

      throw Error(
        'Je kunt nu geen steen vasthouden.'
      );

    }

    hold(
      r,
      Number(b.index)
    );

    return {
      sound:'hold'
    };

  }

  if(
    b.action==='undo'
  ){

    undo(r);

    return {
      sound:'hold'
    };

  }

  if(
    b.action==='reroll'
  ){

    reroll(r);

    return {
      sound:'roll'
    };

  }

  if(
    b.action==='accept'
  ){

    return accept(
      r,
      pi
    );

  }

  if(
    b.action==='roundRoll'
  ){

    return roundRoll(
      r,
      pi
    );

  }

  throw Error(
    'Onbekende actie'
  );

}

function session(req){

  const c=
    req.headers.cookie ||
    '';

  const m=
    c.match(
      /sid=([^;]+)/
    );

  return m
    ? sessions.get(m[1])
    : null;

}

function gp(req){

  const s=
    session(req);

  if(!s){
    return null;
  }

  const r=
    rooms.get(
      s.room
    );

  if(!r){
    return null;
  }

  const i=
    r.players.findIndex(
      p=>
        p.id===
        s.player
    );

  if(
    i<0
  ){

    return null;

  }

  return {
    r,
    i
  };

}

function body(req){

  return new Promise(
    (resolve,reject)=>{

      let x='';

      req.on(
        'data',
        c=>{

          x+=c;

          if(
            x.length>
            1000000
          ){

            req.destroy();

          }

        }
      );

      req.on(
        'end',
        ()=>{

          try{

            resolve(
              x
                ? JSON.parse(x)
                : {}
            );

          }catch(e){

            resolve({});

          }

        }
      );

      req.on(
        'error',
        reject
      );

    }
  );

}

function send(
  res,
  data,
  status=200
){

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

const server=
  http.createServer(
    async(
      req,
      res
    )=>{

      try{

        const u=
          new URL(
            req.url,
            'http://localhost'
          );

        /*
          HOME
        */
        if(
          req.method==='GET' &&
          u.pathname==='/'
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

          return res.end(
            HTML
          );

        }

        /*
          HEALTH
        */
        if(
          req.method==='GET' &&
          u.pathname==='/health'
        ){

          return send(
            res,
            {
              ok:true
            }
          );

        }

        /*
          STATE
        */
        if(
          req.method==='GET' &&
          u.pathname==='/api/state'
        ){

          const x=
            gp(req);

          if(!x){

            return send(
              res,
              {
                error:
                  'Geen sessie'
              },
              401
            );

          }

          return send(
            res,
            pub(
              x.r,
              x.i
            )
          );

        }

        /*
          JOIN
        */
        if(
          req.method==='POST' &&
          u.pathname==='/api/join'
        ){

          const b=
            await body(req);

          let roomCode=
            String(
              b.room ||
              ''
            )
            .trim()
            .toUpperCase();

          let r;

          /*
            Geen room:
            maak nieuwe privékamer.
          */
          if(
            roomCode
          ){

            r=
              rooms.get(
                roomCode
              );

            if(!r){

              return send(
                res,
                {
                  error:
                    'Deze spelkamer bestaat niet.'
                },
                404
              );

            }

          }else{

            r=
              roomFor('');

          }

          let name=
            String(
              b.name ||
              'Speler'
            )
            .trim()
            .slice(0,20) ||
            'Speler';

          let p=
            r.players.find(
              x=>
                x.name.toLowerCase()===
                name.toLowerCase()
            );

          if(!p){

            if(
              r.players.length>=4
            ){

              return send(
                res,
                {
                  error:
                    'Maximaal 4 spelers in één kamer.'
                },
                400
              );

            }

            p={
              id:id(),
              name,
              money:100,
              active:true
            };

            r.players.push(p);

            /*
              Eerste speler wordt admin.
            */
            if(
              r.admin===null
            ){

              r.admin=
                r.players.length-1;

            }

            log(
              r,
              name+
              ' is de kamer binnengekomen.'
            );

            bump(r);

          }else{

            p.active=true;

          }

          const sid=
            id();

          sessions.set(
            sid,
            {
              room:r.code,
              player:p.id
            }
          );

          res.setHeader(
            'Set-Cookie',
            'sid='+
            sid+
            '; Path=/; HttpOnly; SameSite=Lax'
          );

          return send(
            res,
            pub(
              r,
              r.players.findIndex(
                x=>
                  x.id===
                  p.id
              )
            )
          );

        }

        /*
          ACTION
        */
        if(
          req.method==='POST' &&
          u.pathname==='/api/action'
        ){

          const x=
            gp(req);

          if(!x){

            return send(
              res,
              {
                error:
                  'Geen sessie'
              },
              401
            );

          }

          const b=
            await body(req);

          try{

            const z=
              action(
                x.r,
                x.i,
                b
              );

            return send(
              res,
              {
                ...pub(
                  x.r,
                  x.i
                ),
                sound:z.sound
              }
            );

          }catch(e){

            return send(
              res,
              {
                error:
                  e.message
              },
              400
            );

          }

        }

        /*
          CHAT
        */
        if(
          req.method==='POST' &&
          u.pathname==='/api/chat'
        ){

          const x=
            gp(req);

          if(!x){

            return send(
              res,
              {
                error:
                  'Geen sessie'
              },
              401
            );

          }

          const b=
            await body(req);

          const text=
            String(
              b.text ||
              ''
            )
            .trim()
            .slice(0,200);

          if(!text){

            return send(
              res,
              {
                error:
                  'Leeg bericht'
              },
              400
            );

          }

          x.r.chat.push({
            name:
              x.r.players[x.i].name,
            text
          });

          if(
            x.r.chat.length>80
          ){

            x.r.chat.shift();

          }

          bump(x.r);

          return send(
            res,
            pub(
              x.r,
              x.i
            )
          );

        }

        return send(
          res,
          {
            error:
              'Niet gevonden'
          },
          404
        );

      }catch(e){

        console.error(e);

        return send(
          res,
          {
            error:
              'Serverfout'
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
      'Dobbelen 11/24 draait op poort '+
      PORT
    );
  }
);
