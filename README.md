# CashMet

CashMet es una aplicación web/PWA para gestión económica personal con IA (chat-first). Permite registrar gastos/ingresos en lenguaje natural, clasificar, actualizar saldos y gestionar cuentas, deudas, vehículos, propiedades, nómina, recurrentes, impuestos, vencimientos y calendario. Pensado para uso privado, Colombia (COP).

## Stack
- Vite + React + TypeScript
- Tailwind CSS v4 + shadcn/ui + `motion` (animaciones físicas)
- Tema **oscuro premium**: sidebar en escritorio, header translúcido, contadores animados, transiciones de vista
- IA: **Lucía**, contadora colombiana (Gemini API REST) con fallback al motor NL local; detecta **varias transacciones por mensaje**, recuerda la conversación, analiza el estado real en vivo y **convierte monedas a COP** con la tasa del día; Genkit disponible para migrar a Cloud Functions
- Firebase Auth (Email/Password), Firestore
- PWA (vite-plugin-pwa) + FCM Web Push (opcional)
- Google Calendar API (OAuth) (opcional)

## Inicio rápido
1. Copiar `.env.example` a `.env.local` y completar credenciales Firebase
2. (Opcional, para IA real) poner `VITE_GEMINI_API_KEY` — sin ella el chat usa el parser local
3. `npm install`
4. `npm run dev`
5. `npm run build && npm run preview`

## Flujo
- Login → Chat IA (principal)
- Pestañas: Chat IA / Dashboard / Calendario / Cuentas / Deudas / Vehículos / Propiedades / Nómina / Recurrentes / Impuestos / Backup

## Seguridad
- App privada de 1 usuario: el login es solo inicio de sesión (registro deshabilitado)
- Reglas Firestore estrictas (solo autenticado)
- Nunca commitear secretos
- `VITE_GEMINI_API_KEY` viaja en el bundle: **restringirla por HTTP referrer** a los dominios de Hosting. Para clave 100% server-side, migrar a Cloud Functions (plan Blaze).
- `investigacionVehiculoCO` exige `requiereConfirmacion=true` y marca `investigado_IA`

## Docs
- `docs/PLAN_COMPLETO.md` (fuente de verdad)
- `DEPLOY.md`, `docs/prompts/SYSTEM_PROMPT.md`
