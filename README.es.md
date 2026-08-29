<p align="center">
  <img src="store-assets/promo/readme-banner.svg" alt="TimeTrack" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/DrummingBird1/timetrack-extension/actions/workflows/test.yml"><img src="https://github.com/DrummingBird1/timetrack-extension/actions/workflows/test.yml/badge.svg" alt="Tests"></a>
  <a href="https://github.com/DrummingBird1/timetrack-extension/releases/latest"><img src="https://img.shields.io/github/v/release/DrummingBird1/timetrack-extension?label=release" alt="Latest release"></a>
  <a href="https://drummingbird1.github.io/timetrack-extension/"><img src="https://img.shields.io/badge/website-live-6366f1" alt="Website"></a>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.he.md">עברית</a> ·
  <a href="README.ar.md">العربية</a> ·
  <a href="README.ru.md">Русский</a> ·
  <b>Español</b> ·
  <a href="README.fr.md">Français</a>
</p>

# TimeTrack — un rastreador de tiempo de navegación centrado en la privacidad

Una extensión moderna para Chrome que mide cuánto tiempo activo dedica a cada sitio web: una alternativa a Webtime Tracker centrada en la privacidad y en el almacenamiento local, con análisis detallados, objetivos, copia de seguridad en la nube y exportación de datos.

**[🌐 Sitio web](https://drummingbird1.github.io/timetrack-extension/)** · **[📋 Registro de cambios](CHANGELOG.md)** · **[🔒 Política de privacidad](store-assets/PRIVACY.md)**

> Todos los datos permanecen **en su dispositivo**, de forma local. No se envía nada a ningún lugar a menos que active explícitamente la copia de seguridad en la nube.

## ✨ Funciones

- **Seguimiento inteligente y automático** — cuenta solo el tiempo *activo*: la ventana enfocada y sin estar inactivo. Opcionalmente, puede seguir contando mientras se reproduce audio en segundo plano.
- **Diseño moderno** — temas oscuro/claro/automático, soporte completo para RTL y gráficos fluidos hechos a mano.
- **Panel de control completo** con 4 pestañas:
  - **Resumen** — tarjetas de resumen (hoy / rango / promedio / puntuación de enfoque / racha), un gráfico de tendencia a lo largo del tiempo, desglose por categorías y los sitios más visitados.
  - **Sitios** — una tabla con búsqueda y ordenación que muestra tiempo, visitas, porcentaje y un límite por sitio; puede **fijar** sitios en la parte superior y buscar en **todo el historial**, no solo en el rango seleccionado.
  - **Estadísticas inteligentes** — un mapa de calor de día de la semana × hora, distribución horaria, tiempo productivo frente a tiempo de distracción, y su hora de mayor actividad.
  - **Configuración** — control total, con un **cuadro de búsqueda de configuración** para encontrar cualquier opción rápidamente.
- **Categorías inteligentes** — clasificación automática de sitios (productividad, redes sociales, entretenimiento, noticias y más) + una **puntuación de enfoque de 0 a 100**. Todas las clasificaciones se pueden editar.
- **Modo enfoque (Pomodoro)** — ciclos de trabajo → descanso que bloquean los sitios que distraen, un modo de "lista de permitidos" (bloquea todo excepto lo que usted permita), **descansos largos** cada cierto número de ciclos, bloqueo/permiso por **dominio específico** (no solo por categoría), y atajos de teclado (Alt+Shift+F).
- **Sitios sin seguimiento** — una lista de sitios que nunca se contabilizan, gestionable desde Configuración o directamente desde la vista de detalle de un sitio ("No rastrear este sitio"), donde también puede **combinar el historial entre dominios** (por ejemplo, cuando un sitio cambia de nombre) y ver la **primera y última visita**.
- **Estadísticas automatizadas** — "Las redes sociales aumentaron un 30 % respecto a la semana pasada", su día de mayor actividad y mucho más.
- **Importación de CSV e iconos de sitio reales (opcional)** — una vía de migración desde otros rastreadores.
- **Objetivos y límites** — un límite de tiempo diario, un límite por sitio, objetivos diarios y semanales, una **advertencia al acercarse al 80 %** antes de la alerta de límite superado (con un botón de posponer 1 hora en la propia notificación), y un resumen semanal automático.
- **Comparación de períodos y detalle de sitio** — esta semana frente a la semana pasada; al hacer clic en un sitio se abre una línea de tiempo diaria **más un desglose por horas** (las horas de mayor actividad de ese sitio).
- **Rangos de fechas personalizados** — además de los rangos rápidos (hoy / 7 / 30 / 90 / todo).
- **Copia de seguridad cifrada en la nube** — sincronización con Google o con un servidor personalizado (HTTPS), con cifrado opcional mediante frase de contraseña AES-256 (de conocimiento cero, con un **medidor de solidez de la frase de contraseña**), y una **vista previa antes de restaurar** (rango de días, tiempo total, número de sitios) para que nunca restaure a ciegas.
- **Exportación/importación** — JSON (copia de seguridad completa) y CSV (todo, o solo la vista actual).
- **Seis idiomas** — hebreo, inglés, árabe, ruso, español y francés, con cambio en tiempo real.
- **Privacidad** — sin permisos de host, sin seguimiento externo, sin llamadas de red involuntarias (los iconos se generan localmente), eliminación automática de datos antiguos.

## 🚀 Instalación

Como la extensión aún no está en la Chrome Web Store, instálela en modo de desarrollador:

1. Abra `chrome://extensions`
2. Active el **modo de desarrollador** (esquina superior derecha)
3. Haga clic en **Cargar descomprimida**
4. Seleccione la carpeta **`extension/`** (es la carpeta que se carga o se sube a la tienda)
5. Ancle la extensión a la barra de herramientas — y empiece a navegar 🎉

Al hacer clic en el icono se abre una ventana emergente rápida; el botón "Abrir panel completo" abre el panel de control.

## ☁️ Configuración de la copia de seguridad en la nube

- **Sincronización con Google** — active "Sincronizar con la cuenta de Google" en Configuración. Los datos se respaldan automáticamente mediante el propio mecanismo de sincronización de Chrome (limitado a unos 100 KB; si es necesario, se recortan los días más antiguos, pero sus datos locales permanecen completos).
- **Servidor personalizado** — introduzca una URL (y un token opcional) de un endpoint que usted controle; la extensión envía la copia de seguridad completa mediante `POST`.
- **Archivo** — siempre puede exportar JSON/CSV manualmente y guardarlo donde prefiera.

## 🔧 Desarrollo

Sin paso de compilación, sin dependencias — JavaScript modular puro. La suite de pruebas (74 casos) se ejecuta desde `dist`:

```bash
cd dist
npm test               # node --test (no external dependencies)
pwsh build.ps1          # builds the upload zip from extension/
```

Para conocer la arquitectura, el modelo de datos y un mapa completo de archivos, consulte **[CLAUDE.md](CLAUDE.md)**.

## 📁 Estructura

```
extension/               ← la extensión distribuible (cargue/suba esta carpeta)
  manifest.json          — configuración de la extensión (MV3)
  background.js          — el motor de seguimiento (service worker)
  src/lib/                — lógica compartida (almacenamiento, estadísticas, gráficos, copia de seguridad, cifrado, i18n)
  src/popup/               — la ventana emergente rápida
  src/dashboard/            — el panel de control completo
  src/blocked/              — la página de bloqueo del modo enfoque
  icons/                  — iconos
store-assets/            ← recursos de la tienda: política de privacidad, texto de la ficha, imágenes
  site/                  — código fuente del sitio web de marketing (publicado en GitHub Pages)
dist/                    ← herramientas de desarrollo: pruebas, package.json, build.ps1 y el zip generado
archive/                 ← recursos obsoletos (imágenes/versiones de compilación antiguas)
```

## 🔒 Permisos y por qué son necesarios

| Permiso | Uso |
|---|---|
| `storage` / `unlimitedStorage` | Almacenar datos de tiempo y configuración localmente |
| `tabs` | Identificar el dominio de la pestaña activa |
| `idle` | Detener el conteo mientras usted está inactivo |
| `alarms` | Guardado periódico y copia de seguridad automática |
| `notifications` | Alertas de límites de tiempo |
| `favicon` (opcional) | Iconos reales de sitios desde la caché local de Chrome — solo si se activa manualmente |

Sin permiso de `host`, y sin acceso al contenido de la página — solo el nombre de dominio.
