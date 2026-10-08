# CashMet

Gestión económica personal con IA (privado, uso propio). Chat-first: escribes gastos/ingresos en lenguaje natural y la IA interpreta, clasifica y actualiza la base de datos.

## Stack
- Frontend: Vite + React + TypeScript + Tailwind CSS v4 + shadcn/ui
- IA: Genkit + Google AI (Gemini Free Tier)
- BD: Cloud Firestore
- Auth: Firebase Authentication (Email/Password, único usuario)
- PWA: vite-plugin-pwa + Service Worker
- Calendario: Google Calendar API (OAuth)
- Push: Firebase Cloud Messaging (Web Push)

## Inicio rápido
`ash
npm install
cp .env.example .env.local  # Rellenar Firebase + claves necesarias
npm run dev
`

## Build
`ash
npm run build
npm run preview
`

## Ejemplos de uso en chat
- "Gasté 30.000 COP en almuerzo hoy"
- "Pagué 450000 de cuota crédito vivienda"
- "Ingresé 2800000 de nómina"
- "Agrega vehículo Mazda 3 2019 placa ABC123 cilindraje 1500"
- "Investiga SOAT Mazda 3 2019 1500cc Colombia"
- "Genera calendario vencimientos este año"
- "Muéstrame resumen octubre 2026"

## Seguridad
- Privado (uso propio). Sin publicación/venta.
- Firestore Rules restrictivas (solo autenticado)
- Nunca commitear secretos (.gitignore)
- Colombia-first. Confirmación obligatoria antes guardar datos críticos investigados por IA

## Docs
- [PLAN_COMPLETO.md](./docs/PLAN_COMPLETO.md)
- [DEPLOY.md](./DEPLOY.md)
- [SYSTEM_PROMPT.md](./docs/prompts/SYSTEM_PROMPT.md)
