#!/bin/bash

# HoloTree Restore Script
# Восстанавливает базу данных и файлы из бэкапа

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"
BACKUP_DIR="$BACKEND_DIR/backups"
DATA_DIR="$BACKEND_DIR/data"
UPLOADS_DIR="$BACKEND_DIR/uploads"

if [ -z "$1" ]; then
    echo "Usage: $0 <backup-file.tar.gz>"
    echo ""
    echo "Available backups:"
    ls -1 "$BACKUP_DIR"/full-backup-*.tar.gz 2>/dev/null || echo "No backups found"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    # Try finding in backup directory
    if [ -f "$BACKUP_DIR/$BACKUP_FILE" ]; then
        BACKUP_FILE="$BACKUP_DIR/$BACKUP_FILE"
    else
        echo "❌ Backup file not found: $BACKUP_FILE"
        exit 1
    fi
fi

echo "🌳 HoloTree Restore"
echo "==================="
echo "Backup: $BACKUP_FILE"
echo ""

read -p "⚠️  This will overwrite current data. Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Restore cancelled"
    exit 0
fi

# Создаём safety backup текущих данных
if [ -d "$DATA_DIR" ] || [ -d "$UPLOADS_DIR" ]; then
    SAFETY_BACKUP="$BACKUP_DIR/safety-backup-$(date +%s)"
    mkdir -p "$SAFETY_BACKUP"
    
    echo "📦 Creating safety backup of current data..."
    [ -d "$DATA_DIR" ] && cp -r "$DATA_DIR" "$SAFETY_BACKUP/"
    [ -d "$UPLOADS_DIR" ] && cp -r "$UPLOADS_DIR" "$SAFETY_BACKUP/"
    echo "✅ Safety backup created at: $SAFETY_BACKUP"
fi

# Распаковываем бэкап
TEMP_DIR=$(mktemp -d)
echo "📦 Extracting backup..."
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"

BACKUP_CONTENT=$(ls "$TEMP_DIR")
RESTORE_DIR="$TEMP_DIR/$BACKUP_CONTENT"

# Восстанавливаем базу данных
if [ -f "$RESTORE_DIR/holotree.db" ]; then
    echo "♻️  Restoring database..."
    mkdir -p "$DATA_DIR"
    cp "$RESTORE_DIR/holotree.db" "$DATA_DIR/holotree.db"
    echo "✅ Database restored"
else
    echo "⚠️  No database found in backup"
fi

# Восстанавливаем uploads
if [ -d "$RESTORE_DIR/uploads" ]; then
    echo "♻️  Restoring uploads..."
    rm -rf "$UPLOADS_DIR"
    cp -r "$RESTORE_DIR/uploads" "$UPLOADS_DIR"
    echo "✅ Uploads restored"
else
    echo "⚠️  No uploads found in backup"
fi

# Очистка
rm -rf "$TEMP_DIR"

echo ""
echo "🎉 Restore completed successfully!"
echo "⚠️  Please restart the server for changes to take effect"
