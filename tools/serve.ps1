# Tiny static file server for local development (no Node/Python needed).
param([int]$Port = 8765)

$root = Split-Path $PSScriptRoot -Parent
$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.json' = 'application/json'
  '.webmanifest' = 'application/manifest+json'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.ico'  = 'image/x-icon'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/"

while ($listener.IsListening) {
  try { $ctx = $listener.GetContext() } catch { break }
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
    $file = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
    if (-not $file.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $file -PathType Leaf)) {
      $res.StatusCode = 404
      $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not found')
    } else {
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      $type = $mime[$ext]
      if ($null -eq $type) { $type = 'application/octet-stream' }
      $res.ContentType = $type
      $res.Headers.Add('Cache-Control', 'no-cache')
      $bytes = [System.IO.File]::ReadAllBytes($file)
    }
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
    try { $res.StatusCode = 500 } catch {}
  } finally {
    try { $res.OutputStream.Close() } catch {}
  }
}
