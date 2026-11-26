# android-definitiva — proyecto Android de la versión definitiva

APK de **El Banquero** (juego completo, sin límite de rondas impuesto:
al empezar la partida se eligen 30 rondas, 50 rondas o ∞).

- `applicationId`: `com.elbanquero` — convive en el mismo celular con la
  versión de prueba (`com.elbanquero.prueba`).
- Firma: reutiliza `android/keystore/prueba.keystore` (clave fija, permite
  instalar encima de versiones anteriores sin desinstalar).
- Íconos lanzador: se copian desde `android/app/src/main/res/mipmap-*`.

## Empaquetado

El juego completo vive en la **raíz del repo** (`index.html`, `css/`, `js/`,
`img/`, `fonts/`, `sfx/`). El workflow `.github/workflows/apk.yml` lo copia a
`app/src/main/assets/www/` antes de compilar (sin `sw.js`, que no aplica en
WebView). No se copian `version-prueba/`, `android/`, README ni zips.

## Compilación local

```bash
cp ../android/keystore/prueba.keystore.b64 keystore/
base64 -d keystore/prueba.keystore.b64 > keystore/prueba.keystore
gradle -p . assembleRelease
# salida: app/build/outputs/apk/release/app-release.apk
```
