# GoalGrain MVP

Telegram-бот для генерации дневного рациона с детерминированным расчетом КБЖУ, подбором продуктов из каталога и полным JSON-логированием действий пользователя.

## Стек

- `Node.js + TypeScript + Telegraf`
- `MySQL + Prisma`
- каталог на `91` продукте с КБЖУ из USDA
- генерация дня из исходных продуктов и граммовок, без таблицы `meals`
- Polza AI как OpenAI-compatible провайдер для опциональной генерации рецептов

## Что важно

- `users` хранит `allow_junk_food`
- `products` хранит USDA id, описание, price source, usage/restriction tags и serving bounds
- `logs` хранит полный JSON входа/выхода
- генератор подбирает комбинации продуктов по слотам и принимает план только если итог укладывается в `±5%`

## `.env`

Пример:

```env
DATABASE_URL="mysql://root:your_mysql_password@localhost:3306/goalgrain"
TELEGRAM_BOT_TOKEN="..."
POLZA_AI_API_KEY="..."
POLZA_AI_BASE_URL="https://polza.ai/api/v1"
POLZA_AI_MODEL="openai/gpt-4o"
```

`postgresql://goalgrain:goalgrain@localhost:5432/goalgrain?schema=public` означало:

- `goalgrain:goalgrain` — логин и пароль пользователя БД
- `localhost:5432` — хост и порт Postgres
- `/goalgrain` — имя базы
- `?schema=public` — схема внутри Postgres

Для MySQL такой хвост не нужен, поэтому формат теперь `mysql://USER:PASSWORD@HOST:3306/DATABASE`.

## Запуск

1. Установить зависимости:

```bash
npm install
```

2. Создать базу в MySQL:

```sql
CREATE DATABASE goalgrain CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

3. Заполнить `.env`

4. Сгенерировать Prisma client и применить схему:

```bash
npm run prisma:generate
npx prisma db push
npm run seed
```

5. Запустить бота:

```bash
npm run dev
```

## Полезные файлы

- [prisma/schema.prisma](/d:/dev/GoalGrain/prisma/schema.prisma)
- [prisma/seed.ts](/d:/dev/GoalGrain/prisma/seed.ts)
- [src/catalog/products.json](/d:/dev/GoalGrain/src/catalog/products.json)
- [src/services/meal-plan.service.ts](/d:/dev/GoalGrain/src/services/meal-plan.service.ts)
- [src/bot/app.ts](/d:/dev/GoalGrain/src/bot/app.ts)
- [docs/analytics.sql](/d:/dev/GoalGrain/docs/analytics.sql)
- [docs/product-data-sources.md](/d:/dev/GoalGrain/docs/product-data-sources.md)
