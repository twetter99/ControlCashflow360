# WINFIN Tesorería

Sistema de gestión de tesorería para grupos de empresas. Permite controlar la posición de caja diaria, gestionar pólizas de crédito, proyectar flujos de caja y recibir alertas proactivas.

## 🚀 Características

### MVP - Fase 1
- ✅ **Autenticación**: Login con email/password y Google
- ✅ **CRUD completo**: Cuentas, movimientos, pólizas de crédito
- ✅ **Morning Check**: Actualización de saldos con conciliación express
- ✅ **Dashboard**: Resumen de liquidez, proyecciones 30/60/90 días
- ✅ **Gestión de pólizas**: Control de crédito con alertas de vencimiento
- ✅ **Sistema de alertas**: 7 tipos de alertas configurables
- ✅ **Snapshots diarios**: Registro histórico de posición
- ✅ **Cloud Functions**: 6 funciones para automatización

### Características avanzadas (Fase 2)
- 🔜 Escenarios what-if
- 🔜 Multi-moneda
- 🔜 Integración bancaria vía API
- 🔜 Pooling entre empresas
- 🔜 Generación de reports PDF

## 🛠️ Stack Tecnológico

- **Frontend**: Next.js 14 (App Router) + TypeScript
- **Estilos**: Tailwind CSS
- **Backend**: Firebase (Auth, Firestore, Cloud Functions)
- **Iconos**: Lucide React
- **Utilidades**: date-fns, clsx, tailwind-merge

## 📁 Estructura del Proyecto

```
winfin-tesoreria/
├── src/
│   ├── app/                    # Rutas Next.js App Router
│   │   ├── (auth)/             # Rutas de autenticación
│   │   │   └── login/
│   │   ├── (dashboard)/        # Rutas del dashboard
│   │   │   ├── accounts/
│   │   │   ├── alerts/
│   │   │   ├── companies/
│   │   │   ├── credit-lines/
│   │   │   ├── morning-check/
│   │   │   ├── settings/
│   │   │   └── transactions/
│   │   ├── globals.css
│   │   └── layout.tsx
│   ├── components/
│   │   ├── layout/             # Sidebar, Header
│   │   └── ui/                 # Button, Input, Card, Select
│   ├── contexts/               # AuthContext, CompanyFilterContext
│   ├── lib/
│   │   ├── firebase/           # Configuración Firebase
│   │   └── utils/              # Funciones de utilidad
│   ├── services/               # Servicios de datos Firestore
│   └── types/                  # Tipos TypeScript
├── functions/                  # Cloud Functions
│   ├── src/
│   │   ├── config.ts
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── firestore.rules             # Reglas de seguridad
├── firestore.indexes.json      # Índices de Firestore
├── firebase.json               # Configuración Firebase
└── package.json
```

## 🚦 Inicio Rápido

### Prerequisitos
- Node.js 18+
- npm o yarn
- Cuenta de Firebase

### 1. Clonar e instalar dependencias

```bash
cd winfin-tesoreria
npm install
```

### 2. Configurar Firebase

1. Crear proyecto en [Firebase Console](https://console.firebase.google.com)
2. Habilitar Authentication (Email/Password y Google)
3. Crear base de datos Firestore
4. Copiar configuración a `.env.local`:

```bash
cp .env.local.example .env.local
```

Editar `.env.local` con tus credenciales de Firebase:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=tu-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=tu-proyecto
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=tu-proyecto.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

### 3. Desplegar reglas e índices de Firestore

```bash
firebase login
firebase use --add  # Seleccionar tu proyecto
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### 4. Configurar Cloud Functions

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

### 5. Ejecutar en desarrollo

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000)

## 📊 Colecciones de Firestore

| Colección | Descripción |
|-----------|-------------|
| `users` | Perfiles de usuario con roles |
| `companies` | Empresas del grupo |
| `accounts` | Cuentas bancarias |
| `creditLines` | Pólizas de crédito |
| `transactions` | Movimientos (cobros/pagos) |
| `recurrences` | Movimientos recurrentes |
| `thirdParties` | Terceros (clientes/proveedores) |
| `dailySnapshots` | Snapshots diarios de posición |
| `scenarios` | Escenarios what-if |
| `alertConfigs` | Configuración de alertas |
| `alerts` | Alertas generadas |

## 🔐 Roles de Usuario

| Rol | Permisos |
|-----|----------|
| `ADMIN` | Acceso total |
| `TREASURY_MANAGER` | CRUD completo, sin gestión de usuarios |
| `COMPANY_MANAGER` | CRUD en empresas asignadas |
| `VIEWER` | Solo lectura |

## ⚡ Cloud Functions

1. **calculateRunway**: Calcula días de runway cuando cambian saldos
2. **projectCashflow**: Genera proyección de flujo de caja (HTTP callable)
3. **checkAlerts**: Evalúa configuraciones de alertas
4. **checkStaleData**: Verifica datos sin actualizar (cada 6h)
5. **generateRecurrences**: Genera movimientos recurrentes (diario 6:00)
6. **createDailySnapshot**: Crea snapshot de posición (diario 23:59)

## 🎨 Tipos de Alertas

1. **Liquidez mínima**: Avisa cuando la liquidez baje de X€
2. **Runway crítico**: Alerta si el runway baja de X días
3. **Vencimientos concentrados**: Avisa si hay más de X€ de vencimientos en una semana
4. **Póliza baja**: Notifica cuando el disponible de póliza baje del 20%
5. **Cobros atrasados**: Facturas con más de X días de retraso
6. **Dato caduco**: Saldo lleva >48h sin actualizarse
7. **Necesidad póliza**: Proyección de necesidad de crédito

## 🧪 Testing con Emuladores

```bash
firebase emulators:start
```

Accede a la UI de emuladores en [http://localhost:4000](http://localhost:4000)

## 📝 Scripts Disponibles

```bash
npm run dev          # Desarrollo
npm run build        # Build de producción
npm run start        # Servidor de producción
npm run lint         # Linting
```

## 📄 Licencia

Este proyecto es privado y confidencial.

---

Desarrollado para WINFIN Sistemas.
