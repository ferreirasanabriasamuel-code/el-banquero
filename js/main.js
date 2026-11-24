'use strict';
/* ================================================================
   EL BANQUERO — configuración, pantalla final y eventos de interfaz.
   ================================================================ */

/* ---------------- CONFIGURACIÓN ---------------- */
const CFG = {count:2, target:5000000, rounds:30, dice:1, idle:0};

function buildSeg(id, opts, labels, get, set, redraw){
  const box = $(id);
  box.innerHTML = '';
  opts.forEach((o, k) => {
    const b = document.createElement('button');
    b.textContent = labels[k];
    b.className = get() === o ? 'on' : '';
    /* redraw: qué pantalla re-pintar tras elegir (local u online); por
       defecto la de configuración local */
    b.onclick = () => { Sfx.click(); set(o); (redraw || buildConfig)(); };
    box.appendChild(b);
  });
}

function buildConfig(){
  buildSeg('#seg-players', [2,3,4,5,6], ['2','3','4','5','6'], () => CFG.count, v => CFG.count = v);
  buildSeg('#seg-target', [3000000,5000000,7000000], ['Gs. 3.000.000','Gs. 5.000.000','Gs. 7.000.000'], () => CFG.target, v => CFG.target = v);
  buildSeg('#seg-rounds', [30,50,0], ['30 rondas','50 rondas','∞'], () => CFG.rounds, v => CFG.rounds = v);
  buildSeg('#seg-dice', [1,2], ['1 dado','2 dados'], () => CFG.dice, v => CFG.dice = v);
  buildSeg('#seg-idle', [0,45,120], ['Sin límite','45 s','120 s'], () => CFG.idle, v => CFG.idle = v);

  const list = $('#name-list');
  list.innerHTML = '';
  for(let i = 0; i < CFG.count; i++){
    const pal = PALETTE[i];
    const row = document.createElement('div');
    row.className = 'namerow';
    row.innerHTML = `
      <div class="dot" style="--c:${pal.c}"></div>
      <input maxlength="12" data-i="${i}" value="${defaultName(i)}" placeholder="${pal.name}">`;
    list.appendChild(row);
  }
}

function defaultName(i){ return 'Jugador ' + (i + 1); }

/* ---------------- MODO ONLINE ---------------- */
const ON_CFG = {target:5000000, rounds:30, dice:1};

function buildOnlineConfig(){
  /* redraw = buildOnlineConfig: al elegir, se re-pinta la pantalla online
     para que el botón quede marcado (antes re-pintaba la local y el clic
     no mostraba la selección) */
  buildSeg('#seg-on-target', [3000000,5000000,7000000], ['Gs. 3.000.000','Gs. 5.000.000','Gs. 7.000.000'], () => ON_CFG.target, v => ON_CFG.target = v, buildOnlineConfig);
  buildSeg('#seg-on-rounds', [30,50,0], ['30 rondas','50 rondas','∞'], () => ON_CFG.rounds, v => ON_CFG.rounds = v, buildOnlineConfig);
  buildSeg('#seg-on-dice', [1,2], ['1 dado','2 dados'], () => ON_CFG.dice, v => ON_CFG.dice = v, buildOnlineConfig);
}

function hideAllScreens(){
  ['#screen-config', '#screen-online', '#screen-lobby', '#screen-game', '#screen-final']
    .forEach(s => $(s).classList.add('hidden'));
  /* el panel de subasta flota sobre todo: nunca debe quedar suelto en un menú */
  if(typeof subastaClose === 'function' && (typeof SB !== 'undefined') && SB) subastaClose();
}

function showOnlineMenu(){
  hideAllScreens();
  $('#screen-online').classList.remove('hidden');
  $('#on-home').classList.remove('hidden');
  $('#on-create-cfg').classList.add('hidden');
  $('#on-msg').classList.add('hidden');
  buildOnlineConfig();
}

function backToConfig(){
  hideAllScreens();
  $('#screen-config').classList.remove('hidden');
}

function onOnlineMsg(msg){
  const el = $('#on-msg');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function renderLobby(info){
  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  $('#lobby-code').textContent = info.code;
  $('#lobby-list').innerHTML = info.roster.map((r, k) => `
    <div class="lobrow${r.off ? ' off' : ''}">
      <span class="dot" style="--c:${PALETTE[k].c}"></span>
      <span class="ln">${esc(r.name || 'Jugador')}</span>
      ${r.slot === 0 ? '<span class="lt">ANFITRIÓN</span>' : ''}
      ${r.off ? '<span class="lt off">OFF</span>' : ''}
    </div>`).join('');
  const start = $('#btn-lobby-start');
  start.classList.toggle('hidden', !info.isHost);
  start.disabled = info.roster.length < 2;
  $('#lobby-wait').textContent = info.isHost
    ? (info.roster.length < 2
        ? 'Compartí el código: hacen falta al menos 2 jugadores.'
        : 'Listo para empezar · ' + info.roster.length + ' jugador(es) en la sala.')
    : 'Esperando a que ' + (info.hostName || 'el anfitrión') + ' empiece la partida… (' + info.roster.length + ' en la sala)';
}

/* Partida online: el anfitrión arranca el motor; los invitados construyen
   el tablero y esperan el primer paquete de estado (motor en modo espejo). */
function startGameOnline(rosterList, cfg, asHost){
  gameGen++; busy = false; stopIdleTimer();
  const players = rosterList.map((r, i) => ({...PALETTE[i], name:r.name}));
  if(asHost) Engine.newGame({players, target:cfg.target, roundLimit:cfg.roundLimit, dice:cfg.dice, idle:cfg.idle || 60});
  hideAllScreens();
  $('#screen-game').classList.remove('hidden');
  buildBoard();
  /* El roster no trae id de jugador (la paleta no lo tiene): sin él las
     fichas quedan como tok-undefined, renderTokens no las encuentra y el
     invitado ve el tablero sin fichas. El número de asiento es el id. */
  buildTokens(asHost ? Engine.snapshot().players : players.map((p, i) => ({...p, id: i})));
  setDie($('#die1'), 6); setDie($('#die2'), 6);   /* descansan en 6, como el modo local */
  if(asHost){
    renderAll();
    const st = Engine.snapshot();
    const names = st.order.map(i => st.players[i].name).join(' → ');
    toast('Orden de turno: ' + names, 'gold');
  } else {
    $('#status').textContent = 'Sincronizando con el anfitrión…';
  }
}

/* Ganchos que el módulo Online dispara según lo que llegue por el canal */
Online.ui.showLobby = info => {
  hideAllScreens();
  $('#screen-lobby').classList.remove('hidden');
  renderLobby(info);
};
Online.ui.onRoster = roster => {
  if(!$('#screen-lobby').classList.contains('hidden'))
    renderLobby({code:Online.code, roster, isHost:Online.isHost, hostName:''});
};
Online.ui.onStartGame = (roster, cfg, asHost) => startGameOnline(roster, cfg, asHost);
Online.ui.onBackToLobby = info => {
  busy = false; stopIdleTimer(); closeModal();
  Online.ui.showLobby(info);
};
Online.ui.onClosed = msg => {
  busy = false; stopIdleTimer(); closeModal();
  showOnlineMenu();
  toast(msg, 'bad');
};
Online.ui.onRejected = msg => {
  showOnlineMenu();
  onOnlineMsg(msg);
};

/* ---------------- BILLETE CONMEMORativo ----------------
   título y subtítulo centrados; la serie y el sello de moneda se
   quitaron a pedido — el banner queda limpio */
function startGame(){
  gameGen++; busy = false; stopIdleTimer();   // invalida flujos y temporizadores de una partida anterior
  const players = [];
  const inputs = document.querySelectorAll('#name-list input');
  for(let i = 0; i < CFG.count; i++){
    const v = (inputs[i] ? inputs[i].value : '').trim();
    players.push({...PALETTE[i], name: v || defaultName(i)});
  }
  const cfg = {players, target:CFG.target, roundLimit:CFG.rounds, dice:CFG.dice, idle:CFG.idle};

  Engine.newGame(cfg);
  $('#screen-config').classList.add('hidden');
  $('#screen-final').classList.add('hidden');
  $('#screen-game').classList.remove('hidden');

  const st = Engine.snapshot();
  buildBoard();
  buildTokens(st.players);
  setDie($('#die1'), 6); setDie($('#die2'), 6);   /* descansan en 6, como el vídeo */
  renderAll();

  const names = st.order.map(i => st.players[i].name).join(' → ');
  toast('Orden de turno: ' + names, 'gold');
  log('🍬 Nueva partida · objetivo <b>' + money(cfg.target) + '</b> · ' +
      (cfg.roundLimit ? cfg.roundLimit + ' rondas' : 'rondas ilimitadas') +
      ' · ' + (cfg.dice === 2 ? '2 dados' : '1 dado'));
  log('🎲 Orden de turno: <b>' + names + '</b>');
  const extras = st.players.filter(p => p.cash > START_CASH).length;
  if(extras) log('🤝 Los jugadores 2.º–' + CFG.count + '.º arrancan con +' + money(STEP_EXTRA) + ' por posición de salida.');
}

/* ---------------- VENTANA DE VICTORIA ---------------- */
/* Serie de billete para el certificado final: letra + 6 dígitos + letra,
   como las impresiones del BCP (la función faltaba y rompía showFinal) */
function serialNumber(){
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const r = n => L[Math.floor(Math.random() * n)];
  return r(L.length) + String(Math.floor(Math.random() * 900000) + 100000) + r(L.length);
}

/* Ventana emergente sobre el tablero, con el juego detenido: anuncia al
   ganador con el color de su ficha y el botón lleva al certificado final. */
function showWinnerModal(){
  const st = Engine.snapshot();
  if(st.phase !== 'over' || !st.over) return;
  const win = st.players[st.over.winner];
  const reasons = {
    objetivo:'Alcanzó el patrimonio objetivo de ' + money(st.cfg.target),
    ultimo:'Es el último jugador en pie',
    rondas:'Límite de rondas alcanzado: gana el mayor patrimonio neto',
  };
  busy = true; renderAction(st);   /* el juego queda detenido: nada más pulsable */
  openModal(`
    <div class="winhead" style="--pc:${win.color};--pd:${win.cd};--ptc:${win.tc}">
      <div class="wintrophy">🏆</div>
      <div class="winkick">¡PARTIDA TERMINADA!</div>
      <div class="winname serif">${win.name}</div>
      <div class="winwhy">${reasons[st.over.reason] || 'Ganó la partida'}</div>
      <div class="winmoney">Patrimonio final: <b>${money(Engine.netWorth(st.over.winner))}</b></div>
    </div>
    <div class="btnrow"><button class="btn big" id="m-wcert">VER CERTIFICADO</button></div>`, true);
  Sfx.win();
  $('#m-wcert').onclick = () => { closeModal(); Sfx.click(); showFinal(); };
}

/* ---------------- PANTALLA FINAL ---------------- */
function showFinal(){
  const st = Engine.snapshot();
  if(st.phase !== 'over' || !st.over) return;
  const rank = Engine.ranking();
  const win = st.players[st.over.winner];
  const reasons = {
    objetivo:'Alcanzó el patrimonio objetivo de ' + money(st.cfg.target),
    ultimo:'Es el último jugador en pie',
    rondas:'Límite de rondas alcanzado: gana el mayor patrimonio neto',
  };
  /* certificado-billete: papel con guilloché y el nombre del ganador en serif */
  guillocheInto(document.getElementById('cert-gui'), 'cert');
  document.getElementById('certName').textContent = win.name;
  document.getElementById('certReason').textContent = reasons[st.over.reason] || '';
  document.getElementById('certAmount').textContent = money(Engine.netWorth(st.over.winner));
  document.getElementById('certFoot').textContent =
    'Asunción, ' + new Date().getFullYear() + ' · Serie ' + serialNumber();
  const colors = ['#E9C34D', '#8E96A8', '#C77B3A'];
  const heights = [96, 72, 56];
  const podRank = [rank.find(r => r.i === st.over.winner),
    ...rank.filter(r => r.i !== st.over.winner)].slice(0, 3);
  $('#podium').innerHTML = podRank.map((r, k) => {
    const p = st.players[r.i];
    return `<div class="pod">
      <div class="av" style="--c:${p.color}"></div>
      <div class="bar" style="height:${heights[k]}px; background:${colors[k]};">${k + 1}</div>
      <div class="nm">${p.name}</div>
      <div style="font-size:11px; color:#7DD99B; font-weight:800;">${money(r.nw)}</div>
    </div>`;
  }).join('');
  $('#rank').innerHTML = rank.map((r, k) => `
    <div class="rrow">
      <span class="r1">${k + 1}.º</span>
      <span>${r.i === st.over.winner ? '★ ' : ''}${r.name}${r.alive ? '' : ' (quiebra)'}</span>
      <span class="cash">Efec. ${money(r.cash)}</span>
      <span class="nw">Patr. ${money(r.nw)}</span>
    </div>`).join('');
  const conf = $('#confetti');
  conf.innerHTML = '';
  /* confeti en la paleta del billete: dorado, azul guaraní, verde y crema */
  const confCols = ['#E9C34D', '#1E5AA8', '#7DD99B', '#C03A34', '#F3ECD9'];
  for(let i = 0; i < 36; i++){
    const c = document.createElement('i');
    c.style.left = Math.random() * 100 + '%';
    c.style.background = confCols[i % confCols.length];
    c.style.animationDuration = (2.2 + Math.random() * 1.6) + 's';
    c.style.animationDelay = '-' + (Math.random() * 1.8) + 's';
    conf.appendChild(c);
  }
  $('#screen-final').classList.remove('hidden');
  /* el jingle de victoria ya sonó al abrirse la ventana del ganador */
  log('🏆 <b>' + win.name + '</b> gana la partida.');
}

/* ---------------- EVENTOS DE INTERFAZ ---------------- */
$('#btn-start').onclick = () => { Sfx.click(); startGame(); };

/* ---------------- EVENTOS DEL MODO ONLINE ---------------- */
$('#btn-online').onclick = () => { Sfx.click(); showOnlineMenu(); };
$('#on-back').onclick = () => { Sfx.click(); Online.leave(); backToConfig(); };
$('#on-create').onclick = () => {
  Sfx.click();
  $('#on-home').classList.add('hidden');
  $('#on-create-cfg').classList.remove('hidden');
  $('#on-msg').classList.add('hidden');
};
$('#on-create-back').onclick = () => {
  Sfx.click();
  $('#on-create-cfg').classList.add('hidden');
  $('#on-home').classList.remove('hidden');
  $('#on-msg').classList.add('hidden');
};
$('#on-create-go').onclick = async () => {
  Sfx.click();
  const name = ($('#on-name').value || '').trim() || 'Anfitrión';
  try{
    await Online.createRoom(name, {target:ON_CFG.target, rounds:ON_CFG.rounds, dice:ON_CFG.dice});
  }catch(e){ onOnlineMsg(e.message); }
};
$('#on-join').onclick = async () => {
  Sfx.click();
  const c = ($('#on-code').value || '').trim();
  const name = ($('#on-name').value || '').trim() || 'Invitado';
  if(!/^\d{4}$/.test(c)){ onOnlineMsg('El código de sala tiene 4 dígitos.'); return; }
  try{
    await Online.joinRoom(c, name);
  }catch(e){ onOnlineMsg(e.message); }
};
$('#btn-lobby-start').onclick = () => { Sfx.click(); Online.hostStart(); };
$('#btn-lobby-leave').onclick = () => { Sfx.click(); Online.leave(); backToConfig(); };
$('#btn-rules').onclick = () => { Sfx.click(); showRules(); };
$('#btn-sound').onclick = () => {
  const m = Sfx.toggle();
  $('#btn-sound').textContent = m ? '🔇' : '🔊';
};
$('#btn-sound').textContent = Sfx.muted() ? '🔇' : '🔊';
$('#btn-restart').onclick = () => {
  if(busy) return;   // no reiniciar en medio de una tirada animándose
  openModal(`
    <h3>¿Nueva partida?</h3>
    <div class="mtext">Se descartará la partida actual y volverás a la pantalla de ajustes.</div>
    <div class="btnrow">
      <button class="btn warn" id="m-yes">Sí, volver a ajustes</button>
      <button class="btn alt" id="m-no">Seguir jugando</button>
    </div>`);
  $('#m-yes').onclick = () => {
    closeModal();
    stopIdleTimer();
    if(window.Online && Online.active){
      /* online: el anfitrión devuelve a todos a la sala; el invitado sale */
      if(Online.isHost){ Online.backToLobby(); }
      else { Online.leave(); showOnlineMenu(); }
      return;
    }
    $('#screen-game').classList.add('hidden');
    $('#screen-final').classList.add('hidden');
    backToConfig();   /* vuelve también la música del menú */
  };
  $('#m-no').onclick = closeModal;
};
$('#btn-again').onclick = () => {
  if(window.Online && Online.active){
    if(Online.isHost){ Online.backToLobby(); }
    else { Online.leave(); showOnlineMenu(); }
    return;
  }
  startGame();
};
$('#btn-settings').onclick = () => {
  stopIdleTimer();
  if(window.Online && Online.active){
    if(Online.isHost){ Online.backToLobby(); }
    else { Online.leave(); showOnlineMenu(); }
    return;
  }
  $('#screen-final').classList.add('hidden');
  $('#screen-game').classList.add('hidden');
  backToConfig();   /* vuelve también la música del menú */
};
$('#dome').onclick = () => {
  const st = Engine.snapshot();
  if(!st) return;
  if(window.Online && Online.active){
    if(st.phase === 'roll' && !busy && Online.isMySeat(st.curPi)){
      if(Online.isHost) onRoll(); else Online.sendAction({type:'roll'});
    } else if(st.phase === 'roll' && !busy){
      toast('No es tu turno.', 'gold');
    }
    return;
  }
  if(st.phase === 'roll' && !busy){ onRoll(); }
};
document.addEventListener('keydown', e => {
  if(e.code !== 'Space' && e.code !== 'Enter') return;
  if($('#screen-game').classList.contains('hidden')) return;
  if(!$('#overlay').classList.contains('hidden')) return;
  if(!$('#screen-final').classList.contains('hidden')) return;
  const b = document.querySelector('#btnrow .btn:not([disabled])');
  if(b && !busy){ e.preventDefault(); b.click(); }
});
$('#overlay').onclick = e => {
  if(e.target === $('#overlay') && !modalLocked) closeModal();
};

buildConfig();
