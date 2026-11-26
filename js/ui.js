'use strict';
/* ================================================================
   EL BANQUERO — interfaz. Solo despacha acciones al Engine
   y representa su estado (nunca muta la lógica directamente).
   ================================================================ */

const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tileName = i => {
  const t = TILES[i];
  return t.t === 'prop' ? t.name : t.t === 'tax' ? t.name : t.t === 'go' ? 'SALIDA (inicio)' :
         t.t === 'jail' ? 'Tacumbú (cárcel)' : t.t === 'park' ? 'Plaza Uruguaya' :
         t.t === 'luck' ? 'Suerte' : t.t === 'auction' ? 'Subasta' :
         t.t === 'ueno' ? 'Ueno Bank' : 'Caja de Ahorro';
};

/* ---------------- SONIDO ---------------- */
/* Efectos sintetizados con WebAudio: golpes de madera, monedas metálicas
   y papeles — transitorios de ruido filtrado + parciales suaves con
   decaimiento natural y afinación ligeramente aleatoria (nada de bips
   de videojuego ni voces: sonidos de mesa real). */
const Sfx = (() => {
  let ctx = null, noiseBuf = null;
  let muted = localStorage.getItem('banquero_mute') === '1';
  function ac(){
    if(!ctx){
      try{ ctx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){ return null; }
    }
    if(ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    if(ctx && !noiseBuf){                       /* ruido blanco reutilizable */
      noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * .5), ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for(let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return ctx;
  }
  /* golpe seco de madera: ráfaga de ruido filtrada + tono grave que cae */
  function knock(f = 180, v = .5, when = 0, dur = .09){
    const c = ac(); if(!c || muted) return;
    const t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * (1 + (Math.random() * .08 - .04)), t);
    o.frequency.exponentialRampToValueAtTime(f * .55, t + dur);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + .02);
    const n = c.createBufferSource(), nf = c.createBiquadFilter(), ng = c.createGain();
    n.buffer = noiseBuf;
    nf.type = 'lowpass'; nf.frequency.value = Math.min(f * 6, 8000); nf.Q.value = .8;
    ng.gain.setValueAtTime(v * .8, t);
    ng.gain.exponentialRampToValueAtTime(.0001, t + dur * .7);
    n.connect(nf); nf.connect(ng); ng.connect(c.destination);
    n.start(t, Math.random() * .3); n.stop(t + dur);
  }
  /* tick de ruido corto: dado que choca, papel que se frota */
  function tick(f = 3200, v = .3, when = 0, dur = .03){
    const c = ac(); if(!c || muted) return;
    const t = c.currentTime + when;
    const n = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    n.buffer = noiseBuf;
    fl.type = 'bandpass'; fl.frequency.value = f * (1 + (Math.random() * .3 - .15)); fl.Q.value = 1.6;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    n.connect(fl); fl.connect(g); g.connect(c.destination);
    n.start(t, Math.random() * .3); n.stop(t + dur + .01);
  }
  /* ping metálico de moneda: parciales inarmónicos con decaimiento rápido */
  function ping(f = 2600, v = .12, when = 0){
    const c = ac(); if(!c || muted) return;
    const t = c.currentTime + when;
    [[1, 1], [2.76, .45], [5.4, .18]].forEach(pair => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.value = f * pair[0] * (1 + (Math.random() * .012 - .006));
      g.gain.setValueAtTime(v * pair[1], t);
      g.gain.exponentialRampToValueAtTime(.0001, t + .14 + Math.random() * .08);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + .26);
    });
  }
  /* nota bronca para la fanfarria: sierra filtrada, ataque y caída suaves */
  function brass(f, v, when, dur){
    const c = ac(); if(!c || muted) return;
    const t = c.currentTime + when;
    const o = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.value = f * (1 + (Math.random() * .006 - .003));
    fl.type = 'lowpass'; fl.frequency.value = Math.min(f * 6, 6000); fl.Q.value = 1.1;
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + .03);
    g.gain.setValueAtTime(v * .85, t + dur * .7);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + .02);
  }
  /* moneda de verdad: parciales inarmónicos del metal, desafinado al caer,
     click del choque contra la caja y anillo que se apaga */
  function coin(f = 2600, v = .2, when = 0, dur = .3){
    const c = ac(); if(!c || muted) return;
    const t = c.currentTime + when;
    const g = c.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    g.connect(c.destination);
    [[1, 1], [1.48, .3], [2.71, .5], [4.1, .22], [6.3, .1]].forEach(([m, a]) => {
      const o = c.createOscillator(), og = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f * m * (1 + (Math.random() * .01 - .005)), t);
      o.frequency.exponentialRampToValueAtTime(f * m * .985, t + dur);
      og.gain.value = a;
      o.connect(og); og.connect(g);
      o.start(t); o.stop(t + dur + .05);
    });
    const n = c.createBufferSource(), nf = c.createBiquadFilter(), ng = c.createGain();
    n.buffer = noiseBuf;
    nf.type = 'bandpass'; nf.frequency.value = Math.min(f * 2.2, 12000); nf.Q.value = 1.4;
    ng.gain.setValueAtTime(v * .6, t);
    ng.gain.exponentialRampToValueAtTime(.0001, t + .025);
    n.connect(nf); nf.connect(ng); ng.connect(c.destination);
    n.start(t, Math.random() * .3); n.stop(t + .04);
  }


  return {
    click(){ knock(240, .30, 0, .05); tick(2000, .12, 0, .02); },
    /* tirada: choques de dados rodando sobre la mesa y caída final */
    dice(){
      for(let i = 0; i < 9; i++){
        tick(2400 + Math.random() * 1800, .16 + Math.random() * .1,
             .3 + i * .055 + Math.random() * .03, .025);
      }
      knock(120, .5, .78, .12); tick(3000, .2, .8, .04);
      knock(95, .35, .94, .1);
    },
    /* duración de la animación de tirada (sincronizada con el sonido) */
    diceDur(){ return 1250; },
    /* deslizamiento del peón: toque suave de madera por casilla */
    step(){ knock(200 + Math.random() * 50, .30, 0, .07); },
    /* cobro: golpe del billete sobre la mesa y lluvia de monedas que cantan */
    gain(){
      knock(230, .18, 0, .06);
      for(let i = 0; i < 6; i++)
        coin(1900 + Math.random() * 1800, .16, .04 + i * .05, .3);
      coin(3400, .12, .36, .5);
    },
    /* pago: golpe sordo doble de caja + el papel del billete que se arranca */
    loss(){ knock(150, .4, 0, .1); knock(110, .3, .11, .12); tick(900, .12, .02, .06); },
    /* compra: papel del título + golpe del billete y monedas cayendo una a
       una dentro de la caja; la última rueda y canta sola */
    buy(){
      tick(1400, .14, 0, .04);
      knock(240, .3, .05, .07);
      for(let i = 0; i < 7; i++)
        coin(1700 + Math.random() * 1900, .2 - i * .011,
             .12 + i * (.03 + Math.random() * .03), .22 + Math.random() * .1);
      coin(3300, .15, .38, .55);
    },
    /* construcción: tres golpes de martillo con la caja que resuena */
    build(){
      knock(210, .4, 0, .07);
      knock(185, .45, .16, .08);
      knock(230, .5, .34, .07);
      ping(1300, .05, .36);
    },
    /* carta del mazo: flick de papel y aleteo descendente */
    card(){
      tick(2000, .18, 0, .05);
      const c = ac(); if(c && !muted){
        const t = c.currentTime;
        const n = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
        n.buffer = noiseBuf;
        fl.type = 'bandpass';
        fl.frequency.setValueAtTime(2600, t);
        fl.frequency.exponentialRampToValueAtTime(900, t + .16);
        fl.Q.value = 1.4;
        g.gain.setValueAtTime(.12, t);
        g.gain.exponentialRampToValueAtTime(.0001, t + .18);
        n.connect(fl); fl.connect(g); g.connect(c.destination);
        n.start(t, Math.random() * .3); n.stop(t + .2);
      }
    },
    /* intercambio de casillas: los papeles cruzan y las monedas se cuentan
       en las dos cajas — deslizamiento metálico y pings de ambos lados */
    swap(){
      knock(220, .32, 0, .09); tick(1600, .10, .02, .05);
      const c = ac();
      if(c && !muted){                      /* monedas deslizándose sobre la mesa */
        const t = c.currentTime + .1;
        const n = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
        n.buffer = noiseBuf;
        fl.type = 'bandpass';
        fl.frequency.setValueAtTime(3400, t);
        fl.frequency.exponentialRampToValueAtTime(1900, t + .22);
        fl.Q.value = 1.1;
        g.gain.setValueAtTime(.1, t);
        g.gain.exponentialRampToValueAtTime(.0001, t + .24);
        n.connect(fl); fl.connect(g); g.connect(c.destination);
        n.start(t, Math.random() * .2); n.stop(t + .26);
      }
      for(let i = 0; i < 5; i++)
        coin(2000 + Math.random() * 1600, .16, .16 + i * .055, .28);
      coin(3100, .14, .44, .4); coin(2400, .12, .5, .45);
    },
    /* mazo de la casa de subastas: golpe seco y campanilla */
    hammer(){ knock(140, .55, 0, .08); ping(1500, .06, .015); knock(110, .3, .1, .1); },
    /* cárcel: portazo pesado + rejas que traquetean y se cierran */
    jail(){
      knock(70, .6, 0, .16);
      for(let i = 0; i < 4; i++) ping(1900 + Math.random() * 900, .07, .1 + i * .09);
      knock(90, .3, .45, .12);
      tick(700, .12, .5, .08);
    },
    /* victoria: fanfarria bronca (G4-C5-E5-G5 + acorde final), golpe de
       tambor y lluvia de monedas — suena al abrirse la ventana del ganador */
    win(){
      [[392,0,.32],[523.25,.18,.32],[659.25,.36,.32],[784,.54,.6]].forEach(
        ([f, w, d]) => { brass(f, .30, w, d); brass(f / 2, .13, w, d); });
      [523.25, 659.25, 784, 1046.5].forEach(f => brass(f, .15, .98, 1.05));
      knock(90, .5, .98, .28);
      for(let i = 0; i < 10; i++) ping(2000 + Math.random() * 1800, .10, 1.05 + i * .06);
    },
    toggle(){ muted = !muted; localStorage.setItem('banquero_mute', muted ? '1' : '0'); return muted; },
    muted: () => muted,
  };
})();

/* ---------------- TABLERO ---------------- */
/* tablero 8×8: 28 casillas en el perímetro, esquinas en 0, 7, 14 y 21.
   Recorrido ANTIHORARIO: arranca en Tacumbú-salida (abajo-izquierda) y
   sigue PARA ARRIBA por la columna izquierda. */
function tileRC(i){
  if(i === 0)  return {r:8, c:1};               /* Tacumbú · salida (abajo-izquierda) */
  if(i <= 6)  return {r:8 - i, c:1};            /* columna izquierda, subiendo */
  if(i === 7)  return {r:1, c:1};               /* Suerte (arriba-izquierda) */
  if(i <= 13) return {r:1, c:(i - 7) + 1};      /* fila superior, hacia la derecha */
  if(i === 14) return {r:1, c:8};               /* cárcel (arriba-derecha) */
  if(i <= 20) return {r:(i - 14) + 1, c:8};     /* columna derecha, bajando */
  if(i === 21) return {r:8, c:8};               /* Subasta (abajo-derecha) */
  return {r:8, c:8 - (i - 21)};                 /* fila inferior, de vuelta */
}

/* Centros de casilla medidos sobre el DOM: garantiza que cada ficha quede
   EXACTAMENTE centrada en su cuadro (las esquinas son más anchas que el resto). */
let tileCenters = null;
function measureTiles(){
  const layer = $('#tokens');
  if(!layer) return;
  const lb = layer.getBoundingClientRect();
  if(lb.width === 0){ tileCenters = null; return; }
  tileCenters = TILES.map((t, i) => {
    const el = document.querySelector('#board .tile[data-tile="' + i + '"]');
    if(!el) return null;
    const r = el.getBoundingClientRect();
    return {x:r.left - lb.left + r.width / 2, y:r.top - lb.top + r.height / 2, w:r.width};
  });
}
function tileCenter(i){
  if(!tileCenters || !tileCenters[i] || !tileCenters[i].w) measureTiles();
  return tileCenters ? tileCenters[i] : null;
}
/* al cambiar el tamaño del tablero se re-miden las casillas y se recolocan las fichas */
if(window.ResizeObserver){
  new ResizeObserver(() => {
    measureTiles();
    if(Engine.state() && !$('#screen-game').classList.contains('hidden')){
      renderTokens(Engine.snapshot());
    }
  }).observe(document.getElementById('board'));
}

/* casillas especiales: cada tipo con su color de vidrio propio.
   Las 4 ESQUINAS (0 SALIDA, 7 Suerte, 14 cárcel, 21 Subasta) son
   "papel moneda" con ñandutí; el resto son vidrio colorido. */
const TILE_SPEC = {
  tax:    {bg:'#B03A34', tc:'#fff'},    // timbre fiscal: rojo institucional
  luck:   {paper:true, tc:'#20304A'},   // sobre oficial sobre papel (esquina)
  chest:  {bg:'#A65B32', tc:'#fff'},    // alcancía de barro: terracota
  go:     {paper:true, tc:'#20304A'},   // salida (inicio): papel + ventanilla
  jail:   {paper:true, tc:'#20304A'},   // única cárcel: papel + rejas con candado
  park:   {bg:'#4C8A4F', tc:'#fff'},    // plaza uruguaya: verde paseo (columna)
  ueno:   {bg:'#0F9417', tc:'#fff'},    // ueno bank: verde de marca, letras blancas
  auction:{paper:true, tc:'#20304A'},   // casa de subastas: papel + plato
};
function paintTile(el, s){
  el.classList.toggle('paper', !!s.paper);
  if(!s.paper) el.style.setProperty('--bg', s.bg);
  el.style.setProperty('--tc', s.tc || '#fff');
  /* en casillas claras (ámbar, papel) el texto va oscuro para que contraste */
  el.classList.toggle('dk', (s.tc || '#fff') !== '#fff');
}

/* ---------------- ORNAMENTOS DE BILLETE ---------------- */
/* Papel de seguridad: rejilla de líneas RECTAS cruzadas (papel verjurado),
   reemplaza a las ondas del guilloché. Se inyecta como <pattern>. */
function guillocheInto(el, id){
  if(!el) return;
  let lines = '';
  for(let k = 1; k < 20; k++){
    const p = k * 7;
    lines += `<line x1="${p}" y1="0" x2="${p}" y2="140"/>`;
    lines += `<line x1="0" y1="${p}" x2="140" y2="${p}"/>`;
  }
  el.innerHTML = `<defs><pattern id="gui-${id}" width="140" height="140" patternUnits="userSpaceOnUse">
      <g stroke="#2E4468" stroke-width="0.9" opacity="0.20">${lines}</g>
    </pattern></defs>
    <rect width="100%" height="100%" fill="url(#gui-${id})"/>`;
}

/* Papel del TABLERO (cuadrado, viewBox 1000×1000): solo verjurado
   lineal de seguridad (el billete diagonal 100.000 se descartó). */
function boardPaperSVG(){
  let lines = '';
  for(let k = 1; k < 50; k++){
    const p = k * 20;
    lines += `<line x1="${p}" y1="0" x2="${p}" y2="1000"/>`;
    lines += `<line x1="0" y1="${p}" x2="1000" y2="${p}"/>`;
  }
  return `<defs><pattern id="gui-board" width="1000" height="1000" patternUnits="userSpaceOnUse">
      <g stroke="#2E4468" stroke-width="2" opacity="0.20">${lines}</g></pattern></defs>
    <rect width="1000" height="1000" fill="url(#gui-board)"/>`;
}

/* Ñandutí: encaje radial paraguayo — anillos, radios y pétalos en
   simetría circular; sólo trazos, como el encaje verdadero */
function nandutiSVG(){
  let s = '';
  [7, 15, 30, 44, 48.5].forEach(r => { s += `<circle cx="50" cy="50" r="${r}"/>`; });
  for(let k = 0; k < 12; k++){
    const a = (k / 12) * Math.PI * 2;
    s += `<line x1="${(50 + Math.cos(a) * 15).toFixed(1)}" y1="${(50 + Math.sin(a) * 15).toFixed(1)}"
                x2="${(50 + Math.cos(a) * 44).toFixed(1)}" y2="${(50 + Math.sin(a) * 44).toFixed(1)}"/>`;
  }
  const petals = (r, n, w) => {
    let p = '';
    for(let k = 0; k < n; k++){
      const a = (k / n) * Math.PI * 2;
      p += `<circle cx="${(50 + Math.cos(a) * r).toFixed(1)}" cy="${(50 + Math.sin(a) * r).toFixed(1)}" r="${w}"/>`;
    }
    return p;
  };
  s += petals(22, 8, 3.2) + petals(37, 12, 4.4);
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1.05" stroke-linecap="round">${s}</g></svg>`;
}

/* Sello del Banco Central · El Banquero: medalla dorada acuñada con
   orla de texto curvo, rayos grabados que giran lento y monograma ₲.
   uid evita colisiones de gradientes entre instancias (tablero, inicio,
   certificado final). */
function sealSVG(uid){
  let rays = '';
  for(let k = 0; k < 24; k++){
    const a = (k / 24) * Math.PI * 2;
    rays += `<line x1="${(200 + Math.cos(a) * 62).toFixed(1)}" y1="${(200 + Math.sin(a) * 62).toFixed(1)}"
                  x2="${(200 + Math.cos(a) * 104).toFixed(1)}" y2="${(200 + Math.sin(a) * 104).toFixed(1)}"/>`;
  }
  const serif = "Marcellus, 'Noto Serif SC', Georgia, serif";
  return `<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="gm-${uid}" cx="38%" cy="32%" r="80%">
      <stop offset="0%" stop-color="#FBEDB4"/><stop offset="42%" stop-color="#E9C34D"/>
      <stop offset="78%" stop-color="#C9992F"/><stop offset="100%" stop-color="#8C6A1F"/>
    </radialGradient>
    <radialGradient id="gm2-${uid}" cx="42%" cy="34%" r="75%">
      <stop offset="0%" stop-color="#F6DE8C"/><stop offset="60%" stop-color="#DDB43C"/>
      <stop offset="100%" stop-color="#B98A24"/>
    </radialGradient>
    <path id="arcT-${uid}" d="M 102,298 A 138,138 0 1 1 298,298" fill="none"/>
    <path id="arcB-${uid}" d="M 50,200 A 150,150 0 0 0 350,200" fill="none"/>
  </defs>
  <g style="filter:drop-shadow(0 6px 4px rgba(80,55,10,.55)) drop-shadow(0 -4px 3px rgba(255,248,220,.6))">
    <circle cx="200" cy="200" r="196" fill="url(#gm-${uid})" stroke="#7A5C16" stroke-width="2.5"/>
    <path d="M 200,7 A 193,193 0 0 0 7,200" fill="none" stroke="rgba(255,248,220,.6)"
      stroke-width="3" stroke-linecap="round"/>
    <path d="M 200,393 A 193,193 0 0 0 393,200" fill="none" stroke="rgba(80,55,10,.5)"
      stroke-width="3" stroke-linecap="round"/>
    <circle cx="200" cy="200" r="186" fill="none" stroke="#8C6A1F" stroke-width="3.4"
      stroke-dasharray="1.5 4.6" stroke-linecap="round"/>
    <circle cx="200" cy="200" r="172" fill="url(#gm2-${uid})" stroke="#8C6A1F" stroke-width="1.6"/>
    <path d="M 200,28 A 172,172 0 0 0 28,200" fill="none" stroke="rgba(255,248,220,.5)"
      stroke-width="2.6" stroke-linecap="round"/>
    <path d="M 200,372 A 172,172 0 0 0 372,200" fill="none" stroke="rgba(80,55,10,.45)"
      stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="200" cy="200" r="160" fill="none" stroke="#6B4E0A" stroke-width="1.4"/>
    <circle cx="200" cy="200" r="118" fill="none" stroke="#6B4E0A" stroke-width="1.6"/>
    <g class="rays" stroke="#7A5C16" stroke-width="1.5" opacity=".55">${rays}</g>
    <text font-family="${serif}" font-size="23.5" letter-spacing="2" fill="#5C4408">
      <textPath href="#arcT-${uid}" startOffset="50%" text-anchor="middle">BANCO CENTRAL DEL PARAGUAY</textPath>
    </text>
    <text font-family="${serif}" font-size="22" letter-spacing="2.5" fill="#5C4408">
      <textPath href="#arcB-${uid}" startOffset="50%" text-anchor="middle">REPÚBLICA DEL PARAGUAY</textPath>
    </text>
    <g fill="#8C6A1F">
      <rect x="83.2" y="286.1" width="13" height="13" transform="rotate(45 89.7 292.6)"/>
      <rect x="303.8" y="286.1" width="13" height="13" transform="rotate(45 310.3 292.6)"/>
    </g>
    <g text-anchor="middle">
      <text x="202.4" y="187.4" font-family="${serif}" font-size="84" fill="#F7E7A8">Gs</text>
      <text x="200" y="185" font-family="${serif}" font-size="84" fill="#6B4E0A">Gs</text>
      <text x="200.9" y="253.9" font-family="${serif}" font-size="27" letter-spacing="3.5" fill="#F7E7A8">EL BANQUERO</text>
      <text x="200" y="253" font-family="${serif}" font-size="27" letter-spacing="3.5" fill="#6B4E0A">EL BANQUERO</text>
    </g>
  </g>
</svg>`;
}

/* iconos grabados de las casillas especiales */
const ICONS = {
  /* SALIDA: ventanilla de banco con mostrador y un billete que entrega */
  go:`<svg class="ticon" viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg">
    <path d="M13 40 V22 a19 19 0 0 1 38 0 V40" fill="none" stroke="#20304A" stroke-width="3" stroke-linecap="round"/>
    <path d="M21 40 V25 a11 11 0 0 1 22 0 V40" fill="none" stroke="#20304A" stroke-width="1.5" opacity=".5"/>
    <line x1="8" y1="40" x2="56" y2="40" stroke="#20304A" stroke-width="3.2" stroke-linecap="round"/>
    <rect x="23" y="28" width="18" height="10" rx="1.6" fill="#E9C34D" stroke="#8C6A1F" stroke-width="1.5"/>
    <text x="32" y="36" text-anchor="middle" font-size="7.5" font-weight="700" fill="#5C4408" font-family="Poppins,sans-serif">Gs</text>
  </svg>`,
  /* TACUMBÚ: rejas estilizadas con una carita sonriente detrás (guiño, no drama) */
  jail:`<svg class="ticon" viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="26" r="12" fill="#F6DA85" stroke="#8C6A1F" stroke-width="1.4"/>
    <circle cx="28" cy="24" r="1.6" fill="#5C4408"/><circle cx="36" cy="24" r="1.6" fill="#5C4408"/>
    <path d="M27 30 q5 4 10 0" fill="none" stroke="#5C4408" stroke-width="1.6" stroke-linecap="round"/>
    <g stroke="#20304A" stroke-width="3.4" stroke-linecap="round">
      <line x1="15" y1="8" x2="15" y2="42"/><line x1="26.5" y1="8" x2="26.5" y2="42"/>
      <line x1="37.5" y1="8" x2="37.5" y2="42"/><line x1="49" y1="8" x2="49" y2="42"/>
      <line x1="11" y1="11" x2="53" y2="11" stroke-width="2.6"/><line x1="11" y1="39" x2="53" y2="39" stroke-width="2.6"/>
    </g>
  </svg>`,
  /* CÁRCEL: rejas cerradas con candado (esquina superior derecha) */
  jailLock:`<svg class="ticon" viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg">
    <g stroke="#20304A" stroke-width="3.4" stroke-linecap="round">
      <line x1="15" y1="8" x2="15" y2="42"/><line x1="26.5" y1="8" x2="26.5" y2="42"/>
      <line x1="37.5" y1="8" x2="37.5" y2="42"/><line x1="49" y1="8" x2="49" y2="42"/>
      <line x1="11" y1="11" x2="53" y2="11" stroke-width="2.6"/><line x1="11" y1="39" x2="53" y2="39" stroke-width="2.6"/>
    </g>
    <g transform="translate(32 26)">
      <rect x="-6.5" y="0" width="13" height="10" rx="2.2" fill="#E9C34D" stroke="#8C6A1F" stroke-width="1.6"/>
      <path d="M-3.8 0 v-3.4 a3.8 3.8 0 0 1 7.6 0 v3.4" fill="none" stroke="#8C6A1F" stroke-width="2"/>
      <circle cx="0" cy="5" r="1.7" fill="#8C6A1F"/>
    </g>
  </svg>`,
  /* UENO BANK: fachada del banco digital (casilla verde claro de eventos) */
  ueno:`<svg class="ticon" viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 17 L32 6 L56 17 Z" fill="#2F7A3E" stroke="#1E5A2E" stroke-width="2.4" stroke-linejoin="round"/>
    <rect x="13" y="17" width="38" height="20" rx="2.5" fill="#E9C34D" stroke="#1E5A2E" stroke-width="2.4"/>
    <g stroke="#1E5A2E" stroke-width="2.2">
      <line x1="20" y1="22" x2="20" y2="32"/><line x1="28" y1="22" x2="28" y2="32"/>
      <line x1="36" y1="22" x2="36" y2="32"/><line x1="44" y1="22" x2="44" y2="32"/>
    </g>
    <rect x="10" y="37" width="44" height="4.5" rx="2" fill="#2F7A3E" stroke="#1E5A2E" stroke-width="1.8"/>
  </svg>`,
  /* SUBASTA: martillo cayendo sobre un plato redondo */
  auction:`<svg class="ticon" viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg">
    <path d="M19 13 l7 -7 M45 13 l-7 -7" stroke="#C03A34" stroke-width="2.4" stroke-linecap="round"/>
    <g transform="rotate(-38 32 22)">
      <rect x="29" y="4" width="6" height="14" rx="2" fill="#8C6A1F" stroke="#5C4408" stroke-width="1.4"/>
      <rect x="24" y="16" width="16" height="5.5" rx="2.2" fill="#A67C1F" stroke="#5C4408" stroke-width="1.4"/>
      <rect x="29.9" y="21.5" width="4.2" height="11" rx="1.8" fill="#8C6A1F" stroke="#5C4408" stroke-width="1.4"/>
    </g>
    <ellipse cx="32" cy="38.5" rx="17" ry="4.4" fill="none" stroke="#20304A" stroke-width="2.4"/>
    <ellipse cx="32" cy="37.2" rx="11.5" ry="2.5" fill="#E9C34D" stroke="#8C6A1F" stroke-width="1.4"/>
  </svg>`,
  /* VE A TACUMBÚ: rejas pequeñas y flecha roja */
  gotojail:`<svg class="ticon" viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg">
    <g stroke="#20304A" stroke-width="3.2" stroke-linecap="round">
      <line x1="14" y1="12" x2="14" y2="38"/><line x1="24" y1="12" x2="24" y2="38"/><line x1="34" y1="12" x2="34" y2="38"/>
      <line x1="10" y1="14" x2="38" y2="14" stroke-width="2.4"/><line x1="10" y1="36" x2="38" y2="36" stroke-width="2.4"/>
    </g>
    <path d="M42 25 h14 m-5.5 -5.5 l5.5 5.5 -5.5 5.5" fill="none" stroke="#C03A34" stroke-width="3.4"
      stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  /* PLAZA URUGUAYA: arbolito del paseo */
  park:`<svg class="ticon" viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="19" r="12.5" fill="#4C8A4F" stroke="#2F5C33" stroke-width="1.6"/>
    <rect x="29.2" y="28" width="5.6" height="12" rx="1.6" fill="#7A5230" stroke="#4E3418" stroke-width="1.2"/>
    <line x1="14" y1="43" x2="50" y2="43" stroke="#2F5C33" stroke-width="2.6" stroke-linecap="round"/>
  </svg>`,
  /* TIMBRE FISCAL: estampilla con borde perforado */
  tax:`<svg class="ticon" viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg">
    <rect x="16" y="5" width="32" height="38" rx="3" fill="#E9C34D" stroke="#8C6A1F" stroke-width="2.4"
      stroke-dasharray="0.5 3.4" stroke-linecap="round"/>
    <rect x="21.5" y="10.5" width="21" height="27" rx="1.5" fill="none" stroke="#8C6A1F" stroke-width="1.3"/>
    <text x="32" y="30" text-anchor="middle" font-size="13" font-weight="700" fill="#5C4408"
      font-family="Marcellus,Georgia,serif">GS</text>
  </svg>`,
  /* SUERTE: sobre oficial con el sello dorado del banco */
  luck:`<svg class="ticon" viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg">
    <rect x="9" y="12" width="46" height="29" rx="2.4" fill="#F3E9CF" stroke="#20304A" stroke-width="2.2"/>
    <path d="M10.5 14 L32 31 L53.5 14" fill="none" stroke="#20304A" stroke-width="2"/>
    <circle cx="32" cy="29.5" r="6.4" fill="#E9C34D" stroke="#8C6A1F" stroke-width="1.6"/>
    <circle cx="32" cy="29.5" r="2" fill="#8C6A1F"/>
  </svg>`,
  /* CAJA DE AHORRO: alcancía de barro con moneda encima */
  chest:`<svg class="ticon" viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="32" cy="29" rx="15.5" ry="13.5" fill="#A65B32" stroke="#5C3218" stroke-width="1.8"/>
    <rect x="23.5" y="11.5" width="17" height="8" rx="3.5" fill="#A65B32" stroke="#5C3218" stroke-width="1.8"/>
    <rect x="27.5" y="13.2" width="9" height="2.6" rx="1.3" fill="#3A2415"/>
    <circle cx="47" cy="12" r="4.6" fill="#E9C34D" stroke="#8C6A1F" stroke-width="1.4"/>
  </svg>`,
};

/* ESPACIO RESERVADO PARA LA IMAGEN DEL BCP: si existe img/bcp.png
   (o .svg / .jpg), reemplaza al sello generado del centro del tablero;
   mientras no esté, se muestra la medalla dorada como marcador. */
function tryBcpImage(){
  const seal = document.getElementById('seal');
  if(!seal) return;
  const put = src => {                       /* hasimg: el sello solo crece con imagen real */
    seal.classList.add('hasimg');
    seal.innerHTML = `<img class="bcpimg" alt="Banco Central del Paraguay" src="${src}">`;
  };
  const trySrc = srcs => {
    if(!srcs.length) return;                    // sin imagen: queda el sello generado
    const img = new Image();
    img.onload = () => put(srcs[0]);
    img.onerror = () => trySrc(srcs.slice(1));
    img.src = srcs[0];
  };
  trySrc(['img/bcp.png', 'img/bcp.svg', 'img/bcp.jpg']);
}

/* papel del billete: verjurado + billete diagonal del tablero, sello del
   centro (o imagen del BCP si ya fue colocada), sello del banner de inicio */
/* IMAGEN DE UENO BANK: logo flotante en la esquina inferior derecha del
   centro del tablero (sin pegarse al borde inferior). Si no existe
   img/ueno.png, simplemente no se muestra. */
function tryUenoImage(){
  const img = document.getElementById('uenoimg');
  if(!img) return;
  const probe = new Image();
  probe.onload = () => { img.src = probe.src; img.classList.add('show'); };
  probe.onerror = () => { img.classList.remove('show'); img.src = ''; };
  probe.src = 'img/ueno.png';
}

function paintPaper(){
  const bgui = document.getElementById('bgui');
  if(bgui) bgui.innerHTML = boardPaperSVG();
  guillocheInto(document.getElementById('bill-gui'), 'bill');
  guillocheInto(document.getElementById('card-gui'), 'card');
  const seal = document.getElementById('seal');
  if(seal) seal.innerHTML = sealSVG('b');
  tryBcpImage();
  tryUenoImage();
  const bs = document.getElementById('bill-seal');
  if(bs) bs.innerHTML = sealSVG('s');
}
paintPaper();

function buildBoard(){
  const board = $('#board');
  board.querySelectorAll('.tile').forEach(e => e.remove());
  TILES.forEach((t, i) => {
    const rc = tileRC(i);
    const el = document.createElement('div');
    el.className = 'tile';
    el.style.gridRow = rc.r; el.style.gridColumn = rc.c;
    el.dataset.tile = i;
    const isCorner = (i === 0 || i === 7 || i === 14 || i === 21);
    if(t.t === 'prop'){
      const g = GROUPS[t.g];
      el.classList.add('prop');
      /* nombres largos: letra más chica; con alguna palabra muy larga, aún menor */
      const maxWord = Math.max(...t.name.split(' ').map(w => w.length));
      if(t.name.length >= 9) el.classList.add('long');
      if(maxWord >= 10) el.classList.add('xl');
      paintTile(el, {bg:g.color, ac:'#FFFFFF'});
      el.innerHTML = `<div class="tband"><span>${money(t.price)}</span></div><div class="tname">${t.name}</div>`;
    } else if(isCorner){
      /* esquinas de papel moneda: ñandutí en relieve + icono grabado.
         0 SALIDA (inicio) · 7 Suerte · 14 cárcel · 21 Subasta */
      el.classList.add('corner');
      const lace = `<div class="nanduti" aria-hidden="true">${nandutiSVG()}</div>`;
      if(t.t === 'go'){
        paintTile(el, TILE_SPEC.go);
        el.innerHTML = lace + ICONS.go + `<div class="tbig">SALIDA</div><div class="tsub">inicio · cobra ${money(SALARY)}</div>`;
      } else if(t.t === 'jail'){
        paintTile(el, TILE_SPEC.jail);
        el.innerHTML = lace + ICONS.jailLock + `<div class="tbig">TACUMBÚ</div><div class="tsub">cárcel · fianza o 3 rondas</div>`;
      } else if(t.t === 'luck'){
        paintTile(el, TILE_SPEC.luck);
        el.innerHTML = lace + ICONS.luck + `<div class="tbig">SUERTE</div>`;
      } else if(t.t === 'auction'){
        paintTile(el, TILE_SPEC.auction);
        el.innerHTML = lace + ICONS.auction + `<div class="tbig">SUBASTA</div><div class="tsub">caé acá para intercambiar casillas</div>`;
      }
    } else if(t.t === 'tax'){
      paintTile(el, TILE_SPEC.tax);
      el.classList.add('spec');
      if(t.name.length >= 9) el.classList.add('long');
      el.innerHTML = `<div class="tname">${t.name}</div><div class="tsub">PAGUE ${money(t.amount)}</div>`;
    } else if(t.t === 'chest'){
      paintTile(el, TILE_SPEC.chest);
      el.classList.add('spec');
      el.innerHTML = `<div class="tbig">CAJA DE AHORRO</div>`;
    } else if(t.t === 'park'){
      el.classList.add('park');
      paintTile(el, TILE_SPEC.park);
      el.innerHTML = `<div class="tbig">PLAZA<br>URUGUAYA</div><div class="tsub">toma el bote</div>`;
    } else if(t.t === 'ueno'){
      paintTile(el, TILE_SPEC.ueno);
      el.innerHTML = `<div class="tbig">UENO BANK</div><div class="tsub">eventos al azar</div>`;
    }
    board.appendChild(el);
  });
  tileCenters = null;
  measureTiles();
  fitTileNames();
}

/* Ajusta la fuente de cada nombre de casilla al tamaño máximo que entra
   entero (máx. 2 líneas; 3 para nombres muy largos). Se mide con canvas
   con la tipografía real y el resultado se fija en cqw: como todo el
   tablero escala junto, una sola pasada vale para cualquier resolución.
   Sin recortes ni puntos suspensivos, y cada nombre queda tan grande
   como sea posible. */
let _fitCtx = null;
function fitTileNames(){
  const board = $('#board');
  if(!board || !board.querySelector('.tname')) return;
  if(!_fitCtx) _fitCtx = document.createElement('canvas').getContext('2d');
  const cw = board.getBoundingClientRect().width / 100;    /* 1cqw en px */
  if(!cw) return;
  document.querySelectorAll('#board .tname').forEach(el => {
    const text = (el.textContent || '').trim().toUpperCase();
    if(!text) return;
    /* ancho útil: el de la CASILLA (el .tname es shrink-to-fit al centrarse
       en columna, medirlo a sí mismo subestima el espacio disponible) */
    const tile = el.closest('.tile');
    const tcs = getComputedStyle(tile);
    const availW = tile.clientWidth - parseFloat(tcs.paddingLeft) - parseFloat(tcs.paddingRight) - 1;
    if(availW <= 4) return;
    const maxLines = text.replace(/\s/g, '').length > 16 ? 3 : 2;
    const words = text.split(/\s+/);
    const fits = px => {
      _fitCtx.font = '700 ' + px + 'px Poppins, sans-serif';
      const sp = _fitCtx.measureText(' ').width;
      const w = words.map(v => _fitCtx.measureText(v).width);
      if(Math.max(...w) > availW) return false;
      let lines = 1, cur = w[0];
      for(let k = 1; k < words.length; k++){
        if(cur + sp + w[k] <= availW) cur += sp + w[k];
        else { lines++; cur = w[k]; }
      }
      return lines <= maxLines;
    };
    /* búsqueda binaria de la fuente mayor que entra */
    let lo = 2, hi = Math.max(8, Math.round(2.4 * cw));
    while(lo < hi){
      const mid = Math.ceil((lo + hi) / 2);
      if(fits(mid)) lo = mid; else hi = mid - 1;
    }
    let size = lo / cw;
    el.style.fontSize = size.toFixed(2) + 'cqw';
    /* verificación contra el DOM real: si el navegador parte el nombre
       en más líneas de la cuenta (redondeos subpíxel frente al canvas),
       se reduce hasta que quepa tal como se planeó */
    let guard = 0;
    while(guard++ < 30){
      const cs = getComputedStyle(el);
      const lines = el.scrollHeight / parseFloat(cs.lineHeight);
      if(lines <= maxLines + 0.25) break;
      size -= 0.05;
      el.style.fontSize = size.toFixed(2) + 'cqw';
    }
  });
}
/* reajustar cuando la Poppins termine de cargar (la primera medida
   puede haberse hecho con la fuente de respaldo) */
if(document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitTileNames());

/* ---------------- DADO · cubo 3D real (como el vídeo): 6 caras que ruedan sobre sus ejes ---------------- */
const PIPS = {1:[5], 2:[3,7], 3:[3,5,7], 4:[1,3,7,9], 5:[1,3,5,7,9], 6:[1,3,4,6,7,9]};
/* orientación [rx, ry] del cubo que deja cada cara mirando al frente;
   caras opuestas suman 7 (1-6, 2-5, 3-4), como un dado de verdad */
const FACE_ROT = {1:[0,0], 2:[90,0], 3:[0,-90], 4:[0,90], 5:[-90,0], 6:[0,180]};
const dieRot = new WeakMap();   /* última orientación de cada dado, en grados */

function buildDie(el){
  el.innerHTML = `<div class="dshadow"></div><div class="dhop"><div class="dice3d"></div></div>`;
  const cube = el.querySelector('.dice3d');
  /* posición de cada cara en el cubo: 1 frente, 6 atrás, 3 derecha, 4 izquierda, 5 arriba, 2 abajo */
  const place = {1:'', 6:'rotateY(180deg) ', 3:'rotateY(90deg) ', 4:'rotateY(-90deg) ',
                 5:'rotateX(90deg) ', 2:'rotateX(-90deg) '};
  /* núcleo oscuro: cubo macizo ligeramente menor que rellena las esquinas
     redondeadas — se ve como el canto sombreado de un dado real, sin huecos */
  for(let n = 1; n <= 6; n++){
    const c = document.createElement('div');
    c.className = 'dcore';
    c.style.transform = place[n] + 'translateZ(5.2cqw)';
    cube.appendChild(c);
  }
  for(let n = 1; n <= 6; n++){
    const f = document.createElement('div');
    f.className = 'face f' + n;
    f.dataset.n = n;
    f.style.transform = place[n] + 'translateZ(5.5cqw)';   /* media arista = 11cqw / 2 */
    PIPS[n].forEach(c => {
      const p = document.createElement('div');
      p.className = 'pip';
      if(n === 1) p.classList.add('big');   /* el 1 lleva el punto rojo grande, como en el vídeo */
      p.style.gridArea = `${Math.ceil(c/3)} / ${(c-1)%3 + 1}`;
      f.appendChild(p);
    });
    cube.appendChild(f);
  }
}
function applyRot(el, rx, ry){
  el.querySelector('.dice3d').style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
}
function setDie(el, n){
  if(!el.querySelector('.dice3d')) buildDie(el);
  const r = FACE_ROT[n] || FACE_ROT[1];
  dieRot.set(el, {rx:r[0], ry:r[1]});
  applyRot(el, r[0], r[1]);
}
/* GIRO 3D: vueltas completas en X e Y que desaceleran (arranca rápido y frena,
   como el vídeo) y aterrizan EXACTOS en la cara n; mientras, bota sobre su sombra.
   La cara que queda al frente es el número que avanza la ficha. */
function tumbleTo(el, n, durMs){
  return new Promise(done => {
    const s = dieRot.get(el) || {rx:0, ry:0};
    const r = FACE_ROT[n] || FACE_ROT[1];
    const spin = () => (2 + Math.floor(Math.random() * 2)) * (Math.random() < .5 ? -360 : 360);
    const ex = r[0] + spin(), ey = r[1] + spin();   /* destino + vueltas de más */
    const hop = el.querySelector('.dhop');
    const sh  = el.querySelector('.dshadow');
    const t0 = performance.now();
    (function frame(){
      const p = Math.min(1, (performance.now() - t0) / durMs);
      const e = 1 - Math.pow(1 - p, 3);                    /* frenado del vídeo */
      applyRot(el, s.rx + (ex - s.rx) * e, s.ry + (ey - s.ry) * e);
      const h = Math.sin(p * Math.PI) * (1 - p * .5);      /* bote que se apaga */
      hop.style.transform = `translateY(${(-h * 24).toFixed(1)}%)`;
      if(sh){
        sh.style.transform = `translateX(-50%) scale(${(1 - h * .45).toFixed(2)})`;
        sh.style.opacity = (.55 - h * .28).toFixed(2);
      }
      if(p < 1) requestAnimationFrame(frame);
      else{
        dieRot.set(el, {rx:r[0], ry:r[1]});                /* plantado en la cara exacta */
        applyRot(el, r[0], r[1]);
        /* sin rebote final: la sombra vuelve a su estilo de reposo */
        hop.style.transform = '';
        if(sh){ sh.style.transform = ''; sh.style.opacity = ''; }
        done();
      }
    })();
  });
}

/* ---------------- FICHAS · esfera del vídeo 1 ---------------- */
/* colores por jugador para la esfera y su estela (c, claro, oscuro) */
const TOKEN_COLORS = {};

function buildTokens(players){
  const layer = $('#tokens');
  layer.innerHTML = '';
  players.forEach(p => {
    const el = document.createElement('div');
    el.className = 'token'; el.id = 'tok-' + p.id;
    /* acepta las dos formas: la del motor (color) y la de la paleta del
       lobby (c) — sin esto el invitado ve el disco transparente */
    const c = p.color || p.c;
    const cl = p.cl || c, cd = p.cd || c;
    el.style.setProperty('--c', c);
    el.style.setProperty('--cl', cl);
    el.style.setProperty('--cd', cd);
    TOKEN_COLORS[p.id] = {c, cl, cd};
    el.innerHTML = `<div class="disc"></div>`;
    layer.appendChild(el);
  });
}

/* estela del vídeo: copia desvanecida de la esfera en el punto que la
   ficha acaba de abandonar (se llama antes de mover cada paso). La copia
   recibe la MISMA transform de la ficha: posición idéntica sin left/top. */
function tokenTrail(pid){
  const el = document.getElementById('tok-' + pid);
  const layer = $('#tokens');
  if(!el || !layer || !el.style.transform) return;
  const col = TOKEN_COLORS[pid] || {c:'#888', cl:'#bbb', cd:'#444'};
  const t = document.createElement('div');
  t.className = 'token-trail';
  t.style.transform = el.style.transform;
  t.style.setProperty('--c', col.c);
  t.style.setProperty('--cl', col.cl);
  t.style.setProperty('--cd', col.cd);
  layer.appendChild(t);
  setTimeout(() => t.remove(), 620);
}

function renderTokens(st){
  const byTile = {};
  st.players.filter(p => p.alive).forEach(p => {
    (byTile[p.pos] = byTile[p.pos] || []).push(p.id);
  });
  /* desplazamientos en fracción del ancho de la casilla (para no solaparse) */
  const OFFS = {
    1:[[0,0]],
    2:[[-.17,-.17],[.17,.17]],
    3:[[-.18,-.16],[.18,-.16],[0,.18]],
    4:[[-.18,-.18],[.18,-.18],[-.18,.18],[.18,.18]],
    5:[[-.2,-.2],[.2,-.2],[0,-.02],[-.2,.2],[.2,.2]],
    6:[[-.2,-.22],[.2,-.22],[-.2,0],[.2,0],[-.2,.22],[.2,.22]],
  };
  Object.entries(byTile).forEach(([pos, ids]) => {
    const c = tileCenter(+pos);
    if(!c) return;
    const offs = OFFS[Math.min(ids.length, 6)];
    ids.forEach((pid, k) => {
      const el = document.getElementById('tok-' + pid);
      if(!el) return;
      const o = offs[k];
      el.style.transform = 'translate(' + (c.x + o[0] * c.w) + 'px,' + (c.y + o[1] * c.w) + 'px) translate(-50%,-50%)';
    });
  });
  st.players.forEach(p => {
    const el = document.getElementById('tok-' + p.id);
    if(!el) return;
    el.classList.toggle('dead', !p.alive);
    el.classList.toggle('active', p.alive && st.phase !== 'over' && p.id === st.curPi);
  });
}

/* salto de la ficha: land=false salto completo, land=true rebote de aterrizaje */
function hopToken(pid, land = false){
  const el = document.getElementById('tok-' + pid);
  if(!el) return;
  el.classList.remove('hop', 'land');
  void el.offsetWidth;
  el.classList.add(land ? 'land' : 'hop');
}

/* lluvia de monedas al cobrar (detalle propio de El Banquero). La copia
   toma la transform de la ficha: las monedas brotan exactamente de ella. */
function coinBurst(pid){
  const el = document.getElementById('tok-' + pid);
  if(!el) return;
  const fx = document.createElement('div');
  fx.className = 'coinfx';
  fx.style.transform = el.style.transform;
  for(let i = 0; i < 7; i++){
    const c = document.createElement('i');
    const ang = (Math.PI * 2 * i / 7) + Math.random() * .6;
    const dist = 2.6 + Math.random() * 2.4;
    c.style.setProperty('--dx', (Math.cos(ang) * dist).toFixed(2) + 'cqw');
    c.style.setProperty('--dy', (Math.sin(ang) * dist - 1.4).toFixed(2) + 'cqw');
    c.style.animationDelay = (Math.random() * .08) + 's';
    fx.appendChild(c);
  }
  el.parentElement.appendChild(fx);
  setTimeout(() => fx.remove(), 900);
}

/* los dados se acomodan en un punto ligeramente distinto tras cada tirada (vídeo 2) */
function nudgeDice(){
  [$('#die1'), $('#die2')].forEach(d => {
    if(!d || d.classList.contains('hidden')) return;
    d.style.setProperty('--nx', (Math.random() * 9 - 4.5).toFixed(1) + '%');
    d.style.setProperty('--ny', (Math.random() * 7 - 3.5).toFixed(1) + '%');
  });
}

/* ---------------- RENDER ---------------- */
/* Tarjetas de jugador alrededor del tablero (estilo Plato):
   hasta 3 van abajo; con 4–5 suben 2 arriba; con 6, 3 arriba y 3 abajo.
   Cada tarjeta: punto de color + nombre + efectivo + barra de patrimonio.
   Se crean UNA vez por partida y se actualizan en el lugar: reconstruir
   todo el HUD en cada evento (compra, renta, carta…) trababa los
   teléfonos modestos. */
let hudCache = null;   /* {sig, nodes: {pi: {card, pbase, cash, …}}} */

function renderHUD(st){
  const top = $('#cards-top'), bottom = $('#cards-bottom');
  const n = st.order.length;
  const nTop = n <= 3 ? 0 : (n <= 5 ? 2 : 3);
  const sig = st.order.join(',') + '|' + st.players.map(p => p.name).join(',') + '|' + st.cfg.target;
  if(!hudCache || hudCache.sig !== sig){
    top.innerHTML = ''; bottom.innerHTML = '';   /* partida nueva: se rehace */
    hudCache = {sig, nodes:{}};
  }
  const H = hudCache.nodes;
  st.order.forEach((pi, k) => {
    const p = st.players[pi];
    const nw = Engine.netWorth(pi);
    const isCur = pi === st.curPi && st.phase !== 'over';
    const target = st.cfg.target;
    let h = H[pi];
    if(!h){
      const card = document.createElement('div');
      card.id = 'pc-' + pi;
      card.style.setProperty('--c', p.color);   /* banda de color del troquel */
      card.innerHTML = `
        <div class="row1">
          <span class="pdot" style="background:${p.color}"></span>
          <span class="pname"><span class="pbase"></span><span class="timer" id="tmr-${pi}"></span></span>
          <span class="cash"></span>
        </div>
        <div class="row2">
          <div class="bar"><i></i></div>
          <span class="nworth"></span>
        </div>
        <div class="dots"></div>
        <div class="deadtag" style="display:none">BANCARROTA</div>`;
      H[pi] = h = {
        card,
        pbase: card.querySelector('.pbase'),
        cash: card.querySelector('.cash'),
        row2: card.querySelector('.row2'),
        barI: card.querySelector('.bar i'),
        nwEl: card.querySelector('.nworth'),
        dots: card.querySelector('.dots'),
        dead: card.querySelector('.deadtag'),
        dotsSig: null,
      };
    }
    /* actualización en el lugar (sin recrear el DOM) */
    h.card.className = 'pcard' + (isCur ? ' active' : '') + (p.alive ? '' : ' dead');
    const tags =
      (p.jailed ? ' <span class="jtag">Tacumbú</span>' : '') +
      (p.frozen ? ` <span class="jtag ftag" title="El BCP congeló su efectivo: vuelve en ${Math.max(0, p.frozen.untilRound - st.round)} ronda(s)">🔒BCP ${Math.max(0, p.frozen.untilRound - st.round)}r</span>` : '');
    h.pbase.innerHTML = p.name + tags;
    h.cash.textContent = money(p.cash);
    h.cash.className = 'cash' + (p.cash < 0 ? ' neg' : '');
    h.row2.title = 'Patrimonio ' + money(nw) + ' · objetivo ' + money(target);
    h.barI.style.transform = 'scaleX(' + Math.max(0, Math.min(1, nw / target)) + ')';
    h.nwEl.textContent = 'Patr. ' + money(nw);
    h.dead.style.display = p.alive ? 'none' : '';
    /* los puntos de zona solo cambian al comprar/mejorar/intercambiar */
    const dotsSig = p.props.join(',');
    if(h.dotsSig !== dotsSig){
      h.dotsSig = dotsSig;
      h.dots.innerHTML = Object.keys(GROUPS).map(g => {
        const cnt = p.props.filter(t => TILES[t].g === g).length;
        if(!cnt) return '';
        /* zona completa: el punto luce anillo dorado */
        const full = cnt === TILES.filter(t => t.g === g).length;
        const cls = full ? ' class="gfull"' : '';
        const title = GROUPS[g].name + ' · billete de ' + money(GROUPS[g].den) + (full ? ' · zona completa' : ' ×' + cnt);
        return `<i${cls} style="background:${GROUPS[g].color}" title="${title}"></i>`.repeat(cnt === 1 ? 1 : cnt);
      }).join('');
    }
    (k < nTop ? top : bottom).appendChild(h.card);   /* mover reordena sin recrear */
  });
  top.classList.toggle('empty', nTop === 0);
}

/* zonas completas ya anunciadas (grupo:dueño): para avisar una sola vez
   con toast y no repetir en cada render */
let zoneFullSeen = new Set();

function renderTiles(st){
  const fullNow = new Set();
  document.querySelectorAll('#board .tile').forEach(el => {
    const i = +el.dataset.tile;
    const t = TILES[i];
    let badge = el.querySelector('.badge');
    let plaque = el.querySelector('.plaque');
    let huts = el.querySelector('.huts');
    if(t.t === 'prop' && t.owner !== null && t.owner !== undefined){
      const o = st.players[t.owner];
      el.classList.add('owned');
      el.style.setProperty('--ow', o.color);
      /* mini ficha del dueño: solo el color, sin letra */
      if(!badge){
        badge = document.createElement('div');
        badge.className = 'badge';
        el.appendChild(badge);
      }
      badge.style.background = o.color;
      /* zona completa (estilo Plato): marco dorado; la base muestra la
         placa ×2 (sin construir) o las casitas / el edificio */
      const full = TILES.every(x => x.g !== t.g || x.owner === t.owner);
      el.classList.toggle('zonefull', full);
      el.title = t.name + ' · nivel ' + (t.built || 0) + '/3 · renta ' + money(Engine.rentOf(i)) + (full ? ' · zona completa' : '');
      /* la banda superior pasa de precio a renta actual: lo que cobra el
         dueño hoy; se refresca al comprar, mejorar o completar la zona */
      const band = el.querySelector('.tband span');
      if(band) band.textContent = money(Engine.rentOf(i));
      /* puntos de nivel (1 a 3) en la base de la casilla: al comprar ya
         queda nivel 1 y las mejoras van llenando los puntos */
      let dots = el.querySelector('.tdots');
      if(!dots){
        dots = document.createElement('div');
        dots.className = 'tdots';
        /* los puntos van ABAJO DE LAS LETRAS: en el flujo, justo tras el nombre */
        const nm = el.querySelector('.tname');
        if(nm && nm.nextSibling) el.insertBefore(dots, nm.nextSibling);
        else el.appendChild(dots);
      }
      const lv = t.built || 0;
      if(dots.dataset.lv !== String(lv)){
        dots.dataset.lv = lv;
        dots.innerHTML = '<i class="on"></i>'.repeat(lv) + '<i></i>'.repeat(3 - lv);
      }
      if(full) fullNow.add(t.g + ':' + t.owner);
    } else {
      el.classList.remove('owned', 'zonefull');
      if(badge) badge.remove();
      if(plaque) plaque.remove();
      if(huts) huts.remove();
      const dots0 = el.querySelector('.tdots');
      if(dots0) dots0.remove();
      /* sin dueño la banda vuelve al precio de venta (también tras bancarrota) */
      const band = el.querySelector('.tband span');
      if(t.t === 'prop'){
        el.title = 'Zona ' + GROUPS[t.g].name + ' · billete de ' + money(GROUPS[t.g].den) + ' · renta base ' + money(t.rent);
        if(band) band.textContent = money(t.price);
      }
    }
  });
  /* aviso de zona recién completada (o recuperada tras perderla); en el
     modo online el toast viaja grabado desde el anfitrión, no se repite aquí */
  fullNow.forEach(k => {
    if(!zoneFullSeen.has(k)){
      const [g, pi] = [k.slice(0, k.lastIndexOf(':')), +k.slice(k.lastIndexOf(':') + 1)];
      const owner = st.players[pi];
      if(owner && st.round > 0 && !(window.Online && Online.active && !Online.isHost))
        toast('¡' + owner.name + ' completa la zona ' + GROUPS[g].name + '! Ya puede mejorar', 'gold');
    }
  });
  zoneFullSeen = fullNow;
}

/* ¿el jugador en turno puede construir? Tiene una zona completa con
   al menos una casilla sin el nivel máximo (edificio) */
function canBuildAny(st){
  const pi = st.curPi;
  const p = st.players[pi];
  return p.alive && p.props.some(t => (TILES[t].built || 0) < 3 && Engine.fullSet(pi, TILES[t].g));
}

function renderTop(st){
  $('#chip-round').innerHTML = 'Ronda <b>' + st.round + (st.cfg.roundLimit ? '/' + st.cfg.roundLimit : '') + '</b>';
  $('#chip-target').innerHTML = 'Objetivo <b>' + money(st.cfg.target) + '</b>';
  $('#chip-pot').innerHTML = 'Bote <b>' + money(st.pot) + '</b>';
  $('#chip-dice').textContent = st.cfg.dice === 2 ? '2 dados' : '1 dado';
  $('#potpill').textContent = 'Bote: ' + money(st.pot);
  $('#die2').classList.toggle('hidden', st.cfg.dice !== 2);
  const p = st.players[st.curPi];
  const pill = $('#turnpill');
  pill.style.setProperty('--pc', p.color);
  pill.innerHTML = `<i></i><span>Turno de ${p.name}${p.alive ? '' : ' (eliminado)'}</span>`;
}

function renderAction(st){
  const row = $('#btnrow'), status = $('#status');
  const p = st.players[st.curPi];
  const on = window.Online && Online.active;
  const guestBtn = on && !Online.isHost;          /* invitado: sus botones piden acciones */
  const mine = !on || Online.isMySeat(st.curPi);  /* ¿el jugador en turno decide en esta pantalla? */
  const lag = on && Online.lagged();
  row.innerHTML = '';
  const mk = (label, cls, fn) => {
    const b = document.createElement('button');
    b.className = 'btn ' + cls; b.textContent = label;
    if(cls.includes('pbtn')){
      /* el botón de tirar viste los colores de la ficha del jugador en turno */
      b.style.setProperty('--pc', p.color);
      b.style.setProperty('--pl', p.cl);
      b.style.setProperty('--pd', p.cd);
      b.style.setProperty('--ptc', p.tc);
    }
    /* en el invitado, `busy` es del espejo local y puede quedar pegado:
       sus botones solo dependen del lag de red */
    b.disabled = (!guestBtn && busy) || lag;
    b.onclick = fn; row.appendChild(b); return b;
  };
  if(!mine){
    /* turno remoto: sin botones, solo se informa (llega por internet) */
    status.textContent = 'Turno de ' + p.name + '…';
    return;
  }
  if(st.phase === 'roll'){
    status.textContent = st.extra
      ? (st.cfg.dice === 2 ? '¡' + p.name + ' sacó dobles! Tira otra vez.' : '¡' + p.name + ' sacó 6! Tira otra vez.')
      : 'Turno de ' + p.name + ' — lanza el dado.';
    mk(st.extra ? 'TIRAR OTRA VEZ' : 'TIRAR DADO', 'pbtn',
       guestBtn ? () => Online.sendAction({type:'roll'}) : onRoll);
    /* con una zona completa puedes construir antes de tirar; onBuild abre
       el panel en la pantalla de quien construye (anfitrión o invitado) */
    if(canBuildAny(st)) mk('CONSTRUIR', 'alt', onBuild);
  } else if(st.phase === 'end'){
    /* fin de turno automático: solo se informa, sin botón */
    status.textContent = p.name + ' terminó su jugada: el turno pasa solo.';
  } else if(st.phase === 'buy'){
    status.textContent = p.name + ' decide sobre ' + tileName(st.offerTile) + '…';
  } else if(st.phase === 'auction'){
    status.textContent = 'Subasta abierta por ' + p.name + ': el turno sigue cuando la resuelva.';
  } else if(st.phase === 'jail'){
    status.textContent = p.name + ' decide en Tacumbú…';
  } else if(st.phase === 'over'){
    status.textContent = 'Partida terminada.';
  }
}

function renderAll(){
  const st = Engine.snapshot();
  if(!st) return st;
  renderTop(st); renderHUD(st); renderTiles(st); renderTokens(st); renderAction(st);
  startIdleTimer(st);
  if(window.Online) Online.onHostRender();   /* anfitrión: publica el estado */
  return st;
}

/* ---------------- TOASTS / LOG ---------------- */
function toast(msg, cls=''){
  if(window.Online) Online.recToast(msg, cls);   /* anfitrión: viaja a los invitados */
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + cls;
  el.textContent = msg;
  box.appendChild(el);
  while(box.children.length > 4) box.firstChild.remove();
  setTimeout(() => el.remove(), 2700);
}

/* El panel de historial se eliminó a petición del usuario:
   la información importante llega como toasts. La función se
   mantiene como no-op para no tocar el resto del flujo. */
function log(msg){ /* sin registro */ }

/* Maneja la lista de eventos del motor: toasts, sonido, log.
   En el anfitrión online, cada lista de eventos se graba como un paso
   del guion para que los invitados la repitan en orden. */
async function handleEvents(ev, quick=false){
  if(window.Online) Online.preEv(ev);
  try{
    for(const e of ev){
    /* ¿esta pantalla es el dueño del evento? En local: todos miran la misma
       pantalla → siempre "vos". En línea: solo el asiento del que jugó. */
    const evMine = !(window.Online && Online.active) ? (e.pi === undefined || e.pi === Engine.snapshot().curPi)
                                                     : (e.pi === undefined ? true : Online.isMySeat(e.pi));
    if(e.type === 'cash'){
      const p = Engine.snapshot().players[e.pi];
      if(e.delta > 0) coinBurst(e.pi);
      toast((e.delta >= 0 ? '⬆ ' : '⬇ ') + p.name + ': ' + (e.delta >= 0 ? '+' : '') + money(e.delta) + (e.reason ? ' · ' + e.reason : ''), e.delta >= 0 ? 'good' : 'bad');
      e.delta >= 0 ? Sfx.gain() : Sfx.loss();
      log('<b>' + p.name + '</b> ' + (e.delta >= 0 ? 'cobra' : 'paga') + ' ' + money(Math.abs(e.delta)) + (e.reason ? ' — ' + e.reason : ''));
      renderAll();
    } else if(e.type === 'info'){
      /* avisos del motor: forma de dueño si la jugada es tuya, de testigo si
         la hizo otro (los mensajes llevan own/wit; msg es el último recurso) */
      toast(e.pi !== undefined && !evMine && (e.own || e.wit) ? (e.wit || e.own) : (e.own || e.msg || e.wit), '');
    } else if(e.type === 'freeze'){
      const p = Engine.snapshot().players[e.pi];
      toast('🔒 ' + p.name + ': el BCP congela todo su efectivo (' + money(e.amount) + '). Vuelve en ' + e.rounds + ' rondas.', 'bad');
      Sfx.loss();
      log('🏦 <b>' + p.name + '</b> pierde su efectivo: el BCP lo devuelve en ' + e.rounds + ' rondas.');
      renderAll();
    } else if(e.type === 'refund'){
      const p = Engine.snapshot().players[e.pi];
      coinBurst(e.pi);
      toast('🏦 El BCP le devuelve a ' + p.name + ' sus ' + money(e.amount) + '.', 'good');
      Sfx.gain();
      log('🏦 <b>' + p.name + '</b> recupera ' + money(e.amount) + ' del BCP.');
      renderAll();
    } else if(e.type === 'uenogain'){
      const p = Engine.snapshot().players[e.pi];
      coinBurst(e.pi);
      const m = e.msg && e.msg.own !== undefined ? (evMine ? e.msg.own : e.msg.wit) : e.msg;
      toast('🍀 ' + m + ' +' + money(e.delta), 'good');
      Sfx.gain();
      renderAll();
    } else if(e.type === 'uenoloss'){
      const p = Engine.snapshot().players[e.pi];
      const m = e.msg && e.msg.own !== undefined ? (evMine ? e.msg.own : e.msg.wit) : e.msg;
      toast('💳 ' + m + ' −' + money(Math.abs(e.delta)), 'bad');
      Sfx.loss();
      renderAll();
    } else if(e.type === 'card'){
      Sfx.card();
      /* la carta completa la ve SOLO quien la sacó; los demás reciben una
         vista previa (en línea el anfitrión no debe tocar OK por el rival:
         su pantalla no se bloquea esperando al dueño) */
      const own = !(window.Online && Online.active) || Online.isMySeat(e.pi);
      if(own){
        await cardModal(e.kind, e.txt);
      } else {
        const p = Engine.snapshot().players[e.pi];
        toast('🎴 ' + p.name + ' saca ' + e.kind + ': ' + e.txt, 'gold');
        await sleep(quick ? 60 : 500);
      }
      log('🎴 ' + e.kind + ' (' + (Engine.snapshot().players[e.pi] || {}).name + '): ' + e.txt);
    } else if(e.type === 'buy'){
      const p = Engine.snapshot().players[e.pi];
      toast(p.name + ' compra ' + tileName(e.tile), 'gold');
      Sfx.buy();
      log('<b>' + p.name + '</b> compra <b>' + tileName(e.tile) + '</b> por ' + money(TILES[e.tile].price));
      renderAll();
    } else if(e.type === 'build'){
      const p = Engine.snapshot().players[e.pi];
      const lv = ['', 'casa', 'segunda casa', 'edificio'][e.level] || 'construcción';
      toast(p.name + ' construye ' + lv + ' en ' + tileName(e.tile) + ': renta ' + money(Engine.rentOf(e.tile)), 'gold');
      Sfx.build();
      renderAll();
    } else if(e.type === 'trade'){
      const pa = Engine.snapshot().players[e.a], pb = Engine.snapshot().players[e.b];
      toast('🤝 ' + pa.name + ' y ' + pb.name + ' intercambiaron ' + tileName(e.ta) + ' ↔ ' +
            tileName(e.tb) + ': el banco paga ' + money(TRADE_BONUS) + ' a cada uno.', 'gold');
      Sfx.swap();
      renderAll();
    } else if(e.type === 'bankrupt'){
      const p = Engine.snapshot().players[e.pi];
      toast('¡' + p.name + ' quiebra! Sus propiedades vuelven al banco.', 'bad');
      Sfx.loss();
      log('💀 <b>' + p.name + '</b> entra en bancarrota. Propiedades devueltas al banco.');
      renderAll();
    } else if(e.type === 'expelled'){
      const p = Engine.snapshot().players[e.pi];
      toast(p.name + ' fue expulsado por inactividad.', 'bad');
      log('⏳ <b>' + p.name + '</b> fue expulsado por inactividad; propiedades al banco.');
      renderAll();
    } else if(e.type === 'jail'){
      const p = Engine.snapshot().players[e.pi];
      toast(p.name + ' va a Tacumbú.', 'bad');
      Sfx.jail();
      log('🚔 <b>' + p.name + '</b> va a la cárcel.');
      renderTokens(Engine.snapshot());
      await sleep(quick ? 60 : 420);
    } else if(e.type === 'warp'){
      renderTokens(Engine.snapshot());
      hopToken(e.pi, true);
      await sleep(quick ? 60 : 420);
    } else if(e.type === 'stepmove'){
      /* la animación la hace el flujo principal */
    } else if(e.type === 'round'){
      /* sin ventana emergente: basta el resumen de arriba; el chip
         "Ronda" destella un instante para que se note el cambio */
      const chip = $('#chip-round');
      chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump');
    } else if(e.type === 'auctionOpen'){
      /* caer en la casilla de subasta abre el panel del que cayó:
         en el anfitrión manda el motor; los invitados enteran por canal */
      if(!(window.Online && Online.active) || Online.isHost){
        if(typeof subastaOpen === 'function') subastaOpen(e.pi);
      }
      await sleep(quick ? 60 : 500);
    } else if(e.type === 'jailOpen'){
      /* caer en Tacumbú abre la decisión de la fianza: el anfitrión la
         abre y se espeja al dispositivo del que decide */
      if(!(window.Online && Online.active) || Online.isHost){
        if(typeof showJailModal === 'function') showJailModal(e.pi);
      }
      await sleep(quick ? 60 : 400);
    }
  }
  } finally {
    if(window.Online) Online.postEv();
  }
}
