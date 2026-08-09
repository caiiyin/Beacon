import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from dotenv import load_dotenv

load_dotenv()

# SQLite URL을 비동기 드라이버(aiosqlite)용으로 변환
_raw_url = os.getenv("DATABASE_URL", "sqlite:///./beacon.db")
DATABASE_URL = _raw_url.replace("sqlite:///", "sqlite+aiosqlite:///")

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


# FastAPI 의존성 주입용 DB 세션 제너레이터
async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
