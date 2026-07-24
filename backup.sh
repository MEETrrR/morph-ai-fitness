#!/bin/bash
# Morph.AI 数据库自动备份脚本
# 添加到 crontab: 0 3 * * * /opt/morph-ai-backend/backup.sh

BACKUP_DIR="/var/backups/morph-ai"
DB_PATH="/opt/morph-ai-backend/fitness.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"
cp "$DB_PATH" "$BACKUP_DIR/fitness_$TIMESTAMP.db"

# Keep only last 7 backups
ls -t "$BACKUP_DIR"/fitness_*.db 2>/dev/null | tail -n +8 | xargs rm -f 2>/dev/null

echo "Backup done: fitness_$TIMESTAMP.db"
