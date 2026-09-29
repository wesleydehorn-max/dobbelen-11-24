const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const sessions = new Map();

const HTML = String.raw`<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dobbelen 11/24</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(circle at 50% -10%,#610019,#16000d 45%,#07070b);color:#fff;font-family:Arial,sans-serif;min-height:100vh}
.app{max-width:900px;margin:auto;padding:14px}
h1{text-align:center;color:#ffd54a;margin:4px 0;font-size:32px;text-shadow:0 0 14px #ff1744}
.sub{text-align:center;color:#ffeaa0;font-weight:700}
.card{margin-top:14px;padding:15px;border-radius:20px;background:linear-gradient(145deg,#172338,#09101b);border:2px solid #c99b27;box-shadow:0 0 20px #0009}
.hidden{display:none!important}
.row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
input{padding:12px;border-radius:11px;border:1px solid #ffffff30;background:#080d16;color:#fff;font-size:16px;font-weight:700}
button{padding:12px 16px;border:0;border-radius:13px;color:#fff;background:linear-gradient(145deg,#435a76,#1a2739);font-weight:900;font-size:14px;box-shadow:0 4px 9px #0008}
button:disabled{opacity:.35}
.green{background:#118d64}.orange{background:#bf7614}.blue{background:#123d75}
.players{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}
.player{padding:10px;border-radius:13px;background:#0a111d;border:1px solid #ffffff18}
.player.active{outline:3px solid #ffd43b}
.money{font-size:20px;font-weight:900;margin-top:4px}
.small{font-size:12px;color:#c9d0dc}
.roomcode{text-align:center;font-size:30px;letter-spacing:7px;color:#ffd54a;font-weight:900;margin:8px}
.turn{text-align:center;color:#ffd54a;font-weight:900;margin:9px}
.banner{min-height:65px;display:flex;align-items:center;justify-content:center;text-align:center;padding:10px;border-radius:16px;border:3px solid #ffd43b;font-size:28px;font-weight:950;text-transform:uppercase;margin:12px 0}
.banner.earn{border-color:#18e58b;background:#073729}
.banner.pay{border-color:#ffb42d;background:#422500}
.banner.end{border-color:#ff4164;background:#400716}
.dice{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;padding:15px 0;min-height:130px}
.die{width:74px;height:74px;position:relative;cursor:pointer;filter:drop-shadow(0 7px 7px #0009)}
.die.held{filter:drop-shadow(0 0 10px #18e58b)}
.face{width:74px;height:74px;padding:8px;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);background:linear-gradient(145deg,#e32b2b,#9d080b);border:2px solid #720608;border-radius:12px;box-shadow:inset 0 2px 2px #fff8,inset 0 -6px 9px #0003}
.pip{width:13px;height:13px;border-radius:50%;background:#fff;align-self:center;justify-self:center;box-shadow:inset 1px 1px 2px #aaa,0 1px 2px #420000}
.held:after{content:'VAST';position:absolute;bottom:-13px;left:0;right:0;text-align:center;color:#42e39a;font-size:10px;font-weight:900}
.rolling{animation:roll .8s ease-in-out}
.rolling:nth-child(2){animation-delay:.05s}
.rolling:nth-child(3){animation-delay:.1s}
.rolling:nth-child(4){animation-delay:.15s}
.rolling:nth-child(5){animation-delay:.2s}
@keyframes roll{
0%{transform:translateY(0) rotate(0) scale(1)}
25%{transform:translateY(-20px) rotate(110deg) scale(1.08)}
55%{transform:translateY(5px) rotate(230deg) scale(.95)}
80%{transform:translateY(-10px) rotate(320deg) scale(1.04)}
100%{transform:translateY(0) rotate(360deg) scale(1)}
}
.total{text-align:center;font-size:48px;font-weight:950}
.label{text-align:center;color:#ffd54a;font-size:12px;font-weight:900;letter-spacing:2px}
.actions{display:flex;justify-content:center;gap:8px;flex-wrap:wrap}
.log,.chat{margin-top:13px;background:#070c14;border:1px solid #c99b2744;border-radius:13px;padding:10px}
.log{max-height:130px;overflow:auto;font-size:13px}
.log div{padding:5px;border-bottom:1px solid #ffffff12}
.chatlog{height:120px;overflow:auto;font-size:13px}
.chatmsg{padding:4px;border-bottom:1px solid #ffffff10}
.admin{margin-top:12px;padding:10px;border-radius:13px;background:#070c14;border:1px solid #c99b2744}
.adminGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:8px}
.adminGrid button{font-size:11px;padding:8px 4px}
@media(max-width:650px){
.players{grid-template-columns:repeat(2,1fr)}
.die,.face{width:64px;height:64px}
.pip{width:11px;height:11px}
.banner{font-size:23px}
}
</style>
</head>

<body>
<div class="app">

<div id="setup" class="card">
<h1>🎲 DOBBELEN 11/24</h1>
<div class="sub">Online multiplayer • maximaal 4 spelers</div>

<div style="margin:20px 0">
<h2 style="text-align:center;color:#ffd54a">Nieuwe tafel</h2>
<div class="row">
<input id="adminName" maxlength="18" placeholder="Jouw naam">
<button class="green" onclick="createRoom()">🎰 TAFEL MAKEN</button>
</div>
</div>

<div>
<h2 style="text-align:center;color:#ffd54a">Meedoen</h2>
<div class="row">
<input id="joinCode" maxlength="6" placeholder="TAFELCODE">
<input id="playerName" maxlength="18" placeholder="Jouw naam">
<button class="orange" onclick="joinRoom()">➡️ MEEDOEN</button>
</div>
</div>

<p class="small" style="text-align:center">Alleen virtueel geld.</p>
</div>

<div id="game" class="hidden">
<h1>🎲 DOBBELEN 11/24</h1>
<div class="sub">Online • gedeelde tafel</div>

<div class="card">

<div id="roomInfo" class="small" style="text-align:center"></div>
<div id="roomCode" class="roomcode"></div>
<div id="players" class="players"></div>
<div id="turn" class="turn"></div>

<div id="banner" class="banner">Wacht…</div>

<div id="dice" class="dice"></div>

<div class="label">TOTAAL</div>
<div id="total" class="total">–</div>

<div class="actions">
<button id="begin" class="green" onclick="act('begin')">🎲 BEGIN WORP</button>
<button id="reroll" class="orange" onclick="act('reroll')">🎲 OPNIEUW GOOIEN</button>
<button id="accept" class="blue" onclick="act('accept')">✅ AKKOORD</button>
<button id="undoHold" onclick="act('undoHold')">↩️ VASTZETTING TERUG</button>
<button id="undoAccept" onclick="act('undoAccept')">↩️ AKKOORD TERUG</button>
</div>

<div class="small" style="text-align:center;margin-top:8px">
In de hoofdronde moet vóór iedere nieuwe worp minimaal 1 steen vaststaan.
</div>

<div id="log" class="log"></div>

<div id="admin" class="admin">
<b>👑 ADMIN</b>
<div class="row" style="margin-top:8px">
<button class="green" onclick="act('startGame')">▶️ START SPEL</button>
<button onclick="act('newGame')">🔄 NIEUW SPEL</button>
</div>
<div id="adminGrid" class="adminGrid"></div>
</div>

<div class="chat">
<button onclick="toggleChat()">💬 CHAT</button>

<div id="chatContent">
<div id="chatlog" class="chatlog"></div>

<div class="row">
<input id="chatInput" maxlength="120" placeholder="Typ een bericht…">
<button onclick="chatSend()">Verstuur</button>
</div>
</div>
</div>

<div class="small" style="text-align:center;margin-top:10px">
Deel taf code <b id="codeBottom"></b> met je medespelers.
</div>

</div>
</div>

<script>

var token=localStorage.getItem('d1124_token')||'';
var adminToken=localStorage.getItem('d1124_admin')||'';
var state=null;
var version=-1;
var meId='';
var timer=null;
var lastDice='';

function esc(s){
return String(s).replace(/[&<>"]/g,function(c){
return {
'&':'&amp;',
'<':'&lt;',
'>':'&gt;',
'"':'&quot;'
}[c]
})
}

function euro(n){
return '€'+Number(n).toFixed(2).replace('.',',')
}

async function post(url,data){
var r=await fetch(url,{
method:'POST',
headers:{
'Content-Type':'application/json',
'X-Session':token
},
body:JSON.stringify(data||{})
});

var j=await r.json();

if(!r.ok)
throw Error(j.error||'Fout');

return j
}

async function createRoom(){
try{
var j=await post('/api/create',{
name:document.getElementById('adminName').value.trim()||'Admin'
});

token=j.token;
adminToken=j.adminToken||'';

localStorage.setItem('d1124_token',token);
localStorage.setItem('d1124_admin',adminToken);

apply(j);
poll()
}catch(e){
alert(e.message)
}
}

async function joinRoom(){
try{
var j=await post('/api/join',{
room:document.getElementById('joinCode').value.trim().toUpperCase(),
name:document.getElementById('playerName').value.trim()||'Speler'
});

token=j.token;
adminToken='';

localStorage.setItem('d1124_token',token);
localStorage.removeItem('d1124_admin');

apply(j);
poll()
}catch(e){
alert(e.message)
}
}

async function act(a,extra){
try{
var data=Object.assign({
action:a,
adminToken:adminToken
},extra||{});

var j=await post('/api/action',data);

apply(j)
}catch(e){
alert(e.message)
}
}

async function chatSend(){
var x=document.getElementById('chatInput');
var t=x.value.trim();

if(!t)return;

try{
await post('/api/chat',{text:t});
x.value='';
loadState()
}catch(e){
alert(e.message)
}
}

function toggleChat(){
document.getElementById('chatContent').classList.toggle('hidden')
}

async function loadState(){
try{
var r=await fetch('/api/state',{
headers:{'X-Session':token},
cache:'no-store'
});

if(!r.ok)return;

var j=await r.json();

if(j.version!==version)
apply(j)

}catch(e){}
}

function poll(){
if(timer)return;
timer=setInterval(loadState,500)
}

function face(n){

var pos=[
[],
[5],
[1,9],
[1,5,9],
[1,3,7,9],
[1,3,5,7,9],
[1,3,4,6,7,9]
][n]||[];

var s='';

for(var i=1;i<=9;i++){

s+='<span class="pip" style="visibility:'+
(pos.indexOf(i)>=0?'visible':'hidden')+
'"></span>';

}

return s
}

function renderDice(){

var d=document.getElementById('dice');
var html='';

var myTurn=
state.currentId===meId &&
state.players.filter(function(p){
return p.active
}).some(function(p){
return p.id===meId
});

for(var i=0;i<state.dice.length;i++){

var click='';

if(
myTurn &&
state.phase==='main' &&
state.hasRolled
){
click="act('hold',{index:"+i+"})"
}

html+=
'<div class="die '+
(state.held[i]?'held ':'')+
'" onclick="'+click+'">'+
'<div class="face">'+
face(state.dice[i])+
'</div>'+
'</div>';

}

d.innerHTML=html;

var now=state.dice.join(',');

if(now!==lastDice && now){

var els=d.querySelectorAll('.die');

for(var k=0;k<els.length;k++){

els[k].classList.add('rolling');

(function(el,delay){

setTimeout(function(){
el.classList.remove('rolling')
},1000+delay)

})(els[k],k*50);

}

}

lastDice=now
}

function apply(j){

if(!j||!j.state)return;

state=j.state;
version=j.version==null?version:j.version;

if(j.me)
meId=j.me;

document.getElementById('setup').classList.add('hidden');
document.getElementById('game').classList.remove('hidden');

document.getElementById('roomCode').textContent=state.code;
document.getElementById('codeBottom').textContent=state.code;

document.getElementById('roomInfo').textContent=
state.started?
'Spel bezig':
'Wacht op start door admin';

document.getElementById('turn').textContent=
state.started?
state.currentName+' is aan de beurt':
'';

document.getElementById('banner').textContent=
state.banner.text;

document.getElementById('banner').className=
'banner '+(state.banner.type||'');

document.getElementById('players').innerHTML=
state.players.map(function(p){

return '<div class="player '+
(p.id===state.currentId?'active':'')+
'">'+
'<b>'+
esc(p.name)+
(p.admin?' 👑':'')+
'</b>'+
'<div class="money">'+
euro(p.balance)+
'</div>'+
'<div class="small">'+
(p.active?'🟢 Actief':'⏸️ Gepauzeerd')+
'</div>'+
'</div>';

}).join('');

renderDice();

document.getElementById('total').textContent=
state.dice.length?
state.dice.reduce(function(a,b){
return a+b
},0):
'–';

var mine=
state.currentId===meId &&
state.started;

document.getElementById('begin').disabled=
!mine ||
state.phase!=='idle';

document.getElementById('reroll').disabled=
!mine ||
!state.hasRolled ||
(
state.phase==='main' &&
!state.held.some(Boolean)
);

document.getElementById('accept').disabled=
!mine ||
state.phase!=='main' ||
!state.hasRolled;

document.getElementById('undoHold').disabled=
!mine ||
!state.lastHold;

document.getElementById('undoAccept').disabled=
!mine ||
!state.canUndoAccept;

document.getElementById('admin').classList.toggle(
'hidden',
!state.isAdmin
);

document.getElementById('adminGrid').innerHTML=
state.isAdmin?
state.players.map(function(p){

if(p.admin)
return '<button disabled>👑 '+
esc(p.name)+
'</button>';

return '<button onclick="act(\'togglePlayer\',{id:\''+
p.id+
'\'})">'+
(p.active?'⏸️':'▶️')+
' '+
esc(p.name)+
'</button>'+
'<button onclick="if(confirm(\'Speler verwijderen?\'))act(\'removePlayer\',{id:\''+
p.id+
'\'})">❌</button>';

}).join(''):
'';

document.getElementById('log').innerHTML=
(state.log||[])
.slice(-25)
.reverse()
.map(function(x){
return '<div>'+esc(x)+'</div>'
})
.join('');

if(j.chat){

document.getElementById('chatlog').innerHTML=
j.chat.map(function(m){

return '<div class="chatmsg">'+
'<b>'+esc(m.name)+':</b> '+
esc(m.text)+
'</div>';

}).join('');

var c=document.getElementById('chatlog');

c.scrollTop=c.scrollHeight;

}
}

if(token){
loadState();
poll()
}

document.getElementById('chatInput').addEventListener(
'keydown',
function(e){
if(e.key==='Enter')
chatSend()
}
);

</script>

</div>
</body>
</html>`;

const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function id(){
return crypto.randomBytes(8).toString('hex');
}

function token(){
return crypto.randomBytes(18).toString('hex');
}

function die(){
return 1+Math.floor(Math.random()*6);
}

function roll(){
return Array.from({length:5},die);
}

function roomCode(){

let c;

do{

c=Array.from(
{length:6},
function(){
return alphabet[
Math.floor(
Math.random()*alphabet.length
)
]
}
).join('');

}while(rooms.has(c));

return c
}

function money(n){
return Math.round(n*100)/100
}

function active(r){
return r.players.filter(function(p){
return p.active
})
}

function log(r,s){

r.log.push(s);

if(r.log.length>60)
r.log.shift()
}

function nextPlayer(r){

for(
let n=1;
n<=r.players.length;
n++
){

const i=(r.current+n)%r.players.length;

if(
r.players[i] &&
r.players[i].active
)
return i

}

return -1
}

function resetTurn(r){

r.phase='idle';

r.dice=[];

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
r.target=null;
r.mode=null;
r.lastHold=null;
r.canUndo=null;

r.banner={
text:
(r.players[r.current]?
r.players[r.current].name:
'')+
' is aan de beurt. Klik op BEGIN WORP.',
type:''
}
}

function transfer(r,p,amount,earning){

const others=
active(r).filter(function(x){
return x.id!==p.id
});

if(earning){

p.balance=
money(
p.balance+
amount*others.length
);

others.forEach(function(x){
x.balance=
money(x.balance-amount)
});

}else{

p.balance=
money(
p.balance-
amount*others.length
);

others.forEach(function(x){
x.balance=
money(x.balance+amount)
});

}
}

function state(r,p){

return {

code:r.code,

started:r.started,

currentId:
r.players[r.current]?
r.players[r.current].id:
null,

currentName:
r.players[r.current]?
r.players[r.current].name:
'',

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

lastHold:!!r.lastHold,

players:r.players.map(function(x){

return {
id:x.id,
name:x.name,
balance:x.balance,
active:x.active,
admin:x.admin
}

}),

isAdmin:!!p.admin

}
}

function push(r){
r.version++
}

function finishTurn(r){

const old=
r.players[r.current]?
r.players[r.current].name:
'';

const n=nextPlayer(r);

if(n>=0)
r.current=n;

resetTurn(r);

log(
r,
'➡️ Volgende beurt: '+
(
r.players[r.current]?
r.players[r.current].name:
old
)+
'.'
);

push(r)
}

function targetFor(total){

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
Math.min(
total-11,
24-total
)
)
}
}

function resolveEarnPay(r){

let hits=0;

for(let i=0;i<5;i++){

if(
!r.settled[i] &&
r.dice[i]===r.target
){

r.settled[i]=true;
r.held[i]=true;
hits++;

}

}

if(!hits){

r.banner={
text:'❌ MIS — geen nieuwe doel-dobbelsteen',
type:'end'
};

log(
r,
'❌ Geen nieuwe '+
r.target+
'. Beurt voorbij.'
);

finishTurn(r);

return
}

const p=r.players[r.current];
const amount=r.target*0.5;

transfer(
r,
p,
amount,
r.mode==='earn'
);

r.banner={
text:
(r.mode==='earn'?
'VERDIENEN: ':
'BETALEN: ')+
r.target+
'’EN',
type:r.mode
};

log(
r,
(r.mode==='earn'?'💰 ':'💸 ')+
p.name+
': '+
hits+
'× '+
r.target+
' ('+
money(amount*hits)+
' per tegenstander).'
);

r.phase='round';
r.hasRolled=true;

push(r)
}

function accept(r){

const p=r.players[r.current];

if(
r.phase!=='main' ||
!r.hasRolled
)
throw Error(
'Er is niets om te accepteren.'
);

r.canUndo={
dice:r.dice.slice(),
held:r.held.slice()
};

const total=
r.dice.reduce(
function(a,b){
return a+b
},
0
);

if(
total===11 ||
total===24
){

transfer(
r,
p,
.5,
false
);

log(
r,
'💸 '+
p.name+
' betaalt €0,50 aan iedere actieve tegenstander.'
);

r.banner={
text:
total+
': BETALEN €0,50',
type:'pay'
};

finishTurn(r);

return
}

let t=targetFor(total);

if(
r.dice.every(function(v){
return v===r.dice[0]
})
){

t={
mode:'earn',
n:6
};

}

r.mode=t.mode;
r.target=t.n;
r.phase='round';

r.banner={
text:
(t.mode==='earn'?
'VERDIENEN: ':
'BETALEN: ')+
t.n+
'’EN',
type:t.mode
};

log(
r,
p.name+
': '+
(t.mode==='earn'?
'verdienen ':
'betalen ')+
t.n+
'’en.'
);

resolveEarnPay(r)
}

function act(r,p,a,b){

if(
[
'startGame',
'newGame',
'togglePlayer',
'removePlayer'
].includes(a)
){

if(!p.admin)
throw Error(
'Alleen de admin kan dit.'
);

if(a==='togglePlayer'){

const q=r.players.find(
function(x){
return x.id===b.id
}
);

if(!q)
throw Error(
'Speler niet gevonden.'
);

q.active=!q.active;

if(
r.players[r.current]===q &&
!q.active
){

const n=nextPlayer(r);

if(n>=0)
r.current=n

}

resetTurn(r);

log(
r,
(q.active?'▶️ ':'⏸️ ')+
q.name+
(q.active?
' is actief.':
' is gepauzeerd.')
);

push(r);

return
}

if(a==='removePlayer'){

const i=r.players.findIndex(
function(x){
return x.id===b.id
}
);

if(i<0)
throw Error(
'Speler niet gevonden.'
);

if(r.players[i].admin)
throw Error(
'Admin kan niet worden verwijderd.'
);

const name=r.players[i].name;

r.players.splice(i,1);

if(r.players.length<1)
throw Error(
'Geen spelers meer.'
);

if(r.current>=r.players.length)
r.current=0;

resetTurn(r);

log(
r,
'❌ '+
name+
' is verwijderd.'
);

push(r);

return
}

if(a==='newGame'){

r.started=false;

r.players.forEach(function(x){
x.balance=100
});

r.current=0;
r.log=[];

resetTurn(r);

r.banner={
text:
'Wacht op de admin om het spel te starten.',
type:''
};

push(r);

return
}

if(active(r).length<2)
throw Error(
'Minimaal 2 actieve spelers nodig.'
);

r.players.forEach(function(x){
x.balance=100
});

r.current=
r.players.indexOf(
active(r)[0]
);

r.started=true;

log(
r,
'🎲 Nieuw spel gestart. '+
r.players[r.current].name+
' begint.'
);

resetTurn(r);

push(r);

return
}

if(!r.started)
throw Error(
'Het spel is nog niet gestart.'
);

if(
!r.players[r.current] ||
r.players[r.current].id!==p.id ||
!p.active
)
throw Error(
'Je bent niet aan de beurt.'
);

if(a==='begin'){

if(r.phase!=='idle')
throw Error(
'Je kunt nu niet beginnen.'
);

r.dice=roll();

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
r.phase='main';
r.lastHold=null;

r.banner={
text:
'Zet minimaal 1 dobbelsteen vast.',
type:''
};

log(
r,
'🎲 '+
p.name+
' doet de worp.'
);

push(r);

return
}

if(a==='hold'){

if(
r.phase!=='main' ||
!r.hasRolled
)
throw Error(
'Vastzetten kan nu niet.'
);

const i=Number(b.index);

if(
i<0 ||
i>4 ||
r.held[i]
)
return;

r.lastHold={
dice:r.dice.slice(),
held:r.held.slice()
};

r.held[i]=true;

r.banner={
text:
'VAST — kies nog een dobbelsteen of gooi opnieuw.',
type:''
};

push(r);

return
}

if(a==='reroll'){

if(r.phase==='main'){

if(!r.held.some(Boolean))
throw Error(
'Je moet minimaal 1 dobbelsteen vastzetten.'
);

for(
let i=0;
i<5;
i++
){

if(!r.held[i])
r.dice[i]=die()

}

r.lastHold=null;

r.banner={
text:
'Nieuwe worp — zet vóór de volgende worp weer minimaal 1 vast.',
type:''
};

push(r);

return
}

if(r.phase==='round'){

for(
let i=0;
i<5;
i++
){

if(!r.settled[i])
r.dice[i]=die()

}

resolveEarnPay(r);

return
}

}

if(a==='accept'){

accept(r);

return
}

if(a==='undoHold'){

if(!r.lastHold)
throw Error(
'Geen laatste vastzetting.'
);

r.dice=
r.lastHold.dice.slice();

r.held=
r.lastHold.held.slice();

r.lastHold=null;

r.banner={
text:
'Laatste vastzetting teruggezet.',
type:''
};

push(r);

return
}

if(a==='undoAccept'){

if(!r.canUndo)
throw Error(
'AKKOORD kan nu niet terug.'
);

r.dice=
r.canUndo.dice.slice();

r.held=
r.canUndo.held.slice();

r.phase='main';
r.canUndo=null;
r.target=null;

r.banner={
text:
'AKKOORD terug — je kunt verder spelen.',
type:''
};

push(r);

return
}

throw Error(
'Onbekende actie.'
)
}

function createRoom(name){

const r={
code:roomCode(),
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
settled:[
false,
false,
false,
false,
false
],
hasRolled:false,
target:null,
mode:null,
lastHold:null,
canUndo:null,
banner:{
text:
'Wacht op spelers / start door admin.',
type:''
},
log:[],
chat:[],
version:0
};

const p={
id:id(),
name:String(
name||'Admin'
).slice(0,18),
balance:100,
active:true,
admin:true,
adminToken:token()
};

r.players.push(p);

rooms.set(
r.code,
r
);

return [r,p]
}

function json(res,obj,status=200){

const s=JSON.stringify(obj);

res.writeHead(
status,
{
'Content-Type':
'application/json; charset=utf-8',
'Cache-Control':'no-store'
}
);

res.end(s)
}

function getBody(req){

return new Promise(
function(resolve,reject){

let d='';

req.on(
'data',
function(c){

d+=c;

if(d.length>100000)
reject(
Error('Payload te groot')
);

}
);

req.on(
'end',
function(){

try{

resolve(
d?
JSON.parse(d):
{}
);

}catch(e){

reject(
Error('Ongeldige JSON')
);

}

}
);

}
)
}

function session(req){

return sessions.get(
req.headers['x-session']
)
}

const server=
http.createServer(
async function(req,res){

try{

const u=
new URL(
req.url,
'http://localhost'
);

if(
req.method==='GET' &&
u.pathname==='/'
){

res.writeHead(
200,
{
'Content-Type':
'text/html; charset=utf-8',
'Cache-Control':'no-store'
}
);

return res.end(HTML)
}

if(
req.method==='GET' &&
u.pathname==='/health'
){

return json(
res,
{ok:true}
)
}

if(
req.method==='GET' &&
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
state:state(
s.room,
s.player
),
version:s.room.version,
chat:s.room.chat,
me:s.player.id
}
)
}

if(
req.method==='POST' &&
u.pathname==='/api/create'
){

const b=await getBody(req);

const pair=createRoom(b.name);

const r=pair[0];
const p=pair[1];
const t=token();

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
adminToken:p.adminToken,
state:state(r,p),
version:r.version,
chat:r.chat,
me:p.id
}
)
}

if(
req.method==='POST' &&
u.pathname==='/api/join'
){

const b=await getBody(req);

const r=
rooms.get(
String(
b.room||''
).toUpperCase()
);

if(!r)
throw Error(
'Tafel niet gevonden.'
);

if(r.started)
throw Error(
'Dit spel is al gestart.'
);

if(r.players.length>=4)
throw Error(
'Deze tafel zit vol.'
);

const p={
id:id(),
name:String(
b.name||'Speler'
).slice(0,18),
balance:100,
active:true,
admin:false
};

r.players.push(p);

push(r);

const t=token();

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
version:r.version,
chat:r.chat,
me:p.id
}
)
}

if(
req.method==='POST' &&
u.pathname==='/api/action'
){

const s=session(req);

if(!s)
return json(
res,
{error:'Geen sessie'},
401
);

const b=await getBody(req);

if(
s.player.admin &&
b.adminToken!==s.player.adminToken &&
[
'startGame',
'newGame',
'togglePlayer',
'removePlayer'
].includes(b.action)
){

throw Error(
'Admin-token ongeldig.'
);

}

act(
s.room,
s.player,
b.action,
b
);

return json(
res,
{
state:state(
s.room,
s.player
),
version:s.room.version,
chat:s.room.chat,
me:s.player.id
}
)
}

if(
req.method==='POST' &&
u.pathname==='/api/chat'
){

const s=session(req);

if(!s)
return json(
res,
{error:'Geen sessie'},
401
);

const b=await getBody(req);

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
{
ok:true,
version:s.room.version
}
)
}

return json(
res,
{error:'Not found'},
404
)

}catch(e){

return json(
res,
{
error:
e.message||
'Fout'
},
400
)

}

}
);

server.listen(
PORT,
function(){
console.log(
'Dobbelen 11/24 draait op poort '+
PORT
)
}
);
