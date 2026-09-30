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
body{margin:0;color:#fff;font-family:Arial,sans-serif;min-height:100vh;background:radial-gradient(circle at 50% 0,#650018,#19000d 45%,#06070c)}
.app{max-width:900px;margin:auto;padding:14px}
h1{text-align:center;color:#ffd85a;font-size:32px;margin:5px 0;text-shadow:0 0 12px #ff1744}
.card{margin-top:14px;padding:16px;border-radius:20px;background:linear-gradient(145deg,#162235,#0b1220);border:2px solid #d5a72c;box-shadow:0 0 18px #ff174433}
.sub{text-align:center;color:#fff7c2;font-weight:700}
input{width:100%;padding:13px;border-radius:12px;border:1px solid #777;background:#080e18;color:white;font-size:16px}
button{border:1px solid #ffffff44;border-radius:13px;padding:12px 17px;color:#fff;background:linear-gradient(145deg,#394d67,#1c293b);font-weight:900;font-size:15px;cursor:pointer}
button:disabled{opacity:.4;cursor:not-allowed}
.green{background:linear-gradient(145deg,#15986c,#08733f)}
.orange{background:linear-gradient(145deg,#d88900,#ffb51b)}
.blue{background:linear-gradient(145deg,#071a3d,#123b78)}
.red{background:#8b2530}
.controls{display:flex;gap:9px;flex-wrap:wrap;justify-content:center;margin:10px 0}
.players{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}
.player{padding:12px;border-radius:14px;background:#101a2b;border:1px solid #fff3}
.player.activeTurn{outline:3px solid #ffd23f;box-shadow:0 0 18px #ff174466}
.money{font-size:22px;font-weight:900;margin-top:4px}
.actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
.actions button{padding:6px 8px;font-size:12px}
.dice{display:flex;justify-content:center;flex-wrap:wrap;gap:14px;padding:25px 8px;margin:16px auto;border-radius:25px;background:radial-gradient(circle,#2c9152,#073c25 70%);border:3px solid #d6b45c;box-shadow:inset 0 0 30px #0008,0 8px 22px #0008}
.die{width:82px;height:82px;background:linear-gradient(145deg,#ff2929,#8d0010);border:3px solid #ffd873;border-radius:18px;padding:10px;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);box-shadow:inset 0 0 7px #fff8,0 7px 14px #0008;cursor:pointer}
.die.held{transform:translateY(-7px);outline:4px solid #61ffb5;box-shadow:0 0 18px #61ffb5}
.pip{width:13px;height:13px;border-radius:50%;background:#fff;justify-self:center;align-self:center;box-shadow:0 1px 2px #400}
.banner{text-align:center;margin:10px auto;padding:15px;border-radius:17px;font-size:28px;font-weight:900}
.earn{background:#063b2b;border:3px solid #18e58b}
.pay{background:#4b2600;border:3px solid #ffb52e}
.special{background:#4a0718;border:3px solid #ff3d61}
.hidden{display:none!important}
.log{max-height:120px;overflow:auto;background:#070c14;border-radius:12px;padding:9px;font-size:13px}
.chat{margin-bottom:90px}
.messages{max-height:170px;overflow:auto;background:#070c14;border-radius:12px;padding:9px;margin-bottom:8px}
.msg{padding:4px 0}
.rule{position:fixed;left:10px;bottom:10px;background:#111827ee;border:1px solid #ffd23f;padding:8px 11px;border-radius:10px;font-size:13px;z-index:10}
.share{font-size:15px;word-break:break-all;text-align:center;background:#070c14;border-radius:12px;padding:10px;margin:10px 0}
.error{color:#ff7d9b;text-align:center;font-weight:bold;margin:8px}
.wait{text-align:center;color:#ffd85a;font-size:18px;font-weight:900;padding:10px}
@media(max-width:650px){
.players{grid-template-columns:repeat(2,1fr)}
.die{width:68px;height:68px;padding:8px}
.pip{width:11px;height:11px}
.dice{gap:9px;padding:18px 5px}
.banner{font-size:21px}
}
</style>
</head>

<body>
<div class="app">

<h1>🎲 DOBBELEN 11/24</h1>

<div id="login" class="card">

<div id="invite" class="hidden">
<h2 style="text-align:center">🎲 Je bent uitgenodigd!</h2>
<div class="sub">Vul je naam in en neem plaats in de wachtruimte.</div>
</div>

<h2>Naam</h2>
<input id="name" maxlength="20" placeholder="Jouw naam">

<div id="normalJoin">
<h2>Nieuw spel</h2>
<div class="controls">
<button class="green" onclick="createRoom()">🎲 SPEL MAKEN</button>
</div>

<h2>Of meedoen</h2>
<input id="code" maxlength="4" placeholder="Spelcode">
<div class="controls">
<button class="blue" onclick="joinRoom()">MEEDOEN</button>
</div>
</div>

<div id="inviteJoin" class="hidden">
<div class="controls">
<button class="green" onclick="joinInvite()">🟢 DEELNEMEN</button>
</div>
</div>

<div id="err" class="error"></div>
</div>

<div id="game" class="hidden">

<div class="card">

<div id="roomInfo" class="sub"></div>

<div id="shareBox" class="share hidden"></div>

<div id="players" class="players"></div>

<div id="lobbyMessage" class="wait"></div>

<div id="adminControls" class="controls"></div>

</div>

<div id="banner" class="banner hidden"></div>

<div class="card">

<div id="message" class="sub"></div>

<div id="dice" class="dice"></div>

<div class="sub">
<div id="total" style="font-size:45px;font-weight:900">—</div>
<div id="totalLabel">TOTAAL</div>
</div>

<div class="controls">

<button id="roll" class="orange" onclick="sendRoll()">
🎲 BEGIN WORP
</button>

<button id="accept" class="blue" onclick="sendAccept()">
AKKOORD
</button>

</div>

<div id="log" class="log"></div>

</div>

<div class="card chat">

<h3>💬 CHAT</h3>

<div id="messages" class="messages"></div>

<div class="controls">
<input id="chatInput" maxlength="120" placeholder="Typ een bericht...">
<button class="blue" onclick="sendChat()">VERSTUUR</button>
</div>

</div>

</div>

</div>

<div class="rule">🚩 Regel: 5 dezelfde = 6️⃣ verdienen</div>

<script>
let ws=null;
let myId=null;
let state=null;
let inviteCode=new URLSearchParams(location.search).get("room")||"";

function esc(x){
return String(x||"").replace(/[&<>"']/g,c=>({
"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
}

function connect(action,name,code){
ws=new WebSocket(
(location.protocol==="https:"?"wss://":"ws://")+location.host
);

ws.onopen=()=>{
ws.send(JSON.stringify({action,name,code}));
};

ws.onmessage=e=>{
let m;
try{m=JSON.parse(e.data)}catch{return}

if(m.action==="welcome"){
myId=m.id;
return;
}

if(m.action==="error"){
document.getElementById("err").textContent=m.message||"Er ging iets mis.";
return;
}

if(m.action==="state"){
state=m.state;
render();
}
};

ws.onclose=()=>{
document.getElementById("message").textContent=
"Verbinding verbroken. Vernieuw de pagina.";
};
}

function createRoom(){
const name=document.getElementById("name").value.trim();
if(!name){
document.getElementById("err").textContent="Vul eerst je naam in.";
return;
}
connect("create",name,"");
}

function joinRoom(){
const name=document.getElementById("name").value.trim();
const code=document.getElementById("code").value.trim().toUpperCase();

if(!name){
document.getElementById("err").textContent="Vul eerst je naam in.";
return;
}

if(code.length!==4){
document.getElementById("err").textContent="Vul een geldige spelcode in.";
return;
}

connect("join",name,code);
}

function joinInvite(){
const name=document.getElementById("name").value.trim();

if(!name){
document.getElementById("err").textContent="Vul eerst je naam in.";
return;
}

connect("join",name,inviteCode.toUpperCase());
}

function send(x){
if(ws&&ws.readyState===WebSocket.OPEN)
ws.send(JSON.stringify(x));
}

function sendRoll(){
send({action:"roll"});
}

function sendAccept(){
send({action:"accept"});
}

function hold(i){
send({action:"hold",index:i});
}

function sendChat(){
const input=document.getElementById("chatInput");
const text=input.value.trim();
if(!text)return;
send({action:"chat",text});
input.value="";
}

function shareLink(){
const url=location.origin+"/?room="+state.code;
navigator.clipboard.writeText(url).then(()=>{
alert("Uitnodigingslink gekopieerd! Je kunt hem nu via WhatsApp versturen.");
}).catch(()=>{
prompt("Kopieer deze link:",url);
});
}

function render(){

document.getElementById("login").classList.add("hidden");
document.getElementById("game").classList.remove("hidden");

const me=state.players.find(p=>p.id===myId);
const admin=me&&me.admin;

document.getElementById("roomInfo").innerHTML=
"🎲 SPELCODE: <b>"+state.code+"</b>";

const share=document.getElementById("shareBox");

if(admin&&state.phase==="lobby"){
const url=location.origin+"/?room="+state.code;

share.classList.remove("hidden");

share.innerHTML=
"🔗 <b>UITNODIGINGSLINK</b><br>"+
"<span>"+esc(url)+"</span><br><br>"+
"<button class='green' onclick='shareLink()'>📋 LINK KOPIËREN</button>";
}else{
share.classList.add("hidden");
}

document.getElementById("players").innerHTML=
state.players.map(p=>{

let buttons="";

if(admin&&!p.admin){

buttons=
"<div class='actions'>"+
"<button onclick=\"send({action:'pause',id:'"+p.id+"'})\">"+
(p.active?"⏸️ PAUZE":"▶️ ACTIEF")+
"</button>"+
"<button class='red' onclick=\"send({action:'remove',id:'"+p.id+"'})\">❌</button>"+
"</div>";

}

return "<div class='player "+
(p.id===state.turn?"activeTurn":"")+"'>"+
"<b>"+(p.admin?"👑 ":"")+esc(p.name)+"</b>"+
"<div class='money'>€"+p.money.toFixed(2).replace(".",",")+"</div>"+
"<div class='small'>"+
(p.active?"🟢 Actief":"⏸️ Pauze")+
(p.connected?"":" • offline")+
"</div>"+
buttons+
"</div>";

}).join("");

if(state.phase==="lobby"){

document.getElementById("lobbyMessage").innerHTML=
admin
?"👑 Jij bent de beheerder. Wacht tot iedereen aanwezig is en druk daarna op START SPEL."
:"⏳ Je zit in de wachtruimte. De beheerder moet het spel starten.";

document.getElementById("adminControls").innerHTML=
admin
?"<button class='green' onclick=\"send({action:'start'})\">🟢 START SPEL</button>"
:"";

}else{

document.getElementById("lobbyMessage").innerHTML="";
document.getElementById("adminControls").innerHTML="";

}

document.getElementById("message").textContent=state.message||"";

document.getElementById("dice").innerHTML=
state.dice.map((v,i)=>{

return "<div class='die "+
(state.held[i]?"held":"")+
"' onclick='hold("+i+")'>"+
makeFace(v)+
"</div>";

}).join("");

document.getElementById("total").textContent=
state.phase==="main"
?(state.rolled?state.dice.reduce((a,b)=>a+b,0):"—")
:(state.target||"—");

document.getElementById("totalLabel").textContent=
state.phase==="main"?"TOTAAL":"DOELSTEEN";

const banner=document.getElementById("banner");

if(state.phase==="earn"){
banner.className="banner earn";
banner.textContent="VERDIENEN: "+state.target+"'S";
}else if(state.phase==="pay"){
banner.className="banner pay";
banner.textContent="BETALEN: "+state.target+"'S";
}else{
banner.className="banner hidden";
}

const mine=state.turn===myId;

document.getElementById("roll").style.display=
mine&&state.phase!=="lobby"?"inline-block":"none";

document.getElementById("accept").style.display=
mine&&state.phase==="main"&&state.rolled
?"inline-block":"none";

if(state.phase==="main"){

document.getElementById("roll").textContent=
state.rolled
?"🎲 OPNIEUW GOOIEN"
:"🎲 BEGIN WORP";

}else if(state.phase==="earn"){

document.getElementById("roll").textContent=
"🎯 ROL OM TE VERDIENEN";

}else if(state.phase==="pay"){

document.getElementById("roll").textContent=
"🎯 ROL OM TE BETALEN";

}

document.getElementById("messages").innerHTML=
(state.chat||[]).map(m=>
"<div class='msg'><b>"+
esc(m.name)+":</b> "+
esc(m.text)+
"</div>"
).join("");

document.getElementById("log").innerHTML=
"Beurt: "+
esc(
(state.players.find(p=>p.id===state.turn)||{}).name||""
)+
"<br>Fase: "+
esc(state.phase);

}

function makeFace(v){

const positions={
1:[4],
2:[0,8],
3:[0,4,8],
4:[0,2,6,8],
5:[0,2,4,6,8],
6:[0,2,3,5,6,8]
}[v];

let html="";

for(let i=0;i<9;i++){
html+=positions.includes(i)
?"<span class='pip'></span>"
:"<span></span>";
}

return html;
}

if(inviteCode){

document.getElementById("invite").classList.remove("hidden");
document.getElementById("normalJoin").classList.add("hidden");
document.getElementById("inviteJoin").classList.remove("hidden");

}

document.getElementById("chatInput").addEventListener("keydown",e=>{
if(e.key==="Enter")sendChat();
});

</script>
</body>
</html>`;

function uid(){
return Math.random().toString(36).slice(2,10);
}

function roomCode(){
let c;
do{
c=Math.random().toString(36).slice(2,6).toUpperCase();
}while(rooms.has(c));
return c;
}

function activePlayers(r){
return r.players.filter(p=>p.active);
}

function getPlayer(r,id){
return r.players.find(p=>p.id===id);
}

function die(){
return 1+Math.floor(Math.random()*6);
}

function targetFor(total){

if(total<11){
return {type:"earn",target:11-total};
}

if(total>24){
return {type:"earn",target:total-24};
}

if(total===11||total===24){
return {type:"special",target:0};
}

if(total<=18){
return {type:"pay",target:total-11};
}

return {type:"pay",target:24-total};

}

function transfer(r,id,amount){

const me=getPlayer(r,id);
const others=activePlayers(r).filter(p=>p.id!==id);

if(!me||!others.length)return;

if(amount>0){

me.money+=amount*others.length;

others.forEach(p=>{
p.money-=amount;
});

}else{

const x=Math.abs(amount);

me.money-=x*others.length;

others.forEach(p=>{
p.money+=x;
});

}

}

function resetTurn(r,id){

const p=getPlayer(r,id);

r.turn=id;
r.phase="main";
r.rolled=false;
r.dice=[1,1,1,1,1];
r.held=[false,false,false,false,false];
r.target=null;
r.targetType=null;
r.mustChoose=true;

r.message=p
?p.name+" is aan de beurt. Klik op BEGIN WORP."
:"";

}

function nextTurn(r){

const a=activePlayers(r);

if(!a.length)return;

let i=a.findIndex(p=>p.id===r.turn);

i=i<0?0:(i+1)%a.length;

resetTurn(r,a[i].id);

}

function startGame(r){

const a=activePlayers(r);

if(a.length<2)return false;

resetTurn(
r,
a[Math.floor(Math.random()*a.length)].id
);

r.message=
getPlayer(r,r.turn).name+
" begint!";

return true;

}

function mainRoll(r){

if(!r.rolled){

r.dice=r.dice.map(()=>die());
r.rolled=true;
r.mustChoose=true;

r.message=
"Kies minimaal 1 dobbelsteen om vast te zetten.";

return;

}

if(!r.held.some(Boolean)){

r.message=
"Je moet eerst minimaal 1 dobbelsteen vasthouden.";

return;

}

for(let i=0;i<5;i++){

if(!r.held[i])
r.dice[i]=die();

}

r.mustChoose=true;
r.message="Nieuwe worp. Vast is vast.";

}

function accept(r){

const total=r.dice.reduce((a,b)=>a+b,0);

const full=
r.dice.every(v=>v===r.dice[0]);

if(full){

r.phase="earn";
r.target=6;
r.targetType="earn";
r.held=[false,false,false,false,false];

r.message=
"🚩 VOLLE BAK! 5 dezelfde = 6-en verdienen.";

return;

}

const t=targetFor(total);

if(t.type==="special"){

transfer(r,r.turn,-0.50);

r.message=
total+
": €0,50 betalen aan iedere actieve tegenstander. Beurt voorbij.";

setTimeout(()=>{

if(rooms.has(r.code)){
nextTurn(r);
broadcast(r);
}

},1200);

return;

}

r.phase=t.type;
r.target=t.target;
r.targetType=t.type;
r.held=[false,false,false,false,false];

r.message=
t.type==="earn"
?total+" → VERDIENEN met "+t.target+"'s."
:total+" → BETALEN met "+t.target+"'s.";

}

function targetRoll(r){

let hits=0;

for(let i=0;i<5;i++){

if(r.held[i])continue;

r.dice[i]=die();

if(r.dice[i]===r.target){

r.held[i]=true;
hits++;

}

}

if(!hits){

r.message=
"Geen "+r.target+" gegooid. Beurt voorbij.";

setTimeout(()=>{

if(rooms.has(r.code)){
nextTurn(r);
broadcast(r);
}

},900);

return;

}

const amount=
hits*r.target*0.50;

transfer(
r,
r.turn,
r.phase==="earn"?amount:-amount
);

r.message=
hits+
"× "+
r.target+
" nieuw vastgezet.";

if(r.held.every(Boolean)){

r.held=[
false,
false,
false,
false,
false
];

r.message+=
" Alle vijf treffers! Je mag opnieuw met alle vijf stenen gooien.";

}

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
mustChoose:r.mustChoose,
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

const data=JSON.stringify({
action:"state",
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

function handle(r,ws,msg){

const me=getPlayer(r,ws.playerId);

if(!me)return;

if(msg.action==="chat"){

const text=
String(msg.text||"").trim().slice(0,120);

if(text){

r.chat.push({
name:me.name,
text
});

}

broadcast(r);
return;

}

if(msg.action==="start"){

if(!me.admin)return;

if(activePlayers(r).length<2){

ws.send(JSON.stringify({
action:"error",
message:"Minimaal 2 actieve spelers nodig."
}));

return;

}

startGame(r);
broadcast(r);
return;

}

if(msg.action==="hold"){

if(
r.turn!==me.id||
r.phase!=="main"||
!r.rolled
)return;

const i=Number(msg.index);

if(i>=0&&i<5&&!r.held[i]){

r.held[i]=true;
r.mustChoose=false;

r.message=
me.name+
": "+
r.held.filter(Boolean).length+
" steen/stenen vastgezet.";

}

broadcast(r);
return;

}

if(msg.action==="roll"){

if(r.turn!==me.id)return;

if(r.phase==="main"){

mainRoll(r);

}else if(
r.phase==="earn"||
r.phase==="pay"
){

targetRoll(r);

}

broadcast(r);
return;

}

if(msg.action==="accept"){

if(
r.turn!==me.id||
r.phase!=="main"||
!r.rolled
)return;

accept(r);
broadcast(r);
return;

}

if(msg.action==="pause"&&me.admin){

const p=getPlayer(r,msg.id);

if(p&&!p.admin){

p.active=!p.active;

if(!p.active&&r.turn===p.id)
nextTurn(r);

r.message=
p.name+
(p.active
?" is weer actief."
:" is gepauzeerd.");

broadcast(r);

}

return;

}

if(msg.action==="remove"&&me.admin){

if(msg.id===me.id)return;

const p=getPlayer(r,msg.id);

if(p){

p.active=false;
p.ws=null;

if(r.turn===p.id)
nextTurn(r);

r.message=
p.name+
" is verwijderd.";

broadcast(r);

}

}

}

const server=http.createServer((req,res)=>{

res.writeHead(200,{
"Content-Type":"text/html; charset=utf-8"
});

res.end(HTML);

});

const wss=new WebSocket.Server({server});

wss.on("connection",ws=>{

ws.on("message",raw=>{

let msg;

try{
msg=JSON.parse(raw.toString());
}catch{
return;
}

if(msg.action==="create"){

const room={
code:roomCode(),
players:[],
phase:"lobby",
turn:null,
dice:[1,1,1,1,1],
held:[false,false,false,false,false],
rolled:false,
target:null,
targetType:null,
mustChoose:true,
message:"Wacht op spelers.",
chat:[]
};

const p={
id:uid(),
name:String(msg.name||"Speler").trim().slice(0,20),
money:100,
active:true,
admin:true,
ws
};

room.players.push(p);
rooms.set(room.code,room);

ws.playerId=p.id;
ws.roomCode=room.code;

ws.send(JSON.stringify({
action:"welcome",
id:p.id
}));

broadcast(room);
return;

}

if(msg.action==="join"){

const code=
String(msg.code||"").trim().toUpperCase();

const room=rooms.get(code);

if(!room){

ws.send(JSON.stringify({
action:"error",
message:"Spelcode bestaat niet of het spel is afgelopen."
}));

return;

}

if(room.phase!=="lobby"){

ws.send(JSON.stringify({
action:"error",
message:"Dit spel is al gestart."
}));

return;

}

if(activePlayers(room).length>=4){

ws.send(JSON.stringify({
action:"error",
message:"Dit spel zit al vol."
}));

return;

}

const p={
id:uid(),
name:String(msg.name||"Speler").trim().slice(0,20),
money:100,
active:true,
admin:false,
ws
};

room.players.push(p);

ws.playerId=p.id;
ws.roomCode=room.code;

room.message=
p.name+
" is toegetreden tot de wachtruimte.";

ws.send(JSON.stringify({
action:"welcome",
id:p.id
}));

broadcast(room);
return;

}

const room=rooms.get(ws.roomCode);

if(room)
handle(room,ws,msg);

});

ws.on("close",()=>{

const room=rooms.get(ws.roomCode);

if(!room)return;

const p=getPlayer(room,ws.playerId);

if(p)
p.ws=null;

broadcast(room);

});

});

setInterval(()=>{

wss.clients.forEach(ws=>{

if(ws.readyState===WebSocket.OPEN)
ws.ping();

});

},30000);

server.listen(PORT,"0.0.0.0",()=>{
console.log(
"Dobbelen 11/24 online draait op poort "+
PORT
);
});
