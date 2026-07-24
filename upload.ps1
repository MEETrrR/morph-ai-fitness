# ==========================================
#  教练.AI Windows 端上传 & 部署脚本
#  用法: .\upload.ps1 -Ip "服务器IP" -Domain "你的域名" -ApiKey "sk-xxx"
# ==========================================

param(
    [Parameter(Mandatory=$true)] [string]$Ip,
    [Parameter(Mandatory=$true)] [string]$Domain,
    [Parameter(Mandatory=$true)] [string]$ApiKey
)

$ProjectDir = "C:\Users\Lenovo\.gemini\antigravity\scratch\ai-fitness-app"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  教练.AI 上传到阿里云服务器" -ForegroundColor Cyan
Write-Host "  服务器: $Ip" -ForegroundColor Yellow
Write-Host "  域名: $Domain" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan

# 1. 打包项目（排除 backend 虚拟环境等大文件）
Write-Host "[1/4] 打包项目文件..." -ForegroundColor Green
$ZipPath = "$env:TEMP\coach-ai-deploy.zip"
if (Test-Path $ZipPath) { Remove-Item $ZipPath }
Compress-Archive -Path "$ProjectDir\*" -DestinationPath $ZipPath -Force

# 2. 上传到服务器
Write-Host "[2/4] 上传到服务器..." -ForegroundColor Green
Write-Host "  请输入 root 密码（文件将传到 /tmp/）" -ForegroundColor Yellow
scp $ZipPath "root@${Ip}:/tmp/coach-ai-deploy.zip"

# 3. 远程解压并执行部署
Write-Host "[3/4] 远程解压并部署..." -ForegroundColor Green
ssh "root@${Ip}" @"
apt install -y unzip 2>/dev/null
cd /tmp
rm -rf ai-fitness-app
mkdir ai-fitness-app
unzip -o coach-ai-deploy.zip -d ai-fitness-app
cd ai-fitness-app
bash deploy.sh "$Domain" "$ApiKey"
"@

# 4. 清理
Write-Host "[4/4] 清理临时文件..." -ForegroundColor Green
Remove-Item $ZipPath

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  全部完成！访问 https://$Domain" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
