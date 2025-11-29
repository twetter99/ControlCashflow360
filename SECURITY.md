# 🔒 Guía de Seguridad - WINFIN Tesorería

## ⚠️ ACCIONES URGENTES (Si las credenciales fueron expuestas)

### 1. Revocar la Service Account Key

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Selecciona el proyecto `controlcashflow360`
3. Ve a **IAM & Admin** > **Service Accounts**
4. Encuentra la cuenta `firebase-adminsdk-fbsvc@controlcashflow360.iam.gserviceaccount.com`
5. Haz clic en los 3 puntos > **Manage keys**
6. **Elimina TODAS las claves existentes**
7. Crea una nueva clave y descárgala de forma segura

### 2. Rotar credenciales de Firebase (si es necesario)

Si sospechas que las API keys fueron comprometidas:
1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Proyecto > Configuración del proyecto > General
3. Considera crear un nuevo proyecto si hubo exposición grave

---

## 📋 Configuración Segura de Credenciales

### Variables de Entorno Requeridas

Crea un archivo `.env.local` (NUNCA commitear):

```env
# Firebase Client (estas son públicas por diseño)
NEXT_PUBLIC_FIREBASE_API_KEY=tu_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=tu_proyecto.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=tu_proyecto
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=tu_proyecto.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef

# Firebase Admin (SECRETO - solo servidor)
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}

# O usar archivo local (desarrollo)
# Coloca serviceAccountKey.json en la raíz del proyecto
```

### Para Producción (Vercel/Railway/etc)

1. **NUNCA** subir `serviceAccountKey.json` al repositorio
2. Configurar `FIREBASE_SERVICE_ACCOUNT_KEY` como variable de entorno
3. El valor debe ser el JSON completo en una sola línea

---

## 🛡️ Checklist de Seguridad

### Antes de cada commit
- [ ] No hay archivos `*.json` con credenciales en staging
- [ ] El `.gitignore` incluye todos los patrones de keys
- [ ] No hay credenciales hardcodeadas en el código

### Verificar archivos trackeados
```bash
# Ver si hay archivos sensibles trackeados
git ls-files | grep -E "serviceAccount|firebase-adminsdk|\.env"

# Si encuentras alguno, eliminarlo del tracking
git rm --cached archivo_sensible.json
git commit -m "security: remove sensitive file from tracking"
```

### Buscar credenciales en el código
```bash
# Buscar posibles credenciales hardcodeadas
grep -r "AIza" src/          # API keys
grep -r "private_key" src/   # Service account keys
grep -r "BEGIN PRIVATE KEY" . # Private keys
```

---

## 📁 Archivos que NUNCA deben estar en Git

| Archivo | Descripción |
|---------|-------------|
| `serviceAccountKey.json` | Clave privada de Firebase Admin |
| `*-firebase-adminsdk-*.json` | Cualquier clave de servicio |
| `.env.local` | Variables de entorno locales |
| `.env.production` | Variables de producción |

---

## 🚨 Si detectas una filtración

1. **Inmediatamente**: Revocar las credenciales expuestas
2. Revisar logs de auditoría en Firebase Console
3. Verificar accesos no autorizados en Firestore
4. Notificar al equipo de seguridad
5. Documentar el incidente

---

## 📞 Contactos de Emergencia

- Google Cloud Support: https://cloud.google.com/support
- Firebase Support: https://firebase.google.com/support
