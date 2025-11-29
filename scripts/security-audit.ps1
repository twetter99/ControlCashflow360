# Script de auditoria de seguridad para WINFIN
# Ejecutar: .\scripts\security-audit.ps1

Write-Host "AUDITORIA DE SEGURIDAD - WINFIN" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

$errors = 0
$warnings = 0

# Funcion para leer archivo como string (compatible PS 5.1)
function Read-FileContent {
    param([string]$Path)
    try {
        return [System.IO.File]::ReadAllText($Path)
    } catch {
        return ""
    }
}

# 1. Buscar archivos sensibles no ignorados
Write-Host "1. Verificando archivos sensibles..." -ForegroundColor Yellow
$sensitivePatterns = @("serviceAccountKey", "firebase-adminsdk")
# Patron para .env reales (no .example)
$envPattern = "^\.env\.(local|production)$"
foreach ($pattern in $sensitivePatterns) {
    $files = Get-ChildItem -Recurse -Name -ErrorAction SilentlyContinue | Where-Object { $_ -like "*$pattern*" }
    foreach ($file in $files) {
        $tracked = git ls-files $file 2>$null
        if ($tracked) {
            Write-Host "   CRITICO: $file esta en Git!" -ForegroundColor Red
            $errors++
        }
    }
}
# Verificar archivos .env reales (no .example)
$envFiles = Get-ChildItem -Name -ErrorAction SilentlyContinue | Where-Object { $_ -match $envPattern }
foreach ($file in $envFiles) {
    $tracked = git ls-files $file 2>$null
    if ($tracked) {
        Write-Host "   CRITICO: $file esta en Git!" -ForegroundColor Red
        $errors++
    }
}
if ($errors -eq 0) {
    Write-Host "   OK: No hay archivos sensibles en Git" -ForegroundColor Green
}

# 2. Buscar credenciales hardcodeadas
Write-Host ""
Write-Host "2. Buscando credenciales hardcodeadas..." -ForegroundColor Yellow
$credErrors = 0
$srcFiles = Get-ChildItem -Path "src" -Recurse -Include "*.ts","*.tsx" -File -ErrorAction SilentlyContinue
$credPatterns = @("AIza[0-9A-Za-z-_]{35}", "-----BEGIN PRIVATE KEY-----")
foreach ($file in $srcFiles) {
    $content = Read-FileContent -Path $file.FullName
    foreach ($pattern in $credPatterns) {
        if ($content -match $pattern) {
            Write-Host "   CRITICO: Posible credencial en $($file.Name)" -ForegroundColor Red
            $credErrors++
        }
    }
}
$errors = $errors + $credErrors
if ($credErrors -eq 0) {
    Write-Host "   OK: No se encontraron credenciales hardcodeadas" -ForegroundColor Green
}

# 3. Verificar autenticacion en endpoints
Write-Host ""
Write-Host "3. Verificando autenticacion en API routes..." -ForegroundColor Yellow
$authWarnings = 0
$apiRoutes = Get-ChildItem -Path "src/app/api" -Recurse -Include "route.ts" -File -ErrorAction SilentlyContinue
foreach ($route in $apiRoutes) {
    $content = Read-FileContent -Path $route.FullName
    $relativePath = $route.FullName -replace [regex]::Escape((Get-Location).Path + "\"), ""
    
    # Excluir health check
    if ($relativePath -notlike "*health*") {
        if ($content -notmatch "authenticateRequest") {
            Write-Host "   ADVERTENCIA: $relativePath sin authenticateRequest" -ForegroundColor Yellow
            $authWarnings++
        }
    }
}
$warnings = $warnings + $authWarnings
if ($authWarnings -eq 0) {
    Write-Host "   OK: Todos los endpoints tienen autenticacion" -ForegroundColor Green
}

# 4. Verificar validacion Zod
Write-Host ""
Write-Host "4. Verificando validacion Zod en POST/PUT..." -ForegroundColor Yellow
$zodWarnings = 0
foreach ($route in $apiRoutes) {
    $content = Read-FileContent -Path $route.FullName
    $relativePath = $route.FullName -replace [regex]::Escape((Get-Location).Path + "\"), ""
    
    if ($content -match "POST|PUT|PATCH") {
        if ($content -notmatch "parseAndValidate|validateWithSchema|safeParse") {
            if ($relativePath -notlike "*health*") {
                Write-Host "   ADVERTENCIA: $relativePath puede no tener validacion Zod" -ForegroundColor Yellow
                $zodWarnings++
            }
        }
    }
}
$warnings = $warnings + $zodWarnings
if ($zodWarnings -eq 0) {
    Write-Host "   OK: Validacion Zod presente" -ForegroundColor Green
}

# 5. Verificar TypeScript
Write-Host ""
Write-Host "5. Ejecutando TypeScript check..." -ForegroundColor Yellow
$null = npx tsc --noEmit 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ERROR: Errores de TypeScript encontrados" -ForegroundColor Red
    $errors++
} else {
    Write-Host "   OK: TypeScript sin errores" -ForegroundColor Green
}

# 6. Verificar dependencias vulnerables
Write-Host ""
Write-Host "6. Verificando dependencias vulnerables..." -ForegroundColor Yellow
try {
    $auditJson = npm audit --json 2>$null
    $auditResult = $auditJson | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($auditResult -and $auditResult.metadata -and $auditResult.metadata.vulnerabilities) {
        $highVulns = $auditResult.metadata.vulnerabilities.high
        $criticalVulns = $auditResult.metadata.vulnerabilities.critical
        if ($highVulns -gt 0 -or $criticalVulns -gt 0) {
            Write-Host "   ADVERTENCIA: Hay vulnerabilidades en dependencias" -ForegroundColor Yellow
            Write-Host "   Ejecuta npm audit para mas detalles" -ForegroundColor Gray
            $warnings++
        } else {
            Write-Host "   OK: No hay vulnerabilidades criticas en dependencias" -ForegroundColor Green
        }
    } else {
        Write-Host "   OK: npm audit completado" -ForegroundColor Green
    }
} catch {
    Write-Host "   INFO: No se pudo ejecutar npm audit" -ForegroundColor Gray
}

# Resumen
Write-Host ""
Write-Host "=================================" -ForegroundColor Cyan
Write-Host "RESUMEN" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
if ($errors -gt 0) {
    Write-Host "Errores criticos: $errors" -ForegroundColor Red
} else {
    Write-Host "Errores criticos: $errors" -ForegroundColor Green
}
if ($warnings -gt 0) {
    Write-Host "Advertencias: $warnings" -ForegroundColor Yellow
} else {
    Write-Host "Advertencias: $warnings" -ForegroundColor Green
}
Write-Host ""

if ($errors -gt 0) {
    Write-Host "AUDITORIA FALLIDA - Corrige los errores criticos antes de continuar" -ForegroundColor Red
    exit 1
} elseif ($warnings -gt 0) {
    Write-Host "AUDITORIA CON ADVERTENCIAS - Revisa las advertencias" -ForegroundColor Yellow
    exit 0
} else {
    Write-Host "AUDITORIA EXITOSA - Todo en orden" -ForegroundColor Green
    exit 0
}
