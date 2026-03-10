#!/usr/bin/env pwsh
# 鍑嗗绂荤嚎閮ㄧ讲鍖呰剼鏈?

Write-Host "馃摝 鍑嗗绂荤嚎閮ㄧ讲鍖?.." -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot

# 1. 妫€鏌ヤ緷璧栨槸鍚﹀畬鏁?
Write-Host "`n馃攳 姝ラ 1/5: 妫€鏌ラ」鐩緷璧?.." -ForegroundColor Yellow

Set-Location "$projectRoot\detection-api"
if (-not (Test-Path "node_modules")) {
    Write-Host "   姝ｅ湪瀹夎鍚庣渚濊禆..." -ForegroundColor Gray
    npm install
}
Write-Host "   鉁?鍚庣渚濊禆瀹屾暣" -ForegroundColor Green

Set-Location "$projectRoot\main-portal"
if (-not (Test-Path "node_modules")) {
    Write-Host "   姝ｅ湪瀹夎鍓嶇渚濊禆..." -ForegroundColor Gray
    npm install
}
Write-Host "   鉁?鍓嶇渚濊禆瀹屾暣" -ForegroundColor Green

# 2. 鏋勫缓鍓嶇
Write-Host "`n馃彈锔? 姝ラ 2/5: 鏋勫缓鍓嶇..." -ForegroundColor Yellow
Set-Location "$projectRoot\main-portal"
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
}
npm run build
Write-Host "   鉁?鍓嶇鏋勫缓瀹屾垚" -ForegroundColor Green

# 3. 娓呯悊涓嶅繀瑕佺殑鏂囦欢
Write-Host "`n馃Ч 姝ラ 3/5: 娓呯悊涓存椂鏂囦欢..." -ForegroundColor Yellow
Set-Location $projectRoot

$cleanupPaths = @(
    "detection-api\logs\*.log",
    "detection-api\data\*.db-shm",
    "detection-api\data\*.db-wal",
    "detection-api\data\test-*.db",
    "detection-api\cache\*",
    "main-portal\.vite",
    "main-portal\node_modules\.cache",
    ".git\*.log"
)

foreach ($path in $cleanupPaths) {
    if (Test-Path $path) {
        Remove-Item -Path $path -Recurse -Force -ErrorAction SilentlyContinue
    }
}
Write-Host "   鉁?娓呯悊瀹屾垚" -ForegroundColor Green

# 4. 鍒涘缓閮ㄧ讲璇存槑鏂囦欢
Write-Host "`n馃摑 姝ラ 4/5: 鍒涘缓閮ㄧ讲璇存槑..." -ForegroundColor Yellow

$deploymentGuide = @"
# 绂荤嚎閮ㄧ讲鎸囧崡

## 鍐呯綉鐢佃剳蹇呭杞欢
1. Node.js v18+ (鎺ㄨ崘 v22.x)
   - 瀹夎鍖咃細璇蜂粠鏈洰褰曠殑 installers 鏂囦欢澶硅幏鍙?
   - 鎴栦粠 https://nodejs.org 涓嬭浇

2. PM2锛圢ode.js 瀹夎鍚庢墽琛岋級
   - 鍦ㄦ湰鐩綍鎵ц: npm install -g pm2

## 閮ㄧ讲姝ラ

### 鏂规硶涓€锛氫娇鐢ㄤ竴閿惎鍔ㄨ剼鏈紙鎺ㄨ崘锛?
1. 瑙ｅ帇鏈枃浠跺す鍒颁换鎰忎綅缃?
2. 鎵撳紑 PowerShell锛岃繘鍏ラ」鐩洰褰?
3. 鎵ц: .\start-production.ps1
4. 娴忚鍣ㄨ闂? http://localhost:8002

### 鏂规硶浜岋細鎵嬪姩鍚姩
1. 瑙ｅ帇鏈枃浠跺す
2. 鎵撳紑 PowerShell
3. cd 鍒伴」鐩洰褰?
4. 鎵ц: pm2 start ecosystem-prod-loader.config.js --env production
5. 鏌ョ湅鐘舵€? pm2 status

## 楠岃瘉瀹夎

杩愯浠ヤ笅鍛戒护妫€鏌ョ幆澧冿細
``````powershell
# 妫€鏌?Node.js
node --version  # 搴旇鏄剧ず v18+ 鎴栨洿楂?

# 妫€鏌?npm
npm --version

# 妫€鏌?PM2
pm2 --version
``````

## 甯哥敤鍛戒护

- 鏌ョ湅鐘舵€? pm2 status
- 鏌ョ湅鏃ュ織: pm2 logs portal-api
- 閲嶅惎鏈嶅姟: pm2 restart portal-api
- 鍋滄鏈嶅姟: pm2 stop portal-api

## 鏁呴殰鎺掓煡

1. 绔彛琚崰鐢?
   - 妫€鏌?8002 绔彛: netstat -ano | findstr :8002
   - 淇敼绔彛: 缂栬緫 ecosystem-prod-loader.config.js

2. 鏈嶅姟鍚姩澶辫触
   - 鏌ョ湅鏃ュ織: pm2 logs portal-api --lines 50
   - 妫€鏌ヤ緷璧? 纭繚 node_modules 鏂囦欢澶瑰畬鏁?

3. 椤甸潰鏃犳硶璁块棶
   - 妫€鏌ラ槻鐏璁剧疆
   - 纭鏈嶅姟宸插惎鍔? pm2 status

## 鎶€鏈敮鎸?

椤圭洰鐗堟湰: v1.0.0
鐢熸垚鏃堕棿: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
"@

Set-Content -Path "$projectRoot\OFFLINE_DEPLOYMENT.md" -Value $deploymentGuide -Encoding UTF8
Write-Host "   鉁?閮ㄧ讲璇存槑宸插垱寤? -ForegroundColor Green

# 5. 鍒涘缓妫€鏌ヨ剼鏈?
Write-Host "`n馃敡 姝ラ 5/5: 鍒涘缓鐜妫€鏌ヨ剼鏈?.." -ForegroundColor Yellow

$checkScript = @'
#!/usr/bin/env pwsh
# 鐜妫€鏌ヨ剼鏈?

Write-Host "馃攳 妫€鏌ラ儴缃茬幆澧?.." -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

$issues = @()

# 妫€鏌?Node.js
Write-Host "`n1. 妫€鏌?Node.js..."
try {
    $nodeVersion = node --version
    Write-Host "   鉁?Node.js: $nodeVersion" -ForegroundColor Green
    
    $versionNumber = [version]($nodeVersion -replace 'v', '')
    if ($versionNumber.Major -lt 18) {
        $issues += "Node.js 鐗堟湰杩囦綆锛岄渶瑕?v18 鎴栨洿楂?
    }
} catch {
    Write-Host "   鉂?Node.js 鏈畨瑁? -ForegroundColor Red
    $issues += "璇峰厛瀹夎 Node.js (https://nodejs.org)"
}

# 妫€鏌?npm
Write-Host "`n2. 妫€鏌?npm..."
try {
    $npmVersion = npm --version
    Write-Host "   鉁?npm: v$npmVersion" -ForegroundColor Green
} catch {
    Write-Host "   鉂?npm 鏈畨瑁? -ForegroundColor Red
    $issues += "npm 搴旇闅?Node.js 涓€璧峰畨瑁?
}

# 妫€鏌?PM2
Write-Host "`n3. 妫€鏌?PM2..."
try {
    $pm2Version = pm2 --version
    Write-Host "   鉁?PM2: v$pm2Version" -ForegroundColor Green
} catch {
    Write-Host "   鈿狅笍  PM2 鏈畨瑁? -ForegroundColor Yellow
    Write-Host "   杩愯: npm install -g pm2" -ForegroundColor Gray
    $issues += "璇峰畨瑁?PM2: npm install -g pm2"
}

# 妫€鏌ラ」鐩枃浠?
Write-Host "`n4. 妫€鏌ラ」鐩枃浠?.."
$requiredPaths = @(
    "detection-api/node_modules",
    "detection-api/src",
    "main-portal/dist",
    "ecosystem-prod-loader.config.js",
    "start-production.ps1"
)

foreach ($path in $requiredPaths) {
    if (Test-Path $path) {
        Write-Host "   鉁?$path" -ForegroundColor Green
    } else {
        Write-Host "   鉂?$path 缂哄け" -ForegroundColor Red
        $issues += "缂哄皯蹇呴渶鏂囦欢: $path"
    }
}

# 妫€鏌ョ鍙?
Write-Host "`n5. 妫€鏌ョ鍙ｅ崰鐢?.."
$portCheck = netstat -ano | findstr :8002
if ($portCheck) {
    Write-Host "   鈿狅笍  绔彛 8002 宸茶鍗犵敤" -ForegroundColor Yellow
    Write-Host "   $portCheck" -ForegroundColor Gray
} else {
    Write-Host "   鉁?绔彛 8002 鍙敤" -ForegroundColor Green
}

# 鎬荤粨
Write-Host "`n" + "=" * 60 -ForegroundColor Cyan
if ($issues.Count -eq 0) {
    Write-Host "鉁?鐜妫€鏌ラ€氳繃锛屽彲浠ラ儴缃诧紒" -ForegroundColor Green
    Write-Host "`n杩愯 .\start-production.ps1 鍚姩鏈嶅姟" -ForegroundColor Cyan
} else {
    Write-Host "鉂?鍙戠幇 $($issues.Count) 涓棶棰橈細" -ForegroundColor Red
    foreach ($issue in $issues) {
        Write-Host "   鈥?$issue" -ForegroundColor Yellow
    }
}
Write-Host "=" * 60 -ForegroundColor Cyan
'@

Set-Content -Path "$projectRoot\check-environment.ps1" -Value $checkScript -Encoding UTF8
Write-Host "   鉁?妫€鏌ヨ剼鏈凡鍒涘缓" -ForegroundColor Green

# 瀹屾垚
Write-Host "`n" + "=" * 60 -ForegroundColor Cyan
Write-Host "鉁?绂荤嚎閮ㄧ讲鍖呭噯澶囧畬鎴愶紒" -ForegroundColor Green
Write-Host "=" * 60 -ForegroundColor Cyan

Write-Host "`n馃摝 鍖呭惈鍐呭锛? -ForegroundColor Cyan
Write-Host "   鈥?瀹屾暣鐨勯」鐩唬鐮佸拰渚濊禆" -ForegroundColor White
Write-Host "   鈥?宸叉瀯寤虹殑鍓嶇鏂囦欢" -ForegroundColor White
Write-Host "   鈥?PM2 閰嶇疆鏂囦欢" -ForegroundColor White
Write-Host "   鈥?鍚姩鑴氭湰" -ForegroundColor White
Write-Host "   鈥?閮ㄧ讲鏂囨。" -ForegroundColor White

Write-Host "`n馃搵 涓嬩竴姝ワ細" -ForegroundColor Cyan
Write-Host "   1. 灏嗘暣涓枃浠跺す鎵撳寘锛坺ip/tar.gz锛? -ForegroundColor White
Write-Host "   2. 鎷疯礉鍒板唴缃戠數鑴? -ForegroundColor White
Write-Host "   3. 瑙ｅ帇鍒颁换鎰忎綅缃? -ForegroundColor White
Write-Host "   4. 鍦ㄥ唴缃戠數鑴戣繍琛?.\check-environment.ps1 妫€鏌ョ幆澧? -ForegroundColor White
Write-Host "   5. 杩愯 .\start-production.ps1 鍚姩鏈嶅姟" -ForegroundColor White

Write-Host "`n鈿狅笍  閲嶈鎻愮ず锛? -ForegroundColor Yellow
Write-Host "   鍐呯綉鐢佃剳闇€瑕佸厛瀹夎 Node.js 鍜?PM2" -ForegroundColor White
Write-Host "   寤鸿涓嬭浇 Node.js 瀹夎鍖呬竴璧锋嫹璐濊繃鍘? -ForegroundColor White

Write-Host "`n" + "=" * 60 -ForegroundColor Cyan

