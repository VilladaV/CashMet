# Despliegue y Respaldos — CashMet

## 1. Configuración de Firebase
1. Crear o seleccionar el proyecto en Firebase Console (por ejemplo `cashmet-b70e4`) con **Authentication** (Email/Password), **Cloud Firestore**, **Firebase Storage** y **Firebase Hosting** habilitados.
2. Copiar `.env.example` a `.env.local` y completar las variables `VITE_FIREBASE_*` (y opcionalmente `VITE_GEMINI_API_KEY`, `VITE_GEMINI_MODEL`, `VITE_GOOGLE_CALENDAR_CLIENT_ID`).
3. Restringir `VITE_GEMINI_API_KEY` en Google AI Studio por *HTTP referrers* a los dominios de Hosting (`https://<proyecto>.web.app/*`, `https://<proyecto>.firebaseapp.com/*`).

## 2. Despliegue a Firebase Hosting (producción)
El flujo real de compilación y despliegue es:

```bash
npm run build && npx firebase deploy --only hosting
```

Si modificas reglas de seguridad o índices de Firestore/Storage, despliega también esos artefactos explícitamente:

```bash
npx firebase deploy --only firestore:rules,firestore:indexes,storage
```

> Antes de desplegar a producción se recomienda validar localmente con `npm run lint && npm run test && npm run build`.

## 3. PWA y caché
- `npm run build` ejecuta `tsc -b && vite build`, generando `dist/` con Service Worker administrado por `vite-plugin-pwa` (`registerType: 'autoUpdate'`, `skipWaiting: true`, `clientsClaim: true`, `cleanupOutdatedCaches: true`) e ícono `favicon.svg`.
- Para verificar localmente la build de producción: `npm run preview`.

## 4. Respaldos (Backups)
- **Desde la aplicación (`BackupPage`)**: abre la pestaña **Backup** en CashMet para:
  - Exportar un respaldo completo en JSON de todas las colecciones financieras permitidas y restaurarlo con validación previa, lista blanca de colecciones y escritura por lotes (`src/lib/firebase/backup.ts`).
  - Exportar el historial completo de movimientos en formato tabular compacto (`.csv` delimitado por `|`).
- **Respaldo administrado de Firestore (GCP / CLI)**: para respaldos completos a nivel de infraestructura hacia un bucket de Cloud Storage:
  ```bash
  gcloud firestore export gs://<tu-bucket-de-backups>/cashmet-$(date +%Y-%m-%d)
  ```

## 5. Acceso privado alternativo (opcional)
Firebase Hosting ya ofrece HTTPS público detrás de Firebase Auth. Si en algún momento prefieres acceso restringido a red privada o túnel:
- **Cloudflare Tunnel**: `cloudflared tunnel` con políticas Zero Trust.
- **Tailscale Serve / Funnel**: acceso restringido a tu tailnet.
