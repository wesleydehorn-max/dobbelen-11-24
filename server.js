const http=require('http');
const crypto=require('crypto');

const PORT=process.env.PORT||10000;
const rooms=new Map();

const html=`<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>🎲 DOBBELEN 11/24</title>

<style>
body{margin:0;background:#07070a;color:#fff;font-family:Arial,sans-serif}
.wrap{max-width:900px;margin:auto;padding:15px 12px 80px}
.logo{text-align:center;color:#ffd84d;font-size:42px;font-weight:900;text-shadow:0 0 15px #f22;margin:15px 0}
.tag{text-align:center;color:#ffe89a;letter-spacing:3px}
.panel{background:linear-gradient(145deg,#162238,#080e18);border:2px solid #d7aa2e;border-radius:20px;padding:18px;margin:14px 0;box-shadow:0 0 20px #f003}
.title{text-align:center;color:#ffd84d;font-size:24px;margin-bottom:12px}
input{width:100%;box-sizing:border-box;background:#050a12;color:#fff;border:1px solid #667;border-radius:12px;padding:14px;font-size:17px;margin:5px 0}
button{border:0;border-radius:13px;padding:14px 18px;color:#fff;background:#264b8d;font-weight:900;font-size:16px;margin:5px;cursor:pointer}
.green{background:#07854c}
.gold{background:#b77708}
.orange{background:#bd6810}
.red{background:#9d2430}
.row{display:flex;gap:8px;flex-wrap:wrap}
.row>*{flex:1;min-width:170px}
.players{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.player{background:#0c1522;border:1px solid #334;border-radius:12px;padding:12px;text-align:center}
.current{outline:3px solid #ffd84d}
.money{color:#fff;font-size:21px;margin:6px}
.code{text-align:center;color:#ffd84d;font-size:38px;letter-spacing:8px}
.invite{background:#05070a;border:1px dashed #aa8b29;border-radius:10px;padding:12px;word-break:break-all;color:#ffe89a;font-family:monospace}
.table{background:radial-gradient(circle,#147a49,#04351f);border:7px solid #a77e25;border-radius:24px;padding:20px;min-height:170px}
.dice{display:flex;justify-content:center;gap:12px;flex-wrap:wrap}
.die{width:68px;height:68px;border-radius:14px;background:linear-gradient(145deg,#ef3838,#940606);border:3px solid #fff;position:relative;box-shadow:0 5px 10px #000;cursor:pointer}
.held{transform:translateY(-7px);box-shadow:0 0 14px #ffd84d}
.pip{position:absolute;width:12px;height:12px;border-radius:50%;background:#fff}
.tl{left:9px;top:9px}
.tc{left:50%;top:9px;transform:translateX(-50%)}
.tr{right:9px;top:9px}
.ml{left:9px;top:50%;transform:translateY(-50%)}
.mc{left:50%;top:50%;transform:translate(-50%,-50%)}
.mr{right:9px;top:50%;transform:translateY(-50%)}
.bl{left:9px;bottom:9px}
.bc{left:50%;bottom:9px;transform:translateX(-50%)}
.br{right:9px;bottom:9px}
.banner{text-align:center;padding:14px;border:2px solid #ffd84d;border-radius:14px;font-size:28px;margin:10px 0}
.earn{background:#063d26;border-color:#21d27a}
.pay{background:#432306}
.chat{max-height:180px;overflow:auto;background:#05070a;border-radius:10px;padding:10px}
.msg{padding:5px 0}
.msg b{color:#ffd84d}
.rule{position:fixed;bottom:10px;left:12px;background:#101b2b;border:1px solid #ffd84d;border-radius:12px;padding:9px 12px}

@media(max-width:650px){
.logo{font-size:34px}
.players{grid-template-columns:repeat(2,1fr)}
.die{width:60px;height:60px}
.pip{width:10px;height:10px}
.tl{left:8px;top:8px}
.tc{top:8px}
.tr{right:8px;top:8px}
.ml{left:8px}
.mr{right:8px}
.bl{left:8px;bottom:8px}
.bc{bottom:8px}
.br{right:8px;bottom:8px}
}
</style>
</head>

<body>

<div class="wrap">

<div class="logo">🎲 DOBBELEN 11/24</div>
<div class="tag">ONLINE MULTIPLAYER</div>

<div id="app"></div>

</div>

<div class="rule">
🚩 Regel: 5 dezelfde = 6️⃣ verdienen
</div>

<script>

let token=sessionStorage.getItem('token')||'';

const qs=new URLSearchParams(location.search);
const invite=(qs.get('room')||'').toUpperCase();

const app=document.getElementById('app');

let s=null;

const esc=x=>
String(x??'').replace(/[&<>"']/g,c=>({
'&':'&amp;',
'<':'&lt;',
'>':'&gt;',
'"':'&quot;',
"'":'&#39;'
}[c]));

const euro=x=>
'€'+Number(x||0).toFixed(2).replace('.',',');


async function api(path,method='GET',body){

const o={
method,
headers:{
'Content-Type':'application/json',
'X-Token':token
}
};

if(body)o.body=JSON.stringify(body);

const r=await fetch(path,o);

const j=await r.json();

if(!r.ok)
throw Error(j.error||'Fout');

return j;
}


function home(){

app.innerHTML=

'<section class="panel">'+
'<div class="title">🎲 NIEUW SPEL</div>'+
'<input id="name" maxlength="20" placeholder="Jouw naam">'+
'<button class="green" id="make">🎲 SPEL MAKEN</button>'+
'</section>'+

'<section class="panel">'+
'<div class="title">OF MEEDOEN</div>'+
'<input id="jname" maxlength="20" placeholder="Jouw naam">'+
'<div class="row">'+
'<input id="code" maxlength="4" placeholder="Spelcode">'+
'<button id="join">MEEDOEN</button>'+
'</div>'+
'</section>';

document.getElementById('make').onclick=create;
document.getElementById('join').onclick=join;

if(invite)
document.getElementById('code').value=invite;
}


async function create(){

try{

const r=await api(
'/api/create',
'POST',
{
name:
document.getElementById('name').value.trim()
}
);

token=r.token;

sessionStorage.setItem(
'token',
token
);

history.replaceState(
{},
'',
'/?room='+r.code
);

await refresh();

}catch(e){

alert(e.message);

}

}


async function join(){

try{

const r=await api(
'/api/join',
'POST',
{
name:
document.getElementById('jname').value.trim(),

code:
document.getElementById('code').value.trim().toUpperCase()
}
);

token=r.token;

sessionStorage.setItem(
'token',
token
);

history.replaceState(
{},
'',
'/?room='+r.code
);

await refresh();

}catch(e){

alert(e.message);

}

}


async function act(action,data={}){

try{

await api(
'/api/action',
'POST',
{
action,
...data
}
);

await refresh();

}catch(e){

alert(e.message);

}

}


function die(v,i,held){

const m={
1:['mc'],
2:['tl','br'],
3:['tl','mc','br'],
4:['tl','tr','bl','br'],
5:['tl','tr','mc','bl','br'],
6:['tl','tr','ml','mr','bl','br']
}[v];

return '<div class="die '+
(held?'held':'')+
'" onclick="hold('+i+')">'+
m.map(x=>
'<span class="pip '+x+'"></span>'
).join('')+
'</div>';
}


function lobby(){

const me=
s.players.find(
p=>p.id===s.me
);

const admin=
me?.admin;

const url=
location.origin+
'/?room='+
s.code;

app.innerHTML=

'<section class="panel">'+

'<div class="title">🎰 WACHTRUIMTE</div>'+

'<div class="code">'+
s.code+
'</div>'+

(
admin
?
'<div class="invite">'+
esc(url)+
'</div>'+
'<button class="gold" id="copy">'+
'🔗 LINK KOPIËREN'+
'</button>'
:
'<p style="text-align:center">'+
'Wacht tot de beheerder het spel start.'+
'</p>'
)+

'</section>'+

'<section class="panel">'+

'<div class="title">👥 SPELERS</div>'+

'<div class="players" id="ps"></div>'+

(
admin
?
'<div style="text-align:center">'+
'<button class="green" id="start">'+
'🎲 START SPEL'+
'</button>'+
'</div>'
:
''
)+

'</section>';


s.players.forEach(p=>{

const d=document.createElement('div');

d.className='player';

d.innerHTML=
'<b>'+
esc(p.name)+
'</b>'+
'<div class="money">'+
euro(p.money)+
'</div>'+
(
p.admin
?
'👑 BEHEERDER'
:
'🟢 SPELER'
);

if(admin&&!p.admin){

const b=document.createElement(
'button'
);

b.textContent=
p.active
?
'⏸️ PAUZE'
:
'🟢 ACTIEF';

b.onclick=()=>
act(
'pause',
{id:p.id}
);

d.appendChild(b);


const x=document.createElement(
'button'
);

x.className='red';

x.textContent=
'❌ VERWIJDER';

x.onclick=()=>
act(
'remove',
{id:p.id}
);

d.appendChild(x);

}

document.getElementById(
'ps'
).appendChild(d);

});


if(admin){

document.getElementById(
'start'
).disabled=
s.players.filter(
p=>p.active
).length<2;

document.getElementById(
'start'
).onclick=
()=>act('start');


document.getElementById(
'copy'
).onclick=
async()=>{

try{

await navigator.clipboard
.writeText(url);

document.getElementById(
'copy'
).textContent=
'✅ GEKOPIEERD';

}catch(e){

prompt(
'Kopieer deze link:',
url
);

}

};

}

}


function game(){

const me=
s.players.find(
p=>p.id===s.me
);

const mine=
me?.id===s.turn;

const current=
s.players.find(
p=>p.id===s.turn
);

let banner='';

if(s.phase==='earn'){

banner=
'<div class="banner earn">'+
'VERDIENEN: '+
s.target+
"'EN</div>";

}

else if(s.phase==='pay'){

banner=
'<div class="banner pay">'+
'BETALEN: '+
s.target+
"'EN</div>";

}

else if(s.result){

banner=
'<div class="banner pay">'+
esc(s.result)+
'</div>';

}


app.innerHTML=

'<section class="panel">'+

'<div class="title">'+
'🎯 '+
esc(current?.name||'')+
' IS AAN DE BEURT'+
'</div>'+

'<div style="text-align:center">'+
esc(s.message||'')+
'</div>'+

banner+

'<div class="table">'+

'<div class="dice">'+
s.dice.map(
(v,i)=>
die(
v,
i,
s.held[i]
)
).join('')+
'</div>'+

'</div>'+

'<div style="text-align:center" id="actions"></div>'+

'</section>'+

'<section class="panel">'+

'<div class="title">👥 SPELERS</div>'+

'<div class="players" id="ps"></div>'+

'</section>'+

'<section class="panel">'+

'<div class="title">💬 CHAT</div>'+

'<div class="chat" id="chat"></div>'+

'<div class="row">'+

'<input id="chatin" maxlength="200" placeholder="Bericht...">'+

'<button id="send">STUUR</button>'+

'</div>'+

'</section>'+

(
me?.admin
?
'<section class="panel">'+
'<button class="gold" id="new">'+
'🔄 NIEUW SPEL'+
'</button>'+
'</section>'
:
''
);


s.players.forEach(p=>{

const d=document.createElement('div');

d.className=
'player '+
(p.id===s.turn?'current':'');

d.innerHTML=
'<b>'+
esc(p.name)+
'</b>'+
'<div class="money">'+
euro(p.money)+
'</div>'+
(
p.active
?
'🟢'
:
'⏸️'
);

document.getElementById(
'ps'
).appendChild(d);

});


document.getElementById(
'chat'
).innerHTML=
(s.chat||[])
.map(
m=>
'<div class="msg">'+
'<b>'+
esc(m.name)+
':</b> '+
esc(m.text)+
'</div>'
)
.join('');


document.getElementById(
'send'
).onclick=
()=>{

const i=
document.getElementById(
'chatin'
);

if(i.value.trim()){

act(
'chat',
{
text:i.value.trim()
}
).then(
()=>i.value=''
);

}

};


if(me?.admin){

document.getElementById(
'new'
).onclick=
()=>act('newGame');

}


const a=
document.getElementById(
'actions'
);


if(
mine&&
s.phase==='main'
){

const r=
document.createElement(
'button'
);

r.className=
s.rolled
?
'orange'
:
'green';

r.textContent=
s.rolled
?
'🎲 OPNIEUW GOOIEN'
:
'🎲 BEGIN WORP';

r.disabled=
s.rolled&&
(
!s.held.some(Boolean)||
s.held.every(Boolean)
);

r.onclick=
()=>act('roll');

a.appendChild(r);


const ok=
document.createElement(
'button'
);

ok.textContent=
'✓ AKKOORD';

ok.onclick=
()=>act('accept');

ok.disabled=
!s.rolled||
!s.held.some(Boolean);

a.appendChild(ok);


if(s.undoHold){

const u=
document.createElement(
'button'
);

u.className='gold';

u.textContent=
'↩️ LAATSTE VASTZETTING TERUG';

u.onclick=
()=>act('undoHold');

a.appendChild(u);

}


if(s.snapshot){

const u2=
document.createElement(
'button'
);

u2.className='gold';

u2.textContent=
'↩️ AKKOORD TERUG';

u2.onclick=
()=>act('undoAccept');

a.appendChild(u2);

}

}


else if(
mine&&
(
s.phase==='earn'||
s.phase==='pay'
)
){

const r=
document.createElement(
'button'
);

r.className='orange';

r.textContent=
'🎲 OPNIEUW GOOIEN';

r.onclick=
()=>act('targetRoll');

a.appendChild(r);

}

}


async function hold(i){

if(
s.phase==='main'&&
s.rolled
){

await act(
'hold',
{
index:i
}
);

}

}


async function refresh(){

if(!token){

home();

return;

}

try{

const r=
await api('/api/state');

s=r.state;

s.me=r.me;

if(
s.phase==='lobby'
){

lobby();

}else{

game();

}

}catch(e){

token='';

sessionStorage.removeItem(
'token'
);

home();

}

}


home();

if(token)
refresh();

setInterval(
()=>{
if(token)
refresh();
},
800
);

</script>

</body>
</html>`;


function newRoom(){

let c;

do{

c=
crypto
.randomBytes(2)
.toString('hex')
.toUpperCase();

}
while(
rooms.has(c)
);

return c;

}


function active(r){

return r.players.filter(
p=>p.active
);

}


function find(r,t){

return r.players.find(
p=>p.token===t
);

}


function same(a){

return a.every(
x=>x===a[0]
);

}


function target(dir,sum){

const earn={
5:6,
6:5,
7:4,
8:3,
9:2,
10:1,
25:1,
26:2,
27:3,
28:4,
29:5,
30:6
};

const pay={
12:1,
13:2,
14:3,
15:4,
16:5,
17:6,
18:6,
19:5,
20:4,
21:3,
22:2,
23:1
};

return(
dir==='earn'
?
earn
:
pay
)[sum]||0;

}


function transfer(r,id,amt){

const ps=
active(r);

const me=
ps.find(
p=>p.id===id
);

if(!me)
return;

ps.forEach(p=>{

if(p.id!==id){

me.money=
Math.round(
(me.money+amt)*100
)/100;

p.money=
Math.round(
(p.money-amt)*100
)/100;

}

});

}


function next(r){

const ps=
active(r);

if(!ps.length)
return;

let i=
ps.findIndex(
p=>p.id===r.turn
);

const n=
ps[
(i+1)%ps.length
];

r.turn=n.id;

r.phase='main';

r.dice=[
1,1,1,1,1
];

r.held=[
false,false,false,false,false
];

r.rolled=false;

r.target=0;

r.targetHeld=[
false,false,false,false,false
];

r.direction='';

r.result='';

r.undoHold=null;

r.snapshot=null;

r.message=
n.name+
' is aan de beurt.';

}


function start(r){

const ps=
active(r);

let idx=0;

while(true){

const rolls=
ps.map(
()=>1+Math.floor(
Math.random()*6
)
);

const max=
Math.max(...rolls);

const winners=
rolls
.map(
(v,i)=>
v===max
?
i
:
-1
)
.filter(
i=>i>=0
);

if(winners.length===1){

idx=winners[0];

break;

}

}

const order=
ps
.slice(idx)
.concat(
ps.slice(0,idx)
);

r.turn=
order[0].id;

r.phase='main';

r.dice=[
1,1,1,1,1
];

r.held=[
false,false,false,false,false
];

r.rolled=false;

r.message=
order[0].name+
' begint.';

}


function action(r,t,b){

const p=
find(r,t);

if(!p||!p.active)
throw Error(
'Speler niet actief.'
);


if(b.action==='start'){

if(!p.admin)
throw Error(
'Alleen de beheerder kan starten.'
);

if(
active(r).length<2
)
throw Error(
'Minimaal 2 actieve spelers.'
);

start(r);

return;

}


if(
b.action==='pause'||
b.action==='remove'
){

if(!p.admin)
throw Error(
'Alleen de beheerder.'
);

const x=
r.players.find(
x=>x.id===b.id
);

if(!x||x.admin)
throw Error(
'Ongeldige speler.'
);

x.active=
b.action==='pause'
?
!x.active
:
false;

if(r.turn===x.id)
next(r);

return;

}


if(b.action==='newGame'){

if(!p.admin)
throw Error(
'Alleen de beheerder.'
);

r.phase='lobby';

r.players.forEach(
x=>{
x.money=100;
x.active=true;
}
);

r.turn=null;

return;

}


if(b.action==='chat'){

r.chat.push({
name:p.name,
text:String(
b.text||''
).slice(0,200)
});

return;

}


if(r.turn!==p.id)
throw Error(
'Niet jouw beurt.'
);


if(b.action==='roll'){

if(r.phase!=='main')
throw Error(
'Nu niet.'
);

if(
r.rolled&&
(
!r.held.some(Boolean)||
r.held.every(Boolean)
)
)
throw Error(
'Zet eerst minimaal 1 dobbelsteen vast.'
);

r.dice=
r.dice.map(
(v,i)=>
r.held[i]
?
v
:
1+Math.floor(
Math.random()*6
)
);

r.rolled=true;

return;

}


if(b.action==='hold'){

if(
r.phase!=='main'||
!r.rolled
)
throw Error(
'Gooi eerst.'
);

r.undoHold={
dice:[...r.dice],
held:[...r.held]
};

const i=
Number(b.index);

if(i<0||i>4)
throw Error(
'Ongeldige dobbelsteen.'
);

r.held[i]=
!r.held[i];

return;

}


if(b.action==='accept'){

if(
r.phase!=='main'||
!r.rolled||
!r.held.some(Boolean)
)
throw Error(
'Je moet eerst minimaal 1 dobbelsteen vastzetten.'
);


r.snapshot={

phase:r.phase,

dice:[...r.dice],

held:[...r.held],

rolled:r.rolled,

target:r.target,

targetHeld:[
...r.targetHeld
],

direction:r.direction,

result:r.result,

message:r.message,

money:
r.players.map(
x=>({
id:x.id,
money:x.money
})
)

};


const sum=
r.dice.reduce(
(a,b)=>a+b,
0
);


if(
sum===11||
sum===24
){

transfer(
r,
p.id,
-0.50
);

r.result=
sum+
': BETALEN €0,50';

setTimeout(
()=>{

if(
rooms.has(r.code)&&
r.phase==='main'&&
r.turn===p.id
)
next(r);

},
500
);

return;

}


const dir=
sum<11||
sum>24
?
'earn'
:
'pay';


const tar=
same(r.dice)
?
6
:
target(
dir,
sum
);


if(!tar){

r.snapshot=null;

throw Error(
'Deze combinatie is niet geldig.'
);

}


r.phase=dir;

r.direction=dir;

r.target=tar;

r.targetHeld=[
false,false,false,false,false
];

r.held=[
false,false,false,false,false
];

r.result=
dir==='earn'
?
"VERDIENEN: "+
tar+
"'EN"
:
"BETALEN: "+
tar+
"'EN";

return;

}


if(b.action==='undoHold'){

if(!r.undoHold)
throw Error(
'Geen vastzetting om terug te zetten.'
);

r.dice=[
...r.undoHold.dice
];

r.held=[
...r.undoHold.held
];

r.undoHold=null;

return;

}


if(b.action==='undoAccept'){

if(!r.snapshot)
throw Error(
'Geen akkoord om terug te zetten.'
);

const z=
r.snapshot;

r.phase=z.phase;

r.dice=[
...z.dice
];

r.held=[
...z.held
];

r.rolled=z.rolled;

r.target=z.target;

r.targetHeld=[
...z.targetHeld
];

r.direction=z.direction;

r.result=z.result;

r.message=z.message;

z.money.forEach(
m=>{

const x=
r.players.find(
q=>q.id===m.id
);

if(x)
x.money=m.money;

}
);

r.snapshot=null;

return;

}


if(b.action==='targetRoll'){

if(
r.phase!=='earn'&&
r.phase!=='pay'
)
throw Error(
'Nu niet.'
);


let n=0;


if(
r.targetHeld.every(Boolean)
){

r.targetHeld=[
false,false,false,false,false
];

}


for(
let i=0;
i<5;
i++
){

if(
!r.targetHeld[i]
){

r.dice[i]=
1+Math.floor(
Math.random()*6
);

if(
r.dice[i]===r.target
){

r.targetHeld[i]=true;

n++;

}

}

}


if(!n){

setTimeout(
()=>{

if(
rooms.has(r.code)&&
(
r.phase==='earn'||
r.phase==='pay'
)
)
next(r);

},
500
);

return;

}


const amount=
n*
r.target*
0.50;


transfer(
r,
p.id,
r.phase==='earn'
?
amount
:
-amount
);

return;

}

}


const server=
http.createServer(
async(req,res)=>{

const u=
new URL(
req.url,
'http://x'
);

res.setHeader(
'Access-Control-Allow-Origin',
'*'
);


if(req.method==='OPTIONS'){

res.writeHead(
204,
{
'Access-Control-Allow-Headers':
'Content-Type,X-Token',
'Access-Control-Allow-Methods':
'GET,POST,OPTIONS'
}
);

return res.end();

}


if(u.pathname==='/'){

res.writeHead(
200,
{
'Content-Type':
'text/html; charset=utf-8'
}
);

return res.end(html);

}


if(
req.method==='POST'
){

let body='';

req.on(
'data',
d=>body+=d
);

await new Promise(
ok=>req.on(
'end',
ok
)
);

let b={};

try{

b=
JSON.parse(
body||'{}'
);

}catch(e){}


if(
u.pathname==='/api/create'
){

const code=
newRoom();

const token=
crypto
.randomBytes(16)
.toString('hex');

rooms.set(
code,
{
code,
phase:'lobby',

players:[
{
id:
crypto
.randomBytes(8)
.toString('hex'),

token,

name:
String(
b.name||'Speler'
).slice(0,20),

money:100,

admin:true,

active:true
}
],

turn:null,

dice:[
1,1,1,1,1
],

held:[
false,false,false,false,false
],

rolled:false,

target:0,

targetHeld:[
false,false,false,false,false
],

direction:'',

result:'',

message:
'Wacht op spelers.',

chat:[],

snapshot:null
}
);

return send(
res,
200,
{
code,
token
}
);

}


if(
u.pathname==='/api/join'
){

const r=
rooms.get(
String(
b.code||''
).toUpperCase()
);

if(!r)
return send(
res,
404,
{
error:
'Kamer bestaat niet.'
}
);

if(r.phase!=='lobby')
return send(
res,
400,
{
error:
'Spel is al gestart.'
}
);

if(
active(r).length>=4
)
return send(
res,
400,
{
error:
'Maximaal 4 spelers.'
}
);

const token=
crypto
.randomBytes(16)
.toString('hex');

r.players.push({

id:
crypto
.randomBytes(8)
.toString('hex'),

token,

name:
String(
b.name||'Speler'
).slice(0,20),

money:100,

admin:false,

active:true

});

return send(
res,
200,
{
code:r.code,
token
}
);

}


if(
u.pathname==='/api/action'
){

let r=null;

for(
const x of rooms.values()
){

if(
find(
x,
req.headers['x-token']
)
)
r=x;

}

if(!r)
return send(
res,
401,
{
error:
'Sessie verlopen.'
}
);

try{

action(
r,
req.headers['x-token'],
b
);

return send(
res,
200,
{
ok:true
}
);

}catch(e){

return send(
res,
400,
{
error:e.message
}
);

}

}

}


if(
req.method==='GET'&&
u.pathname==='/api/state'
){

let r=null;
let p=null;

for(
const x of rooms.values()
){

const q=
find(
x,
req.headers['x-token']
);

if(q){

r=x;
p=q;

break;

}

}

if(!r)
return send(
res,
401,
{
error:
'Geen actieve sessie.'
}
);

return send(
res,
200,
{
state:{
...r,

players:
r.players.map(
x=>({
id:x.id,
name:x.name,
money:x.money,
admin:x.admin,
active:x.active
})
),

me:p.id

},

me:p.id

}
);

}


res.writeHead(404);
res.end();

});


function send(
res,
status,
data
){

res.writeHead(
status,
{
'Content-Type':
'application/json',
'Cache-Control':
'no-store'
}
);

res.end(
JSON.stringify(data)
);

}


server.listen(
PORT,
'0.0.0.0',
()=>{

console.log(
'Dobbelen 11/24 online op '+
PORT
);

}
);
