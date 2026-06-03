# BM-concierge — Linux Deploy Guide

Целевой сервер: Ubuntu 22.04 / Debian 12. Домен: `https://ai.4-am.ru`.
Разработка остаётся на Windows; на сервере только runtime.

---

## Требования

- Docker ≥ 24 + Docker Compose plugin
- Nginx
- Certbot
- Git

---

## 1. Установить Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# Переоткрыть сессию или: newgrp docker
docker --version
```

---

## 2. Клонировать репозиторий

```bash
sudo mkdir -p /var/www/ai.4-am.ru
sudo chown $USER:$USER /var/www/ai.4-am.ru
git clone https://github.com/make-make13/bm-concierge.git /var/www/ai.4-am.ru
cd /var/www/ai.4-am.ru
```

---

## 3. Создать `.env.production`

```bash
cp .env.production.example .env.production
nano .env.production   # или vim
```

**Обязательные секреты для заполнения:**

| Переменная | Описание |
|---|---|
| `CONSOLE_ACCESS_TOKEN` | Токен входа в Console. Сгенерировать: `openssl rand -hex 16` |
| `OPERATOR_API_TOKEN` | Bearer-токен Operator API. Сгенерировать: `openssl rand -hex 24` |
| `OPENROUTER_API_KEY` | Ключ OpenRouter |
| `SUPABASE_URL` | URL Supabase-проекта |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key Supabase |
| `TELEGRAM_BOT_TOKEN` | Токен Telegram-бота |
| `TELEGRAM_ADMIN_IDS` | Telegram ID(s) администратора через запятую |
| `VK_GROUP_TOKEN` | Токен VK-группы (если VK включён) |
| `SMTP_PASSWORD` | Пароль почты для уведомлений |

> `.env.production` не попадает в Docker-образ и не пушится в git.

---

## 4. Создать папки для persistent данных

```bash
cd /var/www/ai.4-am.ru
mkdir -p data logs
chmod 755 data logs
```

---

## 5. Создать Docker-сеть (если не существует)

```bash
docker network create proxy 2>/dev/null || true
```

---

## 6. Запустить контейнер

```bash
cd /var/www/ai.4-am.ru
docker compose -f docker-compose.prod.yml up -d --build
```

**Проверить, что запустился:**

```bash
docker compose -f docker-compose.prod.yml ps
curl http://127.0.0.1:3000/health
# Ожидание: {"status":"ok"}
```

**Посмотреть логи:**

```bash
docker compose -f docker-compose.prod.yml logs -f --tail=50
```

---

## 7. Настроить Nginx

```bash
sudo cp /var/www/ai.4-am.ru/docs/nginx-ai-4-am-example.conf \
        /etc/nginx/sites-available/ai.4-am.ru

sudo ln -s /etc/nginx/sites-available/ai.4-am.ru \
           /etc/nginx/sites-enabled/ai.4-am.ru

sudo nginx -t
sudo systemctl reload nginx
```

---

## 8. Выпустить SSL (Let's Encrypt)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d ai.4-am.ru
# Certbot сам обновит nginx-конфиг с SSL
sudo systemctl reload nginx
```

---

## 9. Финальная проверка

```bash
# Health
curl https://ai.4-am.ru/health

# Console (браузер)
# https://ai.4-am.ru/console   → страница входа

# Widget JS
curl -I https://ai.4-am.ru/widget.js
# HTTP 200 + Content-Type: application/javascript

# WebChat API
curl -X POST https://ai.4-am.ru/api/chat/web \
     -H "Content-Type: application/json" \
     -d '{"message":"Тест","sessionId":"deploy-test"}'

# Operator API (замените токен)
curl -H "Authorization: Bearer YOUR_OPERATOR_API_TOKEN" \
     https://ai.4-am.ru/api/operator/status
```

---

## 10. Обновление после `git push`

```bash
cd /var/www/ai.4-am.ru
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

> Данные в `data/` и `logs/` сохраняются между пересборками (persistent volume).

---

## 11. Просмотр логов

```bash
# Логи контейнера (stdout/stderr)
docker compose -f docker-compose.prod.yml logs -f

# С фильтром
docker compose -f docker-compose.prod.yml logs -f | grep -i error

# Последние 100 строк
docker compose -f docker-compose.prod.yml logs --tail=100
```

---

## 12. Backup данных

**Ручной backup:**

```bash
cd /var/www/ai.4-am.ru

# Создать папку для бэкапов
mkdir -p ~/backups/bm-concierge

# Скопировать SQLite БД и runtime-настройки
cp data/console.db    ~/backups/bm-concierge/console_$(date +%Y%m%d_%H%M%S).db
cp data/settings.json ~/backups/bm-concierge/settings_$(date +%Y%m%d_%H%M%S).json 2>/dev/null || true
```

**Автоматический backup (cron):**

```bash
crontab -e
# Добавить строку — backup в 3:00 каждый день:
0 3 * * * cp /var/www/ai.4-am.ru/data/console.db ~/backups/bm-concierge/console_$(date +\%Y\%m\%d).db && find ~/backups/bm-concierge -name "*.db" -mtime +30 -delete
```

---

## Структура persistent данных

| Путь (host) | Путь (container) | Содержимое |
|---|---|---|
| `./data/console.db` | `/app/data/console.db` | SQLite: диалоги, лиды, события |
| `./data/settings.json` | `/app/data/settings.json` | Runtime-настройки (из Console UI) |
| `./logs/` | `/app/logs/` | Логи приложения |
| `./src/knowledge/` | `/app/src/knowledge/` | База знаний (markdown-файлы) |

> `src/knowledge/` монтируется чтением с хоста и может обновляться без пересборки образа.

---

## Troubleshooting

**Контейнер не стартует:**
```bash
docker compose -f docker-compose.prod.yml logs --tail=30
```

**Порт 3000 уже занят:**
```bash
sudo lsof -i :3000
# Изменить порт в docker-compose.prod.yml и .env.production (PORT=3001)
```

**Nginx 502 Bad Gateway:**
```bash
# Проверить, что контейнер запущен
docker compose -f docker-compose.prod.yml ps
curl http://127.0.0.1:3000/health
```

**Пересоздать контейнер без пересборки образа:**
```bash
docker compose -f docker-compose.prod.yml up -d
```

**Полная пересборка (после изменений в коде):**
```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build --force-recreate
```
