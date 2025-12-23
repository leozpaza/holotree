#!/bin/bash

# HoloTree Backup Script
# Создаёт бэкап базы данных и загруженных файлов

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"
BACKUP_DIR="$BACKEND_DIR/backups"
DATA_DIR="$BACKEND_DIR/data"
UPLOADS_DIR="$BACKEND_DIR/uploads"

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
FULL_BACKUP_DIR="$BACKUP_DIR/full-backup-$TIMESTAMP"

echo "🌳 HoloTree Full Backup"
echo "======================="

# Создаём директорию для бэкапа
mkdir -p "$FULL_BACKUP_DIR"

# Бэкап базы данных
if [ -f "$DATA_DIR/holotree.db" ]; then
    echo "📦 Backing up database..."
    cp "$DATA_DIR/holotree.db" "$FULL_BACKUP_DIR/holotree.db"
    echo "✅ Database backed up"
else
    echo "⚠️  Database not found, skipping"
fi

# Бэкап загруженных файлов
if [ -d "$UPLOADS_DIR" ]; then
    echo "📦 Backing up uploads..."
    cp -r "$UPLOADS_DIR" "$FULL_BACKUP_DIR/uploads"
    echo "✅ Uploads backed up"
else
    echo "⚠️  Uploads directory not found, skipping"
fi

# Создаём архив
echo "📦 Creating archive..."
cd "$BACKUP_DIR"
tar -czf "full-backup-$TIMESTAMP.tar.gz" "full-backup-$TIMESTAMP"
rm -rf "full-backup-$TIMESTAMP"

BACKUP_SIZE=$(du -h "full-backup-$TIMESTAMP.tar.gz" | cut -f1)
echo "✅ Backup created: full-backup-$TIMESTAMP.tar.gz ($BACKUP_SIZE)"

# Удаляем старые бэкапы (храним последние 10)
echo "🧹 Cleaning old backups..."
ls -t "$BACKUP_DIR"/full-backup-*.tar.gz | tail -n +11 | xargs -r rm
echo "✅ Cleanup complete"

echo ""
echo "🎉 Backup completed successfully!"
echo "📁 Location: $BACKUP_DIR/full-backup-$TIMESTAMP.tar.gz"
