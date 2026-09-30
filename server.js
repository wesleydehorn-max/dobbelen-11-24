const http=require('http'),crypto=require('crypto');
const PORT=process.env.PORT||10000,rooms=new Map(),uid=()=>crypto.randomBytes(8).toString('hex'),roll=()=>1+Math.floor(Math.random()*6),act=r=>r.p.filter(x=>x.on),find=(r,t)=>r.p.find(x=>x.t===t);

const HTML=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>🎲 DOBBELEN 11/24</title><style>
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top,#65001b,#17000d 40%,#050506);color:white;font-family:Arial}.wrap{max-width:900px;margin:auto;padding:8px 10px 80px}.logo{text-align:center;color:#ffd84d;font-size:clamp(32px,8vw,55px);font-weight:900;text-shadow:0 0 12px #f24;margin:12px}.tag{text-align:center;color:#ffe9a0;letter-spacing:3px;font-size:11px}.p{background:linear-gradient(145deg,#172338,#080e18);border:2px solid #d6a82c;border-radius:18px;padding:15px;margin:12px 0}.title{text-align:center;color:#ffd84d;font-size:23px;font-weight:900;margin-bottom:10px}input{width:100%;padding:13px;margin:4px 0;background:#050a12;color:#fff;border:1px solid #667080;border-radius:11px;font-size:17px}button{padding:13px 16px;margin:4px;border:0;border-radius:11px;background:#315b9f;color:white;font-weight:900;font-size:15px}.g{background:#119653}.o{background:#b96b12}.r{background:#9d202d}.gold{background:#a97910}.row{display:flex;gap:5px;flex-wrap:wrap}.row>*{flex:1;min-width:130px}.players{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}.pl{background:#0b1522;border:1px solid #344052;border-radius:11px;padding:9px;text-align:center}.cur{outline:3px solid #ffd84d}.money{font-size:19px}.code{text-align:center;color:#ffd84d;font-size:38px;font-weight:900;letter-spacing:7px}.invite{word-break:break-all;background:#05070b;padding:9px;border-radius:9px;color:#ffe49a;font-size:12px}.table{background:radial-gradient(circle,#147a49,#04351f);border:6px solid #a77e25;border-radius:22px;padding:25px 8px}.dice{display:flex;justify-content:center;gap:10px;flex-wrap:wrap}.die{width:68px;height:68px;border-radius:14px;background:linear-gradient(145deg,#ef3838,#900606);border:3px solid white;position:relative;box-shadow:0 5px 10px #000;cursor:pointer}.held{border:5px solid #39ff88;box-shadow:0 0 12px #39ff88;transform:translateY(-6px)}.held:after{content:'VAST';position:absolute;bottom:-24px;left:0;right:0;text-align:center;color:#39ff88;font-size:11px;font-weight:900}.pip{position:absolute;width:13px;height:13px;border-radius:50%;background:#fff}.tl{left:9px;top:9px}.tc{left:50%;top:9px;transform:translateX(-50%)}.tr{right:9px;top:9px}.ml{left:9px;top:50%;transform:translateY(-50%)}.mc{left:50%;top:50%;transform:translate(-50%,-50%)}.mr{right:9px;top:50%;transform:translateY(-50%)}.bl{left:9px;bottom:9px}.bc{left:50%;bottom:9px;transform:translateX(-50%)}.br{right:9px;bottom:9px}.banner{text-align:center;padding:12px;border:3px solid #ffd84d;border-radius:13px;font-size:25px;font-weight:900;margin:8px}.earn{border-color:#39ff88;color:#7affb1;background:#073c25}.chat{height:160px;overflow:auto;background:#05070b;padding:8px;border-radius:9px}.msg{padding:4px;border-bottom:1px solid #ffffff18}.msg b{color:#ffd84d}.rule{position:fixed;left:8px;bottom:8px;background:#101b2b;border:1px solid #ffd84d;border-radius:10px;padding:8px;z-index:5}@media(max-width:500px){.die{width:61px;height:61px}.pip{width:11px;height:11px}}
</style><body><div class="wrap"><div class="logo">🎲 DOBBELEN 11/24</div><div class="tag">ONLINE MULTIPLAYER</div><div id="app"></div></div><div class="rule">🚩 Regel: 5 dezelfde = 6️⃣ verdienen</div><script>
let tok=sessionStorage.getItem('dtoken')||'',S=null,rev=-1,busy=0,room=new URLSearchParams(location.search).get('room')||'',app=document.getElementById('app');
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])),eur=x=>'€'+(+x).toFixed(2).replace('.',','),$=id=>document.getElementById(id);
async function api(u,b){let o={headers:{'Content-Type':'application/json','X-Token':tok}};if(b){o.method='POST';o.body=JSON.stringify(b)}let r=await fetch(u,o),j=await r.json();if(!r.ok)throw Error(j.error);return j}

function home(){
app.innerHTML='<div class="p"><div class="title">🎲 NIEUW SPEL</div><input id="n" placeholder="Jouw naam" maxlength="20"><button class="g" onclick="make()">🎲 SPEL MAKEN</button></div><div class="p"><div class="title">OF MEEDOEN</div><input id="jn" placeholder="Jouw naam" maxlength="20"><div class="row"><input id="c" placeholder="Spelcode" maxlength="4"><button onclick="join()">MEEDOEN</button></div></div>';
if(room)$('c').value=room
}

async function make(){
try{
let n=$('n').value.trim();
if(!n)throw Error('Vul je naam in.');
let x=await api('/api/create',{name:n});
tok=x.token;
sessionStorage.setItem('dtoken',tok);
location.search='?room='+x.code
}catch(e){alert(e.message)}
}

async function join(){
try{
let n=$('jn').value.trim(),c=$('c').value.trim().toUpperCase();
if(!n||!c)throw Error('Vul naam en spelcode in.');
let x=await api('/api/join',{name:n,code:c});
tok=x.token;
sessionStorage.setItem('dtoken',tok);
location.search='?room='+x.code
}catch(e){alert(e.message)}
}

function lobby(){
let me=S.p.find(x=>x.id===S.me),a=me.admin,u=location.origin+'/?room='+S.code;
app.innerHTML='<div class="p"><div class="title">🎰 WACHTRUIMTE</div><div class="code">'+S.code+'</div>'+(a?'<div class="invite">'+u+'</div><button class="gold" onclick="copy()">🔗 LINK KOPIËREN</button>':'<p style="text-align:center">Wacht op de beheerder.</p>')+'</div><div class="p"><div class="title">👥 SPELERS</div><div class="players" id="ps"></div>'+(a?'<div style="text-align:center"><button class="g" onclick="go(\'start\')">🎲 START SPEL</button></div>':'')+'</div>';

S.p.forEach(x=>{
let d=document.createElement('div');
d.className='pl';
d.innerHTML='<b>'+esc(x.name)+'</b><div class="money">'+eur(x.money)+'</div>'+(x.admin?'👑':'🟢');
if(a&&!x.admin){
let b=document.createElement('button');
b.className=x.on?'o':'g';
b.textContent=x.on?'⏸️ PAUZE':'🟢 ACTIEF';
b.onclick=()=>go('pause',{id:x.id});
d.append(b);
let z=document.createElement('button');
z.className='r';
z.textContent='❌';
z.onclick=()=>go('remove',{id:x.id});
d.append(z)
}
$('ps').append(d)
})
}

const P={1:['mc'],2:['tl','br'],3:['tl','mc','br'],4:['tl','tr','bl','br'],5:['tl','tr','mc','bl','br'],6:['tl','tr','ml','mr','bl','br']};

function die(v,i,h){
return '<div class="die '+(h?'held':'')+'" onclick="hold('+i+')">'+P[v].map(x=>'<i class="pip '+x+'"></i>').join('')+'</div>'
}

function game(){
let me=S.p.find(x=>x.id===S.me),mine=me.id===S.turn,cur=S.p.find(x=>x.id===S.turn);
let bn=S.phase==='earn'?'<div class="banner earn">VERDIENEN: '+S.target+"'EN</div>":S.phase==='pay'?'<div class="banner">BETALEN: '+S.target+"'EN</div>":S.result?'<div class="banner">'+esc(S.result)+'</div>':'';

app.innerHTML='<div class="p"><div class="title">🎯 '+esc(cur?.name||'')+' IS AAN DE BEURT</div>'+bn+'<div style="text-align:center">'+esc(S.msg||'')+'</div><div class="table"><div class="dice">'+S.d.map((v,i)=>die(v,i,S.h[i]||(S.phase!=='main'&&S.th[i]))).join('')+'</div></div><div id="ac" style="text-align:center"></div></div><div class="p"><div class="title">👥 SPELERS</div><div class="players" id="ps"></div></div><div class="p"><div class="title">💬 CHAT</div><div class="chat" id="chat">'+S.chat.map(m=>'<div class="msg"><b>'+esc(m.name)+':</b> '+esc(m.text)+'</div>').join('')+'</div><div class="row"><input id="ci" placeholder="Typ een bericht..." maxlength="200"><button onclick="chat()">VERSTUUR</button></div></div>';

S.p.forEach(x=>{
let d=document.createElement('div');
d.className='pl '+(x.id===S.turn?'cur':'');
d.innerHTML='<b>'+esc(x.name)+'</b><div class="money">'+eur(x.money)+'</div>'+(x.on?'🟢':'⏸️')+(x.admin?' 👑':'');
$('ps').append(d)
});

let ac=$('ac');

if(mine&&S.phase==='main'){
let b=document.createElement('button');
b.className='o';
b.textContent=S.rolled?'🎲 OPNIEUW GOOIEN':'🎲 BEGIN WORP';
b.onclick=()=>go('roll');
ac.append(b);

if(S.rolled){
let q=document.createElement('button');
q.textContent='AKKOORD';
q.onclick=()=>go('accept');
ac.append(q);

if(S.undo){
let u=document.createElement('button');
u.className='gold';
u.textContent='↩️ LAATSTE VASTZETTING TERUG';
u.onclick=()=>go('undoHold');
ac.append(u)
}

if(S.snap){
let u=document.createElement('button');
u.className='gold';
u.textContent='↩️ AKKOORD TERUG';
u.onclick=()=>go('undoAccept');
ac.append(u)
}
}
}else if(mine&&(S.phase==='earn'||S.phase==='pay')){
let b=document.createElement('button');
b.className='o';
b.textContent='🎲 OPNIEUW GOOIEN';
b.onclick=()=>go('targetRoll');
ac.append(b)
}

$('chat').scrollTop=99999
}

async function hold(i){if(S.phase==='main'&&S.rolled)await go('hold',{i})}
async function chat(){let x=$('ci'),t=x.value.trim();if(t){x.value='';await go('chat',{text:t})}}
async function copy(){try{await navigator.clipboard.writeText(location.href);alert('Link gekopieerd!')}catch(e){prompt('Kopieer deze link:',location.href)}}

async function go(action,data){
if(busy)return;
busy=1;
try{
await api('/api/action',Object.assign({action},data||{}));
await get(1)
}catch(e){alert(e.message)}
busy=0
}

async function get(force){
if(!tok){home();return}
try{
let x=await api('/api/state');
if(force||x.s.rev!==rev){
S=x.s;
rev=S.rev;
S.phase==='lobby'?lobby():game()
}
}catch(e){
tok='';
sessionStorage.removeItem('dtoken');
home()
}
}

home();
if(tok)get(1);
setInterval(()=>tok&&!busy&&get(0),700);
</script></body>`;

const earn={5:6,6:5,7:4,8:3,9:2,10:1,25:1,26:2,27:3,28:4,29:5,30:6};
const pay={12:1,13:2,14:3,15:4,16:5,17:6,18:6,19:5,20:4,21:3,22:2,23:1};
const same=a=>a.length===5&&a.every(x=>x===a[0]);
const target=(d,s)=>(d==='earn'?earn:pay)[s]||0;

function money(r,id,n){
let ps=act(r),m=ps.find(x=>x.id===id);
if(!m)return;
ps.forEach(x=>{
if(x.id!==id){
m.money=+(m.money+n).toFixed(2);
x.money=+(x.money-n).toFixed(2)
}
})
}

function next(r){
let ps=act(r);
if(!ps.length)return;
let i=ps.findIndex(x=>x.id===r.turn);
r.turn=ps[(i+1)%ps.length].id;
r.phase='main';
r.d=[1,1,1,1,1];
r.h=[0,0,0,0,0];
r.th=[0,0,0,0,0];
r.rolled=0;
r.target=0;
r.result='';
r.msg='Nieuwe beurt.';
r.undo=null;
r.snap=null;
r.rev++
}

function start(r){
let ps=act(r),best=0,w=[];
if(ps.length<2)throw Error('Minimaal 2 spelers nodig.');

while(w.length!==1){
best=0;
w=[];
ps.forEach(x=>{
let n=roll();
if(n>best){best=n;w=[x]}
else if(n===best)w.push(x)
})
}

r.turn=w[0].id;
r.phase='main';
r.d=[1,1,1,1,1];
r.h=[0,0,0,0,0];
r.th=[0,0,0,0,0];
r.rolled=0;
r.msg=w[0].name+' begint.';
r.rev++
}

function pub(r,p){
return{
rev:r.rev,
code:r.code,
phase:r.phase,
p:r.p.map(x=>({id:x.id,name:x.name,money:x.money,admin:x.admin,on:x.on})),
turn:r.turn,
d:r.d,
h:r.h,
th:r.th,
rolled:r.rolled,
target:r.target,
result:r.result,
msg:r.msg,
chat:r.chat,
undo:!!r.undo,
snap:!!r.snap,
me:p.id
}
}

function action(r,p,b){
if(!p||!p.on)throw Error('Speler is niet actief.');

let a=b.action;

if(a==='chat'){
let t=String(b.text||'').trim().slice(0,200);
if(t){
r.chat.push({name:p.name,text:t});
r.chat=r.chat.slice(-40);
r.rev++
}
return
}

if(a==='start'){
if(!p.admin)throw Error('Alleen de beheerder kan starten.');
if(r.phase!=='lobby')throw Error('Het spel is al gestart.');
start(r);
return
}

if(a==='pause'||a==='remove'){
if(!p.admin)throw Error('Alleen de beheerder.');
let x=r.p.find(q=>q.id===b.id);
if(!x||x.admin)throw Error('Ongeldige speler.');
x.on=a==='pause'?!x.on:false;
if(r.turn===x.id)next(r);
r.rev++;
return
}

if(r.turn!==p.id)throw Error('Niet jouw beurt.');

if(a==='roll'){
if(r.phase!=='main')throw Error('Je kunt nu niet gooien.');
if(r.rolled&&!r.h.some(Boolean))throw Error('Zet eerst 1 dobbelsteen vast.');
if(r.rolled&&r.h.every(Boolean))throw Error('Alle dobbelstenen staan vast.');

for(let i=0;i<5;i++)if(!r.h[i])r.d[i]=roll();

r.rolled=1;
r.rev++;
return
}

if(a==='hold'){
if(!r.rolled)throw Error('Gooi eerst.');
let i=+b.i;
if(i<0||i>4)throw Error('Ongeldige dobbelsteen.');

r.undo={d:[...r.d],h:[...r.h]};
r.h[i]=!r.h[i];
r.rev++;
return
}

if(a==='accept'){
if(!r.rolled||!r.h.some(Boolean))throw Error('Zet minimaal 1 dobbelsteen vast.');

let s=r.d.reduce((a,b)=>a+b,0);

r.snap={
d:[...r.d],
h:[...r.h],
money:r.p.map(x=>[x.id,x.money])
};

if(s===11||s===24){
money(r,p.id,-.5);
r.result=s+': BETALEN €0,50';
r.rev++;
setTimeout(()=>r.turn===p.id&&next(r),600);
return
}

let dir=s<11||s>24?'earn':'pay';
let t=same(r.d)?6:target(dir,s);

if(!t){
r.snap=null;
throw Error('Deze combinatie is niet geldig.')
}

r.phase=dir;
r.target=t;
r.th=[0,0,0,0,0];
r.h=[0,0,0,0,0];
r.result=(dir==='earn'?'VERDIENEN: ':'BETALEN: ')+t+"'EN";
r.rev++;
return
}

if(a==='undoHold'){
if(!r.undo)throw Error('Geen vastzetting.');
r.d=[...r.undo.d];
r.h=[...r.undo.h];
r.undo=null;
r.rev++;
return
}

if(a==='undoAccept'){
if(!r.snap)throw Error('Geen akkoord.');

r.snap.money.forEach(z=>{
let x=r.p.find(q=>q.id===z[0]);
if(x)x.money=z[1]
});

r.d=r.snap.d;
r.h=r.snap.h;
r.phase='main';
r.rolled=1;
r.result='';
r.snap=null;
r.rev++;
return
}

if(a==='targetRoll'){
if(r.th.every(Boolean))r.th=[0,0,0,0,0];

let hits=0;

for(let i=0;i<5;i++)if(!r.th[i]){
r.d[i]=roll();
if(r.d[i]===r.target){
r.th[i]=1;
hits++
}
}

if(!hits){
r.msg='Geen nieuwe '+r.target+'. Beurt voorbij.';
r.rev++;
setTimeout(()=>next(r),600);
return
}

let n=hits*r.target*.5;
money(r,p.id,r.phase==='earn'?n:-n);
r.msg=(r.phase==='earn'?'VERDIEND ':'BETAALD ')+eur(n);
r.rev++;
return
}

throw Error('Onbekende actie.')
}

const server=http.createServer((q,s)=>{
let u=new URL(q.url,'http://x');

if(q.method==='OPTIONS'){
s.writeHead(204,{
'Access-Control-Allow-Origin':'*',
'Access-Control-Allow-Headers':'Content-Type,X-Token'
});
return s.end()
}

if(u.pathname==='/'&&q.method==='GET'){
s.writeHead(200,{
'Content-Type':'text/html;charset=utf-8',
'Cache-Control':'no-store'
});
return s.end(HTML)
}

let body='';
q.on('data',x=>body+=x);

q.on('end',()=>{
let b={};
try{b=JSON.parse(body||'{}')}catch(e){}

if(u.pathname==='/api/create'){
let n=String(b.name||'').trim();
if(!n)return out(s,400,{error:'Vul je naam in.'});

let c;
do c=crypto.randomBytes(2).toString('hex').toUpperCase();
while(rooms.has(c));

let t=uid();
let p={
id:uid(),
t,
name:n.slice(0,20),
money:100,
admin:1,
on:1
};

rooms.set(c,{
code:c,
rev:1,
phase:'lobby',
p:[p],
turn:null,
d:[1,1,1,1,1],
h:[0,0,0,0,0],
th:[0,0,0,0,0],
rolled:0,
target:0,
result:'',
msg:'Wacht op spelers.',
chat:[],
undo:null,
snap:null
});

return out(s,200,{code:c,token:t})
}

if(u.pathname==='/api/join'){
let c=String(b.code||'').toUpperCase();
let r=rooms.get(c);
let n=String(b.name||'').trim();

if(!r)return out(s,404,{error:'Kamer bestaat niet.'});
if(r.phase!=='lobby')return out(s,400,{error:'Spel is al gestart.'});
if(act(r).length>=4)return out(s,400,{error:'Maximaal 4 spelers.'});
if(!n)return out(s,400,{error:'Vul je naam in.'});

let t=uid();

r.p.push({
id:uid(),
t,
name:n.slice(0,20),
money:100,
admin:0,
on:1
});

r.rev++;

return out(s,200,{code:c,token:t})
}

let t=q.headers['x-token']||'';

for(let r of rooms.values()){
let p=find(r,t);
if(!p)continue;

if(u.pathname==='/api/state')
return out(s,200,{s:pub(r,p)});

if(u.pathname==='/api/action')
try{
action(r,p,b);
return out(s,200,{ok:1})
}catch(e){
return out(s,400,{error:e.message})
}
}

out(s,401,{error:'Sessie verlopen.'})
})
});

function out(s,n,j){
s.writeHead(n,{
'Content-Type':'application/json',
'Cache-Control':'no-store',
'Access-Control-Allow-Origin':'*'
});
s.end(JSON.stringify(j))
}

server.listen(PORT,'0.0.0.0',()=>console.log('Dobbelen 11/24 online '+PORT));
