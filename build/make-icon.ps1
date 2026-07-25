# Genera build/icon.ico multi-risoluzione da resources/icon.png.
# ICO moderno: ogni frame e' un PNG (supportato da Windows Vista+), cosi'
# manteniamo la trasparenza e la qualita' senza tool esterni.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$src = Join-Path $PSScriptRoot '..\resources\icon.png'
$out = Join-Path $PSScriptRoot 'icon.ico'
$sizes = 16,24,32,48,64,128,256

$srcBmp = [System.Drawing.Bitmap]::FromFile((Resolve-Path $src))

$frames = foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($srcBmp, 0, 0, $s, $s)
    $g.Dispose()
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    [pscustomobject]@{ Size = $s; Bytes = $ms.ToArray() }
}
$srcBmp.Dispose()

$fs = [System.IO.File]::Create($out)
$bw = New-Object System.IO.BinaryWriter $fs
# ICONDIR
$bw.Write([uint16]0)                 # reserved
$bw.Write([uint16]1)                 # type = icon
$bw.Write([uint16]$frames.Count)     # numero immagini
# ICONDIRENTRY: offset dei dati dopo header(6) + entries(16 * n)
$offset = 6 + (16 * $frames.Count)
foreach ($f in $frames) {
    $dim = if ($f.Size -ge 256) { 0 } else { $f.Size }  # 0 == 256
    $bw.Write([byte]$dim)            # larghezza
    $bw.Write([byte]$dim)            # altezza
    $bw.Write([byte]0)               # colori palette
    $bw.Write([byte]0)               # reserved
    $bw.Write([uint16]1)             # color planes
    $bw.Write([uint16]32)            # bpp
    $bw.Write([uint32]$f.Bytes.Length)
    $bw.Write([uint32]$offset)
    $offset += $f.Bytes.Length
}
foreach ($f in $frames) { $bw.Write($f.Bytes) }
$bw.Flush(); $bw.Close(); $fs.Close()

Write-Host "Creato $out ($((Get-Item $out).Length) byte, frame: $($sizes -join ', '))"
