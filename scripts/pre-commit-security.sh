#!/bin/sh
# Pre-commit hook para validaciones de seguridad
# Coloca este archivo en .git/hooks/pre-commit y hazlo ejecutable

echo "🔒 Ejecutando validaciones de seguridad..."

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0

# 1. Buscar credenciales hardcodeadas
echo "Buscando credenciales hardcodeadas..."
if git diff --cached --name-only | xargs grep -l -E "(apiKey|private_key|password|secret).*=.*['\"][^'\"]{10,}" 2>/dev/null; then
    echo "${RED}❌ ALERTA: Posibles credenciales hardcodeadas encontradas${NC}"
    ERRORS=$((ERRORS + 1))
fi

# 2. Buscar archivos sensibles
echo "Verificando archivos sensibles..."
SENSITIVE_FILES=$(git diff --cached --name-only | grep -E "(serviceAccountKey|\.env\.local|\.env\.production|private.*key)")
if [ -n "$SENSITIVE_FILES" ]; then
    echo "${RED}❌ ALERTA: Archivos sensibles en staging:${NC}"
    echo "$SENSITIVE_FILES"
    ERRORS=$((ERRORS + 1))
fi

# 3. Buscar console.log con datos sensibles
echo "Buscando logs potencialmente sensibles..."
if git diff --cached | grep -E "console\.(log|error|warn).*\b(password|token|secret|key)\b" 2>/dev/null; then
    echo "${YELLOW}⚠️ ADVERTENCIA: Posibles datos sensibles en logs${NC}"
fi

# 4. Buscar endpoints sin autenticación
echo "Verificando autenticación en endpoints..."
NEW_ROUTES=$(git diff --cached --name-only | grep -E "route\.ts$")
if [ -n "$NEW_ROUTES" ]; then
    for file in $NEW_ROUTES; do
        if ! grep -q "authenticateRequest" "$file" 2>/dev/null; then
            # Excepto health check
            if ! echo "$file" | grep -q "health"; then
                echo "${YELLOW}⚠️ ADVERTENCIA: $file puede no tener autenticación${NC}"
            fi
        fi
    done
fi

# 5. Ejecutar TypeScript check
echo "Ejecutando TypeScript check..."
npx tsc --noEmit 2>/dev/null
if [ $? -ne 0 ]; then
    echo "${RED}❌ Error de TypeScript${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Resultado final
echo ""
if [ $ERRORS -gt 0 ]; then
    echo "${RED}❌ Validación fallida con $ERRORS errores${NC}"
    echo "Revisa los problemas antes de hacer commit."
    exit 1
else
    echo "${GREEN}✅ Validaciones de seguridad pasadas${NC}"
    exit 0
fi
