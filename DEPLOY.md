# Despliegue CashMet

## 1. Firebase
- Crear proyecto Firebase (Auth Email/Password, Firestore, Hosting, FCM)
- Copiar vars a .env (VITE_FIREBASE_*)
- Deploy: firebase deploy --only hosting,firestore:rules,firestore:indexes

## 2. Acceso fuera de casa (gratis, privado)
- Cloudflare Tunnel (recomendado): cloudflared tunnel --url https://<proyecto>.web.app o exponer via túnel
- Tailscale Funnel/Serve (VPN-based)

## 3. Backups
- Manual: node scripts/export-backup.mjs (plantilla). Para backup completo Firestore usar gcloud firestore export

## 4. PWA
- Build: npm run build, servir dist (Firebase Hosting)
