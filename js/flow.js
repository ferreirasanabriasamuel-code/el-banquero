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
/* Sistema de Plato: la subasta ES el intercambio de casillas. El panel
   tiene una ranura por jugador: cada uno pone UNA casilla de su propiedad;
   cuando las dos ranuras están llenas el canje se completa y el banco paga
   TRADE_BONUS a cada uno. PASAR cancela; la cuenta regresiva cierra sola. */
const SUBASTA_SECS = 90;
const sbEsc = s => String(s).replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
let SB = null;        /* estado del panel {pa, pb, ta, tb, mode, id, deadline} */
let sbTick = null;    /* intervalo de la cuenta regresiva */

function onAuction(){
  if(busy) return;
  const st = Engine.snapshot();
  /* se abre en TU turno, antes de tirar o cumpliendo condena en Tacumbú */
  if(st.phase !== 'roll' && st.phase !== 'jail'){
    toast('La subasta abre en tu turno, antes de tirar el dado.', 'gold'); return;
  }
  if(window.Online && Online.active && !Online.isMySeat(st.curPi)){
    toast('No es tu turno: esperá al tuyo.', 'gold'); return;
  }
  const me = st.players[st.curPi];
  if(!me.props.length){ toast('No tenés casillas para poner en la subasta.', 'gold'); return; }
  const rivals = st.order.filter(i => i !== st.curPi && st.players[i].alive && st.players[i].props.length);
  if(!rivals.length){ toast('Ningún rival tiene casillas para la subasta.', 'gold'); return; }
  subastaOpen({pa:st.curPi, pb:rivals.length === 1 ? rivals[0] : null,
               ta:null, tb:null, mode:'pick', id:0});
}

/* arranca el panel (o cambia de fase) con cuenta regresiva nueva */
function subastaOpen(sb){
  SB = Object.assign({}, sb, {deadline:Date.now() + SUBASTA_SECS * 1000});
  sbStopTick();
  drawSubasta();
  sbTick = setInterval(() => {
    if(!SB){ sbStopTick(); return; }
    const left = Math.max(0, Math.ceil((SB.deadline - Date.now()) / 1000));
    const el = document.getElementById('sb-count');
    if(el) el.textContent = 'La subasta cierra en ' + left + ' seg';
    if(left <= 0) subastaCancel(true);
  }, 1000);
}
function sbStopTick(){ if(sbTick){ clearInterval(sbTick); sbTick = null; } }

/* cierra el panel sin tocar el canal */
function subastaClose(){
  sbStopTick();
  SB = null; closeModal(); busy = false;
}

/* PASAR o cierre por tiempo: avisa al otro extremo si la subasta viajó */
function subastaCancel(timeout = false){
  const sb = SB; if(!sb) return;
  subastaClose();
  toast(timeout ? 'La subasta se cerró por tiempo.' : 'Pasaste la subasta.', 'gold');
  if(window.Online && Online.active && (sb.mode === 'wait' || sb.mode === 'answer')){
    Online.subastaCancel(sb.mode, sb.id);
  }
}

/* chip de casilla: nombre corto + renta de hoy */
function sbChipTile(i, sel){
  return `<button class="sbchip${sel ? ' sel' : ''}" data-t="${i}">
    <span>${tileName(i)}</span><span class="sbrent">${money(Engine.rentOf(i))}</span></button>`;
}

/* dibuja el panel según la fase:
   pick   → quien abre elige rival (si hace falta) y pone SU casilla
   pass   → modo local: se le pasa el dispositivo al rival para su casilla
   wait   → online: propuesta enviada, esperando la casilla del rival
   answer → online: al rival le llegó la propuesta y pone su casilla */
function drawSubasta(){
  const sb = SB; if(!sb) return;
  const st = Engine.snapshot();
  const A = st.players[sb.pa];
  const B = sb.pb === null || sb.pb === undefined ? null : st.players[sb.pb];
  const rivals = st.order.filter(i => i !== sb.pa && st.players[i].alive && st.players[i].props.length);

  /* ranura del proponente (siempre arranca llenándose) */
  let slotA;
  if(sb.mode === 'pick'){
    slotA = `<div class="sbwho"><i style="background:${A.color}"></i>${sbEsc(A.name)} · vos</div>
      <div class="sbhint">Elegí tu casilla</div>
      <div class="sbchips">${A.props.map(i => sbChipTile(i, i === sb.ta)).join('')}</div>`;
  } else {
    slotA = `<div class="sbwho"><i style="background:${A.color}"></i>${sbEsc(A.name)}</div>
      <div class="sbtile" style="--tc:${A.color}">${tileName(sb.ta)}<span>${money(Engine.rentOf(sb.ta))}</span></div>`;
  }

  /* ranura del rival */
  let slotB;
  if(sb.pb === null || sb.pb === undefined){
    slotB = `<div class="sbwho">¿Con quién subastás?</div>
      <div class="sbhint">Tocá un jugador</div>
      <div class="sbchips">${rivals.map(i =>
        `<button class="sbchip pchip" data-p="${i}"><span>${sbEsc(st.players[i].name)}</span>
         <span class="sbrent">${st.players[i].props.length} casilla(s)</span></button>`).join('')}</div>`;
  } else if(sb.mode === 'pick'){
    slotB = `<div class="sbwho"><i style="background:${B.color}"></i>${sbEsc(B.name)}</div>
      <div class="sbhint">Pone su casilla cuando confirmes vos</div>`;
  } else if(sb.mode === 'pass'){
    slotB = `<div class="sbwho"><i style="background:${B.color}"></i>${sbEsc(B.name)}</div>
      <div class="sbhint">Elegí tu casilla</div>
      <div class="sbchips">${B.props.map(i => sbChipTile(i, i === sb.tb)).join('')}</div>`;
  } else if(sb.mode === 'wait'){
    slotB = `<div class="sbwho"><i style="background:${B.color}"></i>${sbEsc(B.name)}</div>
      <div class="sbwait">Esperando a ${sbEsc(B.name)}…</div>`;
  } else {   /* answer: la casilla del proponente ya está puesta */
    slotB = sb.tb === null || sb.tb === undefined
      ? `<div class="sbwho"><i style="background:${B.color}"></i>${sbEsc(B.name)} · vos</div>
         <div class="sbhint">${sbEsc(A.name)} ya puso su casilla: elegí la tuya</div>
         <div class="sbchips">${B.props.map(i => sbChipTile(i, i === sb.tb)).join('')}</div>`
      : `<div class="sbwho"><i style="background:${B.color}"></i>${sbEsc(B.name)}</div>
         <div class="sbtile" style="--tc:${B.color}">${tileName(sb.tb)}<span>${money(Engine.rentOf(sb.tb))}</span></div>`;
  }

  /* en modo answer la ranura del proponente es la fija y la del rival la activa;
     se muestra primero la del que abre el panel para no confundir */
  const first = (sb.mode === 'answer') ? slotB : slotA;
  const second = (sb.mode === 'answer') ? slotA : slotB;

  const okOn = (sb.mode === 'pick' && sb.pb !== null && sb.pb !== undefined && sb.ta !== null)
            || (sb.mode === 'pass' && sb.tb !== null)
            || (sb.mode === 'answer' && sb.tb !== null);
  const okLabel = sb.mode === 'answer' ? 'COMPLETAR SUBASTA' : 'CONFIRMAR';

  openModal(`
    <h3>SUBASTA</h3>
    <div class="mtext">Cada uno pone una casilla suya; al completarla, el banco paga
      <b>${money(TRADE_BONUS)}</b> a cada uno.</div>
    ${sb.mode === 'pass' ? `<div class="sbhand">📲 Pasale el dispositivo a <b>${sbEsc(B.name)}</b></div>` : ''}
    <div class="sbgrid">
      <div class="sbslot">${first}</div>
      <div class="sbslot">${second}</div>
    </div>
    <div class="sbcount" id="sb-count">La subasta cierra en ${SUBASTA_SECS} seg</div>
    <div class="btnrow">
      <button class="btn alt sbpass" id="sb-pass">PASAR</button>
      <button class="btn sbok" id="sb-ok" ${okOn ? '' : 'disabled'}>${okLabel}</button>
    </div>`, true);

  /* selección de jugador (¿con quién?) */
  document.querySelectorAll('#modal .pchip').forEach(b => {
    b.onclick = () => { Sfx.click(); sbSelect('p', +b.dataset.p); };
  });
  /* selección de casillas propias */
  document.querySelectorAll('#modal .sbchip[data-t]').forEach(b => {
    b.onclick = () => { Sfx.click(); sbSelect('t', +b.dataset.t); };
  });
  $('#sb-pass').onclick = () => { Sfx.click(); subastaCancel(false); };
  $('#sb-ok').onclick = sbConfirm;
}

/* una selección dentro del panel: jugador rival o casilla */
function sbSelect(kind, val){
  const sb = SB; if(!sb) return;
  if(kind === 'p' && sb.mode === 'pick'){ sb.pb = val; drawSubasta(); return; }
  if(kind === 't'){
    if(sb.mode === 'pick' && sb.ta !== val){ sb.ta = val; drawSubasta(); return; }
    if((sb.mode === 'pass' || sb.mode === 'answer') && sb.tb !== val){ sb.tb = val; drawSubasta(); return; }
  }
}

/* CONFIRMAR según la fase */
function sbConfirm(){
  const sb = SB; if(!sb) return;
  Sfx.click();
  if(sb.mode === 'pick'){
    if(sb.pb === null || sb.pb === undefined || sb.ta === null) return;
    if(window.Online && Online.active){
      const sent = Online.subastaOffer(sb.pa, sb.pb, sb.ta);
      if(sent !== false){ sb.mode = 'wait'; drawSubasta(); }
      return;
    }
    sb.mode = 'pass'; drawSubasta();   /* local: se le pasa el dispositivo */
  } else if(sb.mode === 'pass'){
    if(sb.tb === null) return;
    subastaApply();
  } else if(sb.mode === 'answer'){
    if(sb.tb === null) return;
    subastaClose();                     /* el que responde cierra su panel */
    Online.subastaAnswer(sb.id, sb.tb);
  }
}

/* canje local (mismo dispositivo y anfitrión que aplica): cierra el panel,
   aplica el motor y festeja */
async function subastaApply(){
  const sb = SB; if(!sb) return;
  const {pa, pb, ta, tb} = sb;
  const gen = gameGen;
  subastaClose();
  busy = true;
  const r = Engine.tradeProps(pa, pb, ta, tb);
  if(!r){ busy = false; renderAll(); return; }
  await handleEvents(r.ev);
  if(gen !== gameGen) return;
  toast('¡SUBASTA COMPLETA! El banco paga ' + money(TRADE_BONUS) + ' a cada uno.', 'good');
  busy = false; renderAll();
}

/* el otro extremo resolvió la subasta (llega desde Online): ok = se completó */
function subastaResolved(ok, cancelled){
  const sb = SB;
  subastaClose();
  if(!ok){
    toast(cancelled ? 'La subasta fue cancelada.' : 'La otra parte pasó la subasta.', 'bad');
    renderAll();
  }
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
      <div class="rulecard"><span class="rt">Subasta</span>Desde la esquina inferior derecha,
        en tu turno (antes de tirar o desde Tacumbú): panel con una ranura por jugador — cada uno
        pone <b>una casilla suya</b> y al completarse las dos el banco paga
        <b>${money(TRADE_BONUS)}</b> a cada uno. Podés <b>PASAR</b> o esperar el cierre por tiempo.</div>
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
