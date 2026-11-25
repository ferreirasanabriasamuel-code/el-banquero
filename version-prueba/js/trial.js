/* VERSIÓN DE PRUEBA de El Banquero: partidas de 10 rondas, marca de
   agua permanente y registro del service worker (instalable como app).
   Todo se aplica desde aquí, sin modificar el juego original. */
(function(){
  const RONDAS = 10;

  /* límite de rondas: envuelve el arranque del motor. Sirve para el modo
     offline (main.js) y para online (el anfitrión arma el estado con el
     límite y lo publica a los invitados, que lo ven en su espejo). */
  const wrap = () => {
    /* engine.js define Engine como const global (no window.Engine): el
       envoltorio debe acceder por binding, no por propiedad de window */
    const E = (typeof Engine === 'undefined') ? null : Engine;
    if(!(E && typeof E.newGame === 'function')){ setTimeout(wrap, 50); return; }
    if(E.__trialWrapped) return;
    const ng = E.newGame.bind(E);
    E.newGame = (cfg, ...rest) => ng(Object.assign({}, cfg, {roundLimit: RONDAS}), ...rest);
    E.__trialWrapped = true;
  };
  wrap();

  /* cinta de marca de agua fija + nota en la pantalla de inicio */
  const st = document.createElement('style');
  st.textContent = [
    '#trial-ribbon{position:fixed; top:calc(env(safe-area-inset-top, 0px) + 6px); left:50%;',
    'transform:translateX(-50%); z-index:9999; pointer-events:none;',
    'font:700 11px/1.6 Poppins, sans-serif; letter-spacing:.14em;',
    'color:#E7C36A; background:rgba(32,48,74,.9); border:1px solid rgba(231,195,106,.55);',
    'border-radius:999px; padding:5px 16px; white-space:nowrap;',
    'box-shadow:0 2px 10px rgba(0,0,0,.35);}',
    '#trial-note{font:600 12.5px/1.5 Poppins, sans-serif; color:#8a6d1f; text-align:center;',
    'margin:10px 0 0;}',
    '#trial-note b{color:#a3821f;}',
    '@media (max-width:640px){ #trial-ribbon{font-size:9.5px; padding:4px 12px;} }'
  ].join('\n');
  document.head.appendChild(st);

  const put = () => {
    if(document.getElementById('trial-ribbon')) return;
    const r = document.createElement('div');
    r.id = 'trial-ribbon';
    r.textContent = 'VERSIÓN DE PRUEBA · ' + RONDAS + ' RONDAS POR PARTIDA';
    document.body.appendChild(r);
  };
  if(document.body) put(); else document.addEventListener('DOMContentLoaded', put);

  const sub = document.querySelector('.bill-sub');
  if(sub && !sub.textContent.includes('VERSIÓN DE PRUEBA'))
    sub.textContent += ' · VERSIÓN DE PRUEBA';

  const note = () => {
    const bill = document.getElementById('bill');
    if(!bill || document.getElementById('trial-note')) return;
    const n = document.createElement('div');
    n.id = 'trial-note';
    n.innerHTML = 'Versión de prueba: cada partida dura <b>' + RONDAS + ' rondas</b>.';
    bill.after(n);
  };
  note();

  /* instalable como app: solo con http/https (en file:// el juego corre igual).
     Dentro del APK el origen es appassets.androidplatform.net: ahí no se
     registra service worker (no aporta nada y puede interferir con los
     assets embebidos del APK). */
  if(location.protocol.startsWith('http')
     && !location.hostname.includes('appassets')
     && 'serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
