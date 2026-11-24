'use strict';
/* ================================================================
   EL BANQUERO — motor de juego centralizado.
   Toda la lógica (dados, turnos, pagos, bancarrotas, victorias)
   vive aquí; la interfaz solo despacha acciones y muestra eventos.
   ================================================================ */

/* ---------------- MOTOR ---------------- */
const Engine = (() => {
  let S = null;

  const rnd6 = () => 1 + Math.floor(Math.random() * 6);
  const curPi = () => S.order[S.cur];

  /* Multiplicador de renta según construcciones (zona completa):
     nivel 0 ×2, casa ×4, 2 casas ×6, edificio ×10 */
  const BUILT_MULT = [2, 4, 6, 10];
  const LEVEL_NAME = ['', 'casa', 'segunda casa', 'edificio'];

  function shuffle(a){
    for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
    return a;
  }

  function newGame(cfg){
    /* las casillas vuelven al banco: dueño y construcciones a cero
       (evita arrastrar estado de una partida anterior) */
    TILES.forEach(t => { if(t.t === 'prop'){ t.owner = null; t.built = 0; } });
    const players = cfg.players.map((pl, i) => ({
      id:i, name:pl.name, color:pl.c, cl:pl.cl, cd:pl.cd, tc:pl.tc,
      cash:START_CASH + STEP_EXTRA * i, pos:0, alive:true, jailed:false, jailTurns:0,
      props:[], doublesRun:0, frozen:null,
    }));
    const order = shuffle(players.map(p => p.id));
    S = {
      cfg, players, order,
      cur:0, round:1, pot:0, phase:'roll', extra:false,
      offerTile:null, pendingChain:false, chainSteps:0, lastRoll:null, over:null,
    };
    return snapshot();
  }

  function netWorth(pi){
    const p = S.players[pi];
    /* las construcciones cuentan a coste de adquisición; el efectivo
       congelado por el BCP cuenta como activo: te lo va a devolver */
    return p.cash + (p.frozen ? p.frozen.amount : 0)
      + p.props.reduce((s,t) => s + TILES[t].price + (TILES[t].built || 0) * upgradeCost(t), 0);
  }

  function fullSet(pi, g){
    return TILES.every((t,i) => t.g !== g || t.owner === pi);
  }

  /* coste de un nivel de construcción: mitad del precio de la casilla */
  function upgradeCost(i){ return TILES[i].price / 2; }

  function rentOf(i){
    const t = TILES[i];
    return t.rent * (fullSet(t.owner, t.g) ? BUILT_MULT[t.built || 0] : 1);
  }

  /* Construir un nivel en una casilla propia de zona completa.
     Solo durante el turno del jugador (antes de tirar, o en Tacumbú). */
  function upgrade(pi, i){
    if(!S || S.phase === 'over') return null;
    if(pi !== curPi()) return null;
    if(S.phase !== 'roll' && S.phase !== 'jail' && S.phase !== 'end') return null;
    const t = TILES[i], p = S.players[pi];
    if(!t || t.t !== 'prop' || t.owner !== pi) return null;
    if(!fullSet(pi, t.g)) return null;
    if((t.built || 0) >= 3) return null;
    const cost = upgradeCost(i);
    if(p.cash < cost) return null;
    const ev = [];
    p.cash -= cost;
    t.built = (t.built || 0) + 1;
    ev.push({type:'build', pi, tile:i, level:t.built});
    return {ev};
  }

  /* ---- UENO BANK · eventos aleatorios de la casilla verde ---- */
  /* Al caer: (1) el BCP congela TODO tu efectivo y lo devuelve en
     BCP_ROUNDS rondas, (2) mocachino +15.000, (3) Masivo bro +100.000,
     (4) intereses de tarjeta −25/40/60 mil, (5) descuento Inforcom
     −200.000. Los descuentos van al bote. */
  function uenoEvent(pi, ev){
    const p = S.players[pi];
    const roll = Math.random();
    if(roll < 0.20){
      const amount = Math.max(0, p.cash);
      if(amount > 0){
        p.cash = 0;
        p.frozen = {amount, untilRound: S.round + BCP_ROUNDS};
        ev.push({type:'freeze', pi, amount, rounds:BCP_ROUNDS});
      } else {
        ev.push({type:'info', msg:'Ueno Bank: pasaste sin efectivo que congelar.'});
      }
    } else if(roll < 0.40){
      p.cash += 15000;
      ev.push({type:'uenogain', pi, delta:15000, msg:'Ueno Bank: te dan un mocachino.'});
    } else if(roll < 0.60){
      p.cash += 100000;
      ev.push({type:'uenogain', pi, delta:100000, msg:'Ueno Bank: te encuentras con Masivo bro.'});
    } else if(roll < 0.80){
      const amt = [25000, 40000, 60000][Math.floor(Math.random() * 3)];
      p.cash -= amt; S.pot += amt;
      ev.push({type:'uenoloss', pi, delta:-amt, msg:'Ueno Bank: pagaste los intereses de tu tarjeta de crédito.'});
    } else {
      p.cash -= 200000; S.pot += 200000;
      ev.push({type:'uenoloss', pi, delta:-200000, msg:'Ueno Bank: Inforcom te descuenta el préstamo.'});
    }
    checkBankrupts(ev);
    if(!winCheck(ev)) finishRoll(ev);
  }

  /* el BCP devuelve el dinero congelado al cumplirse las rondas */
  function checkFrozen(ev){
    if(!S) return;
    S.players.forEach((p, pi) => {
      if(p.alive && p.frozen && S.round >= p.frozen.untilRound){
        p.cash += p.frozen.amount;
        ev.push({type:'refund', pi, amount:p.frozen.amount});
        p.frozen = null;
      }
    });
  }

  function pay(pi, dest, amount, reason, ev){
    const p = S.players[pi];
    p.cash -= amount;
    ev.push({type:'cash', pi, delta:-amount, reason});
    if(dest === 'pot'){ S.pot += amount; }
    else if(dest !== null){ S.players[dest].cash += amount; }
  }

  function checkBankrupts(ev){
    S.players.forEach((p, pi) => {
      if(!p.alive) return;
      if(netWorth(pi) <= 0 || p.cash < DEBT_LIMIT){
        p.alive = false;
        p.props.forEach(t => { TILES[t].owner = null; TILES[t].built = 0; });
        p.props = [];
        ev.push({type:'bankrupt', pi});
      }
    });
  }

  function over(winner, reason, ev){
    S.phase = 'over';
    S.over = {winner, reason};
    ev.push({type:'over', winner, reason});
  }

  function winCheck(ev){
    const alive = S.players.map((p,i) => ({p,i})).filter(x => x.p.alive);
    if(alive.length === 1){ over(alive[0].i, 'ultimo', ev); return true; }
    const reach = alive.filter(x => netWorth(x.i) >= S.cfg.target);
    if(reach.length){
      reach.sort((a,b) => (netWorth(b.i) - netWorth(a.i)) || (S.players[b.i].cash - S.players[a.i].cash));
      over(reach[0].i, 'objetivo', ev); return true;
    }
    return false;
  }

  /* Fin de la resolución: bancarrotas, victoria, extra o fin de turno */
  function finishRoll(ev){
    checkBankrupts(ev);
    if(winCheck(ev)) return;
    const p = S.players[curPi()];
    if(!p.alive){ S.phase = 'end'; return; }               // el jugador quebró: pasa el turno
    if(S.lastRoll && S.lastRoll.maxed){ S.extra = true; S.phase = 'roll'; }
    else { S.extra = false; S.phase = 'end'; }
  }

  function rollDice(){
    if(!S || S.phase !== 'roll') return null;
    const pi = curPi(), p = S.players[pi];
    const d1 = rnd6();
    const d2 = S.cfg.dice === 2 ? rnd6() : null;
    const doubles = d2 !== null && d1 === d2;
    const maxed = S.cfg.dice === 1 ? d1 === 6 : doubles;
    S.lastRoll = {d1, d2, maxed, doubles};

    if(maxed) p.doublesRun++; else p.doublesRun = 0;

    if(p.doublesRun >= DOUBLES_LIMIT){
      const ev = [];
      warpToJail(pi, ev);
      S.phase = 'end';
      return {d1, d2, triples:true, ev};
    }

    const from = p.pos, steps = d1 + (d2 || 0);
    const N = TILES.length;
    const path = [];
    let pos = from;
    for(let s = 0; s < steps; s++){ pos = (pos + 1) % N; path.push(pos); }
    p.pos = pos;

    const ev = [];
    if(from + steps >= N){
      p.cash += SALARY;
      ev.push({type:'cash', pi, delta:SALARY, reason:'Salario por pasar por SALIDA'});
    }
    S.phase = 'resolve';
    S.pendingChain = false;
    return {d1, d2, maxed, path, ev};
  }

  function warpToJail(pi, ev){
    const p = S.players[pi];
    p.pos = JAIL_POS; p.jailed = true;
    p.jailTurns = JAIL_ROUNDS;          /* 3 rondas de turno perdidas, los dados no salvan */
    p.doublesRun = 0;
    ev.push({type:'jail', pi});
  }

  /* intercambio de casillas de mutuo acuerdo (como el clásico): cada parte
     cede su casilla al otro y el banco premia con TRADE_BONUS a cada uno */
  function tradeProps(pa, pb, ta, tb){
    /* se propone en tu turno, antes de tirar o cumpliendo condena */
    if(!S || (S.phase !== 'roll' && S.phase !== 'jail')) return null;
    const a = S.players[pa], b = S.players[pb];
    if(!a || !b || !a.alive || !b.alive || pa === pb) return null;
    if(TILES[ta].t !== 'prop' || TILES[tb].t !== 'prop') return null;
    if(TILES[ta].owner !== pa || TILES[tb].owner !== pb) return null;
    TILES[ta].owner = pb; TILES[tb].owner = pa;
    a.props = a.props.filter(x => x !== ta).concat(tb);
    b.props = b.props.filter(x => x !== tb).concat(ta);
    a.cash += TRADE_BONUS; b.cash += TRADE_BONUS;
    const ev = [
      {type:'cash', pi:pa, delta:TRADE_BONUS, reason:'Bono del banco por intercambio'},
      {type:'cash', pi:pb, delta:TRADE_BONUS, reason:'Bono del banco por intercambio'},
      {type:'trade', a:pa, b:pb, ta, tb},
    ];
    checkBankrupts(ev);
    if(!winCheck(ev)){ /* la partida sigue en su fase */ }
    return {ev};
  }

  function drawCard(deck){
    return deck[Math.floor(Math.random() * deck.length)];
  }

  function applyCard(c, pi, ev){
    const p = S.players[pi];
    switch(c.k){
      case 'money':
        p.cash += c.v;
        ev.push({type:'cash', pi, delta:c.v, reason:c.txt});
        break;
      case 'pot':
        pay(pi, 'pot', c.v, c.txt, ev);
        break;
      case 'eachIn': {
        const others = S.players.filter(q => q.alive && q.id !== p.id);
        others.forEach(q => { q.cash -= c.v; ev.push({type:'cash', pi:q.id, delta:-c.v, reason:'Le pagas a ' + p.name}); });
        p.cash += c.v * others.length;
        ev.push({type:'cash', pi, delta:c.v * others.length, reason:c.txt});
        break;
      }
      case 'eachOut': {
        const others = S.players.filter(q => q.alive && q.id !== p.id);
        pay(pi, null, c.v * others.length, c.txt, ev);
        others.forEach(q => { q.cash += c.v; ev.push({type:'cash', pi:q.id, delta:c.v, reason:'Cobras de ' + p.name}); });
        break;
      }
      case 'perProp': {
        const n = p.props.length;
        if(n > 0) pay(pi, 'pot', c.v * n, c.txt, ev);
        else ev.push({type:'info', msg:'No tienes propiedades: no pagas reparaciones.'});
        break;
      }
      case 'warp': {
        if(c.to === 'jail'){ warpToJail(pi, ev); }
        else {
          const from = p.pos;
          p.pos = c.to;
          if(c.pay || (c.to === 0 && from !== 0)){
            p.cash += SALARY;
            ev.push({type:'cash', pi, delta:SALARY, reason:'Salario en SALIDA'});
          }
          ev.push({type:'warp', pi, to:c.to});
          S.pendingChain = true; S.chainSteps = 0;   // re-resolver la casilla destino
        }
        break;
      }
      case 'move': {
        const N = TILES.length;
        const from = p.pos, v = c.v;
        const path = [];
        let q = from;
        for(let s = 0; s < Math.abs(v); s++){
          q = (q + (v > 0 ? 1 : -1) + N) % N;
          path.push(q);
        }
        p.pos = q;
        if(v > 0 && from + v >= N){
          p.cash += SALARY;
          ev.push({type:'cash', pi, delta:SALARY, reason:'Salario por pasar por SALIDA'});
        }
        ev.push({type:'stepmove', pi, path, dir:v});
        S.pendingChain = true; S.chainSteps = v;
        break;
      }
    }
  }

  /* Resuelve la casilla donde está el jugador actual */
  function resolveLanding(){
    if(!S || S.phase !== 'resolve') return null;
    const pi = curPi(), p = S.players[pi];
    const i = p.pos, t = TILES[i];
    const ev = [];
    let offer = null;

    if(t.t === 'prop'){
      if(t.owner == null){
        S.offerTile = i; S.phase = 'buy';
        ev.push({type:'info', msg:p.name + ' cae en ' + t.name + ' (libre)'});
        offer = {tile:i};
      } else if(t.owner === pi){
        ev.push({type:'info', msg:p.name + ' descansa en su propiedad ' + t.name + '.'});
        finishRoll(ev);
      } else {
        const r = rentOf(i);
        const o = S.players[t.owner];
        pay(pi, t.owner, r, p.name + ' paga renta de ' + money(r) + ' a ' + o.name + ' por ' + t.name, ev);
        if(fullSet(t.owner, t.g)) ev.push({type:'info', msg:o.name + ' tiene la zona completa' + (t.built ? ' con ' + LEVEL_NAME[t.built] : '') + ': renta ×' + BUILT_MULT[t.built || 0] + '.'});
        finishRoll(ev);
      }
    } else if(t.t === 'tax'){
      pay(pi, 'pot', t.amount, p.name + ' paga ' + t.name + ': ' + money(t.amount) + ' al bote', ev);
      finishRoll(ev);
    } else if(t.t === 'luck'){
      const c = drawCard(CARDS_LUCK);
      ev.push({type:'card', pi, kind:'SUERTE', txt:c.txt});
      applyCard(c, pi, ev);
      if(!S.pendingChain) finishRoll(ev);
    } else if(t.t === 'chest'){
      const c = drawCard(CARDS_CHEST);
      ev.push({type:'card', pi, kind:'CAJA DE AHORRO', txt:c.txt});
      applyCard(c, pi, ev);
      if(!S.pendingChain) finishRoll(ev);
    } else if(t.t === 'ueno'){
      uenoEvent(pi, ev);
    } else if(t.t === 'park'){
      if(S.pot > 0){
        const amt = S.pot; S.pot = 0;
        p.cash += amt;
        ev.push({type:'cash', pi, delta:amt, reason:p.name + ' se lleva el bote de la Plaza Uruguaya: ' + money(amt)});
      } else {
        ev.push({type:'info', msg:'Plaza Uruguaya: descansas. El bote está vacío.'});
      }
      finishRoll(ev);
    } else if(t.t === 'go'){
      ev.push({type:'info', msg:'Descansas en la SALIDA: tu casilla de inicio.'});
      finishRoll(ev);
    } else if(t.t === 'jail'){
      /* caer en Tacumbú = quedar preso: 3 rondas sí o sí (ni dobles ni
         seises salvan) o pagar la cuota para salir; no hay "de visita" */
      warpToJail(pi, ev);
      ev.push({type:'info', msg:'Caíste en Tacumbú: 3 rondas de encarcelamiento sí o sí (los dados no salvan) o pagás ' + money(JAIL_FINE) + ' de fianza para salir.'});
      finishRoll(ev);
    } else if(t.t === 'auction'){
      ev.push({type:'info', msg:'Casa de subastas: usá el botón de la esquina antes de tirar.'});
      finishRoll(ev);
    }

    if(S.phase === 'over') return {ev, over:true};
    if(S.pendingChain){ S.pendingChain = false; return {ev, chain:S.chainSteps}; }
    if(offer) return {ev, offer};
    return {ev};
  }

  function buy(){
    if(!S || S.phase !== 'buy') return null;
    const pi = curPi(), p = S.players[pi];
    const i = S.offerTile, t = TILES[i];
    if(p.cash < t.price) return null;
    const ev = [];
    p.cash -= t.price;
    t.owner = pi; p.props.push(i);
    ev.push({type:'buy', pi, tile:i});
    S.offerTile = null;
    finishRoll(ev);
    return {ev};
  }

  function decline(){
    if(!S || S.phase !== 'buy') return null;
    const ev = [];
    const t = TILES[S.offerTile];
    ev.push({type:'info', msg:curName() + ' no compra ' + t.name + ': queda libre.'});
    S.offerTile = null;
    finishRoll(ev);
    return {ev};
  }

  /* Subasta: adjudica una propiedad libre al mejor postor por el precio
     pujado (pagado al banco). Corre en fase 'roll', antes de tirar. */
  function auctionAward(pi, i, price){
    if(!S || S.phase === 'over') return null;
    const p = S.players[pi], t = TILES[i];
    if(!p || !p.alive || !t || t.t !== 'prop' || t.owner != null) return null;
    if(price <= 0 || p.cash < price) return null;
    const ev = [];
    p.cash -= price;
    t.owner = pi; p.props.push(i);
    ev.push({type:'buy', pi, tile:i});
    ev.push({type:'info', msg:p.name + ' gana la subasta de ' + t.name + ' por ' + money(price) + '.'});
    checkBankrupts(ev);
    if(!winCheck(ev)){ S.phase = 'roll'; }
    return {ev};
  }

  function payBail(){
    if(!S || S.phase !== 'jail') return null;
    const pi = curPi(), p = S.players[pi];
    if(p.cash < JAIL_FINE) return null;
    const ev = [];
    pay(pi, 'pot', JAIL_FINE, p.name + ' paga la fianza de ' + money(JAIL_FINE), ev);
    p.jailed = false;
    S.phase = 'roll';
    return {ev};
  }

  function skipJailTurn(){
    if(!S || S.phase !== 'jail') return null;
    const ev = [];
    const p = S.players[curPi()];
    p.jailTurns--;
    if(p.jailTurns > 0){
      ev.push({type:'info', msg:p.name + ' pierde el turno en Tacumbú (le quedan ' + p.jailTurns + ' ronda(s)).'});
    } else {
      p.jailed = false;
      ev.push({type:'info', msg:p.name + ' cumple sus ' + JAIL_ROUNDS + ' rondas en Tacumbú y sale libre.'});
    }
    endTurn(ev);
    return {ev};
  }

  function curName(){ return S.players[curPi()].name; }

  function endTurn(evIn){
    if(!S || S.phase === 'over') return null;
    const ev = evIn || [];
    S.extra = false;
    S.players[curPi()].doublesRun = 0;
    const n = S.order.length;
    let idx = S.cur;
    do { idx = (idx + 1) % n; } while(!S.players[S.order[idx]].alive && idx !== S.cur);
    const wrapped = idx <= S.cur;
    S.cur = idx;
    if(wrapped){
      S.round++;
      checkFrozen(ev);
      if(S.cfg.roundLimit > 0 && S.round > S.cfg.roundLimit){ endByRounds(ev); return {ev}; }
      ev.push({type:'round', round:S.round});
    }
    S.phase = S.players[S.order[S.cur]].jailed ? 'jail' : 'roll';
    return {ev};
  }

  function endByRounds(ev){
    over(ranking()[0].i, 'rondas', ev);
  }

  function ranking(){
    return S.players.map((p,i) => ({i, name:p.name, cash:p.cash, nw:netWorth(i), alive:p.alive}))
      .sort((a,b) => (b.nw - a.nw) || (b.cash - a.cash));
  }

  function expel(pi){
    if(!S || S.phase === 'over') return null;
    const ev = [];
    const p = S.players[pi];
    if(!p.alive) return null;
    p.alive = false;
    p.props.forEach(t => { TILES[t].owner = null; TILES[t].built = 0; });
    p.props = [];
    ev.push({type:'expelled', pi});
    checkBankrupts(ev);
    if(!winCheck(ev)){
      if(pi === curPi() && (S.phase === 'roll' || S.phase === 'buy' || S.phase === 'end' || S.phase === 'jail' || S.phase === 'resolve')){
        S.extra = false; S.offerTile = null;
        endTurn(ev);
      }
    }
    return {ev};
  }

  function snapshot(){
    if(!S) return null;
    return {
      players:S.players.map(p => ({...p, props:[...p.props]})),
      owners:TILES.map(t => t.owner === undefined ? null : t.owner),
      built:TILES.map(t => t.built || 0),
      cur:S.cur, curPi:curPi(), round:S.round, pot:S.pot, phase:S.phase, extra:S.extra,
      offerTile:S.offerTile, lastRoll:S.lastRoll, over:S.over,
      cfg:S.cfg, order:S.order, target:S.cfg.target,
    };
  }

  /* Modo espejo (invitados online): el estado llega del anfitrión listo,
     el motor solo lo expone para leer (render, patrimonio, ranking). */
  function setMirror(st){ S = st; return st; }

  return {newGame, rollDice, resolveLanding, buy, decline, auctionAward, payBail, skipJailTurn, endTurn, expel, ranking, snapshot, setMirror,
    netWorth, rentOf, fullSet, upgrade, upgradeCost, builtMult:BUILT_MULT, tradeProps, state:() => S};
})();
