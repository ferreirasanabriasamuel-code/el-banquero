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
      let done = false;
      const fin = () => {
        if(done) return;
        done = true;
        if($('#modal').dataset.gcard === id) closeModal();
        res();
      };
      $('#m-ok').onclick = () => { Sfx.click(); fin(); };   /* o tocá ¡Vale! */
      setTimeout(fin, 2400);
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
/* ================= SUBASTA · sistema Bankroll de Plato ================= */
/* Al CAER en la casilla de SUBASTA se abre el intercambio y el turno queda
   bloqueado hasta resolver. Flujo:
   1) El que cayó ve sus propiedades parpadear en el tablero y ofrece UNA
      (o cancela).
   2) Los rivales ven la casilla ofertada (marco dorado) y contraofertan con
      una suya — todos a la vez, dentro del mismo panel.
   3) El que cayó revisa las ofertas y ACEPTA la que más le convenga
      (canje + bono para ambos) o CANCELA.
   La cuenta regresiva (~90 s) cierra sola. */
const SUBASTA_SECS = 90;
const sbEsc = s => String(s).replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
let SB = null;      /* {pa, ta, offers:{pb->tb}, decided, deadline, myOffer} */
let sbTick = null;  /* intervalo de la cuenta regresiva */

/* ---- helpers del motor auxiliares ---- */
function sbRivals(st, pa){
  return st.order.filter(i => i !== pa && st.players[i].alive && st.players[i].props.length);
}

/* arranca la subasta al caer en la casilla (la abre el anfitrión/turno local
   y la reparten los invitados cuando les llega el paquete) */
function subastaOpen(pa){
  const st = Engine.snapshot();
  SB = {
    pa, ta:null, offers:{}, decided:false, open:true,
    deadline: Date.now() + SUBASTA_SECS * 1000,
    online: !!(window.Online && Online.active),
    amHost: !!(window.Online && Online.isHost),
    id: 0,
  };
  if(SB.online && SB.amHost){ SB.id = ++sbTradeSeq; Online.subastaBroadcast(SB.id, pa); }
  sbStopTick();
  drawSubasta();
  sbTick = setInterval(() => {
    if(!SB){ sbStopTick(); return; }
    const left = Math.max(0, Math.ceil((SB.deadline - Date.now()) / 1000));
    const el = document.getElementById('sb-count');
    if(el) el.innerHTML = 'Subasta cierra en <b>' + left + '</b> seg';
    if(left <= 0) subastaCancel(true);
  }, 1000);
}
function sbStopTick(){ if(sbTick){ clearInterval(sbTick); sbTick = null; } }

/* cierra el panel y despega el parpadeo de las casillas */
function subastaClose(){
  sbStopTick();
  SB = null;
  const w = document.getElementById('subasta-wrap');
  if(w) w.remove();
  document.querySelectorAll('.tile.sbblink').forEach(el => el.classList.remove('sbblink'));
  busy = false;
}

/* CANCELAR (o cierre por tiempo): sin canje, el turno sigue */
function subastaCancel(timeout = false){
  const sb = SB; if(!sb) return;
  Sfx.click();
  if(sb.online){
    if(sb.amHost || sb.pa === myPi()) Online.subastaStop();   /* el que abrió la corta para todos */
  }
  subastaFinishLocal(false, timeout ? 'La subasta se cerró por tiempo.' : 'Subasta cancelada.');
}

/* aplica el cierre local (anfitrión o modo local): termina la fase auction */
async function subastaFinishLocal(applied, msg){
  const sb = SB; if(!sb) return;
  subastaClose();
  busy = true;
  const r = Engine.tradeClose();
  if(r) await handleEvents(r.ev);
  if(msg) toast(msg, applied ? 'good' : 'gold');
  busy = false; renderAll();
  await autoEndTurnSafe();
}

/* autoEndTurn protegido: la fase tras tradeClose es 'end' o 'roll' (6 extra) */
async function autoEndTurnSafe(){
  const st = Engine.snapshot();
  if(!st) return;
  if(st.phase === 'over'){ showWinnerModal(); return; }
  if(st.phase === 'end') await autoEndTurn(gameGen);
  else renderAll();
}

/* el iniciador acepta la oferta de un rival: canje + bono para ambos */
async function subastaAccept(pb){
  const sb = SB; if(!sb || sb.decided) return;
  const tb = sb.offers[pb];
  if(tb === undefined || tb === null) return;
  Sfx.click();
  sb.decided = true;
  const finishLocal = sb.amHost || !sb.online;
  if(finishLocal){
    const {pa, ta} = sb;
    subastaClose();
    busy = true;
    if(sb.online) Online.subastaAcceptTrade(pa, pb, ta, tb);
    const r = Engine.tradeProps(pa, pb, ta, tb);
    if(r) await handleEvents(r.ev);
    toast('¡SUBASTA COMPLETA! El banco paga ' + money(TRADE_BONUS) + ' a cada uno.', 'good');
    busy = false; renderAll();
    await autoEndTurnSafe();
  } else {
    /* invitado que cayó en la subasta: pide el canje al anfitrión */
    subastaClose();
    Online.subastaAcceptTrade(sb.pa, pb, sb.ta, tb);
  }
}

/* panel flotante — estructura visual del video de Plato: una ranura blanca
   con la ficha del dueño asomando a la izquierda, PASAR arriba a la derecha,
   ✓ dorado al costado, línea de espera y al pie bono + cuenta regresiva */
function sbMount(){
  let w = document.getElementById('subasta-wrap');
  if(!w){
    w = document.createElement('div');
    w.id = 'subasta-wrap';
    w.innerHTML = '<div id="sbp"></div>';
    document.body.appendChild(w);
  }
  return w;
}

/* ranura: ficha del jugador al costado + cuerpo según estado */
function sbSlot(color, name, bodyHtml, tap){
  return `<div class="sbp-slot${tap ? ' tap' : ''}"${tap ? ' data-act="open"' : ''}>
    <span class="sbp-tok" style="--c:${color}"></span>
    <div class="sbp-name">${sbEsc(name)}</div>
    ${bodyHtml}
  </div>`;
}
/* lista de casillas para elegir dentro de la ranura */
function sbRows(items){
  return `<div class="sbp-list">` + items.map(r =>
    `<button class="sbp-row${r.sel ? ' sel' : ''}" data-t="${r.t}">
       <span>${r.name}</span><span class="sbp-rent">${r.sub}</span>
     </button>`).join('') + `</div>`;
}
/* casilla puesta: nombre + renta de hoy */
function sbPropHtml(i){
  return `<div class="sbp-prop"><b>${tileName(i)}</b><span>renta ${money(Engine.rentOf(i))}</span></div>`;
}

/* ¿la ficha local es el iniciador de la subasta? (en línea, por asiento) */
function myPi(){
  const st = Engine.snapshot();
  if(!st) return -1;
  if(!(window.Online && Online.active)) return st.curPi;
  return Online.isHost ? 0 : (Online.mySlot !== undefined ? Online.mySlot : -1);
}

/* dibuja el panel según el papel de esta pantalla */
function drawSubasta(){
  const sb = SB; if(!sb) return;
  const st = Engine.snapshot();
  const A = st.players[sb.pa];
  const me = myPi();
  const iAmA = me === sb.pa;
  const open = !!sb.open;

  /* ranura del iniciador: su casilla en oferta (o la elige tocando) */
  let top;
  if(sb.ta !== null && sb.ta !== undefined){
    top = sbSlot(A.color, A.name, sbPropHtml(sb.ta), false);
  } else if(iAmA){
    const rows = A.props.map(i => ({t:i, name:tileName(i), sub:money(Engine.rentOf(i))}));
    top = sbSlot(A.color, A.name + ' · vos',
      open ? sbRows(rows) : '<div class="sbp-add">Tocá acá para ofrecer tu casilla</div>', true);
  } else {
    top = sbSlot(A.color, A.name, '<div class="sbp-emp">eligiendo su casilla…</div>', false);
  }

  /* cuerpo central: según papel */
  let mid;
  if(iAmA){
    /* iniciador: lista de contraofertas recibidas (aceptar la que quieras) */
    const offers = Object.keys(sb.offers).map(k => ({pb:+k, tb:sb.offers[k]}));
    if(sb.ta === null || sb.ta === undefined){
      mid = `<div class="sbp-own">Primero ofrecé tu casilla (la de arriba).</div>`;
    } else if(offers.length){
      mid = `<div class="sbp-offers">` + offers.map(o => {
        const B = st.players[o.pb];
        return `<button class="sbp-off" data-accept="${o.pb}">
          <span class="sbp-tok mini" style="--c:${B.color}"></span>
          <span class="sbp-offtxt"><b>${sbEsc(B.name)}</b> ofrece <b>${tileName(o.tb)}</b>
            <span class="sbp-rent">renta ${money(Engine.rentOf(o.tb))}</span></span>
          <span class="sbp-offbtn">ACEPTAR</span>
        </button>`;
      }).join('') + `</div>`;
    } else {
      mid = `<div class="sbp-own">Esperando contraofertas de los rivales…</div>`;
    }
  } else {
    /* rival: elegís tu contraoferta (una casilla tuya) */
    const B = st.players[me];
    const passed = sb.passed && sb.passed[me];
    if(B && B.props.length && !passed){
      const mine = (sb.offers[me] !== undefined);
      const rows = B.props.map(i => ({t:i, name:tileName(i), sub:money(Engine.rentOf(i)), sel:i === sb.offers[me]}));
      mid = `<div class="sbp-own">${mine ? 'Tu contraoferta: <b>' + tileName(sb.offers[me]) + '</b> — tocá otra para cambiarla' : 'Contraofertá con una casilla tuya'}</div>` +
        (mine && !open ? '' : sbRows(rows));
    } else {
      mid = `<div class="sbp-own">${passed ? 'Pasaste esta subasta: esperando que ' + sbEsc(A.name) + ' decida…' : 'No tenés casillas para contraofertar.'}</div>`;
    }
  }

  /* pie y botones: PASAR arriba; el iniciador tiene ✕ para cancelar la
     subasta; el rival con contraoferta hecha ve su ✓ dorado */
  sbMount().querySelector('#sbp').innerHTML = `
    <div class="sbp-main">
      <div class="sbp-slots">${top}
        <div class="sbp-slot">
          <div class="sbp-name">CONTRAOFERTAS</div>
          ${mid}
        </div>
      </div>
      <div class="sbp-side">
        <button class="sbp-pass" id="sb-pass">PASAR</button>
        ${iAmA ? `<button class="sbp-ok sbp-cancel" id="sb-cancel" title="Cancelar subasta">✕</button>`
               : (sb.offers[me] !== undefined
                   ? `<button class="sbp-ok" id="sb-ok" title="Contraoferta lista">✓</button>` : '')}
      </div>
    </div>
    <div class="sbp-wait">${iAmA
      ? (sb.ta === null ? 'Elegí tu casilla y esperá las contraofertas…' : 'Tocá ACEPTAR en la oferta que más te convenga')
      : 'Contraofertá con una casilla tuya antes de que cierre'}</div>
    <div class="sbp-foot">
      <div class="sbp-bonus"><b>${money(TRADE_BONUS)}</b> de bono para ambos jugadores al completar la subasta</div>
      <div class="sbp-count" id="sb-count">Subasta cierra en <b>${SUBASTA_SECS}</b> seg</div>
    </div>`;

  /* clicks: elegir casilla (iniciador o rival), aceptar oferta, cancelar */
  document.querySelectorAll('#subasta-wrap .sbp-row[data-t]').forEach(b => {
    b.onclick = e => {
      e.stopPropagation();
      Sfx.click();
      const t = +b.dataset.t;
      if(iAmA){
        sb.ta = t; sb.open = false; sbBlink([t]);
        if(sb.online) Online.subastaOfferTa(t);   /* la oferta viaja a todos */
      }
      else { sb.offers = sb.offers || {}; sb.offers[me] = t; sb.open = false;
             if(sb.online) Online.subastaCounter(sb.id, t); }
      drawSubasta();
    };
  });
  document.querySelectorAll('#subasta-wrap .sbp-off[data-accept]').forEach(b => {
    b.onclick = e => { e.stopPropagation(); subastaAccept(+b.dataset.accept); };
  });
  const slot = document.querySelector('#subasta-wrap .sbp-slot[data-act="open"]');
  if(slot) slot.onclick = () => { Sfx.click(); sb.open = true; drawSubasta(); };
  $('#sb-pass').onclick = () => { Sfx.click(); subastaPass(); };
  const cancel = document.getElementById('sb-cancel');
  if(cancel) cancel.onclick = () => subastaCancel(false);
  const ok = document.getElementById('sb-ok');
  if(ok) ok.onclick = () => { Sfx.click(); sb.open = false; drawSubasta(); };
}

/* PASAR: iniciador = cancelar subasta; rival = no participa (sigue viendo) */
function subastaPass(){
  const sb = SB; if(!sb) return;
  const me = myPi();
  if(me === sb.pa){ subastaCancel(false); return; }
  if(sb.offers[me] !== undefined) return;   /* ya contraofertó: no puede pasar */
  sb.passed = sb.passed || {};
  sb.passed[me] = true;
  toast('Pasás esta subasta.', 'gold');
  if(sb.online) Online.subastaPass(sb.id);
  drawSubasta();
}

/* parpadeo de las casillas del iniciador mientras elige (como en el video) */
function sbBlink(tiles){
  document.querySelectorAll('.tile.sbblink').forEach(el => el.classList.remove('sbblink'));
  tiles.forEach(i => {
    const el = document.querySelector('#board .tile[data-tile="' + i + '"]');
    if(el) el.classList.add('sbblink');
  });
}

/* ---- puente con Online ---- */
let sbTradeSeq = 0;
/* llega (anfitrión → invitados) el inicio de la subasta de pa */
function subastaRecvOpen(id, pa){
  SB = {pa, ta:null, offers:{}, decided:false, open:true, online:true, amHost:false,
         deadline:Date.now() + SUBASTA_SECS * 1000, id};
  sbStopTick(); drawSubasta();
  sbTick = setInterval(() => {
    if(!SB){ sbStopTick(); return; }
    const left = Math.max(0, Math.ceil((SB.deadline - Date.now()) / 1000));
    const el = document.getElementById('sb-count');
    if(el) el.innerHTML = 'Subasta cierra en <b>' + left + '</b> seg';
    if(left <= 0) subastaCancel(true);
  }, 1000);
}
/* llega la casilla ofrecida por el iniciador */
function subastaRecvOffer(ta){ if(!SB) return; SB.ta = ta; drawSubasta(); }
/* llega la contraoferta tb del jugador pb */
function subastaRecvCounter(pb, tb){ if(!SB) return; SB.offers[pb] = tb; drawSubasta(); }
/* llega que pb pasó (sin contraoferta) */
function subastaRecvPass(pb){ if(!SB) return; SB.passed = SB.passed || {}; SB.passed[pb] = true; delete SB.offers[pb]; drawSubasta(); }
/* llegó el desenlace: cierre total (el motor ya aplicó el canje en el host) */
function subastaRecvDone(applied){
  if(!SB) return;
  subastaClose();
  if(applied) toast('¡SUBASTA COMPLETA! El banco paga ' + money(TRADE_BONUS) + ' a cada uno.', 'good');
  else toast('La subasta terminó sin canje.', 'gold');
  renderAll();
  /* el turno del jugador en línea estaba bloqueado en 'auction':
     el siguiente paquete de estado llega con la fase ya resuelta */
}

/* aplica el canje que llega resuelto desde el canal (anfitrión) */
async function applyTrade(pa, pb, ta, tb){
  const gen = gameGen;
  busy = true;
  const r = Engine.tradeProps(pa, pb, ta, tb);
  if(!r){ busy = false; renderAll(); return null; }
  await handleEvents(r.ev);
  if(gen !== gameGen) return r;
  busy = false; renderAll();
  return r;
}

function showRules(){
  openModal(`
    <h3>Reglas de El Banquero</h3>    <div class="rulegrid">
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
      <div class="rulecard"><span class="rt">Tacumbú</span>Única cárcel, esquina superior derecha: al caer
        quedás preso <b>3 rondas sí o sí</b> — ni dobles ni seises te salvan, no tirás mientras cumplís —
        o pagás <b>${money(JAIL_FINE)}</b> de fianza para salir al instante y tirar.</div>
      <div class="rulecard"><span class="rt">Ueno Bank</span>La casilla verde de la columna derecha sortea:
        <b>mocachino</b> +${money(15000)}, <b>Masivo bro</b> +${money(100000)}, <b>intereses</b>
        −${money(25000)} a −${money(60000)}, <b>Inforcom</b> −${money(200000)}… o el golpe del <b>BCP</b>:
        congela TODO tu efectivo ${BCP_ROUNDS} rondas.</div>
      <div class="rulecard"><span class="rt">Subasta</span>Al <b>caer</b> en la casa de subastas se abre el
        intercambio y el juego se detiene hasta resolverlo. Tu casilla parpadea en el tablero: tocá
        <b>una para ofrecer</b> (o PASAR). Los rivales contraofertan con casillas suyas y vos
        <b>ACEPTÁS la que más te convenga</b> (canje inmediato + <b>${money(TRADE_BONUS)}</b> de bono
        para ambos) o <b>CANCELÁS</b>. ~90 segundos y cierra sola.</div>
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
