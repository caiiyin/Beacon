"""
STT (음성 → 텍스트) 서비스.

우선순위: Mock 모드(USE_MOCK_AI=true) → OpenAI Whisper API
지원 언어: ko / en / vi / th / km

Whisper는 언어를 자동 감지할 수 있지만,
근로자가 앱에서 선택한 언어를 힌트로 넘겨 정확도를 높인다.
"""
import os
import random
import tempfile
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

USE_MOCK = os.getenv("USE_MOCK_AI", "true").lower() == "true"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# OpenAI Whisper가 인식하는 언어 코드 (ISO 639-1)
WHISPER_LANG_CODE = {
    "ko": "ko",
    "en": "en",
    "vi": "vi",
    "th": "th",
    "km": "km",   # Khmer — Whisper large-v2 이상에서 지원
}

# ── Mock 음성 신고 샘플 (언어별 3개씩, 호출마다 랜덤 선택) ──────────────
MOCK_TRANSCRIPTIONS: dict[str, list[str]] = {
    "ko": [
        "작업 중에 사다리에서 떨어져서 발목을 다쳤습니다. 도움이 필요합니다.",
        "화학물질이 눈에 튀었습니다. 응급처치가 필요합니다.",
        "무거운 자재가 발등에 떨어졌습니다. 많이 아프고 움직이기 힘듭니다.",
    ],
    "en": [
        "I fell off a ladder while working and hurt my ankle. I need help.",
        "Chemical splashed into my eyes. I need first aid right away.",
        "A heavy material dropped on my foot. It hurts a lot and I can't move.",
    ],
    "vi": [
        "Tôi bị ngã từ thang trong khi làm việc và bị thương ở mắt cá chân. Tôi cần giúp đỡ.",
        "Hóa chất bắn vào mắt tôi. Tôi cần sơ cứu ngay lập tức.",
        "Vật liệu nặng rơi vào chân tôi. Rất đau và tôi không thể đi lại.",
    ],
    "th": [
        "ฉันตกจากบันไดขณะทำงานและได้รับบาดเจ็บที่ข้อเท้า ฉันต้องการความช่วยเหลือ",
        "สารเคมีกระเด็นเข้าตาฉัน ฉันต้องการปฐมพยาบาลทันที",
        "วัสดุหนักตกใส่เท้าฉัน เจ็บมากและเดินไม่ได้",
    ],
    "km": [
        "ខ្ញុំបានធ្លាក់ពីជណ្តើរខណៈពេលធ្វើការ ហើយបានរងរបួសកជើង ខ្ញុំត្រូវការជំនួយ",
        "សារធាតុគីមីបានបាញ់ចូលភ្នែករបស់ខ្ញុំ ខ្ញុំត្រូវការការព្យាបាលដំបូងភ្លាមៗ",
        "វត្ថុធ្ងន់ធ្លាក់លើជើងខ្ញុំ ឈឺខ្លាំង ហើយដើរមិនបាន",
    ],
}


async def transcribe(audio_bytes: bytes, filename: str, language: str = "ko") -> dict:
    """
    음성 바이트를 텍스트로 변환한다.

    Args:
        audio_bytes: 업로드된 음성 파일의 바이트
        filename:    원본 파일명 (확장자로 포맷 판별)
        language:    근로자가 선택한 언어 코드 (ko/en/vi/th/km)

    Returns:
        {"text": str, "language": str, "mock": bool}
    """
    if USE_MOCK:
        return _mock_transcribe(language)

    if not OPENAI_API_KEY:
        print("[STT] API 키 없음 → Mock으로 대체")
        return _mock_transcribe(language)

    try:
        return await _whisper_transcribe(audio_bytes, filename, language)
    except Exception as e:
        print(f"[STT] Whisper 실패 ({e}) → Mock으로 대체")
        return _mock_transcribe(language)


def _mock_transcribe(language: str) -> dict:
    """언어에 맞는 Mock 음성 신고 텍스트를 랜덤 반환한다."""
    samples = MOCK_TRANSCRIPTIONS.get(language, MOCK_TRANSCRIPTIONS["ko"])
    return {
        "text":     random.choice(samples),
        "language": language,
        "mock":     True,
    }


async def _whisper_transcribe(audio_bytes: bytes, filename: str, language: str) -> dict:
    """OpenAI Whisper API로 실제 음성을 변환한다."""
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=OPENAI_API_KEY)

    # Whisper API는 파일 객체가 필요하므로 임시 파일로 저장
    suffix = Path(filename).suffix or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        with open(tmp_path, "rb") as f:
            whisper_lang = WHISPER_LANG_CODE.get(language)  # None이면 자동 감지
            transcript = await client.audio.transcriptions.create(
                model="whisper-1",
                file=f,
                language=whisper_lang,
                response_format="text",
            )
        return {
            "text":     transcript.strip(),
            "language": language,
            "mock":     False,
        }
    finally:
        Path(tmp_path).unlink(missing_ok=True)   # 임시 파일 삭제


def save_audio(audio_bytes: bytes, filename: str, report_id: int) -> str:
    """업로드된 음성 파일을 uploads/ 에 저장하고 경로를 반환한다."""
    upload_dir = Path(__file__).parent.parent.parent / "uploads"
    upload_dir.mkdir(exist_ok=True)

    suffix = Path(filename).suffix or ".webm"
    save_path = upload_dir / f"report_{report_id}{suffix}"
    save_path.write_bytes(audio_bytes)
    return str(save_path)
