WoodShop — интернет-магазин древесины
=====================================

Описание
--------
WoodShop — современный интернет-магазин древесины и пиломатериалов с личным кабинетом, корзиной, избранным, калькулятором, админ-панелью и адаптивным интерфейсом.

Возможности
-----------
- Регистрация, авторизация, сессии
- Просмотр каталога, фильтрация, сортировка, поиск
- Корзина, оформление заказа, история заказов
- Избранное (добавление/удаление)
- Калькулятор стоимости древесины
- Контактная форма (сообщения в админку)
- Личный кабинет: профиль, смена пароля, заказы, избранное
- Админ-панель: CRUD для товаров, категорий, заказов, сообщений
- Загрузка изображений на Cloudinary
- Современный UI (EJS + Tailwind CSS), полностью адаптивный

Технологии и стек
-----------------
- Node.js, Express.js
- PostgreSQL, Sequelize ORM
- EJS (шаблоны)
- Tailwind CSS (CDN)
- Cloudinary (хранение изображений)
- Multer (загрузка файлов)
- express-session + connect-pg-simple (сессии)
- dotenv (переменные окружения)
- nodemon (dev)

Структура проекта
-----------------
- server.js — основной сервер, все роуты и логика
- db.js — модели Sequelize и связи
- views/ — EJS-шаблоны (клиент, админка, partials)
- public/ — статика (изображения, видео, загруженные файлы)
- utils/upload.js — загрузка на Cloudinary
- config/cloudinary.js — Cloudinary-конфиг
- render.yaml — деплой на Render.com
- package.json — зависимости и скрипты

Архитектура и роли
------------------
- Гость: просмотр каталога, калькулятор, контакты, регистрация/вход
- Пользователь: корзина, оформление заказа, личный кабинет, избранное
- Админ: доступ к админ-панели, управление товарами, категориями, заказами, сообщениями

Модели данных (Sequelize)
-------------------------
User: id, name, email, password (bcrypt), phone, isAdmin, created_at  
Category: id, name, slug, created_at  
Product: id, name, description, price, image, CategoryId, created_at  
Order: id, UserId, total_price, status, phone, created_at  
OrderItem: id, OrderId, ProductId, quantity, price  
Favorite: UserId, ProductId  
Cart: id, UserId, ProductId, quantity, created_at  
ContactMessage: id, name, email, phone, message, status, created_at

Связи:
- User 1:M Order, 1:M Favorite, 1:M Cart
- Product 1:M OrderItem, 1:M Favorite, 1:M Cart
- Category 1:M Product
- Order 1:M OrderItem

ER-диаграмма (текстовая)
------------------------

User ─────┬─────────────┐
          │             │
        Order         Favorite
          │             │
        OrderItem      Product
          │             │
        Product      Category
          │
        Cart
          │
        Product

- User 1:M Order
- User 1:M Favorite (через Product)
- User 1:M Cart (через Product)
- Category 1:M Product
- Product 1:M OrderItem
- Order 1:M OrderItem

Примеры ответов API
-------------------

POST /api/cart
Request: { "productId": 1, "quantity": 2 }
Response: { "success": true }

POST /api/cart/remove
Request: { "itemId": 5 }
Response: { "success": true }

POST /api/favorites/toggle
Request: { "productId": 3 }
Response: { "success": true, "action": "added" }

POST /api/contact
Request: { "name": "Иван", "email": "ivan@mail.ru", "phone": "89991234567", "message": "Вопрос по товару" }
Response: { "success": true }

POST /admin/orders/1/status
Request: { "status": "completed" }
Response: { "success": true }

Описание миграций
-----------------
Миграции выполняются автоматически через Sequelize при запуске приложения. Все модели и связи описаны в db.js. Для ручного управления миграциями можно использовать Sequelize CLI (npm install --save-dev sequelize-cli) и создать отдельные миграции при необходимости.

Тесты
-----
В проекте можно использовать Jest или Mocha для написания unit и интеграционных тестов. Пример теста для API:

```
const request = require('supertest');
const app = require('../server');

describe('POST /api/cart', () => {
  it('should add item to cart', async () => {
    const res = await request(app)
      .post('/api/cart')
      .send({ productId: 1, quantity: 2 })
      .set('Cookie', 'session=...');
    expect(res.body.success).toBe(true);
  });
});
```

Кастомизация
------------
- Стили: можно менять Tailwind-конфиг или добавить свои CSS-файлы в public/
- Шаблоны: все страницы в views/ (EJS), легко редактируются
- Переводы: все тексты на русском, можно вынести в отдельный файл для мультиязычности
- Расширение моделей: добавляйте поля в db.js и миграции
- API: добавляйте новые роуты в server.js

Основные роуты (маршруты)
-------------------------
- GET / — главная
- GET /catalog — каталог, фильтрация, сортировка
- GET /cart — корзина (требует авторизации)
- GET /profile — личный кабинет (требует авторизации)
- GET /contacts — контакты
- GET /calculator — калькулятор
- POST /login, /register, /logout — аутентификация
- POST /api/cart, /api/cart/update, /api/cart/remove — корзина
- POST /api/favorites/toggle — избранное
- POST /api/contact — обратная связь
- POST /api/orders/create — оформление заказа
- /admin/* — админка (требует isAdmin)

Админ-панель
------------
- /admin — дашборд
- /admin/orders — список заказов, смена статуса, детали
- /admin/messages — сообщения, смена статуса, детали
- /admin/products — товары (CRUD)
- /admin/categories — категории (CRUD)

Шаблоны (views/)
----------------
- EJS-шаблоны, компонентная структура (partials/header, partials/footer, admin/partials/nav)
- Tailwind CSS через CDN
- Все формы и таблицы адаптивны, поддержка мобильных устройств
- Кастомные стили и иконки (FontAwesome CDN)

Переменные окружения (.env)
---------------------------
DATABASE_URL=postgres://user:password@host:port/dbname  
SESSION_SECRET=your-session-secret  
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud  
CLOUDINARY_API_KEY=your-cloudinary-key  
CLOUDINARY_API_SECRET=your-cloudinary-secret  
NODE_ENV=development

(Для Render.com переменные можно указать через render.yaml)

Установка и запуск
------------------
1. Клонируйте репозиторий:
   git clone https://github.com/your-username/woodshop.git
   cd woodshop

2. Установите зависимости:
   npm install

3. Создайте .env и заполните переменные окружения

4. Запустите сервер:
   npm run dev

Деплой на Render.com
--------------------
1. Создайте новый web service на Render.com
2. Подключите репозиторий GitHub
3. Укажите переменные окружения
4. Build command: npm install
5. Start command: node server.js

Скрипты package.json
--------------------
- npm start — запуск сервера
- npm run dev — запуск с hot-reload (nodemon)

Примеры запросов
----------------
- POST /register { name, email, password, phone }
- POST /api/cart { productId, quantity }
- POST /api/orders/create { phone }
- POST /admin/orders/:id/status { status }

FAQ
---
Q: Как добавить новую категорию/товар?  
A: Через админ-панель (/admin/categories, /admin/products).

Q: Как сменить пароль?  
A: В личном кабинете, раздел "Изменить пароль".

Q: Как подключить свой Cloudinary?  
A: Укажите свои ключи в .env.

Q: Как добавить свои стили?  
A: Используйте Tailwind CDN или добавьте свои CSS-файлы в public/.

Контакты и поддержка
--------------------
Если возникли вопросы или баги — создайте issue или напишите на почту, указанную в профиле GitHub.

---

Автор: [ZecaMonky]  
Лицензия: ISC
