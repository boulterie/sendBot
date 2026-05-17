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
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============ КОНСТАНТЫ ============
const DEFAULT_DIALOG_LIFETIME_DAYS = 7;
const MOSCOW_OFFSET = 3 * 60 * 60 * 1000; // Москва UTC+3

// ============ ПУТИ К ДАННЫМ ============
const DATA_DIR = path.join(__dirname, 'data');
const KEYS_FILE = path.join(DATA_DIR, 'keys.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const DIALOGS_DIR = path.join(DATA_DIR, 'dialogs');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Функция получения московского времени
function getMoscowTime() {
    return Date.now() + MOSCOW_OFFSET;
}

console.log('========================================');
console.log('🔐 НАСТРОЙКИ СЕРВЕРА:');
console.log(`   Порт: ${PORT}`);
console.log(`   Папка данных: ${DATA_DIR}`);
console.log(`   Пароль админа: ${ADMIN_PASSWORD === 'admin123' ? 'admin123 (по умолчанию)' : 'установлен'}`);
console.log(`   Часовой пояс: MSK (UTC+3)`);
console.log('========================================\n');

// ============ ИНИЦИАЛИЗАЦИЯ ХРАНИЛИЩА ============
async function initDataStorage() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.mkdir(DIALOGS_DIR, { recursive: true });

        try { await fs.access(KEYS_FILE); } catch { await fs.writeFile(KEYS_FILE, JSON.stringify({ keys: {} }, null, 2)); }
        try { await fs.access(USERS_FILE); } catch { await fs.writeFile(USERS_FILE, JSON.stringify({ users: {} }, null, 2)); }
        try { await fs.access(NOTIFICATIONS_FILE); } catch { await fs.writeFile(NOTIFICATIONS_FILE, JSON.stringify({ notifications: [] }, null, 2)); }
        try { await fs.access(SETTINGS_FILE); } catch { await fs.writeFile(SETTINGS_FILE, JSON.stringify({ dialog_lifetime_days: DEFAULT_DIALOG_LIFETIME_DAYS, auto_cleanup_enabled: true }, null, 2)); }

        const dialogFiles = await fs.readdir(DIALOGS_DIR);
        console.log(`✅ Инициализация завершена. Диалогов: ${dialogFiles.length}`);
    } catch (error) {
        console.error('❌ Ошибка инициализации:', error);
    }
}

// ============ ФУНКЦИИ РАБОТЫ С НАСТРОЙКАМИ ============
async function getSettings() {
    try {
        const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return { dialog_lifetime_days: DEFAULT_DIALOG_LIFETIME_DAYS, auto_cleanup_enabled: true };
    }
}

async function saveSettings(settings) {
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// ============ ФУНКЦИИ РАБОТЫ С КЛЮЧАМИ ============
async function getAllKeys() {
    try {
        const data = await fs.readFile(KEYS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return { keys: {} };
    }
}

async function saveKeys(keysData) {
    await fs.writeFile(KEYS_FILE, JSON.stringify(keysData, null, 2));
}

function generateKey() {
    const segments = [];
    for (let i = 0; i < 4; i++) {
        segments.push(crypto.randomBytes(2).toString('hex').toUpperCase());
    }
    return segments.join('-');
}

async function createKey(daysValid, hwidCheckEnabled = true) {
    const keysData = await getAllKeys();
    const key = generateKey();
    const now = getMoscowTime();

    keysData.keys[key] = {
        key: key,
        created_at: now,
        days_valid: daysValid,
        activated: false,
        activated_at: null,
        expires_at: null,
        username: null,
        user_id: null,
        hwid: null,
        hwid_check_enabled: hwidCheckEnabled
    };

    await saveKeys(keysData);
    console.log(`🎫 Создан ключ: ${key} (${daysValid} дней, HWID проверка: ${hwidCheckEnabled ? 'вкл' : 'выкл'})`);
    return key;
}

async function updateKey(key, updates) {
    const keysData = await getAllKeys();
    if (!keysData.keys[key]) return { success: false, error: 'Ключ не найден' };
    const allowedUpdates = ['days_valid', 'hwid_check_enabled'];
    for (const field of allowedUpdates) if (updates[field] !== undefined) keysData.keys[key][field] = updates[field];
    await saveKeys(keysData);
    console.log(`✏️ Обновлён ключ: ${key}`);
    return { success: true };
}

async function resetKey(key) {
    const keysData = await getAllKeys();
    if (!keysData.keys[key]) return { success: false, error: 'Ключ не найден' };
    keysData.keys[key] = {
        key: key,
        created_at: keysData.keys[key].created_at,
        days_valid: keysData.keys[key].days_valid,
        activated: false,
        activated_at: null,
        expires_at: null,
        username: null,
        user_id: null,
        hwid: null,
        hwid_check_enabled: keysData.keys[key].hwid_check_enabled
    };
    await saveKeys(keysData);
    console.log(`🔄 Сброшен ключ: ${key}`);
    return { success: true };
}

async function activateKey(key, username, hwid = null) {
    const keysData = await getAllKeys();
    if (!keysData.keys[key]) return { success: false, error: 'Ключ не найден' };
    const keyData = keysData.keys[key];
    if (keyData.activated) return { success: false, error: 'Ключ уже активирован' };

    let userId;
    let isUnique = false;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    while (!isUnique) {
        userId = '';
        for (let i = 0; i < 4; i++) userId += chars[Math.floor(Math.random() * chars.length)];
        let idExists = false;
        for (const k in keysData.keys) if (keysData.keys[k].user_id === userId && keysData.keys[k].activated) { idExists = true; break; }
        if (!idExists) isUnique = true;
    }

    const now = getMoscowTime();
    const expiresAt = now + (keyData.days_valid * 24 * 60 * 60 * 1000);

    keyData.activated = true;
    keyData.activated_at = now;
    keyData.expires_at = expiresAt;
    keyData.username = username;
    keyData.user_id = userId;
    if (hwid && keyData.hwid_check_enabled) keyData.hwid = hwid;

    await saveKeys(keysData);
    console.log(`✅ Активирован ключ: ${key} -> ${username} (${userId})`);
    return { success: true, userId: userId, expiresAt: expiresAt };
}

async function checkKey(key, username, hwid = null) {
    const keysData = await getAllKeys();
    if (!keysData.keys[key]) return { success: false, error: 'Ключ не найден' };
    const keyData = keysData.keys[key];
    if (!keyData.activated) return { success: false, error: 'Ключ не активирован' };
    if (keyData.username !== username) return { success: false, error: 'Имя не соответствует ключу' };
    if (getMoscowTime() > keyData.expires_at) return { success: false, error: 'Срок действия ключа истёк' };
    if (keyData.hwid_check_enabled && keyData.hwid && (!hwid || keyData.hwid !== hwid)) return { success: false, error: 'HWID не совпадает. Доступ запрещён.' };
    return { success: true, userId: keyData.user_id, username: keyData.username, expiresAt: keyData.expires_at };
}

async function deleteKey(key) {
    const keysData = await getAllKeys();
    if (!keysData.keys[key]) return { success: false, error: 'Ключ не найден' };
    delete keysData.keys[key];
    await saveKeys(keysData);
    console.log(`🗑️ Удалён ключ: ${key}`);
    return { success: true };
}

// ============ ФУНКЦИИ РАБОТЫ С ДИАЛОГАМИ ============
async function getDialog(user1, user2) {
    const dialogId = [user1, user2].sort().join('_');
    const dialogFile = path.join(DIALOGS_DIR, `${dialogId}.json`);
    try {
        const data = await fs.readFile(dialogFile, 'utf-8');
        return JSON.parse(data);
    } catch {
        return { created_at: getMoscowTime(), messages: [] };
    }
}

async function saveDialog(user1, user2, dialog) {
    const dialogId = [user1, user2].sort().join('_');
    const dialogFile = path.join(DIALOGS_DIR, `${dialogId}.json`);
    if (!dialog.created_at) dialog.created_at = getMoscowTime();
    await fs.writeFile(dialogFile, JSON.stringify(dialog, null, 2));
}

// Удаление диалога
async function deleteDialog(user1, user2) {
    const dialogId = [user1, user2].sort().join('_');
    const dialogFile = path.join(DIALOGS_DIR, `${dialogId}.json`);
    try {
        await fs.unlink(dialogFile);
        return { success: true };
    } catch {
        return { success: false };
    }
}

// Проверка истечения диалога
async function checkAndDeleteExpiredDialog(user1, user2) {
    const dialog = await getDialog(user1, user2);
    const settings = await getSettings();
    const now = getMoscowTime();
    const lifetimeMs = settings.dialog_lifetime_days * 24 * 60 * 60 * 1000;

    if (dialog.created_at && (now - dialog.created_at) > lifetimeMs) {
        await deleteDialog(user1, user2);
        return { expired: true, deleted: true };
    }
    return { expired: false };
}

// Фоновая очистка старых диалогов (каждые 5 минут)
async function cleanupOldDialogs() {
    const settings = await getSettings();
    if (!settings.auto_cleanup_enabled) { console.log('⚠️ Автоочистка диалогов отключена'); return; }
    const lifetimeMs = settings.dialog_lifetime_days * 24 * 60 * 60 * 1000;
    try {
        const dialogFiles = await fs.readdir(DIALOGS_DIR);
        let deletedCount = 0;
        const now = getMoscowTime();
        for (const file of dialogFiles) {
            const dialogPath = path.join(DIALOGS_DIR, file);
            try {
                const data = await fs.readFile(dialogPath, 'utf-8');
                const dialog = JSON.parse(data);
                if (dialog.created_at && (now - dialog.created_at) > lifetimeMs) {
                    await fs.unlink(dialogPath);
                    deletedCount++;
                    console.log(`🗑️ Удалён устаревший диалог: ${file}`);
                }
            } catch (err) { console.error(`Ошибка обработки ${file}:`, err); }
        }
        if (deletedCount > 0) console.log(`✅ Очистка завершена. Удалено диалогов: ${deletedCount}`);
    } catch (error) { console.error('Ошибка очистки диалогов:', error); }
}

// ============ ФУНКЦИИ РАБОТЫ С УВЕДОМЛЕНИЯМИ ============
async function getAllNotifications() {
    try {
        const data = await fs.readFile(NOTIFICATIONS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return { notifications: [] };
    }
}

async function saveNotifications(notificationsData) {
    await fs.writeFile(NOTIFICATIONS_FILE, JSON.stringify(notificationsData, null, 2));
}

async function addNotification(title, message, sender = 'admin') {
    const notificationsData = await getAllNotifications();
    const notification = {
        id: Date.now(),
        title: title,
        message: message,
        sender: sender,
        timestamp: Math.floor(getMoscowTime() / 1000)
    };
    notificationsData.notifications.unshift(notification);
    if (notificationsData.notifications.length > 200) notificationsData.notifications = notificationsData.notifications.slice(0, 200);
    await saveNotifications(notificationsData);
    console.log(`📢 Добавлено уведомление: ${title}`);
    return notification;
}

async function deleteNotification(notificationId) {
    const notificationsData = await getAllNotifications();
    const initialLength = notificationsData.notifications.length;
    notificationsData.notifications = notificationsData.notifications.filter(n => n.id !== notificationId);
    if (notificationsData.notifications.length === initialLength) return { success: false, error: 'Уведомление не найдено' };
    await saveNotifications(notificationsData);
    console.log(`🗑️ Удалено уведомление: ${notificationId}`);
    return { success: true };
}

async function getUserNotifications(userId, lastId = 0) {
    const notificationsData = await getAllNotifications();
    return notificationsData.notifications.filter(n => n.id > lastId);
}

// ============ API ЭНДПОИНТЫ ============

// Админ-логин
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) res.json({ success: true });
    else res.status(401).json({ success: false, error: 'Неверный пароль' });
});

// Ключи
app.get('/api/admin/keys', async (req, res) => { const keysData = await getAllKeys(); res.json({ keys: keysData.keys }); });
app.post('/api/admin/generate_key', async (req, res) => {
    const { days, hwid_check } = req.body;
    const daysNum = parseInt(days);
    const hwidCheckEnabled = hwid_check !== false;
    if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) return res.status(400).json({ error: 'Некорректное количество дней' });
    const key = await createKey(daysNum, hwidCheckEnabled);
    res.json({ success: true, key: key, days: daysNum, hwid_check: hwidCheckEnabled });
});
app.put('/api/admin/update_key/:key', async (req, res) => {
    const { key } = req.params;
    const { days_valid, hwid_check_enabled } = req.body;
    const result = await updateKey(key, { days_valid, hwid_check_enabled });
    if (result.success) res.json({ success: true });
    else res.status(404).json({ error: result.error });
});
app.post('/api/admin/reset_key/:key', async (req, res) => {
    const { key } = req.params;
    const result = await resetKey(key);
    if (result.success) res.json({ success: true });
    else res.status(404).json({ error: result.error });
});
app.delete('/api/admin/delete_key/:key', async (req, res) => {
    const { key } = req.params;
    const result = await deleteKey(key);
    if (result.success) res.json({ success: true });
    else res.status(404).json({ error: result.error });
});
app.post('/api/admin/search_keys', async (req, res) => {
    const { query } = req.body;
    const keysData = await getAllKeys();
    const results = {};
    const lowerQuery = query.toLowerCase();
    for (const [key, data] of Object.entries(keysData.keys)) {
        if (key.toLowerCase().includes(lowerQuery) || (data.username && data.username.toLowerCase().includes(lowerQuery)) || (data.user_id && data.user_id.toLowerCase().includes(lowerQuery))) {
            results[key] = data;
        }
    }
    res.json({ keys: results });
});

// Настройки
app.get('/api/admin/settings', async (req, res) => { const settings = await getSettings(); res.json(settings); });
app.post('/api/admin/settings', async (req, res) => {
    const { dialog_lifetime_days, auto_cleanup_enabled } = req.body;
    const settings = await getSettings();
    if (dialog_lifetime_days !== undefined) settings.dialog_lifetime_days = Math.max(1, Math.min(365, dialog_lifetime_days));
    if (auto_cleanup_enabled !== undefined) settings.auto_cleanup_enabled = auto_cleanup_enabled;
    await saveSettings(settings);
    res.json({ success: true, settings });
});

// Уведомления (админ)
app.get('/api/admin/notifications', async (req, res) => { const notificationsData = await getAllNotifications(); res.json({ notifications: notificationsData.notifications }); });
app.post('/api/admin/send_notification', async (req, res) => {
    const { title, message } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'Заголовок и сообщение обязательны' });
    const notification = await addNotification(title, message);
    res.json({ success: true, notification: notification });
});
app.delete('/api/admin/delete_notification/:id', async (req, res) => {
    const { id } = req.params;
    const result = await deleteNotification(parseInt(id));
    if (result.success) res.json({ success: true });
    else res.status(404).json({ error: result.error });
});

// ============ КЛИЕНТСКИЕ ЭНДПОИНТЫ ============

// Регистрация/вход
app.post('/api/register', async (req, res) => {
    const { username, key, hwid } = req.body;
    if (!username || username.length < 2) return res.status(400).json({ error: 'Имя должно содержать минимум 2 символа' });
    if (!key || key.length !== 19) return res.status(400).json({ error: 'Неверный формат ключа' });
    const result = await checkKey(key, username, hwid);
    if (result.success) res.json({ success: true, userId: result.userId, username: result.username, expiresAt: result.expiresAt });
    else res.status(401).json({ error: result.error });
});

// Активация ключа
app.post('/api/activate', async (req, res) => {
    const { username, key, hwid } = req.body;
    if (!username || username.length < 2) return res.status(400).json({ error: 'Имя должно содержать минимум 2 символа' });
    if (!key || key.length !== 19) return res.status(400).json({ error: 'Неверный формат ключа' });
    const result = await activateKey(key, username, hwid);
    if (result.success) res.json({ success: true, userId: result.userId, username: username, expiresAt: result.expiresAt });
    else res.status(401).json({ error: result.error });
});

// Поиск пользователя
app.post('/api/find_user', async (req, res) => {
    const { username, userId } = req.body;
    const keysData = await getAllKeys();
    let foundUser = null;
    for (const [key, data] of Object.entries(keysData.keys)) {
        if (data.activated && data.username === username && data.user_id === userId) {
            foundUser = { id: data.user_id, username: data.username };
            break;
        }
    }
    if (foundUser) res.json({ success: true, user: foundUser });
    else res.json({ success: false, error: 'Пользователь не найден' });
});

// Отправка сообщения (с сохранением image_data в JSON)
app.post('/api/send', async (req, res) => {
    const { from, to, text, is_image, image_data } = req.body;

    if (!from || !to) return res.status(400).json({ error: 'Недостаточно данных' });

    const messageId = Date.now();

    const message = {
        id: messageId,
        from: from,
        to: to,
        text: text || (is_image ? '[Изображение]' : ''),
        is_image: is_image || false,
        image_data: is_image ? image_data : null,
        timestamp: Math.floor(getMoscowTime() / 1000)
    };

    // Сохраняем для получателя
    const dialogTo = await getDialog(from, to);
    dialogTo.messages.push(message);
    if (dialogTo.messages.length > 100) dialogTo.messages = dialogTo.messages.slice(-100);
    await saveDialog(from, to, dialogTo);

    // Сохраняем для отправителя
    const dialogFrom = await getDialog(to, from);
    dialogFrom.messages.push(message);
    if (dialogFrom.messages.length > 100) dialogFrom.messages = dialogFrom.messages.slice(-100);
    await saveDialog(to, from, dialogFrom);

    console.log(`📨 ${from} -> ${to}: ${is_image ? '[Изображение]' : text.substring(0, 50)}`);
    res.json({ success: true, message: message });
});

// Получение сообщений
app.get('/api/messages/:userId', async (req, res) => {
    const { userId } = req.params;
    const lastId = parseInt(req.query.last_id) || 0;
    try {
        const dialogFiles = await fs.readdir(DIALOGS_DIR);
        const newMessages = [];
        for (const file of dialogFiles) {
            const [user1, user2] = file.replace('.json', '').split('_');
            if (user1 === userId || user2 === userId) {
                const dialogPath = path.join(DIALOGS_DIR, file);
                const data = await fs.readFile(dialogPath, 'utf-8');
                const dialog = JSON.parse(data);
                const messages = dialog.messages.filter(m => m.id > lastId);
                newMessages.push(...messages);
            }
        }
        newMessages.sort((a, b) => a.timestamp - b.timestamp);
        res.json({ messages: newMessages });
    } catch (error) { res.json({ messages: [] }); }
});

// Информация о пользователе
app.get('/api/user/:userId', async (req, res) => {
    const { userId } = req.params;
    const keysData = await getAllKeys();
    for (const [key, data] of Object.entries(keysData.keys)) {
        if (data.activated && data.user_id === userId) return res.json({ success: true, user: { id: data.user_id, username: data.username } });
    }
    res.status(404).json({ error: 'Пользователь не найден' });
});

// Информация о диалоге
app.get('/api/dialog_info/:userId/:chatId', async (req, res) => {
    const { userId, chatId } = req.params;
    const dialog = await getDialog(userId, chatId);
    const settings = await getSettings();
    const now = getMoscowTime();
    const created_at = dialog.created_at || now;
    const lifetimeMs = settings.dialog_lifetime_days * 24 * 60 * 60 * 1000;
    const expires_at = created_at + lifetimeMs;
    const time_left = expires_at - now;
    res.json({
        created_at: created_at,
        expires_at: expires_at,
        time_left_ms: Math.max(0, time_left),
        time_left_hours: Math.max(0, Math.floor(time_left / (1000 * 60 * 60))),
        time_left_days: Math.max(0, Math.floor(time_left / (1000 * 60 * 60 * 24))),
        is_expired: time_left <= 0,
        lifetime_days: settings.dialog_lifetime_days
    });
});

// Удаление диалога
app.delete('/api/delete_dialog', async (req, res) => {
    const { user1, user2 } = req.body;
    if (!user1 || !user2) return res.status(400).json({ error: 'Недостаточно данных' });
    const result = await deleteDialog(user1, user2);
    if (result.success) res.json({ success: true });
    else res.status(404).json({ error: 'Диалог не найден' });
});

// Проверка истечения диалога
app.post('/api/check_dialog_expiry', async (req, res) => {
    const { user1, user2 } = req.body;
    if (!user1 || !user2) return res.status(400).json({ error: 'Недостаточно данных' });
    const result = await checkAndDeleteExpiredDialog(user1, user2);
    res.json(result);
});

// Уведомления для клиента
app.get('/api/notifications/:userId', async (req, res) => {
    const { userId } = req.params;
    const lastId = parseInt(req.query.last_id) || 0;
    const notifications = await getUserNotifications(userId, lastId);
    res.json({ notifications: notifications });
});

// Статус сервера
app.get('/health', async (req, res) => {
    const keysData = await getAllKeys();
    const activatedCount = Object.values(keysData.keys).filter(k => k.activated).length;
    const dialogFiles = await fs.readdir(DIALOGS_DIR).catch(() => []);
    const notificationsData = await getAllNotifications();
    const settings = await getSettings();
    res.json({
        status: 'ok',
        total_keys: Object.keys(keysData.keys).length,
        activated_keys: activatedCount,
        dialogs_count: dialogFiles.length,
        notifications_count: notificationsData.notifications.length,
        auto_cleanup_enabled: settings.auto_cleanup_enabled,
        dialog_lifetime_days: settings.dialog_lifetime_days,
        timestamp: getMoscowTime()
    });
});

// Главная страница
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'admin.html')); });

// ============ ЗАПУСК ============
async function start() {
    await initDataStorage();
    setInterval(cleanupOldDialogs, 5 * 60 * 1000); // Каждые 5 минут
    cleanupOldDialogs();
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`\n${'='.repeat(50)}`);
        console.log(`🚀 Сервер мессенджера запущен!`);
        console.log(`${'='.repeat(50)}`);
        console.log(`📡 Порт: ${PORT}`);
        console.log(`📁 Данные: ${DATA_DIR}`);
        console.log(`🔐 Админ панель: https://msgsendlerpro.bothost.tech/`);
        console.log(`📊 Health: https://msgsendlerpro.bothost.tech/health`);
        console.log(`🕐 Часовой пояс: MSK (UTC+3)`);
        console.log(`${'='.repeat(50)}\n`);
    });
}

start();