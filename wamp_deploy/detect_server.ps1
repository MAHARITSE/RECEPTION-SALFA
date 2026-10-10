# ==============================================================================
# RÉCEPTION SALFA - Détection serveur WAMP & Gestion Imprimante 80mm Kiosque
# ==============================================================================
param(
    [string]$savedIpFile = "",
    [switch]$selectPrinter = $false,
    [switch]$showPrinter = $false,
    [switch]$getPrinter = $false
)

$configDir = "$env:LOCALAPPDATA\ReceptionSalfa"
$printerFile = "$configDir\printer_name.txt"

if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force -ErrorAction SilentlyContinue | Out-Null
}

# ------------------------------------------------------------------------------
# A. RÉCUPÉRATION DE LA LISTE DES IMPRIMANTES
# ------------------------------------------------------------------------------
function Get-SystemPrinters {
    $list = @()
    try {
        $list = @(Get-CimInstance Win32_Printer -ErrorAction Stop | Sort-Object Name)
    } catch {
        try {
            $list = @(Get-WmiObject Win32_Printer -ErrorAction Stop | Sort-Object Name)
        } catch {}
    }
    return $list
}

function Get-CurrentDefaultPrinter {
    # 1. Vérifier si une imprimante a été explicitement mémorisée pour Réception SALFA
    if (Test-Path $printerFile) {
        try {
            $saved = (Get-Content $printerFile -Raw -ErrorAction SilentlyContinue).Trim()
            if ($saved) { return $saved }
        } catch {}
    }

    # 2. Imprimante par défaut Windows actuelle
    try {
        $printers = Get-SystemPrinters
        $def = $printers | Where-Object { $_.Default } | Select-Object -First 1
        if ($def) { return $def.Name }
        if ($printers.Count -gt 0) { return $printers[0].Name }
    } catch {}

    return "Aucune"
}

# ------------------------------------------------------------------------------
# B. RENVOYER UNIQUEMENT LE NOM DE L'IMPRIMANTE ACTUELLE (-getPrinter)
# ------------------------------------------------------------------------------
if ($getPrinter) {
    Write-Output (Get-CurrentDefaultPrinter)
    exit 0
}

# ------------------------------------------------------------------------------
# C. AFFICHER L'IMPRIMANTE ACTUELLE (-showPrinter)
# ------------------------------------------------------------------------------
if ($showPrinter) {
    $current = Get-CurrentDefaultPrinter
    Write-Host "  Imprimante ticket / reçus : $current" -ForegroundColor Cyan
    exit 0
}

# ------------------------------------------------------------------------------
# D. SÉLECTION INTERACTIVE DE L'IMPRIMANTE TICKET (-selectPrinter)
# ------------------------------------------------------------------------------
if ($selectPrinter) {
    try {
        $printers = Get-SystemPrinters
        if ($printers.Count -eq 0) {
            Write-Host "Aucune imprimante détectée sous Windows." -ForegroundColor Red
            exit 0
        }

        $currentDef = Get-CurrentDefaultPrinter
        Write-Host ""
        Write-Host "============================================================================" -ForegroundColor Yellow
        Write-Host "  CHOIX DE L'IMPRIMANTE TICKET PAR DEFAUT POUR RECEPTION SALFA (80MM)" -ForegroundColor Yellow
        Write-Host "============================================================================" -ForegroundColor Yellow
        Write-Host "Choisissez l'imprimante pour l'impression directe des tickets et reçus :"
        Write-Host ""

        for ($i = 0; $i -lt $printers.Count; $i++) {
            $p = $printers[$i]
            $tag = ""
            if ($p.Name -eq $currentDef) {
                $tag = " [ACTUELLE / DEFAUT]"
            } elseif ($p.Default) {
                $tag = " [DEFAUT WINDOWS]"
            }
            Write-Host "  [$($i+1)] $($p.Name)$tag"
        }

        Write-Host ""
        $choice = Read-Host "Entrez le numéro de l'imprimante à utiliser dans Réception SALFA"

        if ($choice -match '^\d+$' -and [int]$choice -ge 1 -and [int]$choice -le $printers.Count) {
            $selected = $printers[[int]$choice - 1]
            $printerName = $selected.Name

            # Fermer les instances Kiosque en cours pour débloquer le fichier Preferences
            try {
                taskkill /f /im chrome.exe /fi "WINDOWTITLE eq Réception SALFA*" 2>$null | Out-Null
                taskkill /f /im msedge.exe /fi "WINDOWTITLE eq Réception SALFA*" 2>$null | Out-Null
            } catch {}

            # 1. Désactiver la gestion automatique Windows 10/11 qui modifie l'imprimante
            try {
                Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Windows" -Name "LegacyDefaultPrinterMode" -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
            } catch {}

            # 2. Définir l'imprimante par défaut au niveau Windows (commande Win32 native printui)
            try {
                Start-Process -FilePath "rundll32.exe" -ArgumentList "printui.dll,PrintUIEntry /y /n `"$printerName`"" -NoNewWindow -Wait -ErrorAction SilentlyContinue
            } catch {}

            # Fallbacks WScript & WMI
            try {
                (New-Object -ComObject WScript.Network).SetDefaultPrinter($printerName)
            } catch {}

            try {
                $escaped = $printerName.Replace("'", "''")
                $cimP = Get-CimInstance Win32_Printer -Filter "Name='$escaped'" -ErrorAction SilentlyContinue
                if ($cimP) { Invoke-CimMethod -InputObject $cimP -MethodName SetDefaultPrinter -ErrorAction SilentlyContinue | Out-Null }
            } catch {}

            # 3. Mémoriser le nom dans le fichier de configuration
            try {
                Set-Content -Path $printerFile -Value $printerName -Encoding UTF8 -Force
            } catch {}

            # 4. Injecter directement dans le profil Kiosque Chrome/Edge (80mm sans marge)
            try {
                $prefDir = "$configDir\KioskProfile\Default"
                if (-not (Test-Path $prefDir)) {
                    New-Item -ItemType Directory -Path $prefDir -Force -ErrorAction SilentlyContinue | Out-Null
                }

                $prefFile = Join-Path $prefDir "Preferences"
                $appStateObj = @{
                    version = 2
                    recentDestinations = @(
                        @{
                            id = $printerName
                            origin = "local"
                            account = ""
                            capabilities = @{}
                            displayName = $printerName
                            extensionId = ""
                            extensionName = ""
                        }
                    )
                    isHeaderFooterEnabled = $false
                    isCssBackgroundEnabled = $true
                    marginsType = 2
                    mediaSize = @{
                        name = "CUSTOM"
                        width_microns = 80000
                        height_microns = 297000
                    }
                }

                $appStateJson = ConvertTo-Json -Compress $appStateObj
                $prefsObj = @{
                    printing = @{
                        print_preview_sticky_settings = @{
                            appState = $appStateJson
                        }
                    }
                }

                if (Test-Path $prefFile) {
                    try {
                        $raw = Get-Content $prefFile -Raw -Encoding UTF8 -ErrorAction Stop | ConvertFrom-Json
                        if (-not $raw.printing) { $raw | Add-Member -MemberType NoteProperty -Name "printing" -Value @{} }
                        $raw.printing.print_preview_sticky_settings = @{ appState = $appStateJson }
                        $raw | ConvertTo-Json -Depth 15 | Set-Content $prefFile -Encoding UTF8 -Force
                    } catch {
                        $prefsObj | ConvertTo-Json -Depth 10 | Set-Content $prefFile -Encoding UTF8 -Force
                    }
                } else {
                    $prefsObj | ConvertTo-Json -Depth 10 | Set-Content $prefFile -Encoding UTF8 -Force
                }
            } catch {}

            Write-Host ""
            Write-Host "✓ Imprimante ticket enregistrée : '$printerName'" -ForegroundColor Green
            Write-Host "✓ Format réglé sur 80mm sans marge pour l'impression directe." -ForegroundColor Green
            Write-Host ""
        } else {
            Write-Host "Aucun changement d'imprimante effectué." -ForegroundColor Gray
        }
    } catch {
        Write-Host "Erreur lors de la configuration de l'imprimante : $_" -ForegroundColor Red
    }
    exit 0
}

# ------------------------------------------------------------------------------
# E. DÉTECTION AUTOMATIQUE DE L'ADRESSE DU SERVEUR WAMP
# ------------------------------------------------------------------------------
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }

# Test rapide de connectivité TCP (évite les timeouts et les proxys)
function Test-TcpPort([string]$hostOrIp, [int]$port, [int]$timeoutMs = 600) {
    if ([string]::IsNullOrWhiteSpace($hostOrIp)) { return $false }
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $iar = $tcp.BeginConnect($hostOrIp, $port, $null, $null)
        if ($iar.AsyncWaitHandle.WaitOne($timeoutMs, $false)) {
            $tcp.EndConnect($iar)
            $tcp.Close()
            return $true
        }
        $tcp.Close()
    } catch {}
    return $false
}

# Test HTTP cible
function Test-SalfaUrl([string]$url, [int]$timeoutMs = 1200) {
    try {
        $req = [System.Net.HttpWebRequest]::Create($url)
        $req.Timeout = $timeoutMs
        $req.Proxy = $null
        $req.ServicePoint.Expect100Continue = $false
        $req.Method = "GET"
        $req.Headers.Add("X-Salfa-Request", "1")
        $req.AllowAutoRedirect = $true

        $res = $req.GetResponse()
        $stream = $res.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $content = $reader.ReadToEnd()
        $reader.Close()
        $res.Close()

        if ($content -match "Starlink" -or $content -match "starlink") {
            return $false
        }
        if ($content -match "RÉCEPTION SALFA" -or $content -match "reception-salfa" -or $content -match "reception_salfa" -or $content -match "SALFA" -or $content -match "salfa") {
            return $true
        }
    } catch {
        if ($_.Exception.Response) {
            try {
                $errStream = $_.Exception.Response.GetResponseStream()
                if ($errStream) {
                    $reader = New-Object System.IO.StreamReader($errStream)
                    $errContent = $reader.ReadToEnd()
                    $reader.Close()
                    if ($errContent -match "salfa" -or $errContent -match "SALFA" -or $errContent -match "reception") {
                        return $true
                    }
                }
            } catch {}
        }
    }
    return $false
}

function Test-Salfa([string]$hostOrIp, [int]$port = 80) {
    if ([string]::IsNullOrWhiteSpace($hostOrIp)) { return $false }
    $h = $hostOrIp.Trim()
    if ($h -match '^([^:]+):(\d+)$') {
        $h = $matches[1]
        $port = [int]$matches[2]
    }

    if (-not (Test-TcpPort $h $port 400)) {
        return $false
    }

    $hostWithPort = if ($port -eq 80) { $h } else { "$h`:$port" }
    $paths = @("reception-salfa", "reception_salfa", "salfa", "", "wamp_deploy")
    foreach ($p in $paths) {
        $prefix = if ($p) { "/$p" } else { "" }
        if (Test-SalfaUrl "http://$hostWithPort$prefix/api/index.php?action=info" 1000) { return $true }
        if (Test-SalfaUrl "http://$hostWithPort$prefix/" 1000) { return $true }
    }
    return $false
}

# 1. VÉRIFICATION SI NOUS SOMMES SUR LE SERVEUR LOCAL (localhost / 127.0.0.1)
$isLocalServer = $false
try {
    $procCount = @(Get-Process httpd, wampmanager, mysqld, mariadbd -ErrorAction SilentlyContinue).Count
    if ($procCount -gt 0) { $isLocalServer = $true }

    foreach ($d in @("C:", "D:", "E:")) {
        if ((Test-Path "$d\wamp64") -or (Test-Path "$d\wamp")) { $isLocalServer = $true; break }
    }

    if ((Test-Path "$PSScriptRoot\api\config.php") -or (Test-Path "$PSScriptRoot\index.html")) {
        $isLocalServer = $true
    }
} catch {}

if ($isLocalServer) {
    if (Test-TcpPort "127.0.0.1" 80 400) {
        Write-Output "localhost"
        exit 0
    }
    if (Test-TcpPort "127.0.0.1" 8080 400) {
        Write-Output "localhost:8080"
        exit 0
    }
    if (@(Get-Process httpd -ErrorAction SilentlyContinue).Count -gt 0) {
        Write-Output "localhost"
        exit 0
    }
}

foreach ($localHost in @("127.0.0.1", "localhost")) {
    foreach ($localPort in @(80, 8080, 8000)) {
        if (Test-Salfa $localHost $localPort) {
            $result = if ($localPort -eq 80) { $localHost } else { "$localHost`:$localPort" }
            Write-Output $result
            exit 0
        }
    }
}

# 2. TEST DE LA DERNIÈRE IP MÉMORISÉE
if ($savedIpFile -and (Test-Path $savedIpFile)) {
    try {
        $saved = (Get-Content $savedIpFile -Raw -ErrorAction SilentlyContinue)
        if ($saved) {
            $saved = $saved.Trim()
            if ($saved -and (Test-Salfa $saved)) {
                Write-Output $saved
                exit 0
            }
        }
    } catch {}
}

# 3. TEST SUR LE RÉSEAU LOCAL (Passerelle, ARP, sous-réseaux)
$candidates = [System.Collections.Generic.List[string]]::new()
try {
    $routes = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue
    foreach ($r in $routes) {
        if ($r.NextHop -and $r.NextHop -ne '0.0.0.0') {
            if (-not $candidates.Contains($r.NextHop)) { $candidates.Add($r.NextHop) }
        }
    }
} catch {}

try {
    $arp = (arp -a) -join "`n"
    $found = [regex]::Matches($arp, '\b(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)\b')
    foreach ($m in $found) {
        $ip = $m.Value
        if (-not $ip.EndsWith('.255') -and -not $ip.EndsWith('.0') -and -not $ip.StartsWith('127.')) {
            if (-not $candidates.Contains($ip)) { $candidates.Add($ip) }
        }
    }
} catch {}

try {
    $addrs = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' }
    foreach ($a in $addrs) {
        $parts = $a.IPAddress.Split('.')
        if ($parts.Length -eq 4) {
            $prefix = "$($parts[0]).$($parts[1]).$($parts[2])."
            if (-not $candidates.Contains($a.IPAddress)) { $candidates.Add($a.IPAddress) }
            foreach ($suffix in @(1, 50, 2, 10, 100, 20, 200, 150, 43, 254)) {
                $testIp = "$prefix$suffix"
                if (-not $candidates.Contains($testIp)) { $candidates.Add($testIp) }
            }
        }
    }
} catch {}

foreach ($ip in $candidates) {
    if (Test-Salfa $ip) {
        Write-Output $ip
        exit 0
    }
}

exit 1
