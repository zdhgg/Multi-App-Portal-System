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
```powershell
# 妫€鏌?Node.js
node --version  # 搴旇鏄剧ず v18+ 鎴栨洿楂?

# 妫€鏌?npm
npm --version

# 妫€鏌?PM2
pm2 --version
```

## 甯哥敤鍛戒护

- 鏌ョ湅鐘舵€? pm2 status
- 鏌ョ湅鏃ュ織: pm2 logs portal-api
- 閲嶅惎鏈嶅姟: pm2 restart portal-api
- 鍋滄鏈嶅姟: pm2 stop portal-api

## 鏁呴殰鎺掓煡

1. 绔彛琚崰鐢?
   - 妫€鏌?8001 绔彛: netstat -ano | findstr :8001
   - 淇敼绔彛: 缂栬緫 ecosystem-prod-loader.config.js

2. 鏈嶅姟鍚姩澶辫触
   - 鏌ョ湅鏃ュ織: pm2 logs portal-api --lines 50
   - 妫€鏌ヤ緷璧? 纭繚 node_modules 鏂囦欢澶瑰畬鏁?

3. 椤甸潰鏃犳硶璁块棶
   - 妫€鏌ラ槻鐏璁剧疆
   - 纭鏈嶅姟宸插惎鍔? pm2 status

## 鎶€鏈敮鎸?

椤圭洰鐗堟湰: v1.0.0
鐢熸垚鏃堕棿: 2025-11-10 11:21:31
