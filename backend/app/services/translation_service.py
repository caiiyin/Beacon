"""
번역 서비스.

우선순위: Mock 모드(USE_MOCK_AI=true) → Google Translate API → LibreTranslate(폴백)
언어 코드: ko(한국어) / en(영어) / vi(베트남어) / th(태국어) / km(크메르어)
"""
import os
import httpx
from dotenv import load_dotenv

load_dotenv()

USE_MOCK = os.getenv("USE_MOCK_AI", "true").lower() == "true"
GOOGLE_API_KEY = os.getenv("GOOGLE_TRANSLATE_API_KEY", "")
LIBRETRANSLATE_URL = os.getenv("LIBRETRANSLATE_URL", "https://libretranslate.com")

GOOGLE_TRANSLATE_ENDPOINT = "https://translation.googleapis.com/language/translate/v2"

# ── Mock 번역 사전 ───────────────────────────────────────────────────────
# 위험 이벤트 알림과 자주 쓰는 안전 문구를 미리 번역해둔 사전.
# 실제 API 연동 전 데모에서 자연스러운 다국어 문장을 보여준다.
MOCK_DICT: dict[str, dict[str, str]] = {
    # 위험 이벤트 메시지 템플릿
    "안전모 미착용 감지": {
        "en": "Safety helmet not detected",
        "vi": "Phát hiện không đội mũ bảo hộ",
        "th": "ตรวจพบการไม่สวมหมวกนิรภัย",
        "km": "រកឃើញការមិនពាក់មួកការពារ",
    },
    "안전조끼 미착용 감지": {
        "en": "Safety vest not detected",
        "vi": "Phát hiện không mặc áo phản quang",
        "th": "ตรวจพบการไม่สวมเสื้อกั๊กนิรภัย",
        "km": "រកឃើញការមិនពាក់អាវក្រោមមានពន្លឺ",
    },
    "즉시 안전모를 착용하세요": {
        "en": "Put on your safety helmet immediately",
        "vi": "Đội mũ bảo hộ ngay lập tức",
        "th": "สวมหมวกนิรภัยทันที",
        "km": "ពាក់មួកការពារភ្លាមៗ",
    },
    "즉시 안전조끼를 착용하세요": {
        "en": "Put on your safety vest immediately",
        "vi": "Mặc áo phản quang ngay lập tức",
        "th": "สวมเสื้อกั๊กนิรภัยทันที",
        "km": "ពាក់អាវក្រោមមានពន្លឺភ្លាមៗ",
    },
    "즉시 해당 구역을 벗어나세요": {
        "en": "Leave the area immediately",
        "vi": "Rời khỏi khu vực ngay lập tức",
        "th": "ออกจากพื้นที่ทันที",
        "km": "ចាកចេញពីតំបន់ភ្លាមៗ",
    },
    "위험구역 무단 출입 감지": {
        "en": "Unauthorized entry into restricted zone detected",
        "vi": "Phát hiện xâm nhập trái phép vào khu vực hạn chế",
        "th": "ตรวจพบการเข้าพื้นที่หวงห้ามโดยไม่ได้รับอนุญาต",
        "km": "រកឃើញការចូលដោយគ្មានការអនុញ្ញាតក្នុងតំបន់ហាមឃាត់",
    },
    "화재 또는 연기 감지": {
        "en": "Fire or smoke detected",
        "vi": "Phát hiện cháy hoặc khói",
        "th": "ตรวจพบไฟหรือควัน",
        "km": "រកឃើញភ្លើងឬផ្សែង",
    },
    # 공통 안내 문구
    "즉시 대피하세요": {
        "en": "Evacuate immediately",
        "vi": "Sơ tán ngay lập tức",
        "th": "อพยพทันที",
        "km": "គេចខ្លួនភ្លាមៗ",
    },
    "안전 관리자에게 연락하세요": {
        "en": "Contact the safety manager",
        "vi": "Liên hệ quản lý an toàn",
        "th": "ติดต่อผู้จัดการความปลอดภัย",
        "km": "ទាក់ទងអ្នកគ្រប់គ្រងសុវត្ថិភាព",
    },
    "신고가 접수되었습니다": {
        "en": "Your report has been received",
        "vi": "Báo cáo của bạn đã được nhận",
        "th": "ได้รับรายงานของคุณแล้ว",
        "km": "បានទទួលការរាយការណ៍របស់អ្នក",
    },
    "처리 중입니다": {
        "en": "Being processed",
        "vi": "Đang xử lý",
        "th": "กำลังดำเนินการ",
        "km": "កំពុងដំណើរការ",
    },

    # ── 관리자 답변 문구 (한국어 → 외국어) ──────────────────────────────
    "현재 응급팀이 출동 중입니다. 움직이지 말고 그 자리에서 기다리세요.": {
        "en": "The emergency team is on the way. Please stay still and wait.",
        "vi": "Đội cứu hộ đang trên đường đến. Vui lòng đứng yên và chờ đợi.",
        "th": "ทีมฉุกเฉินกำลังเดินทางมา โปรดอยู่นิ่งและรอ",
        "km": "ក្រុមសង្គ្រោះបន្ទាន់កំពុងមកដល់ សូមមិនត្រូវផ្លាស់ទីនៅកន្លែងនោះ",
    },
    "신고가 접수되었습니다. 담당자가 곧 도착합니다.": {
        "en": "Your report has been received. A staff member will arrive shortly.",
        "vi": "Báo cáo của bạn đã được nhận. Nhân viên sẽ đến ngay.",
        "th": "ได้รับรายงานของคุณแล้ว เจ้าหน้าที่จะมาถึงในไม่ช้า",
        "km": "បានទទួលការរាយការណ៍របស់អ្នក មន្រ្តីនឹងមកដល់ក្នុងពេលឆាប់ៗ",
    },
    "안전 관리자가 현장으로 이동 중입니다. 잠시만 기다려주세요.": {
        "en": "The safety manager is heading to the site. Please wait a moment.",
        "vi": "Quản lý an toàn đang đến hiện trường. Vui lòng chờ một chút.",
        "th": "ผู้จัดการความปลอดภัยกำลังมุ่งหน้าไปยังสถานที่ โปรดรอสักครู่",
        "km": "អ្នកគ្រប់គ្រងសុវត្ថិភាពកំពុងធ្វើដំណើរទៅកាន់ទីតាំង សូមរង់ចាំបន្តិច",
    },
    "119에 신고했습니다. 구급대원이 곧 도착합니다.": {
        "en": "119 has been called. Paramedics will arrive soon.",
        "vi": "Đã gọi 119. Nhân viên y tế sẽ đến ngay.",
        "th": "โทรแจ้ง 119 แล้ว เจ้าหน้าที่พยาบาลจะมาถึงในไม่ช้า",
        "km": "បានហៅ 119 រួចហើយ បុគ្គលិកសង្គ្រោះបន្ទាន់នឹងមកដល់ក្នុងពេលឆាប់ៗ",
    },

    # ── 사고 신고 문구 (외국어 → 한국어 역방향) ─────────────────────────
    # STT로 추출된 외국어 텍스트를 한국어로 번역할 때 사용
    "I fell off a ladder while working and hurt my ankle. I need help.": {
        "ko": "작업 중 사다리에서 떨어져 발목을 다쳤습니다. 도움이 필요합니다.",
    },
    "I fell from a ladder while working and injured my ankle. I need help.": {
        "ko": "작업 중 사다리에서 떨어져 발목을 다쳤습니다. 도움이 필요합니다.",
    },
    "Chemical splashed into my eyes. I need first aid right away.": {
        "ko": "화학물질이 눈에 튀었습니다. 즉시 응급처치가 필요합니다.",
    },
    "Chemical got into my eyes. I need first aid.": {
        "ko": "화학물질이 눈에 들어갔습니다. 응급처치가 필요합니다.",
    },
    "A heavy material dropped on my foot. It hurts a lot and I can't move.": {
        "ko": "무거운 자재가 발등에 떨어졌습니다. 많이 아프고 움직이기 힘듭니다.",
    },
    "A heavy material fell on my foot. It hurts a lot.": {
        "ko": "무거운 자재가 발등에 떨어졌습니다. 많이 아픕니다.",
    },
    "Tôi bị ngã từ thang trong khi làm việc và bị thương ở mắt cá chân. Tôi cần giúp đỡ.": {
        "ko": "작업 중 사다리에서 떨어져 발목을 다쳤습니다. 도움이 필요합니다.",
    },
    "Hóa chất bắn vào mắt tôi. Tôi cần sơ cứu ngay lập tức.": {
        "ko": "화학물질이 눈에 튀었습니다. 즉시 응급처치가 필요합니다.",
    },
    "Vật liệu nặng rơi vào chân tôi. Rất đau và tôi không thể đi lại.": {
        "ko": "무거운 자재가 발등에 떨어졌습니다. 매우 아프고 걸을 수 없습니다.",
    },
    "ฉันตกจากบันไดขณะทำงานและได้รับบาดเจ็บที่ข้อเท้า ฉันต้องการความช่วยเหลือ": {
        "ko": "작업 중 사다리에서 떨어져 발목을 다쳤습니다. 도움이 필요합니다.",
    },
    "สารเคมีกระเด็นเข้าตาฉัน ฉันต้องการปฐมพยาบาลทันที": {
        "ko": "화학물질이 눈에 튀었습니다. 즉시 응급처치가 필요합니다.",
    },
    "วัสดุหนักตกใส่เท้าฉัน เจ็บมากและเดินไม่ได้": {
        "ko": "무거운 자재가 발등에 떨어졌습니다. 매우 아프고 걸을 수 없습니다.",
    },
    "ខ្ញុំបានធ្លាក់ពីជណ្តើរខណៈពេលធ្វើការ ហើយបានរងរបួសកជើង ខ្ញុំត្រូវការជំនួយ": {
        "ko": "작업 중 사다리에서 떨어져 발목을 다쳤습니다. 도움이 필요합니다.",
    },
    "សារធាតុគីមីបានបាញ់ចូលភ្នែករបស់ខ្ញុំ ខ្ញុំត្រូវការការព្យាបាលដំបូងភ្លាមៗ": {
        "ko": "화학물질이 눈에 튀었습니다. 즉시 응급처치가 필요합니다.",
    },
    "វត្ថុធ្ងន់ធ្លាក់លើជើងខ្ញុំ ឈឺខ្លាំង ហើយដើរមិនបាន": {
        "ko": "무거운 자재가 발등에 떨어졌습니다. 매우 아프고 걸을 수 없습니다.",
    },
}


def _mock_translate(text: str, target_lang: str) -> str:
    """
    Mock 번역: 사전에 있는 모든 구절을 순차적으로 치환한다.
    한 문장에 여러 구절이 있어도 전부 번역되도록 다중 치환 방식 사용.
    외국어 → 한국어 역방향도 사전에 등록되어 있으면 처리한다.
    """
    # 정확 매칭 우선 (외국어→한국어 역방향 포함)
    if text in MOCK_DICT and target_lang in MOCK_DICT[text]:
        return MOCK_DICT[text][target_lang]

    # 한국어가 타깃이고 사전 미등록이면 원문 반환 (이미 한국어이거나 번역 불가)
    if target_lang == "ko":
        return text

    # 문장 내 모든 사전 구절을 치환 (긴 키부터 먼저 — 짧은 키가 긴 키를 덮어쓰는 걸 방지)
    result = text
    matched = False
    for key in sorted(MOCK_DICT, key=len, reverse=True):
        if key in result and target_lang in MOCK_DICT[key]:
            result = result.replace(key, MOCK_DICT[key][target_lang])
            matched = True
    if matched:
        return result

    # 사전 미등록 텍스트는 언어 접두사와 함께 원문 반환
    lang_label = {"en": "EN", "vi": "VI", "th": "TH", "km": "KM"}.get(target_lang, target_lang.upper())
    return f"[{lang_label}] {text}"


async def _google_translate(text: str, target_lang: str, source_lang: str) -> str:
    """Google Cloud Translation API v2 호출."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            GOOGLE_TRANSLATE_ENDPOINT,
            params={"key": GOOGLE_API_KEY},
            json={"q": text, "target": target_lang, "source": source_lang, "format": "text"},
        )
        resp.raise_for_status()
        return resp.json()["data"]["translations"][0]["translatedText"]


async def _libre_translate(text: str, target_lang: str, source_lang: str) -> str:
    """LibreTranslate 공개 API 폴백 호출."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{LIBRETRANSLATE_URL}/translate",
            json={"q": text, "source": source_lang, "target": target_lang, "format": "text"},
            headers={"Content-Type": "application/json"},
        )
        resp.raise_for_status()
        data = resp.json()
        if "translatedText" not in data:
            raise ValueError(f"LibreTranslate 응답 이상: {data}")
        return data["translatedText"]


async def translate(text: str, target_lang: str, source_lang: str = "ko") -> str:
    """
    텍스트를 target_lang으로 번역한다.

    USE_MOCK_AI=true  → Mock 사전 사용 (API 키 불필요)
    USE_MOCK_AI=false → Google Translate 시도 → 실패 시 LibreTranslate 폴백
    """
    if not text or target_lang == source_lang:
        return text

    if USE_MOCK:
        return _mock_translate(text, target_lang)

    if GOOGLE_API_KEY:
        try:
            return await _google_translate(text, target_lang, source_lang)
        except Exception as e:
            print(f"[번역] Google 실패 ({e}), LibreTranslate 폴백 시도")

    try:
        return await _libre_translate(text, target_lang, source_lang)
    except Exception as e:
        print(f"[번역] LibreTranslate 실패 ({e}), Mock으로 대체")
        return _mock_translate(text, target_lang)


# ── 위험 이벤트 → 알림 메시지 변환 ────────────────────────────────────
# 이벤트 타입별 한국어 메시지 템플릿 (번역의 소스 텍스트)
HAZARD_MESSAGE_KO: dict[str, str] = {
    "helmet_missing":  "⛑️ [{zone}] 안전모 미착용 감지. 즉시 안전모를 착용하세요.",
    "vest_missing":    "🦺 [{zone}] 안전조끼 미착용 감지. 즉시 안전조끼를 착용하세요.",
    "restricted_zone": "🚧 [{zone}] 위험구역 무단 출입 감지. 즉시 해당 구역을 벗어나세요.",
    "fire_smoke":      "🔥 [{zone}] 화재 또는 연기 감지. 즉시 대피하세요.",
}


async def build_hazard_alert(event_type: str, zone: str, target_lang: str) -> str:
    """위험 이벤트 타입과 구역을 받아 target_lang 알림 문자열을 반환한다."""
    template = HAZARD_MESSAGE_KO.get(event_type, "{zone}에서 위험 상황이 감지되었습니다.")
    ko_message = template.format(zone=zone)
    return await translate(ko_message, target_lang)
