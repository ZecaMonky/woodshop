require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcrypt');
const multer = require('multer');
const { User, Category, Product, Order, OrderItem, Favorite, Cart, ContactMessage } = require('./db');
const { uploadToCloudinary } = require('./utils/upload');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Для корректной работы secure cookie за прокси (Render)
app.set('trust proxy', 1);

// Создаем пул соединений для сессий
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        require: true,
        rejectUnauthorized: false
    }
});

// Настройка multer для загрузки файлов в память
const upload = multer({ storage: multer.memoryStorage() });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Настройка сессий с PostgreSQL
app.use(session({
    store: new pgSession({
        pool,
        tableName: 'Sessions'
    }),
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 24 * 7, // 1 неделя
        httpOnly: true,
        sameSite: 'lax'
    }
}));

// Middleware для проверки авторизации
const requireAuth = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
};

// Middleware для передачи данных пользователя в шаблоны
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Middleware для проверки прав администратора
const requireAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.isAdmin) {
        next();
    } else {
        res.status(403).send('Доступ запрещен');
    }
};

// Маршруты
app.get('/', (req, res) => {
    res.render('index');
});

app.get('/catalog', async (req, res) => {
    try {
        const categories = await Category.findAll({ order: [['name', 'ASC']] });
        let products;
        let order = [];
        
        if (req.query.sort === 'price_asc') order.push(['price', 'ASC']);
        else if (req.query.sort === 'price_desc') order.push(['price', 'DESC']);
        else if (req.query.sort === 'name_asc') order.push(['name', 'ASC']);
        else if (req.query.sort === 'name_desc') order.push(['name', 'DESC']);
        else order.push(['created_at', 'DESC']);

        if (req.query.category) {
            const category = await Category.findOne({ where: { slug: req.query.category } });
            if (category) {
                products = await Product.findAll({
                    where: { CategoryId: category.id },
                    order,
                    include: [Category]
                });
            } else {
                products = [];
            }
        } else {
            products = await Product.findAll({
                order,
                include: [Category]
            });
        }
        
        res.render('catalog', { 
            products, 
            categories, 
            selectedCategory: req.query.category || null, 
            selectedSort: req.query.sort || '' 
        });
    } catch (error) {
        console.error('Ошибка при получении товаров:', error);
        res.status(500).send('Ошибка сервера');
    }
});

app.get('/cart', requireAuth, async (req, res) => {
    try {
        const cartItems = await Cart.findAll({
            where: { UserId: req.session.user.id },
            include: [Product]
        });
        
        const formattedCart = {
            items: cartItems.map(item => ({
                id: item.id,
                quantity: item.quantity,
                product: {
                    id: item.Product.id,
                    name: item.Product.name,
                    description: item.Product.description,
                    price: item.Product.price,
                    image: item.Product.image
                }
            }))
        };
        
        res.render('cart', { cart: formattedCart });
    } catch (error) {
        console.error('Ошибка при получении корзины:', error);
        res.status(500).send('Ошибка сервера');
    }
});

app.get('/profile', requireAuth, async (req, res) => {
    try {
        const user = await User.findByPk(req.session.user.id);
        res.render('profile', { user });
    } catch (error) {
        console.error('Ошибка при получении профиля:', error);
        res.status(500).send('Ошибка сервера');
    }
});

app.get('/login', (req, res) => {
    if (req.session.user) {
        res.redirect('/profile');
    } else {
        res.render('login');
    }
});

app.get('/register', (req, res) => {
    if (req.session.user) {
        res.redirect('/profile');
    } else {
        res.render('register');
    }
});

// Маршруты профиля
app.get('/profile/orders', requireAuth, async (req, res) => {
    try {
        const orders = await Order.findAll({
            where: { UserId: req.session.user.id },
            include: [{
                model: OrderItem,
                include: [Product]
            }],
            order: [['created_at', 'DESC']]
        });

        res.render('profile/orders', { orders });
    } catch (error) {
        console.error('Ошибка при получении заказов:', error);
        res.status(500).send('Ошибка сервера');
    }
});

app.get('/profile/favorites', requireAuth, async (req, res) => {
    try {
        const favorites = await Favorite.findAll({
            where: { UserId: req.session.user.id },
            include: [Product],
            order: [['created_at', 'DESC']]
        });
        
        res.render('profile/favorites', { favorites });
    } catch (error) {
        console.error('Ошибка при получении избранного:', error);
        res.status(500).send('Ошибка сервера');
    }
});

// Маршрут для калькулятора
app.get('/calculator', async (req, res) => {
    const categories = await Category.findAll({ order: [['name', 'ASC']] });
    res.render('calculator', { categories });
});

// Маршрут для контактов
app.get('/contacts', (req, res) => {
    res.render('contacts');
});

// Маршрут для выхода
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Маршруты админ-панели
app.get('/admin', requireAdmin, async (req, res) => {
    try {
        const stats = {
            newOrders: await Order.count({ where: { status: 'new' } }),
            processingOrders: await Order.count({ where: { status: 'processing' } }),
            completedOrders: await Order.count({ where: { status: 'completed' } }),
            newMessages: await ContactMessage.count({ where: { status: 'new' } }),
            processedMessages: await ContactMessage.count({ where: { status: 'processed' } }),
            totalProducts: await Product.count(),
            totalCategories: await Category.count()
        };

        const recentOrders = await Order.findAll({
            include: [User],
            order: [['created_at', 'DESC']],
            limit: 5
        });

        const newMessages = await ContactMessage.findAll({
            where: { status: 'new' },
            order: [['created_at', 'DESC']],
            limit: 5
        });

        res.render('admin/index', { stats, recentOrders, newMessages });
    } catch (error) {
        console.error('Ошибка при получении статистики:', error);
        res.status(500).send('Ошибка сервера');
    }
});

// API маршруты
app.post('/api/cart', requireAuth, async (req, res) => {
    try {
        const { productId, quantity } = req.body;
        const [cartItem, created] = await Cart.findOrCreate({
            where: {
                UserId: req.session.user.id,
                ProductId: productId
            },
            defaults: { quantity }
        });

        if (!created) {
            cartItem.quantity += quantity;
            await cartItem.save();
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка при добавлении в корзину:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
});

app.post('/api/cart/update', requireAuth, async (req, res) => {
    try {
        const { itemId, change } = req.body;
        const cartItem = await Cart.findOne({
            where: {
                id: itemId,
                UserId: req.session.user.id
            }
        });

        if (!cartItem) {
            return res.status(404).json({ success: false, error: 'Товар не найден' });
        }

        cartItem.quantity += change;
        if (cartItem.quantity <= 0) {
            await cartItem.destroy();
        } else {
            await cartItem.save();
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка при обновлении корзины:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
});

app.post('/api/cart/remove', requireAuth, async (req, res) => {
    try {
        const { itemId } = req.body;
        console.log('Попытка удалить из корзины:', { itemId, userId: req.session.user.id });
        if (!itemId) {
            console.error('Ошибка: отсутствует itemId при удалении из корзины', req.body);
            return res.status(400).json({ success: false, error: 'Некорректный id' });
        }
        const deleted = await Cart.destroy({
            where: {
                id: itemId,
                UserId: req.session.user.id
            }
        });
        console.log('Удалено записей из корзины:', deleted);
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка при удалении из корзины:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
});

app.post('/api/favorites/toggle', requireAuth, async (req, res) => {
    try {
        const { productId } = req.body;
        const favorite = await Favorite.findOne({
            where: {
                UserId: req.session.user.id,
                ProductId: productId
            }
        });

        if (favorite) {
            await favorite.destroy();
            res.json({ success: true, action: 'removed' });
        } else {
            await Favorite.create({
                UserId: req.session.user.id,
                ProductId: productId
            });
            res.json({ success: true, action: 'added' });
        }
    } catch (error) {
        console.error('Ошибка при обновлении избранного:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
});

app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, phone, message } = req.body;
        await ContactMessage.create({
            name,
            email,
            phone,
            message
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка при отправке сообщения:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
});

// Маршруты аутентификации
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ where: { email } });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.render('login', { error: 'Неверный email или пароль' });
        }

        req.session.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            isAdmin: user.isAdmin
        };
        req.session.save(() => {
            res.redirect('/?loginSuccess=true');
        });
    } catch (error) {
        console.error('Ошибка при входе:', error);
        res.render('login', { error: 'Ошибка сервера' });
    }
});

app.post('/register', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;

        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.render('register', { error: 'Пользователь с таким email уже существует' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({
            name,
            email,
            password: hashedPassword,
            phone
        });

        res.redirect('/login?registerSuccess=true');
    } catch (error) {
        console.error('Ошибка при регистрации:', error);
        res.render('register', { error: 'Ошибка сервера' });
    }
});

// Маршруты админ-панели
app.get('/admin/orders', requireAdmin, async (req, res) => {
    try {
        const orders = await Order.findAll({
            include: [User],
            order: [['created_at', 'DESC']]
        });

        res.render('admin/orders', { orders });
    } catch (error) {
        console.error('Ошибка при получении заказов:', error);
        res.status(500).send('Ошибка сервера');
    }
});

app.get('/admin/messages', requireAdmin, async (req, res) => {
    try {
        const messages = await ContactMessage.findAll({
            order: [['created_at', 'DESC']]
        });

        res.render('admin/messages', { messages });
    } catch (error) {
        console.error('Ошибка при получении сообщений:', error);
        res.status(500).send('Ошибка сервера');
    }
});

app.get('/admin/products', requireAdmin, async (req, res) => {
    try {
        const products = await Product.findAll({
            include: [Category],
            order: [['created_at', 'DESC']]
        });

        res.render('admin/products', { products });
    } catch (error) {
        console.error('Ошибка при получении товаров:', error);
        res.status(500).send('Ошибка сервера');
    }
});

app.get('/admin/categories', requireAdmin, async (req, res) => {
    try {
        const categories = await Category.findAll({
            order: [['name', 'ASC']]
        });

        res.render('admin/categories', { categories });
    } catch (error) {
        console.error('Ошибка при получении категорий:', error);
        res.status(500).send('Ошибка сервера');
    }
});

// API маршруты для админ-панели
app.post('/admin/orders/:id/status', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({ success: false, error: 'Заказ не найден' });
        }

        order.status = status;
        await order.save();

        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка при обновлении статуса заказа:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
});

app.post('/admin/messages/:id/status', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const message = await ContactMessage.findByPk(id);
        if (!message) {
            return res.status(404).json({ success: false, error: 'Сообщение не найдено' });
        }

        message.status = status;
        await message.save();

        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка при обновлении статуса сообщения:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
});

app.post('/admin/products', requireAdmin, upload.single('image'), async (req, res) => {
    try {
        const { name, description, price, category_id } = req.body;
        let imageUrl = null;

        console.log('Cloudinary config:', process.env.CLOUDINARY_CLOUD_NAME, process.env.CLOUDINARY_API_KEY);
        console.log('req.file:', req.file);

        if (req.file) {
            try {
                const result = await uploadToCloudinary(req.file);
                console.log('Cloudinary upload result:', result);
                imageUrl = result.secure_url;
            } catch (cloudErr) {
                console.error('Ошибка загрузки в Cloudinary:', cloudErr);
                return res.status(500).send('Ошибка загрузки изображения');
            }
        } else {
            console.warn('Файл не передан!');
        }

        await Product.create({
            name,
            description,
            price,
            CategoryId: category_id,
            image: imageUrl
        });
        
        res.redirect('/admin/products');
    } catch (error) {
        console.error('Ошибка при создании товара:', error);
        res.status(500).send('Ошибка сервера');
    }
});

app.post('/admin/products/:id', requireAdmin, upload.single('image'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, price, category_id } = req.body;
        const product = await Product.findByPk(id);

        if (!product) {
            return res.status(404).send('Товар не найден');
        }

        let imageUrl = product.image;
        if (req.file) {
            const result = await uploadToCloudinary(req.file);
            imageUrl = result.secure_url;
        }

        await product.update({
            name,
            description,
            price,
            CategoryId: category_id,
            image: imageUrl
        });

        res.redirect('/admin/products');
    } catch (error) {
        console.error('Ошибка при обновлении товара:', error);
        res.status(500).send('Ошибка сервера');
    }
});

app.post('/admin/products/:id/delete', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await Product.destroy({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка при удалении товара:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
});

app.post('/admin/categories', requireAdmin, async (req, res) => {
    try {
        const { name } = req.body;
        const slug = name.toLowerCase().replace(/\s+/g, '-');

        await Category.create({
            name,
            slug
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка при создании категории:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
});

app.post('/admin/categories/:id/delete', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await Category.destroy({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка при удалении категории:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
});

app.post('/profile/update', requireAuth, async (req, res) => {
    try {
        const user = await User.findByPk(req.session.user.id);
        if (!user) {
            return res.status(404).send('Пользователь не найден');
        }

        // Обновление основных данных
        user.name = req.body.name || user.name;
        user.email = req.body.email || user.email;
        user.phone = req.body.phone || user.phone;

        // Если пользователь хочет сменить пароль
        if (req.body.newPassword) {
            // Проверяем текущий пароль
            const isMatch = await bcrypt.compare(req.body.currentPassword, user.password);
            if (!isMatch) {
                return res.render('profile', { user, error: 'Текущий пароль неверный' });
            }
            // Хешируем новый пароль
            user.password = await bcrypt.hash(req.body.newPassword, 10);
        }

        await user.save();

        // Обновляем данные в сессии
        req.session.user.name = user.name;
        req.session.user.email = user.email;

        res.redirect('/profile?profileUpdateSuccess=true');
    } catch (error) {
        console.error('Ошибка при обновлении профиля:', error);
        res.render('profile', { user: req.session.user, error: 'Ошибка сервера' });
    }
});

// Форма создания товара
app.get('/admin/products/new', requireAdmin, async (req, res) => {
    const categories = await Category.findAll({ order: [['name', 'ASC']] });
    res.render('admin/product-form', { product: null, categories });
});

// Форма редактирования товара
app.get('/admin/products/:id/edit', requireAdmin, async (req, res) => {
    const product = await Product.findByPk(req.params.id);
    if (!product) return res.status(404).send('Товар не найден');
    const categories = await Category.findAll({ order: [['name', 'ASC']] });
    res.render('admin/product-form', { product, categories });
});

app.post('/api/orders/create', requireAuth, async (req, res) => {
    try {
        // Получаем пользователя
        const user = await User.findByPk(req.session.user.id);

        // Получаем все товары из корзины пользователя
        const cartItems = await Cart.findAll({
            where: { UserId: user.id },
            include: [Product]
        });

        if (!cartItems.length) {
            return res.status(400).send('Корзина пуста');
        }

        // Считаем итоговую сумму
        const totalPrice = cartItems.reduce((sum, item) => sum + item.quantity * parseFloat(item.Product.price), 0);

        // Создаём заказ
        const order = await Order.create({
            UserId: user.id,
            total_price: totalPrice,
            status: 'new',
            phone: req.body.phone
        });

        // Добавляем товары в заказ
        for (const item of cartItems) {
            await OrderItem.create({
                OrderId: order.id,
                ProductId: item.Product.id,
                quantity: item.quantity,
                price: item.Product.price
            });
        }

        // Очищаем корзину
        await Cart.destroy({ where: { UserId: user.id } });

        res.redirect('/profile/orders');
    } catch (error) {
        console.error('Ошибка при оформлении заказа:', error);
        res.status(500).send('Ошибка сервера');
    }
});

app.get('/admin/orders/:id', requireAdmin, async (req, res) => {
    try {
        const order = await Order.findByPk(req.params.id, {
            include: [
                { model: User },
                {
                    model: OrderItem,
                    include: [Product]
                }
            ]
        });
        if (!order) return res.status(404).send('Заказ не найден');

        // Преобразуем данные для шаблона
        const items = (order.OrderItems || []).map(item => ({
            name: item.Product ? item.Product.name : '',
            image_url: item.Product && item.Product.image && item.Product.image.startsWith('http') ? item.Product.image : '/uploads/' + (item.Product ? item.Product.image : ''),
            price: item.price,
            quantity: item.quantity
        }));

        res.render('admin/order-details', {
            order: {
                id: order.id,
                user_name: order.User ? order.User.name : '',
                user_email: order.User ? order.User.email : '',
                user_phone: order.User ? order.User.phone : '',
                phone: order.phone || '',
                created_at: order.created_at,
                status: order.status,
                total_price: order.total_price,
                items
            }
        });
    } catch (error) {
        console.error('Ошибка при получении заказа:', error);
        res.status(500).send('Ошибка сервера');
    }
});

app.get('/admin/messages/:id', requireAdmin, async (req, res) => {
    try {
        const message = await ContactMessage.findByPk(req.params.id);
        if (!message) return res.status(404).send('Сообщение не найдено');
        res.render('admin/message-details', { message });
    } catch (error) {
        console.error('Ошибка при получении сообщения:', error);
        res.status(500).send('Ошибка сервера');
    }
});

// Запуск сервера
app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
});
