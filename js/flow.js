'use strict';
/* ================================================================
   EL BANQUERO — flujo: modales, temporizador y tirada con animación.
   ================================================================ */

/* ---------------- MODALES ---------------- */
/* locked=true evita cerrar con clic en el fondo: obliga a decidir (compra, cartas) */
let modalLocked = false;
function openModal(html, locked = false){
  modalLocked = locked;
  $('#modal').innerHTML = html;
  $('#overlay').classList.remove('hidden');
}
function closeModal(){
  $('#overlay').classList.add('hidden');
  $('#modal').classList.remove('rules');
  modalLocked = false;
  if(window.Online) Online.onModalClosed();   /* anfitrión: limpia el modal espejo */
}

function cardModal(kind, txt){
  return new Promise(res => {
    const bg = kind.includes('SUERTE') ? '#A87E17' : '#1F6A50';
    /* el ñandutí flanquea el título: sello de identidad de los dos mazos */
    const lace = nandutiSVG();
    openModal(`
      <div class="deedhead" style="background:${bg}">
        <div class="cardtop">${lace}<div class="g">${kind}</div>${lace}</div>
        <div class="n" style="font-size:17px; line-height:1.35; margin-top:6px;">${txt}</div>
      </div>
      <div class="btnrow"><button class="btn" id="m-ok">¡Vale!</button></div>`, true);
    /* invitado online: la carta se cierra sola (quien decide es el que la
       leyó); el marcador evita cerrar un modal espejo que la reemplazó */
    if(window.Online && Online.active && !Online.isHost){
      const id = 'g' + Math.random().toString(36).slice(2, 8);
      $('#modal').dataset.gcard = id;
      setTimeout(() => {
        if($('#modal').dataset.gcard === id) closeModal();
        res();
      }, 2400);
      return;
    }
    $('#m-ok').onclick = () => { closeModal(); Sfx.click(); res(); };
  });
}

/* Decisión de compra: la dispara el botón local o la acción que llega por
   internet (invitado); el anfitrión siempre la aplica al motor. */
async function buyDecision(doBuy){
  closeModal();
  const gen = gameGen;
  const r = doBuy ? Engine.buy() : Engine.decline();
  if(r) await handleEvents(r.ev);
  /* la compra o el rechazo puede cerrar la partida (objetivo alcanzado):
     en ese caso va directo a la pantalla final */
  if(Engine.snapshot().phase === 'over'){ showWinnerModal(); return; }
  await autoEndTurn(gen);
}

function showBuyModal(tile){
  const st = Engine.snapshot();
  const t = TILES[tile];
  const p = st.players[st.curPi];
  const g = GROUPS[t.g];
  const remote = window.Online && Online.active && !Online.isMySeat(st.curPi);
  if(window.Online && Online.isHost) Online.noteModal({kind:'buy', tile, decider:st.curPi});
  openModal(`
      <div class="deedhead" style="background:${g.color}">
        <div class="g">Zona ${g.name} · Billete de ${money(g.den)}</div>
        <div class="n">${t.name}</div>
        <div class="p">Precio ${money(t.price)}</div>
      </div>
    <div class="rentrows">
      <div><span>Renta base</span><span>${money(t.rent)}</span></div>
      <div><span>Zona completa ×2 · construyendo hasta ×10</span><span class="hl">${money(t.rent * 2)}</span></div>
      <div><span>Efectivo de ${p.name}</span><span>${money(p.cash)}</span></div>
    </div>
    <div class="mtext">Si no la compras, la casilla <b>queda libre</b> para futuros compradores.</div>
    ${remote
      ? `<div class="onwait">Esperando que <b>${p.name}</b> decida…</div>`
      : `<div class="btnrow">
          <button class="btn" id="m-buy" ${p.cash < t.price ? 'disabled' : ''}>Comprar</button>
          <button class="btn alt" id="m-skip">No comprar</button>
        </div>`}`, true);
  if(remote) return;
  $('#m-buy').onclick = () => buyDecision(true);
  $('#m-skip').onclick = () => buyDecision(false);
}

/* ---------------- CONSTRUIR (zona completa) ---------------- */
/* Panel de construcciones: casillas de las zonas completas del jugador
   en turno. Cada nivel cuesta la mitad del precio de la casilla y sube
   la renta: casa ×4, segunda casa ×6, edificio ×10. */
function showBuildModal(){
  busy = true; renderAction(Engine.snapshot());   /* bloquea el resto de botones */
  const st0 = Engine.snapshot();
  /* ¿los botones deciden aquí? (local) o viajan por internet (invitado);
     viendo el panel de otro jugador, los importes quedan deshabilitados */
  const inter = !(window.Online && Online.active) || Online.isMySeat(st0.curPi);
  const guest = window.Online && Online.active && !Online.isHost;
  if(window.Online && Online.isHost) Online.noteModal({kind:'build'});
  const draw = () => {
    const st = Engine.snapshot();
    const p = st.players[st.curPi];
    /* zonas completas del jugador: grupo → casillas */
    const owned = {};
    p.props.forEach(t => { const g = TILES[t].g; (owned[g] = owned[g] || []).push(t); });
    const fullGroups = Object.keys(owned).filter(g =>
      owned[g].length === TILES.filter(x => x.g === g).length);
    const rows = fullGroups.map(g => {
      const header = `<div class="bgroup" style="--gc:${GROUPS[g].color}">Zona ${GROUPS[g].name} · Billete de ${money(GROUPS[g].den)}</div>`;
      const items = owned[g].map(t => {
        const tt = TILES[t];
        const built = tt.built || 0;
        const cost = Engine.upgradeCost(t);
        const cur = Engine.rentOf(t);
        const next = built < 3 ? tt.rent * Engine.builtMult[built + 1] : null;
        const dots = '●'.repeat(built) + '○'.repeat(3 - built);
        const btn = built >= 3
          ? `<button class="btn alt" disabled>EDIFICIO</button>`
          : inter
            ? `<button class="btn bbuild" data-t="${t}" ${p.cash < cost ? 'disabled' : ''}>${money(cost)}</button>`
            : `<button class="btn alt" disabled>${money(cost)}</button>`;
        return `<div class="brow">
          <div class="bi">
            <div class="bn">${tt.name}</div>
            <div class="bd">Renta ${money(cur)}${next ? ' → <b>' + money(next) + '</b>' : ' · máxima'}</div>
          </div>
          <div class="bl" title="Nivel ${built}/3">${dots}</div>
          ${btn}
        </div>`;
      }).join('');
      return header + items;
    }).join('');
    openModal(`
      <h3>Construir en tus zonas</h3>
      ${fullGroups.length ? `<div class="mtext">Cada nivel cuesta <b>la mitad del precio</b> de la casilla
        y sube la renta al caer alguien: <b>casa</b> ×4, <b>2.ª casa</b> ×6, <b>edificio</b> ×10.</div>`
        : `<div class="mtext">Aún no tienes ninguna <b>zona completa</b>. Reúne todas las casillas
        del mismo color para poder construir.</div>`}
      ${rows}
      <div class="rentrows"><div><span>Efectivo de ${p.name}</span><span class="hl">${money(p.cash)}</span></div></div>
      <div class="btnrow"><button class="btn" id="m-ok">Listo</button></div>`, true);
    document.querySelectorAll('.bbuild').forEach(b => {
      b.onclick = async () => {
        if(guest){ Online.sendAction({type:'upgrade', tile:+b.dataset.t}); return; }
        const r = Engine.upgrade(Engine.snapshot().curPi, +b.dataset.t);
        if(r) await handleEvents(r.ev);
        draw();                     /* refresca el panel con el nuevo nivel */
      };
    });
    $('#m-ok').onclick = () => {
      if(guest){ Online.sendAction({type:'buildDone'}); return; }
      closeModal(); busy = false; renderAll();
    };
  };
  draw();
}
function onBuild(){
  if(busy) return;
  const st = Engine.snapshot();
  if(window.Online && Online.active){
    if(!Online.isMySeat(st.curPi)){ toast('No es tu turno: esperá al tuyo.', 'gold'); return; }
    if(!Online.isHost){ Online.sendAction({type:'build'}); return; }
  }
  showBuildModal();
}

/* ---------------- SUBASTA · esquina inferior derecha ---------------- */
/* El jugador en turno abre la subasta de una propiedad libre antes de
   tirar el dado: cada jugador puja en orden de asiento (base = mitad
   del precio, sube de a Gs. 10.000) o se retira; el mejor postor paga
   al banco y se queda la casilla. */
const AUCTION_STEP = 10000;

function onAuction(){
  if(window.Online && Online.active){ toast('Las subastas llegan pronto al modo online.', 'gold'); return; }
  if(busy) return;
  const st = Engine.snapshot();
  if(st.phase !== 'roll'){ toast('La subasta abre en tu turno, antes de tirar el dado.', 'gold'); return; }
  const libres = TILES.map((t, i) => ({t, i}))
    .filter(x => x.t.t === 'prop' && x.t.owner == null)
    .sort((a, b) => a.t.price - b.t.price);
  if(!libres.length){ toast('No quedan propiedades libres para subastar.', 'gold'); return; }
  runAuction(libres);
}

async function runAuction(libres){
  const gen = gameGen;
  busy = true; renderAction(Engine.snapshot());
  /* 1) elegir la propiedad que sale a placa */
  const pick = await pickAuctionTile(libres);
  if(gen !== gameGen){ busy = false; return; }
  if(pick == null){ busy = false; renderAll(); return; }
  const t = TILES[pick];
  /* 2) ronda de pujas en orden de asiento, desde el subastador */
  const res = await biddingRound(t, gen);
  if(gen !== gameGen){ busy = false; return; }
  /* 3) adjudicación al mejor postor (o desierta) */
  if(res){
    const r = Engine.auctionAward(res.pi, pick, res.bid);
    if(r){
      await handleEvents(r.ev);
      if(Engine.snapshot().phase === 'over'){ busy = false; renderAll(); showWinnerModal(); return; }
    }
  } else {
    toast('Subasta desierta: ' + t.name + ' sigue libre.', 'gold');
  }
  busy = false; renderAll();
}

function pickAuctionTile(libres){
  return new Promise(res => {
    openModal(`
      <h3>Casa de subastas</h3>
      <div class="mtext">Elegí la propiedad libre que sale a placa:</div>
      <div class="alist">
        ${libres.map(x => `<button class="abtn" data-i="${x.i}">
          <span class="adot" style="background:${GROUPS[x.t.g].color}"></span>
          <span class="an">${x.t.name}</span>
          <span class="ap">${money(x.t.price)}</span>
        </button>`).join('')}
      </div>
      <div class="btnrow"><button class="btn alt" id="m-cancel">Cancelar</button></div>`, true);
    document.querySelectorAll('#modal .abtn').forEach(b => {
      b.onclick = () => { closeModal(); Sfx.click(); res(+b.dataset.i); };
    });
    $('#m-cancel').onclick = () => { closeModal(); Sfx.click(); res(null); };
  });
}

function bidOffer(t, bid, leaderName, p, canBid){
  return new Promise(res => {
    const g = GROUPS[t.g];
    const next = bid === 0 ? Math.floor(t.price / 2) : bid + AUCTION_STEP;
    openModal(`
      <div class="deedhead" style="background:${g.color}">
        <div class="g">Subasta · Zona ${g.name} · Billete de ${money(g.den)}</div>
        <div class="n">${t.name}</div>
        <div class="p">${bid === 0 ? 'Sin pujas — base ' + money(next) : 'Puja de ' + leaderName + ': ' + money(bid)}</div>
      </div>
      <div class="mtext">${p.name}, tu efectivo: <b>${money(p.cash)}</b></div>
      <div class="btnrow">
        ${canBid ? `<button class="btn" id="m-bid">Pujar ${money(next)}</button>` : ''}
        <button class="btn alt" id="m-out">Retirarse</button>
      </div>`, true);
    const bb = $('#m-bid');
    if(bb) bb.onclick = () => { closeModal(); Sfx.click(); res({bid:true, next}); };
    $('#m-out').onclick = () => { closeModal(); Sfx.click(); res({bid:false}); };
  });
}

async function biddingRound(t, gen){
  const st0 = Engine.snapshot();
  const order = st0.order;
  const aliveIds = st0.players.map((p, i) => p.alive ? i : null).filter(v => v !== null);
  let bid = 0, leader = null;
  const retired = new Set();
  let k = Math.max(0, order.indexOf(st0.curPi));
  for(let guard = 0; guard < 300; guard++){
    const pi = order[k % order.length]; k++;
    const snap = Engine.snapshot();
    if(snap.phase === 'over' || gen !== gameGen) return null;
    const p = snap.players[pi];
    if(!p.alive || retired.has(pi)) continue;
    const next = bid === 0 ? Math.floor(t.price / 2) : bid + AUCTION_STEP;
    const rivals = aliveIds.filter(q => !retired.has(q) && q !== pi && snap.players[q].cash >= next);
    const canBid = p.cash >= next;
    if(!canBid && !rivals.length) return null;                    // nadie solvente: desierta
    if(bid > 0 && !rivals.length) return {pi, bid, who:p.name};   // queda un solo postor
    const r = await bidOffer(t, bid, leader !== null ? snap.players[leader].name : null, p, canBid);
    if(gen !== gameGen) return null;
    if(r.bid){ bid = r.next; leader = pi; }
    else {
      retired.add(pi);
      const pending = aliveIds.filter(q => !retired.has(q));
      if(!pending.length) return bid > 0 ? {pi:leader, bid, who:Engine.snapshot().players[leader].name} : null;
      if(pending.length === 1 && bid > 0)
        return {pi:pending[0], bid, who:Engine.snapshot().players[pending[0]].name};
    }
  }
  return bid > 0 && leader !== null ? {pi:leader, bid, who:Engine.snapshot().players[leader].name} : null;
}

function showRules(){
  openModal(`
    <h3>Reglas de El Banquero</h3>
    <div class="rulegrid">
      <div class="rulecard"><span class="rt">Objetivo</span>Ser el primero en alcanzar el patrimonio neto
        objetivo (efectivo + propiedades). También gana el último en pie o el de mayor patrimonio al
        agotarse las rondas.</div>
      <div class="rulecard"><span class="rt">Movimiento</span>Recorrido antihorario desde la <b>SALIDA</b>.
        Con 1 dado un <b>6</b> da otra tirada; con 2 dados, los <b>dobles</b>. Tres seguidas →
        <b>Tacumbú</b>. Al pasar por la salida cobrás <b>${money(SALARY)}</b>.</div>
      <div class="rulecard"><span class="rt">Propiedades</span>Caí en una libre: comprá o quedará libre.
        Propiedad ajena: pagás renta, <b>doble</b> si el dueño tiene la zona completa. Cada zona lleva el
        color de un billete (Gs. 2.000 a Gs. 100.000).</div>
      <div class="rulecard"><span class="rt">Construcciones</span>Con <b>zona completa</b> construís antes
        de tirar: cada nivel cuesta la mitad del precio — <b>casa</b> ×4, <b>2.º casa</b> ×6,
        <b>edificio</b> ×10 la renta. Cuentan en tu patrimonio; si quiebrás, vuelven al banco.</div>
      <div class="rulecard"><span class="rt">Tacumbú</span>Única cárcel, esquina superior derecha: perdés
        el turno o pagás <b>${money(JAIL_FINE)}</b> de fianza para salir al instante.</div>
      <div class="rulecard"><span class="rt">Ueno Bank</span>La casilla verde de la columna derecha sortea:
        <b>mocachino</b> +${money(15000)}, <b>Masivo bro</b> +${money(100000)}, <b>intereses</b>
        −${money(25000)} a −${money(60000)}, <b>Inforcom</b> −${money(200000)}… o el golpe del <b>BCP</b>:
        congela TODO tu efectivo ${BCP_ROUNDS} rondas.</div>
      <div class="rulecard"><span class="rt">Subasta</span>Desde la esquina inferior derecha, antes de
        tirar: subastás una propiedad libre. Base = mitad del precio; pujas suben de a
        <b>${money(AUCTION_STEP)}</b>; el mejor postor paga al banco.</div>
      <div class="rulecard"><span class="rt">Bote</span>Impuestos, multas y fianzas se acumulan. Quien cae
        en la <b>Plaza Uruguaya</b> se lo lleva TODO.</div>
      <div class="rulecard gwide"><span class="rt">Bancarrota e inactividad</span>Bancarrota: patrimonio ≤
        Gs. 0 o efectivo por debajo de <b>${money(DEBT_LIMIT)}</b>; las propiedades vuelven al banco. Si
        activaste el temporizador, un jugador sin actuar es expulsado y pierde todo.</div>
    </div>
    <div class="btnrow"><button class="btn" id="m-ok">Entendido</button></div>`);
  $('#modal').classList.add('rules');   /* grilla compacta: sin barra de desplazamiento */
  $('#m-ok').onclick = closeModal;
}

/* ---------------- TEMPORIZADOR DE INACTIVIDAD ---------------- */
let idleDeadline = 0, idleInt = null, idleT = 0, idlePausedLeft = null;
function armIdleTick(){
  idleInt = setInterval(() => {
    if(busy){ idleDeadline = Date.now() + idleT * 1000; return; }
    const snap = Engine.snapshot();
    if(snap.phase === 'over'){ clearInterval(idleInt); idleInt = null; return; }
    const left = Math.max(0, Math.ceil((idleDeadline - Date.now()) / 1000));
    const el = document.getElementById('tmr-' + snap.curPi);
    if(el) el.textContent = ' ⏱' + left + 's';
    if(left <= 0){
      clearInterval(idleInt); idleInt = null;
      const r = Engine.expel(snap.curPi);
      if(r) handleEvents(r.ev, true);
      renderAll();
    }
  }, 250);
}
function startIdleTimer(st){
  if(window.Online && Online.active && !Online.isHost) return;   /* solo el anfitrión cronometra */
  if(idleInt){ clearInterval(idleInt); idleInt = null; }
  idlePausedLeft = null;
  idleT = st.cfg.idle || 0;
  if(!idleT || st.phase === 'over' || !st.players[st.curPi].alive) return;
  idleDeadline = Date.now() + idleT * 1000;
  armIdleTick();
}
function stopIdleTimer(){
  if(idleInt){ clearInterval(idleInt); idleInt = null; }
  idlePausedLeft = null;
}
/* Con la app/pestaña en segundo plano el reloj se pausa: al volver,
   el jugador recupera el tiempo que le quedaba en lugar de ser expulsado. */
document.addEventListener('visibilitychange', () => {
  if(document.hidden){
    if(idleInt){
      clearInterval(idleInt); idleInt = null;
      idlePausedLeft = Math.max(0, idleDeadline - Date.now());
    }
  } else if(idlePausedLeft !== null && idleT){
    idleDeadline = Date.now() + idlePausedLeft;
    idlePausedLeft = null;
    armIdleTick();
  }
});

/* ---------------- FLUJO PRINCIPAL ---------------- */
let busy = false;
let gameGen = 0;   // se incrementa al iniciar partida: invalida los flujos asíncronos de la anterior

async function animatePath(pi, path, ev = []){
  const salaryEv = ev.find(e => e.type === 'cash' && (e.reason || '').includes('Salario'));
  for(let k = 0; k < path.length; k++){
    tokenTrail(pi);                        /* estela: copia en el punto anterior (vídeo 1) */
    const pos = path[k];
    const c = tileCenter(pos);            /* centro exacto de la casilla visitada */
    const el = document.getElementById('tok-' + pi);
    if(el && c){
      el.style.left = c.x + 'px';
      el.style.top  = c.y + 'px';
    }
    hopToken(pi);                          /* salto en arco, como en el vídeo 1 */
    Sfx.step();                            /* toque sonoro por casilla recorrida */
    if(pos === 0 && salaryEv){
      coinBurst(pi);
      /* el toast del salario ya viaja dentro del paso del guion: no duplicar */
      if(window.Online) Online.silentRec(true);
      toast(salaryEv.reason + ': +' + money(SALARY), 'good');
      if(window.Online) Online.silentRec(false);
      Sfx.gain();
      log('💰 <b>' + Engine.snapshot().players[pi].name + '</b> cobra salario en SALIDA');
      salaryEv.done = true;
    }
    await sleep(300);
  }
  hopToken(pi, true);                      /* rebote de aterrizaje */
  if(salaryEv && !salaryEv.done){
    coinBurst(pi);
    if(window.Online) Online.silentRec(true);
    toast(salaryEv.reason, 'good'); Sfx.gain();
    if(window.Online) Online.silentRec(false);
  }
  renderTokens(Engine.snapshot());
}

/* ---------------- FIN DE TURNO AUTOMÁTICO ---------------- */
/* Tras resolver la jugada, el turno pasa solo: una pausa breve deja leer
   qué pasó (toasts) y el siguiente jugador recibe el mando directamente.
   Sin botón "Terminar turno". */
async function autoEndTurn(gen){
  const st = Engine.snapshot();
  if(st.phase === 'over'){ busy = false; renderAll(); showWinnerModal(); return; }
  if(st.phase !== 'end'){ busy = false; renderAll(); return; }
  renderAll();                        /* muestra "terminó su jugada…" */
  await sleep(1100);
  if(gen !== gameGen) return;
  const r = Engine.endTurn();
  if(r) await handleEvents(r.ev, true);
  if(gen !== gameGen) return;
  busy = false;
  if(Engine.snapshot().phase === 'over'){ renderAll(); showWinnerModal(); return; }
  renderAll();
}

async function onRoll(remote = false){
  if(busy) return;
  if(window.Online && Online.active && !remote){
    if(!Online.isMySeat(Engine.snapshot().curPi)){ toast('No es tu turno: esperá al tuyo.', 'gold'); return; }
    if(!Online.isHost){ Online.sendAction({type:'roll'}); return; }
  }
  busy = true; renderAction(Engine.snapshot());
  const gen = gameGen;
  const st0 = Engine.snapshot();
  const pi = st0.curPi;
  const pname = st0.players[pi].name;
  const res = Engine.rollDice();               /* el número se decide ANTES de animar */
  if(!res){ busy = false; renderAll(); return; }
  /* el paso del guion sale ya: los invitados animan su tirada en paralelo */
  if(window.Online && Online.isHost){
    Online.recStep({k:'roll', d1:res.d1, d2:res.d2, pi, path:res.path, ev:res.ev});
    Online.flushPublish();
  }
  const dice = [...document.querySelectorAll('#dome .die:not(.hidden)')];
  nudgeDice();                                 /* se acomoda en un punto nuevo (vídeo) */
  /* el cubo gira durante TODO el sonido y planta el número al acabarse,
     sin rebote final: la ficha arranca inmediatamente */
  const soundMs = Sfx.diceDur();
  Sfx.dice();
  await Promise.all(dice.map((d, i) => tumbleTo(d, i === 0 ? res.d1 : res.d2, soundMs)));
  if(gen !== gameGen) return;
  log('🎲 <b>' + pname + '</b> saca ' + (res.d2 ? res.d1 + ' + ' + res.d2 + ' = ' + (res.d1 + res.d2) : res.d1));

  if(res.triples){
    toast('¡Tres tiradas máximas seguidas! Directo a Tacumbú.', 'bad');
    await handleEvents(res.ev);
    if(gen !== gameGen) return;
    await autoEndTurn(gen);
    return;
  }

  await animatePath(pi, res.path, res.ev);
  if(gen !== gameGen) return;
  let r = Engine.resolveLanding();
  let guard = 0;
  while(guard++ < 8){
    const stepEv = r.ev.find(e => e.type === 'stepmove');
    await handleEvents(r.ev);
    if(gen !== gameGen) return;
    if(r.offer){ showBuyModal(r.offer.tile); return; }   // busy sigue true hasta decidir
    if(r.over) break;
    if(r.chain === undefined) break;
    if(stepEv && r.chain !== 0){
      await animatePath(pi, stepEv.path, r.ev);
      if(gen !== gameGen) return;
    } else {
      renderTokens(Engine.snapshot());
      await sleep(430);
      if(gen !== gameGen) return;
    }
    r = Engine.resolveLanding();
  }
  if(r && r.over){ busy = false; renderAll(); showWinnerModal(); return; }
  await autoEndTurn(gen);                       /* el turno pasa solo */
}

async function onPayBail(remote = false){
  if(busy) return;
  if(window.Online && Online.active && !remote){
    if(!Online.isMySeat(Engine.snapshot().curPi)){ toast('No es tu turno: esperá al tuyo.', 'gold'); return; }
    if(!Online.isHost){ Online.sendAction({type:'bail'}); return; }
  }
  busy = true; renderAction(Engine.snapshot());
  const gen = gameGen;
  const r = Engine.payBail();
  if(r){
    if(gen !== gameGen) return;
    await handleEvents(r.ev, true);
    if(gen !== gameGen) return;
    toast('Sale de Tacumbú: ¡tira!', 'good');
  }
  busy = false; renderAll();
}

async function onSkipJail(remote = false){
  if(busy) return;
  if(window.Online && Online.active && !remote){
    if(!Online.isMySeat(Engine.snapshot().curPi)){ toast('No es tu turno: esperá al tuyo.', 'gold'); return; }
    if(!Online.isHost){ Online.sendAction({type:'skip'}); return; }
  }
  busy = true; renderAction(Engine.snapshot());
  const gen = gameGen;
  const r = Engine.skipJailTurn();
  if(r) await handleEvents(r.ev, true);
  if(gen !== gameGen) return;
  busy = false; renderAll();
}
