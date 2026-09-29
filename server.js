const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const rooms = new Map();

const rnd = n => 1 + Math.floor(Math.random() * n);

const makeId = () =>
  Math.random().toString(36).slice(2, 10);

function makeCode() {
  let c;
  do {
    c = Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase();
  } while (rooms.has(c));

  return c;
}

function activePlayers(room) {
  return room.players.filter(p => p.active);
}

function getPlayer(room, id) {
  return room.players.find(p => p.id === id);
}

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function getState(room) {
  return {
    code: room.code,
    phase: room.phase,
    turn: room.turn,

    dice: room.dice,
    held: room.held,
    rolled: room.rolled,

    target: room.target,
    targetType: room.targetType,

    message: room.message,

    chat: room.chat.slice(-40),

    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      money: Number(p.money.toFixed(2)),
      active: p.active,
      admin: p.admin,
      connected: !!p.ws
    }))
  };
}

function broadcast(room) {
  const data = getState(room);

  room.players.forEach(player => {
    if (player.ws) {
      send(player.ws, {
        action: "state",
        state: data
      });
    }
  });
}

function transferMoney(room, playerId, amount) {
  const player = getPlayer(room, playerId);

  const opponents = activePlayers(room)
    .filter(p => p.id !== playerId);

  if (!player || opponents.length === 0) {
    return;
  }

  const value = Math.abs(amount);

  /*
    amount positief:
    speler verdient van iedere tegenstander.

    amount negatief:
    speler betaalt aan iedere tegenstander.
  */

  if (amount > 0) {
    player.money += value * opponents.length;

    opponents.forEach(p => {
      p.money -= value;
    });
  }

  if (amount < 0) {
    player.money -= value * opponents.length;

    opponents.forEach(p => {
      p.money += value;
    });
  }
}

function resetTurn(room, playerId) {
  room.turn = playerId;

  room.phase = "main";

  room.rolled = false;

  room.dice = [1, 1, 1, 1, 1];

  room.held = [
    false,
    false,
    false,
    false,
    false
  ];

  room.target = null;
  room.targetType = null;

  room.settled = [
    false,
    false,
    false,
    false,
    false
  ];

  const player = getPlayer(room, playerId);

  if (player) {
    room.message =
      player.name + " is aan de beurt.";
  }
}

function nextTurn(room) {
  const players = activePlayers(room);

  if (players.length === 0) {
    return;
  }

  let index =
    players.findIndex(p => p.id === room.turn);

  if (index < 0) {
    index = 0;
  } else {
    index =
      (index + 1) % players.length;
  }

  resetTurn(room, players[index].id);
}

function startGame(room) {
  const players = activePlayers(room);

  if (players.length < 2) {
    return false;
  }

  const shuffled = [...players]
    .sort(() => Math.random() - 0.5);

  room.order =
    shuffled.map(p => p.id);

  resetTurn(
    room,
    shuffled[0].id
  );

  room.message =
    shuffled[0].name + " begint!";

  return true;
}

function allSame(dice) {
  return dice.every(
    value => value === dice[0]
  );
}

/*
  Bepaalt wat er na AKKOORD moet gebeuren.

  <11:
  10 -> 1
   9 -> 2
   8 -> 3
   7 -> 4
   6 -> 5
   5 -> 6

  >24:
  25 -> 1
  26 -> 2
  27 -> 3
  28 -> 4
  29 -> 5
  30 -> 6

  11 -> €0,50 betalen
  12 -> 1 betalen
  13 -> 2 betalen
  ...
  17 -> 6 betalen

  18 -> 6 betalen
  19 -> 5 betalen
  ...
  23 -> 1 betalen
  24 -> €0,50 betalen
*/

function determineTarget(total) {

  if (total < 11) {
    return {
      type: "earn",
      number: 11 - total
    };
  }

  if (total > 24) {
    return {
      type: "earn",
      number: total - 24
    };
  }

  if (total === 11 ||
      total === 24) {

    return {
      type: "special",
      number: 0
    };
  }

  if (total <= 17) {
    return {
      type: "pay",
      number: total - 10
    };
  }

  return {
    type:
