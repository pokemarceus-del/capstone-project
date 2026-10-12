param(
    [string]$KubeContext = 'kind-aquaflow-m10',
    [string]$Namespace = 'aquaflow',
    [string]$EnvFile = (Join-Path $PSScriptRoot '.env'),
    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
    throw "Runtime secret input file not found: $EnvFile. Copy .env.example to .env and fill it locally."
}

$requiredKeys = @(
    'jwt-active-kid',
    'jwt-private-key-b64',
    'jwt-public-keys-json',
    'auth-database-url',
    'billing-database-url',
    'customer-database-url',
    'reading-database-url',
    'redis-url',
    'rabbitmq-url',
    'minio-access-key',
    'minio-secret-key'
)
$presentKeys = @()
$lineNumber = 0
foreach ($line in Get-Content -LiteralPath $EnvFile) {
    $lineNumber++
    if ($line -match '^\s*(#.*)?$') {
        continue
    }
    if ($line -notmatch '^\s*([A-Za-z0-9_.-]+)=') {
        throw "Invalid runtime secret env-file format at line $lineNumber."
    }
    $presentKeys += $Matches[1]
}

$missingKeys = @($requiredKeys | Where-Object { $_ -notin $presentKeys })
if ($missingKeys.Count -gt 0) {
    throw "Runtime secret env file is missing required keys: $($missingKeys -join ', ')."
}

if ($ValidateOnly) {
    Write-Output 'Runtime secret input has all required keys; no values were displayed or applied.'
    exit 0
}

& kubectl --context $KubeContext get namespace $Namespace --output=name *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Namespace '$Namespace' is not available in context '$KubeContext'."
}

$createArgs = @(
    '--context', $KubeContext,
    'create', 'secret', 'generic', 'aquaflow-runtime',
    '--namespace', $Namespace,
    '--from-env-file', $EnvFile,
    '--dry-run=client',
    '--output=yaml'
)
$secretManifest = & kubectl @createArgs
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

$secretManifest | & kubectl --context $KubeContext apply --filename=-
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
