# EL BANQUERO · el clásico paraguayo

Juego de mesa estilo Monopoly 100% paraguayo, jugable directamente en el navegador. Sin dependencias, sin build, sin frameworks: HTML + CSS + JavaScript puro.

## Cómo jugarlo

**Opción local:** descarga o clona este repositorio y abre `index.html` con doble clic. No hace falta instalar nada ni levantar un servidor.

**Opción online:** una vez activado GitHub Pages, la partida queda disponible en:

`https://ferreirasanabriasamuel-code.github.io/el-banquero/`

## Características

- Partidas de **2 a 6 jugadores** con nombres y fichas de colores personalizables.
- Tablero 8×8 con 28 casillas recorridas en sentido **antihorario**.
- Economía en **guaraníes (Gs.)**: sueldo de Gs. 200.000 al pasar por SALIDA y efectivo inicial de Gs. 1.000.000.
- Casillas inspiradas en Asunción y el interior del país: Av. Artigas, Calle Palma, Mcal. López, Costanera, Asunción, Encarnación, Villarrica, San Bernardino, Ciudad del Este y más.
- Grupos de propiedades con los colores de los billetes de guaraníes (de Gs. 2.000 a Gs. 100.000).
- **Tacumbú**, la única cárcel del tablero (fianza de Gs. 50.000). Tres dobles seguidos y vas directo.
- **BCP**: si caes ahí, tu dinero queda congelado 4 rondas.
- **Ueno Bank**: casilla de eventos aleatorios que pueden salvarte o arruinarte.
- Cartas de **Suerte** y **Cofre**, impuestos (I.V.A., Impuesto a la Renta, Municipal) y esquina de **Subasta**.
- Victoria por **objetivo de patrimonio neto** (configurable) o al agotar el **límite de rondas**.
- Expulsión opcional por inactividad y dados configurables.
- Fondo animado tipo aurora en WebGL2 y efectos de sonido (dados, cárcel).

## Estructura del proyecto

```
el-banquero/
├── index.html          # pantalla de configuración + tablero
├── css/
│   ├── base.css        # estilos base y pantalla de inicio estilo billete
│   ├── board.css       # tablero, fichas y animaciones
│   └── modals.css      # modales de compra, cartas y bancarrota
├── js/
│   ├── data.js         # constantes, tablero, cartas y paleta
│   ├── engine.js       # motor de reglas (dados, propiedades, banca)
│   ├── flow.js         # flujo de turnos y fases
│   ├── ui.js           # render e interacción
│   ├── aurora.js       # fondo aurora en WebGL2
│   └── main.js         # arranque y configuración de partida
├── fonts/              # Poppins y Marcellus autoalojadas (woff2)
├── img/                # logotipos e iconos
└── sfx/                # efectos de sonido
```

## Tecnologías

- HTML5 + CSS3 (grid, container queries, custom properties)
- JavaScript vanilla (ES6), sin librerías externas
- WebGL2 para el fondo aurora
- Tipografías Poppins y Marcellus servidas localmente

---

Proyecto personal de Samuel Ferreira Sanabria.
