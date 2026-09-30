const http=require('http');
const crypto=require('crypto');

const PORT=process.env.PORT||10000;
const rooms=new Map();
const sessions=new Map();

const HTML=`<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>🎲 DOBBELEN 11/24</title>

<style>
*{box-sizing:border-box}

body{
 margin:0;
 background:radial-gradient(circle at 50% 0,#65001d,#21000d 40%,#070107 100%);
 color:#fff;
 font-family:Arial,sans-serif;
 min-height:100vh;
}

.wrap{
 max-width:900px;
 margin:auto;
 padding:14px;
}

.logo{
 text-align:center;
 color:#ffd83d;
 font-size:42px;
 font-weight:900;
 text-shadow:0 0 12px #f00,3px 3px #710019;
}

.tag{
 text-align:center;
 letter-spacing:6px;
 color:#ffe9a0;
 margin:5px 0 18px;
}

.panel{
 background:linear-gradient(145deg,#210813,#09040a);
 border:2px solid #8b1740;
 border-radius:22px;
 padding:18px;
 margin:12px 0;
 box-shadow:0 0 20px #f04a2633;
}

input{
 width:100%;
 padding:13px;
 border-radius:11px;
 border:1px solid #555;
 background:#111;
 color:#fff;
 font-size:17px;
 margin:5px 0;
}

button{
 border:0;
 border-radius:12px;
 padding:13px 17px;
 margin:5px;
 color:#fff;
 background:#16376f;
 font-size:16px;
 font-weight:900;
}

button:disabled{
 opacity:.35;
}

.green{
 background:#159447;
}

.orange{
 background:#c8790c;
}

.red{
 background:#a51832;
}

.center{
 text-align:center;
}

.code{
 font-size:31px;
 letter-spacing:7px;
 color:#ffd83d;
 font-weight:900;
 text-align:center;
}

.players{
 display:grid;
 grid-template-columns:repeat(4,1fr);
 gap:8px;
}

.player{
 background:#120711;
 border:1px solid #5b1734;
 border-radius:13px;
 padding:11px;
}

.player.turn{
 outline:3px solid #ffd83d;
}

.money{
 font-size:21px;
 color:#6cff91;
 font-weight:900;
}

.status{
 text-align:center;
 background:#111;
 border-radius:12px;
 padding:11px;
 color:#ffe78b;
 font-weight:900;
 margin:8px 0;
}

.banner{
 text-align:center;
 border:2px solid #ffd83d;
 border-radius:15px;
 padding:13px;
 font-size:24px;
 font-weight:900;
 margin:10px 0;
 background:#160812;
}

.dice{
 display:flex;
 justify-content:center;
 gap:12px;
 flex-wrap:wrap;
 padding:22px 0;
 min-height:130px;
}

.die{
 width:72px;
 height:72px;
 position:relative;
 cursor:pointer;
}

.cube{
 position:absolute;
 inset:4px;
 transform-style:preserve-3d;
}

.face{
 position:absolute;
 inset:0;
 border-radius:12px;
 border:2px solid #79090d;
 background:linear-gradient(145deg,#ed3030,#a5080b);
 display:grid;
 grid-template-columns:repeat(3,1fr);
 grid-template-rows:repeat(3,1fr);
 padding:7px;
 box-shadow:
   inset 0 2px 2px #fff5,
   0 7px 12px #0008;
}

.pip{
 width:11px;
 height:11px;
 background:#fff;
 border-radius:50%;
 align-self:center;
 justify-self:center;
 box-shadow:0 1px 2px #300;
}

.die.held .cube{
 filter:drop-shadow(0 0 9px #3cff9a);
}

.die.held:after{
 content:"VAST";
 position:absolute;
 bottom:-13px;
 left:0;
 right:0;
 text-align:center;
 color:#4cff9b;
 font-size:10px;
 font-weight:900;
}

.total{
 text-align:center;
 font-size:48px;
 font-weight:900;
}

.actions{
 text-align:center;
}

.log,
.chatlog{
 background:#080308;
 border-radius:11px;
 padding:9px;
 max-height:180px;
 overflow:auto;
}

.msg,
.log div{
 padding:5px;
 border-bottom:1px solid #ffffff12;
}

.rule{
 position:fixed;
 left:18px;
 right:18px;
 bottom:12px;
 margin:auto;
 max-width:540px;
 background:#102b59;
 border:1px solid #ffd83d;
 border-radius:18px;
 padding:10px;
 text-align:center;
 z-index:10;
}

.small{
 font-size:12px;
 color:#bbb;
}

.hidden{
 display:none!important;
}

@media(max-width:650px){
 .players{
   grid-template-columns:repeat(2,1fr);
 }

 .logo{
   font-size:35px;
 }

 .die{
   width:65px;
   height:65px;
 }
}
</style>
</head>

<body>

<div class="wrap">

<div class="logo">
🎲 DOBBELEN 11/24
</div>

<div class="tag">
ONLINE MULTIPLAYER
</div>

<main id="app"></main>

</div>

<div class="rule">
🚩 Regel: 5 dezelfde = 6️⃣ verdienen
</div>

<script>

const app=document.getElementById('app');

let token=sessionStorage.getItem('d1124_token')||'';
let S=null;
let room=new URLSearchParams(location.search).get('room')||'';
let last=-1;
let busy=false;

const $=id=>document.getElementById(id);

const esc=x=>String(x??'').replace(
 /[&<>"]/g,
 c=>({
   '&':'&amp;',
   '<':'&lt;',
   '>':'&gt;',
   '"':'&quot;'
 }[c])
);

const euro=x=>
 '€'+Number(x||0).toFixed(2).replace('.',',');

async function api(path,data){

 let o={
   method:data?'POST':'GET',
   headers:{
     'Content-Type':'application/json',
     'X-Token':token
   }
 };

 if(data){
   o.body=JSON.stringify(data);
 }

 let r=await fetch(path,o);
 let j=await r.json();

 if(!r.ok){
   throw Error(j.error||'Er ging iets mis.');
 }

 return j;
}

function home(){

 app.innerHTML=room

 ?

 '<section class="panel center">'+
 '<h2>🎲 JE BENT UITGENODIGD</h2>'+
 '<p>Vul alleen je naam in.</p>'+
 '<div class="code">'+esc(room)+'</div>'+
 '<input id="jn" placeholder="Jouw naam" maxlength="20">'+
 '<button class="green" onclick="join()">'+
 'MEEDOEN MET DIT SPEL'+
 '</button>'+
 '</section>'

 :

 '<section class="panel center">'+
 '<h2>NIEUW SPEL</h2>'+
 '<input id="cn" placeholder="Jouw naam" maxlength="20">'+
 '<button class="green" onclick="create()">'+
 '🎲 SPEL MAKEN'+
 '</button>'+
 '</section>'+

 '<section class="panel center">'+
 '<h2>MEEDOEN</h2>'+
 '<input id="jn" placeholder="Jouw naam" maxlength="20">'+
 '<input id="rc" placeholder="Spelcode" maxlength="6">'+
 '<button onclick="join()">MEEDOEN</button>'+
 '</section>';

}

async function create(){

 try{

   let j=await api(
     '/api/create',
     {
       name:$('cn').value.trim()
     }
   );

   token=j.token;

   sessionStorage.setItem(
     'd1124_token',
     token
   );

   room=j.room;

   history.replaceState(
     {},
     '',
     location.pathname+'?room='+room
   );

   refresh(true);

 }catch(x){

   alert(x.message);

 }

}

async function join(){

 let n=$('jn').value.trim();

 if(!n){
   return alert('Vul je naam in.');
 }

 let c=room||$('rc').value.trim().toUpperCase();

 if(!c){
   return alert('Vul de spelcode in.');
 }

 try{

   let j=await api(
     '/api/join',
     {
       name:n,
       room:c
     }
   );

   token=j.token;

   sessionStorage.setItem(
     'd1124_token',
     token
   );

   room=c;

   history.replaceState(
     {},
     '',
     location.pathname+'?room='+room
   );

   refresh(true);

 }catch(x){

   alert(x.message);

 }

}

async function act(a,p={}){

 try{

   let j=await api(
     '/api/action',
     Object.assign(
       {action:a},
       p
     )
   );

   S=j;

   render();

 }catch(x){

   alert(x.message);

 }

}

function copyLink(){

 let u=
   location.origin+
   '/?room='+
   room;

 if(navigator.clipboard){

   navigator.clipboard
     .writeText(u)
     .then(
       ()=>alert('Link gekopieerd!')
     )
     .catch(
       ()=>prompt(
         'Kopieer deze link:',
         u
       )
     );

 }else{

   prompt(
     'Kopieer deze link:',
     u
   );

 }

}

function pips(v){

 let m={
   1:[5],
   2:[1,9],
   3:[1,5,9],
   4:[1,3,7,9],
   5:[1,3,5,7,9],
   6:[1,3,4,6,7,9]
 }[v];

 let s='';

 for(let i=1;i<=9;i++){

   s+=
     '<i class="pip" style="visibility:'+
     (m.includes(i)?'visible':'hidden')+
     '"></i>';

 }

 return s;
}

function render(){

 if(!S){
   return;
 }

 app.innerHTML=

 '<section class="panel">'+

 '<div class="status">'+

 (
   S.current===S.me
   ? '👉 JIJ BENT AAN DE BEURT'
   : '⏳ '+esc(S.currentName)+' is aan de beurt'
 )+

 '</div>'+

 '<div class="center">'+

 '<b>TAFELCODE</b>'+

 '<div class="code">'+
 esc(S.room)+
 '</div>'+

 '<button onclick="copyLink()">'+
 '📋 UITNODIGINGSLINK KOPIËREN'+
 '</button>'+

 '</div>'+

 '<div class="players">'+

 S.players.map(
   p=>

   '<div class="player '+
   (p.id===S.current?'turn':'')+
   '">'+

   '<b>'+
   esc(p.name)+
   (p.admin?' 👑':'')+
   '</b>'+

   '<div class="money">'+
   euro(p.money)+
   '</div>'+

   '<div class="small">'+
   (p.active?'🟢 Actief':'⏸️ Pauze')+
   '</div>'+

   '</div>'

 ).join('')+

 '</div>'+

 '<div class="banner">'+
 esc(S.banner)+
 '</div>'+

 '<div class="dice">'+

 S.dice.map(

   (v,i)=>

   '<div class="die '+
   (S.held[i]?'held':'')+
   '" onclick="'+
   (
     S.me===S.current &&
     S.phase==='main' &&
     !S.held[i]
     ?
     "act('hold',{index:"+i+"})"
     :
     ''
   )+
   '">'+

   '<div class="cube">'+

   '<div class="face">'+
   pips(v)+
   '</div>'+

   '</div>'+

   '</div>'

 ).join('')+

 '</div>'+

 '<div class="total">'+
 'TOTAAL: '+
 (
   S.dice.length
   ?
   S.dice.reduce(
     (a,b)=>a+b,
     0
   )
   :
   '–'
 )+
 '</div>'+

 '<div class="actions">'+

 (
   S.isAdmin&&!S.started
   ?
   '<button class="green" onclick="act(\'start\')">'+
   '🎲 START SPEL'+
   '</button>'
   :
   ''
 )+

 (
   S.started &&
   S.me===S.current &&
   S.phase==='idle'
   ?
   '<button class="green" onclick="act(\'begin\')">'+
   '🎲 BEGIN WORP'+
   '</button>'
   :
   ''
 )+

 (
   S.me===S.current &&
   S.phase==='main' &&
   S.held.some(Boolean)
   ?
   '<button class="orange" onclick="act(\'reroll\')">'+
   '🎲 OPNIEUW GOOIEN'+
   '</button>'
   :
   ''
 )+

 (
   S.me===S.current &&
   S.phase==='main' &&
   S.rolled
   ?
   '<button onclick="act(\'accept\')">'+
   'AKKOORD'+
   '</button>'
   :
   ''
 )+

 (
   S.me===S.current &&
   S.undoHold
   ?
   '<button onclick="act(\'undoHold\')">'+
   '↩️ LAATSTE VASTZETTING TERUG'+
   '</button>'
   :
   ''
 )+

 (
   S.me===S.current &&
   S.undoAccept
   ?
   '<button onclick="act(\'undoAccept\')">'+
   '↩️ AKKOORD TERUG'+
   '</button>'
   :
   ''
 )+

 (
   S.me===S.current &&
   S.phase==='target'
   ?
   '<button class="orange" onclick="act(\'reroll\')">'+
   '🎲 DOORGOOIEN'+
   '</button>'
   :
   ''
 )+

 '</div>'+

 '</section>'+

 '<section class="panel">'+

 '<h3>📜 SPELGESCHIEDENIS</h3>'+

 '<div class="log">'+

 (
   S.log||[]
 ).slice().reverse().map(
   x=>'<div>'+esc(x)+'</div>'
 ).join('')+

 '</div>'+

 '</section>'+

 '<section class="panel">'+

 '<h3>💬 CHAT</h3>'+

 '<div class="chatlog">'+

 (
   S.chat||[]
 ).map(
   x=>
   '<div class="msg">'+
   '<b>'+esc(x.name)+':</b> '+
   esc(x.text)+
   '</div>'
 ).join('')+

 '</div>'+

 '<input id="chat" placeholder="Typ een bericht..." maxlength="120">'+

 '<button onclick="act(\'chat\',{text:$(\\'chat\\').value})">'+
 'VERSTUUR'+
 '</button>'+

 '</section>'+

 (
   S.isAdmin

   ?

   '<section class="panel">'+
   '<h3>👑 ADMIN</h3>'+

   S.players
     .filter(p=>!p.admin)
     .map(
       p=>

       '<button onclick="act(\'pause\',{id:\\''+
       p.id+
       '\\'})">'+

       (
         p.active
         ? '⏸️ PAUZE'
         : '▶️ ACTIEF'
       )+

       ' '+
       esc(p.name)+
       '</button>'+

       '<button class="red" onclick="act(\'remove\',{id:\\''+
       p.id+
       '\\'})">'+
       '❌ VERWIJDER '+
       esc(p.name)+
       '</button>'

     ).join('')+

   '</section>'

   :

   ''

 );

}

function refresh(force){

 if(!token){
   return;
 }

 if(busy){
   return;
 }

 busy=true;

 fetch(
   '/api/state',
   {
     headers:{
       'X-Token':token
     },
     cache:'no-store'
   }
 )

 .then(
   r=>r.json()
 )

 .then(
   j=>{

     if(j.error){
       throw Error(j.error);
     }

     if(
       force ||
       j.rev!==last
     ){

       S=j;
       last=j.rev;
       render();

     }

   }
 )

 .catch(
   x=>{

     if(
       x.message==='Sessie verlopen'
     ){

       token='';

       sessionStorage.removeItem(
         'd1124_token'
       );

       home();

     }

   }
 )

 .finally(
   ()=>busy=false
 );

}

home();

if(token){
 refresh(true);
}

setInterval(
 ()=>refresh(false),
 700
);

</script>

</body>
</html>`;

function uid(){
 return crypto.randomBytes(10).toString('hex');
}

function code(){

 return crypto
   .randomBytes(3)
   .toString('hex')
   .toUpperCase();

}

function die(){
 return 1+Math.floor(Math.random()*6);
}

function dice(){
 return [
   die(),
   die(),
   die(),
   die(),
   die()
 ];
}

function active(r){
 return r.players.filter(
   p=>p.active
 );
}

function same(a){
 return (
   a.length===5 &&
   a.every(
     x=>x===a[0]
   )
 );
}

function sum(a){
 return a.reduce(
   (x,y)=>x+y,
   0
 );
}

function log(r,x){

 r.log.push(x);

 if(r.log.length>80){
   r.log.shift();
 }

 r.rev++;

}

function next(r){

 let ps=active(r);

 let i=ps.findIndex(
   p=>p.id===r.current
 );

 if(!ps.length){
   return;
 }

 if(i<0){
   r.current=ps[0].id;
 }else{
   r.current=
     ps[(i+1)%ps.length].id;
 }

}

function get(r,id){
 return r.players.find(
   p=>p.id===id
 );
}

function pay(r,p,amt){

 active(r)
   .filter(
     x=>x.id!==p.id
   )
   .forEach(
     q=>{

       p.money=
         Math.round(
           (p.money-amt)*100
         )/100;

       q.money=
         Math.round(
           (q.money+amt)*100
         )/100;

     }
   );

}

function earn(r,p,amt){

 active(r)
   .filter(
     x=>x.id!==p.id
   )
   .forEach(
     q=>{

       p.money=
         Math.round(
           (p.money+amt)*100
         )/100;

       q.money=
         Math.round(
           (q.money-amt)*100
         )/100;

     }
   );

}

function targetFor(t){

 if(
   t===11 ||
   t===24
 ){
   return null;
 }

 if(t<=10){

   return {
     mode:'earn',
     target:11-t
   };

 }

 if(t>=25){

   return {
     mode:'earn',
     target:t-24
   };

 }

 if(
   t>=12 &&
   t<=17
 ){

   return {
     mode:'pay',
     target:t-11
   };

 }

 return {
   mode:'pay',
   target:24-t
 };

}

function finish(r){

 next(r);

 r.phase='idle';

 r.dice=[];

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

 r.banner='Wacht op de volgende beurt.';

 r.rev++;

}

function publicState(r,p){

 return {

   rev:r.rev,

   room:r.code,

   me:p.id,

   isAdmin:p.admin,

   started:r.started,

   current:r.current,

   currentName:
     get(r,r.current)?.name||'',

   phase:r.phase,

   dice:r.dice,

   held:r.held,

   rolled:r.rolled,

   direction:r.direction,

   target:r.target,

   undoHold:!!r.undoHold,

   undoAccept:!!r.undoAccept,

   players:r.players.map(
     x=>({

       id:x.id,
       name:x.name,
       money:x.money,
       active:x.active,
       admin:x.admin

     })
   ),

   log:r.log,

   chat:r.chat,

   banner:r.banner

 };

}

function newRoom(name){

 let c;

 do{
   c=code();
 }while(
   rooms.has(c)
 );

 let p={
   id:uid(),
   name:name.slice(0,20),
   money:100,
   active:true,
   admin:true
 };

 let r={

   code:c,

   players:[p],

   started:false,

   current:p.id,

   phase:'idle',

   dice:[],

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

   undoHold:null,

   undoAccept:null,

   banner:'Wacht op spelers.',

   log:[],

   chat:[],

   rev:1

 };

 rooms.set(
   c,
   r
 );

 return [
   r,
   p
 ];

}

function body(req){

 return new Promise(
   (res,rej)=>{

     let s='';

     req.on(
       'data',
       c=>s+=c
     );

     req.on(
       'end',
       ()=>{

         try{

           res(
             s
             ? JSON.parse(s)
             : {}
           );

         }catch(e){

           rej(
             Error('Ongeldige JSON')
           );

         }

       }
     );

   }
 );

}

function json(res,status,x){

 let s=JSON.stringify(x);

 res.writeHead(
   status,
   {
     'Content-Type':
       'application/json',
     'Cache-Control':
       'no-store'
   }
 );

 res.end(s);

}

function session(req){

 return sessions.get(
   req.headers['x-token']||''
 );

}

function action(r,p,b){

 let a=b.action;

 if(a==='start'){

   if(!p.admin){
     throw Error(
       'Alleen de beheerder kan starten.'
     );
   }

   if(r.started){
     throw Error(
       'Het spel is al gestart.'
     );
   }

   if(active(r).length<2){
     throw Error(
       'Minimaal 2 actieve spelers nodig.'
     );
   }

   let ps=active(r);

   /*
    BEGINWORP:
    iedere actieve speler gooit
    één dobbelsteen.
    Hoogste begint.
    Bij gelijkstand gooien alleen
    de spelers met de hoogste waarde
    opnieuw.
   */

   let rolls=ps.map(
     x=>({
       p:x,
       v:die()
     })
   );

   let high=Math.max(
     ...rolls.map(
       x=>x.v
     )
   );

   let tied=rolls
     .filter(
       x=>x.v===high
     )
     .map(
       x=>x.p
     );

   while(tied.length>1){

     let rr=tied.map(
       x=>({
         p:x,
         v:die()
       })
     );

     let h=Math.max(
       ...rr.map(
         x=>x.v
       )
     );

     tied=rr
       .filter(
         x=>x.v===h
       )
       .map(
         x=>x.p
       );

   }

   r.current=tied[0].id;

   r.started=true;

   r.banner=
     tied[0].name+
     ' begint.';

   log(
     r,
     '🎲 '+
     tied[0].name+
     ' begint na de startworp.'
   );

   return;

 }

 if(a==='chat'){

   let t=String(
     b.text||''
   )
   .trim()
   .slice(0,120);

   if(t){

     r.chat.push({
       name:p.name,
       text:t
     });

     if(r.chat.length>50){
       r.chat.shift();
     }

     r.rev++;

   }

   return;

 }

 if(
   a==='pause' ||
   a==='remove'
 ){

   if(!p.admin){

     throw Error(
       'Alleen de beheerder.'
     );

   }

   let q=get(
     r,
     b.id
   );

   if(!q || q.admin){

     throw Error(
       'Speler niet gevonden.'
     );

   }

   if(a==='pause'){

     q.active=!q.active;

     log(
       r,
       (
         q.active
         ? '▶️ '
         : '⏸️ '
       )+
       q.name+
       (
         q.active
         ? ' is actief.'
         : ' staat op pauze.'
       )
     );

     if(
       !q.active &&
       r.current===q.id
     ){

       finish(r);

     }

   }else{

     r.players=
       r.players.filter(
         x=>x.id!==q.id
       );

     log(
       r,
       '❌ '+
       q.name+
       ' is verwijderd.'
     );

     if(
       r.current===q.id
     ){

       finish(r);

     }

   }

   return;

 }

 if(!r.started){

   throw Error(
     'Het spel is nog niet gestart.'
   );

 }

 if(
   r.current!==p.id ||
   !p.active
 ){

   throw Error(
     'Je bent niet aan de beurt.'
   );

 }

 if(a==='begin'){

   if(r.phase!=='idle'){

     throw Error(
       'Niet nu.'
     );

   }

   r.dice=dice();

   r.held=[
     false,
     false,
     false,
     false,
     false
   ];

   r.rolled=true;

   r.phase='main';

   r.undoHold=null;

   r.banner=
     'Zet minimaal 1 dobbelsteen vast.';

   log(
     r,
     '🎲 '+
     p.name+
     ' doet een worp.'
   );

   return;

 }

 if(a==='hold'){

   if(
     r.phase!=='main' ||
     !r.rolled
   ){

     throw Error(
       'Gooi eerst.'
     );

   }

   let i=Number(
     b.index
   );

   if(
     i<0 ||
     i>4 ||
     r.held[i]
   ){

     return;

   }

   r.undoHold=
     r.held.slice();

   r.held[i]=true;

   r.rev++;

   return;

 }

 if(a==='undoHold'){

   if(!r.undoHold){

     throw Error(
       'Geen laatste vastzetting.'
     );

   }

   r.held=
     r.undoHold;

   r.undoHold=null;

   r.rev++;

   return;

 }

 if(a==='reroll'){

   /*
    HOOFDFASE
   */

   if(r.phase==='main'){

     if(
       !r.held.some(
         Boolean
       )
     ){

       throw Error(
         'Zet minimaal 1 dobbelsteen vast voordat je opnieuw gooit.'
       );

     }

     for(
       let i=0;
       i<5;
       i++
     ){

       if(!r.held[i]){
         r.dice[i]=die();
       }

     }

     r.undoHold=null;

     r.banner=
       'Nieuwe worp. Zet vóór de volgende worp weer minimaal 1 vast.';

     r.rev++;

     return;

   }

   /*
    VERDIEN/BETAALFASE
   */

   if(r.phase==='target'){

     /*
      Als alle vijf doelstenen zijn
      geraakt, mogen alle vijf opnieuw.
     */

     if(
       r.held.every(Boolean)
     ){

       r.held=[
         false,
         false,
         false,
         false,
         false
       ];

     }

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
      AKKOORD TERUG kan alleen vóór
      de eerste doelworp.
     */

     r.undoAccept=null;

     let hits=0;

     for(
       let i=0;
       i<5;
       i++
     ){

       if(
         !r.held[i] &&
         r.dice[i]===r.target
       ){

         r.held[i]=true;

         hits++;

         if(
           r.direction==='earn'
         ){

           earn(
             r,
             p,
             r.target*.5
           );

         }else{

           pay(
             r,
             p,
             r.target*.5
           );

         }

       }

     }

     /*
      GEEN nieuwe doelsteen =
      beurt direct voorbij.
     */

     if(!hits){

       log(
         r,
         '❌ Geen nieuwe doelsteen. Beurt voorbij.'
       );

       finish(r);

       return;

     }

     log(
       r,
       (
         r.direction==='earn'
         ? '💰 '
         : '💸 '
       )+
       p.name+
       ' heeft '+
       hits+
       ' nieuwe '+
       r.target+
       ' gegooid.'
     );

     r.rev++;

     return;

   }

 }

 if(a==='accept'){

   if(
     r.phase!=='main' ||
     !r.rolled
   ){

     throw Error(
       'Gooi eerst.'
     );

   }

   let t=sum(
     r.dice
   );

   /*
    11 en 24:
    direct €0,50 betalen aan
    iedere actieve tegenstander.
   */

   if(
     t===11 ||
     t===24
   ){

     pay(
       r,
       p,
       .5
     );

     log(
       r,
       '💸 '+
       p.name+
       ' betaalt €0,50 per actieve tegenstander.'
     );

     finish(r);

     return;

   }

   let z=targetFor(t);

   /*
    5 dezelfde = altijd 6.
   */

   if(
     same(r.dice)
   ){

     /*
      De 5 dezelfde-regel wordt
      altijd als 6-en behandeld.
      De richting volgt de worp:
      bij de speciale hoofdregel is
      dit verdienen.
     */

     z={
       mode:'earn',
       target:6
     };

   }

   r.undoAccept={
     dice:r.dice.slice(),
     held:r.held.slice()
   };

   r.direction=z.mode;

   r.target=z.target;

   r.phase='target';

   r.held=[
     false,
     false,
     false,
     false,
     false
   ];

   r.banner=
     (
       z.mode==='earn'
       ? 'VERDIENEN: '
       : 'BETALEN: '
     )+
     z.target+
     '-EN';

   r.rev++;

   return;

 }

 if(a==='undoAccept'){

   if(!r.undoAccept){

     throw Error(
       'Geen akkoord om terug te zetten.'
     );

   }

   r.dice=
     r.undoAccept.dice;

   r.held=
     r.undoAccept.held;

   r.undoAccept=null;

   r.phase='main';

   r.direction=null;

   r.target=null;

   r.rev++;

   return;

 }

 throw Error(
   'Onbekende actie.'
 );

}

const server=
http.createServer(
 async(req,res)=>{

   try{

     let u=
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
           'Cache-Control':
             'no-store'
         }
       );

       return res.end(
         HTML
       );

     }

     if(
       req.method==='GET' &&
       u.pathname==='/health'
     ){

       return json(
         res,
         200,
         {ok:true}
       );

     }

     if(
       req.method==='POST' &&
       u.pathname==='/api/create'
     ){

       let b=
         await body(req);

       let name=
         String(
           b.name||''
         ).trim();

       if(!name){

         throw Error(
           'Vul je naam in.'
         );

       }

       let [
         r,
         p
       ]=newRoom(name);

       let t=uid();

       sessions.set(
         t,
         {
           r,
           p
         }
       );

       return json(
         res,
         200,
         {
           room:r.code,
           token:t
         }
       );

     }

     if(
       req.method==='POST' &&
       u.pathname==='/api/join'
     ){

       let b=
         await body(req);

       let r=
         rooms.get(
           String(
             b.room||''
           ).toUpperCase()
         );

       let name=
         String(
           b.name||''
         ).trim();

       if(!r){

         throw Error(
           'Kamer niet gevonden.'
         );

       }

       if(r.started){

         throw Error(
           'Het spel is al gestart.'
         );

       }

       if(r.players.length>=4){

         throw Error(
           'Deze kamer zit vol.'
         );

       }

       if(!name){

         throw Error(
           'Vul je naam in.'
         );

       }

       let p={

         id:uid(),

         name:name.slice(
           0,
           20
         ),

         money:100,

         active:true,

         admin:false

       };

       r.players.push(p);

       r.rev++;

       let t=uid();

       sessions.set(
         t,
         {
           r,
           p
         }
       );

       return json(
         res,
         200,
         {
           room:r.code,
           token:t
         }
       );

     }

     if(
       req.method==='GET' &&
       u.pathname==='/api/state'
     ){

       let s=
         session(req);

       if(!s){

         throw Error(
           'Sessie verlopen'
         );

       }

       return json(
         res,
         200,
         publicState(
           s.r,
           s.p
         )
       );

     }

     if(
       req.method==='POST' &&
       u.pathname==='/api/action'
     ){

       let s=
         session(req);

       if(!s){

         throw Error(
           'Sessie verlopen'
         );

       }

       let b=
         await body(req);

       action(
         s.r,
         s.p,
         b
       );

       return json(
         res,
         200,
         publicState(
           s.r,
           s.p
         )
       );

     }

     return json(
       res,
       404,
       {
         error:'Niet gevonden'
       }
     );

   }catch(e){

     return json(
       res,
       400,
       {
         error:
           e.message||
           'Fout'
       }
     );

   }

 }
);

server.listen(
 PORT,
 '0.0.0.0',
 ()=>console.log(
   'Dobbelen 11/24 draait op '+PORT
 )
);
