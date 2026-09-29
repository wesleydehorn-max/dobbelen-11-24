const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const rooms = new Map();

const MAX_PLAYERS = 4;
const START_BALANCE = 100;
const EURO_PER_EYE = 0.50;
const DICE_COUNT = 5;

const html = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dobbelspel 11-24</title>

<style>
*{box-sizing:border-box}

body{
margin:0;
font-family:Arial,sans-serif;
background:#101827;
color:#fff;
min-height:100vh
}

button,input{
font:inherit
}

button{
border:0;
border-radius:12px;
padding:12px 16px;
font-weight:700;
cursor:pointer;
background:#18b6a4;
color:#fff
}

button:disabled{
opacity:.45;
cursor:not-allowed
}

.wrap{
max-width:900px;
margin:auto;
padding:18px
}

.card{
background:#1b2638;
border:1px solid #304057;
border-radius:18px;
padding:18px;
margin:12px 0;
box-shadow:0 8px 30px #0004
}

.logo{
font-size:28px;
font-weight:900;
color:#19c8b4
}

.muted{
color:#aeb9c9
}

.row{
display:flex;
gap:10px;
flex-wrap:wrap
}

.grow{
flex:1
}

.input{
width:100%;
padding:13px;
border-radius:12px;
border:1px solid #46556d;
background:#0e1624;
color:#fff
}

.hidden{
display:none
}

.dice{
display:flex;
justify-content:center;
gap:10px;
flex-wrap:wrap;
margin:18px 0
}

.die{
width:62px;
height:62px;
background:#fff;
color:#111;
border-radius:14px;
display:grid;
place-items:center;
font-size:28px;
font-weight:900;
border:4px solid transparent
}

.die.held{
border-color:#19c8b4;
transform:translateY(-5px)
}

.players{
display:grid;
grid-template-columns:repeat(auto-fit,minmax(160px,1fr));
gap:10px
}

.player{
background:#111b2a;
border-radius:12px;
padding:12px
}

.me{
outline:2px solid #19c8b4
}

.big{
font-size:42px;
font-weight:900;
text-align:center
}

.status{
text-align:center;
font-size:18px;
margin:10px
}

.chat{
height:150px;
overflow:auto;
background:#0e1624;
border-radius:12px;
padding:10px
}

.msg{
margin:5px 0
}

.danger{
background:#d94b4b
}

.secondary{
background:#40516b
}

.warn{
color:#ffd166
}

.small{
font-size:13px
}
</style>
</head>

<body>

<div class="wrap">

<div class="logo">
🎲 Dobbelspel 11-24
</div>

<div id="home" class="card">

<h2>Welkom</h2>

<p class="muted">
Speel met maximaal 4 spelers.
</p>

<input
id="name"
class="input"
maxlength="20"
placeholder="Je naam">

<div class="row" style="margin-top:10px">

<button onclick="createRoom()">
Nieuwe kamer
</button>

<button
class="secondary"
onclick="showJoin()">
Kamer joinen
</button>

</div>

<div
id="joinBox"
class="hidden"
style="margin-top:12px">

<input
id="code"
class="input"
maxlength="6"
placeholder="Kamercode">

<button
style="margin-top:8px"
onclick="joinRoom()">
Join kamer
</button>

</div>

<p id="homeMsg" class="warn"></p>

</div>

<div id="game" class="hidden">

<div class="card">

<div class="row">

<div class="grow">
<b>Kamer:</b>
<span id="roomCode"></span>
</div>

<div>
<b>Saldo:</b>
€<span id="balance">100.00</span>
</div>

</div>

<div id="status" class="status"></div>

</div>

<div class="card">

<h3>Spelers</h3>

<div id="players" class="players"></div>

</div>

<div class="card">

<div class="big" id="total">—</div>

<div class="muted" style="text-align:center">
Totaal van de dobbelstenen
</div>

<div id="dice" class="dice"></div>

<div class="row" style="justify-content:center">

<button id="roll" onclick="roll()">
🎲 Gooien
</button>

<button
id="hold"
class="secondary"
onclick="holdAll()">
Alles vasthouden
</button>

<button id="agree" onclick="agree()">
Akkoord
</button>

</div>

</div>

<div class="card">

<div class="row">

<button id="start" onclick="startGame()">
Start spel
</button>

<button class="danger" onclick="leaveRoom()">
Kamer verlaten
</button>

</div>

<p class="small muted">
Regel: totaal 11 t/m 24 = betalen;
anders verdien je het totaal × €0,50.
</p>

</div>

<div class="card">

<h3>Chat</h3>

<div id="chat" class="chat"></div>

<div class="row" style="margin-top:8px">

<input
id="chatInput"
class="input grow"
placeholder="Bericht...">

<button onclick="sendChat()">
Verstuur
</button>

</div>

</div>

</div>

</div>

<script>

let ws = null;
let room = null;
let me = null;

const $ = id => document.getElementById(id);

function msg(t){
$('homeMsg').textContent = t || '';
}

function connect(callback){

const proto =
location.protocol === 'https:'
? 'wss'
: 'ws';

ws = new WebSocket(
proto + '://' + location.host
);

ws.onopen = () => {
if(callback) callback();
};

ws.onmessage = e => {
handle(JSON.parse(e.data));
};

ws.onclose = () => {

if(room){
$('status').textContent =
'Verbinding verbroken';
}

};

ws.onerror = () => {
msg('Verbinding mislukt. Probeer opnieuw.');
};

}

function send(type,data={}){

if(ws && ws.readyState === WebSocket.OPEN){

ws.send(
JSON.stringify({
type,
...data
})
);

}

}

function getName(){

return $('name').value.trim() || 'Speler';

}

function createRoom(){

const name = getName();

connect(() => {

send('create',{
name:name
});

});

}

function showJoin(){

$('joinBox').classList.remove('hidden');

}

function joinRoom(){

const code =
$('code').value.trim().toUpperCase();

if(!code){

msg('Vul een kamercode in.');

return;

}

const name = getName();

connect(() => {

send('join',{
name:name,
code:code
});

});

}

function handle(m){

if(m.type === 'error'){

if(room){

$('status').textContent =
m.message;

}else{

msg(m.message);

}

return;

}

if(m.type === 'joined'){

room = m.state;
me = m.playerId;

$('home').classList.add('hidden');
$('game').classList.remove('hidden');

render(m.state);

return;

}

if(m.type === 'state'){

render(m.state);

return;

}

if(m.type === 'chat'){

const d =
document.createElement('div');

d.className = 'msg';

d.textContent =
m.name + ': ' + m.message;

$('chat').appendChild(d);

$('chat').scrollTop =
$('chat').scrollHeight;

return;

}

}

function render(s){

room = s;

$('roomCode').textContent =
s.code;

const mine =
s.players.find(p => p.id === me);

$('balance').textContent =
(mine ? mine.balance : 100).toFixed(2);

$('status').textContent =
s.message || '';

$('start').disabled =
s.started;

$('start').textContent =
s.started
? 'Spel bezig'
: 'Start spel';

const ps =
$('players');

ps.innerHTML = '';

s.players.forEach(p => {

const d =
document.createElement('div');

d.className =
'player' +
(p.id === me ? ' me' : '');

d.innerHTML =
'<b>' +
esc(p.name) +
'</b><br>€' +
Number(p.balance).toFixed(2) +
(p.id === s.turnPlayerId
? ' 🎯'
: '');

ps.appendChild(d);

});

const dice =
$('dice');

dice.innerHTML = '';

(s.dice || []).forEach((v,i) => {

const d =
document.createElement('button');

d.className =
'die' +
(s.held?.[i] ? ' held' : '');

d.textContent = v;

d.onclick = () => {

send('hold',{
index:i
});

};

dice.appendChild(d);

});

$('total').textContent =
s.dice?.length
? s.dice.reduce((a,b) => a+b,0)
: '—';

const myTurn =
s.turnPlayerId === me &&
s.started &&
!s.turnDone;

$('roll').disabled =
!myTurn ||
s.rolls >= 3;

$('hold').disabled =
!myTurn ||
!s.dice?.length;

$('agree').disabled =
!myTurn ||
!s.dice?.length ||
s.rolls < 1;

}

function esc(x){

return String(x).replace(
/[&<>"']/g,
c => ({
'&':'&amp;',
'<':'&lt;',
'>':'&gt;',
'"':'&quot;',
"'":'&#39;'
}[c])
);

}

function startGame(){

send('start');

}

function roll(){

send('roll');

}

function holdAll(){

send('holdAll');

}

function agree(){

send('agree');

}

function sendChat(){

const x =
$('chatInput');

const t =
x.value.trim();

if(t){

send('chat',{
message:t
});

x.value = '';

}

}

function leaveRoom(){

location.reload();

}

</script>

</body>
</html>`;

function cleanName(name){

return typeof name === 'string'
? name.trim().slice(0,20) || 'Speler'
: 'Speler';

}

function makeCode(){

let c;

do{

c =
Math.random()
.toString(36)
.slice(2,8)
.toUpperCase();

}while(rooms.has(c));

return c;

}

function playerState(p){

return {
id:p.id,
name:p.name,
balance:p.balance
};

}

function publicState(r){

return {

code:r.code,

started:r.started,

players:
r.players.map(playerState),

turnPlayerId:
r.players[r.turn]?.id || null,

dice:r.dice,

held:r.held,

rolls:r.rolls,

turnDone:r.turnDone,

message:r.message

};

}

function broadcast(r){

const state =
publicState(r);

r.clients.forEach(ws => {

send(ws,{
type:'state',
state
});

});

}

function send(ws,o){

if(
ws &&
ws.readyState ===
WebSocket.OPEN
){

ws.send(
JSON.stringify(o)
);

}

}

function finishTurn(r){

const p =
r.players[r.turn];

const total =
r.dice.reduce(
(a,b) => a+b,
0
);

let amount;

if(total >= 11 && total <= 24){

amount =
-total * EURO_PER_EYE;

p.balance =
Math.max(
0,
p.balance + amount
);

r.message =
p.name +
' betaalt €' +
(-amount).toFixed(2) +
' (totaal ' +
total +
').';

}else{

amount =
total * EURO_PER_EYE;

p.balance += amount;

r.message =
p.name +
' verdient €' +
amount.toFixed(2) +
' (totaal ' +
total +
').';

}

r.turnDone = true;

setTimeout(() => {

if(!rooms.has(r.code))
return;

r.turn =
(r.turn + 1) %
r.players.length;

r.dice = [];

r.held =
[
false,
false,
false,
false,
false
];

r.rolls = 0;

r.turnDone = false;

r.message =
r.players[r.turn].name +
' is aan de beurt.';

broadcast(r);

},1200);

}

function onMessage(ws,m){

if(
!m ||
typeof m.type !== 'string'
)
return;

if(m.type === 'create'){

const r = {

code:makeCode(),

started:false,

players:[],

clients:new Set(),

turn:0,

dice:[],

held:[
false,
false,
false,
false,
false
],

rolls:0,

turnDone:false,

message:'Wacht op spelers.'

};

const p = {

id:
Math.random()
.toString(36)
.slice(2),

name:
cleanName(m.name),

balance:
START_BALANCE,

ws

};

r.players.push(p);

r.clients.add(ws);

ws.room = r.code;

rooms.set(r.code,r);

send(ws,{

type:'joined',

room:r.code,

playerId:p.id,

state:publicState(r)

});

return;

}

if(m.type === 'join'){

const r =
rooms.get(
String(m.code || '')
.toUpperCase()
);

if(!r){

return send(ws,{
type:'error',
message:'Kamer bestaat niet.'
});

}

if(r.started){

return send(ws,{
type:'error',
message:'Het spel is al gestart.'
});

}

if(r.players.length >= MAX_PLAYERS){

return send(ws,{
type:'error',
message:'Kamer is vol.'
});

}

const p = {

id:
Math.random()
.toString(36)
.slice(2),

name:
cleanName(m.name),

balance:
START_BALANCE,

ws

};

r.players.push(p);

r.clients.add(ws);

ws.room = r.code;

send(ws,{

type:'joined',

room:r.code,

playerId:p.id,

state:publicState(r)

});

r.message =
p.name +
' is toegevoegd.';

broadcast(r);

return;

}

const r =
rooms.get(ws.room);

if(!r)
return;

const p =
r.players.find(
x => x.ws === ws
);

if(!p)
return;

if(m.type === 'start'){

if(r.players.length < 1){

return send(ws,{
type:'error',
message:'Er moet minimaal één speler zijn.'
});

}

r.started = true;

r.turn = 0;

r.message =
r.players[0].name +
' is aan de beurt.';

broadcast(r);

return;

}

if(m.type === 'roll'){

if(
!r.started ||
r.players[r.turn] !== p ||
r.turnDone ||
r.rolls >= 3
)
return;

if(!r.dice.length){

r.dice = [
1,
1,
1,
1,
1
];

}

for(
let i=0;
i<DICE_COUNT;
i++
){

if(!r.held[i]){

r.dice[i] =
1 +
Math.floor(
Math.random() * 6
);

}

}

r.rolls++;

r.message =
p.name +
' heeft gegooid (' +
r.rolls +
'/3).';

broadcast(r);

return;

}

if(m.type === 'hold'){

if(
r.players[r.turn] !== p ||
!r.dice.length ||
r.turnDone
)
return;

const i =
Number(m.index);

if(
Number.isInteger(i) &&
i >= 0 &&
i < 5
){

r.held[i] =
!r.held[i];

}

broadcast(r);

return;

}

if(m.type === 'holdAll'){

if(
r.players[r.turn] !== p ||
!r.dice.length ||
r.turnDone
)
return;

r.held =
r.held.map(
() => true
);

broadcast(r);

return;

}

if(m.type === 'agree'){

if(
r.players[r.turn] !== p ||
!r.dice.length ||
r.rolls < 1 ||
r.turnDone
)
return;

finishTurn(r);

broadcast(r);

return;

}

if(m.type === 'chat'){

const text =
String(
m.message || ''
)
.trim()
.slice(0,200);

if(text){

r.clients.forEach(c => {

send(c,{

type:'chat',

name:p.name,

message:text

});

});

}

}

}

const server =
http.createServer(
(req,res) => {

if(req.url === '/health'){

res.writeHead(
200,
{
'Content-Type':
'application/json; charset=utf-8'
}
);

return res.end(
JSON.stringify({
ok:true,
rooms:rooms.size
})
);

}

res.writeHead(
200,
{
'Content-Type':
'text/html; charset=utf-8'
}
);

res.end(html);

}
);

const wss =
new WebSocket.Server({
server
});

wss.on(
'connection',
ws => {

ws.on(
'message',
raw => {

try{

onMessage(
ws,
JSON.parse(
raw.toString()
)
);

}catch(e){

send(ws,{
type:'error',
message:'Ongeldig bericht.'
});

}

});

ws.on(
'close',
() => {

const r =
rooms.get(ws.room);

if(!r)
return;

r.clients.delete(ws);

const i =
r.players.findIndex(
p => p.ws === ws
);

if(i >= 0){

const name =
r.players[i].name;

r.players.splice(i,1);

if(r.players.length === 0){

rooms.delete(r.code);
return;

}

if(
r.turn >=
r.players.length
){

r.turn = 0;

}

r.message =
name +
' heeft de kamer verlaten.';

r.turnDone = false;

broadcast(r);

}

});

}
);

server.listen(
PORT,
() => {

console.log(
'Dobbelspel server draait op poort ' +
PORT
);

}
);
