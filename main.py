import asyncio
import logging
import os

from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import Message
from github import Github, InputFileContent
from datetime import datetime

# Настройки
TOKEN = os.getenv('BOT_TOKEN')
GITHUB_TOKEN = os.getenv('GITHUB_TOKEN')

# Инициализация
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

bot = Bot(token=TOKEN)
dp = Dispatcher()
g = Github(GITHUB_TOKEN)
user = g.get_user()

# Хранилище привязанных пользователей
active_chats = {}


class ChatManager:
    @staticmethod
    def find_chat_by_id(chat_id: str):
        """Поиск чата по ID"""
        try:
            for gist in user.get_gists():
                if gist.description == f"chat_{chat_id}":
                    return gist
            return None
        except Exception as e:
            logger.error(f"Ошибка поиска: {e}")
            return None

    @staticmethod
    def create_chat(chat_id: str):
        """Создание нового чата"""
        filename = f"{chat_id}.txt"
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        content = f"=== Чат создан: {timestamp} ===\n\n"

        try:
            gist = user.create_gist(
                public=False,
                description=f"chat_{chat_id}",
                files={filename: InputFileContent(content)}
            )
            logger.info(f"Чат создан для ID: {chat_id}")
            return gist
        except Exception as e:
            logger.error(f"Ошибка создания: {e}")
            return None

    @staticmethod
    def add_message(chat_id: str, message: str, sender: str):
        """Добавление сообщения в чат"""
        filename = f"{chat_id}.txt"
        gist = ChatManager.find_chat_by_id(chat_id)

        if not gist:
            gist = ChatManager.create_chat(chat_id)
            if not gist:
                return None

        try:
            current = gist.files[filename].content
            timestamp = datetime.now().strftime("%H:%M")
            new_msg = f"[{timestamp}] {sender}: {message}\n"

            gist.edit(files={filename: InputFileContent(current + new_msg)})
            return gist
        except Exception as e:
            logger.error(f"Ошибка добавления сообщения: {e}")
            return None

    @staticmethod
    def clear_chat(chat_id: str):
        """Очистка чата"""
        filename = f"{chat_id}.txt"
        gist = ChatManager.find_chat_by_id(chat_id)

        if gist:
            try:
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                content = f"=== Чат очищен: {timestamp} ===\n\n"
                gist.edit(files={filename: InputFileContent(content)})
                return True
            except Exception as e:
                logger.error(f"Ошибка очистки: {e}")
                return False
        return False


@dp.message(Command("start"))
async def cmd_start(message: Message):
    await message.answer(
        "🔐 *Hidden Messenger*\n\n"
        "📱 *Команды:*\n"
        "▫️ /attach – создать новый чат\n"
        "▫️ /myid – показать мой ID\n"
        "▫️ /clear – очистить историю\n"
        "▫️ /help – помощь\n\n"
        "✨ *Все сообщения синхронизируются автоматически*",
        parse_mode="Markdown"
    )


@dp.message(Command("help"))
async def cmd_help(message: Message):
    help_text = (
        "📱 *Как пользоваться:*\n\n"
        "1️⃣ *Шаг 1:* Отправьте /attach\n"
        "2️⃣ *Шаг 2:* Скопируйте свой ID\n"
        "3️⃣ *Шаг 3:* Введите ID в приложении\n"
        "4️⃣ *Шаг 4:* Общайтесь! 💬\n\n"
        "✨ *Все сообщения сохраняются автоматически*\n"
        "🔄 *Синхронизация происходит в реальном времени*"
    )
    await message.answer(help_text, parse_mode="Markdown")


@dp.message(Command("myid"))
async def cmd_myid(message: Message):
    user_id = str(message.from_user.id)
    await message.answer(
        f"🆔 *Ваш ID:* `{user_id}`\n\n"
        f"📋 *Нажмите на ID чтобы скопировать*",
        parse_mode="Markdown"
    )


@dp.message(Command("attach"))
async def cmd_attach(message: Message):
    user_id = str(message.from_user.id)

    # Проверяем существует ли уже чат
    existing = ChatManager.find_chat_by_id(user_id)

    if existing:
        active_chats[user_id] = user_id
        await message.answer(
            f"🔓 *Чат уже существует!*\n\n"
            f"🆔 *Ваш ID:* `{user_id}`\n\n"
            f"✅ *Можете отправлять сообщения*",
            parse_mode="Markdown"
        )
    else:
        # Создаем новый чат
        chat = ChatManager.create_chat(user_id)
        if chat:
            active_chats[user_id] = user_id
            await message.answer(
                f"✅ *Чат успешно создан!*\n\n"
                f"🆔 *Ваш ID:* `{user_id}`\n\n"
                f"📱 *Введите этот ID в приложении Hidden Messenger*\n\n"
                f"✨ *Теперь все сообщения будут сохраняться*",
                parse_mode="Markdown"
            )
        else:
            await message.answer(
                "❌ *Ошибка создания чата*\n\n"
                "⚠️ Попробуйте позже или проверьте соединение",
                parse_mode="Markdown"
            )


@dp.message(Command("clear"))
async def cmd_clear(message: Message):
    user_id = str(message.from_user.id)

    if ChatManager.clear_chat(user_id):
        await message.answer(
            "🧹 *История чата очищена*\n\n"
            "📝 *Можете начинать новый диалог*",
            parse_mode="Markdown"
        )
    else:
        await message.answer(
            "❌ *Ошибка*\n\n"
            "Сначала создайте чат командой /attach",
            parse_mode="Markdown"
        )


@dp.message()
async def handle_message(message: Message):
    if message.text and message.text.startswith('/'):
        return

    user_id = str(message.from_user.id)

    if user_id not in active_chats:
        # Проверяем есть ли чат в GitHub
        existing = ChatManager.find_chat_by_id(user_id)
        if existing:
            active_chats[user_id] = user_id
        else:
            await message.answer(
                "❌ *Чат не найден*\n\n"
                "📱 Создайте новый чат командой /attach",
                parse_mode="Markdown"
            )
            return

    # Отправляем сообщение
    sender_name = message.from_user.first_name or "Пользователь"
    chat = ChatManager.add_message(user_id, message.text, sender_name)

    if chat:
        # Отправляем подтверждение с эмодзи
        await message.answer(
            "✅ *Отправлено*",
            parse_mode="Markdown"
        )
    else:
        await message.answer(
            "❌ *Ошибка отправки*\n\n"
            "⚠️ Попробуйте еще раз",
            parse_mode="Markdown"
        )


async def main():
    logger.info("🤖 Hidden Messenger запущен")
    logger.info("✨ Бот готов к работе")

    # Проверка подключения к GitHub
    try:
        user.login
        logger.info(f"✅ GitHub подключен: {user.login}")
    except Exception as e:
        logger.error(f"❌ Ошибка GitHub: {e}")

    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())