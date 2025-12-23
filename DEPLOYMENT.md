# 🚀 Руководство по развёртыванию HoloTree

## 📋 Содержание

- [Локальная разработка](#локальная-разработка)
- [Production с Docker](#production-с-docker)
- [Бэкапы и восстановление](#бэкапы-и-восстановление)
- [Облачная синхронизация](#облачная-синхронизация)
- [Мониторинг](#мониторинг)

---

## 🛠️ Локальная разработка

### Быстрый старт

```bash
git clone <repository-url>
cd holotree
./start.sh
```

### Ручная установка

```bash
# Backend
cd backend
npm install
node server.js

# Frontend (в отдельном терминале)
cd frontend
npm install
npm run dev
```

---

## 🐳 Production с Docker

### Вариант 1: Docker Compose (Рекомендуется)

```bash
# Сборка и запуск
docker-compose up -d

# Логи
docker-compose logs -f backend

# Остановка
docker-compose down

# Пересборка после изменений
docker-compose up -d --build
```

### Вариант 2: Отдельные контейнеры

```bash
# Создаём Docker network
docker network create holotree-net

# Backend
docker build -t holotree-backend ./backend
docker run -d \
  --name holotree-backend \
  --network holotree-net \
  -p 3001:3001 \
  -v $(pwd)/backend/data:/app/data \
  -v $(pwd)/backend/backups:/app/backups \
  -v $(pwd)/backend/uploads:/app/uploads \
  -e BACKUP_INTERVAL=300000 \
  -e BACKUP_KEEP_COUNT=50 \
  holotree-backend

# Frontend
docker build -t holotree-frontend ./frontend
docker run -d \
  --name holotree-frontend \
  --network holotree-net \
  -p 80:80 \
  holotree-frontend
```

### Переменные окружения

Создайте `.env` файл:

```env
PORT=3001
DB_PATH=/app/data/holotree.db
BACKUP_DIR=/app/backups
UPLOADS_DIR=/app/uploads
BACKUP_INTERVAL=300000
BACKUP_KEEP_COUNT=50
```

---

## 💾 Бэкапы и восстановление

### Автоматические бэкапы

Система автоматически создаёт:
- **Автосохранение БД**: каждые 10 секунд
- **Бэкапы**: каждые 5 минут (настраивается через `BACKUP_INTERVAL`)
- **Финальный бэкап**: при остановке сервера

### Ручное создание бэкапа

```bash
# Через Node.js утилиту
node backend/backup-utils.js create

# Полный бэкап (БД + файлы)
./scripts/backup.sh

# Через API
curl -X POST http://localhost:3001/api/backup/create
```

### Восстановление

```bash
# Восстановить БД
node backend/backup-utils.js restore holotree-2025-12-23T15-30-00.db

# Восстановить полный бэкап
./scripts/restore.sh full-backup-2025-12-23_15-30-00.tar.gz

# Список доступных бэкапов
node backend/backup-utils.js list
```

### Экспорт в JSON

```bash
# Экспорт базы данных в JSON формат
node backend/backup-utils.js export

# С указанием пути
node backend/backup-utils.js export /path/to/export.json
```

---

## ☁️ Облачная синхронизация

### Google Drive с rclone

#### 1. Установка rclone

```bash
# Linux/Mac
curl https://rclone.org/install.sh | sudo bash

# Windows
choco install rclone
```

#### 2. Настройка Google Drive

```bash
rclone config

# Выберите:
# n) New remote
# name> gdrive
# Storage> drive
# ... следуйте инструкциям на экране
```

#### 3. Ручная синхронизация

```bash
# Загрузить бэкапы в облако
rclone sync backend/backups gdrive:holotree-backups

# Скачать из облака
rclone sync gdrive:holotree-backups backend/backups
```

#### 4. Автоматическая синхронизация

Добавьте в crontab:

```bash
crontab -e

# Синхронизация каждые 30 минут
*/30 * * * * rclone sync /path/to/holotree/backend/backups gdrive:holotree-backups

# Синхронизация каждый час
0 * * * * rclone sync /path/to/holotree/backend/backups gdrive:holotree-backups

# Ежедневно в 3:00
0 3 * * * rclone sync /path/to/holotree/backend/backups gdrive:holotree-backups
```

### Dropbox

```bash
rclone config
# name> dropbox
# Storage> dropbox

# Синхронизация
rclone sync backend/backups dropbox:holotree-backups
```

### AWS S3

```bash
rclone config
# name> s3
# Storage> s3

# Синхронизация
rclone sync backend/backups s3:my-bucket/holotree-backups
```

---

## 📊 Мониторинг

### Логи

```bash
# Docker Compose
docker-compose logs -f backend

# Отдельный контейнер
docker logs -f holotree-backend

# Локальный запуск
tail -f backend/logs/server.log
```

### Проверка здоровья

```bash
# Ping сервера
curl http://localhost:3001/api/nodes

# Список бэкапов
curl http://localhost:3001/api/backups

# Статус Docker контейнеров
docker-compose ps
```

### Использование диска

```bash
# Размер БД
du -h backend/data/holotree.db

# Размер бэкапов
du -sh backend/backups

# Размер загруженных файлов
du -sh backend/uploads

# Общий размер данных
du -sh backend/{data,backups,uploads}
```

---

## 🔒 Безопасность

### Рекомендации

1. **Регулярные бэкапы**: Синхронизируйте бэкапы в облако
2. **Мониторинг места**: Следите за размером директории бэкапов
3. **Graceful shutdown**: Всегда останавливайте сервер через `docker-compose down` или `Ctrl+C`
4. **Защита данных**: Добавьте бэкапы в `.gitignore`, не коммитьте их в Git

### Восстановление после сбоя

Если сервер упал или БД повреждена:

```bash
# 1. Остановите сервер
docker-compose down

# 2. Проверьте последние бэкапы
node backend/backup-utils.js list

# 3. Восстановите последний бэкап
node backend/backup-utils.js restore <последний-бэкап>

# 4. Перезапустите сервер
docker-compose up -d
```

---

## 🎯 Production Checklist

Перед деплоем в production:

- [ ] Настроены переменные окружения в `.env`
- [ ] Docker volumes настроены для постоянного хранения
- [ ] Настроена автоматическая синхронизация бэкапов в облако
- [ ] Проверена работа graceful shutdown
- [ ] Настроен мониторинг логов
- [ ] Настроены алерты на переполнение диска
- [ ] Протестировано восстановление из бэкапа
- [ ] Настроен HTTPS (через nginx/traefik)
- [ ] Настроена аутентификация (если требуется)

---

## 📞 Поддержка

Если что-то пошло не так:

1. Проверьте логи: `docker-compose logs -f`
2. Проверьте список бэкапов: `node backend/backup-utils.js list`
3. Восстановите из последнего бэкапа
4. Создайте issue в репозитории с описанием проблемы

---

**Создано с ◈ для надёжного хранения знаний**
