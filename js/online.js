'use strict';
/* ================================================================
   EL BANQUERO — modo online vía Supabase Realtime (broadcast + presence).
   Un anfitrión ejecuta el motor y publica paquetes {estado + guion};
   los invitados repiten el guion (dados, recorridos, cartas, toasts)
   y envían sus acciones al anfitrión por el mismo canal. No usa
   tablas: la sala vive en el canal y muere con el anfitrión.

   Protocolo (canal "eb:<código>", evento broadcast "m"):
     invitado → anfitrión : {t:'hello'|'act'}
     anfitrión → todos    : {t:'roster'|'start'|'st'|'note'|'reject'|'lobby'|'closed'}
   El paquete "st" lleva: seq, state (snapshot del motor), steps (guion:
   {k:'roll'|'ev'|'toast'}) y modal (espejo de la decisión en curso).
   ================================================================ */
window.Online = (() => {
  const URL = 'https://wtiphurunbmzuelywzwk.supabase.co';
  const KEY = 'sb_publishable_8V1w0pGlt3U36Fz79kNVxg_RGBbFT6L';

  let sb = null, ch = null;
  let active = false, isHost = false, started = false;
  let code = '', myCid = '', myName = '', hostName = '';
  let mySlot = -1, myRejoinSlot = -1;
  let roster = [];                    // [{slot, name, cid, off?}]
  let opts = null;                    // {target, rounds, dice} elegidos por el anfitrión
  let seq = 0, lastSeq = 0;
  let rec = [], pendingModal = null;  // guion pendiente y modal espejo (anfitrión)
  let pubTimer = null, evHandling = false, silent = false, lagUntil = 0;
  let guestQueue = [], guestBusy = false, shownWinner = false, mirrorOpen = false;
  let gotRoster = false, hostGoneTimer = null;
  let pendingTrade = null, tradeSeq = 0, myTradeWait = false;   // intercambio en curso

  /* ganchos de interfaz que asigna main.js */
  const ui = { showLobby:null, onRoster:null, onStartGame:null,
               onBackToLobby:null, onClosed:null, onRejected:null };

  /* ---------------- utilidades ---------------- */
  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const genCid = () => 'c' + Math.random().toString(36).slice(2, 10);
  const slotKey = c => 'banquero_on_' + c;
  function lib(){
    if(!window.supabase) return null;
    if(!sb) sb = window.supabase.createClient(URL, KEY);
    return sb;
  }
  function broadcast(p){
    if(ch) ch.send({type:'broadcast', event:'m', payload:p});
  }

  /* ---------------- suscripción al canal ---------------- */
  function subscribe(){
    const s = lib();
    ch = s.channel('eb:' + code, { config: { presence: { key: myCid } } });
    ch.on('broadcast', { event: 'm' }, ({ payload }) => {
      try{ handleMsg(payload); }catch(e){ console.warn('Online msg', e); }
    });
    ch.on('presence', { event: 'sync' }, onPresence);
    return new Promise(res => {
      let done = false;
      ch.subscribe(st => { if(!done){ done = true; res(st); } });
      setTimeout(() => { if(!done){ done = true; res('TIMEOUT'); } }, 8000);
    });
  }

  /* ---------------- creación y unión a salas ---------------- */
  const curRoster = () => roster.map(r => ({...r}));

  function broadcastRoster(){
    broadcast({t:'roster', roster:curRoster(), hostName});
    if(ui.onRoster) ui.onRoster(curRoster());
    if(!started && ui.showLobby) ui.showLobby({code, roster:curRoster(), isHost, hostName});
  }

  async function createRoom(name, o){
    const s = lib();
    if(!s) throw new Error('No se pudo cargar la conexión en línea (¿sin internet?).');
    isHost = true; active = true; started = false; gotRoster = false;
    myName = name; myCid = genCid(); mySlot = 0; hostName = name;
    roster = [{slot:0, name, cid:myCid}];   /* el anfitrión ocupa el puesto 0 */
    opts = {target:o.target, rounds:o.rounds, dice:o.dice};
    /* evita choques de código con salas vivas: si hay otro anfitrión en
       el canal, prueba con otro número */
    for(let k = 0; k < 4; k++){
      code = String(Math.floor(1000 + Math.random() * 9000));
      await subscribe();
      await ch.track({name, host:true});
      await new Promise(r => setTimeout(r, 900));
      const st = ch.presenceState();
      const others = Object.keys(st).filter(cid => cid !== myCid && (st[cid][0] || {}).host);
      if(!others.length) break;
      try{ await ch.untrack(); await ch.unsubscribe(); }catch(e){}
      sb = null; ch = null;
    }
    broadcastRoster();
    return code;
  }

  async function joinRoom(c, name){
    const s = lib();
    if(!s) throw new Error('No se pudo cargar la conexión en línea (¿sin internet?).');
    code = String(c).trim(); myName = String(name).slice(0, 12); myCid = genCid();
    isHost = false; active = true; started = false; gotRoster = false; mySlot = -1;
    try{ myRejoinSlot = +(localStorage.getItem(slotKey(code)) ?? -1) || -1; }catch(e){ myRejoinSlot = -1; }
    await subscribe();
    await ch.track({name:myName});
    /* pide plaza al anfitrión hasta que llegue el roster (con reintentos) */
    for(let k = 0; k < 8 && !gotRoster && active; k++){
      broadcast({t:'hello', cid:myCid, name:myName, rejoin:myRejoinSlot});
      await new Promise(r => setTimeout(r, 1100));
    }
    if(!gotRoster){
      leave();
      throw new Error('Sala no encontrada o llena. Revisá el código y probá otra vez.');
    }
    return true;
  }

  /* ---------------- mensajes entrantes ---------------- */
  function handleMsg(p){
    if(!p || !p.t) return;
    if(isHost){
      if(p.t === 'hello') onHello(p);
      else if(p.t === 'act') hostDispatch(p);   /* acción de un invitado */
      return;
    }
    switch(p.t){
      case 'roster': {
        roster = p.roster || [];
        hostName = p.hostName || hostName;
        const me = roster.find(r => r.cid === myCid);
        if(me){
          mySlot = me.slot; gotRoster = true;
          try{ localStorage.setItem(slotKey(code), mySlot); }catch(e){}
        }
        if(ui.onRoster) ui.onRoster(curRoster());
        if(!started && ui.showLobby) ui.showLobby({code, roster:curRoster(), isHost:false, hostName});
        break;
      }
      case 'reject':
        if(p.to === myCid){
          leave();
          if(ui.onRejected) ui.onRejected(p.reason || 'No pudiste entrar a la sala.');
        }
        break;
      case 'start': {
        const me = (p.roster || []).find(r => r.cid === myCid);
        if(!me) break;                        // espectador accidental
        mySlot = me.slot;
        started = true; shownWinner = false; lastSeq = 0;
        guestQueue = []; guestBusy = false;
        pendingTrade = null; tradeSeq = 0; myTradeWait = false;
        if(ui.onStartGame) ui.onStartGame(curRoster(), p.cfg, false);
        break;
      }
      case 'st':
        if(started) queuePacket(p);
        break;
      case 'note':
        toast(p.text, p.kind || 'bad');
        break;
      case 'treq':
        /* propuesta de intercambio: solo la decide el rival mencionado */
        if(started && +p.pb === mySlot){
          myTradeWait = false;
          showTradeAsk(+p.pa, +p.pb, +p.ta, +p.tb, +p.id);
        }
        break;
      case 'treqdone':
        /* el proponente cierra su ventana de espera */
        if(myTradeWait){
          myTradeWait = false;
          closeModal(); busy = false;
          if(!p.ok) toast(p.cancelled ? 'Propuesta de intercambio cancelada.'
            : 'Tu propuesta de intercambio fue rechazada.', 'bad');
        }
        break;
      case 'lobby':
        started = false; shownWinner = false; lastSeq = 0;
        guestQueue = []; guestBusy = false; pendingModal = null; mirrorOpen = false;
        pendingTrade = null; tradeSeq = 0; myTradeWait = false;
        if(ui.onBackToLobby) ui.onBackToLobby({code, roster:p.roster || curRoster(), isHost:false, hostName});
        break;
      case 'closed':
        leave();
        if(ui.onClosed) ui.onClosed(p.reason || 'La sala se cerró.');
        break;
    }
  }

  function onHello(p){
    if(!p || !p.cid) return;
    const known = roster.find(r => r.cid === p.cid);
    if(started){
      /* reingreso tras refrescar la página: misma plaza si nombre y plaza coinciden */
      const rs = roster.find(r => r.slot === p.rejoin && r.name === p.name);
      if(rs){
        rs.cid = p.cid; rs.off = false;
        broadcastRoster();
        broadcast({t:'start', roster:curRoster(),
          cfg:{target:opts.target, roundLimit:opts.rounds, dice:opts.dice, idle:60}});
        flushPublish();
      } else {
        broadcast({t:'reject', to:p.cid, reason:'La partida ya empezó. Te esperamos en la próxima.'});
      }
      return;
    }
    if(known){ known.name = p.name || known.name; broadcastRoster(); return; }
    if(roster.length >= 6){
      broadcast({t:'reject', to:p.cid, reason:'La sala está llena (máximo 6 jugadores).'});
      return;
    }
    const used = new Set(roster.map(r => r.slot));
    let slot = 0; while(used.has(slot)) slot++;
    roster.push({slot, name:(p.name || 'Invitado').slice(0, 12), cid:p.cid});
    broadcastRoster();
  }

  /* ---------------- presencia y desconexiones ---------------- */
  function onPresence(){
    if(!active || !ch) return;
    const st = ch.presenceState();
    const present = new Set(Object.keys(st));
    if(isHost){
      roster.forEach(r => {
        if(r.slot === 0) return;
        const on = present.has(r.cid);
        if(on && r.off){
          r.off = false;
          if(started){
            toast(r.name + ' volvió a la sala.', 'good');
            broadcast({t:'note', text:r.name + ' volvió a la sala.', kind:'good'});
          }
        } else if(!on && !r.off){
          r.off = true;
          if(started){
            toast(r.name + ' se desconectó.', 'bad');
            broadcast({t:'note', text:r.name + ' se desconectó.', kind:'bad'});
          }
        }
      });
      if(!started){
        const before = roster.length;
        roster = roster.filter(r => r.slot === 0 || present.has(r.cid));
        if(roster.length !== before) broadcastRoster();
      }
    } else {
      const hostOn = Object.keys(st).some(cid => (st[cid][0] || {}).host);
      if(!hostOn){
        if(!hostGoneTimer) hostGoneTimer = setTimeout(() => {
          hostGoneTimer = null;
          leave();
          if(ui.onClosed) ui.onClosed('El anfitrión se desconectó: la sala se cerró.');
        }, 6000);
      } else if(hostGoneTimer){ clearTimeout(hostGoneTimer); hostGoneTimer = null; }
    }
  }

  /* ---------------- arranque y fin de partida ---------------- */
  function hostStart(){
    if(!isHost || !active || started || roster.length < 2) return;
    started = true; seq = 0; rec = []; pendingModal = null;
    pendingTrade = null; tradeSeq = 0; myTradeWait = false;
    const cfg = {target:opts.target, roundLimit:opts.rounds, dice:opts.dice, idle:60};
    broadcast({t:'start', roster:curRoster(), cfg});
    if(ui.onStartGame) ui.onStartGame(curRoster(), cfg, true);
  }

  function backToLobby(){
    if(!isHost || !active) return;
    started = false; shownWinner = false; seq = 0; rec = []; pendingModal = null;
    pendingTrade = null; tradeSeq = 0; myTradeWait = false;
    roster.forEach(r => { r.off = false; });
    broadcast({t:'lobby', roster:curRoster(), hostName});
    if(ui.onBackToLobby) ui.onBackToLobby({code, roster:curRoster(), isHost:true, hostName});
  }

  function leave(){
    if(isHost && active && ch) broadcast({t:'closed', reason:'El anfitrión cerró la sala.'});
    try{ if(ch){ ch.untrack(); ch.unsubscribe(); } }catch(e){}
    sb = null; ch = null;
    active = false; isHost = false; started = false; gotRoster = false;
    roster = []; mySlot = -1; myRejoinSlot = -1;
    seq = 0; lastSeq = 0; rec = []; pendingModal = null;
    guestQueue = []; guestBusy = false; shownWinner = false; mirrorOpen = false;
    pendingTrade = null; tradeSeq = 0; myTradeWait = false;
    try{ localStorage.removeItem(slotKey(code)); }catch(e){}
    if(hostGoneTimer){ clearTimeout(hostGoneTimer); hostGoneTimer = null; }
    if(pubTimer){ clearTimeout(pubTimer); pubTimer = null; }
  }

  /* ---------------- publicación del anfitrión ---------------- */
  function recStep(s){ if(isHost && active && started) rec.push(s); }
  function recToast(text, kind){
    if(isHost && active && started && !evHandling && !silent) rec.push({k:'toast', text, kind});
  }
  /* graba el array de eventos del motor y suprime el eco de sus toasts */
  function preEv(ev){
    if(isHost && active && started){ rec.push({k:'ev', ev}); evHandling = true; }
  }
  function postEv(){ evHandling = false; }
  function silentRec(v){ silent = !!v; }

  function onHostRender(){
    if(isHost && active && started) schedulePublish(220);
  }
  function schedulePublish(ms){
    if(pubTimer || !isHost) return;
    pubTimer = setTimeout(() => { pubTimer = null; flushPublish(); }, ms);
  }
  function noteModal(m){
    if(isHost && active && started){ pendingModal = m; flushPublish(); }
  }
  function onModalClosed(){
    if(isHost && active && started && pendingModal){ pendingModal = null; flushPublish(); }
  }
  function flushPublish(){
    if(!isHost || !active || !started) return;
    if(pubTimer){ clearTimeout(pubTimer); pubTimer = null; }
    const st = Engine.snapshot();
    if(!st) return;
    broadcast({t:'st', seq:++seq, state:st, steps:rec, modal:pendingModal});
    rec = [];
  }

  /* ---------------- despacho de acciones (anfitrión) ---------------- */
  async function hostDispatch(p){
    if(!started || !isHost) return;
    const st = Engine.snapshot();
    if(!st || st.phase === 'over') return;
    const a = p.a || {};
    /* La respuesta (o cancelación) de un intercambio la da el rival
       mencionado, que NO es el jugador en turno: se valida y resuelve
       antes de la puerta general de acciones. */
    if(a.type === 'tradeans' && pendingTrade && +a.id === pendingTrade.id){
      const rs = roster.find(r => r.slot === p.slot);
      if(rs && rs.cid === p.cid && p.slot === pendingTrade.pb){
        const T = pendingTrade; pendingTrade = null;
        closeTradeWait();
        if(a.ok){
          await applyTrade(T.pa, T.pb, T.ta, T.tb);
          broadcast({t:'treqdone', id:T.id, ok:true});   /* el proponente cierra su espera */
        }
        else broadcast({t:'treqdone', id:T.id, ok:false});
        flushPublish();
      }
      return;
    }
    if(a.type === 'tradecancel' && pendingTrade && pendingTrade.pa === p.slot){
      const rs = roster.find(r => r.slot === p.slot);
      if(rs && rs.cid === p.cid){
        const T = pendingTrade; pendingTrade = null;
        closeTradeWait();
        broadcast({t:'treqdone', id:T.id, ok:false, cancelled:true});
        flushPublish();
      }
      return;
    }
    const seat = roster.find(r => r.slot === p.slot);
    if(!seat || seat.cid !== p.cid || p.slot === 0 || p.slot !== st.curPi) return;
    if(a.type === 'roll' && st.phase === 'roll'){ onRoll(true); }
    else if(a.type === 'buy' && st.phase === 'buy'){ buyDecision(true); }
    else if(a.type === 'decline' && st.phase === 'buy'){ buyDecision(false); }
    else if(a.type === 'bail' && st.phase === 'jail'){ onPayBail(true); }
    else if(a.type === 'skip' && st.phase === 'jail'){ onSkipJail(true); }
    else if(a.type === 'build' && (st.phase === 'roll' || st.phase === 'jail')){
      if(!busy) showBuildModal();
    }
    else if(a.type === 'upgrade' && pendingModal && pendingModal.kind === 'build'){
      const r = Engine.upgrade(Engine.snapshot().curPi, +a.tile);
      if(r) await handleEvents(r.ev);
      flushPublish();
    }
    else if(a.type === 'buildDone' && pendingModal && pendingModal.kind === 'build'){
      pendingModal = null; closeModal(); busy = false; renderAll();
    }
    else if(a.type === 'trade' && (st.phase === 'roll' || st.phase === 'jail') && !pendingTrade){
      /* propuesta de un invitado: validar casillas y destino antes de difundir */
      const pa = st.curPi, pb = +a.pb, ta = +a.ta, tb = +a.tb;
      const rseat = roster.find(r => r.slot === pb);
      if(TILES[ta] && TILES[tb] && TILES[ta].t === 'prop' && TILES[tb].t === 'prop'
        && TILES[ta].owner === pa && TILES[tb].owner === pb && pb !== pa
        && st.players[pb] && st.players[pb].alive && rseat && !rseat.off){
        pendingTrade = {id:++tradeSeq, pa, pb, ta, tb};
        broadcast({t:'treq', id:pendingTrade.id, pa, pb, ta, tb});
        flushPublish();
        if(pb === 0) showTradeAsk(pa, pb, ta, tb, pendingTrade.id);
      } else {
        broadcast({t:'note', text:'El intercambio no se pudo enviar (casilla o jugador inválido).', kind:'bad'});
      }
    }
  }

  /* ---------------- aplicación en invitados ---------------- */
  function queuePacket(p){
    if(!p || typeof p.seq !== 'number' || p.seq <= lastSeq) return;
    lastSeq = p.seq;
    guestQueue.push(p);
    pump();
  }
  async function pump(){
    if(guestBusy) return;
    guestBusy = true;
    while(guestQueue.length){
      const p = guestQueue.shift();
      try{ await applyPacket(p); }catch(e){ console.warn('Online packet', e); }
    }
    guestBusy = false;
  }

  function syncTiles(st){
    if(!st) return;
    TILES.forEach((t, i) => {
      if(t.t !== 'prop') return;
      t.owner = st.owners[i] === undefined ? null : st.owners[i];
      t.built = (st.built && st.built[i]) || 0;
    });
  }

  async function applyPacket(p){
    Engine.setMirror(p.state);
    syncTiles(p.state);
    for(const s of (p.steps || [])){
      if(s.k === 'roll') await replayRoll(s);
      else if(s.k === 'ev'){
        /* los desplazamientos por carta se animan antes de sus avisos,
           igual que hace el anfitrión en su flujo principal */
        const sm = (s.ev || []).find(e => e.type === 'stepmove');
        if(sm) await animatePath(sm.pi, sm.path, []);
        await handleEvents(s.ev || [], true);
      }
      else if(s.k === 'toast') toast(s.text, s.kind || '');
    }
    applyModal(p.modal);
    renderAll();
    if(p.state.phase === 'over' && !shownWinner){ shownWinner = true; showWinnerModal(); }
  }

  async function replayRoll(s){
    const dice = [...document.querySelectorAll('#dome .die:not(.hidden)')];
    nudgeDice();
    Sfx.dice();
    await Promise.all(dice.map((d, i) => tumbleTo(d, i === 0 ? s.d1 : (s.d2 || s.d1), Sfx.diceDur())));
    await animatePath(s.pi, s.path || [], s.ev || []);
  }

  function applyModal(m){
    if(!m){
      if(mirrorOpen){ closeModal(); mirrorOpen = false; busy = false; }
      return;
    }
    if(m.kind === 'buy'){
      mirrorOpen = true;
      showBuyModalGuest(m);
    } else if(m.kind === 'build'){
      mirrorOpen = true;
      showBuildModal();          /* versión espejo: lee el motor en modo reflejo */
    }
  }

  /* espejo del billete de compra: con botones si decidís vos, sino espera */
  function showBuyModalGuest(m){
    const st = Engine.snapshot();
    const t = TILES[m.tile];
    if(!t || t.t !== 'prop' || !st) return;
    const p = st.players[m.decider];
    const g = GROUPS[t.g];
    const mine = isMySeat(m.decider);
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
      ${mine
        ? `<div class="btnrow">
             <button class="btn" id="g-buy" ${p.cash < t.price ? 'disabled' : ''}>Comprar</button>
             <button class="btn alt" id="g-skip">No comprar</button>
           </div>`
        : `<div class="onwait">Esperando que <b>${esc(p.name)}</b> decida…</div>`}`, true);
    if(mine){
      $('#g-buy').onclick = () => sendAction({type:'buy'});
      $('#g-skip').onclick = () => sendAction({type:'decline'});
    }
  }

  /* ---------------- intercambio de casillas ---------------- */
  /* El anfitrión valida y difunde la propuesta; el rival la decide en su
     dispositivo. El veredicto viaja como treqdone y el canje entra al
     guion por los eventos del motor (cash ×2 + trade). */
  function tradeOffer(pa, pb, ta, tb){
    if(pendingTrade){ toast('Ya hay un intercambio en curso.', 'gold'); return; }
    if(isHost){
      pendingTrade = {id:++tradeSeq, pa, pb, ta, tb};
      broadcast({t:'treq', id:pendingTrade.id, pa, pb, ta, tb});
      if(pb === 0) showTradeAsk(pa, pb, ta, tb, pendingTrade.id);
      else showTradeWait(pb, pendingTrade.id);
    } else {
      sendAction({type:'trade', pa, pb, ta, tb});
      showTradeWait(pb, 0);
    }
  }
  function showTradeWait(pb, id){
    const name = (Engine.snapshot().players[pb] || {}).name || 'el rival';
    myTradeWait = !isHost;
    busy = true;
    openModal(`
      <h3>Propuesta enviada</h3>
      <div class="mtext">Esperando la respuesta de <b>${esc(name)}</b>…</div>
      <div class="btnrow"><button class="btn alt" id="m-tcancel">Cancelar propuesta</button></div>`, true);
    $('#m-tcancel').onclick = () => {
      closeModal(); busy = false; myTradeWait = false; Sfx.click();
      if(isHost){
        if(pendingTrade && pendingTrade.id === id){
          pendingTrade = null;
          broadcast({t:'treqdone', id, ok:false, cancelled:true});
          flushPublish();
        }
      } else {
        sendAction({type:'tradecancel'});
      }
    };
  }
  function showTradeAsk(pa, pb, ta, tb, id){
    const st = Engine.snapshot();
    const a = st.players[pa], b = st.players[pb];
    openModal(`
      <h3>${esc(a.name)} propone un intercambio</h3>
      <div class="mtext">${esc(a.name)} entrega <b>${tileName(ta)}</b></div>
      <div class="mtext">${esc(b.name)} entrega <b>${tileName(tb)}</b></div>
      <div class="mtext">Al aceptar, el banco paga <b>${money(TRADE_BONUS)}</b> a cada uno.</div>
      <div class="btnrow">
        <button class="btn" id="m-tok">ACEPTAR</button>
        <button class="btn alt" id="m-tno">Rechazar</button>
      </div>`, true);
    $('#m-tok').onclick = () => { closeModal(); Sfx.click(); tradeAnswer(id, true); };
    $('#m-tno').onclick = () => { closeModal(); Sfx.click(); tradeAnswer(id, false); };
  }
  function tradeAnswer(id, ok){
    if(isHost){
      if(pendingTrade && pendingTrade.id === id){
        const T = pendingTrade; pendingTrade = null;
        if(ok){
          applyTrade(T.pa, T.pb, T.ta, T.tb).then(() => {
            broadcast({t:'treqdone', id:T.id, ok:true});   /* el rival cierra su espera */
            flushPublish();
          });
        }
        else { broadcast({t:'treqdone', id:T.id, ok:false}); flushPublish(); }
      }
    } else {
      sendAction({type:'tradeans', id, ok});
    }
  }
  /* cierra la ventana de espera del anfitrión cuando se resuelve la propuesta */
  function closeTradeWait(){
    const m = document.getElementById('modal');
    if(m && !m.classList.contains('hidden') && m.querySelector('#m-tcancel')){
      closeModal(); busy = false;
    }
  }

  /* ---------------- API pública ---------------- */
  function sendAction(a){
    if(!ch || isHost || !active) return;
    lagUntil = Date.now() + 1500;
    broadcast({t:'act', slot:mySlot, cid:myCid, a});
  }
  function isMySeat(pi){ return isHost ? pi === 0 : pi === mySlot; }
  function lagged(){ return Date.now() < lagUntil; }

  /* diagnóstico interno (consola) */
  function _dbg(){
    return {chState: ch ? ch.state : null, code, active, isHost, started, gotRoster,
      roster: curRoster(), myCid, mySlot, seq, lastSeq, pasosPendientes: rec.length,
      modal: pendingModal, colaInvitado: guestQueue.length};
  }

  return {
    ui,
    get active(){ return active; },
    get isHost(){ return isHost; },
    get isGuest(){ return active && !isHost; },
    get code(){ return code; },
    get roster(){ return curRoster(); },
    get started(){ return started; },
    createRoom, joinRoom, leave, hostStart, backToLobby,
    sendAction, isMySeat, lagged, hostDispatch, tradeOffer,
    recStep, recToast, preEv, postEv, silentRec,
    onHostRender, noteModal, onModalClosed, flushPublish, _dbg,
  };
})();
