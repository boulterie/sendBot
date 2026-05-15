import express from 'express';
import { createServer } from 'http';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Путь к директории с данными
const DATA_DIR = path.join(__dirname, 'app', 'data');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'; // В продакшене сменить!

// ============ ИНИЦИАЛИЗАЦИЯ ХРАНИЛИЩА ============
async function initDataStorage() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });

        // Создаём файл с ключами
        const keysFile = path.join(DATA_DIR, 'keys.json');
        try {
            await fs.access(keysFile);
        } catch {
            await fs.writeFile(keysFile, JSON.stringify({ keys: {} }, null, 2));
        }

        // Создаём файл с пользователями (будет обновляться из ключей)
        const usersFile = path.join(DATA_DIR, 'users.json');
        try {
            await fs.access(usersFile);
        } catch {
            await fs.writeFile(usersFile, JSON.stringify({ users: {} }, null, 2));
        }

        // Создаём директорию для диалогов
        await fs.mkdir(path.join(DATA_DIR, 'dialogs'), { recursive: true });

        console.log('✅ Хранилище данных инициализировано');
    } catch (error) {
        console.error('❌ Ошибка инициализации:', error);
    }
}

// ============ РАБОТА С КЛЮЧАМИ ============

// Генерация нового ключа
function generateKey() {
    const segments = [];
    for (let i = 0; i < 4; i++) {
        segments.push(crypto.randomBytes(2).toString('hex').toUpperCase());
    }
    return segments.join('-');
}

// Создание ключа
async function createKey(daysValid) {
    const keysFile = path.join(DATA_DIR, 'keys.json');
    const data = await fs.readFile(keysFile, 'utf-8');
    const keysData = JSON.parse(data);

    const key = generateKey();
    const now = Date.now();

    keysData.keys[key] = {
        key: key,
        created_at: now,
        days_valid: daysValid,
        activated: false,
        activated_at: null,
        expires_at: null,
        username: null,
        user_id: null
    };

    await fs.writeFile(keysFile, JSON.stringify(keysData, null, 2));
    return key;
}

// Активация ключа
async function activateKey(key, username) {
    const keysFile = path.join(DATA_DIR, 'keys.json');
    const data = await fs.readFile(keysFile, 'utf-8');
    const keysData = JSON.parse(data);

    if (!keysData.keys[key]) {
        return { success: false, error: 'Ключ не найден' };
    }

    const keyData = keysData.keys[key];

    if (keyData.activated) {
        return { success: false, error: 'Ключ уже активирован' };
    }

    // Генерируем уникальный ID пользователя (4 символа)
    let userId;
    let isUnique = false;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    while (!isUnique) {
        userId = '';
        for (let i = 0; i < 4; i++) {
            userId += chars[Math.floor(Math.random() * chars.length)];
        }
        // Проверяем, не занят ли ID
        let idExists = false;
        for (const k in keysData.keys) {
            if (keysData.keys[k].user_id === userId && keysData.keys[k].activated) {
                idExists = true;
                break;
            }
        }
        if (!idExists) isUnique = true;
    }

    const now = Date.now();
    const expiresAt = now + (keyData.days_valid * 24 * 60 * 60 * 1000);

    keyData.activated = true;
    keyData.activated_at = now;
    keyData.expires_at = expiresAt;
    keyData.username = username;
    keyData.user_id = userId;

    await fs.writeFile(keysFile, JSON.stringify(keysData, null, 2));

    // Обновляем users.json для совместимости
    const usersFile = path.join(DATA_DIR, 'users.json');
    const usersData = await fs.readFile(usersFile, 'utf-8');
    const users = JSON.parse(usersData);
    users.users[userId] = {
        id: userId,
        username: username,
        key: key,
        created_at: now,
        expires_at: expiresAt
    };
    await fs.writeFile(usersFile, JSON.stringify(users, null, 2));

    return { success: true, userId: userId, expiresAt: expiresAt };
}

// Проверка ключа при входе
async function checkKey(key, username) {
    const keysFile = path.join(DATA_DIR, 'keys.json');
    const data = await fs.readFile(keysFile, 'utf-8');
    const keysData = JSON.parse(data);

    if (!keysData.keys[key]) {
        return { success: false, error: 'Ключ не найден' };
    }

    const keyData = keysData.keys[key];

    if (!keyData.activated) {
        return { success: false, error: 'Ключ не активирован' };
    }

    if (keyData.username !== username) {
        return { success: false, error: 'Имя не соответствует ключу' };
    }

    if (Date.now() > keyData.expires_at) {
        return { success: false, error: 'Срок действия ключа истёк' };
    }

    return {
        success: true,
        userId: keyData.user_id,
        username: keyData.username,
        expiresAt: keyData.expires_at
    };
}

// Получение всех ключей (для админки)
async function getAllKeys() {
    const keysFile = path.join(DATA_DIR, 'keys.json');
    const data = await fs.readFile(keysFile, 'utf-8');
    const keysData = JSON.parse(data);
    return keysData.keys;
}

// Удаление ключа
async function deleteKey(key) {
    const keysFile = path.join(DATA_DIR, 'keys.json');
    const data = await fs.readFile(keysFile, 'utf-8');
    const keysData = JSON.parse(data);

    if (!keysData.keys[key]) {
        return { success: false, error: 'Ключ не найден' };
    }

    delete keysData.keys[key];
    await fs.writeFile(keysFile, JSON.stringify(keysData, null, 2));
    return { success: true };
}

// Получение диалога
async function getDialog(user1, user2) {
    const dialogId = [user1, user2].sort().join('_');
    const dialogFile = path.join(DATA_DIR, 'dialogs', `${dialogId}.json`);
    try {
        const data = await fs.readFile(dialogFile, 'utf-8');
        return JSON.parse(data);
    } catch {
        return { messages: [] };
    }
}

// Сохранение диалога
async function saveDialog(user1, user2, dialog) {
    const dialogId = [user1, user2].sort().join('_');
    const dialogFile = path.join(DATA_DIR, 'dialogs', `${dialogId}.json`);
    await fs.writeFile(dialogFile, JSON.stringify(dialog, null, 2));
}

// ============ API ЭНДПОИНТЫ ============

// Админ-логин
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, error: 'Неверный пароль' });
    }
});

// Получение всех ключей (админ)
app.get('/api/admin/keys', async (req, res) => {
    const keys = await getAllKeys();
    res.json({ keys });
});

// Генерация ключа (админ)
app.post('/api/admin/generate_key', async (req, res) => {
    const { days } = req.body;
    const daysNum = parseInt(days);

    if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) {
        return res.status(400).json({ error: 'Некорректное количество дней' });
    }

    const key = await createKey(daysNum);
    res.json({ success: true, key: key, days: daysNum });
});

// Удаление ключа (админ)
app.delete('/api/admin/delete_key/:key', async (req, res) => {
    const { key } = req.params;
    const result = await deleteKey(key);

    if (result.success) {
        res.json({ success: true });
    } else {
        res.status(404).json({ error: result.error });
    }
});

// Регистрация/вход по ключу
app.post('/api/register', async (req, res) => {
    const { username, key } = req.body;

    if (!username || username.length < 2) {
        return res.status(400).json({ error: 'Имя должно содержать минимум 2 символа' });
    }

    if (!key || key.length !== 19) {
        return res.status(400).json({ error: 'Неверный формат ключа' });
    }

    const result = await checkKey(key, username);

    if (result.success) {
        res.json({
            success: true,
            userId: result.userId,
            username: result.username,
            expiresAt: result.expiresAt
        });
    } else {
        res.status(401).json({ error: result.error });
    }
});

// Активация ключа (первая регистрация)
app.post('/api/activate', async (req, res) => {
    const { username, key } = req.body;

    if (!username || username.length < 2) {
        return res.status(400).json({ error: 'Имя должно содержать минимум 2 символа' });
    }

    if (!key || key.length !== 19) {
        return res.status(400).json({ error: 'Неверный формат ключа' });
    }

    const result = await activateKey(key, username);

    if (result.success) {
        res.json({
            success: true,
            userId: result.userId,
            username: username,
            expiresAt: result.expiresAt
        });
    } else {
        res.status(401).json({ error: result.error });
    }
});

// Поиск пользователя
app.post('/api/find_user', async (req, res) => {
    const { username, userId } = req.body;

    const keysData = await getAllKeys();
    let foundUser = null;

    for (const [key, data] of Object.entries(keysData)) {
        if (data.activated && data.username === username && data.user_id === userId) {
            foundUser = {
                id: data.user_id,
                username: data.username,
                key: key
            };
            break;
        }
    }

    if (foundUser) {
        res.json({ success: true, user: foundUser });
    } else {
        res.json({ success: false, error: 'Пользователь не найден' });
    }
});

// Отправка сообщения
app.post('/api/send', async (req, res) => {
    const { from, to, text } = req.body;

    if (!from || !to || !text) {
        return res.status(400).json({ error: 'Недостаточно данных' });
    }

    const message = {
        id: Date.now(),
        from: from,
        to: to,
        text: text,
        timestamp: Math.floor(Date.now() / 1000)
    };

    const dialog = await getDialog(from, to);
    dialog.messages.push(message);

    // Ограничиваем историю 100 сообщениями
    if (dialog.messages.length > 100) {
        dialog.messages = dialog.messages.slice(-100);
    }

    await saveDialog(from, to, dialog);

    res.json({ success: true, message: message });
});

// Получение сообщений
app.get('/api/messages/:userId', async (req, res) => {
    const { userId } = req.params;
    const lastId = parseInt(req.query.last_id) || 0;

    try {
        const dialogFiles = await fs.readdir(path.join(DATA_DIR, 'dialogs'));
        const newMessages = [];

        for (const file of dialogFiles) {
            const [user1, user2] = file.replace('.json', '').split('_');
            if (user1 === userId || user2 === userId) {
                const dialogPath = path.join(DATA_DIR, 'dialogs', file);
                const data = await fs.readFile(dialogPath, 'utf-8');
                const dialog = JSON.parse(data);

                const messages = dialog.messages.filter(m => m.id > lastId);
                newMessages.push(...messages);
            }
        }

        newMessages.sort((a, b) => a.timestamp - b.timestamp);
        res.json({ messages: newMessages });

    } catch (error) {
        res.json({ messages: [] });
    }
});

// Информация о пользователе
app.get('/api/user/:userId', async (req, res) => {
    const { userId } = req.params;
    const keysData = await getAllKeys();

    for (const [key, data] of Object.entries(keysData)) {
        if (data.activated && data.user_id === userId) {
            return res.json({
                success: true,
                user: {
                    id: data.user_id,
                    username: data.username
                }
            });
        }
    }

    res.status(404).json({ error: 'Пользователь не найден' });
});

// Статус сервера
app.get('/health', async (req, res) => {
    const keysData = await getAllKeys();
    const activatedCount = Object.values(keysData).filter(k => k.activated).length;

    res.json({
        status: 'ok',
        total_keys: Object.keys(keysData).length,
        activated_keys: activatedCount,
        timestamp: Date.now()
    });
});

// Главная страница - админ панель
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ============ ЗАПУСК ============
async function start() {
    await initDataStorage();

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`\n${'='.repeat(50)}`);
        console.log(`🚀 Сервер мессенджера запущен!`);
        console.log(`${'='.repeat(50)}`);
        console.log(`📡 Порт: ${PORT}`);
        console.log(`📁 Данные: ${DATA_DIR}`);
        console.log(`🔐 Админ панель: https://msgsendlerpro.bothost.tech/`);
        console.log(`📊 Health: https://msgsendlerpro.bothost.tech/health`);
        console.log(`${'='.repeat(50)}\n`);
    });
}

start();