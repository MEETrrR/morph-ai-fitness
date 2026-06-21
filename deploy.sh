#!/bin/bash
# ==========================================
#  教练.AI 阿里云一键部署脚本
#  用法: bash deploy.sh <你的域名> <DeepSeek_API_Key>
#  示例: bash deploy.sh coach.fit.com sk-xxxxx
# ==========================================

set -e

DOMAIN="$1"
API_KEY="$2"

if [ -z "$DOMAIN" ] || [ -z "$API_KEY" ]; then
    echo "用法: bash deploy.sh <域名> <DeepSeek_API_Key>"
    echo "示例: bash deploy.sh coach.fit.com sk-abc123"
    exit 1
fi

echo "========================================"
echo "  教练.AI 部署开始"
echo "  域名: $DOMAIN"
echo "========================================"

# 1. 更新系统
echo "[1/8] 更新系统包..."
apt update -y && apt upgrade -y

# 2. 安装 Nginx + Python + Certbot
echo "[2/8] 安装运行环境..."
apt install -y nginx python3 python3-pip python3-venv certbot python3-certbot-nginx

# 3. 创建项目目录
echo "[3/8] 部署前端文件..."
mkdir -p /var/www/coach-ai
cp -r ./ai-fitness-app/*.html ./ai-fitness-app/*.js ./ai-fitness-app/*.css ./ai-fitness-app/*.json ./ai-fitness-app/*.png /var/www/coach-ai/

# 4. 配置 Nginx 前端
echo "[4/8] 配置 Nginx..."
cat > /etc/nginx/sites-available/coach-ai << NGINX
server {
    listen 80;
    server_name $DOMAIN;
    root /var/www/coach-ai;
    index index.html;

    # 前端静态文件
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # API 反向代理到 FastAPI
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/coach-ai /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# 5. SSL 证书
echo "[5/8] 申请 SSL 证书..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "admin@$DOMAIN" --redirect

# 6. 部署后端
echo "[6/8] 部署 FastAPI 后端..."
mkdir -p /opt/coach-ai-backend
cp -r ./ai-fitness-app/backend/*.py ./ai-fitness-app/backend/requirements.txt /opt/coach-ai-backend/

cd /opt/coach-ai-backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 7. 配置后端为系统服务
echo "[7/8] 配置后端自动启动..."
cat > /etc/systemd/system/coach-ai.service << SERVICE
[Unit]
Description=教练.AI FastAPI Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/coach-ai-backend
Environment="DEEPSEEK_API_KEY=$API_KEY"
Environment="SECRET_KEY=$(openssl rand -hex 32)"
ExecStart=/opt/coach-ai-backend/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

# 替换前端 API 地址为实际域名
sed -i "s|http://localhost:8000/api|https://$DOMAIN/api|g" /var/www/coach-ai/app.js
sed -i "s|http://localhost:8000/api|https://$DOMAIN/api|g" /var/www/coach-ai/ai.js

systemctl daemon-reload
systemctl enable coach-ai
systemctl start coach-ai

# 8. 防火墙
echo "[8/8] 配置防火墙..."
ufw allow 80
ufw allow 443
ufw allow 22
ufw --force enable

echo ""
echo "========================================"
echo "  部署完成！"
echo "  访问: https://$DOMAIN"
echo "  后端状态: systemctl status coach-ai"
echo "========================================"
