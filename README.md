# CashMet

CashMet es una aplicación web/PWA para gestión económica personal con IA (chat-first). Permite registrar gastos/ingresos en lenguaje natural, clasificar, actualizar saldos y gestionar vehículos, propiedades, nómina, recurrentes, vencimientos y calendario. Pensado para uso privado, Colombia (COP).

## Stack
- Vite + React + TypeScript
- Tailwind CSS v4 + shadcn/ui
- Genkit + Google AI (Gemini)
- Firebase Auth (Email/Password), Firestore
- PWA (vite-plugin-pwa) + FCM Web Push
- Google Calendar API (OAuth)

## Inicio rápido
1. Copiar `.env.example` a `.env.local` y completar credenciales Firebase
2. `npm install`
3. `npm run dev`
4. `npm run build && npm run preview`

## Flujo
- Login → Chat IA (principal)
- Pestañas: Chat IA / Calendario / Dashboard

## Seguridad
- Reglas Firestore estrictas (solo autenticado)
- Nunca commitear secretos
- `investigacionVehiculoCO` exige `requiereConfirmacion=true` y marca `investigado_IA`

## Docs
- `docs/PLAN_COMPLETO.md` (fuente de verdad)
- `DEPLOY.md`, `docs/prompts/SYSTEM_PROMPT.md`
