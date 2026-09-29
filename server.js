const http = require("http");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const sessions = new Map();

const rand = n => Math.floor(Math.random() * n);
const dice = () => Array.from({length:5}, () => rand(6)+1);
const money = n => Math.round(n*100)/100;
const token = () => crypto.randomBytes(16).toString("hex");

function roomCode(){
  let c;
  do c = Math.random().toString(36).substring(2,8).toUpperCase();
  while(rooms.has(c));
  return c;
}

function active(r){
  return r.players.filter(p => p.active);
}

function send(res,data,status=200){
  const x=JSON.stringify(data);
  res.writeHead(status,{"Content-Type":"application/json"});
  res.end(x);
}

async function body(req){
  return new Promise((ok,bad)=>{
    let d="";
    req.on("data",x=>d+=x);
    req.on("end",()=>{try{ok(JSON.parse(d||"{}"))}catch(e){bad(e)}});
  });
}

function publicState(r,p){
  return {
    room:r.code,
    players:r.players.map(x=>({
      id:x.id,name:x.name,balance:x.balance,
      active:x.active,admin:x.admin
    })),
    current:r.players[r.current]?.id,
    dice:r.dice,
    held:r.held,
    phase:r.phase,
    target:r.target,
    mode:r.mode,
    message:r.message,
    me:p.id,
    admin:p.admin
  };
}

function transfer(r,p,amount,earn){
  const others=active(r).filter(x=>x.id!==p.id);
  if(earn){
    p.balance=money(p.balance+amount*others.length);
    others.forEach(x=>x.balance=money(x.balance-amount));
  }else{
    p.balance=money(p.balance-amount*others.length);
    others.forEach(x=>x.balance=money(x.balance+amount));
  }
}

function nextPlayer(r){
  for(let n=1;n<=r.players.length;n++){
    const i=(r.current+n)%r.players.length;
    if(r.players[i].active){r.current=i;return}
  }
}

function reset(r){
  r.phase="idle";
  r.dice=[];
  r.held=[false,false,false,false,false];
  r.target=null;
  r.mode=null;
  r.message="Klik op BEGIN WORP";
}

function target(total){
  if(total<11)return ["earn",Math.min(6,11-total)];
  if(total>24)return ["earn",Math.min(6,total-24)];
  return ["pay",Math.min(6,Math.min(total-11,24-total))];
}

function resolve(r){
  const p=r.players[r.current];
  let hits=0;

  for(let i=0;i<5;i++){
    if(!r.held[i] && r.dice[i]===r.target){
      r.held[i]=true;
      hits++;
    }
  }

  if(!hits){
    r.message="❌ MIS — beurt voorbij";
    nextPlayer(r);
    reset(r);
    return;
  }

  transfer(r,p,r.target*.5,r.mode==="earn");
  r.message=(r.mode==="earn"?"💰 VERDIEND: ":"💸 BETAALD: ")+
            r.target+"'EN";

  r.phase="round";
}

function action(r,p,a,index){
  if(!r.started)throw Error("Het spel is nog niet gestart.");
  if(r.players[r.current].id!==p.id)throw Error("Je bent niet aan de beurt.");

  if(a==="begin"){
    if(r.phase!=="idle")throw Error("Je kunt nu niet beginnen.");
    r.dice=dice();
    r.held=[false,false,false,false,false];
    r.phase="main";
    r.message="Zet minimaal 1 dobbelsteen vast.";
  }

  if(a==="hold"){
    if(r.phase!=="main")throw Error("Dit kan nu niet.");
    const i=arguments[2];
    if(r.held[i])return;
    r.held[i]=true;
    r.message="VAST — je kunt opnieuw gooien.";
  }

  if(a==="reroll"){
    if(r.phase==="main"){
      if(!r.held.some(Boolean))
        throw Error("Je moet minimaal 1 dobbelsteen vastzetten.");
      for(let i=0;i<5;i++)
        if(!r.held[i])r.dice[i]=rand(6)+1;
      r.message="Nieuwe worp — zet weer minimaal 1 vast.";
    }else if(r.phase==="round"){
      r.dice=dice();
      resolve(r);
    }
  }

  if(a==="accept"){
    if(r.phase!=="main")throw Error("Geen worp om te accepteren.");

    const total=r.dice.reduce((a,b)=>a+b,0);
    const p=r.players[r.current];

    if(total===11 || total===24){
      transfer(r,p,.5,false);
      r.message=total+": BETALEN €0,50";
      nextPlayer(r);
      reset(r);
      return;
    }

    let [mode,n]=target(total);

    if(r.dice.every(x=>x===r.dice[0])){
      mode="earn";
      n=6;
    }

    r.mode=mode;
    r.target=n;
    r.phase="round";
    r.held=[false,false,false,false,false];

    resolve(r);
  }
}

const html=`<!doctype html>
<html lang="nl">
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dobbelen 11/24</title>
<style>
body{margin:0;background:#075b3b;color:white;font-family:Arial;text-align:center}
h1{color:#ffd700}
.box{max-width:600px;margin:auto;padding:20px}
input,button{font-size:18px;padding:14px;margin:6px;border-radius:10px;border:0}
button{background:#174a91;color:white;font-weight:bold}
.orange{background:#e58b00}
.dice{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin:25px 0}
.d{width:65px;height:65px;background:#c91d1d;border-radius:12px;
display:flex;align-items:center;justify-content:center;font-size:38px;
box-shadow:0 4px 8px #222}
.held{outline:5px solid #ffd700}
.money{font-size:20px;margin:8px}
.msg{font-size:25px;color:#ffd700;font-weight:bold;margin:20px}
</style>
</head>
<body>
<div class="box">
<h1>🎲 DOBBELEN 11/24 🎲</h1>
<div id="login">
<input id="name" placeholder="Je naam">
<br>
<button onclick="create()">TAFEL MAKEN</button>
<br>
<input id="code" placeholder="Tafelcode">
<button onclick="join()">MEESPELEN</button>
</div>
<div id="game" style="display:none">
<h2 id="room"></h2>
<div id="players"></div>
<div class="msg" id="msg"></div>
<div class="dice" id="dice"></div>
<div id="buttons"></div>
</div>
</div>

<script>
let t="",me="",S=null;

async function api(url,data){
 const r=await fetch(url,{method:"POST",
 headers:{"Content-Type":"application/json","x-session":t},
 body:JSON.stringify(data)});
 const x=await r.json();
 if(x.error)alert(x.error);
 return x;
}

function show(s){
 S=s; me=s.me;
 document.getElementById("login").style.display="none";
 document.getElementById("game").style.display="block";
 document.getElementById("room").innerText="TAFEL: "+s.room;
 document.getElementById("msg").innerText=s.message||"";
 document.getElementById("players").innerHTML=
 s.players.map(p=>`<div class="money">
 ${p.admin?"👑 ":""}${p.name}: €${p.balance.toFixed(2)}
 ${p.active?"":" ⏸️"}
 </div>`).join("");

 document.getElementById("dice").innerHTML=
 s.dice.map((d,i)=>`<div class="d ${s.held[i]?"held":""}"
 onclick="hold(${i})">${d}</div>`).join("");

 let b="";
 if(s.admin && !s.current){
   b=`<button onclick="start()">START SPEL</button>`;
 }else if(s.current===me){
   if(s.phase==="idle")b=`<button class="orange" onclick="act('begin')">BEGIN WORP</button>`;
   if(s.phase==="main")
    b=s.dice.map((x,i)=>`<button onclick="hold(${i})">VAST ${i+1}</button>`).join("")+
      `<br><button class="orange" onclick="act('reroll')">OPNIEUW GOOIEN</button>
       <button onclick="act('accept')">✓ AKKOORD</button>`;
   if(s.phase==="round")
    b=`<button class="orange" onclick="act('reroll')">GOOI OPNIEUW</button>`;
 }
 document.getElementById("buttons").innerHTML=b;
}

async function create(){
 const x=await api("/create",{name:document.getElementById("name").value});
 if(x.token){t=x.token;show(x.state);poll()}
}

async function join(){
 const x=await api("/join",{
  room:document.getElementById("code").value,
  name:document.getElementById("name").value
 });
 if(x.token){t=x.token;show(x.state);poll()}
}

async function start(){
 const x=await api("/action",{action:"start"});
 if(x.state)show(x.state);
}

async function act(a){
 const x=await api("/action",{action:a});
 if(x.state)show(x.state);
}

async function hold(i){
 if(!S || S.current!==me || S.phase!=="main")return;
 const x=await api("/action",{action:"hold",index:i});
 if(x.state)show(x.state);
}

async function poll(){
 setInterval(async()=>{
  try{
   const r=await fetch("/state",{headers:{"x-session":t}});
   const x=await r.json();
   if(x.state)show(x.state);
  }catch(e){}
 },1000);
}
</script>
</body>
</html>`;

const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,"http://localhost");

  if(req.method==="GET" && url.pathname==="/")
    return res.end(html);

  if(req.method==="GET" && url.pathname==="/health")
    return send(res,{ok:true});

  if(req.method==="GET" && url.pathname==="/state"){
    const s=sessions.get(req.headers["x-session"]);
    if(!s)return send(res,{error:"Geen sessie"},401);
    return send(res,{state:publicState(s.room,s.player)});
  }

  if(req.method==="POST"){
    const b=await body(req);

    if(url.pathname==="/create"){
      const r={
        code:roomCode(),players:[],started:false,current:0,
        dice:[],held:[false,false,false,false,false],
        phase:"idle",target:null,mode:null,
        message:"Wacht op spelers."
      };
      const p={id:token(),name:b.name||"Admin",balance:100,
        active:true,admin:true};
      r.players.push(p);
      rooms.set(r.code,r);
      const t=token();
      sessions.set(t,{room:r,player:p});
      return send(res,{token:t,state:publicState(r,p)});
    }

    if(url.pathname==="/join"){
      const r=rooms.get(String(b.room||"").toUpperCase());
      if(!r)throw Error("Tafel niet gevonden.");
      if(r.players.length>=4)throw Error("Tafel zit vol.");
      const p={id:token(),name:b.name||"Speler",balance:100,
        active:true,admin:false};
      r.players.push(p);
      const t=token();
      sessions.set(t,{room:r,player:p});
      return send(res,{token:t,state:publicState(r,p)});
    }

    if(url.pathname==="/action"){
      const s=sessions.get(req.headers["x-session"]);
      if(!s)return send(res,{error:"Geen sessie"},401);

      if(b.action==="start"){
        if(!s.player.admin)throw Error("Alleen de admin kan starten.");
        if(active(s.room).length<2)
          throw Error("Minimaal 2 spelers nodig.");
        s.room.started=true;
        s.room.current=rand(s.room.players.length);
        s.room.message="🎲 "+s.room.players[s.room.current].name+"
