# MUBiS Yardimci Programi - sistem tepsisi (tray) simgesi
# Yardimci servis calisirken saatin yaninda kalem (MUBiS) logosunu gosterir.
# Sag tik menusu: Durum / Indirilenler Klasorunu Ac / Cikis
# Yardimci servisi kapanirsa (ping 3 kez cevapsiz) simge kendiliginden kalkar.
# NOT: index.js icinde ayni icerik gomulu durumdadir (exe modu); degisiklik
# yapilirsa index.js'teki trayBaslat() icindeki kopyayi da guncelleyin.
param(
  [string]$LogoYolu = '',
  [string]$Klasor = '',
  [string]$Surum = '',
  [int]$Port = 8765
)
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# 2.7.166: Tek ornek korumasini guclendir — eski tray-host sureci (eski
# konum koduyla) hayatta kaliyordu; yeni ps1 mutex kaybedince sessizce
# cikiyordu. Once eski surecleri durdur, sonra mutex al (her zaman guncel).
try {
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*tray-host*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Start-Sleep -Milliseconds 600
} catch { }
# Tek ornek korumasi: ikinci tray simgesi cikmaz
$mutex = New-Object System.Threading.Mutex($false, 'Global\MUBiS-GIB-Yardimci-Tray')
if (-not $mutex.WaitOne(0, $false)) { exit }

# Gizli tasici form (mesaj dongusu icin sart)
$form = New-Object System.Windows.Forms.Form
$form.WindowState = 'Minimized'
$form.ShowInTaskbar = $false
$form.FormBorderStyle = 'None'
$form.Opacity = 0

function IkonOlustur {
  if ($LogoYolu -and (Test-Path $LogoYolu)) {
    try {
      $kaynak = New-Object System.Drawing.Bitmap($LogoYolu)
      # Logo dosyasi (mubis-tray.png) zaten SADECE KAFA kirpilmis;
      # burada birebir 32x32'ye olceklenir.
      $kare = New-Object System.Drawing.Bitmap 32, 32
      $g = [System.Drawing.Graphics]::FromImage($kare)
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
      $g.Clear([System.Drawing.Color]::Transparent)
      $g.DrawImage($kaynak, 0, 0, 32, 32)
      $g.Dispose()
      $kaynak.Dispose()
      return [System.Drawing.Icon]::FromHandle($kare.GetHicon())
    } catch { }
  }
  # Logo dosyasi yoksa kalem ikonunu kendisi cizer: amber daire + beyaz kalem
  try {
    $kare = New-Object System.Drawing.Bitmap 32, 32
    $g = [System.Drawing.Graphics]::FromImage($kare)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)
    $daire = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255,245,158,11))
    $g.FillEllipse($daire, 1, 1, 30, 30)
    $kalem = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 5
    $kalem.StartCap = [System.Drawing.Drawing2D.LineCap]::Flat
    $kalem.EndCap = [System.Drawing.Drawing2D.LineCap]::Flat
    $g.DrawLine($kalem, 13, 19, 23, 9)
    $gri = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255,55,65,81))
    $ucgen = [System.Drawing.Point[]]@(
      (New-Object System.Drawing.Point 9, 23),
      (New-Object System.Drawing.Point 15, 21),
      (New-Object System.Drawing.Point 11, 17)
    )
    $g.FillPolygon($gri, $ucgen)
    $g.Dispose()
    return [System.Drawing.Icon]::FromHandle($kare.GetHicon())
  } catch { return $null }
}
$icon = IkonOlustur

$ni = New-Object System.Windows.Forms.NotifyIcon
if ($icon) { $ni.Icon = $icon } else { $ni.Icon = [System.Drawing.SystemIcons]::Application }
$ni.Text = ('MUBiS Yardimci' + $(if ($Surum) { " $Surum" }) + ' - Calisiyor (Port ' + $Port + ')')
$ni.Visible = $true

# Sag tik menusu
$menu = New-Object System.Windows.Forms.ContextMenuStrip

$durum = $menu.Items.Add(('MUBiS Yardimci' + $(if ($Surum) { " $Surum" }) + ' - Calisiyor'))
$durum.Enabled = $false
$menu.Items.Add('-') | Out-Null

$klasorItem = $menu.Items.Add('Indirilenler Klasorunu Ac')
$klasorItem.add_Click({
  $hedef = $Klasor
  if (-not $hedef) { $hedef = Join-Path (Join-Path $env:USERPROFILE 'Downloads') 'indirilenler' }
  if (Test-Path $hedef) { Start-Process explorer.exe $hedef }
})

$yenile = $menu.Items.Add('Durumu Yenile')
$yenile.add_Click({
  try {
    Invoke-WebRequest -Uri ("http://127.0.0.1:" + $Port + "/ping") -UseBasicParsing -TimeoutSec 3 | Out-Null
    $ni.BalloonTipTitle = 'MUBiS Yardimci Programi'
    $ni.BalloonTipText = 'Servis calisiyor (Port ' + $Port + ')'
    $ni.ShowBalloonTip(2000)
  } catch {
    $ni.BalloonTipTitle = 'MUBiS Yardimci Programi'
    $ni.BalloonTipText = 'Servis CEVAP VERMIYOR - MUBiS uzerinden islemler calismayabilir.'
    $ni.ShowBalloonTip(3000)
  }
})

$menu.Items.Add('-') | Out-Null

# 2.7.237 Guncelle: surumu kontrol eder, yeni surum varsa indirme linkini acar
$guncelle = $menu.Items.Add('Guncelle')
$guncelle.add_Click({
  $mevcut = ''
  try {
    $pingJson = (Invoke-WebRequest -Uri ("http://127.0.0.1:" + $Port + "/ping") -UseBasicParsing -TimeoutSec 3).Content | ConvertFrom-Json
    $mevcut = $pingJson.version
  } catch { }
  $enYeni = ''
  try {
    $surumJson = (Invoke-WebRequest -Uri 'https://mubiserp.com/downloads/helper-surum.json' -UseBasicParsing -TimeoutSec 10).Content | ConvertFrom-Json
    $enYeni = $surumJson.surum
  } catch { }
  if ($enYeni -and $mevcut -and ($enYeni.Trim() -ne $mevcut.Trim())) {
    Start-Process 'https://gxuqrxmpgoeyykoolmwv.supabase.co/storage/v1/object/public/indirilenler/mubis-gib-yardimci.zip'
    $ni.BalloonTipTitle = 'MUBiS Guncelleme'
    $ni.BalloonTipText = ('Yeni surum ' + $enYeni + ' indiriliyor (mevcut: ' + $mevcut + '). Zip dosyasini acip yeni exe yi calistirin.')
    $ni.ShowBalloonTip(6000)
  } else {
    if (-not $mevcut) { $mevcut = 'bilinmiyor' }
    $ni.BalloonTipTitle = 'MUBiS Guncelleme'
    $ni.BalloonTipText = ('Program guncel: ' + $mevcut)
    $ni.ShowBalloonTip(3000)
  }
})

$menu.Items.Add('-') | Out-Null
$cikis = $menu.Items.Add('Cikis')
$cikis.add_Click({
  # Yardimci servisini de kapat (kullanici buradan tamamen kapatabilsin)
  Get-Process 'mubis-gib-yardimci*' -ErrorAction SilentlyContinue | Stop-Process -Force
  $form.Close()
})

# Menuyu tepsi simgesine bagla: SAG tik menuyu otomatik acar
$ni.ContextMenuStrip = $menu

# Sol tek tik: menuyu imlec konumunda ac (guncelleme + kapatma erisimi)
$ni.add_Click({
  if ($_.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
    try { $menu.Show([System.Windows.Forms.Cursor]::Position) } catch { }
  }
})

# Gozcu: servis olurse simge kaldirilir
$hataSayisi = 0

# 2.7.159: Bildirimleri Windows balonu yerine KENDI topmost penceresi olarak
# gosterir. Windows balonu saatin ustunde acilir ve MUBiS AI balonunun altinda
# kaliyordu; bu pencere sag alt koseden ~420px SOLDA acilarak okunur kalir.
function Goster-Bildirim {
  param([string]$Baslik, [string]$Mesaj, [int]$Sira = 0, [string]$Url = '')
  try {
    $gen = 380
    $yuk = 130
    $alan = [System.Windows.Forms.SystemInformation]::WorkingArea
    # 2.7.174: MUBiS simgesiyle cakismasin — sagdan 1050px SOLDA
    # (kucuk ekranda kenara dayanmasin: min 10px)
    $x = [Math]::Max(10, $alan.Right - $gen - 1050)
    $y = $alan.Bottom - $yuk - 80 - ($Sira * ($yuk + 8))
    $tf = New-Object System.Windows.Forms.Form
    $tf.FormBorderStyle = 'None'
    $tf.TopMost = $true
    $tf.ShowInTaskbar = $false
    $tf.StartPosition = 'Manual'
    $tf.Bounds = New-Object System.Drawing.Rectangle($x, $y, $gen, $yuk)
    $tf.BackColor = [System.Drawing.Color]::FromArgb(15, 23, 42)
    $lblT = New-Object System.Windows.Forms.Label
    $lblT.Text = $Baslik
    $lblT.ForeColor = [System.Drawing.Color]::FromArgb(251, 191, 36)
    $lblT.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
    $lblT.Bounds = New-Object System.Drawing.Rectangle(14, 10, $gen - 28, 22)
    $lblM = New-Object System.Windows.Forms.Label
    $lblM.Text = $Mesaj
    $lblM.ForeColor = [System.Drawing.Color]::FromArgb(226, 232, 240)
    $lblM.Font = New-Object System.Drawing.Font('Segoe UI', 9)
    $lblM.Bounds = New-Object System.Drawing.Rectangle(14, 38, $gen - 28, $yuk - 50)
    $tf.Controls.Add($lblT)
    $tf.Controls.Add($lblM)
    # 2.8.3: Url verildiyse bildirim TIKLANABILIR — tiklaninca varsayilan
    # tarayicida ilgili sayfa acilir (web sayfasi kapaliyken de uyaridan
    # dogrudan tebligatlara gidilir).
    if ($Url) {
      $tf.Cursor = [System.Windows.Forms.Cursors]::Hand
      $lblI = New-Object System.Windows.Forms.Label
      $lblI.Text = 'Acmak icin tiklayin'
      $lblI.ForeColor = [System.Drawing.Color]::FromArgb(148, 163, 184)
      $lblI.Font = New-Object System.Drawing.Font('Segoe UI', 8, [System.Drawing.FontStyle]::Underline)
      $lblI.Bounds = New-Object System.Drawing.Rectangle(14, $yuk - 22, $gen - 28, 16)
      $tf.Controls.Add($lblI)
      $ac = { try { Start-Process $Url } catch { } ; try { $tf.Close() } catch { } }
      $tf.add_Click($ac)
      $lblT.add_Click($ac)
      $lblM.add_Click($ac)
      $lblI.add_Click($ac)
    }
    $timerT = New-Object System.Windows.Forms.Timer
    $timerT.Interval = 9000
    $timerT.add_Tick({ $tf.Close() })
    $timerT.Start()
    $tf.add_FormClosed({ $timerT.Stop() })
    $tf.Show()
  } catch {
    # Ozel pencere acilamazsa eski balona dus
    try {
      $ni.BalloonTipTitle = $Baslik
      $ni.BalloonTipText = $Mesaj
      $ni.ShowBalloonTip(6000)
    } catch { }
  }
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.add_Tick({
  try {
    # 2.8.3: kaynak=tray ile aliniyor — bildirim kuyrugu SADECE tray tarafindan
    # bosaltılır; web sayfasi /ping aldiginda bildirimler kaybolmaz.
    $pingIcerik = (Invoke-WebRequest -Uri ("http://127.0.0.1:" + $Port + "/ping?kaynak=tray") -UseBasicParsing -TimeoutSec 2).Content
    $script:hataSayisi = 0
    $pingVeri = $null
    try { $pingVeri = $pingIcerik | ConvertFrom-Json } catch { }
    if ($pingVeri -and $pingVeri.version) {
      $yeniMetin = "MUBiS Yardimci " + $pingVeri.version + " - Calisiyor (Port " + $Port + ")"
      if ($ni.Text -ne $yeniMetin) {
        $ni.Text = $yeniMetin
        $script:durum.Text = "MUBiS Yardimci " + $pingVeri.version + " - Calisiyor"
      }
    }
    # 2.7.157: /ping cevabindaki bekleyen bildirimler — sag alttan SOLDA
    # acilan topmost pencerede gosterilir (MUBiS AI balonuna benzemez).
    # 2.8.3: bildirimde url varsa tiklanabilir pencerede gosterilir.
    if ($pingVeri -and $pingVeri.bildirimler) {
      $sira = 0
      foreach ($b in @($pingVeri.bildirimler)) {
        if ($b -and $b.mesaj) {
          $balBaslik = $b.baslik
          if (-not $balBaslik) { $balBaslik = 'MUBiS' }
          $balUrl = $b.url
          if (-not $balUrl) { $balUrl = '' }
          Goster-Bildirim -Baslik $balBaslik -Mesaj $b.mesaj -Sira $sira -Url $balUrl
          $sira++
        }
      }
    }
  } catch {
    $script:hataSayisi++
    if ($script:hataSayisi -ge 3) { $form.Close() }
  }
})
$timer.Start()

$form.add_Shown({ $form.Hide() })
$form.add_FormClosed({
  $timer.Stop()
  $ni.Visible = $false
  $ni.Dispose()
})
[System.Windows.Forms.Application]::Run($form)
