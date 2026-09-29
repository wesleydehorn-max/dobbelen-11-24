const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000, rooms=new Map(), sessions=new Map();
const HTML=`<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dobbelen 11/24 – Online</title><style>
*{box-sizing:border-box}
body{
 margin:0;color:#fff;font-family:Arial,Helvetica,sans-serif;
 background:
   radial-gradient(circle at 50% -10%,#5a0015 0,#19000d 34%,#07070d 78%);
 min-height:100vh;
}
body:before{
 content:"";position:fixed;inset:0;pointer-events:none;opacity:.18;
 background-image:radial-gradient(circle,#fff 1px,transparent 1.5px);
 background-size:34px 34px;
}
.app{max-width:980px;margin:auto;padding:16px;position:relative}
h1{
 margin:0;font-size:34px;font-weight:950;text-align:center;
 color:#ffd85a;text-shadow:0 0 8px #ff1744,0 0 20px #ff174488;
 letter-spacing:1px
}
.sub{text-align:center;color:#fff7c2;margin-top:4px;font-weight:700}
.card{
 margin-top:15px;padding:18px;border-radius:22px;
 background:linear-gradient(145deg,#162235,#0b1220);
 border:2px solid #d5a72c;
 box-shadow:0 0 18px #ff174433,inset 0 0 24px #0008
}
.players{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}
.player{
 background:linear-gradient(145deg,#101a2b,#070c16);
 border-radius:15px;padding:12px;
 border:1px solid #ffffff18;
 box-shadow:inset 0 0 12px #0008
}
.player.active{
 outline:3px solid #ffd23f;
 box-shadow:0 0 18px #ff174466,inset 0 0 12px #0008
}
.money{font-size:22px;font-weight:900;margin-top:4px;color:#fff}
.status{text-align:center;font-size:18px;line-height:1.35;min-height:48px}
.resultBanner{
 text-align:center;
 margin:8px 0 14px;
 padding:16px 12px;
 border-radius:18px;
 background:linear-gradient(145deg,#241126,#0d1320);
 border:3px solid #ffd23f;
 font-size:32px;
 font-weight:950;
 letter-spacing:.3px;
 text-transform:uppercase;
 min-height:68px;
 display:flex;
 align-items:center;
 justify-content:center;
}
.resultBanner.earn{border-color:#18e58b;background:linear-gradient(145deg,#063b2b,#071b18);box-shadow:0 0 20px #18e58b55}
.resultBanner.pay{border-color:#ffb52e;background:linear-gradient(145deg,#4b2600,#211407);box-shadow:0 0 20px #ffb52e55}
.resultBanner.end{border-color:#ff3d61;background:linear-gradient(145deg,#4a0718,#1d0710);box-shadow:0 0 20px #ff3d6155}

.choice{display:flex;justify-content:center;gap:12px;margin:8px 0 14px}
button{
 border:1px solid #ffffff22;border-radius:14px;padding:13px 18px;color:#fff;
 background:linear-gradient(145deg,#394d67,#1c293b);
 font-size:15px;font-weight:900;
 box-shadow:0 4px 10px #0008, inset 0 1px #ffffff22;
 transition:.15s
}
button:not(:disabled):active{transform:translateY(2px)}
button:disabled{opacity:.35}
.selected{
 background:linear-gradient(145deg,#ffcf33,#d98b00)!important;
 color:#160b00!important;outline:3px solid #fff;
 box-shadow:0 0 20px #ffd43b99
}

.dice{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:17px;min-height:180px;padding:20px 0;perspective:900px}
.die{width:82px;height:82px;position:relative;cursor:pointer;filter:drop-shadow(0 6px 5px #0008)}
.die.held{cursor:default}
.cube{
 position:absolute;left:4px;top:4px;width:74px;height:74px;
 transform-style:preserve-3d;
}
.face{
 position:absolute;inset:0;
 background:linear-gradient(145deg,#d92323 0%,#b50f12 55%,#8f090b 100%);
 border:2px solid #7c080a;border-radius:12px;
 padding:8px;
 display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);
 gap:0;
 box-shadow:inset 0 1px 2px #fff, inset 0 -4px 8px #0001, 0 7px 14px #0007;
 transform:translateZ(10px) rotate(0deg);
 backface-visibility:hidden;
}
.side{
 position:absolute;inset:4px;
 border-radius:12px;
 background:linear-gradient(145deg,#c7191c,#8f090b);
 border:1px solid #720608;
 transform:translateZ(-8px);
 box-shadow:0 5px 10px #0004;
}
.pip{
 width:14px;height:14px;border-radius:50%;
 background:#fff;
 align-self:center;justify-self:center;
 box-shadow:inset 1px 1px 2px #ffffffaa,0 1px 2px #4b0000;
 border:1px solid #eee;
}
.held .cube{filter:drop-shadow(0 0 10px #32e39a)}
.held:after{
 content:"VAST";position:absolute;left:0;right:0;bottom:-12px;
 text-align:center;color:#43e39c;font-size:10px;font-weight:900
}
.rolling .cube{animation:realRoll .8s ease-in-out}
@keyframes realRoll{
 0%{transform:rotateX(0) rotateY(0) rotateZ(0) translateY(0)}
 25%{transform:rotateX(180deg) rotateY(120deg) rotateZ(70deg) translateY(-18px)}
 55%{transform:rotateX(350deg) rotateY(250deg) rotateZ(170deg) translateY(3px)}
 80%{transform:rotateX(510deg) rotateY(350deg) rotateZ(260deg) translateY(-2px)}
 100%{transform:rotateX(720deg) rotateY(360deg) rotateZ(360deg) translateY(0)}
}
.total{
 text-align:center;font-size:52px;font-weight:950;color:#fff;
 text-shadow:0 0 12px #ffd23f99
}
.totalLabel{text-align:center;font-size:13px;color:#ffd85a;font-weight:800;letter-spacing:2px}
.actions{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:15px}
.green{background:#15986c}.orange{background:#bd7319}
.log{
 margin-top:15px;max-height:145px;overflow:auto;font-size:13px;
 background:#070b13;border-radius:14px;padding:8px 12px;
 border:1px solid #d5a72c44
}
.log div{padding:6px 0;border-bottom:1px solid #ffffff12}

@media(max-width:650px){
 .players{grid-template-columns:repeat(2,1fr)}
 .dice{gap:6px}
 .die{width:68px;height:68px}
 .cube{width:60px;height:60px}
 .face{padding:6px;border-radius:11px}
 .pip{width:10px;height:10px}
}

.setup{max-width:620px;margin:25px auto}
.setup h2{color:#ffd85a;text-align:center}
.row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
input{
 padding:13px 15px;border-radius:12px;border:1px solid #ffffff33;
 background:#080d17;color:white;font-size:16px;font-weight:700
}
.roomcode{font-size:32px;letter-spacing:8px;text-align:center;color:#ffd85a;font-weight:950}
.small{font-size:12px;color:#cbd3df}
.adminbox{
 margin-top:12px;padding:10px;border:1px solid #d5a72c55;
 border-radius:14px;background:#070b13
}
.admin-controls{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px}
.admin-controls button{padding:8px 6px;font-size:12px}
.chatbox{
 margin-top:15px;background:#070b13;border:1px solid #d5a72c44;
 border-radius:14px;padding:10px
}
.chatlog{height:130px;overflow:auto;font-size:13px}
.chatmsg{padding:4px 0;border-bottom:1px solid #ffffff10}
.hidden{display:none!important}
.copy{font-size:13px;color:#fff7c2;text-align:center}
.me{outline:2px solid #18e58b}
.disconnected{opacity:.55}
.turnhint{text-align:center;color:#ffd85a;font-weight:900;margin:8px 0}

.die.rolling{
 animation:onlineDiceRoll .78s cubic-bezier(.18,.8,.25,1) both;
 filter:drop-shadow(0 8px 12px rgba(0,0,0,.45))
}
.die.rolling:nth-child(1){animation-delay:0ms}
.die.rolling:nth-child(2){animation-delay:45ms}
.die.rolling:nth-child(3){animation-delay:90ms}
.die.rolling:nth-child(4){animation-delay:135ms}
.die.rolling:nth-child(5){animation-delay:180ms}
@keyframes onlineDiceRoll{
 0%{transform:translateY(0) rotate(0deg) scale(1)}
 18%{transform:translateY(-20px) rotate(80deg) scale(1.05)}
 42%{transform:translateY(6px) rotate(185deg) scale(.95)}
 66%{transform:translateY(-12px) rotate(290deg) scale(1.04)}
 84%{transform:translateY(2px) rotate(350deg) scale(1.01)}
 100%{transform:translateY(0) rotate(360deg) scale(1)}
}
</style></head><body>

<div class="app">

<div id="setup" class="setup card">
<h1>🎲 DOBBELEN 11/24</h1>
<div class="sub">Online tafel • maximaal 4 spelers</div>

<div id="createBox">
<h2>Nieuwe online tafel</h2>
<div class="row">
<input id="adminName" maxlength="18" placeholder="Jouw naam">
<button class="green" onclick="createRoom()">🎰 TAFEL MAKEN</button>
</div>
</div>

<div id="joinBox">
<h2>Meedoen met een tafel</h2>
<div class="row">
<input id="joinCode" maxlength="6" placeholder="TAFELCODE">
<input id="playerName" maxlength="18" placeholder="Jouw naam">
<button class="orange" onclick="joinRoom()">➡️ MEEDOEN</button>
</div>
</div>

<p class="copy">Alleen virtueel geld. Geen echt geld.</p>
</div>

<div id="game" class="hidden">

<h1>🎲 DOBBELEN 11/24</h1>
<div class="sub">Online • gedeelde tafel</div>

<div class="card">

<div id="roomInfo" class="copy"></div>
<div id="roomCode" class="roomcode"></div>

<div id="players" class="players"></div>

<div id="turnHint" class="turnhint"></div>

<div id="banner" class="resultBanner">Wacht op de start…</div>

<div id="dice" class="dice"></div>

<div id="totalLabel" class="totalLabel">TOTAAL</div>
<div id="total" class="total">–</div>

<div class="actions">
<button id="begin" class="green" onclick="sendAction('begin')">🎲 BEGIN WORP</button>
<button id="reroll" class="orange" onclick="sendAction('reroll')" disabled>🎲 OPNIEUW GOOIEN</button>
<button id="accept" style="background:#123c73" onclick="sendAction('accept')" disabled>✅ AKKOORD</button>
<button id="undoHold" onclick="sendAction('undoHold')" disabled>↩️ LAATSTE VASTZETTING TERUG</button>
<button id="undoAccept" onclick="sendAction('undoAccept')" disabled>↩️ AKKOORD TERUG</button>
</div>

<div class="small" style="text-align:center;margin-top:8px">
In de hoofdronde moet je vóór iedere nieuwe worp minimaal 1 dobbelsteen vastzetten. Vast is vast.
</div>

<div class="log" id="log"></div>

<div class="adminbox" id="adminBox">
<b>👑 ADMIN</b>
<div class="row" style="margin-top:8px">
<button class="green" onclick="sendAction('startGame')">▶️ START SPEL</button>
<button onclick="sendAction('newGame')">🔄 NIEUW SPEL</button>
</div>
<div id="adminControls" class="admin-controls"></div>
</div>

<div class="chatbox">
<button onclick="toggleChat()">💬 CHAT</button>
<div id="chatContent">
<div id="chatlog" class="chatlog"></div>
<div class="row">
<input id="chatInput" maxlength="120" placeholder="Typ een bericht…">
<button onclick="sendChat()">Verstuur</button>
</div>
</div>
</div>

<div class="small" style="text-align:center;margin-top:12px">
Tafelcode: <b id="codeBottom"></b> • Deel de code met je medespelers.
</div>

</div>
</div>

<script>
let token=localStorage.getItem('d1124_token')||'',
adminToken=localStorage.getItem('d1124_admin')||'',
state=null,version=-1,chatOpen=true,room='';

async function api(path,body){
 const r=await fetch(path,{
   method:'POST',
   headers:{
     'Content-Type':'application/json',
     'X-Session':token
   },
   body:JSON.stringify(body||{})
 });
 const j=await r.json();
 if(!r.ok)throw Error(j.error||'Fout');
 return j
}

async function createRoom(){
 try{
  const j=await api('/api/create',{
   name:document.getElementById('adminName').value.trim()||'Admin'
  });
  token=j.token;
  adminToken=j.adminToken||'';
  localStorage.setItem('d1124_token',token);
  localStorage.setItem('d1124_admin',adminToken);
  apply(j);
  startPoll()
 }catch(e){alert(e.message)}
}

async function joinRoom(){
 try{
  const j=await api('/api/join',{
   room:document.getElementById('joinCode').value.trim().toUpperCase(),
   name:document.getElementById('playerName').value.trim()||'Speler'
  });
  token=j.token;
  localStorage.setItem('d1124_token',token);
  localStorage.removeItem('d1124_admin');
  apply(j);
  startPoll()
 }catch(e){alert(e.message)}
}

async function sendAction(action,payload={}){
 try{
  const j=await api('/api/action',{
   action,
   adminToken,
   ...payload
  });
  apply(j)
 }catch(e){alert(e.message)}
}

async function sendChat(){
 const i=document.getElementById('chatInput');
 const t=i.value.trim();
 if(!t)return;
 try{
  await api('/api/chat',{text:t});
  i.value=''
 }catch(e){alert(e.message)}
}

function apply(j){
 if(j.state){
  if(j.me)window.meId=j.me;
  state=j.state;
  version=j.version??version;
  room=state.code;
  render();

  if(Array.isArray(j.chat)){
   const d=document.getElementById('chatlog');
   d.innerHTML=j.chat.map(m=>
    \`<div class="chatmsg"><b>\${escapeHtml(m.name)}:</b> \${escapeHtml(m.text)}</div>\`
   ).join('');
   d.scrollTop=d.scrollHeight
  }
 }
}

let pollTimer=null;

function startPoll(){
 if(pollTimer)return;

 pollTimer=setInterval(async()=>{
  try{
   const r=await fetch('/api/state',{
    headers:{'X-Session':token},
    cache:'no-store'
   });
   if(!r.ok)return;
   const j=await r.json();
   if(j.version!==version||!state){
    apply(j)
   }
  }catch(e){}
 },500)
}

function toggleChat(){
 chatOpen=!chatOpen;
 document.getElementById('chatContent').classList.toggle('hidden',!chatOpen)
}

function euro(x){
 return '€'+Number(x).toFixed(2).replace('.',',')
}

function face(n){
 const a=[
  [],
  [5],
  [1,9],
  [1,5,9],
  [1,3,7,9],
  [1,3,5,7,9],
  [1,3,4,6,7,9]
 ][n]||[];

 let s='';

 for(let i=1;i<=9;i++){
  s+=\`<span class="pip" style="visibility:\${a.includes(i)?'visible':'hidden'}"></span>\`
 }

 return s
}

function dieHTML(v,i,held,canHold){
 return \`
 <div class="die \${held?'held':''}"
 onclick="\${canHold?\`sendAction('hold',{index:\${i}})\`:''}">
   <div class="cube">
     <div class="face">\${face(v)}</div>
     <div class="side"></div>
   </div>
 </div>\`
}

function render(){
 if(!state)return;

 document.getElementById('setup').classList.add('hidden');
 document.getElementById('game').classList.remove('hidden');

 document.getElementById('roomCode').textContent=state.code;
 document.getElementById('codeBottom').textContent=state.code;

 document.getElementById('roomInfo').textContent=
   state.started?'Spel bezig':'Wacht op spelers / start door admin';

 document.getElementById('players').innerHTML=
 state.players.map(p=>\`
 <div class="player \${p.id===state.currentId?'active':''}">
   <b>\${escapeHtml(p.name)}</b>\${p.admin?' 👑':''}
   <div class="money">\${euro(p.balance)}</div>
   <div class="small">\${p.active?'🟢 Actief':'⏸️ Gepauzeerd'}</div>
 </div>
 \`).join('');

 const mePlayer=state.players.find(p=>p.id===window.meId);
 const myTurn=
   state.currentId===window.meId &&
   state.started &&
   mePlayer?.active;

 document.getElementById('turnHint').textContent=
   state.started?\`\${state.currentName||''} is aan de beurt\`:''

 const b=document.getElementById('banner');

 b.textContent=state.banner?.text||'Wacht…';
 b.className='resultBanner '+(state.banner?.type||'');

 document.getElementById('dice').innerHTML=
 state.dice.map((v,i)=>
   dieHTML(
     v,
     i,
     state.held[i],
     myTurn&&state.phase==='main'&&state.hasRolled
   )
 ).join('');

 document.getElementById('total').textContent=
   state.dice.length?
   state.dice.reduce((a,b)=>a+b,0):
   '–';

 document.getElementById('begin').disabled=
   !myTurn||state.phase!=='idle';

 document.getElementById('reroll').disabled=
   !myTurn||
   !state.hasRolled||
   state.phase==='main'&&!state.held.some(Boolean);

 document.getElementById('accept').disabled=
   !myTurn||
   state.phase!=='main'||
   !state.hasRolled;

 document.getElementById('undoHold').disabled=
   !myTurn||
   !state.lastHoldSnapshot;

 document.getElementById('undoAccept').disabled=
   !myTurn||
   !state.canUndoAccept;

 document.getElementById('adminBox').classList.toggle(
   'hidden',
   !state.isAdmin
 );

 document.getElementById('adminControls').innerHTML=
 state.isAdmin?
 state.players.map(p=>
   p.admin?
   \`<button disabled>👑 \${escapeHtml(p.name)}</button>\`:
   \`<button onclick="sendAction('togglePlayer',{id:'\${p.id}'})">
      \${p.active?'⏸️':'▶️'} \${escapeHtml(p.name)}
    </button>
    <button onclick="if(confirm('Speler verwijderen?'))sendAction('removePlayer',{id:'\${p.id}'})">
      ❌ \${escapeHtml(p.name)}
    </button>\`
 ).join(''):
 '';

 document.getElementById('log').innerHTML=
 (state.log||[])
 .slice(-20)
 .reverse()
 .map(x=>\`<div>\${escapeHtml(x)}</div>\`)
 .join('');
}

function escapeHtml(s){
 return String(s).replace(/[&<>"]/g,c=>({
  '&':'&amp;',
  '<':'&lt;',
  '>':'&gt;',
  '"':'&quot;'
 }[c]))
}

document.addEventListener('keydown',e=>{
 if(
  e.key==='Enter' &&
  document.activeElement===document.getElementById('chatInput')
 ){
  sendChat()
 }
});

if(token){
 fetch('/api/state',{
  headers:{'X-Session':token}
 })
 .then(r=>r.ok?r.json():null)
 .then(j=>{
  if(j){
   apply(j);
   startPoll()
  }
 })
 .catch(()=>{})
}

(function(){
 let previousDice="";

 function animateDice(){
  const area=document.getElementById("dice");
  if(!area)return;

  const dice=area.querySelectorAll(".die");

  dice.forEach((d,i)=>{
   d.classList.remove("rolling");
   void d.offsetWidth;
   d.style.animationDelay=(i*45)+"ms";
   d.classList.add("rolling");

   setTimeout(
    ()=>d.classList.remove("rolling"),
    1050+i*45
   );
  });
 }

 const oldRender=window.render;

 if(typeof oldRender==="function"){
  window.render=function(s){
   const now=
    (s&&s.dice)?
    s.dice.join(","):
    "";

   const changed=
    now &&
    now!==previousDice;

   const result=oldRender.apply(this,arguments);

   if(changed)setTimeout(animateDice,20);

   previousDice=now;

   return result;
  };
 }
})();
</script>

</body></html>`;

const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const id=()=>crypto.randomBytes(8).toString('hex');

const tok=()=>crypto.randomBytes(18).toString('hex');

const die=()=>1+Math.floor(Math.random()*6);

const five=()=>Array.from({length:5},die);

const euro=n=>Number(n.toFixed(2));

function code(){
 let c;

 do{
  c=Array.from(
   {length:6},
   ()=>alphabet[Math.floor(Math.random()*alphabet.length)]
  ).join('')
 }while(rooms.has(c));

 return c
}

function active(r){
 return r.players.filter(p=>p.active)
}

function log(r,x){
 r.log.push(x);
 if(r.log.length>60)r.log.shift()
}

function next(r,from){
 for(let n=1;n<=r.players.length;n++){
  const i=(from+n)%r.players.length;
  if(r.players[i]?.active)return i
 }
 return -1
}

function resetTurn(r){
 r.phase='idle';
 r.dice=[];
 r.held=[false,false,false,false,false];
 r.hasRolled=false;
 r.target=null;
 r.mode=null;
 r.settled=[false,false,false,false,false];
 r.lastHold=null;
 r.canUndo=null;

 r.banner={
  text:\`${r.players[r.current]?.name||''} is aan de beurt. Klik op BEGIN WORP.\`,
  type:''
 }
}

function state(r,p){
 return {
  code:r.code,
  started:r.started,
  currentId:r.players[r.current]?.id||null,
  currentName:r.players[r.current]?.name||'',
  phase:r.phase,
  dice:r.dice,
  held:r.held,
  settled:r.settled,
  hasRolled:r.hasRolled,
  target:r.target,
  mode:r.mode,
  banner:r.banner,
  log:r.log,
  canUndoAccept:!!r.canUndo,
  lastHoldSnapshot:!!r.lastHold,
  players:r.players.map(x=>({
   id:x.id,
   name:x.name,
   balance:x.balance,
   active:x.active,
   connected:x.connected,
   admin:x.admin
  })),
  isAdmin:p.admin
 }
}

function push(r){
 r.version++
}

function transferPay(r,p,amount){
 const ops=active(r).filter(x=>x.id!==p.id);
 const total=euro(amount*ops.length);

 p.balance=euro(p.balance-total);

 for(const q of ops){
  q.balance=euro(q.balance+amount)
 }
}

function transferEarn(r,p,amount){
 const ops=active(r).filter(x=>x.id!==p.id);
 const total=euro(amount*ops.length);

 for(const q of ops){
  q.balance=euro(q.balance-amount)
 }

 p.balance=euro(p.balance+total)
}

function target(total){
 if(total<11)
  return {
   mode:'earn',
   n:Math.min(6,11-total)
  };

 if(total>24)
  return {
   mode:'earn',
   n:Math.min(6,total-24)
  };

 return {
  mode:'pay',
  n:Math.min(
   6,
   Math.min(total-11,24-total)
  )
 }
}

function endTurn(r){
 const old=r.players[r.current]?.name||'';
 const i=next(r,r.current);

 if(i>=0)r.current=i;

 resetTurn(r);

 log(
  r,
  \`➡️ Volgende beurt: \${r.players[r.current]?.name||old}.\`
 );

 push(r)
}

function roundResolve(r){
 let hits=0;

 for(let i=0;i<5;i++){
  if(
   !r.settled[i] &&
   r.dice[i]===r.target
  ){
   r.settled[i]=true;
   r.held[i]=true;
   hits++
  }
 }

 if(!hits){
  r.banner={
   text:'❌ MIS — geen nieuwe doel-dobbelsteen',
   type:'end'
  };

  log(
   r,
   \`❌ Geen nieuwe \${r.target}. Beurt voorbij.\`
  );

  endTurn(r);
  return
 }

 const amount=r.target*.5;

 if(r.mode==='earn')
  transferEarn(
   r,
   r.players[r.current],
   amount
  );
 else
  transferPay(
   r,
   r.players[r.current],
   amount
  );

 r.banner={
  text:
   r.mode==='earn'?
   \`VERDIEND: \${r.target}'EN\`:
   \`BETAALD: \${r.target}'EN\`,
  type:r.mode
 };

 log(
  r,
  \`\${r.mode==='earn'?'💰':'💸'} \${r.players[r.current].name}: \${hits}× \${r.target} (\${euro(amount*hits)} per tegenstander).\`
 );

 r.hasRolled=true;
 r.phase='round';

 push(r)
}

function accept(r){
 if(
  r.phase!=='main'||
  !r.hasRolled
 ){
  throw Error('Er is niets om te accepteren.')
 }

 r.canUndo={
  dice:[...r.dice],
  held:[...r.held]
 };

 const t=r.dice.reduce(
  (a,b)=>a+b,
  0
 );

 if(t===11||t===24){

  transferPay(
   r,
   r.players[r.current],
   .5
  );

  r.banner={
   text:\`\${t}: BETALEN €0,50\`,
   type:'pay'
  };

  log(
   r,
   \`💸 \${r.players[r.current].name} betaalt €0,50 aan iedere actieve tegenstander.\`
  );

  r.canUndo=null;

  endTurn(r);

  return
 }

 const z=target(t);

 if(r.dice.every(v=>v===r.dice[0])){
  z.mode='earn';
  z.n=6
 }

 r.mode=z.mode;
 r.target=z.n;
 r.settled=[false,false,false,false,false];
 r.phase='round';

 r.banner={
  text:
   z.mode==='earn'?
   \`VERDIENEN: \${z.n}'EN\`:
   \`BETALEN: \${z.n}'EN\`,
  type:z.mode
 };

 log(
  r,
  \`\${r.players[r.current].name}: \${z.mode==='earn'?'verdienen':'betalen'} \${z.n}'en.\`
 );

 roundResolve(r)
}

function action(r,p,a,m){

 if(
  a==='startGame'||
  a==='newGame'||
  a==='togglePlayer'||
  a==='removePlayer'
 ){

  if(!p.admin)
   throw Error('Alleen de admin kan dit.');

  if(a==='togglePlayer'){

   const q=r.players.find(
    x=>x.id===m.id
   );

   if(!q)
    throw Error('Speler niet gevonden.');

   q.active=!q.active;

   if(
    !q.active &&
    r.current===r.players.indexOf(q)
   ){
    const i=next(r,r.current);
    if(i>=0)r.current=i
   }

   log(
    r,
    \`\${q.active?'▶️':'⏸️'} \${q.name} is \${q.active?'actief':'gepauzeerd'}.\`
   );

   resetTurn(r);
   push(r);
   return
  }

  if(a==='removePlayer'){

   const idx=r.players.findIndex(
    x=>x.id===m.id
   );

   if(idx<0)
    throw Error('Speler niet gevonden.');

   if(r.players[idx].admin)
    throw Error('De admin kan niet worden verwijderd.');

   const name=r.players[idx].name;

   r.players.splice(idx,1);

   if(r.players.length===0)
    throw Error('Geen spelers meer.');

   if(r.current>=r.players.length)
    r.current=0;
   else if(idx<r.current)
    r.current--;

   log(
    r,
    \`❌ \${name} is verwijderd.\`
   );

   resetTurn(r);
   push(r);
   return
  }

  if(a==='newGame'){

   r.started=false;
   r.players.forEach(
    x=>x.balance=100
   );
   r.current=0;
   r.log=[];

   resetTurn(r);

   r.banner={
    text:'Wacht op de admin om het spel te starten.',
    type:''
   };

   push(r);
   return
  }

  if(active(r).length<2)
   throw Error('Minimaal 2 actieve spelers nodig.');

  r.players.forEach(
   x=>x.balance=100
  );

  const aps=active(r);

  r.current=r.players.indexOf(
   aps[Math.floor(Math.random()*aps.length)]
  );

  r.started=true;

  log(
   r,
   \`🎲 Nieuw spel gestart. \${r.players[r.current].name} begint.\`
  );

  resetTurn(r);
  push(r);
  return
 }

 if(!r.started)
  throw Error('Het spel is nog niet gestart.');

 if(
  r.players[r.current]?.id!==p.id||
  !p.active
 )
  throw Error('Je bent niet aan de beurt.');

 if(a==='begin'){

  if(r.phase!=='idle')
   throw Error('Je kunt nu niet beginnen.');

  r.dice=five();

  r.held=[
   false,
   false,
   false,
   false,
   false
  ];

  r.hasRolled=true;
  r.phase='main';
  r.lastHold=null;

  r.banner={
   text:'Zet minimaal 1 dobbelsteen vast.',
   type:''
  };

  log(
   r,
   \`🎲 \${p.name} doet de eerste worp.\`
  );

  push(r)
 }

 else if(a==='hold'){

  if(
   r.phase!=='main'||
   !r.hasRolled
  )
   throw Error('Vastzetten kan nu niet.');

  const i=Number(m.index);

  if(
   i<0||
   i>4||
   r.held[i]
  )
   return;

  r.lastHold={
   dice:[...r.dice],
   held:[...r.held]
  };

  r.held[i]=true;

  r.banner={
   text:'VAST — kies nog een dobbelsteen of gooi opnieuw.',
   type:''
  };

  push(r)
 }

 else if(a==='reroll'){

  if(r.phase==='main'){

   if(!r.held.some(Boolean))
    throw Error(
     'Je moet minimaal 1 dobbelsteen vastzetten.'
    );

   for(let i=0;i<5;i++){
    if(!r.held[i])
     r.dice[i]=die()
   }

   r.lastHold=null;

   r.banner={
    text:'Nieuwe worp — zet vóór de volgende worp weer minimaal 1 vast.',
    type:''
   };

   push(r)

  }else if(r.phase==='round'){

   const all=r.settled.every(Boolean);

   if(all){

    r.settled=[
     false,
     false,
     false,
     false,
     false
    ];

    r.held=[
     false,
     false,
     false,
     false,
     false
    ];

    r.dice=five()

   }else{

    for(let i=0;i<5;i++){
     if(!r.settled[i])
      r.dice[i]=die()
    }
   }

   roundResolve(r)
  }
 }

 else if(a==='accept'){
  accept(r)
 }

 else if(a==='undoHold'){

  if(!r.lastHold)
   throw Error('Geen laatste vastzetting.');

  r.dice=[
   ...r.lastHold.dice
  ];

  r.held=[
   ...r.lastHold.held
  ];

  r.lastHold=null;

  r.banner={
   text:'Laatste vastzetting teruggezet.',
   type:''
  };

  push(r)
 }

 else if(a==='undoAccept'){

  if(!r.canUndo)
   throw Error('AKKOORD kan nu niet terug.');

  r.dice=[
   ...r.canUndo.dice
  ];

  r.held=[
   ...r.canUndo.held
  ];

  r.phase='main';
  r.canUndo=null;
  r.lastHold=null;
  r.target=null;

  r.banner={
   text:'AKKOORD terug — je kunt verder spelen.',
   type:''
  };

  push(r)

 }else{
  throw Error('Onbekende actie.')
 }
}

function newRoom(name){

 const r={
  code:code(),
  players:[],
  started:false,
  current:0,
  phase:'idle',
  dice:[],
  held:[
   false,
   false,
   false,
   false,
   false
  ],
  hasRolled:false,
  target:null,
  mode:null,
  settled:[
   false,
   false,
   false,
   false,
   false
  ],
  lastHold:null,
  canUndo:null,
  banner:{
   text:'Wacht op spelers / start door admin.',
   type:''
  },
  log:[],
  version:0
 };

 const p={
  id:id(),
  name:String(name||'Admin').slice(0,18),
  balance:100,
  active:true,
  connected:true,
  admin:true,
  adminToken:tok()
 };

 r.players.push(p);
 rooms.set(r.code,r);

 return [r,p]
}

function json(res,obj,status=200){

 const s=JSON.stringify(obj);

 res.writeHead(
  status,
  {
   'Content-Type':'application/json',
   'Cache-Control':'no-store',
   'Content-Length':Buffer.byteLength(s)
  }
 );

 res.end(s)
}

function body(req){

 return new Promise((resolve,reject)=>{

  let d='';

  req.on('data',c=>{
   d+=c;

   if(d.length>100000)
    reject(Error('Payload te groot'))
  });

  req.on('end',()=>{
   try{
    resolve(
     d?
     JSON.parse(d):
     {}
    )
   }catch(e){
    reject(Error('Ongeldige JSON'))
   }
  })
 })
}

function session(req){
 const t=req.headers['x-session'];
 return sessions.get(t)
}

const server=http.createServer(
 async(req,res)=>{

  try{

   const u=new URL(
    req.url,
    'http://localhost'
   );

   if(
    req.method==='GET'&&
    u.pathname==='/health'
   )
    return json(
     res,
     {
      ok:true,
      rooms:rooms.size
     }
    );

   if(
    req.method==='GET'&&
    u.pathname==='/api/state'
   ){

    const s=session(req);

    if(!s)
     return json(
      res,
      {error:'Geen sessie'},
      401
     );

    return json(
     res,
     {
      state:state(s.room,s.player),
      version:s.room.version,
      chat:s.room.chat||[],
      me:s.player.id
     }
    )
   }

   if(
    req.method==='POST'&&
    u.pathname==='/api/create'
   ){

    const b=await body(req);

    const [r,p]=newRoom(b.name);

    r.chat=[];

    const t=tok();

    sessions.set(
     t,
     {
      room:r,
      player:p
     }
    );

    return json(
     res,
     {
      token:t,
      state:state(r,p),
      adminToken:p.adminToken
     }
    )
   }

   if(
    req.method==='POST'&&
    u.pathname==='/api/join'
   ){

    const b=await body(req);

    const r=rooms.get(
     String(b.room||'').toUpperCase()
    );

    if(!r)
     throw Error('Tafel niet gevonden.');

    if(r.started)
     throw Error('Dit spel is al gestart.');

    if(r.players.length>=4)
     throw Error('Deze tafel zit vol.');

    const p={
     id:id(),
     name:String(
      b.name||'Speler'
     ).slice(0,18),
     balance:100,
     active:true,
     connected:true,
     admin:false
    };

    r.players.push(p);
    r.chat=r.chat||[];

    const t=tok();

    sessions.set(
     t,
     {
      room:r,
      player:p
     }
    );

    push(r);

    return json(
     res,
     {
      token:t,
      state:state(r,p)
     }
    )
   }

   if(
    req.method==='POST'&&
    u.pathname==='/api/action'
   ){

    const s=session(req);

    if(!s)
     return json(
      res,
      {error:'Geen sessie'},
      401
     );

    const b=await body(req);

    if(
     b.adminToken&&
     s.player.admin&&
     b.adminToken!==s.player.adminToken
    )
     throw Error('Admin-token ongeldig.');

    action(
     s.room,
     s.player,
     b.action,
     b
    );

    return json(
     res,
     {
      state:state(s.room,s.player),
      version:s.room.version,
      chat:s.room.chat||[],
      me:s.player.id
     }
    )
   }

   if(
    req.method==='POST'&&
    u.pathname==='/api/chat'
   ){

    const s=session(req);

    if(!s)
     return json(
      res,
      {error:'Geen sessie'},
      401
     );

    const b=await body(req);

    s.room.chat=s.room.chat||[];

    s.room.chat.push({
     name:s.player.name,
     text:String(
      b.text||''
     ).slice(0,120)
    });

    if(s.room.chat.length>100)
     s.room.chat.shift();

    push(s.room);

    return json(
     res,
     {ok:true}
    )
   }

   if(
    req.method==='GET'&&
    u.pathname==='/'
   ){

    res.writeHead(
     200,
     {
      'Content-Type':'text/html; charset=utf-8',
      'Cache-Control':'no-store'
     }
    );

    return res.end(HTML)
   }

   return json(
    res,
    {error:'Not found'},
    404
   )

  }catch(e){

   json(
    res,
    {
     error:e.message||
     'Er ging iets mis.'
    },
    400
   )
  }
 }
);

server.listen(
 PORT,
 ()=>console.log(
  \`Dobbelen 11/24 online: http://localhost:\${PORT}\`
 )
);
