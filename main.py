import asyncio
import logging
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import Message
from github import Github
from github.GithubException import UnknownObjectException
from datetime import datetime
import os

# Настройки
TOKEN = os.getenv('BOT_TOKEN')
GITHUB_TOKEN = os.getenv('GITHUB_TOKEN')
GIST_ID = os.getenv('GIST_ID')
ADMIN_ID = os.getenv('ADMIN_ID')

# Инициализация
bot = Bot(token=TOKEN)
dp = Dispatcher()
g = Github(GITHUB_TOKEN)

# Получаем существующий Gist
try:
    gist = g.get_gist(GIST_ID)
    print(f"✅ Подключено к Gist: {gist.html_url}")
except Exception as e:
    print(f"❌ Ошибка подключения к Gist: {e}")
    exit(1)

# Словарь для хранения привязанных пользователей
# В реальном проекте лучше использовать базу данных
attached_users = {}


class GistFileManager:
    def __init__(self, gist):
        self.gist = gist

    async def add_message(self, user_id: str, message: str):
        """Добавление сообщения в файл пользователя"""
        filename = f"{user_id}.txt"
        files_to_update = {}

        # Получаем текущее содержимое, если файл существует
        current_content = ""
        if filename in self.gist.files:
            current_content = self.gist.files[filename].content

        # Добавляем новое сообщение с временной меткой
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        new_content = current_content + f"[{timestamp}] {message}\n"

        # Подготавливаем обновление
        files_to_update[filename] = new_content

        # Сохраняем остальные файлы без изменений
        for fname, file in self.gist.files.items():
            if fname != filename:
                files_to_update[fname] = file.content

        # Обновляем Gist
        self.gist.edit(files=files_to_update)

    def user_file_exists(self, user_id: str) -> bool:
        """Проверка существования файла пользователя"""
        return f"{user_id}.txt" in self.gist.files

    def create_user_file(self, user_id: str):
        """Создание нового файла для пользователя"""
        filename = f"{user_id}.txt"
        files_to_update = {}

        # Добавляем новый файл с заголовком
        for fname, file in self.gist.files.items():
            files_to_update[fname] = file.content

        # Добавляем новый файл
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        header = f"=== Сообщения для пользователя {user_id} ===\nСоздано: {timestamp}\n{'-' * 50}\n\n"
        files_to_update[filename] = header

        # Обновляем Gist
        self.gist.edit(files=files_to_update)


gist_manager = GistFileManager(gist)


# Проверка на администратора
def is_admin(user_id: int) -> bool:
    return user_id == ADMIN_ID


@dp.message(Command("start"))
async def cmd_start(message: Message):
    await message.answer(
        "👋 Добро пожаловать!\n\n"
        "📝 Команды для всех:\n"
        "/attach [id] - Привязать ID для получения сообщений\n"
        "/myid - Показать ваш Telegram ID\n"
        "/help - Помощь\n\n"
        "👑 Команды администратора:\n"
        "/list_users - Список всех файлов в Gist\n"
        "/get_file [id] - Показать содержимое файла"
    )


@dp.message(Command("help"))
async def cmd_help(message: Message):
    help_text = (
        "📚 **Как это работает:**\n\n"
        "1️⃣ Отправьте /attach [любой_id] чтобы привязать получателя\n"
        "2️⃣ После привязки все ваши сообщения будут сохраняться в Gist\n"
        "3️⃣ Получатель с таким же ID сможет читать их через ПК программу\n\n"
        "📌 **Пример:**\n"
        "/attach user123 - привязать ID 'user123'\n"
        "После этого все сообщения будут сохраняться в файл user123.txt\n\n"
        "💡 **Совет:** Используйте /myid чтобы узнать свой Telegram ID"
    )
    await message.answer(help_text, parse_mode="Markdown")


@dp.message(Command("myid"))
async def cmd_myid(message: Message):
    await message.answer(f"🆔 Ваш Telegram ID: `{message.from_user.id}`", parse_mode="Markdown")


@dp.message(Command("attach"))
async def cmd_attach(message: Message):
    args = message.text.split()

    if len(args) < 2:
        await message.answer(
            "❌ **Ошибка:** Укажите ID!\n"
            "Пример: `/attach user123`",
            parse_mode="Markdown"
        )
        return

    target_id = args[1]
    user_id = str(message.from_user.id)

    # Сохраняем привязку
    attached_users[user_id] = target_id

    # Проверяем существование файла в Gist
    try:
        if not gist_manager.user_file_exists(target_id):
            gist_manager.create_user_file(target_id)
            await message.answer(f"📁 **Создан новый файл** для ID: `{target_id}`", parse_mode="Markdown")
        else:
            await message.answer(f"📁 **Найден существующий файл** для ID: `{target_id}`", parse_mode="Markdown")

        await message.answer(
            f"✅ **Успешно привязано!**\n\n"
            f"ID получателя: `{target_id}`\n"
            f"Файл: `{target_id}.txt`\n\n"
            f"Теперь все ваши сообщения будут сохраняться для этого получателя.",
            parse_mode="Markdown"
        )
    except Exception as e:
        logging.error(f"Ошибка при привязке: {e}")
        await message.answer("❌ **Ошибка** при работе с Gist. Попробуйте позже.", parse_mode="Markdown")


@dp.message(Command("list_users"))
async def cmd_list_users(message: Message):
    """Команда для администратора - список всех файлов"""
    if not is_admin(message.from_user.id):
        await message.answer("❌ У вас нет прав на выполнение этой команды.")
        return

    try:
        files = list(gist.gist.files.keys())
        if not files:
            await message.answer("📁 В Gist нет файлов")
            return

        file_list = "\n".join([f"📄 `{f}`" for f in files])
        await message.answer(
            f"**Файлы в Gist:**\n\n{file_list}",
            parse_mode="Markdown"
        )
    except Exception as e:
        await message.answer(f"❌ Ошибка: {e}")


@dp.message(Command("get_file"))
async def cmd_get_file(message: Message):
    """Команда для администратора - показать содержимое файла"""
    if not is_admin(message.from_user.id):
        await message.answer("❌ У вас нет прав на выполнение этой команды.")
        return

    args = message.text.split()
    if len(args) < 2:
        await message.answer("❌ Укажите ID файла. Пример: /get_file user123")
        return

    target_id = args[1]
    filename = f"{target_id}.txt"

    try:
        if filename in gist.gist.files:
            content = gist.gist.files[filename].content
            # Обрезаем если слишком длинное
            if len(content) > 4000:
                content = content[:4000] + "...\n\n(сообщение обрезано)"
            await message.answer(f"**Содержимое {filename}:**\n\n```\n{content}\n```", parse_mode="Markdown")
        else:
            await message.answer(f"❌ Файл {filename} не найден")
    except Exception as e:
        await message.answer(f"❌ Ошибка: {e}")


@dp.message()
async def handle_message(message: Message):
    # Игнорируем команды
    if message.text and message.text.startswith('/'):
        return

    user_id = str(message.from_user.id)

    # Проверяем, привязан ли пользователь
    if user_id not in attached_users:
        await message.answer(
            "❌ **Сначала привяжите ID!**\n\n"
            "Используйте команду:\n"
            "`/attach [любой_id]`\n\n"
            "Например: `/attach user123`",
            parse_mode="Markdown"
        )
        return

    target_id = attached_users[user_id]

    # Сохраняем сообщение в Gist
    try:
        await gist_manager.add_message(target_id, message.text)

        # Отправляем подтверждение с превью
        preview = message.text[:50] + "..." if len(message.text) > 50 else message.text
        await message.answer(
            f"✅ **Сохранено!**\n\n"
            f"Для ID: `{target_id}`\n"
            f"Сообщение: \"{preview}\"\n"
            f"Время: {datetime.now().strftime('%H:%M:%S')}",
            parse_mode="Markdown"
        )
    except Exception as e:
        logging.error(f"Ошибка сохранения: {e}")
        await message.answer("❌ **Ошибка** при сохранении сообщения. Попробуйте позже.", parse_mode="Markdown")


async def main():
    logging.basicConfig(level=logging.INFO)
    print(f"🤖 Бот запущен. Администратор: {ADMIN_ID}")
    print(f"📁 Используется Gist: {gist.html_url}")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())