FROM node:22-alpine

WORKDIR /app

# Копируем package.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем исходники
COPY . .

# Создаем необходимые директории
RUN mkdir -p /app/data /app/uploads /app/backups

# Открываем порт
EXPOSE 3001

# Запускаем сервер
CMD ["node", "server.js"]
