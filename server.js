const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const rooms = new Map();

function code() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(room) {
  const data = {
    type: "state",
    code: room.code,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      money: p.money,
      admin: p.admin,
      active: p.active
    })),
    messages: room.messages
  };

  room.players.forEach(p => send(p.ws, data));
}

function newRoom() {
  let c;
  do {
    c = code();
  } while (rooms.has(c));

  const room = {
    code: c,
    players: [],
    messages: []
  };

  rooms.set(c, room);
  return room;
}

const html = `
<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dobbelen 11/24</title>
<style>
body{
  margin:0;
  background:#075b3b;
  color:white;
  font-family:Arial,sans-serif;
  text-align:center;
}
.box{
  max-width:600px;
  margin:25px auto;
  padding:20px;
}
.card{
  background:#06452d;
  border:3px solid #d4af37;
  border-radius:20px;
  padding:20px;
  margin:15px 0;
}
h1{font-size:36px}
input,button{
  font-size:18px;
  padding:13px;
  margin:6px;
  border-radius:10px;
  border:0;
}
button{
  background:#d4af37;
  font-weight:bold;
}
input{width:80%;max-width:300px}
.player{
  background:#0b7049;
  margin:8px;
  padding:12px;
  border-radius:10px;
}
.chat{
  height:150px;
  overflow:auto;
  background:#033a25;
  padding:10px;
  text-align:left;
  border-radius:10px;
}
.small{opacity:.8}
.hidden{display:none}
</style>
</head>

<body>
<div class="box">

<h1>🎲 Dobbelen 11/24</h1>

<div id="login" class="card">
  <h2>Online spelen</h2>
  <input id="name" placeholder="Je naam">
  <br>
  <button onclick="createRoom()">🎟️ NIEUW SPEL</button>
  <br>
  <input id="room" placeholder="Spelcode">
  <br>
  <button onclick="joinRoom()">➡️ DEELNEMEN</button>
</div>

<div id="game" class="hidden">

<div class="card">
  <h2>Spelcode</h2>
  <div id="code" style="font-size:38px;font-weight:bold"></div>
  <div class="small">Deel deze code met de andere spelers</div>
</div>

<div class="card">
  <h2>👥 Spelers</h2>
  <div id="players"></div>
</div>

<div class="card">
  <h2>🎲 Dobbelen 11/24</h2>
  <button onclick="roll()">BEGIN WORP</button>
  <div id="dice" style="font-size:55px;margin:20px"></div>
  <div id="result"></div>
</div>

<div class="card">
  <h2>💬 Chat</h2>
  <div id="chat" class="chat"></div>
  <input id="msg" placeholder="Bericht">
  <button onclick="chat()">VERSTUUR</button>
</div>

</div>
</div>

<script>
let ws;
let myId="";
let roomCode="";

function connect(){
  ws=new WebSocket(
    (location.protocol==="https:"?"wss://":"ws://")+location.host
  );

  ws.onmessage=e=>{
    const d=JSON.parse(e.data);

    if(d.type==="joined"){
      myId=d.id;
      roomCode=d.code;
      document.getElementById("login").classList.add("hidden");
      document.getElementById("game").classList.remove("hidden");
    }

    if(d.type==="state"){
      roomCode=d.code;
      document.getElementById("code").textContent=d.code;

      document.getElementById("players").innerHTML=
        d.players.map(p=>
          '<div class="player">'+
          (p.admin?'👑 ':'')+
          p.name+' — €'+p.money.toFixed(2)+
          (p.active?' 🟢':' ⏸️')+
          '</div>'
        ).join("");

      document.getElementById("chat").innerHTML=
        d.messages.map(x=>'<div>'+x+'</div>').join("");

      const c=document.getElementById("chat");
      c.scrollTop=c.scrollHeight;
    }

    if(d.type==="roll"){
      document.getElementById("dice").textContent=
        d.dice.map(x=>"⚄").join(" ");
      document.getElementById("result").textContent=
        "Totaal: "+d.dice.reduce((a,b)=>a+b,0);
    }

    if(d.type==="error"){
      alert(d.message);
    }
  };
}

function createRoom(){
  const name=document.getElementById("name").value.trim();
  if(!name)return alert("Vul je naam in.");
  connect();
  setTimeout(()=>{
    ws.send(JSON.stringify({
      action:"create",
      name:name
    }));
  },300);
}

function joinRoom(){
  const name=document.getElementById("name").value.trim();
  const room=document.getElementById("room").value.trim().toUpperCase();
  if(!name||!room)return alert("Vul je naam en spelcode in.");
  connect();
  setTimeout(()=>{
    ws.send(JSON.stringify({
      action:"join",
      name:name,
      code:room
    }));
  },300);
}

function roll(){
  ws.send(JSON.stringify({action:"roll"}));
}

function chat(){
  const input=document.getElementById("msg");
  const text=input.value.trim();
  if(!text)return;
  ws.send(JSON.stringify({
    action:"chat",
    text:text
  }));
  input.value="";
}
</script>

</body>
</html>
`;

const server=http.createServer((req,res)=>{
  res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});
  res.end(html);
});

const wss=new WebSocket.Server({server});

wss.on("connection",ws=>{

  ws.on("message",raw=>{
    let data;

    try{
      data=JSON.parse(raw);
    }catch{
      return;
    }

    if(data.action==="create"){
      const room=newRoom();

      const player={
        id:Math.random().toString(36).slice(2),
        name:data.name,
        money:100,
        admin:true,
        active:true,
        ws:ws
      };

      room.players.push(player);
      ws.room=room;
      ws.player=player;

      send(ws,{
        type:"joined",
        id:player.id,
        code:room.code
      });

      broadcast(room);
      return;
    }

    if(data.action==="join"){
      const room=rooms.get(data.code);

      if(!room)
        return send(ws,{type:"error",message:"Spelcode bestaat niet."});

      if(room.players.length>=4)
        return send(ws,{type:"error",message:"Dit spel zit vol."});

      const player={
        id:Math.random().toString(36).slice(2),
        name:data.name,
        money:100,
        admin:false,
        active:true,
        ws:ws
      };

      room.players.push(player);
      ws.room=room;
      ws.player=player;

      send(ws,{
        type:"joined",
        id:player.id,
        code:room.code
      });

      broadcast(room);
      return;
    }

    if(!ws.room||!ws.player)return;

    if(data.action==="roll"){
      const dice=[
        1+Math.floor(Math.random()*6),
        1+Math.floor(Math.random()*6),
        1+Math.floor(Math.random()*6),
        1+Math.floor(Math.random()*6),
        1+Math.floor(Math.random()*6)
      ];

      ws.room.players.forEach(p=>{
        send(p.ws,{
          type:"roll",
          dice:dice
        });
      });
      return;
    }

    if(data.action==="chat"){
      const text=String(data.text).substring(0,200);

      ws.room.messages.push(
        "<b>"+ws.player.name+":</b> "+
        text.replace(/</g,"&lt;").replace(/>/g,"&gt;")
      );

      if(ws.room.messages.length>50)
        ws.room.messages.shift();

      broadcast(ws.room);
    }
  });

  ws.on("close",()=>{
    if(!ws.room||!ws.player)return;

    ws.player.active=false;
    broadcast(ws.room);
  });
});

server.listen(PORT,"0.0.0.0",()=>{
  console.log("Dobbelen 11/24 multiplayer draait op poort "+PORT);
});
