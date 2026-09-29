const http = require("http");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const sessions = new Map();

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c;
  do {
    c = "";
    for (let i = 0; i < 6; i++) {
      c += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(c));
  return c;
}

function die() {
  return Math.floor(Math.random() * 6) + 1;
}

function dice5() {
  return [die(), die(), die(), die(), die()];
}

function nameClean(v) {
  const n = String(v || "").trim().replace(/\s+/g, " ");

  if (!n) {
    throw new Error("Vul een speelnaam in.");
  }

  if (n.length > 20) {
    throw new Error("Je speelnaam mag maximaal 20 tekens zijn.");
  }

  return n;
}

function codeClean(v) {
  return String(v || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function log(r, text) {
  r.log.unshift({
    text,
    time: new Date().toLocaleTimeString("nl-NL", {
      hour: "2-digit",
      minute: "2-digit"
    })
  });

  r.log = r.log.slice(0, 30);
}

function bump(r) {
  r.version++;
}

function active(r) {
  return r.players.filter(p => p.active);
}

function current(r) {
  if (!r.players.length) return null;

  if (
    r.players[r.current] &&
    r.players[r.current].active
  ) {
    return r.players[r.current];
  }

  for (let i = 0; i < r.players.length; i++) {
    const n = (r.current + i) % r.players.length;

    if (r.players[n].active) {
      r.current = n;
      return r.players[n];
    }
  }

  return null;
}

function next(r) {
  for (let i = 1; i <= r.players.length; i++) {
    const n = (r.current + i) % r.players.length;

    if (
      r.players[n] &&
      r.players[n].active
    ) {
      r.current = n;
      return r.players[n];
    }
  }

  return current(r);
}

function idx(r, id) {
  return r.players.findIndex(
    p => p.id === id
  );
}

function resetTurn(r) {
  r.phase = "main";

  r.dice = [
    1,
    1,
    1,
    1,
    1
  ];

  r.held = [
    false,
    false,
    false,
    false,
    false
  ];

  r.settled = [
    false,
    false,
    false,
    false,
    false
  ];

  r.hasRolled = false;
  r.mustHold = false;

  r.target = null;
  r.mode = null;
  r.needFreshRoll = false;

  r.rollSeq++;
}

function createRoom(name) {
  const r = {
    code: makeCode(),

    players: [],

    admin: null,

    started: false,

    current: 0,

    phase: "lobby",

    dice: [
      1,
      1,
      1,
      1,
      1
    ],

    held: [
      false,
      false,
      false,
      false,
      false
    ],

    settled: [
      false,
      false,
      false,
      false,
      false
    ],

    hasRolled: false,

    mustHold: false,

    target: null,

    mode: null,

    needFreshRoll: false,

    banner: "Wacht op spelers.",

    version: 1,

    rollSeq: 0,

    log: [],

    chat: []
  };

  const p = {
    id: crypto.randomUUID(),
    name,
    money: 0,
    active: true
  };

  r.players.push(p);

  r.admin = p.id;

  rooms.set(
    r.code,
    r
  );

  log(
    r,
    name +
      " heeft de kamer gemaakt."
  );

  return r;
}

function sessionFor(req) {
  const m =
    (req.headers.cookie || "")
      .match(
        /(?:^|;\s*)sid=([^;]+)/
      );

  return m
    ? sessions.get(m[1])
    : null;
}

function newSession(
  roomCode,
  playerId
) {
  const sid =
    crypto.randomBytes(24)
      .toString("hex");

  sessions.set(
    sid,
    {
      roomCode,
      playerId
    }
  );

  return sid;
}

function setCookie(
  res,
  sid
) {
  res.setHeader(
    "Set-Cookie",
    "sid=" +
      sid +
      "; HttpOnly; Path=/; SameSite=Lax"
  );
}

function getRoomPlayer(req) {
  const s =
    sessionFor(req);

  if (!s) return null;

  const r =
    rooms.get(
      s.roomCode
    );

  if (!r) return null;

  const p =
    r.players.find(
      x =>
        x.id ===
        s.playerId
    );

  return p
    ? {
        r,
        p
      }
    : null;
}

function startGame(r) {
  if (
    active(r).length < 2
  ) {
    throw new Error(
      "Er moeten minimaal 2 spelers zijn."
    );
  }

  r.started = true;

  r.current =
    r.players.findIndex(
      p => p.active
    );

  /*
    Iedereen begint een nieuw spel
    met precies €100.
  */
  r.players.forEach(
    p => {
      if (p.active) {
        p.money = 100;
      }
    }
  );

  resetTurn(r);

  const p =
    current(r);

  r.banner =
    p.name +
    " is aan de beurt. Druk op BEGIN WORP.";

  log(
    r,
    "Het spel is gestart. " +
      p.name +
      " begint."
  );

  bump(r);
}

function isFullHouseRoll(r) {
  return (
    r.dice.length === 5 &&
    r.dice.every(
      v =>
        v ===
        r.dice[0]
    )
  );
}

function enterFullBak(r) {
  const p =
    current(r);

  /*
    VOLLE BAK:
    5 dezelfde ogen.
    Altijd 6'en verdienen.
  */

  r.phase = "round";

  r.target = 6;

  r.mode = "earn";

  r.settled = [
    false,
    false,
    false,
    false,
    false
  ];

  r.held = [
    false,
    false,
    false,
    false,
    false
  ];

  r.needFreshRoll = true;

  r.hasRolled = true;

  r.mustHold = false;

  r.banner =
    "🎲 VOLLE BAK! 6'en VERDIENEN.";

  log(
    r,
    p.name +
      " gooide VOLLE BAK: " +
      r.dice.join(" - ") +
      ". Nu 6'en verdienen."
  );

  bump(r);
}

function beginTurn(r) {
  if (
    r.phase !== "main" ||
    r.hasRolled
  ) {
    throw new Error(
      "Je kunt nu geen beginworp doen."
    );
  }

  r.dice =
    dice5();

  r.held = [
    false,
    false,
    false,
    false,
    false
  ];

  r.settled = [
    false,
    false,
    false,
    false,
    false
  ];

  r.hasRolled = true;

  r.mustHold = true;

  r.rollSeq++;

  if (
    isFullHouseRoll(r)
  ) {
    enterFullBak(r);
    return;
  }

  r.banner =
    current(r).name +
    " heeft gegooid. Houd minimaal 1 nieuwe dobbelsteen vast.";

  log(
    r,
    current(r).name +
      " gooide " +
      r.dice.join(" - ") +
      "."
  );

  bump(r);
}

function hold(r, i) {
  if (
    r.phase !== "main" ||
    !r.hasRolled
  ) {
    throw new Error(
      "Je kunt nu niet vasthouden."
    );
  }

  if (
    !Number.isInteger(i) ||
    i < 0 ||
    i > 4
  ) {
    throw new Error(
      "Ongeldige dobbelsteen."
    );
  }

  if (r.held[i]) {
    throw new Error(
      "Deze dobbelsteen staat al vast."
    );
  }

  r.held[i] = true;

  r.mustHold = false;

  r.banner =
    current(r).name +
    " heeft een dobbelsteen vastgezet.";

  bump(r);
}

function reroll(r) {
  if (
    r.phase !== "main" ||
    !r.hasRolled
  ) {
    throw new Error(
      "Doe eerst de beginworp."
    );
  }

  if (r.mustHold) {
    throw new Error(
      "Houd eerst minimaal 1 nieuwe dobbelsteen vast."
    );
  }

  const loose = [];

  for (
    let i = 0;
    i < 5;
    i++
  ) {
    if (!r.held[i]) {
      loose.push(i);
    }
  }

  if (!loose.length) {
    throw new Error(
      "Alle dobbelstenen staan vast."
    );
  }

  loose.forEach(
    i => {
      r.dice[i] = die();
    }
  );

  r.mustHold = true;

  r.rollSeq++;

  if (
    isFullHouseRoll(r)
  ) {
    enterFullBak(r);
    return;
  }

  r.banner =
    current(r).name +
    " heeft opnieuw gegooid. Houd minimaal 1 nieuwe dobbelsteen vast.";

  log(
    r,
    current(r).name +
      " gooide opnieuw: " +
      r.dice.join(" - ") +
      "."
  );

  bump(r);
}

function total(r) {
  return r.dice.reduce(
    (a, b) =>
      a + b,
    0
  );
}

/*
  DE DEFINITIEVE REGEL:

  5 t/m 10:
    verschil met 11 = VERDIENEN

  12 t/m 23:
    verschil naar 11/24 = BETALEN

  25 t/m 30:
    verschil met 24 = VERDIENEN
*/

function targetFor(t) {
  if (
    t === 11 ||
    t === 24
  ) {
    return null;
  }

  if (
    t >= 5 &&
    t <= 10
  ) {
    return {
      target: 11 - t,
      mode: "earn"
    };
  }

  if (
    t >= 12 &&
    t <= 17
  ) {
    return {
      target: t - 11,
      mode: "pay"
    };
  }

  if (
    t >= 18 &&
    t <= 23
  ) {
    return {
      target: 24 - t,
      mode: "pay"
    };
  }

  if (
    t >= 25 &&
    t <= 30
  ) {
    return {
      target: t - 24,
      mode: "earn"
    };
  }

  return null;
}

/*
  Elke doelsteen wordt berekend
  op basis van het aantal oogjes.

  1 = €0,50
  2 = €1,00
  3 = €1,50
  4 = €2,00
  5 = €2,50
  6 = €3,00
*/

function moneyAll(
  r,
  player,
  amount,
  mode
) {
  const opponents =
    active(r).filter(
      x =>
        x.id !==
        player.id
    );

  for (
    const o of opponents
  ) {

    if (
      mode === "earn"
    ) {

      o.money -= amount;

      player.money += amount;

    } else {

      player.money -= amount;

      o.money += amount;
    }
  }
}

function finishTurn(r) {
  next(r);

  resetTurn(r);

  const p =
    current(r);

  if (p) {

    r.banner =
      p.name +
      " is aan de beurt. Druk op BEGIN WORP.";

    log(
      r,
      p.name +
        " is nu aan de beurt."
    );
  }

  bump(r);
}

function accept(r) {
  if (
    r.phase !== "main" ||
    !r.hasRolled
  ) {
    throw new Error(
      "Doe eerst een worp."
    );
  }

  const p =
    current(r);

  const t =
    total(r);

  /*
    11 of 24:
    €0,50 aan iedere tegenstander.
    Daarna direct volgende speler.
  */

  if (
    t === 11 ||
    t === 24
  ) {

    for (
      const o of active(r)
        .filter(
          x =>
            x.id !==
            p.id
        )
    ) {

      o.money -= 0.50;

      p.money += 0.50;
    }

    log(
      r,
      p.name +
        " gooide " +
        t +
        " en betaalt €0,50 aan iedere tegenstander."
    );

    finishTurn(r);

    r.banner =
      "💰 " +
      p.name +
      " gooide " +
      t +
      ": €0,50 betalen aan iedere tegenstander. Volgende speler.";

    bump(r);

    return;
  }

  const x =
    targetFor(t);

  if (!x) {
    throw new Error(
      "Deze totaalscore is ongeldig."
    );
  }

  r.phase = "round";

  r.target =
    x.target;

  r.mode =
    x.mode;

  r.settled = [
    false,
    false,
    false,
    false,
    false
  ];

  r.held = [
    false,
    false,
    false,
    false,
    false
  ];

  r.needFreshRoll = false;

  r.banner =
    (
      x.mode === "earn"
        ? "💰 VERDIEN FASE"
        : "💸 BETAAL FASE"
    ) +
    ": " +
    x.target +
    "'en.";

  log(
    r,
    p.name +
      " accepteerde totaal " +
      t +
      ". Doelsteen: " +
      x.target +
      "."
  );

  resolveRound(r);
}

function resolveRound(r) {
  if (
    r.phase !== "round"
  ) {
    return;
  }

  const p =
    current(r);

  let hits = 0;

  for (
    let i = 0;
    i < 5;
    i++
  ) {

    if (
      !r.settled[i] &&
      r.dice[i] ===
        r.target
    ) {

      r.settled[i] = true;

      r.held[i] = true;

      hits++;
    }
  }

  /*
    Geen doelsteen =
    MIS en beurt voorbij.
  */

  if (!hits) {

    r.banner =
      p.name +
      ": MIS! Geen " +
      r.target +
      ".";

    log(
      r,
      p.name +
        " had geen doelsteen."
    );

    finishTurn(r);

    return;
  }

  /*
    Ieder oog = €0,50.

    Voorbeeld:
    doelsteen 4
    1 vier = €2,00
    2 vieren = €4,00
    3 vieren = €6,00
  */

  const amount =
    hits *
    r.target *
    0.50;

  moneyAll(
    r,
    p,
    amount,
    r.mode
  );

  r.banner =
    (
      r.mode === "earn"
        ? "💰 VERDIEND"
        : "💸 BETAALD"
    ) +
    ": €" +
    amount.toFixed(2) +
    " (" +
    hits +
    " × " +
    r.target +
    " ogen × €0,50).";

  log(
    r,
    p.name +
      ": " +
      hits +
      "× doelsteen " +
      r.target +
      ", €" +
      amount.toFixed(2) +
      "."
  );

  /*
    Als alle vijf dobbelstenen
    doelstenen zijn geworden:
    nieuwe set van vijf.
  */

  if (
    r.settled.every(Boolean)
  ) {

    r.needFreshRoll =
      true;

    r.banner =
      "🎲 VOLLE BAK! Nieuwe 5 dobbelstenen bij de volgende worp.";

    log(
      r,
      p.name +
        " heeft alle 5 dobbelstenen als doelsteen verwerkt."
    );

  } else {

    r.needFreshRoll =
      false;
  }

  r.hasRolled = true;

  r.mustHold = false;

  bump(r);
}

function roundRoll(r) {

  if (
    r.phase !== "round"
  ) {
    throw new Error(
      "Je bent niet in de verdien/betaalfase."
    );
  }

  /*
    Na vijf doelstenen:
    nieuwe set van vijf.
  */

  if (
    r.needFreshRoll
  ) {

    r.dice =
      dice5();

    r.held = [
      false,
      false,
      false,
      false,
      false
    ];

    r.settled = [
      false,
      false,
      false,
      false,
      false
    ];

    r.needFreshRoll =
      false;

    r.rollSeq++;

    log(
      r,
      current(r).name +
        " kreeg een nieuwe set van 5: " +
        r.dice.join(" - ") +
        "."
    );

    resolveRound(r);

    return;
  }

  const loose = [];

  for (
    let i = 0;
    i < 5;
    i++
  ) {

    if (
      !r.settled[i]
    ) {
      loose.push(i);
    }
  }

  if (!loose.length) {

    r.needFreshRoll =
      true;

    bump(r);

    return;
  }

  loose.forEach(
    i => {
      r.dice[i] = die();
    }
  );

  r.rollSeq++;

  log(
    r,
    current(r).name +
      " gooide: " +
      r.dice.join(" - ") +
      "."
  );

  resolveRound(r);
}

function newGame(r) {

  if (!r.started) {
    throw new Error(
      "Het spel is nog niet gestart."
    );
  }

  r.players.forEach(
    p => {

      p.money = 100;

      p.active = true;
    }
  );

  r.current =
    r.players.findIndex(
      p =>
        p.id ===
        r.admin
    );

  resetTurn(r);

  r.banner =
    current(r).name +
    " begint een nieuw spel. Druk op BEGIN WORP.";

  log(
    r,
    "Nieuw spel gestart."
  );

  bump(r);
}

function publicState(
  r,
  me
) {

  const cp =
    current(r);

  return {

    ok: true,

    room: {

      code: r.code,

      started:
        r.started,

      phase:
        r.phase,

      banner:
        r.banner,

      currentPlayerId:
        cp
          ? cp.id
          : null,

      dice:
        r.dice,

      held:
        r.held,

      settled:
        r.settled,

      hasRolled:
        r.hasRolled,

      mustHold:
        r.mustHold,

      target:
        r.target,

      mode:
        r.mode,

      needFreshRoll:
        r.needFreshRoll,

      version:
        r.version,

      rollSeq:
        r.rollSeq
    },

    me: {

      id:
        me.id,

      name:
        me.name,

      money:
        me.money,

      isAdmin:
        me.id ===
        r.admin
    },

    players:
      r.players.map(
        p => ({

          id:
            p.id,

          name:
            p.name,

          money:
            p.money,

          active:
            p.active,

          isAdmin:
            p.id ===
            r.admin
        })
      ),

    log:
      r.log,

    chat:
      r.chat
  };
}

function action(
  r,
  p,
  b
) {

  const a =
    b.action;

  const pi =
    idx(
      r,
      p.id
    );

  if (
    a === "start"
  ) {

    if (
      p.id !==
      r.admin
    ) {
      throw new Error(
        "Alleen de beheerder kan starten."
      );
    }

    startGame(r);

    return;
  }

  if (
    a === "newGame"
  ) {

    if (
      p.id !==
      r.admin
    ) {
      throw new Error(
        "Alleen de beheerder kan een nieuw spel starten."
      );
    }

    newGame(r);

    return;
  }

  if (
    a === "removePlayer"
  ) {

    if (
      p.id !==
      r.admin
    ) {
      throw new Error(
        "Alleen de beheerder kan spelers verwijderen."
      );
    }

    const q =
      r.players.find(
        x =>
          x.id ===
          String(
            b.playerId ||
              ""
          )
      );

    if (
      !q ||
      q.id ===
        r.admin
    ) {
      throw new Error(
        "Speler kan niet worden verwijderd."
      );
    }

    q.active =
      false;

    log(
      r,
      q.name +
        " is uit het spel gehaald."
    );

    if (
      r.started &&
      r.current ===
        idx(
          r,
          q.id
        )
    ) {

      next(r);

      resetTurn(r);
    }

    bump(r);

    return;
  }

  if (
    a === "chat"
  ) {

    const m =
      String(
        b.message ||
          ""
      ).trim();

    if (m) {

      if (
        m.length >
        200
      ) {
        throw new Error(
          "Bericht is te lang."
        );
      }

      r.chat.push({
        player:
          p.name,

        message:
          m,

        time:
          new Date()
            .toLocaleTimeString(
              "nl-NL",
              {
                hour:
                  "2-digit",
                minute:
                  "2-digit"
              }
            )
      });

      r.chat =
        r.chat.slice(
          -50
        );

      bump(r);
    }

    return;
  }

  if (
    r.current !==
    pi
  ) {
    throw new Error(
      "Het is niet jouw beurt."
    );
  }

  if (
    a === "beginTurn"
  ) {

    beginTurn(r);

  } else if (
    a === "hold"
  ) {

    hold(
      r,
      Number(
        b.index
      )
    );

  } else if (
    a === "reroll"
  ) {

    reroll(r);

  } else if (
    a === "accept"
  ) {

    accept(r);

  } else if (
    a === "roundRoll"
  ) {

    roundRoll(r);

  } else {

    throw new Error(
      "Onbekende actie."
    );
  }
}

const HTML = String.raw`<!doctype html>
<html lang="nl">
<head>

<meta charset="utf-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1,maximum-scale=1"
>

<title>Dobbelen 11/24</title>

<style>

*{
  box-sizing:border-box
}

body{
  margin:0;
  background:
    radial-gradient(
      circle at top,
      #172b52,
      #061022 60%,
      #020711
    );
  color:#fff;
  font-family:Arial,sans-serif;
  min-height:100vh
}

.app{
  max-width:900px;
  margin:auto;
  padding:10px
}

.top{
  text-align:center;
  padding:10px
}

.logo{
  font-size:clamp(
    28px,
    7vw,
    46px
  );
  font-weight:900;
  color:#ffd45b;
  text-shadow:0 3px #805200
}

.sub{
  color:#b9c8e5
}

.card{
  background:
    linear-gradient(
      145deg,
      #192c50,
      #08152d
    );
  border:1px solid #30466b;
  border-radius:18px;
  padding:16px;
  margin-bottom:12px;
  box-shadow:0 12px 35px #0006
}

h2{
  margin:0 0 12px
}

label{
  display:block;
  color:#c1cde2;
  font-size:13px;
  font-weight:800;
  margin:10px 0 5px
}

input{
  width:100%;
  padding:14px;
  border-radius:12px;
  border:1px solid #40577f;
  background:#07132a;
  color:#fff;
  font-size:17px;
  outline:0
}

.btn{
  width:100%;
  padding:14px;
  border:0;
  border-radius:12px;
  margin-top:9px;
  font-weight:900;
  font-size:15px;
  background:#2457a7;
  color:#fff;
  box-shadow:0 5px #112f60
}

.gold{
  background:
    linear-gradient(
      #ffda69,
      #dda014
    );
  color:#201500;
  box-shadow:0 5px #895b00
}

.green{
  background:
    linear-gradient(
      #37d17b,
      #139a4e
    );
  box-shadow:0 5px #086435
}

.orange{
  background:
    linear-gradient(
      #ffb44b,
      #e36d0b
    );
  box-shadow:0 5px #843800
}

.red{
  background:#b92e35;
  box-shadow:0 5px #6b151a
}

.btn:disabled{
  opacity:.35
}

.code{
  text-align:center;
  font-size:38px;
  letter-spacing:6px;
  color:#ffd55f;
  font-weight:900;
  margin:7px
}

.invite{
  background:#07132a;
  border:1px dashed #52698e;
  padding:10px;
  border-radius:10px;
  font-size:12px;
  word-break:break-all;
  color:#b8c8e5
}

.player{
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:10px;
  background:#ffffff0a;
  border-radius:10px;
  margin:6px 0
}

.badge{
  font-size:10px;
  background:#2d4368;
  padding:4px 7px;
  border-radius:20px
}

.admin{
  background:#806017;
  color:#ffe394
}

.money{
  color:#64ed9b;
  font-weight:900
}

.banner{
  text-align:center;
  background:#122849;
  border:1px solid #38527d;
  border-radius:12px;
  padding:11px;
  color:#ffdc70;
  font-weight:900;
  margin-bottom:9px
}

.turn{
  text-align:center;
  color:#bdcbe2;
  font-size:13px;
  margin-bottom:8px
}

.table{
  background:
    radial-gradient(
      circle,
      #197a4e,
      #075334 65%,
      #033523
    );
  border:7px solid #744914;
  border-radius:24px;
  padding:18px 8px;
  box-shadow:
    inset 0 0 30px #0008
}

.tray{
  text-align:center;
  color:#ffe18b;
  font-weight:900;
  letter-spacing:2px;
  margin-bottom:9px
}

.table-count{
  text-align:center;
  background:#07162b;
  border:1px solid #456083;
  border-radius:12px;
  padding:10px;
  margin-bottom:10px;
  color:#dce7f8;
  font-weight:800
}

.table-count b{
  color:#ffd85e;
  font-size:24px
}

.dice{
  min-height:180px;
  display:flex;
  justify-content:center;
  align-items:center;
  gap:8px;
  flex-wrap:wrap
}

.die{
  width:64px;
  height:64px;
  border-radius:15px;
  position:relative;

  background:
    linear-gradient(
      145deg,
      #ff4b4b,
      #bd1010 55%,
      #6e0505
    );

  border:3px solid #e8bb4d;

  box-shadow:
    inset -6px -7px 10px #0005,
    inset 4px 4px 8px #fff4,
    0 7px 12px #0009
}

.click{
  cursor:pointer
}

.held{
  box-shadow:
    0 0 0 3px #ffd43c55,
    0 0 25px #ffd43c99,
    inset -6px -7px 10px #0005
}

.pip{
  position:absolute;
  width:12px;
  height:12px;
  border-radius:50%;
  background:#fff;
  box-shadow:
    inset 1px 1px 2px #0004
}

.tl{
  left:10px;
  top:10px
}

.tc{
  left:50%;
  top:10px;
  transform:
    translateX(-50%)
}

.tr{
  right:10px;
  top:10px
}

.ml{
  left:10px;
  top:50%;
  transform:
    translateY(-50%)
}

.mc{
  left:50%;
  top:50%;
  transform:
    translate(
      -50%,
      -50%
    )
}

.mr{
  right:10px;
  top:50%;
  transform:
    translateY(-50%)
}

.bl{
  left:10px;
  bottom:10px
}

.bc{
  left:50%;
  bottom:10px;
  transform:
    translateX(-50%)
}

.br{
  right:10px;
  bottom:10px
}

.roll{
  animation:
    tumble .55s ease
}

.roll .pip{
  opacity:0
}

.target{
  text-align:center;
  padding:12px;
  background:#0b1933;
  border:1px solid #435b83;
  border-radius:12px;
  margin-bottom:10px
}

.target b{
  font-size:34px;
  color:#ffe17b
}

.status{
  text-align:center;
  color:#b7c7e0;
  background:#0002;
  padding:11px;
  border-radius:11px;
  margin-top:9px
}

.row{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:8px
}

.chatbox{
  display:none
}

.chatbox.open{
  display:block
}

.messages{
  height:170px;
  overflow:auto;
  background:#061126;
  padding:8px;
  border-radius:10px
}

.msg{
  font-size:13px;
  margin-bottom:7px
}

.msg b{
  color:#ffd66b
}

.error{
  display:none;
  background:#551d25;
  border:1px solid #a54550;
  color:#ffb3ba;
  padding:10px;
  border-radius:10px;
  margin-bottom:10px
}

@keyframes tumble{

  0%{
    transform:
      translate(0,0)
      rotateX(0)
      rotateY(0)
      rotateZ(0)
  }

  25%{
    transform:
      translate(-14px,-18px)
      rotateX(160deg)
      rotateY(80deg)
      rotateZ(-40deg)
  }

  55%{
    transform:
      translate(14px,8px)
      rotateX(330deg)
      rotateY(210deg)
      rotateZ(60deg)
  }

  80%{
    transform:
      translate(-8px,-5px)
      rotateX(500deg)
      rotateY(300deg)
      rotateZ(-45deg)
  }

  100%{
    transform:
      translate(0,0)
      rotateX(540deg)
      rotateY(360deg)
      rotateZ(0)
  }

}

.hidden{
  display:none!important
}

.center{
  text-align:center
}

.small{
  font-size:12px;
  color:#91a4c4
}

@media(max-width:560px){

  .die{
    width:57px;
    height:57px
  }

  .pip{
    width:10px;
    height:10px
  }

  .tl{
    left:9px;
    top:9px
  }

  .tc{
    top:9px
  }

  .tr{
    right:9px;
    top:9px
  }

  .ml{
    left:9px
  }

  .mr{
    right:9px
  }

  .bl{
    left:9px;
    bottom:9px
  }

  .bc{
    bottom:9px
  }

  .br{
    right:9px;
    bottom:9px
  }

}

</style>
</head>

<body>

<div class="app">

<div class="top">

<div class="logo">
DOBBELEN 11/24
</div>

<div class="sub">
Las Vegas multiplayer dice game
</div>

</div>

<div id="err" class="error"></div>

<div id="landing">

<div id="createCard" class="card">

<h2>
🎲 Nieuwe speelkamer
</h2>

<label>
SPEELNAAM
</label>

<input
id="createName"
maxlength="20"
placeholder="Bijvoorbeeld Wesley"
>

<button
class="btn gold"
onclick="createRoom()"
>
KAMER MAKEN
</button>

<div
class="small center"
style="margin-top:8px"
>
Jij wordt automatisch beheerder van de kamer.
</div>

</div>

<div id="joinCard" class="card">

<h2 id="joinTitle">
🚪 Meedoen met een kamer
</h2>

<label>
SPEELNAAM
</label>

<input
id="joinName"
maxlength="20"
placeholder="Bijvoorbeeld Jan"
>

<label>
PRIVÉ SPEELKAMER NUMMER
</label>

<input
id="joinCode"
maxlength="6"
placeholder="Bijvoorbeeld OF3855"
>

<button
id="joinBtn"
class="btn green"
onclick="joinRoom()"
>
SPEL BINNENGAAN
</button>

</div>

</div>

<div id="lobby" class="hidden">

<div
id="hostInviteCard"
class="card center"
>

<h2>
🎰 PRIVÉ SPEELKAMER
</h2>

<div class="small">
KAMERNUMMER
</div>

<div
id="roomCode"
class="code"
></div>

<button
class="btn gold"
onclick="copyInvite()"
>
🔗 UITNODIGINGS-LINK KOPIËREN
</button>

<div
id="invite"
class="invite"
></div>

</div>

<div class="card">

<h2>
👥 SPELERS
</h2>

<div id="lobbyPlayers"></div>

<button
id="startBtn"
class="btn green"
onclick="act('start')"
>
🎲 START SPEL
</button>

<div
id="waiting"
class="small center"
style="margin-top:8px"
></div>

</div>

</div>

<div id="game" class="hidden">

<div class="card">

<div
id="turn"
class="turn"
></div>

<div
id="banner"
class="banner"
></div>

<div
id="target"
class="target hidden"
></div>

<div
id="tableCount"
class="table-count"
></div>

<div class="table">

<div class="tray">
🎲 DOBBELBAK
</div>

<div
id="dice"
class="dice"
></div>

</div>

<div id="controls"></div>

</div>

<div class="card">

<h2>
👥 SPELERS
</h2>

<div id="players"></div>

</div>

<div class="card">

<div
style="display:flex;justify-content:space-between;align-items:center"
>

<h2 style="margin:0">
💬 CHAT
</h2>

<button
class="btn"
style="width:auto;margin:0;padding:8px 12px"
onclick="toggleChat()"
>
CHAT
</button>

</div>

<div
id="chatbox"
class="chatbox"
>

<div
id="messages"
class="messages"
></div>

<div
style="display:grid;grid-template-columns:1fr 75px;gap:7px;margin-top:7px"
>

<input
id="chatInput"
placeholder="Typ een bericht..."
maxlength="200"
onkeydown="if(event.key==='Enter')sendChat()"
>

<button
class="btn"
style="margin:0"
onclick="sendChat()"
>
STUUR
</button>

</div>

</div>

</div>

<div
id="admin"
class="card hidden"
>

<h2>
⚙️ BEHEERDER
</h2>

<button
class="btn gold"
onclick="act('newGame')"
>
🔄 NIEUW SPEL
</button>

</div>

</div>

</div>

<script>

var state = null;

var lastRoll = -1;

var chatOpen = false;

var first = true;

var pollTimer = null;

var params =
  new URLSearchParams(
    location.search
  );

var inviteCode =
  (params.get("join") || "")
  .toUpperCase();

var urlRoom =
  (params.get("room") || "")
  .toUpperCase();

var inviteMode =
  !!inviteCode;

if (
  inviteCode
) {

  document
    .getElementById("joinCode")
    .value =
    inviteCode;

}
else if (
  urlRoom
) {

  document
    .getElementById("joinCode")
    .value =
    urlRoom;
}

function esc(s) {

  return String(s)
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}

function error(s) {

  var e =
    document.getElementById(
      "err"
    );

  e.textContent =
    s;

  e.style.display =
    "block";

  setTimeout(
    function() {

      e.style.display =
        "none";

    },
    4500
  );
}

async function api(
  url,
  opt
) {

  var r =
    await fetch(
      url,
      Object.assign(
        {
          credentials:
            "same-origin",

          headers:{
            "Content-Type":
              "application/json"
          }
        },
        opt || {}
      )
    );

  var d =
    await r.json();

  if (
    !r.ok ||
    d.error
  ) {

    throw new Error(
      d.error ||
      "Er ging iets mis."
    );
  }

  return d;
}

async function createRoom() {

  try {

    var name =
      document
        .getElementById(
          "createName"
        )
        .value
        .trim();

    state =
      await api(
        "/api/create",
        {
          method:
            "POST",

          body:
            JSON.stringify({
              name:name
            })
        }
      );

    history.replaceState(
      {},
      "",
      "/?room=" +
        state.room.code
    );

    render();

    startPolling();

  }
  catch(e) {

    error(
      e.message
    );
  }
}

async function joinRoom() {

  try {

    var name =
      document
        .getElementById(
          "joinName"
        )
        .value
        .trim();

    var code =
      document
        .getElementById(
          "joinCode"
        )
        .value
        .trim()
        .toUpperCase();

    state =
      await api(
        "/api/join",
        {
          method:
            "POST",

          body:
            JSON.stringify({
              name:name,
              code:code
            })
        }
      );

    inviteMode =
      false;

    history.replaceState(
      {},
      "",
      "/?room=" +
        state.room.code
    );

    render();

    startPolling();

  }
  catch(e) {

    error(
      e.message
    );
  }
}

async function act(
  a,
  x
) {

  try {

    state =
      await api(
        "/api/action",
        {
          method:
            "POST",

          body:
            JSON.stringify(
              Object.assign(
                {
                  action:a
                },
                x || {}
              )
            )
        }
      );

    render();

  }
  catch(e) {

    error(
      e.message
    );
  }
}

function render() {

  if (
    inviteMode &&
    !state
  ) {

    document
      .getElementById(
        "landing"
      )
      .classList
      .remove(
        "hidden"
      );

    document
      .getElementById(
        "lobby"
      )
      .classList
      .add(
        "hidden"
      );

    document
      .getElementById(
        "game"
      )
      .classList
      .add(
        "hidden"
      );

    document
      .getElementById(
        "createCard"
      )
      .classList
      .add(
        "hidden"
      );

    document
      .getElementById(
        "joinTitle"
      )
      .textContent =
      "🎰 JE BENT UITGENODIGD";

    document
      .getElementById(
        "joinBtn"
      )
      .textContent =
      "🟢 ACCEPTEREN & MEEDOEN";

    document
      .getElementById(
        "joinCode"
      )
      .readOnly =
      true;

    document
      .getElementById(
        "joinCode"
      )
      .value =
      inviteCode;

    document
      .getElementById(
        "joinName"
      )
      .placeholder =
      "Vul hier jouw speelnaam in";

    return;
  }

  document
    .getElementById(
      "createCard"
    )
    .classList
    .remove(
      "hidden"
    );

  document
    .getElementById(
      "joinTitle"
    )
    .textContent =
    "🚪 Meedoen met een kamer";

  document
    .getElementById(
      "joinBtn"
    )
    .textContent =
    "SPEL BINNENGAAN";

  document
    .getElementById(
      "joinCode"
    )
    .readOnly =
    false;

  if (
    !state ||
    !state.me
  ) {

    document
      .getElementById(
        "landing"
      )
      .classList
      .remove(
        "hidden"
      );

    document
      .getElementById(
        "lobby"
      )
      .classList
      .add(
        "hidden"
      );

    document
      .getElementById(
        "game"
      )
      .classList
      .add(
        "hidden"
      );

    return;
  }

  document
    .getElementById(
      "landing"
    )
    .classList
    .add(
      "hidden"
    );

  if (
    !state.room.started
  ) {

    document
      .getElementById(
        "lobby"
      )
      .classList
      .remove(
        "hidden"
      );

    document
      .getElementById(
        "game"
      )
      .classList
      .add(
        "hidden"
      );

    renderLobby();

  }
  else {

    document
      .getElementById(
        "lobby"
      )
      .classList
      .add(
        "hidden"
      );

    document
      .getElementById(
        "game"
      )
      .classList
      .remove(
        "hidden"
      );

    renderGame();
  }

  renderChat();
}

function renderLobby() {

  document
    .getElementById(
      "roomCode"
    )
    .textContent =
    state.room.code;

  var host =
    !!state.me.isAdmin;

  document
    .getElementById(
      "hostInviteCard"
    )
    .classList
    .toggle(
      "hidden",
      !host
    );

  if (
    host
  ) {

    var link =
      location.origin +
      "/?join=" +
      state.room.code;

    document
      .getElementById(
        "invite"
      )
      .textContent =
      link;
  }

  var h = "";

  state.players.forEach(
    function(p) {

      h +=
        '<div class="player">' +

        '<div>' +

        '<b>' +
        esc(p.name) +
        '</b><br>' +

        '<span class="badge ' +
        (
          p.isAdmin
            ? "admin"
            : ""
        ) +
        '">' +

        (
          p.isAdmin
            ? "BEHEERDER"
            : "SPELER"
        ) +

        '</span>' +

        '</div>' +

        '<div class="money">€' +
        Number(
          p.money
        ).toFixed(2) +
        '</div>' +

        '</div>';
    }
  );

  document
    .getElementById(
      "lobbyPlayers"
    )
    .innerHTML =
    h;

  var n =
    state.players.filter(
      function(p) {
        return p.active;
      }
    ).length;

  document
    .getElementById(
      "startBtn"
    )
    .classList
    .toggle(
      "hidden",
      !host
    );

  document
    .getElementById(
      "startBtn"
    )
    .disabled =
    !host ||
    n < 2;

  if (
    host
  ) {

    document
      .getElementById(
        "waiting"
      )
      .textContent =
      n < 2
        ? "Wacht op minimaal één andere speler..."
        : "Er zijn genoeg spelers. De beheerder kan starten.";

  }
  else {

    document
      .getElementById(
        "waiting"
      )
      .textContent =
      "🕒 Wachten op de beheerder… Zodra de beheerder start, begint het spel.";

  }
}

function renderGame() {

  var r =
    state.room;

  var p =
    state.players.find(
      function(x) {

        return (
          x.id ===
          r.currentPlayerId
        );

      }
    );

  document
    .getElementById(
      "turn"
    )
    .textContent =
    p
      ? "Aan de beurt: " +
        p.name
      : "";

  document
    .getElementById(
      "banner"
    )
    .textContent =
    r.banner;

  renderTarget();

  renderDice();

  renderControls();

  renderPlayers();

  document
    .getElementById(
      "admin"
    )
    .classList
    .toggle(
      "hidden",
      !state.me.isAdmin
    );
}

function renderPlayers() {

  var h = "";

  state.players.forEach(
    function(p) {

      var cur =
        p.id ===
        state.room.currentPlayerId;

      h +=
        '<div class="player" style="' +
        (
          cur
            ? "outline:2px solid #ffd45a"
            : ""
        ) +
        '">' +

        '<div>' +

        '<b>' +

        (
          cur
            ? "🎲 "
            : ""
        ) +

        esc(
          p.name
        ) +

        '</b><br>' +

        '<span class="badge ' +
        (
          p.isAdmin
            ? "admin"
            : ""
        ) +
        '">' +

        (
          p.isAdmin
            ? "BEHEERDER"
            : "SPELER"
        ) +

        '</span>' +

        '</div>' +

        '<div style="text-align:right">' +

        '<div class="money">€' +
        Number(
          p.money
        ).toFixed(2) +
        '</div>' +

        (
          state.me.isAdmin &&
          !p.isAdmin

          ?

          '<button class="btn red" style="width:auto;padding:5px 8px;font-size:10px" onclick="act(\\'removePlayer\\',{playerId:\\'' +
          p.id +
          '\\'})">VERWIJDER</button>'

          :

          ""
        ) +

        '</div>' +

        '</div>';
    }
  );

  document
    .getElementById(
      "players"
    )
    .innerHTML =
    h;
}

function pips(n) {

  var pos = {

    1:[
      "mc"
    ],

    2:[
      "tl",
      "br"
    ],

    3:[
      "tl",
      "mc",
      "br"
    ],

    4:[
      "tl",
      "tr",
      "bl",
      "br"
    ],

    5:[
      "tl",
      "tr",
      "mc",
      "bl",
      "br"
    ],

    6:[
      "tl",
      "tr",
      "ml",
      "mr",
      "bl",
      "br"
    ]

  }[n];

  return pos
    .map(
      function(x) {

        return (
          '<span class="pip ' +
          x +
          '"></span>'
        );

      }
    )
    .join("");
}

function renderDice() {

  var r =
    state.room;

  var h = "";

  for (
    var i = 0;
    i < 5;
    i++
  ) {

    var fixed =
      r.phase === "round"
        ? r.settled[i]
        : r.held[i];

    var clickable =
      r.phase === "main" &&
      state.me.id ===
        r.currentPlayerId &&
      r.hasRolled &&
      !r.held[i];

    h +=
      '<div class="die ' +
      (
        fixed
          ? "held"
          : ""
      ) +
      ' ' +
      (
        clickable
          ? "click"
          : ""
      ) +
      '" onclick="' +

      (
        clickable
          ? "act(\\'hold\\',{index:" +
            i +
            "})"
          : ""
      ) +

      '">' +

      pips(
        r.dice[i]
      ) +

      '</div>';
  }

  document
    .getElementById(
      "dice"
    )
    .innerHTML =
    h;

  if (
    !first &&
    lastRoll !==
      r.rollSeq
  ) {

    document
      .querySelectorAll(
        ".die"
      )
      .forEach(
        function(
          el,
          i
        ) {

          var fixed =
            r.phase === "round"
              ? r.settled[i]
              : r.held[i];

          if (
            !fixed
          ) {

            el.classList.add(
              "roll"
            );

            setTimeout(
              function() {

                el.classList.remove(
                  "roll"
                );

              },
              650
            );
          }
        }
      );

    soundRoll();
  }

  lastRoll =
    r.rollSeq;

  first = false;
}

function renderTarget() {

  var e =
    document.getElementById(
      "target"
    );

  var c =
    document.getElementById(
      "tableCount"
    );

  var r =
    state.room;

  var sum =
    r.dice.reduce(
      function(
        a,
        b
      ) {

        return (
          a +
          Number(
            b || 0
          )
        );

      },
      0
    );

  var targetCount =
    (
      r.phase ===
        "round" &&
      r.target
    )

      ?

      r.dice.filter(
        function(v) {

          return (
            Number(v) ===
            Number(r.target)
          );

        }
      ).length

      :

      0;

  c.innerHTML =
    "🎯 TOTAAL OP TAFEL: <b>" +
    sum +
    " OGEN</b>" +

    (
      r.phase ===
      "round"

        ?

        "<br><span>Doelsteen: <b>" +
        r.target +
        "</b> — " +
        targetCount +
        " doelsteen" +
        (
          targetCount === 1
            ? ""
            : "nen"
        ) +
        " op tafel</span>"

        :

        ""
    );

  if (
    r.phase !==
    "round"
  ) {

    e.classList.add(
      "hidden"
    );

    return;
  }

  e.classList.remove(
    "hidden"
  );

  var possible =
    (
      targetCount *
      r.target *
      0.50
    )
      .toFixed(2)
      .replace(
        ".",
        ","
      );

  e.innerHTML =
    "<b>" +
    r.target +
    "</b><br><span>" +

    (
      r.mode === "earn"

        ? "💰 VERDIEN FASE"

        : "💸 BETAAL FASE"

    ) +

    "</span><br><small>" +

    targetCount +
    " × " +
    r.target +
    " ogen × €0,50 = €" +
    possible +

    "</small>";
}

function renderControls() {

  var e =
    document.getElementById(
      "controls"
    );

  var r =
    state.room;

  var my =
    state.me.id ===
    r.currentPlayerId;

  if (
    !my
  ) {

    e.innerHTML =
      '<div class="status">Wacht op de andere speler.</div>';

    return;
  }

  if (
    r.phase === "main" &&
    !r.hasRolled
  ) {

    e.innerHTML =
      '<button class="btn gold" style="font-size:19px" onclick="act(\\'beginTurn\\');soundRoll()">🎲 BEGIN WORP</button>';

    return;
  }

  if (
    r.phase === "main"
  ) {

    var all =
      r.held.every(
        Boolean
      );

    e.innerHTML =
      '<div class="row">' +

      '<button class="btn orange" onclick="act(\\'reroll\\');soundRoll()" ' +

      (
        r.mustHold ||
        all
          ? "disabled"
          : ""
      ) +

      '>🎲 OPNIEUW GOOIEN</button>' +

      '<button class="btn" style="background:#163d79" onclick="act(\\'accept\\');soundAccept()">✓ AKKOORD</button>' +

      '</div>' +

      '<div class="status">' +

      (
        r.mustHold

          ? "👉 Houd minimaal 1 nieuwe dobbelsteen vast."

          :

          all

            ? "Alle dobbelstenen staan vast. Druk AKKOORD."

            :

            "Je mag opnieuw gooien of AKKOORD kiezen."
      ) +

      '</div>';

    return;
  }

  if (
    r.phase === "round"
  ) {

    var earnActive =
      r.mode === "earn";

    var title =
      earnActive
        ? "💰 VERDIEN FASE — GOOI"
        : "💸 BETAAL FASE — GOOI";

    var phaseLabel =
      earnActive
        ? "💰 VERDIEN FASE"
        : "💸 BETAAL FASE";

    var phaseClass =
      earnActive
        ? "green"
        : "orange";

    e.innerHTML =
      '<button class="btn ' +
      phaseClass +
      '" style="font-size:18px" onclick="act(\'roundRoll\');soundRoll()">' +

      title +

      '</button>' +

      '<div class="status">' +

      '<b>' +
      phaseLabel +
      '</b><br>' +

      'Doelsteen: <b>' +
      r.target +
      "'en</b><br>" +

      'Waarde per doelsteen: <b>€' +
      (
        r.target *
        0.50
      )
        .toFixed(2)
        .replace(
          ".",
          ","
        ) +

      '</b><br>' +

      (
        r.needFreshRoll

          ?

          "VOLLE BAK! De volgende worp is een nieuwe set van 5."

          :

          "Doelstenen worden automatisch vastgezet."
      ) +

      '</div>';
  }
}

function toggleChat() {

  chatOpen =
    !chatOpen;

  document
    .getElementById(
      "chatbox"
    )
    .classList
    .toggle(
      "open",
      chatOpen
    );
}

function renderChat() {

  var h = "";

  state.chat.forEach(
    function(m) {

      h +=
        '<div class="msg">' +

        '<b>' +
        esc(
          m.player
        ) +
        '</b> ' +

        '<span class="small">' +
        esc(
          m.time
        ) +
        '</span><br>' +

        esc(
          m.message
        ) +

        '</div>';
    }
  );

  var e =
    document.getElementById(
      "messages"
    );

  e.innerHTML =
    h;

  e.scrollTop =
    e.scrollHeight;
}

function sendChat() {

  var e =
    document.getElementById(
      "chatInput"
    );

  var m =
    e.value.trim();

  if (!m) return;

  e.value = "";

  act(
    "chat",
    {
      message:m
    }
  );
}

async function copyInvite() {

  var link =
    location.origin +
    "/?join=" +
    state.room.code;

  try {

    await navigator
      .clipboard
      .writeText(
        link
      );

    alert(
      "Uitnodigingslink gekopieerd!"
    );

  }
  catch(e) {

    prompt(
      "Kopieer deze link:",
      link
    );
  }
}

var ac = null;

function audio() {

  if (!ac) {

    var A =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!A) return null;

    ac =
      new A();
  }

  if (
    ac.state ===
    "suspended"
  ) {

    ac.resume();
  }

  return ac;
}

function beep(
  f,
  d,
  t,
  v
) {

  var c =
    audio();

  if (!c) return;

  var o =
    c.createOscillator();

  var g =
    c.createGain();

  o.type =
    t ||
    "sine";

  o.frequency.value =
    f;

  g.gain.setValueAtTime(
    v || .05,
    c.currentTime
  );

  g.gain.exponentialRampToValueAtTime(
    .001,
    c.currentTime + d
  );

  o.connect(g);

  g.connect(
    c.destination
  );

  o.start();

  o.stop(
    c.currentTime + d
  );
}

function soundRoll() {

  beep(
    90,
    .08,
    "square",
    .04
  );

  setTimeout(
    function() {

      beep(
        150,
        .08,
        "square",
        .03
      );

    },
    70
  );

  setTimeout(
    function() {

      beep(
        210,
        .1,
        "square",
        .02
      );

    },
    140
  );
}

function soundAccept() {

  beep(
    500,
    .1,
    "triangle",
    .06
  );

  setTimeout(
    function() {

      beep(
        800,
        .14,
        "triangle",
        .05
      );

    },
    90
  );
}

async function poll() {

  /*
    Bij een uitnodigingslink
    mag de oude sessie niet
    het scherm overschrijven.
  */

  if (
    inviteMode &&
    !state
  ) {

    return;
  }

  try {

    var d =
      await api(
        "/api/state"
      );

    if (
      d &&
      d.me
    ) {

      state =
        d;

      render();
    }

  }
  catch(e) {}
}

function startPolling() {

  if (
    !pollTimer
  ) {

    pollTimer =
      setInterval(
        poll,
        800
      );
  }
}

if (
  !inviteMode
) {

  poll();

  startPolling();
}

render();

</script>

</body>
</html>`;

const server =
  http.createServer(
    async (
      req,
      res
    ) => {

      try {

        if (
          req.method === "GET" &&
          req.url === "/health"
        ) {

          res.writeHead(
            200,
            {
              "Content-Type":
                "application/json"
            }
          );

          res.end(
            JSON.stringify({
              ok:true
            })
          );

          return;
        }

        if (
          req.method === "GET" &&
          req.url.split("?")[0] === "/"
        ) {

          res.writeHead(
            200,
            {
              "Content-Type":
                "text/html; charset=utf-8",

              "Cache-Control":
                "no-cache"
            }
          );

          res.end(
            HTML
          );

          return;
        }

        async function body() {

          return await new Promise(
            (
              resolve,
              reject
            ) => {

              let s = "";

              req.on(
                "data",
                c => {

                  s += c;

                  if (
                    s.length >
                    1000000
                  ) {

                    reject(
                      new Error(
                        "Request te groot."
                      )
                    );

                    req.destroy();
                  }

                }
              );

              req.on(
                "end",
                () => {

                  try {

                    resolve(
                      s
                        ? JSON.parse(s)
                        : {}
                    );

                  }
                  catch(e) {

                    reject(
                      new Error(
                        "Ongeldige JSON."
                      )
                    );
                  }

                }
              );

              req.on(
                "error",
                reject
              );

            }
          );
        }

        if (
          req.method === "POST" &&
          req.url === "/api/create"
        ) {

          const b =
            await body();

          const n =
            nameClean(
              b.name
            );

          const r =
            createRoom(
              n
            );

          const p =
            r.players[0];

          const sid =
            newSession(
              r.code,
              p.id
            );

          setCookie(
            res,
            sid
          );

          res.writeHead(
            200,
            {
              "Content-Type":
                "application/json"
            }
          );

          res.end(
            JSON.stringify(
              publicState(
                r,
                p
              )
            )
          );

          return;
        }

        if (
          req.method === "POST" &&
          req.url === "/api/join"
        ) {

          const b =
            await body();

          const n =
            nameClean(
              b.name
            );

          const c =
            codeClean(
              b.code
            );

          if (
            c.length !== 6
          ) {

            throw new Error(
              "Vul een geldig kamernummer van 6 tekens in."
            );
          }

          const r =
            rooms.get(c);

          if (!r) {

            throw new Error(
              "Deze speelkamer bestaat niet."
            );
          }

          if (
            r.started
          ) {

            throw new Error(
              "Het spel is al gestart."
            );
          }

          if (
            active(r).length >= 4
          ) {

            throw new Error(
              "Deze kamer zit al vol."
            );
          }

          if (
            r.players.some(
              p =>
                p.active &&
                p.name.toLowerCase() ===
                  n.toLowerCase()
            )
          ) {

            throw new Error(
              "Deze speelnaam wordt al gebruikt."
            );
          }

          const p = {
            id:
              crypto.randomUUID(),

            name:
              n,

            money:
              100,

            active:
              true
          };

          r.players.push(
            p
          );

          log(
            r,
            n +
              " is de kamer binnengekomen."
          );

          bump(r);

          setCookie(
            res,
            newSession(
              r.code,
              p.id
            )
          );

          res.writeHead(
            200,
            {
              "Content-Type":
                "application/json"
            }
          );

          res.end(
            JSON.stringify(
              publicState(
                r,
                p
              )
            )
          );

          return;
        }

        if (
          req.method === "GET" &&
          req.url === "/api/state"
        ) {

          const x =
            getRoomPlayer(
              req
            );

          if (!x) {

            res.writeHead(
              401,
              {
                "Content-Type":
                  "application/json"
              }
            );

            res.end(
              JSON.stringify({
                error:
                  "Geen sessie"
              })
            );

            return;
          }

          res.writeHead(
            200,
            {
              "Content-Type":
                "application/json",

              "Cache-Control":
                "no-cache"
            }
          );

          res.end(
            JSON.stringify(
              publicState(
                x.r,
                x.p
              )
            )
          );

          return;
        }

        if (
          req.method === "POST" &&
          req.url === "/api/action"
        ) {

          const x =
            getRoomPlayer(
              req
            );

          if (!x) {

            throw new Error(
              "Geen sessie."
            );
          }

          const b =
            await body();

          action(
            x.r,
            x.p,
            b
          );

          res.writeHead(
            200,
            {
              "Content-Type":
                "application/json"
            }
          );

          res.end(
            JSON.stringify(
              publicState(
                x.r,
                x.p
              )
            )
          );

          return;
        }

        res.writeHead(
          404,
          {
            "Content-Type":
              "application/json"
          }
        );

        res.end(
          JSON.stringify({
            error:
              "Niet gevonden"
          })
        );

      }
      catch(e) {

        console.error(e);

        res.writeHead(
          400,
          {
            "Content-Type":
              "application/json"
          }
        );

        res.end(
          JSON.stringify({
            error:
              e.message ||
              "Er ging iets mis."
          })
        );
      }
    }
  );

server.listen(
  PORT,
  () =>
    console.log(
      "Dobbelen 11/24 draait op poort " +
      PORT
    )
);
