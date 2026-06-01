# BM Concierge Backend

Standalone backend for the AI concierge of boutique hotel «Большая Медведица».

## Текущий функционал

- ИИ-ответы на основе базы знаний (RAG)
- Интеграция с Supabase (создание лидов)
- Telegram Бот (адаптер)
- WebChat виджет для сайта (REST API)
- Dev Console (локальная панель)

---

## Локальная разработка (Windows)

1. Установите зависимости:
   ```bash
   npm install
   ```
2. Скопируйте файл конфигурации:
   ```bash
   copy .env.example .env
   ```
3. Настройте `.env` (вставьте токены Telegram и ключи Supabase).
4. Запустите dev-сервер:
   ```bash
   npm run dev
   ```
5. Соберите проект для проверки перед деплоем:
   ```bash
   npm run build
   ```

---

## Деплой на Production (Linux)

Домен для продакшена: `https://ai.4-am.ru`

### Production Checklist

1. Установить Docker и Docker Compose plugin на сервере.
2. Скопировать проект на сервер (в `/var/www/ai.4-am.ru`):
   *Примечание: папки `node_modules/`, `dist/`, `data/`, логи и файлы `.env` копировать не нужно — они игнорируются при сборке (`.dockerignore`).*
3. Создать `.env` на сервере из примера:
   ```bash
   cp .env.example .env
   # Отредактировать .env, добавив токены
   ```
4. Запустить Docker Compose:
   ```bash
   docker compose up -d --build
   ```
5. Проверить логи:
   ```bash
   docker compose logs -f
   ```
6. Установить Nginx config:
   ```bash
   sudo cp deploy/nginx/ai.4-am.ru.conf.example /etc/nginx/sites-available/ai.4-am.ru.conf
   sudo ln -s /etc/nginx/sites-available/ai.4-am.ru.conf /etc/nginx/sites-enabled/
   ```
7. Выполнить проверку Nginx:
   ```bash
   sudo nginx -t
   ```
8. Перезапустить Nginx:
   ```bash
   sudo systemctl reload nginx
   ```
9. Выпустить SSL-сертификат (Certbot сам добавит `listen 443 ssl`):
   ```bash
   sudo certbot --nginx -d ai.4-am.ru
   ```

### Проверка после деплоя

После настройки сервера проверьте, что открываются следующие URL (ответ `200 OK` или загрузка интерфейса/json):
* `https://ai.4-am.ru/health`
* `https://ai.4-am.ru/console`
* `https://ai.4-am.ru/widget.js`
* `https://ai.4-am.ru/webchat-test.html`
* `POST https://ai.4-am.ru/api/chat/web`

---

## Безопасность Console UI

> **ВНИМАНИЕ (PRODUCTION):**
> Доступ в `/console` защищён переменной `CONSOLE_ACCESS_TOKEN`. Однако, для production-окружения желательно **дополнительно защитить** этот путь (например, через Nginx Basic Auth или ограничение по IP/VPN). Не стоит полагаться только на токен, если маршрут публично открыт.

---

## Supabase Requirements

Приложение использует Supabase для хранения заявок (Leads). 
Если ключи `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` не указаны, отправка будет проигнорирована, но ИИ продолжит отвечать гостям.

Таблица `leads` должна содержать:
- `source` (text)
- `channel` (text)
- `guest_name` (text)
- `guest_contact` (text)
- `message` (text)
- `ai_summary` (text)
- `external_conversation_id` (text)
- `transcript_json` (jsonb array)
