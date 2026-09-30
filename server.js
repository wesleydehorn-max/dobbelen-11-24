const http=require("http");
const crypto=require("crypto");
const zlib=require("zlib");

const PORT=process.env.PORT||10000;
const rooms=new Map();

function uid(){return crypto.randomBytes(12).toString("hex")}
function roomCode(){let c;do{c=crypto.randomBytes(2).toString("hex").toUpperCase()}while(rooms.has(c));return c}
function roll(){return 1+Math.floor(Math.random()*6)}
function active(r){return r.players.filter(p=>p.active)}
function findPlayer(r,t){return r.players.find(p=>p.token===t)}
function bump(r){r.rev=(r.rev||0)+1}
function send(res,status,data){res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Access-Control-Allow-Origin":"*"});res.end(JSON.stringify(data))}
function same(d){return d.length===5&&d.every(x=>x===d[0])}

function transfer(r,id,amount){
 const ps=active(r),me=ps.find(p=>p.id===id);
 if(!me)return;
 ps.forEach(p=>{
  if(p.id!==id){
   me.money=Math.round((me.money+amount)*100)/100;
   p.money=Math.round((p.money-amount)*100)/100;
  }
 });
}

function targetFor(dir,sum){
 const earn={
  5:6,6:5,7:4,8:3,9:2,10:1,
  25:1,26:2,27:3,28:4,29:5,30:6
 };
 const pay={
  12:1,13:2,14:3,15:4,16:5,17:6,
  18:6,19:5,20:4,21:3,22:2,23:1
 };
 return(dir==="earn"?earn:pay)[sum]||0;
}

function nextTurn(r){
 const ps=active(r);
 if(!ps.length)return;

 let i=ps.findIndex(p=>p.id===r.turn);
 if(i<0)i=0;

 const p=ps[(i+1)%ps.length];

 r.turn=p.id;
 r.phase="main";
 r.dice=[1,1,1,1,1];
 r.held=[false,false,false,false,false];
 r.rolled=false;
 r.target=0;
 r.targetHeld=[false,false,false,false,false];
 r.direction="";
 r.result="";
 r.undoHold=null;
 r.snapshot=null;
 r.message=p.name+" is aan de beurt.";

 bump(r);
}

function startGame(r){
 const ps=active(r);
 if(ps.length<2)return false;

 let winner=-1;

 while(winner<0){
  const a=ps.map(()=>roll());
  const max=Math.max(...a);
  const w=a.map((v,i)=>v===max?i:-1).filter(i=>i>=0);

  if(w.length===1)winner=w[0];
 }

 const order=ps.slice(winner).concat(ps.slice(0,winner));

 r.turn=order[0].id;
 r.phase="main";
 r.dice=[1,1,1,1,1];
 r.held=[false,false,false,false,false];
 r.rolled=false;
 r.target=0;
 r.targetHeld=[false,false,false,false,false];
 r.direction="";
 r.result="";
 r.undoHold=null;
 r.snapshot=null;
 r.message=order[0].name+" begint.";

 bump(r);
 return true;
}

function publicState(r,p){
 return{
  rev:r.rev||0,
  code:r.code,
  phase:r.phase,

  players:r.players.map(x=>({
   id:x.id,
   name:x.name,
   money:x.money,
   admin:x.admin,
   active:x.active
  })),

  turn:r.turn,
  dice:r.dice,
  held:r.held,
  rolled:r.rolled,
  target:r.target,
  targetHeld:r.targetHeld,
  direction:r.direction,
  result:r.result,
  message:r.message,
  history:r.history,
  chat:r.chat,
  undoHold:!!r.undoHold,
  snapshot:!!r.snapshot,
  me:p.id
 };
}

function doAction(r,p,b){

 if(!p||!p.active)
  throw Error("Speler is niet actief.");

 const a=b.action;

 if(a==="chat"){

  const text=
   String(b.text||"").trim().slice(0,200);

  if(text){

   r.chat.push({
    name:p.name,
    text,
    time:Date.now()
   });

   r.chat=r.chat.slice(-40);

   bump(r);
  }

  return;
 }

 if(a==="start"){

  if(!p.admin)
   throw Error(
    "Alleen de beheerder kan starten."
   );

  if(r.phase!=="lobby")
   throw Error(
    "Het spel is al gestart."
   );

  if(active(r).length<2)
   throw Error(
    "Minimaal 2 spelers nodig."
   );

  startGame(r);
  return;
 }

 if(a==="newGame"){

  if(!p.admin)
   throw Error(
    "Alleen de beheerder."
   );

  r.phase="lobby";
  r.turn=null;
  r.dice=[1,1,1,1,1];
  r.held=[false,false,false,false,false];
  r.rolled=false;
  r.target=0;
  r.targetHeld=[
   false,false,false,false,false
  ];
  r.direction="";
  r.result="";
  r.undoHold=null;
  r.snapshot=null;

  r.players.forEach(x=>{
   x.money=100;
   x.active=true;
  });

  r.message=
   "Nieuwe speelronde. Wacht op spelers.";

  bump(r);
  return;
 }

 if(a==="pause"||a==="remove"){

  if(!p.admin)
   throw Error(
    "Alleen de beheerder."
   );

  const x=
   r.players.find(q=>q.id===b.id);

  if(!x||x.admin)
   throw Error(
    "Ongeldige speler."
   );

  if(a==="pause")
   x.active=!x.active;
  else
   x.active=false;

  if(r.turn===x.id)
   nextTurn(r);

  bump(r);
  return;
 }

 if(r.turn!==p.id)
  throw Error(
   "Niet jouw beurt."
  );

 if(a==="roll"){

  if(r.phase!=="main")
   throw Error(
    "Je kunt nu niet gooien."
   );

  if(r.rolled){

   if(!r.held.some(Boolean))
    throw Error(
     "Zet eerst minimaal 1 dobbelsteen vast."
    );

   if(r.held.every(Boolean))
    throw Error(
     "Alle dobbelstenen staan al vast."
    );
  }

  for(let i=0;i<5;i++){

   if(!r.held[i])
    r.dice[i]=roll();

  }

  r.rolled=true;
  r.message=p.name+" heeft gegooid.";
  r.result="";

  bump(r);
  return;
 }

 if(a==="hold"){

  if(
   r.phase!=="main"||
   !r.rolled
  )
   throw Error(
    "Gooi eerst."
   );

  const i=Number(b.index);

  if(i<0||i>4)
   throw Error(
    "Ongeldige dobbelsteen."
   );

  r.undoHold={
   dice:[...r.dice],
   held:[...r.held]
  };

  r.held[i]=!r.held[i];

  r.message=
   r.held[i]
   ?"Dobbelsteen vastgezet."
   :"Dobbelsteen losgemaakt.";

  bump(r);
  return;
 }

 if(a==="accept"){

  if(
   r.phase!=="main"||
   !r.rolled
  )
   throw Error(
    "Gooi eerst."
   );

  if(!r.held.some(Boolean))
   throw Error(
    "Zet minimaal 1 dobbelsteen vast."
   );

  r.snapshot={
   phase:r.phase,
   dice:[...r.dice],
   held:[...r.held],
   rolled:r.rolled,
   target:r.target,
   targetHeld:[...r.targetHeld],
   direction:r.direction,
   result:r.result,
   money:r.players.map(x=>({
    id:x.id,
    money:x.money
   }))
  };

  const sum=
   r.dice.reduce(
    (a,b)=>a+b,
    0
   );

  if(sum===11||sum===24){

   transfer(
    r,
    p.id,
    -0.50
   );

   r.result=
    sum+": BETALEN €0,50";

   r.message=r.result;

   bump(r);

   setTimeout(()=>{
    if(
     rooms.has(r.code)&&
     r.turn===p.id
    )
     nextTurn(r);
   },650);

   return;
  }

  const dir=
   (sum<11||sum>24)
   ?"earn"
   :"pay";

  const target=
   same(r.dice)
   ?6
   :targetFor(dir,sum);

  if(!target){

   r.snapshot=null;

   throw Error(
    "Deze combinatie is niet geldig."
   );
  }

  r.phase=dir;
  r.direction=dir;
  r.target=target;

  r.targetHeld=[
   false,false,false,false,false
  ];

  r.held=[
   false,false,false,false,false
  ];

  r.result=
   dir==="earn"
   ?"VERDIENEN: "+target+"'EN"
   :"BETALEN: "+target+"'EN";

  r.message=
   p.name+
   " moet "+
   target+
   "'en gooien.";

  bump(r);
  return;
 }

 if(a==="undoHold"){

  if(!r.undoHold)
   throw Error(
    "Geen vastzetting om terug te zetten."
   );

  r.dice=[
   ...r.undoHold.dice
  ];

  r.held=[
   ...r.undoHold.held
  ];

  r.undoHold=null;

  r.message=
   "Laatste vastzetting teruggedraaid.";

  bump(r);
  return;
 }

 if(a==="undoAccept"){

  if(!r.snapshot)
   throw Error(
    "Geen akkoord om terug te zetten."
   );

  const x=r.snapshot;

  r.phase=x.phase;
  r.dice=[...x.dice];
  r.held=[...x.held];
  r.rolled=x.rolled;
  r.target=x.target;
  r.targetHeld=[...x.targetHeld];
  r.direction=x.direction;
  r.result=x.result;

  x.money.forEach(m=>{

   const p2=
    r.players.find(
     q=>q.id===m.id
    );

   if(p2)
    p2.money=m.money;

  });

  r.snapshot=null;

  r.message=
   "Laatste akkoord teruggedraaid.";

  bump(r);
  return;
 }

 if(a==="targetRoll"){

  if(
   r.phase!=="earn"&&
   r.phase!=="pay"
  )
   throw Error(
    "Je kunt nu niet gooien."
   );

  if(r.targetHeld.every(Boolean))
   r.targetHeld=[
    false,false,false,false,false
   ];

  let hits=0;

  for(let i=0;i<5;i++){

   if(!r.targetHeld[i]){

    r.dice[i]=roll();

    if(
     r.dice[i]===r.target
    ){

     r.targetHeld[i]=true;
     hits++;

    }
   }
  }

  if(hits===0){

   r.message=
    "Geen nieuwe "+
    r.target+
    ". Beurt voorbij.";

   bump(r);

   setTimeout(()=>{

    if(
     rooms.has(r.code)&&
     (
      r.phase==="earn"||
      r.phase==="pay"
     )
    )
     nextTurn(r);

   },650);

   return;
  }

  const amount=
   hits*
   r.target*
   0.50;

  transfer(
   r,
   p.id,
   r.phase==="earn"
   ?amount
   :-amount
  );

  r.message=
   (
    r.phase==="earn"
    ?"VERDIEND: "
    :"BETAALD: "
   )+
   "€"+
   amount.toFixed(2)
    .replace(".",",");

  bump(r);
  return;
 }

 throw Error(
  "Onbekende actie."
 );
}

const PAGE=zlib.gunzipSync(
 Buffer.from(
"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",
"base64"
)).toString("utf8");

const server=http.createServer(async(req,res)=>{

 const u=
  new URL(
   req.url,
   "http://localhost"
  );

 if(req.method==="OPTIONS"){

  res.writeHead(
   204,
   {
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":
     "Content-Type,X-Token",
    "Access-Control-Allow-Methods":
     "GET,POST,OPTIONS"
   }
  );

  return res.end();
 }

 if(
  u.pathname==="/"&&
  req.method==="GET"
 ){

  res.writeHead(
   200,
   {
    "Content-Type":
     "text/html; charset=utf-8",
    "Cache-Control":
     "no-store"
   }
  );

  return res.end(PAGE);
 }

 if(
  u.pathname==="/api/create"&&
  req.method==="POST"
 ){

  let body="";

  req.on(
   "data",
   x=>body+=x
  );

  await new Promise(
   resolve=>req.on(
    "end",
    resolve
   )
  );

  let b={};

  try{
   b=JSON.parse(body||"{}");
  }catch(e){}

  const name=
   String(b.name||"")
   .trim()
   .slice(0,20);

  if(!name)
   return send(
    res,
    400,
    {
     error:
      "Vul eerst je naam in."
    }
   );

  const c=roomCode();
  const token=uid();

  const r={
   code:c,
   rev:1,
   phase:"lobby",

   players:[{
    id:uid(),
    token,
    name,
    money:100,
    admin:true,
    active:true
   }],

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

   direction:"",
   result:"",

   message:
    "Wacht op spelers.",

   history:[],
   chat:[],
   undoHold:null,
   snapshot:null
  };

  rooms.set(c,r);

  return send(
   res,
   200,
   {
    code:c,
    token
   }
  );
 }

 if(
  u.pathname==="/api/join"&&
  req.method==="POST"
 ){

  let body="";

  req.on(
   "data",
   x=>body+=x
  );

  await new Promise(
   resolve=>req.on(
    "end",
    resolve
   )
  );

  let b={};

  try{
   b=JSON.parse(body||"{}");
  }catch(e){}

  const c=
   String(b.code||"")
   .trim()
   .toUpperCase();

  const name=
   String(b.name||"")
   .trim()
   .slice(0,20);

  const r=rooms.get(c);

  if(!r)
   return send(
    res,
    404,
    {
     error:
      "Deze kamer bestaat niet."
    }
   );

  if(r.phase!=="lobby")
   return send(
    res,
    400,
    {
     error:
      "Het spel is al gestart."
    }
   );

  if(active(r).length>=4)
   return send(
    res,
    400,
    {
     error:
      "Maximaal 4 spelers."
    }
   );

  if(!name)
   return send(
    res,
    400,
    {
     error:
      "Vul eerst je naam in."
    }
   );

  const token=uid();

  r.players.push({
   id:uid(),
   token,
   name,
   money:100,
   admin:false,
   active:true
  });

  r.message=
   name+
   " is de kamer binnengekomen.";

  bump(r);

  return send(
   res,
   200,
   {
    code:c,
    token
   }
  );
 }

 if(
  u.pathname==="/api/state"&&
  req.method==="GET"
 ){

  const token=
   req.headers["x-token"]||"";

  for(
   const r of rooms.values()
  ){

   const p=
    findPlayer(r,token);

   if(p)
    return send(
     res,
     200,
     {
      state:
       publicState(r,p),
      me:p.id
     }
    );
  }

  return send(
   res,
   401,
   {
    error:
     "Sessie verlopen."
   }
  );
 }

 if(
  u.pathname==="/api/action"&&
  req.method==="POST"
 ){

  const token=
   req.headers["x-token"]||"";

  let body="";

  req.on(
   "data",
   x=>body+=x
  );

  await new Promise(
   resolve=>req.on(
    "end",
    resolve
   )
  );

  let b={};

  try{
   b=JSON.parse(body||"{}");
  }catch(e){}

  for(
   const r of rooms.values()
  ){

   const p=
    findPlayer(r,token);

   if(p){

    try{

     doAction(
      r,
      p,
      b
     );

     return send(
      res,
      200,
      {ok:true}
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

  return send(
   res,
   401,
   {
    error:
     "Sessie verlopen."
   }
  );
 }

 res.writeHead(404);
 res.end("Not found");
});

server.listen(
 PORT,
 "0.0.0.0",
 ()=>{
  console.log(
   "Dobbelen 11/24 draait op poort "+
   PORT
  );
 }
);
