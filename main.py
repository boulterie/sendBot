import asyncio
import logging
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import Message
from github import Github
from datetime import datetime

# Настройки
TOKEN = "ВАШ_ТОКЕН_ТЕЛЕГРАМ_БОТА"
GITHUB_TOKEN = "ВАШ_ТОКЕН_GITHUB"
ADMIN_ID = 123456789  # Ваш Telegram ID

# Инициализация
bot = Bot(token=TOKEN)
dp = Dispatcher()
g = Github(GITHUB_TOKEN)
user = g.get_user()

# Словарь для хранения привязанных пользователей {telegram_id: target_id}
attached_users = {}


class GistManager:
    @staticmethod
    def find_gist_by_description(description: str):
        """Поиск Gist по описанию"""
        for gist in user.get_gists():
            if gist.description == description:
                return gist
        return None

    @staticmethod
    def create_gist_for_id(target_id: str):
        """Создание нового Gist для ID"""
        description = f"tg_chat_{target_id}"
        filename = f"{target_id}.txt"

        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        content = f"=== Чат для пользователя {target_id} ===\n"
        content += f"Создан: {timestamp}\n"
        content += "=" * 50 + "\n\n"

        gist = user.create_gist(
            public=False,
            description=description,
            files={filename: content}
        )
        return gist

    @staticmethod
    def add_message_to_gist(target_id: str, message: str):
        """Добавление сообщения в Gist"""
        description = f"tg_chat_{target_id}"
        filename = f"{target_id}.txt"

        # Ищем существующий Gist
        gist = GistManager.find_gist_by_description(description)

        if not gist:
            gist = GistManager.create_gist_for_id(target_id)

        # Получаем текущее содержимое
        current_content = gist.files[filename].content

        # Добавляем новое сообщение
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        new_content = current_content + f"[{timestamp}] {message}\n"

        # Обновляем Gist
        gist.edit(files={filename: new_content})
        return gist


def is_admin(user_id: int) -> bool:
    return user_id == ADMIN_ID


@dp.message(Command("start"))
async def cmd_start(message: Message):
    await message.answer(
        "👋 Добро пожаловать!\n\n"
        "📝 **Команды:**\n"
        "/attach [id] - Привязать ID для получения сообщений\n"
        "/myid - Показать ваш Telegram ID\n"
        "/info - Информация о текущем ID\n"
        "/help - Помощь\n\n"
        "👑 **Команды администратора:**\n"
        "/list_gists - Список всех Gist\n"
        "/get_gist [id] - Информация о Gist",
        parse_mode="Markdown"
    )


@dp.message(Command("help"))
async def cmd_help(message: Message):
    help_text = (
        "📚 **Как это работает:**\n\n"
        "1️⃣ Отправьте `/attach user123` чтобы привязать ID\n"
        "2️⃣ Бот создаст **отдельный Gist** с названием `user123`\n"
        "3️⃣ Все ваши сообщения будут сохраняться в этот Gist\n"
        "4️⃣ Получатель с таким же ID может читать их через ПК программу\n\n"
        "📌 **Важно:**\n"
        "• Каждый ID = отдельный Gist на GitHub\n"
        "• Gist создается автоматически при первом сообщении\n"
        "• Сообщения сохраняются с временными метками"
    )
    await message.answer(help_text, parse_mode="Markdown")


@dp.message(Command("myid"))
async def cmd_myid(message: Message):
    await message.answer(f"🆔 **Ваш Telegram ID:** `{message.from_user.id}`", parse_mode="Markdown")


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

    # Проверяем существование Gist
    description = f"tg_chat_{target_id}"
    existing_gist = GistManager.find_gist_by_description(description)

    if existing_gist:
        await message.answer(
            f"📁 **Найден существующий Gist**\n"
            f"ID: `{target_id}`\n"
            f"URL: {existing_gist.html_url}",
            parse_mode="Markdown"
        )
    else:
        await message.answer(
            f"📁 **Будет создан новый Gist**\n"
            f"ID: `{target_id}`\n"
            f"(при первом сообщении)",
            parse_mode="Markdown"
        )

    await message.answer(
        f"✅ **Успешно привязано!**\n\n"
        f"ID получателя: `{target_id}`\n"
        f"Теперь все ваши сообщения будут сохраняться в Gist с этим ID.",
        parse_mode="Markdown"
    )


@dp.message(Command("info"))
async def cmd_info(message: Message):
    user_id = str(message.from_user.id)

    if user_id not in attached_users:
        await message.answer(
            "❌ У вас нет привязанного ID.\n"
            "Используйте `/attach [id]`",
            parse_mode="Markdown"
        )
        return

    target_id = attached_users[user_id]
    description = f"tg_chat_{target_id}"
    gist = GistManager.find_gist_by_description(description)

    if gist:
        files = list(gist.files.keys())
        await message.answer(
            f"📊 **Информация о вашем Gist:**\n\n"
            f"ID: `{target_id}`\n"
            f"Файл: `{files[0]}`\n"
            f"Создан: {gist.created_at.strftime('%Y-%m-%d %H:%M:%S')}\n"
            f"Обновлен: {gist.updated_at.strftime('%Y-%m-%d %H:%M:%S')}\n"
            f"URL: {gist.html_url}",
            parse_mode="Markdown"
        )
    else:
        await message.answer(
            f"ℹ️ ID `{target_id}` привязан, но Gist еще не создан.\n"
            f"Отправьте сообщение, чтобы создать Gist.",
            parse_mode="Markdown"
        )


@dp.message(Command("list_gists"))
async def cmd_list_gists(message: Message):
    """Команда для администратора"""
    if not is_admin(message.from_user.id):
        await message.answer("❌ У вас нет прав на выполнение этой команды.")
        return

    try:
        gists = list(user.get_gists())
        if not gists:
            await message.answer("📁 Нет ни одного Gist")
            return

        gist_list = []
        for gist in gists[:10]:  # Показываем только первые 10
            files = ", ".join(gist.files.keys())
            gist_list.append(f"📄 `{gist.description}`\n   Файлы: {files}\n   [Ссылка]({gist.html_url})")

        text = "**Последние Gist:**\n\n" + "\n\n".join(gist_list)
        await message.answer(text, parse_mode="Markdown", disable_web_page_preview=True)
    except Exception as e:
        await message.answer(f"❌ Ошибка: {e}")


@dp.message(Command("get_gist"))
async def cmd_get_gist(message: Message):
    """Команда для администратора"""
    if not is_admin(message.from_user.id):
        await message.answer("❌ У вас нет прав на выполнение этой команды.")
        return

    args = message.text.split()
    if len(args) < 2:
        await message.answer("❌ Укажите ID. Пример: /get_gist user123")
        return

    target_id = args[1]
    description = f"tg_chat_{target_id}"
    gist = GistManager.find_gist_by_description(description)

    if gist:
        filename = f"{target_id}.txt"
        content = gist.files[filename].content

        if len(content) > 4000:
            content = content[:4000] + "...\n\n(сообщение обрезано)"

        await message.answer(
            f"**Содержимое Gist для ID `{target_id}`:**\n\n```\n{content}\n```",
            parse_mode="Markdown"
        )
    else:
        await message.answer(f"❌ Gist для ID {target_id} не найден")


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
        gist = GistManager.add_message_to_gist(target_id, message.text)

        # Отправляем подтверждение
        preview = message.text[:50] + "..." if len(message.text) > 50 else message.text
        await message.answer(
            f"✅ **Сохранено в Gist!**\n\n"
            f"ID: `{target_id}`\n"
            f"Сообщение: \"{preview}\"\n"
            f"Время: {datetime.now().strftime('%H:%M:%S')}\n\n"
            f"🔗 {gist.html_url}",
            parse_mode="Markdown",
            disable_web_page_preview=True
        )
    except Exception as e:
        logging.error(f"Ошибка сохранения: {e}")
        await message.answer("❌ **Ошибка** при сохранении сообщения. Попробуйте позже.", parse_mode="Markdown")


async def main():
    logging.basicConfig(level=logging.INFO)
    print(f"🤖 Бот запущен. Администратор: {ADMIN_ID}")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())