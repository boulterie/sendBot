# bot_simple.py - работает на ХОСТИНГЕ
import asyncio
import logging
import os
import socket
import platform
import subprocess
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import Message

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Токен твоего бота
TOKEN = os.getenv('BOT_TOKEN')

# Инициализация бота и диспетчера
bot = Bot(token=TOKEN)
dp = Dispatcher()


def get_ip_info():
    """Получает IP адреса только стандартными средствами"""
    ips = {
        "localhost": "127.0.0.1",
        "local_ip": "Не определен",
        "hostname": socket.gethostname()
    }

    # Способ 1: через подключение к внешнему серверу
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ips["local_ip"] = s.getsockname()[0]
        s.close()
    except:
        pass

    # Способ 2: через gethostbyname (может сработать)
    if ips["local_ip"] == "Не определен":
        try:
            ips["local_ip"] = socket.gethostbyname(socket.gethostname())
        except:
            pass

    return ips


@dp.message(Command("start"))
async def cmd_start(message: Message):
    """Обработчик команды /start"""
    await message.reply("Привет! Бот работает! 🤖")


@dp.message(Command("ip"))
async def cmd_ip(message: Message):
    """Показать информацию о IP"""
    ips = get_ip_info()

    info = f"📡 Информация о сервере:\n"
    info += f"Hostname: {ips['hostname']}\n"
    info += f"IP адрес: {ips['local_ip']}\n"

    await message.reply(info)


@dp.message()
async def echo_message(message: Message):
    """На любое сообщение отвечает"""
    await message.reply(f"Привет! Ты написал: {message.text}")


async def on_startup():
    """Действия при запуске"""
    ips = get_ip_info()
    logger.info("=" * 50)
    logger.info("🚀 БОТ ЗАПУЩЕН!")
    logger.info(f"Hostname: {ips['hostname']}")
    logger.info(f"IP адрес: {ips['local_ip']}")
    logger.info("=" * 50)


async def main():
    """Главная функция запуска"""
    dp.startup.register(on_startup)
    logger.info("Запуск бота...")
    await dp.start_polling(bot)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Бот остановлен пользователем")