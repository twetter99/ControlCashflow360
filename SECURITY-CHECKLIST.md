# 🔒 Checklist de Seguridad - Pre-Implementación

Antes de implementar cualquier cambio, revisa esta lista.

---

## 📝 Información del Cambio

- **Descripción**: _______________
- **Archivos afectados**: _______________
- **Fecha**: _______________
- **Desarrollador**: _______________

---

## ✅ Checklist de Seguridad

### 1. Autenticación y Autorización
- [ ] ¿El endpoint requiere autenticación? (`authenticateRequest()`)
- [ ] ¿Se verifica ownership del recurso? (`verifyOwnership()`)
- [ ] ¿Se valida el userId en queries a Firestore?

### 2. Validación de Entrada
- [ ] ¿Todos los inputs tienen schema Zod?
- [ ] ¿Se aplica sanitización XSS? (`sanitizedString()`)
- [ ] ¿Los campos numéricos tienen límites razonables?
- [ ] ¿Las fechas se validan correctamente?

### 3. Exposición de Datos
- [ ] ¿La respuesta solo incluye datos necesarios?
- [ ] ¿No se exponen IDs internos sensibles?
- [ ] ¿Los errores no revelan información del sistema?

### 4. Queries a Base de Datos
- [ ] ¿Las queries filtran por userId?
- [ ] ¿No hay inyección NoSQL posible?
- [ ] ¿Se limita el número de resultados?

### 5. Operaciones Sensibles
- [ ] ¿Se registra en audit log? (`logCreate`, `logUpdate`, `logDelete`)
- [ ] ¿Hay validación de negocio? (ej: no eliminar con dependencias)

### 6. Rate Limiting
- [ ] ¿El endpoint está cubierto por el middleware?
- [ ] ¿Necesita rate limit especial? (auth, write)

### 7. Headers y Respuestas
- [ ] ¿No se cachean datos sensibles?
- [ ] ¿Los headers de seguridad aplican?

---

## 🚫 Señales de Alerta (Detener si aplica)

- [ ] ⚠️ Nuevo endpoint sin `authenticateRequest()`
- [ ] ⚠️ Query sin filtro de `userId`
- [ ] ⚠️ Credenciales o secretos en código
- [ ] ⚠️ `eval()`, `Function()` o código dinámico
- [ ] ⚠️ Logs con datos sensibles (passwords, tokens)
- [ ] ⚠️ Dependencia nueva sin revisar

---

## ✍️ Aprobación

- [ ] **Revisión completada**
- Resultado: ✅ Aprobado / ❌ Requiere cambios
- Notas: _______________
