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

body{
margin:0;
background:
radial-gradient(circle at 50% -10%,#610019,#16000d 45%,#07070b);
color:#fff;
font-family:Arial,sans-serif;
min-height:100vh
}

.app{
max-width:900px;
margin:auto;
padding:14px
}

h1{
text-align:center;
color:#ffd54a;
margin:4px 0;
font-size:32px;
text-shadow:0 0 14px #ff1744
}

.sub{
text-align:center;
color:#ffeaa0;
font-weight:700
}

.card{
margin-top:14px;
padding:15px;
border-radius:20px;
background:linear-gradient(145deg,#172338,#09101b);
border:2px solid #c99b27;
box-shadow:0 0 20px #0009
}

.hidden{
display:none!important
}

.row{
display:flex;
gap:8px;
justify-content:center;
flex-wrap:wrap
}

input{
padding:12px;
border-radius:11px;
border:1px solid #ffffff30;
background:#080d16;
color:#fff;
font-size:16px;
font-weight:700
}

button{
padding:12px 16px;
border:0;
border-radius:13px;
color:#fff;
background:linear-gradient(145deg,#435a76,#1a2739);
font-weight:900;
font-size:14px;
box-shadow:0 4px 9px #0008
}

button:disabled{
opacity:.35
}

.green{
background:#118d64
}

.orange{
background:#bf7614
}

.blue{
background:#123d75
}

.players{
display:grid;
grid-template-columns:repeat(4,1fr);
gap:8px;
margin-top:12px
}

.player{
padding:10px;
border-radius:13px;
background:#0a111d;
border:1px solid #ffffff18
}

.player.active{
outline:3px solid #ffd43b
}

.money{
font-size:20px;
font-weight:900;
margin-top:4px
}

.small{
font-size:12px;
color:#c9d0dc
}

.roomcode{
text-align:center;
font-size:30px;
letter-spacing:7px;
color:#ffd54a;
font-weight:900;
margin:8px
}

.turn{
text-align:center;
color:#ffd54a;
font-weight:900;
margin:9px
}

.banner{
min-height:65px;
display:flex;
align-items:center;
justify-content:center;
text-align:center;
padding:10px;
border-radius:16px;
border:3px solid #ffd43b;
font-size:28px;
font-weight:950;
text-transform:uppercase;
margin:12px 0
}

.banner.earn{
border-color:#18e58b;
background:#073729
}

.banner.pay{
border-color:#ffb42d;
background:#422500
}

.banner.end{
border-color:#ff4164;
background:#400716
}

.dice{
display:flex;
justify-content:center;
gap:12px;
flex-wrap:wrap;
padding:15px 0;
min-height:130px
}

.die{
width:74px;
height:74px;
position:relative;
cursor:pointer;
filter:drop-shadow(0 7px 7px #0009);
perspective:600px
}

.face{
width:74px;
height:74px;
padding:8px;
display:grid;
grid-template-columns:repeat(3,1fr);
grid-template-rows:repeat(3,1fr);
background:linear-gradient(145deg,#e32b2b,#9d080b);
border:2px solid #720608;
border-radius:12px;
box-shadow:
inset 0 2px 2px #fff8,
inset 0 -6px 9px #0003
}

/* VASTE DOBBELSTEEN */

.die.held{
filter:
drop-shadow(0 0 8px #ffd43b)
drop-shadow(0 0 17px #ffd43b)
}

.die.held .face{
border:4px solid #ffd43b;
box-shadow:
inset 0 2px 2px #fff8,
inset 0 -6px 9px #0003,
0 0 8px #ffd43b,
0 0 18px #ffd43b
}

.held:after{
content:'VAST';
position:absolute;
bottom:-15px;
left:0;
right:0;
text-align:center;
color:#ffd43b;
font-size:10px;
font-weight:900
}

.pip{
width:13px;
height:13px;
border-radius:50%;
background:#fff;
align-self:center;
justify-self:center;
box-shadow:
inset 1px 1px 2px #aaa,
0 1px 2px #420000
}

/* ECHTE 3D TUMBLE */

.rolling{
animation:casinoTumble .95s cubic-bezier(.18,.8,.2,1)
}

@keyframes casinoTumble{

0%{
transform:
translate3d(0,0,0)
rotateX(0deg)
rotateY(0deg)
rotateZ(0deg)
scale(1)
}

12%{
transform:
translate3d(-16px,-22px,20px)
rotateX(130deg)
rotateY(75deg)
rotateZ(-55deg)
scale(1.08)
}

25%{
transform:
translate3d(19px,8px,-10px)
rotateX(260deg)
rotateY(-145deg)
rotateZ(95deg)
scale(.93)
}

38%{
transform:
translate3d(-22px,-15px,15px)
rotateX(410deg)
rotateY(215deg)
rotateZ(-135deg)
scale(1.10)
}

52%{
transform:
translate3d(18px,5px,-15px)
rotateX(555deg)
rotateY(-300deg)
rotateZ(180deg)
scale(.94)
}

66%{
transform:
translate3d(-13px,-12px,12px)
rotateX(700deg)
rotateY(410deg)
rotateZ(-225deg)
scale(1.07)
}

80%{
transform:
translate3d(8px,4px,-5px)
rotateX(850deg)
rotateY(-500deg)
rotateZ(290deg)
scale(.98)
}

92%{
transform:
translate3d(-3px,-2px,2px)
rotateX(980deg)
rotateY(590deg)
rotateZ(-330deg)
scale(1.02)
}

100%{
transform:
translate3d(0,0,0)
rotateX(1080deg)
rotateY(-720deg)
rotateZ(360deg)
scale(1)
}

}

.total{
text-align:center;
font-size:48px;
font-weight:950
}

.label{
text-align:center;
color:#ffd54a;
font-size:12px;
font-weight:900;
letter-spacing:2px
}

.actions{
display:flex;
justify-content:center;
gap:8px;
flex-wrap:wrap
}

.log,.chat{
margin-top:13px;
background:#070c14;
border:1px solid #c99b2744;
border-radius:13px;
padding:10px
}

.log{
max-height:130px;
overflow:auto;
font-size:13px
}

.log div{
padding:5px;
border-bottom:1px solid #ffffff12
}

.chatlog{
height:120px;
overflow:auto;
font-size:13px
}

.chatmsg{
padding:4px;
border-bottom:1px solid #ffffff10
}

.admin{
margin-top:12px;
padding:10px;
border-radius:13px;
background:#070c14;
border:1px solid #c99b2744
}

.adminGrid{
display:grid;
grid-template-columns:repeat(4,1fr);
gap:5px;
margin-top:8px
}

.adminGrid button{
font-size:11px;
padding:8px 4px
}

@media(max-width:650px){

.players{
grid-template-columns:repeat(2,1fr)
}

.die,.face{
width:64px;
height:64px
}

.pip{
width:11px;
height:11px
}

.banner{
font-size:23px
}

}
</style>
</head>

<body>

<div class="app">

<div id="setup" class="card">

<h1>🎲 DOBBELEN 11/24</h1>

<div class="sub">
Online multiplayer • maximaal 4 spelers
</div>

<div style="margin:20px 0">

<h2 style="text-align:center;color:#ffd54a">
Nieuwe tafel
</h2>

<div class="row">

<input
id="adminName"
maxlength="18"
placeholder="Jouw naam">

<button
class="green"
onclick="createRoom()">
🎰 TAFEL MAKEN
</button>

</div>
</div>

<div>

<h2 style="text-align:center;color:#ffd54a">
Meedoen
</h2>

<div class="row">

<input
id="joinCode"
maxlength="6"
placeholder="TAFELCODE">

<input
id="playerName"
maxlength="18"
placeholder="Jouw naam">

<button
class="orange"
onclick="joinRoom()">
➡️ MEEDOEN
</button>

</div>
</div>

<p class="small" style="text-align:center">
Alleen virtueel geld.
</p>

</div>


<div id="game" class="hidden">

<h1>🎲 DOBBELEN 11/24</h1>

<div class="sub">
Online • gedeelde tafel
</div>

<div class="card">

<div id="roomInfo"
class="small"
style="text-align:center">
</div>

<div id="roomCode"
class="roomcode">
</div>

<div id="players"
class="players">
</div>

<div id="turn"
class="turn">
</div>

<div id="banner"
class="banner">
Wacht…
</div>

<div id="dice"
class="dice">
</div>

<div class="label">
TOTAAL
</div>

<div id="total"
class="total">
–
</div>

<div class="actions">

<button
id="begin"
class="green"
onclick="act('begin')">
🎲 BEGIN WORP
</button>

<button
id="reroll"
class="orange"
onclick="act('reroll')">
🎲 OPNIEUW GOOIEN
</button>

<button
id="accept"
class="blue"
onclick="act('accept')">
✅ AKKOORD
</button>

<button
id="undoHold"
onclick="act('undoHold')">
↩️ VASTZETTING TERUG
</button>

<button
id="undoAccept"
onclick="act('undoAccept')">
↩️ AKKOORD TERUG
</button>

</div>

<div
class="small"
style="text-align:center;margin-top:8px">

<strong>Na iedere worp moet minimaal 1 nieuwe dobbelsteen worden vastgezet.</strong>

</div>

<div id="log"
class="log">
</div>

<div id="admin"
class="admin">

<b>👑 ADMIN</b>

<div
class="row"
style="margin-top:8px">

<button
class="green"
onclick="act('startGame')">
▶️ START SPEL
</button>

<button
onclick="act('newGame')">
🔄 NIEUW SPEL
</button>

</div>

<div
id="adminGrid"
class="adminGrid">
</div>

</div>

<div class="chat">

<button onclick="toggleChat()">
💬 CHAT
</button>

<div id="chatContent">

<div id="chatlog"
class="chatlog">
</div>

<div class="row">

<input
id="chatInput"
maxlength="120"
placeholder="Typ een bericht…">

<button onclick="chatSend()">
Verstuur
</button>

</div>

</div>
</div>

<div
class="small"
style="text-align:center;margin-top:10px">

Deel tafelcode
<b id="codeBottom"></b>
met je medespelers.

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
var audioCtx=null;


/* =========================
   GELUID
========================= */

function getAudio(){

try{

if(!audioCtx){

audioCtx=new(
window.AudioContext||
window.webkitAudioContext
)();

}

if(audioCtx.state==='suspended'){
audioCtx.resume();
}

return audioCtx;

}catch(e){

return null;

}

}

function tone(freq,duration,type,volume){

try{

var ctx=getAudio();

if(!ctx)return;

var osc=ctx.createOscillator();
var gain=ctx.createGain();

osc.type=type||'sine';

osc.frequency.value=freq;

gain.gain.setValueAtTime(
0.0001,
ctx.currentTime
);

gain.gain.exponentialRampToValueAtTime(
volume||0.05,
ctx.currentTime+0.01
);

gain.gain.exponentialRampToValueAtTime(
0.0001,
ctx.currentTime+duration
);

osc.connect(gain);
gain.connect(ctx.destination);

osc.start();

osc.stop(
ctx.currentTime+duration+0.03
);

}catch(e){}

}

function rollSound(){

tone(100,.08,'square',.045);

setTimeout(function(){
tone(150,.08,'square',.05);
},70);

setTimeout(function(){
tone(210,.08,'square',.045);
},140);

setTimeout(function(){
tone(280,.12,'triangle',.05);
},210);

}

function holdSound(){

tone(450,.07,'square',.06);

setTimeout(function(){
tone(700,.12,'triangle',.07);
},70);

}

function acceptSound(){

tone(440,.08,'triangle',.06);

setTimeout(function(){
tone(660,.12,'triangle',.07);
},90);

}

function winSound(){

tone(520,.10,'triangle',.07);

setTimeout(function(){
tone(660,.10,'triangle',.07);
},100);

setTimeout(function(){
tone(880,.18,'triangle',.08);
},200);

}


/* =========================
   HULP
========================= */

function esc(s){

return String(s).replace(
/[&<>"]/g,
function(c){

return {
'&':'&amp;',
'<':'&lt;',
'>':'&gt;',
'"':'&quot;'
}[c];

}
);

}

function euro(n){

return '€'+
Number(n)
.toFixed(2)
.replace('.',',');

}


/* =========================
   API
========================= */

async function post(url,data){

var r=await fetch(
url,
{
method:'POST',
headers:{
'Content-Type':'application/json',
'X-Session':token
},
body:JSON.stringify(data||{})
}
);

var j=await r.json();

if(!r.ok){
throw Error(j.error||'Fout');
}

return j;

}


/* =========================
   TAFEL
========================= */

async function createRoom(){

try{

var j=await post(
'/api/create',
{
name:
document
.getElementById('adminName')
.value
.trim()||'Admin'
}
);

token=j.token;
adminToken=j.adminToken||'';

localStorage.setItem(
'd1124_token',
token
);

localStorage.setItem(
'd1124_admin',
adminToken
);

apply(j);
poll();

}catch(e){

alert(e.message);

}

}

async function joinRoom(){

try{

var j=await post(
'/api/join',
{
room:
document
.getElementById('joinCode')
.value
.trim()
.toUpperCase(),

name:
document
.getElementById('playerName')
.value
.trim()||'Speler'
}
);

token=j.token;
adminToken='';

localStorage.setItem(
'd1124_token',
token
);

localStorage.removeItem(
'd1124_admin'
);

apply(j);
poll();

}catch(e){

alert(e.message);

}

}


/* =========================
   ACTIE
========================= */

async function act(a,extra){

try{

if(a==='begin' || a==='reroll'){
rollSound();
}

if(a==='hold'){
holdSound();
}

if(a==='accept'){
acceptSound();
}

var data=Object.assign(
{
action:a,
adminToken:adminToken
},
extra||{}
);

var j=await post(
'/api/action',
data
);

apply(j);

}catch(e){

alert(e.message);

}

}


/* =========================
   CHAT
========================= */

async function chatSend(){

var x=document.getElementById(
'chatInput'
);

var t=x.value.trim();

if(!t)return;

try{

await post(
'/api/chat',
{
text:t
}
);

x.value='';

loadState();

}catch(e){

alert(e.message);

}

}

function toggleChat(){

document
.getElementById('chatContent')
.classList
.toggle('hidden');

}


/* =========================
   POLLING
========================= */

async function loadState(){

try{

var r=await fetch(
'/api/state',
{
headers:{
'X-Session':token
},
cache:'no-store'
}
);

if(!r.ok)return;

var j=await r.json();

if(j.version!==version){
apply(j);
}

}catch(e){}

}

function poll(){

if(timer)return;

timer=setInterval(
loadState,
500
);

}


/* =========================
   DOBBELSTEEN
========================= */

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

for(
var i=1;
i<=9;
i++
){

s+=
'<span class="pip" style="visibility:'+
(
pos.indexOf(i)>=0?
'visible':
'hidden'
)+
'"></span>';

}

return s;

}


/* =========================
   DOBBELSTENEN
========================= */

function renderDice(){

var d=document.getElementById(
'dice'
);

var html='';

var myTurn=
state.currentId===meId &&
state.players
.filter(function(p){
return p.active;
})
.some(function(p){
return p.id===meId;
});


for(
var i=0;
i<state.dice.length;
i++
){

var click='';

if(
myTurn &&
state.phase==='main' &&
state.hasRolled &&
!state.held[i]
){

click=
"act('hold',{index:"+i+"})";

}

html+=
'<div class="die '+
(
state.held[i]?
'held ':
''
)+
'" onclick="'+
click+
'">'+

'<div class="face">'+
face(state.dice[i])+
'</div>'+

'</div>';

}

d.innerHTML=html;


/*
 Alleen de losse stenen animeren
 wanneer er daadwerkelijk opnieuw
 gegooid is.
*/

var now=state.dice.join(',');

if(
now!==lastDice &&
now
){

var els=
d.querySelectorAll('.die');

for(
var k=0;
k<els.length;
k++
){

/*
 Vaste steen = nooit animeren.
*/

if(state.held[k]){
continue;
}

els[k].classList.add(
'rolling'
);

(function(el,delay){

setTimeout(
function(){

el.classList.remove(
'rolling'
);

},
1050+delay
);

})(
els[k],
k*70
);

}

}

lastDice=now;

}


/* =========================
   SCHERM
========================= */

function apply(j){

if(!j||!j.state)return;

state=j.state;

version=
j.version==null?
version:
j.version;

if(j.me){
meId=j.me;
}

document
.getElementById('setup')
.classList
.add('hidden');

document
.getElementById('game')
.classList
.remove('hidden');

document
.getElementById('roomCode')
.textContent=
state.code;

document
.getElementById('codeBottom')
.textContent=
state.code;

document
.getElementById('roomInfo')
.textContent=
state.started?
'Spel bezig':
'Wacht op start door admin';

document
.getElementById('turn')
.textContent=
state.started?
state.currentName+
' is aan de beurt':
'';

document
.getElementById('banner')
.textContent=
state.banner.text;

document
.getElementById('banner')
.className=
'banner '+
(state.banner.type||'');


document
.getElementById('players')
.innerHTML=
state.players
.map(function(p){

return '<div class="player '+
(
p.id===state.currentId?
'active':
''
)+
'">'+

'<b>'+
esc(p.name)+
(
p.admin?
' 👑':
''
)+
'</b>'+

'<div class="money">'+
euro(p.balance)+
'</div>'+

'<div class="small">'+
(
p.active?
'🟢 Actief':
'⏸️ Gepauzeerd'
)+
'</div>'+

'</div>';

})
.join('');


renderDice();


document
.getElementById('total')
.textContent=
state.dice.length?
state.dice.reduce(
function(a,b){
return a+b;
},
0
):
'–';


var mine=
state.currentId===meId &&
state.started;


/*
 BEGIN WORP
*/

document
.getElementById('begin')
.disabled=
!mine ||
state.phase!=='idle';


/*
 OPNIEUW GOOIEN

 Belangrijk:

 mustHold=true betekent:
 eerst een nieuwe steen vastzetten.

*/

document
.getElementById('reroll')
.disabled=
!mine ||
!state.hasRolled ||
state.mustHold ||
state.held.every(Boolean);


/*
 AKKOORD

 Ook hier moet eerst minimaal
 één steen zijn vastgezet.
*/

document
.getElementById('accept')
.disabled=
!mine ||
state.phase!=='main' ||
!state.hasRolled ||
state.mustHold;


/*
 UNDO VASTZETTEN
*/

document
.getElementById('undoHold')
.disabled=
!mine ||
!state.lastHold;


/*
 UNDO AKKOORD
*/

document
.getElementById('undoAccept')
.disabled=
!mine ||
!state.canUndoAccept;


/*
 ADMIN
*/

document
.getElementById('admin')
.classList
.toggle(
'hidden',
!state.isAdmin
);


document
.getElementById('adminGrid')
.innerHTML=
state.isAdmin?
state.players
.map(function(p){

if(p.admin){

return '<button disabled>'+
'👑 '+
esc(p.name)+
'</button>';

}

return '<button onclick="act(\'togglePlayer\',{id:\''+
p.id+
'\'})">'+
(
p.active?
'⏸️':
'▶️'
)+
' '+
esc(p.name)+
'</button>'+

'<button onclick="if(confirm(\'Speler verwijderen?\'))act(\'removePlayer\',{id:\''+
p.id+
'\'})">'+
'❌'+
'</button>';

})
.join(''):
'';


/*
 LOG
*/

document
.getElementById('log')
.innerHTML=
(state.log||[])
.slice(-25)
.reverse()
.map(function(x){

return '<div>'+
esc(x)+
'</div>';

})
.join('');


/*
 CHAT
*/

if(j.chat){

document
.getElementById('chatlog')
.innerHTML=
j.chat
.map(function(m){

return '<div class="chatmsg">'+
'<b>'+
esc(m.name)+
':</b> '+
esc(m.text)+
'</div>';

})
.join('');

var c=
document.getElementById(
'chatlog'
);

c.scrollTop=c.scrollHeight;

}

}


/*
 AUTOMATISCH LADEN
*/

if(token){

loadState();
poll();

}

document
.getElementById('chatInput')
.addEventListener(
'keydown',
function(e){

if(e.key==='Enter'){
chatSend();
}

}
);

</script>

</body>
</html>`;


/* =====================================================
   SERVER FUNCTIES
===================================================== */

const alphabet=
'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';


function id(){

return crypto
.randomBytes(8)
.toString('hex');

}


function token(){

return crypto
.randomBytes(18)
.toString('hex');

}


function die(){

return 1+
Math.floor(
Math.random()*6
);

}


function roll(){

return Array.from(
{length:5},
die
);

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
];

}
).join('');

}while(rooms.has(c));

return c;

}


function money(n){

return Math.round(n*100)/100;

}


function active(r){

return r.players.filter(
function(p){
return p.active;
}
);

}


function log(r,s){

r.log.push(s);

if(r.log.length>60){
r.log.shift();
}

}


function nextPlayer(r){

for(
let n=1;
n<=r.players.length;
n++
){

const i=
(r.current+n)%
r.players.length;

if(
r.players[i] &&
r.players[i].active
){

return i;

}

}

return -1;

}


/* =====================================================
   BEURT RESET
===================================================== */

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

/*
 Bij een nieuwe beurt hoeft er nog
 geen steen vast te staan.
 Zodra BEGIN WORP wordt gedaan,
 wordt mustHold=true.
*/

r.mustHold=false;

r.target=null;
r.mode=null;

r.lastHold=null;
r.canUndo=null;

r.banner={
text:
(
r.players[r.current]?
r.players[r.current].name:
''
)+
' is aan de beurt. Klik op BEGIN WORP.',
type:''
};

}


/* =====================================================
   GELD
===================================================== */

function transfer(r,p,amount,earning){

const others=
active(r)
.filter(function(x){
return x.id!==p.id;
});


if(earning){

p.balance=
money(
p.balance+
amount*others.length
);

others.forEach(
function(x){

x.balance=
money(
x.balance-amount
);

}
);

}else{

p.balance=
money(
p.balance-
amount*others.length
);

others.forEach(
function(x){

x.balance=
money(
x.balance+amount
);

}
);

}

}


/* =====================================================
   STATE
===================================================== */

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

/*
 Dit is de belangrijkste nieuwe
 beveiliging.
*/

mustHold:!!r.mustHold,

target:r.target,

mode:r.mode,

banner:r.banner,

log:r.log,

canUndoAccept:!!r.canUndo,

lastHold:!!r.lastHold,

players:r.players.map(
function(x){

return {
id:x.id,
name:x.name,
balance:x.balance,
active:x.active,
admin:x.admin
};

}
),

isAdmin:!!p.admin

};

}


function push(r){

r.version++;

}


/* =====================================================
   VOLGENDE SPELER
===================================================== */

function finishTurn(r){

const old=
r.players[r.current]?
r.players[r.current].name:
'';

const n=nextPlayer(r);

if(n>=0){
r.current=n;
}

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

push(r);

}


/* =====================================================
   DOEL BEPALEN
===================================================== */

function targetFor(total){

if(total<11){

return {
mode:'earn',
n:Math.min(
6,
11-total
)
};

}

if(total>24){

return {
mode:'earn',
n:Math.min(
6,
total-24
)
};

}

return {

mode:'pay',

n:Math.min(
6,
Math.min(
total-11,
24-total
)
)

};

}


/* =====================================================
   VERDIENEN / BETALEN
===================================================== */

function resolveEarnPay(r){

let hits=0;

for(
let i=0;
i<5;
i++
){

if(
!r.settled[i] &&
r.dice[i]===r.target
){

r.settled[i]=true;

/*
 Doelstenen blijven automatisch vast.
*/

r.held[i]=true;

hits++;

}

}


if(!hits){

r.banner={
text:
'❌ MIS — geen nieuwe doel-dobbelsteen',
type:'end'
};

log(
r,
'❌ Geen nieuwe '+
r.target+
'. Beurt voorbij.'
);

finishTurn(r);

return;

}


const p=r.players[r.current];

const amount=
r.target*0.5;

transfer(
r,
p,
amount,
r.mode==='earn'
);


r.banner={
text:
(
r.mode==='earn'?
'VERDIENEN: ':
'BETALEN: '
)+
r.target+
'’EN',
type:r.mode
};


log(
r,
(
r.mode==='earn'?
'💰 ':
'💸 '
)+
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

r.mustHold=false;

push(r);

}


/* =====================================================
   AKKOORD
===================================================== */

function accept(r){

const p=r.players[r.current];

if(
r.phase!=='main' ||
!r.hasRolled
){

throw Error(
'Er is niets om te accepteren.'
);

}


/*
 Na iedere worp moet eerst
 minimaal één steen worden vastgezet.
*/

if(r.mustHold){

throw Error(
'Je moet eerst minimaal 1 dobbelsteen vastzetten.'
);

}


r.canUndo={
dice:r.dice.slice(),
held:r.held.slice()
};


const total=
r.dice.reduce(
function(a,b){
return a+b;
},
0
);


/* 11 OF 24 */

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

return;

}


/* DOEL */

let t=
targetFor(total);


/* VIJF DEZELFDE */

if(
r.dice.every(
function(v){
return v===r.dice[0];
}
)
){

t={
mode:'earn',
n:6
};

}


r.mode=t.mode;

r.target=t.n;

r.phase='round';

r.mustHold=false;

r.banner={
text:
(
t.mode==='earn'?
'VERDIENEN: ':
'BETALEN: '
)+
t.n+
'’EN',
type:t.mode
};

log(
r,
p.name+
': '+
(
t.mode==='earn'?
'verdienen ':
'betalen '
)+
t.n+
'’en.'
);

resolveEarnPay(r);

}


/* =====================================================
   ACTIES
===================================================== */

function act(r,p,a,b){

if(
[
'startGame',
'newGame',
'togglePlayer',
'removePlayer'
].includes(a)
){

if(!p.admin){

throw Error(
'Alleen de admin kan dit.'
);

}


/* TOGGLE PLAYER */

if(a==='togglePlayer'){

const q=
r.players.find(
function(x){
return x.id===b.id;
}
);

if(!q){

throw Error(
'Speler niet gevonden.'
);

}

q.active=!q.active;

if(
r.players[r.current]===q &&
!q.active
){

const n=nextPlayer(r);

if(n>=0){
r.current=n;
}

}

resetTurn(r);

log(
r,
(
q.active?
'▶️ ':
'⏸️ '
)+
q.name+
(
q.active?
' is actief.':
' is gepauzeerd.'
)
);

push(r);

return;

}


/* REMOVE PLAYER */

if(a==='removePlayer'){

const i=
r.players.findIndex(
function(x){
return x.id===b.id;
}
);

if(i<0){

throw Error(
'Speler niet gevonden.'
);

}

if(r.players[i].admin){

throw Error(
'Admin kan niet worden verwijderd.'
);

}

const name=
r.players[i].name;

r.players.splice(i,1);

if(r.players.length<1){

throw Error(
'Geen spelers meer.'
);

}

if(r.current>=r.players.length){

r.current=0;

}

resetTurn(r);

log(
r,
'❌ '+
name+
' is verwijderd.'
);

push(r);

return;

}


/* NEW GAME */

if(a==='newGame'){

r.started=false;

r.players.forEach(
function(x){
x.balance=100;
}
);

r.current=0;

r.log=[];

resetTurn(r);

r.banner={
text:
'Wacht op de admin om het spel te starten.',
type:''
};

push(r);

return;

}


/* START GAME */

if(active(r).length<2){

throw Error(
'Minimaal 2 actieve spelers nodig.'
);

}

r.players.forEach(
function(x){
x.balance=100;
}
);

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

return;

}


if(!r.started){

throw Error(
'Het spel is nog niet gestart.'
);

}


/* BEURT CONTROLE */

if(
!r.players[r.current] ||
r.players[r.current].id!==p.id ||
!p.active
){

throw Error(
'Je bent niet aan de beurt.'
);

}


/* =====================================================
   BEGIN WORP
===================================================== */

if(a==='begin'){

if(r.phase!=='idle'){

throw Error(
'Je kunt nu niet beginnen.'
);

}

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

/*
 HIER begint de verplichte fase:
 na deze worp moet minimaal
 één steen worden vastgezet.
*/

r.mustHold=true;

r.phase='main';

r.lastHold=null;

r.banner={
text:
'VERPLICHT: zet minimaal 1 dobbelsteen vast.',
type:''
};

log(
r,
'🎲 '+
p.name+
' doet de worp.'
);

push(r);

return;

}


/* =====================================================
   VASTZETTEN
===================================================== */

if(a==='hold'){

if(
r.phase!=='main' ||
!r.hasRolled
){

throw Error(
'Vastzetten kan nu niet.'
);

}

const i=Number(b.index);

if(
i<0 ||
i>4
){

throw Error(
'Ongeldige dobbelsteen.'
);

}

if(r.held[i]){

throw Error(
'Deze dobbelsteen staat al vast.'
);

}


/*
 Bewaar toestand voor UNDO.
*/

r.lastHold={
dice:r.dice.slice(),
held:r.held.slice()
};


/*
 Nieuwe steen vastzetten.
*/

r.held[i]=true;


/*
 Zodra minimaal één nieuwe steen
 is vastgezet, mag er weer gegooid worden.
*/

r.mustHold=false;

r.banner={
text:
'VAST — je mag nu opnieuw gooien.',
type:''
};

log(
r,
'🔒 '+
p.name+
' zet dobbelsteen '+
(i+1)+
' vast.'
);

push(r);

return;

}


/* =====================================================
   OPNIEUW GOOIEN
===================================================== */

if(a==='reroll'){

if(r.phase==='main'){

/*
 ABSOLUUT VERPLICHT:
 eerst minimaal één nieuwe steen
 vastzetten.
*/

if(r.mustHold){

throw Error(
'Je moet eerst minimaal 1 nieuwe dobbelsteen vastzetten.'
);

}


/*
 Alle stenen vast?
*/

if(r.held.every(Boolean)){

throw Error(
'Alle 5 dobbelstenen staan al vast.'
);

}


/*
 Alleen losse stenen opnieuw gooien.
*/

for(
let i=0;
i<5;
i++
){

if(!r.held[i]){

r.dice[i]=die();

}

}


/*
 NIEUWE WORP = opnieuw verplicht
 minimaal één nieuwe steen vastzetten.
*/

r.mustHold=true;

r.lastHold=null;

r.banner={
text:
'Nieuwe worp — VERPLICHT minimaal 1 nieuwe steen vastzetten.',
type:''
};

log(
r,
'🎲 '+
p.name+
' gooit opnieuw.'
);

push(r);

return;

}


/* =====================================================
   EARN / PAY RONDE
===================================================== */

if(r.phase==='round'){

for(
let i=0;
i<5;
i++
){

if(!r.settled[i]){

r.dice[i]=die();

}

}

resolveEarnPay(r);

return;

}

}


/* =====================================================
   AKKOORD
===================================================== */

if(a==='accept'){

accept(r);

return;

}


/* =====================================================
   VASTZETTING TERUG
===================================================== */

if(a==='undoHold'){

if(!r.lastHold){

throw Error(
'Geen laatste vastzetting.'
);

}

r.dice=
r.lastHold.dice.slice();

r.held=
r.lastHold.held.slice();

/*
 Omdat de vorige actie een vastzetting
 was, moet de speler weer vastzetten
 voordat er opnieuw gegooid mag worden.
*/

r.mustHold=true;

r.lastHold=null;

r.banner={
text:
'Vastzetting terug — zet opnieuw minimaal 1 steen vast.',
type:''
};

push(r);

return;

}


/* =====================================================
   AKKOORD TERUG
===================================================== */

if(a==='undoAccept'){

if(!r.canUndo){

throw Error(
'AKKOORD kan nu niet terug.'
);

}

r.dice=
r.canUndo.dice.slice();

r.held=
r.canUndo.held.slice();

r.phase='main';

r.canUndo=null;

r.target=null;

r.mode=null;

r.mustHold=false;

r.banner={
text:
'AKKOORD terug — je kunt verder spelen.',
type:''
};

push(r);

return;

}


throw Error(
'Onbekende actie.'
);

}


/* =====================================================
   ROOM MAKEN
===================================================== */

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

/*
 Nieuwe serverbeveiliging.
*/

mustHold:false,

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

return [
r,
p
];

}


/* =====================================================
   JSON
===================================================== */

function json(
res,
obj,
status=200
){

const s=
JSON.stringify(obj);

res.writeHead(
status,
{
'Content-Type':
'application/json; charset=utf-8',

'Cache-Control':
'no-store'
}
);

res.end(s);

}


/* =====================================================
   BODY
===================================================== */

function getBody(req){

return new Promise(
function(resolve,reject){

let d='';

req.on(
'data',
function(c){

d+=c;

if(d.length>100000){

reject(
Error(
'Payload te groot'
)
);

}

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
Error(
'Ongeldige JSON'
)
);

}

}
);

}
);

}


/* =====================================================
   SESSION
===================================================== */

function session(req){

return sessions.get(
req.headers['x-session']
);

}


/* =====================================================
   HTTP SERVER
===================================================== */

const server=
http.createServer(
async function(req,res){

try{

const u=
new URL(
req.url,
'http://localhost'
);


/* HOME */

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

return res.end(HTML);

}


/* HEALTH */

if(
req.method==='GET' &&
u.pathname==='/health'
){

return json(
res,
{ok:true}
);

}


/* STATE */

if(
req.method==='GET' &&
u.pathname==='/api/state'
){

const s=session(req);

if(!s){

return json(
res,
{error:'Geen sessie'},
401
);

}

return json(
res,
{
state:
state(
s.room,
s.player
),

version:
s.room.version,

chat:
s.room.chat,

me:
s.player.id
}
);

}


/* CREATE */

if(
req.method==='POST' &&
u.pathname==='/api/create'
){

const b=
await getBody(req);

const pair=
createRoom(b.name);

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

adminToken:
p.adminToken,

state:
state(r,p),

version:
r.version,

chat:r.chat,

me:p.id
}
);

}


/* JOIN */

if(
req.method==='POST' &&
u.pathname==='/api/join'
){

const b=
await getBody(req);

const r=
rooms.get(
String(
b.room||''
).toUpperCase()
);

if(!r){

throw Error(
'Tafel niet gevonden.'
);

}

if(r.started){

throw Error(
'Dit spel is al gestart.'
);

}

if(r.players.length>=4){

throw Error(
'Deze tafel zit vol.'
);

}

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

state:
state(r,p),

version:
r.version,

chat:r.chat,

me:p.id
}
);

}


/* ACTION */

if(
req.method==='POST' &&
u.pathname==='/api/action'
){

const s=session(req);

if(!s){

return json(
res,
{error:'Geen sessie'},
401
);

}

const b=
await getBody(req);

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
state:
state(
s.room,
s.player
),

version:
s.room.version,

chat:
s.room.chat,

me:
s.player.id
}
);

}


/* CHAT */

if(
req.method==='POST' &&
u.pathname==='/api/chat'
){

const s=session(req);

if(!s){

return json(
res,
{error:'Geen sessie'},
401
);

}

const b=
await getBody(req);

s.room.chat.push(
{
name:s.player.name,

text:String(
b.text||''
).slice(0,120)
}
);

if(s.room.chat.length>100){

s.room.chat.shift();

}

push(s.room);

return json(
res,
{
ok:true,
version:s.room.version
}
);

}


/* NOT FOUND */

return json(
res,
{error:'Not found'},
404
);


}catch(e){

return json(
res,
{
error:
e.message||
'Fout'
},
400
);

}

}
);


server.listen(
PORT,
function(){

console.log(
'Dobbelen 11/24 draait op poort '+
PORT
);

}
);
