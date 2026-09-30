const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;
const rooms = new Map();

const HTML = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>🎲 DOBBELEN 11/24</title>
<style>
*{box-sizing:border-box}
body{
margin:0;color:#fff;font-family:Arial,sans-serif;
background:radial-gradient(circle at 50% 0,#5a0015,#19000d 42%,#07070d 100%);
min-height:100vh
}
.app{max-width:980px;margin:auto;padding:14px}
.title{
text-align:center;color:#ffd85a;font-size:34px;font-weight:900;
text-shadow:0 0 10px #f17;letter-spacing:1px
}
.sub{text-align:center;color:#fff7c2;font-weight:700}
.card{
margin-top:14px;padding:16px;border-radius:20px;
background:linear-gradient(145deg,#162235,#0b1220);
border:2px solid #d5a72e;
box-shadow:0 0 18px #ff174433
}
.players{
display:grid;grid-template-columns:repeat(4,1fr);gap:9px
}
.player{
padding:12px;border-radius:14px;background:#101a2b;
border:1px solid #fff3;box-shadow:inset 0 0 12px #0008
}
.player.activeTurn{
outline:3px solid #ffd23f;
box-shadow:0 0 18px #ff174466
}
.money{font-size:22px;font-weight:900;margin-top:4px}
.controls{
display:flex;gap:10px;flex-wrap:wrap;
justify-content:center;margin:12px 0
}
button,input{font:inherit}
button{
border:1px solid #fff4;border-radius:13px;
padding:12px 17px;color:#fff;
background:linear-gradient(145deg,#394d67,#1c293b);
font-weight:900;cursor:pointer
}
button:disabled{opacity:.4;cursor:not-allowed}
.green{background:linear-gradient(145deg,#0b9b59,#08733f)}
.orange{background:linear-gradient(145deg,#d88900,#ffb51b)}
.blue{background:linear-gradient(145deg,#071a3d,#123b78)}
.red{background:linear-gradient(145deg,#8b0e18,#52070d)}
input{
width:100%;padding:12px;border-radius:12px;
border:1px solid #fff3;background:#080e18;color:#fff
}
.login{max-width:430px;margin:35px auto}
.dice{
display:flex;justify-content:center;flex-wrap:wrap;
gap:14px;padding:25px 10px;margin:16px auto;
border-radius:25px;
background:radial-gradient(circle at 50% 45%,#2c9152,#073c25 70%);
border:3px solid #d6b45c;
box-shadow:inset 0 0 30px #0008,0 8px 22px #0008
}
.die{
width:88px;height:88px;background:linear-gradient(145deg,#ff2b2b,#8d0010);
border:3px solid #ffd873;border-radius:18px;padding:11px;
display:grid;
grid-template-columns:repeat(3,1fr);
grid-template-rows:repeat(3,1fr);
box-shadow:inset 0 0 7px #fff8,0 7px 14px #0008;
cursor:pointer
}
.die.held{
transform:translateY(-7px);
outline:4px solid #61ffb5;
box-shadow:0 0 18px #61ffb5
}
.pip{
width:14px;height:14px;border-radius:50%;
background:#fff;justify-self:center;align-self:center;
box-shadow:0 1px 2px #400
}
.banner{
text-align:center;margin:8px auto 14px;padding:15px;
border-radius:17px;font-size:27px;font-weight:900;
min-height:60px
}
.earn{background:#063b2b;border:3px solid #18e58b}
.pay{background:#4b2600;border:3px solid #ffb52e}
.special{background:#4a0718;border:3px solid #ff3d61}
.rule{
position:fixed;left:10px;bottom:10px;
background:#111827ee;border:1px solid #ffd23f;
padding:8px 11px;border-radius:10px;
font-size:13px;z-index:5
}
.chat{margin-top:14px}
.messages{
max-height:180px;overflow:auto;background:#070c14;
border-radius:12px;padding:9px;margin-bottom:8px
}
.msg{padding:4px 0}
.small{font-size:13px;opacity:.8}
.hidden{display:none!important}
.error{
color:#ff7d9b;font-weight:700;text-align:center;margin:8px
}
.admin{margin-left:5px;color:#ffd23f}
.actions{
display:flex;gap:5px;flex-wrap:wrap;margin-top:7px
}
.actions button{padding:6px 8px;font-size:12px}
.log{
max-height:130px;overflow:auto;font-size:13px;
background:#070c14;padding:9px;border-radius:12px
}
@media(max-width:650px){
.title{font-size:28px}
.players{grid-template-columns:repeat(2,1fr)}
.die{width:68px;height:68px;border-radius:14px;padding:8px}
.pip{width:11px;height:11px}
.dice{gap:9px;padding:18px 6px}
.banner{font-size:21px}
}
</style>
</head>

<body>
<div class="app">

<div class="title">🎲 DOBBELEN 11/24</div>

<div id="login" class="card login">

<h2>Nieuw spel</h2>

<input id="name" placeholder="Jouw naam" maxlength="20">

<div class="controls">
<button class="green" onclick="createRoom()">SPEL MAKEN</button>
</div>

<h2>Meedoen</h2>

<input id="code" placeholder="Spelcode" maxlength="4">

<div class="controls">
<button class="blue" onclick="joinRoom()">MEEDOEN</button>
</div>

<div id="err" class="error"></div>

</div>

<div id="game" class="hidden">

<div class="card">

<div id="roomline" class="sub"></div>

<div id="players" class="players"></div>

<div id="admin" class="controls"></div>

</div>

<div id="banner" class="banner hidden"></div>

<div id="dice" class="dice"></div>

<div id="message" class="sub"></div>

<div class="controls">

<button id="roll"
class="orange"
onclick="act('roll')">
🎲 BEGIN WORP
</button>

<button id="accept"
class="blue"
onclick="act('accept')">
AKKOORD
</button>

<button id="start"
class="green"
onclick="act('start')">
🟢 BEGIN WORP
</button>

</div>

<div class="card">

<b>Geschiedenis</b>

<div id="log" class="log"></div>

</div>

<div class="card chat">

<b>💬 CHAT</b>

<div id="messages" class="messages"></div>

<div class="controls">

<input id="chatInput" placeholder="Bericht...">

<button class="blue" onclick="chat()">
VERSTUUR
</button>

</div>

</div>

</div>

</div>

<div class="rule">
🚩 Regel: 5 dezelfde = 6️⃣ verdienen
</div>

<script>

let ws=null;
let me=null;
let state=null;

const pipMap={
1:[4],
2:[0,8],
3:[0,4,8],
4:[0,2,6,8],
5:[0,2,4,6,8],
6:[0,2,3,5,6,8]
};

function die(v,i){

let s='<div class="die '+(state.held[i]?'held':'')+
'" onclick="hold('+i+')">';

for(let n=0;n<9;n++){

s+=pipMap[v].includes(n)
?'<span class="pip"></span>'
:'<span></span>';

}

return s+'</div>';

}

function connect(callback){

ws=new WebSocket(
(location.protocol==='https:'?'wss://':'ws://')+
location.host
);

ws.onopen=()=>{
if(callback)callback();
};

ws.onmessage=e=>{

const m=JSON.parse(e.data);

if(m.action==='welcome'){
me=m.id;
return;
}

if(m.action==='error'){
document.getElementById('err').textContent=m.message;
return;
}

if(m.action==='state'){
state=m.state;
render();
}

};

ws.onclose=()=>{
setTimeout(()=>{
if(!ws || ws.readyState!==1) connect();
},1500);
};

}

function send(x){

if(ws && ws.readyState===1){
ws.send(JSON.stringify(x));
}

}

function createRoom(){

const n=
document.getElementById('name').value.trim()
||'Speler';

connect(()=>{
send({
action:'create',
name:n
});
});

}

function joinRoom(){

const n=
document.getElementById('name').value.trim()
||'Speler';

const c=
document.getElementById('code').value.trim().toUpperCase();

connect(()=>{
send({
action:'join',
name:n,
code:c
});
});

}

function act(a){
send({action:a});
}

function hold(i){

if(
state &&
state.turn===me &&
state.phase==='main'
){

send({
action:'hold',
index:i
});

}

}

function chat(){

let x=document.getElementById('chatInput');

let t=x.value.trim();

if(t){

send({
action:'chat',
text:t
});

x.value='';

}

}

function render(){

document
.getElementById('login')
.classList.add('hidden');

document
.getElementById('game')
.classList.remove('hidden');

document
.getElementById('roomline')
.textContent=
'Spelcode: '+state.code+
' • '+
(
state.phase==='lobby'
?'Wacht op spelers'
:'Spel bezig'
);

let mePlayer=
state.players.find(p=>p.id===me);

let ps=state.players.map(p=>{

let adminButtons='';

if(
mePlayer &&
mePlayer.admin &&
p.id!==me
){

adminButtons=
'<div class="actions">'+
'<button onclick="send({action:\\'pause\\',id:\\''+
p.id+
'\\'})">'+
(p.active?'⏸️':'▶️')+
'</button>'+
'<button class="red" onclick="send({action:\\'remove\\',id:\\''+
p.id+
'\\'})">❌</button>'+
'</div>';

}

return '<div class="player '+
(p.id===state.turn?'activeTurn':'')+
'">'+

'<b>'+
esc(p.name)+
(p.admin?' <span class="admin">★</span>':'')+
'</b>'+

'<div class="money">€'+
p.money.toFixed(2).replace('.',',')+
'</div>'+

'<div class="small">'+
(p.active?'🟢 Actief':'⏸️ Pauze')+
(p.connected?'':' • offline')+
'</div>'+

adminButtons+

'</div>';

}).join('');

document.getElementById('players').innerHTML=ps;

let admin=
mePlayer &&
mePlayer.admin;

document
.getElementById('start')
.classList.toggle(
'hidden',
!admin || state.phase!=='lobby'
);

document.getElementById('admin').innerHTML=
admin
?'<span class="small">★ Jij bent de beheerder</span>'
:'';

document.getElementById('dice').innerHTML=
state.dice.map(die).join('');

document.getElementById('message').textContent=
state.message || '';

document
.getElementById('accept')
.classList.toggle(
'hidden',
state.phase!=='main' ||
!state.rolled
);

document.getElementById('roll').textContent=
state.phase==='main'
?
(
state.rolled
?'🎲 OPNIEUW GOOIEN'
:'🎲 BEGIN WORP'
)
:
'🎯 DOORGOOIEN';

let b=document.getElementById('banner');

if(state.phase==='earn'){

b.className='banner earn';
b.textContent=
'VERDIENEN: '+
state.target+
"'S";

}
else if(state.phase==='pay'){

b.className='banner pay';
b.textContent=
'BETALEN: '+
state.target+
"'S";

}
else{

b.className='banner hidden';
b.textContent='';

}

document.getElementById('messages').innerHTML=
state.chat.map(x=>
'<div class="msg"><b>'+
esc(x.name)+
':</b> '+
esc(x.text)+
'</div>'
).join('');

document.getElementById('log').innerHTML=
'<div>Beurt: '+
esc(
state.players.find(
p=>p.id===state.turn
)?.name || ''
)+
'</div>'+
'<div>Fase: '+
esc(state.phase)+
'</div>';

}

function esc(s){

return String(s).replace(
/[&<>"']/g,
c=>({
'&':'&amp;',
'<':'&lt;',
'>':'&gt;',
'"':'&quot;',
"'":'&#39;'
}[c])
);

}

</script>

</body>
</html>`;

function id(){

return Math.random()
.toString(36)
.slice(2,10);

}

function code(){

let c;

do{

c=Math.random()
.toString(36)
.slice(2,6)
.toUpperCase();

}
while(rooms.has(c));

return c;

}

function active(r){

return r.players.filter(p=>p.active);

}

function player(r,id){

return r.players.find(p=>p.id===id);

}

function roll(){

return 1+Math.floor(Math.random()*6);

}

function targetFor(total){

if(total<11)
return ['earn',11-total];

if(total>24)
return ['earn',total-24];

if(total===11 || total===24)
return ['special',0];

if(total<=17)
return ['pay',total-11];

return ['pay',24-total];

}

function transfer(r,id,per){

const me=player(r,id);

const others=
active(r).filter(p=>p.id!==id);

if(!me || !others.length)
return;

if(per>0){

me.money += per*others.length;

others.forEach(p=>{
p.money -= per;
});

}
else{

me.money += per*others.length;

others.forEach(p=>{
p.money -= per;
});

}

}

function nextTurn(r){

const a=active(r);

if(!a.length)
return;

let i=
a.findIndex(p=>p.id===r.turn);

i=i<0?0:(i+1)%a.length;

r.turn=a[i].id;

r.phase='main';

r.rolled=false;

r.dice=[1,1,1,1,1];

r.held=[false,false,false,false,false];

r.target=null;

r.targetType=null;

r.message=
a[i].name+
' is aan de beurt. Klik op BEGIN WORP.';

}

function snapshot(r){

return{

code:r.code,

phase:r.phase,

turn:r.turn,

dice:r.dice,

held:r.held,

rolled:r.rolled,

target:r.target,

targetType:r.targetType,

message:r.message,

chat:r.chat.slice(-50),

players:r.players.map(p=>({

id:p.id,

name:p.name,

money:Number(p.money.toFixed(2)),

active:p.active,

admin:p.admin,

connected:!!p.ws

}))

};

}

function broadcast(r){

const data=
JSON.stringify({
action:'state',
state:snapshot(r)
});

r.players.forEach(p=>{

if(
p.ws &&
p.ws.readyState===WebSocket.OPEN
){

p.ws.send(data);

}

});

}

function startGame(r){

const a=active(r);

if(a.length<2)
return false;

r.turn=
a[Math.floor(Math.random()*a.length)].id;

r.phase='main';

r.rolled=false;

r.dice=[1,1,1,1,1];

r.held=[false,false,false,false,false];

r.message=
player(r,r.turn).name+
' begint!';

return true;

}

function mainRoll(r){

if(!r.rolled){

r.dice=r.dice.map(()=>roll());

r.rolled=true;

r.message=
'Kies minimaal 1 dobbelsteen om vast te zetten.';

return;

}

if(!r.held.some(Boolean)){

r.message=
'Je moet eerst minimaal 1 dobbelsteen vasthouden.';

return;

}

for(let i=0;i<5;i++){

if(!r.held[i])
r.dice[i]=roll();

}

r.message='Nieuwe worp. Vast is vast.';

}

function targetRoll(r){

let hits=0;

for(let i=0;i<5;i++){

if(r.held[i])
continue;

r.dice[i]=roll();

if(r.dice[i]===r.target){

r.held[i]=true;
hits++;

}

}

if(!hits){

r.message=
'Geen '+
r.target+
' gegooid. Beurt voorbij.';

setTimeout(()=>{

if(rooms.has(r.code)){

nextTurn(r);
broadcast(r);

}

},900);

return;

}

const amount=
hits*r.target*0.5;

transfer(
r,
r.turn,
r.phase==='earn'
?amount
:-amount
);

r.message=
hits+
'× '+
r.target+
' nieuw vastgezet.';

if(r.held.every(Boolean)){

r.held=[
false,
false,
false,
false,
false
];

r.message+=
' Volle bak! Je mag opnieuw met alle 5 stenen gooien.';

}

}

function accept(r){

const total=
r.dice.reduce(
(a,b)=>a+b,
0
);

const full=
r.dice.every(
x=>x===r.dice[0]
);

if(full){

r.phase='earn';

r.target=6;

r.targetType='earn';

r.held=[
false,
false,
false,
false,
false
];

r.message=
'🚩 VOLLE BAK! 5 dezelfde = 6-en verdienen.';

return;

}

const target=
targetFor(total);

if(target[0]==='special'){

transfer(
r,
r.turn,
-0.5
);

r.message=
total+
': €0,50 betalen aan iedere actieve tegenstander. Beurt voorbij.';

setTimeout(()=>{

if(rooms.has(r.code)){

nextTurn(r);
broadcast(r);

}

},1100);

return;

}

r.phase=target[0];

r.target=target[1];

r.targetType=target[0];

r.held=[
false,
false,
false,
false,
false
];

if(target[0]==='earn'){

r.message=
total+
' → VERDIENEN met '+
target[1]+
"'s.";

}
else{

r.message=
total+
' → BETALEN met '+
target[1]+
"'s.";

}

}

function handle(r,ws,msg){

const me=player(r,ws.pid);

if(!me)
return;

if(msg.action==='chat'){

const text=
String(msg.text||'')
.trim()
.slice(0,120);

if(text){

r.chat.push({
name:me.name,
text
});

}

broadcast(r);

return;

}

if(msg.action==='start'){

if(me.admin){

if(startGame(r))
broadcast(r);

}

return;

}

if(msg.action==='hold'){

if(
r.turn===me.id &&
r.phase==='main'
){

const i=Number(msg.index);

if(
i>=0 &&
i<5 &&
!r.held[i]
){

r.held[i]=true;

r.message=
me.name+
': '+
r.held.filter(Boolean).length+
' steen/stenen vastgezet.';

}

}

broadcast(r);

return;

}

if(msg.action==='roll'){

if(r.turn!==me.id)
return;

if(r.phase==='main')
mainRoll(r);

else if(
r.phase==='earn' ||
r.phase==='pay'
)
targetRoll(r);

broadcast(r);

return;

}

if(msg.action==='accept'){

if(
r.turn!==me.id ||
r.phase!=='main' ||
!r.rolled
)
return;

accept(r);

broadcast(r);

return;

}

if(msg.action==='pause' && me.admin){

const q=player(r,msg.id);

if(q && !q.admin){

q.active=!q.active;

if(
!q.active &&
r.turn===q.id
)
nextTurn(r);

r.message=
q.name+
(q.active
?' is weer actief.'
:' is gepauzeerd.');

broadcast(r);

}

return;

}

if(
msg.action==='remove' &&
me.admin &&
msg.id!==me.id
){

const q=player(r,msg.id);

if(q){

q.active=false;
q.ws=null;

if(r.turn===q.id)
nextTurn(r);

r.message=
q.name+
' is verwijderd.';

broadcast(r);

}

}

}

const server=
http.createServer((req,res)=>{

res.writeHead(
200,
{
'Content-Type':
'text/html; charset=utf-8'
}
);

res.end(HTML);

});

const wss=
new WebSocket.Server({
server
});

wss.on('connection',ws=>{

ws.on('message',raw=>{

let msg;

try{

msg=JSON.parse(
raw.toString()
);

}
catch(e){

return;

}

if(msg.action==='create'){

const room={

code:code(),

players:[],

phase:'lobby',

turn:null,

dice:[1,1,1,1,1],

held:[
false,
false,
false,
false,
false
],

rolled:false,

target:null,

targetType:null,

message:'Wacht op spelers.',

chat:[]

};

const p={

id:id(),

name:
String(
msg.name||'Speler'
)
.trim()
.slice(0,20),

money:100,

active:true,

admin:true,

ws

};

room.players.push(p);

rooms.set(
room.code,
room
);

ws.pid=p.id;
ws.room=room.code;

ws.send(
JSON.stringify({
action:'welcome',
id:p.id
})
);

broadcast(room);

return;

}

if(msg.action==='join'){

const room=
rooms.get(
String(
msg.code||''
)
.toUpperCase()
);

if(!room){

ws.send(
JSON.stringify({
action:'error',
message:'Spelcode bestaat niet.'
})
);

return;

}

if(active(room).length>=4){

ws.send(
JSON.stringify({
action:'error',
message:'Dit spel zit al vol.'
})
);

return;

}

const p={

id:id(),

name:
String(
msg.name||'Speler'
)
.trim()
.slice(0,20),

money:100,

active:true,

admin:false,

ws

};

room.players.push(p);

ws.pid=p.id;
ws.room=room.code;

room.message=
p.name+
' is toegetreden.';

ws.send(
JSON.stringify({
action:'welcome',
id:p.id
})
);

broadcast(room);

return;

}

const room=
rooms.get(ws.room);

if(room)
handle(room,ws,msg);

});

ws.on('close',()=>{

const room=
rooms.get(ws.room);

if(!room)
return;

const p=
player(room,ws.pid);

if(p)
p.ws=null;

broadcast(room);

});

});

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
