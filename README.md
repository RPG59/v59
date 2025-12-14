# V0 Mattermost Clone

Self-hosted аналог сервиса v0 от Vercel с использованием Mattermost и Claude Code.

## Описание

Этот проект позволяет запускать Claude Code в изолированных Docker-контейнерах и взаимодействовать с ним через треды в канале Mattermost. Каждый тред создает отдельную сессию с Claude Code, что обеспечивает изоляцию между различными задачами.

## Возможности

- 🤖 Интеграция Claude Code с Mattermost
- 🐳 Изолированные Docker-контейнеры для каждой сессии
- 💬 Работа через треды в Mattermost
- 📁 Файлы сохраняются в директориях по ID треда
- 🔗 Ссылки на сгенерированные файлы вместо отправки напрямую
- 🌐 Встроенный веб-сервер для раздачи статических файлов
- 🦊 Интеграция с GitLab - отправка кода в репозиторий одной кнопкой
- 🔒 Безопасное выполнение кода в изолированном окружении
- 🧹 Автоматическая очистка старых сессий

## Архитектура

```
┌─────────────────┐
│   Mattermost    │
└────────┬────────┘
         │ Webhook
         ▼
┌─────────────────┐
│  Backend API    │
│  (TypeScript)   │
└────────┬────────┘
         │ Docker API
         ▼
┌─────────────────┐
│ Docker Containers│
│  Claude Code    │
└─────────────────┘
```

## Предварительные требования

- Node.js 20+
- Docker и Docker Compose
- Mattermost сервер (или используйте встроенный в docker-compose)
- Anthropic API ключ

## Установка

### 1. Клонирование репозитория

```bash
git clone <your-repo-url>
cd v0-mattermost-clone
```

### 2. Установка зависимостей

```bash
npm install
```

### 3. Настройка окружения

Скопируйте `.env.example` в `.env` и заполните необходимые переменные:

```bash
cp .env.example .env
```

Отредактируйте `.env`:

```env
# Mattermost Configuration
MATTERMOST_URL=http://localhost:8065
MATTERMOST_BOT_TOKEN=your-bot-token-here
MATTERMOST_WEBHOOK_SECRET=your-webhook-secret-here
MATTERMOST_TEAM_ID=your-team-id-here

# Claude API Configuration
ANTHROPIC_API_KEY=your-anthropic-api-key-here

# Server Configuration
PORT=3000
HOST=0.0.0.0
PUBLIC_URL=http://localhost:3000
LOG_LEVEL=info

# Docker Configuration
DOCKER_IMAGE_NAME=claude-code-runner
WORKSPACE_VOLUME=/tmp/claude-workspaces

# GitLab Configuration (optional)
GITLAB_URL=https://gitlab.com
GITLAB_TOKEN=your-gitlab-token-here
GITLAB_PROJECT_ID=your-project-id-here
GITLAB_DEFAULT_BRANCH=main
```

### 4. Настройка GitLab (опционально)

Для использования интеграции с GitLab:

1. Создайте Personal Access Token в GitLab:
   - Перейдите в **Settings** → **Access Tokens**
   - Создайте токен с правами `api` и `write_repository`

2. Получите Project ID:
   - Откройте ваш проект в GitLab
   - ID проекта находится под названием проекта

3. Добавьте настройки в `.env`:
   ```env
   GITLAB_URL=https://gitlab.com
   GITLAB_TOKEN=glpat-xxxxxxxxxxxxxxxxxxxx
   GITLAB_PROJECT_ID=12345678
   GITLAB_DEFAULT_BRANCH=main
   ```

### 5. Сборка Docker образа Claude Code

```bash
./scripts/build-claude-image.sh
```

### 5. Запуск приложения

#### Вариант A: С использованием Docker Compose (рекомендуется)

Запускает бэкенд и (опционально) Mattermost сервер:

```bash
docker-compose up -d
```

#### Вариант B: Локальная разработка

```bash
# Development mode с hot reload
npm run dev

# Production build
npm run build
npm start
```

## Настройка Mattermost

### 1. Создание бота

1. Войдите в Mattermost как администратор
2. Перейдите в **System Console** → **Integrations** → **Bot Accounts**
3. Нажмите **Add Bot Account**
4. Заполните информацию о боте:
   - Username: `claude-bot`
   - Display Name: `Claude Code`
   - Description: `AI assistant powered by Claude`
5. Скопируйте сгенерированный токен и добавьте его в `.env` как `MATTERMOST_BOT_TOKEN`

### 2. Настройка Outgoing Webhook

1. Перейдите в **System Console** → **Integrations** → **Outgoing Webhooks**
2. Нажмите **Add Outgoing Webhook**
3. Настройте webhook:
   - Title: `Claude Code Webhook`
   - Description: `Sends messages to Claude Code`
   - Content Type: `application/json`
   - Channel: выберите канал где будет работать бот
   - Trigger Words: оставьте пустым для всех сообщений или укажите триггер-слова
   - Callback URLs: `http://backend:3000/webhook/mattermost` (или ваш URL)
4. Скопируйте Token и добавьте его в `.env` как `MATTERMOST_WEBHOOK_SECRET`

### 3. Настройка Slash Command (опционально)

1. Перейдите в **System Console** → **Integrations** → **Slash Commands**
2. Нажмите **Add Slash Command**
3. Настройте команду:
   - Title: `Claude Code Command`
   - Command Trigger Word: `claude`
   - Request URL: `http://backend:3000/command/claude`
   - Request Method: `POST`
   - Description: `Interact with Claude Code`

### 4. Настройка Interactive Buttons (для GitLab интеграции)

1. Перейдите в **System Console** → **Integrations** → **Integration Management**
2. Убедитесь, что включены:
   - **Enable Bot Account Creation**: `true`
   - **Enable integrations to override usernames**: `true`
   - **Enable integrations to override profile picture icons**: `true`
3. В настройках бота добавьте:
   - **Interactive Actions URL**: `http://backend:3000/interactive`

## Использование

### Базовое использование

1. Создайте новое сообщение в настроенном канале Mattermost
2. Напишите ваш запрос к Claude Code
3. Бот автоматически создаст Docker-контейнер и начнет обработку
4. Ответы будут появляться в том же треде

### Команды

- **Обычное сообщение**: Отправьте сообщение в канал, бот автоматически обработает его
- `/claude <ваш вопрос>`: Альтернативный способ взаимодействия
- `/claude stop`: Остановить текущую сессию Claude Code
- `/claude help`: Показать справку

### Пример использования

```
Пользователь: Создай простое React приложение с кнопкой счетчика

Claude Bot: 🤖 Starting Code-Generation session...

Claude Bot: Конечно! Я создам простое React приложение с кнопкой счетчика.

Claude Bot: 📦 **Generated Files:**

**Code Files:**
- [App.tsx](http://localhost:3000/workspace/thread-id-123/App.tsx)
- [package.json](http://localhost:3000/workspace/thread-id-123/package.json)

Total: 2 file(s)

📁 [Browse all files](http://localhost:3000/workspace/thread-id-123/)

Claude Bot: **Preview of App.tsx:**
```typescript
import React, { useState } from 'react';

function App() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <h1>Счетчик: {count}</h1>
      <button onClick={() => setCount(count + 1)}>
        Увеличить
      </button>
    </div>
  );
}

export default App;
```
```

### Организация файлов

Каждый тред в Mattermost имеет свою изолированную директорию:

```
/tmp/claude-workspaces/
  ├── thread-id-123/
  │   ├── App.tsx
  │   ├── package.json
  │   └── ...
  ├── thread-id-456/
  │   └── ...
  └── ...
```

Файлы доступны по URL: `http://your-server:3000/workspace/{thread-id}/{filename}`

### Интеграция с GitLab

После генерации файлов, если настроена интеграция с GitLab, бот отправит сообщение с кнопкой:

```
🚀 GitLab Integration
Want to push these files to GitLab?
[Push to GitLab] <- Интерактивная кнопка
```

При нажатии на кнопку:
1. Все файлы из workspace треда будут отправлены в настроенный GitLab репозиторий
2. Создастся коммит с описанием "Add generated files from Claude Code (Thread: {thread-id})"
3. Бот пришлет ссылку на созданный коммит

## API Endpoints

### Webhook для Mattermost
- **POST** `/webhook/mattermost` - Принимает webhook от Mattermost

### Slash команды
- **POST** `/command/claude` - Обрабатывает slash команды

### Admin endpoints
- **GET** `/admin/sessions` - Список активных сессий
- **POST** `/admin/sessions/:sessionId/stop` - Остановить конкретную сессию
- **POST** `/admin/sessions/stop-all` - Остановить все активные сессии

### Static files
- **GET** `/workspace/:threadId/*` - Доступ к файлам из workspace конкретного треда

### GitLab Integration
- **POST** `/interactive` - Обработка интерактивных кнопок (Push to GitLab)

### Health check
- **GET** `/health` - Проверка состояния сервиса

## Разработка

### Структура проекта

```
.
├── src/
│   ├── config/           # Конфигурация приложения
│   ├── services/         # Бизнес-логика
│   │   ├── MattermostService.ts
│   │   ├── DockerService.ts
│   │   ├── ClaudeCodeService.ts
│   │   └── GitLabService.ts
│   ├── types/            # TypeScript типы
│   ├── utils/            # Утилиты
│   └── index.ts          # Точка входа
├── docker/               # Docker файлы
│   └── Dockerfile.claude-code
├── scripts/              # Скрипты
└── docker-compose.yml
```

### Запуск в режиме разработки

```bash
npm run dev
```

### Сборка

```bash
npm run build
```

### Линтинг

```bash
npm run lint
```

## Безопасность

⚠️ **Важно**: Claude Code имеет доступ к файловой системе контейнера и может выполнять код. Убедитесь, что:

1. Контейнеры изолированы от хостовой системы
2. API ключи хранятся в безопасности
3. Webhook токены правильно настроены
4. Доступ к admin endpoints ограничен

## Troubleshooting

### Бот не отвечает

1. Проверьте логи: `docker-compose logs backend`
2. Убедитесь что webhook правильно настроен в Mattermost
3. Проверьте что `MATTERMOST_BOT_TOKEN` корректный

### Docker контейнеры не создаются

1. Проверьте что Docker daemon запущен
2. Убедитесь что образ `claude-code-runner` собран
3. Проверьте доступ к Docker socket: `/var/run/docker.sock`

### Claude Code не работает

1. Проверьте что `ANTHROPIC_API_KEY` корректный
2. Проверьте логи контейнера: `docker logs <container-id>`
3. Убедитесь что Claude Code установлен в образе

## Roadmap

- [ ] Поддержка приватных тредов
- [ ] Сохранение истории сессий
- [ ] Web UI для управления сессиями
- [ ] Интеграция с другими мессенджерами (Slack, Discord)
- [ ] Поддержка пользовательских Docker образов
- [ ] Метрики и мониторинг

## Лицензия

MIT

## Авторы

Разработано с использованием Claude Code.
