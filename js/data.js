'use strict';
/* ============ DATOS · constantes, paleta, tablero y cartas ============
   Tema: El Banquero, el clásico juego de mesa paraguayo.
   Moneda: guaraníes (Gs). Casillas con calles, avenidas, ciudades y
   lugares de Asunción y del Paraguay (Tacumbú, I.V.A., Calle Palma…). */

const SALARY = 200000;      // salario al pasar por SALIDA (casilla de inicio)
const START_CASH = 1000000; // efectivo inicial del 1.º jugador
const STEP_EXTRA = 50000;   // extra por cada posición después del 1.º
const JAIL_POS = 14;        // única cárcel: Tacumbú (esquina superior derecha)
const JAIL_FINE = 300000;   // fianza para salir de Tacumbú y seguir el turno
const DEBT_LIMIT = -500000; // efectivo por debajo del cual hay bancarrota
const DOUBLES_LIMIT = 3;    // tiras máximas seguidas antes de ir a Tacumbú
const BCP_ROUNDS = 4;       // rondas que el BCP tarda en devolver el dinero congelado
const TRADE_BONUS = 250000; // premio del banco a cada parte de un intercambio de casillas

/* Formato de moneda compartido por motor, flujo e interfaz (carga primero) */
const money = n => (n < 0 ? '-Gs. ' + Math.abs(n).toLocaleString('es-ES') : 'Gs. ' + n.toLocaleString('es-ES'));

/* Paleta de fichas, en orden de jugador 1.º a 6.º:
   rojo, violeta, naranja, amarillo, verde y azul (colores vivos que
   destacan sobre el tablero gris) */
const PALETTE = [
  {name:'Rojo',     c:'#EF5350', cl:'#F98F8D', cd:'#C22F2C', tc:'#fff'},
  {name:'Violeta',  c:'#A87BE0', cl:'#CBAEEE', cd:'#6F44A6', tc:'#fff'},
  {name:'Naranja',  c:'#FF9040', cl:'#FFBC8A', cd:'#D66416', tc:'#2F2836'},
  {name:'Amarillo', c:'#FFC94D', cl:'#FFE09A', cd:'#DB9B12', tc:'#2F2836'},
  {name:'Verde',    c:'#5CBF60', cl:'#A8E085', cd:'#3A8A3E', tc:'#fff'},
  {name:'Azul',     c:'#3FA7E8', cl:'#8DD9F7', cd:'#157CA8', tc:'#fff'},
];

/* tc = color del texto sobre la casilla de vidrio del grupo.
   Cada zona "es" un billete de guaraníes: el color del grupo toma el
   tono de la denominación (verde Gs. 2.000 … dorado Gs. 100.000), de
   la zona más barata a la más cara. */
const GROUPS = {
  accesos:    {name:'Accesos',     den:2000,   color:'#3F8F4F', tc:'#fff'},
  avenidas:   {name:'Avenidas',    den:5000,   color:'#E08A3C', tc:'#2A1B08'},
  microcentro:{name:'Microcentro', den:10000,  color:'#1E5AA8', tc:'#fff'},
  interior:   {name:'Interior',    den:20000,  color:'#7B4FA6', tc:'#fff'},
  balnearios:{name:'Balnearios',  den:50000,  color:'#C03A34', tc:'#fff'},
  capital:    {name:'Capital',     den:100000, color:'#D9A93B', tc:'#2A2005'},
};

/* Tablero 8×8: 28 casillas en el perímetro (esquinas en 0, 7, 14 y 21).
   Recorrido ANTIHORARIO: se arranca en la SALIDA (abajo-izquierda) y de
   ahí para arriba. Esquinas: SALIDA (abajo-izq) · Suerte (arriba-izq) ·
   única cárcel Tacumbú (arriba-der) · Subasta (abajo-der). Ueno Bank
   (casilla de eventos aleatorios) ocupa el lugar del antiguo "Ve a
   Tacumbú"; la Plaza Uruguaya quedó donde estaba la Costanera. */
const TILES = [
  {t:'go'},
  {t:'prop', name:'Av. Artigas',            g:'accesos',    price:30000,  rent:6000},
  {t:'chest'},
  {t:'prop', name:'Av. Fdo. de la Mora',  g:'accesos',    price:30000,  rent:6000},
  {t:'tax',  name:'Imp. a la Renta',      amount:50000},
  {t:'prop', name:'Av. Gral. Santos',      g:'accesos',    price:50000,  rent:10000},
  {t:'prop', name:'Mcal. López',    g:'avenidas',   price:60000,  rent:12000},
  {t:'luck'},
  {t:'prop', name:'Av. España',            g:'avenidas',   price:70000,  rent:14000},
  {t:'prop', name:'Calle México',          g:'avenidas',   price:100000, rent:20000},
  {t:'tax',  name:'I.V.A.',                amount:100000},
  {t:'prop', name:'Calle Palma',           g:'microcentro', price:160000, rent:32000},
  {t:'chest'},
  {t:'prop', name:'Mcal. Estigarribia',  g:'microcentro', price:175000, rent:35000},
  {t:'jail'},
  {t:'prop', name:'Cnel. Oviedo',         g:'interior',   price:220000, rent:44000},
  {t:'park'},
  {t:'prop', name:'Villarrica',            g:'interior',   price:220000, rent:44000},
  {t:'prop', name:'San Bernardino',        g:'balnearios', price:260000, rent:52000},
  {t:'prop', name:'Ciudad del Este',       g:'interior',   price:240000, rent:48000},
  {t:'ueno'},
  {t:'auction'},
  {t:'prop', name:'Encarnación',           g:'balnearios', price:280000, rent:56000},
  {t:'chest'},
  {t:'tax',  name:'Imp. Municipal',       amount:120000},
  {t:'prop', name:'Costanera',             g:'capital',    price:350000, rent:70000},
  {t:'chest'},
  {t:'prop', name:'Asunción',              g:'capital',    price:400000, rent:80000},
];
TILES.forEach(t => { if(t.t === 'prop') t.owner = null; });

const CARDS_LUCK = [
  {txt:'Vendes chipa recién horneada: cobras Gs. 100.000.', k:'money', v:100000},
  {txt:'Avanzas hasta la SALIDA y cobras tu salario de Gs. 200.000.', k:'warp', to:0, pay:true},
  {txt:'Multa por cruzar en rojo la Av. Artigas: pagas Gs. 50.000 al bote.', k:'pot', v:50000},
  {txt:'Bono del Banco Central: cobras Gs. 200.000.', k:'money', v:200000},
  {txt:'Un taxi te lleva hasta la Costanera.', k:'warp', to:25},
  {txt:'Ve directamente a TACUMBÚ. No cobres salario.', k:'warp', to:'jail'},
  {txt:'Devolución de impuestos de la SET: cobras Gs. 120.000.', k:'money', v:120000},
  {txt:'Rompes un vidrio en la Calle Palma: pagas Gs. 80.000 al bote.', k:'pot', v:80000},
  {txt:'¡Ganas la quiniela! Cada jugador te paga Gs. 30.000.', k:'eachIn', v:30000},
  {txt:'Invitas tereré a todos: pagas Gs. 20.000 a cada jugador.', k:'eachOut', v:20000},
  {txt:'Atajo por el Mercado 4: avanzas {n}.', k:'move', v:3, rand:true},
  {txt:'Tráfico en la Av. Mariscal López: retrocedes 3 casillas.', k:'move', v:-3},
];
const CARDS_CHEST = [
  {txt:'Intereses de tu caja de ahorro: cobras Gs. 100.000.', k:'money', v:100000},
  {txt:'Mensualidad del colegio: pagas Gs. 100.000 al bote.', k:'pot', v:100000},
  {txt:'Vendes un ñandutí a un turista: cobras Gs. 150.000.', k:'money', v:150000},
  {txt:'Reparación de la bomba de agua: pagas Gs. 80.000 al bote.', k:'pot', v:80000},
  {txt:'Premio del Banquero por cliente fiel: Gs. 75.000.', k:'money', v:75000},
  {txt:'Donación al Hospital de Clínicas: Gs. 60.000 al bote.', k:'pot', v:60000},
  {txt:'La municipalidad te paga por cuidar la Plaza Uruguaya: Gs. 50.000.', k:'money', v:50000},
  {txt:'Ve directamente a TACUMBÚ. No cobres salario.', k:'warp', to:'jail'},
  {txt:'Ve a la SALIDA y cobras tus Gs. 200.000 de salario.', k:'warp', to:0, pay:true},
  {txt:'Cobras el seguro de tu auto: Gs. 90.000.', k:'money', v:90000},
  {txt:'Multa por polución sonora: pagas Gs. 60.000 al bote.', k:'pot', v:60000},
  {txt:'Mantenimiento de tus propiedades: pagas Gs. 40.000 por cada una.', k:'perProp', v:40000},
];
