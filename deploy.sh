#!/bin/bash
# ==========================================
#  Morph.AI 阿里云一键部署脚本
#  用法: bash deploy.sh <你的域名>
#  首次运行会引导配置密钥文件
# ==========================================

set -e

DOMAIN="$1"
ENV_FILE="/opt/morph-ai-secrets.env"

if [ -z "$DOMAIN" ]; then
    echo "用法: bash deploy.sh <域名>"
    echo "示例: bash deploy.sh morph.fit"
    exit 1
fi

# Create secrets file if not exists
if [ ! -f "$ENV_FILE" ]; then
    echo "========================================"
    echo "  首次部署 - 配置密钥"
    echo "========================================"
    read -sp "请输入 DeepSeek API Key (sk-...): " API_KEY
    echo ""
    # Generate secure random keys
    SECRET_KEY=$(openssl rand -hex 32)
    PUSH_SECRET=$(openssl rand -hex 32)
    cat > "$ENV_FILE" << EOF
DEEPSEEK_API_KEY=$API_KEY
SECRET_KEY=$SECRET_KEY
PUSH_SECRET=$PUSH_SECRET
FRONTEND_ORIGIN=https://$DOMAIN
EOF
    chmod 600 "$ENV_FILE"
    echo "密钥文件已保存到 $ENV_FILE"
fi

source "$ENV_FILE"

echo "========================================"
echo "  Morph.AI 部署开始"
echo "  域名: $DOMAIN"
echo "========================================"

# 1. Update system
echo "[1/8] 更新系统包..."
apt update -y && apt upgrade -y

# 2. Install Nginx + Python + Certbot
echo "[2/8] 安装运行环境..."
apt install -y nginx python3 python3-pip python3-venv certbot python3-certbot-nginx

# 3. Deploy frontend
echo "[3/8] 部署前端文件..."
rm -rf /var/www/morph-ai 2>/dev/null || true
mkdir -p /var/www/morph-ai
find . -maxdepth 1 -name "*.html" -o -name "*.js" -o -name "*.css" -o -name "*.json" -o -name "*.png" -o -name "*.ico" | xargs -I{} cp {} /var/www/morph-ai/

# 4. Configure Nginx
echo "[4/8] 配置 Nginx..."
cat > /etc/nginx/sites-available/morph-ai << NGINX
server {
    listen 80;
    server_name $DOMAIN;
    root /var/www/morph-ai;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public";
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/morph-ai /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# 5. SSL
echo "[5/8] 申请 SSL 证书..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "admin@$DOMAIN" --redirect || echo "SSL 申请跳过（域名可能未解析）"

# 6. Deploy backend
echo "[6/8] 部署 FastAPI 后端..."
mkdir -p /opt/morph-ai-backend
cp backend/*.py backend/requirements.txt /opt/morph-ai-backend/

cd /opt/morph-ai-backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 7. Systemd service with secrets
echo "[7/8] 配置后端自动启动..."
cat > /etc/systemd/system/morph-ai.service << SERVICE
[Unit]
Description=Morph.AI FastAPI Backend
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/morph-ai-backend
EnvironmentFile=$ENV_FILE
ExecStart=/opt/morph-ai-backend/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

# Update frontend API base URL and server URL for images
sed -i "s|http://localhost:8000/api|https://$DOMAIN/api|g" /var/www/morph-ai/app.js
sed -i "s|http://localhost:8000/api|https://$DOMAIN/api|g" /var/www/morph-ai/ai.js
sed -i 's|var serverUrl = "http://localhost:8000"|var serverUrl = "https://'"$DOMAIN"'"|g' /var/www/morph-ai/app.js

systemctl daemon-reload
systemctl enable morph-ai
systemctl restart morph-ai

# 8. Firewall
echo "[8/8] 配置防火墙..."
ufw allow 80
ufw allow 443
ufw allow 22
ufw --force enable

echo ""
echo "========================================"
echo "  部署完成！"
echo "  访问: https://$DOMAIN"
echo "  后端日志: journalctl -u morph-ai -f"
echo "========================================"
