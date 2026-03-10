# Portal System - Offline Deployment Guide

## System Requirements

| Item | Requirement |
|------|-------------|
| OS | Windows 10/11 |
| Node.js | v18.0.0+ |
| Memory | 4GB+ recommended |
| Disk | 500MB+ available |

---

## Quick Start (5 Steps)

### Step 1: Install Node.js
- Download from https://nodejs.org (LTS version)
- Or use installer from `installers/` folder if provided

### Step 2: Install PM2
```powershell
npm install -g pm2
```

### Step 3: Check Environment
```powershell
.\check-environment.ps1
```

### Step 4: Configure Firewall (Admin Required)
```powershell
# Right-click PowerShell -> Run as Administrator
.\scripts\utilities\configure-firewall.ps1
```

### Step 5: Start Service
```powershell
.\start-production.ps1
```

Double-click shortcut (Windows Explorer):
- `Start-Portal.bat` - one-click start
- `Setup-Portal.bat` - one-time setup (environment check + firewall + PM2 startup)

---

## LAN Access

### Access URLs
- **Local**: http://localhost:8002
- **LAN**: http://<server-ip>:8002

### Find Server IP
```powershell
ipconfig | findstr "IPv4"
```

### Example
If server IP is `192.168.1.100`:
- Other computers can access: `http://192.168.1.100:8002`

---

## Auto-Start on Boot

```powershell
.\configure-startup.ps1
```

This will configure PM2 to start automatically when Windows boots.

---

## Service Management

| Command | Description |
|---------|-------------|
| `pm2 status` | View service status |
| `pm2 logs portal-api` | View logs |
| `pm2 restart portal-api` | Restart service |
| `pm2 stop portal-api` | Stop service |
| `pm2 delete portal-api` | Remove service |
| `pm2 save` | Save current config |

---

## Troubleshooting

### Port 8002 Already in Use
```powershell
# Find process using port
netstat -ano | findstr :8002

# Kill process
taskkill /PID <process-id> /F
```

### Service Won't Start
```powershell
# View detailed logs
pm2 logs portal-api --lines 100

# Check for errors
pm2 describe portal-api
```

### LAN Access Not Working
1. Ensure firewall is configured:
   ```powershell
   .\scripts\utilities\configure-firewall.ps1
   ```

2. Check if port is open:
   ```powershell
   Get-NetFirewallRule -DisplayName "Portal-System-Portal-Backend"
   ```

3. Test connectivity from client:
   ```powershell
   ping <server-ip>
   ```

---

## Directory Structure

```
project/
鈹溾攢鈹€ detection-api/           # Backend API
鈹?  鈹溾攢鈹€ src/                 # Source code
鈹?  鈹溾攢鈹€ data/                # Database (portal.db)
鈹?  鈹斺攢鈹€ logs/                # Log files
鈹溾攢鈹€ main-portal/             # Frontend
鈹?  鈹斺攢鈹€ dist/                # Built files
鈹溾攢鈹€ start-production.ps1     # Start script
鈹溾攢鈹€ check-environment.ps1    # Environment check
鈹溾攢鈹€ scripts/
鈹?  鈹斺攢鈹€ utilities/
鈹?      鈹斺攢鈹€ configure-firewall.ps1   # Firewall setup
鈹溾攢鈹€ configure-startup.ps1    # Auto-start setup
鈹斺攢鈹€ ecosystem-prod-loader.config.js  # PM2 config
```

---

## Default Credentials

| Role | Username | Password |
|------|----------|----------|
| Admin | admin | admin123 |

**Important**: Change the default password after first login!

---

## Support

- View logs: `pm2 logs portal-api`
- Check status: `pm2 status`
- Restart: `pm2 restart portal-api`

---

*Generated: Auto-generated deployment guide*
*Version: 2.0*
