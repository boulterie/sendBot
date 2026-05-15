import express from 'express';
import { createServer } from 'http';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

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

// ============ ИНИЦИАЛИЗАЦИЯ ХРАНИЛИЩА ============
async function initDataStorage() {
    try {
        // Создаём директории
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.mkdir(path.join(DATA_DIR, 'users'), { recursive: true });
        await fs.mkdir(path.join(DATA_DIR, 'dialogs'), { recursive: true });

        // Создаём файл с пользователями если нет
        const usersFile = path.join(DATA_DIR, 'users.json');
        try {
            await fs.access(usersFile);
        } catch {
            await fs.writeFile(usersFile, JSON.stringify({ users: {} }, null, 2));
        }

        console.log('✅ Хранилище данных инициализировано');
    } catch (error) {
        console.error('❌ Ошибка инициализации хранилища:', error);
    }
}

// ============ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ============

// Генерация уникального ID (4 символа: буквы + цифры)
function generateUserId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id;
    do {
        id = '';
        for (let i = 0; i < 4; i++) {
            id += chars[Math.floor(Math.random() * chars.length)];
        }
    } while (id === 'ADMIN'); // Запрещаем ADMIN как ID
    return id;
}

// Получение списка пользователей
async function getUsers() {
    const usersFile = path.join(DATA_DIR, 'users.json');
    const data = await fs.readFile(usersFile, 'utf-8');
    return JSON.parse(data);
}

// Сохранение пользователей
async function saveUsers(users) {
    const usersFile = path.join(DATA_DIR, 'users.json');
    await fs.writeFile(usersFile, JSON.stringify(users, null, 2));
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

// Регистрация/авторизация пользователя
app.post('/api/register', async (req, res) => {
    const { username } = req.body;

    if (!username || username.length < 2) {
        return res.status(400).json({ error: 'Имя должно содержать минимум 2 символа' });
    }

    if (username === 'ADMIN') {
        return res.status(400).json({ error: 'Недопустимое имя' });
    }

    try {
        const usersData = await getUsers();

        // Проверяем, существует ли пользователь с таким именем
        let existingUser = null;
        for (const [id, user] of Object.entries(usersData.users)) {
            if (user.username === username) {
                existingUser = { id, ...user };
                break;
            }
        }

        if (existingUser) {
            // Возвращаем существующего пользователя
            return res.json({
                success: true,
                userId: existingUser.id,
                username: existingUser.username,
                message: 'Добро пожаловать обратно!'
            });
        }

        // Создаём нового пользователя
        let userId;
        let isUnique = false;

        while (!isUnique) {
            userId = generateUserId();
            if (!usersData.users[userId]) {
                isUnique = true;
            }
        }

        const newUser = {
            id: userId,
            username: username,
            created_at: Date.now(),
            last_active: Date.now()
        };

        usersData.users[userId] = newUser;
        await saveUsers(usersData);

        console.log(`✅ Новый пользователь: ${username} (ID: ${userId})`);

        res.json({
            success: true,
            userId: userId,
            username: username,
            message: 'Аккаунт создан!'
        });

    } catch (error) {
        console.error('Ошибка регистрации:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Поиск пользователя по имени и ID
app.post('/api/find_user', async (req, res) => {
    const { username, userId } = req.body;

    if (!username || !userId) {
        return res.status(400).json({ error: 'Имя и ID обязательны' });
    }

    try {
        const usersData = await getUsers();

        // Ищем пользователя
        let foundUser = null;
        for (const [id, user] of Object.entries(usersData.users)) {
            if (user.username === username && id === userId) {
                foundUser = { id, ...user };
                break;
            }
        }

        if (foundUser) {
            res.json({
                success: true,
                user: foundUser
            });
        } else {
            res.json({
                success: false,
                error: 'Пользователь не найден'
            });
        }
    } catch (error) {
        console.error('Ошибка поиска:', error);
        res.status(500).json({ error: 'Внутренняя ошибка' });
    }
});

// Отправка сообщения
app.post('/api/send', async (req, res) => {
    const { from, to, text } = req.body;

    if (!from || !to || !text) {
        return res.status(400).json({ error: 'Недостаточно данных' });
    }

    try {
        const message = {
            id: Date.now(),
            from: from,
            to: to,
            text: text,
            timestamp: Math.floor(Date.now() / 1000)
        };

        // Загружаем диалог
        const dialog = await getDialog(from, to);
        dialog.messages.push(message);

        // Ограничиваем историю последними 100 сообщениями
        if (dialog.messages.length > 100) {
            dialog.messages = dialog.messages.slice(-100);
        }

        await saveDialog(from, to, dialog);

        console.log(`📨 ${from} -> ${to}: ${text.substring(0, 50)}`);
        res.json({ success: true, message: message });

    } catch (error) {
        console.error('Ошибка отправки:', error);
        res.status(500).json({ error: 'Ошибка отправки' });
    }
});

// Получение сообщений
app.get('/api/messages/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        // Получаем список всех диалогов пользователя
        const dialogFiles = await fs.readdir(path.join(DATA_DIR, 'dialogs'));
        const userDialogs = [];

        for (const file of dialogFiles) {
            const [user1, user2] = file.replace('.json', '').split('_');
            if (user1 === userId || user2 === userId) {
                const dialogPath = path.join(DATA_DIR, 'dialogs', file);
                const data = await fs.readFile(dialogPath, 'utf-8');
                const dialog = JSON.parse(data);

                // Берём только новые сообщения (не отправленные ранее)
                const lastMsgId = req.query.last_id ? parseInt(req.query.last_id) : 0;
                const newMessages = dialog.messages.filter(m => m.id > lastMsgId);

                userDialogs.push(...newMessages);
            }
        }

        // Сортируем по времени
        userDialogs.sort((a, b) => a.timestamp - b.timestamp);

        res.json({ messages: userDialogs });

    } catch (error) {
        console.error('Ошибка получения:', error);
        res.json({ messages: [] });
    }
});

// Получение информации о пользователе
app.get('/api/user/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const usersData = await getUsers();
        const user = usersData.users[userId];

        if (user) {
            res.json({
                success: true,
                user: user
            });
        } else {
            res.status(404).json({ error: 'Пользователь не найден' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

// Статус сервера
app.get('/health', async (req, res) => {
    const usersData = await getUsers();
    res.json({
        status: 'ok',
        users_count: Object.keys(usersData.users).length,
        timestamp: Date.now()
    });
});

// Главная страница
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Мессенджер Сервер</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    max-width: 800px;
                    margin: 50px auto;
                    padding: 20px;
                    background: #f5f5f5;
                }
                .container {
                    background: white;
                    padding: 30px;
                    border-radius: 10px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                h1 { color: #333; }
                .status { background: #e8f5e9; padding: 10px; border-radius: 5px; margin: 20px 0; }
                code { background: #f4f4f4; padding: 2px 5px; border-radius: 3px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>📡 Мессенджер Сервер</h1>
                <div class="status" id="status">Загрузка...</div>
                <h2>API Endpoints:</h2>
                <ul>
                    <li><code>POST /api/register</code> - Регистрация/вход</li>
                    <li><code>POST /api/find_user</code> - Поиск пользователя</li>
                    <li><code>POST /api/send</code> - Отправить сообщение</li>
                    <li><code>GET /api/messages/:userId</code> - Получить сообщения</li>
                    <li><code>GET /api/user/:userId</code> - Информация о пользователе</li>
                </ul>
                <p>📁 Данные хранятся в <code>/app/data/</code></p>
            </div>
            <script>
                fetch('/health')
                    .then(r => r.json())
                    .then(d => {
                        document.getElementById('status').innerHTML =
                            '<strong>✅ Сервер работает</strong><br>Пользователей: ' + d.users_count;
                    })
                    .catch(() => {
                        document.getElementById('status').innerHTML = '<strong>❌ Ошибка</strong>';
                    });
            </script>
        </body>
        </html>
    `);
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
        console.log(`📊 Health: https://msgsendlerpro.bothost.tech/health`);
        console.log(`${'='.repeat(50)}\n`);
    });
}

start();