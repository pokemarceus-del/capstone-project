param(
    [string]$KubeContext = 'kind-aquaflow-m10'
)

$ErrorActionPreference = 'Stop'

$valuesFile = Join-Path $PSScriptRoot 'ingress-nginx-values.yaml'
$helmArgs = @(
    'upgrade', '--install', 'ingress-nginx', 'ingress-nginx',
    '--repo', 'https://kubernetes.github.io/ingress-nginx',
    '--version', '4.15.1',
    '--namespace', 'ingress-nginx',
    '--create-namespace',
    '--values', $valuesFile,
    '--kube-context', $KubeContext
)

& helm @helmArgs
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

& kubectl --context $KubeContext rollout status deployment/ingress-nginx-controller `
    --namespace ingress-nginx --timeout=180s
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Output 'Ingress controller is ready with a ClusterIP service and no host ports.'
