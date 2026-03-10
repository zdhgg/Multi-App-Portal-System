// PM2 production config - use single-process tsx API entry
const path = require('path')

module.exports = {
  apps: [
    {
      // 闁圭厧鐡ㄥ濠氬极閵堝鏄ラ柣鎴炆戦幏鍗炃庨崶锝呭⒉濞?
      name: 'portal-api',
      script: path.join(__dirname, 'detection-api', 'pm2-entry.mjs'),
      cwd: path.join(__dirname, 'detection-api'),
      interpreter: 'node',
      windowsHide: true,
      
      // 闂佹眹鍨婚崰宥嗩殽閸ヮ剚鍋濇い鏍ㄥ嚬閺嗘棃姊洪弶璺ㄐら柣?
      instances: 1,
      exec_mode: 'fork',
      
      // 闂佺粯绮犻崹浼淬€傞妸鈺佺煑婵せ鍋撻柛锝嗘そ閺佸秹宕奸妷褍绗￠柣鐘遍檷閸婃洘鎱ㄩ悙瀛樺闁哄倶鍊楃粈澶愭煛閸愵亜鈻堟繛?--env 闂佸憡鐟ラ崐褰掑汲閻斿吋鏅?
      env: {
        NODE_ENV: 'production',
        PORT: 8002,
        HOST: '0.0.0.0',
        LOG_LEVEL: 'info',
        PM2_ENABLED: '1',  // 闂佸憡鍑归崹鎶藉极?PM2 缂備胶濯寸槐鏇㈠箖婵犲洤绀夐柣鏃囶嚙閸?
        // JWT_SECRET 婵炴垶鎸哥粔鏉戯耿椤忓嫷娼伴柕鍫濇媼濡茶京鐥褍澧扮紒槌栦邯閹秵绗熸繝鍕槷闂婎偄娲ら幊姗€濡磋箛娑欑劵婵ê纾粻鏍⒑椤斿搫濡块悹浣圭叀閹娊顢涘鍏兼濠电偛顦崝宀勫矗?
        ...(process.env.JWT_SECRET ? { JWT_SECRET: process.env.JWT_SECRET } : {})
      },
      
      // 闂佸搫鍟ㄩ崕杈╂崲閺冨牊鐓€鐎广儱娲ㄩ弸?
      log_type: 'json',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true,
      
      // 闂佹眹鍨婚崰宥嗩殽閸ヮ剚鍋濇い鏍ㄥ嚬閺嗘棃鏌熼顒€妫楅崢鎾⒑閺夎法肖闁?
      max_memory_restart: '1G',
      node_args: [
        '--max-old-space-size=1024'
      ],
      
      // 闂備焦褰冪粔鎾箚鎼淬劍鐓€鐎广儱娲ㄩ弸?
      restart_delay: 2000,
      max_restarts: 10,
      min_uptime: '10s',
      autorestart: true,
      
      // 闂佺儵鏅滈崹鍓佹暜?
      watch: false,
      ignore_watch: [
        'node_modules',
        'logs',
        'data',
        'uploads',
        '.git'
      ],
      
      // 闂佺顑冮崕閬嶅箖瀹ュ憘娑㈠焵椤掑嫬钃?
      health_check_grace_period: 5000,
      health_check_fatal_exceptions: true,
      
      // 婵°倕鍊归…鍥殽閸ヮ剚鍎庨柟瀵稿仜娴犳﹢姊洪弶璺ㄐら柣?
      monitoring: {
        http: true,
        port: 8002,
        path: '/health',
        timeout: 10000,
        interval: 30000
      },
      max_cpu_restart: 90,
      shutdown_with_message: true,
      
      // 闁哄鏅滅粙鎾诲煝閼测晝涓嶉柨娑樺閸?
      kill_timeout: 5000,
      listen_timeout: 10000,
      
      // 闁诲骸婀遍崑妯兼閵夆晜鐓€鐎广儱娲ㄩ弸?
      instance_var: 'INSTANCE_ID',
      
      // 闂佸憡鑹鹃悧鍡涙嚐閻旂厧绫嶉柕澶堝劤缁?
      merge_logs: true
    }
  ],
  
  // 闂佺绻堥崝宀勬儑椤掑嫭鐓€鐎广儱娲ㄩ弸?
  global: {
    // PM2 Plus 闂備焦婢樼粔鍫曟偪?
    pmx: false,
    
    // 闂佸搫鍟ㄩ崕杈╂崲閺冣偓濞碱亪顢欓幐搴ｃ偖闂備焦婢樼粔鍫曟偪?
    log_rotate: {
      max_size: '50M',
      retain: 7,
      compress: true,
      dateFormat: 'YYYY-MM-DD_HH-mm-ss',
      workerInterval: 30,
      rotateInterval: '0 0 * * *'
    }
  }
}

