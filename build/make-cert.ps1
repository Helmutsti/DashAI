# Genera un certificato self-signed per il CODE SIGNING e lo esporta in .pfx.
# ATTENZIONE: certificato NON attendibile pubblicamente. Windows SmartScreen
# mostrera' comunque l'avviso "editore sconosciuto" sui PC dove il certificato
# non e' stato importato tra gli "Autori attendibili" (Trusted Publishers).
# Serve ad avere la pipeline di firma pronta e a firmare per distribuzione interna.
$ErrorActionPreference = 'Stop'

$pfxPath  = Join-Path $PSScriptRoot 'DashAI-selfsigned.pfx'
$password = if ($env:CSC_KEY_PASSWORD) { $env:CSC_KEY_PASSWORD } else { 'dashai-dev' }
$subject  = 'CN=DashAI, O=Helmutsti, C=IT'

$cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject $subject `
    -KeyUsage DigitalSignature `
    -KeyAlgorithm RSA -KeyLength 3072 `
    -CertStoreLocation 'Cert:\CurrentUser\My' `
    -NotAfter (Get-Date).AddYears(5) `
    -FriendlyName 'DashAI self-signed code signing'

$sec = ConvertTo-SecureString -String $password -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $sec | Out-Null

Write-Host "Certificato creato: $pfxPath"
Write-Host "Thumbprint: $($cert.Thumbprint)"
Write-Host "Password:   $password"
Write-Host ""
Write-Host "Per firmare senza avvisi sui PC interni, importa il certificato come"
Write-Host "attendibile su ciascuna macchina (una tantum, richiede admin):"
Write-Host "  Import-Certificate -FilePath <cert-pubblico.cer> -CertStoreLocation Cert:\LocalMachine\TrustedPublisher"
