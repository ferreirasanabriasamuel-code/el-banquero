'use strict';
/* ================================================================
   EL BANQUERO — configuración, pantalla final y eventos de interfaz.
   ================================================================ */

/* ---------------- CONFIGURACIÓN ---------------- */
const CFG = {count:2, target:5000000, rounds:30, dice:1, idle:0};

function buildSeg(id, opts, labels, get, set){
  const box = $(id);
  box.innerHTML = '';
  opts.forEach((o, k) => {
    const b = document.createElement('button');
    b.textContent = labels[k];
    b.className = get() === o ? 'on' : '';
    b.onclick = () => { Sfx.click(); set(o); buildConfig(); };
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

/* ---------------- BILLETE CONMEMORativo ----------------
   título y subtítulo centrados; la serie y el sello de moneda se
   quitaron a pedido — el banner queda limpio */
function startGame(){
  gameGen++; busy = false; stopIdleTimer();   // invalida flujos y temporizadores de una partida anterior
  const players = [];
  const inputs = document.querySelectorAll('#name-list input');
  for(let i = 0; i < CFG.count; i++){
    const v = (inputs[i] ? inputs[i].value : '').trim();
    players.push({name: v || defaultName(i), ...PALETTE[i]});
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
  /* certificado-billete: papel con guilloché, nombre del ganador en serif
     y el sello del banco que se estampa sobre él */
  guillocheInto(document.getElementById('cert-gui'), 'cert');
  document.getElementById('certSeal').innerHTML = sealSVG('c');
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
  Sfx.win();
  log('🏆 <b>' + win.name + '</b> gana la partida.');
}

/* ---------------- EVENTOS DE INTERFAZ ---------------- */
$('#btn-start').onclick = () => { Sfx.click(); startGame(); };
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
    $('#screen-game').classList.add('hidden');
    $('#screen-final').classList.add('hidden');
    $('#screen-config').classList.remove('hidden');
  };
  $('#m-no').onclick = closeModal;
};
$('#btn-again').onclick = () => { startGame(); };
$('#btn-settings').onclick = () => {
  stopIdleTimer();
  $('#screen-final').classList.add('hidden');
  $('#screen-game').classList.add('hidden');
  $('#screen-config').classList.remove('hidden');
};
$('#dome').onclick = () => {
  const st = Engine.snapshot();
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
