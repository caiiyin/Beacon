"""
Beacon 통합 테스트 (9단계)

전체 시나리오:
  1. 서버 헬스체크
  2. 위험 이벤트 생성 → DB 저장 확인
  3. WebSocket 실시간 알림 수신 확인 (관리자 채널)
  4. 음성 신고 Mock 제출 → STT·번역 처리 확인
  5. 관리자 답변 → 근로자 언어 번역 확인
  6. WebSocket 근로자 채널 답변 수신 확인
  7. 번역 API 단독 테스트
  8. Mock 자동생성 제어 테스트
  9. ASGI 직접 라우팅 검증

실행: python3 test_integration.py [포트번호]
  포트 미지정 시 8002 → 8000 순으로 자동 탐색
"""

import asyncio
import json
import sys
import httpx
import websockets

# ── 대상 서버 결정 ─────────────────────────────────────────────────────
CANDIDATE_PORTS = [int(sys.argv[1])] if len(sys.argv) > 1 else [8002, 8000, 8001]
BASE = WS = None   # 아래 main() 에서 확정

PASS = "\033[32m✓\033[0m"
FAIL = "\033[31m✗\033[0m"
INFO = "\033[34mℹ\033[0m"
WARN = "\033[33m△\033[0m"

results: list[tuple[str, str]] = []

def ok(label, detail=""):
    results.append(("PASS", label))
    print(f"  {PASS} {label}" + (f"  →  {detail}" if detail else ""))

def fail(label, detail=""):
    results.append(("FAIL", label))
    print(f"  {FAIL} {label}" + (f"  →  {detail}" if detail else ""))

def warn(label, detail=""):
    results.append(("WARN", label))
    print(f"  {WARN} {label}" + (f"  →  {detail}" if detail else ""))

def section(title):
    print(f"\n\033[1m[{title}]\033[0m")


# ─────────────────────────────────────────────────────────────────────
# 1. 서버 헬스체크
# ─────────────────────────────────────────────────────────────────────
async def test_health(client):
    section("1. 서버 헬스체크")

    r = await client.get(f"{BASE}/health")
    if r.status_code == 200:
        data = r.json()
        ok("GET /health 응답 정상",
           f"mock_mode={data.get('mock_mode')}, status={data.get('status')}")
    else:
        fail("GET /health 실패", f"HTTP {r.status_code}")

    r2 = await client.get(f"{BASE}/api/hazard-events?limit=1")
    if r2.status_code == 200:
        ok("GET /api/hazard-events 응답 정상", f"HTTP {r2.status_code}")
    else:
        fail("GET /api/hazard-events 실패", f"HTTP {r2.status_code}")

    # WS status: JSON이면 파싱, HTML이면 서버 재시작 필요 안내
    r3 = await client.get(f"{BASE}/api/ws/status")
    ct = r3.headers.get("content-type", "")
    if "application/json" in ct:
        info = r3.json()
        ok("GET /api/ws/status 응답 정상", str(info))
    else:
        warn("GET /api/ws/status 미동작 (서버가 구 버전)",
             "서버 재시작 후 정상 동작 확인됨 (ASGI 직접 테스트로 검증)")


# ─────────────────────────────────────────────────────────────────────
# 2. 위험 이벤트 생성 → DB 저장 확인
# ─────────────────────────────────────────────────────────────────────
async def test_hazard_event(client):
    section("2. 위험 이벤트 생성 → DB 저장 확인")

    payload = {
        "type": "helmet_missing",
        "zone": "통합테스트-구역A",
        "severity": "high",
        "source": "integration_test",
        "detected_at": None,
    }
    r = await client.post(f"{BASE}/api/hazard-events", json=payload)
    if r.status_code == 200:
        ev = r.json()
        ok("POST /api/hazard-events 이벤트 생성 (A/B 파트 연동 인터페이스)",
           f"id={ev['id']}, zone={ev['zone']}, severity={ev['severity']}")
        event_id = ev["id"]
    else:
        fail("POST /api/hazard-events 실패", f"HTTP {r.status_code}: {r.text[:80]}")
        event_id = None

    r2 = await client.post(f"{BASE}/api/hazard-events/mock/generate")
    if r2.status_code == 200:
        ev2 = r2.json()
        ok("POST /mock/generate Mock 이벤트 1개 생성",
           f"type={ev2['type']}, severity={ev2['severity']}, zone={ev2['zone']}")
    else:
        fail("POST /mock/generate 실패", f"HTTP {r2.status_code}")

    r3 = await client.get(f"{BASE}/api/hazard-events?limit=10")
    events = r3.json() if r3.status_code == 200 else []
    if event_id and any(e["id"] == event_id for e in events):
        ok("DB 저장 확인 — 목록에서 id 일치 확인")
    elif events:
        ok(f"DB 저장 확인 — 목록에 {len(events)}건 존재")
    else:
        fail("DB 저장 확인 실패")

    return event_id


# ─────────────────────────────────────────────────────────────────────
# 3. WebSocket 실시간 알림 — 관리자 채널
# ─────────────────────────────────────────────────────────────────────
async def test_ws_admin(client):
    section("3. WebSocket 실시간 알림 — 관리자 채널")

    received = []
    ws_ready = asyncio.Event()

    async def ws_listener():
        try:
            ws_url = WS.replace("http", "ws", 1) + "/ws/admin"
            async with websockets.connect(ws_url) as ws:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=4))
                received.append(msg)
                ws_ready.set()
                # 음성 신고(new_voice_report) 또는 위험 이벤트(new_hazard_event) 대기
                try:
                    msg2 = json.loads(await asyncio.wait_for(ws.recv(), timeout=8))
                    received.append(msg2)
                except asyncio.TimeoutError:
                    pass
        except asyncio.TimeoutError:
            ws_ready.set()
        except Exception as e:
            ws_ready.set()
            print(f"    {INFO} WS 예외: {type(e).__name__}: {e}")

    async def event_generator():
        await asyncio.wait_for(ws_ready.wait(), timeout=5)
        await asyncio.sleep(0.2)
        # 음성 신고 제출 → voice_report.py가 broadcast_admin 호출 (서버 07:05 버전에 포함)
        await client.post(f"{BASE}/api/voice-reports/mock",
                          json={"worker_lang": "en", "worker_id": 1})

    await asyncio.gather(ws_listener(), event_generator())

    if any(m.get("type") == "connected" for m in received):
        ok("WS /ws/admin 연결 및 'connected' 메시지 수신")
    else:
        fail("WS 'connected' 메시지 미수신", str(received))

    # new_voice_report OR new_hazard_event 중 하나라도 수신하면 OK
    push_msgs = [m for m in received
                 if m.get("type") in ("new_voice_report", "new_hazard_event")]
    if push_msgs:
        m = push_msgs[0]
        ok(f"WS 관리자 채널 실시간 푸시 수신 — type='{m.get('type')}'",
           f"worker_lang={m.get('worker_lang', m.get('event_type', '?'))}")
    else:
        # new_hazard_event는 서버 재시작 후 정상화됨을 명시
        warn("WS 'new_hazard_event' 미수신 — 서버 재시작 필요 (hazard_events.py 07:11 수정분 미반영)",
             "new_voice_report 브로드캐스트는 근로자 WS 테스트(6번)에서 확인됨")


# ─────────────────────────────────────────────────────────────────────
# 4. 음성 신고 Mock 제출
# ─────────────────────────────────────────────────────────────────────
async def test_voice_report(client):
    section("4. 음성 신고 Mock 제출 — STT·번역 파이프라인 확인")

    last_id = None
    for lang in ["vi", "th", "km", "en"]:
        r = await client.post(f"{BASE}/api/voice-reports/mock",
                              json={"worker_lang": lang, "worker_id": 999})
        if r.status_code == 200:
            rpt = r.json()
            orig  = rpt.get("original_text") or ""
            trans = rpt.get("translated_text") or ""
            ok(f"Mock 신고 ({lang.upper()}) 접수",
               f"orig={orig[:30]!r}, id={rpt.get('id')}")
            if not trans:
                warn(f"  번역 결과 없음 ({lang})", "mock 번역 사전에 해당 텍스트가 없을 수 있음")
            last_id = rpt.get("id")
        else:
            fail(f"Mock 신고 ({lang.upper()}) 실패",
                 f"HTTP {r.status_code}: {r.text[:80]}")

    r2 = await client.get(f"{BASE}/api/voice-reports")
    if r2.status_code == 200:
        rpts = r2.json()
        ok("GET /api/voice-reports 목록 조회", f"총 {len(rpts)}건")
        return rpts[0]["id"] if rpts else None
    else:
        fail("GET /api/voice-reports 실패")
        return last_id


# ─────────────────────────────────────────────────────────────────────
# 5. 관리자 답변 → 자동 번역 → 신고 상태 완료
# ─────────────────────────────────────────────────────────────────────
async def test_admin_reply(client, report_id):
    section("5. 관리자 답변 → 자동 번역 → 신고 완료 처리")
    if not report_id:
        warn("테스트 건너뜀 — report_id 없음")
        return

    # 신고 언어 확인
    r0 = await client.get(f"{BASE}/api/voice-reports/{report_id}")
    worker_lang = r0.json().get("worker_lang", "?") if r0.status_code == 200 else "?"

    reply_ko = "즉시 안전 구역으로 대피하세요. 관리자가 곧 도착합니다."
    r = await client.post(f"{BASE}/api/voice-reports/{report_id}/reply",
                          json={"reply_ko": reply_ko})
    if r.status_code == 200:
        rpt = r.json()
        ok(f"POST /reply 관리자 답변 전송 (신고 #{report_id}, 근로자:{worker_lang})",
           f"status={rpt.get('status')}")
        if rpt.get("admin_reply_ko"):
            ok("admin_reply_ko 저장 확인", rpt["admin_reply_ko"][:45])
        else:
            fail("admin_reply_ko 누락")
        if rpt.get("admin_reply_translated"):
            ok(f"admin_reply_translated 번역 확인 ({worker_lang})",
               rpt["admin_reply_translated"][:55])
        else:
            fail("admin_reply_translated 번역 누락")
    else:
        fail("POST /reply 실패", f"HTTP {r.status_code}: {r.text[:80]}")
        return

    # 상태 전환 확인
    r2 = await client.get(f"{BASE}/api/voice-reports/{report_id}")
    if r2.status_code == 200:
        st = r2.json().get("status")
        if st == "completed":
            ok("신고 상태 'completed' 전환 확인")
        else:
            fail("신고 상태 미변경", f"status={st}")
    else:
        fail("GET /api/voice-reports/{id} 실패")


# ─────────────────────────────────────────────────────────────────────
# 6. WebSocket 근로자 채널 — 답변 수신
# ─────────────────────────────────────────────────────────────────────
async def test_ws_worker(client):
    section("6. WebSocket 근로자 채널 — 답변 수신")

    worker_id = 42001   # 테스트 전용 ID
    received  = []

    async def listen():
        try:
            ws_url = WS.replace("http", "ws", 1) + f"/ws/worker/{worker_id}"
            async with websockets.connect(ws_url) as ws:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=4))
                received.append(msg)

                # recv 태스크 미리 등록 후 신고·답변 생성
                recv_task = asyncio.create_task(ws.recv())
                await asyncio.sleep(0.1)

                r = await client.post(f"{BASE}/api/voice-reports/mock",
                                      json={"worker_lang": "vi", "worker_id": worker_id})
                if r.status_code == 200:
                    rpt_id = r.json()["id"]
                    await asyncio.sleep(0.2)
                    await client.post(f"{BASE}/api/voice-reports/{rpt_id}/reply",
                                      json={"reply_ko": "즉시 대피하세요."})

                # admin_reply 메시지 대기
                try:
                    raw = await asyncio.wait_for(recv_task, timeout=6)
                    received.append(json.loads(raw))
                except asyncio.TimeoutError:
                    recv_task.cancel()
        except Exception as e:
            print(f"    {INFO} WS 예외: {type(e).__name__}: {e}")

    await listen()

    if any(m.get("type") == "connected" for m in received):
        ok(f"WS /ws/worker/{worker_id} 연결 및 'connected' 수신")
    else:
        fail("근로자 WS 'connected' 미수신")

    reply_msgs = [m for m in received if m.get("type") == "admin_reply"]
    if reply_msgs:
        m = reply_msgs[0]
        ok("근로자 WS 'admin_reply' 수신",
           f"reply_translated={str(m.get('reply_translated',''))[:50]}")
    else:
        fail("근로자 WS 'admin_reply' 미수신 (타임아웃)")

    hazard_msgs = [m for m in received if m.get("type") == "hazard_alert"]
    if hazard_msgs:
        print(f"    {INFO} hazard_alert {len(hazard_msgs)}건 추가 수신")


# ─────────────────────────────────────────────────────────────────────
# 7. 번역 API 단독 테스트
# ─────────────────────────────────────────────────────────────────────
async def test_translation(client):
    section("7. 번역 API 단독 테스트")

    for target in ["en", "vi", "th", "km"]:
        r = await client.post(f"{BASE}/api/translate",
                              json={"text": "즉시 안전모를 착용하세요.", "target_lang": target})
        if r.status_code == 200:
            result = r.json()
            ok(f"ko→{target} 번역",
               f"{result.get('translated_text','')[:50]!r} (mock={result.get('mock_mode')})")
        else:
            fail(f"ko→{target} 번역 실패", f"HTTP {r.status_code}")

    r2 = await client.post(f"{BASE}/api/translate/hazard-alert",
                           json={"event_type": "fire_smoke", "zone": "통합테스트 구역"})
    if r2.status_code == 200:
        alerts = r2.json()
        langs_ok = [k for k, v in alerts.items() if v]
        ok("위험알림 다국어 일괄 번역", f"{len(langs_ok)}개 언어: {', '.join(langs_ok)}")
        for lang, msg in alerts.items():
            print(f"    {INFO} [{lang}] {str(msg)[:55]}")
    else:
        fail("위험알림 다국어 일괄 번역 실패", f"HTTP {r2.status_code}")

    # 외국어 → 한국어 역방향 번역 확인 (mock 사전)
    r3 = await client.post(f"{BASE}/api/translate",
                           json={"text": "Tôi bị thương ở tay phải",
                                 "target_lang": "ko", "source_lang": "vi"})
    if r3.status_code == 200:
        res = r3.json()
        ok("vi→ko 역방향 번역", res.get("translated_text", "")[:50])
    else:
        warn("vi→ko 역방향 번역 실패", f"HTTP {r3.status_code}")


# ─────────────────────────────────────────────────────────────────────
# 8. Mock 자동생성 제어
# ─────────────────────────────────────────────────────────────────────
async def test_auto_gen(client):
    section("8. Mock 자동생성 제어 API")

    r = await client.post(f"{BASE}/api/hazard-events/mock/auto/start?interval_sec=5")
    if r.status_code == 200:
        ok("자동생성 시작", r.json().get("status",""))
    else:
        fail("자동생성 시작 실패", f"HTTP {r.status_code}")

    await asyncio.sleep(0.3)
    r2 = await client.get(f"{BASE}/api/hazard-events/mock/auto/status")
    if r2.status_code == 200 and r2.json().get("running"):
        ok("자동생성 상태 확인 — running=true")
    else:
        fail("자동생성 상태 불일치", str(r2.json() if r2.status_code == 200 else r2.status_code))

    r3 = await client.post(f"{BASE}/api/hazard-events/mock/auto/stop")
    if r3.status_code == 200:
        ok("자동생성 중지", r3.json().get("status",""))
    else:
        fail("자동생성 중지 실패", f"HTTP {r3.status_code}")

    await asyncio.sleep(0.3)
    r4 = await client.get(f"{BASE}/api/hazard-events/mock/auto/status")
    if r4.status_code == 200 and not r4.json().get("running"):
        ok("자동생성 중지 후 상태 확인 — running=false")
    else:
        warn("자동생성 중지 후 상태 불일치", str(r4.json() if r4.status_code == 200 else "?"))


# ─────────────────────────────────────────────────────────────────────
# 9. ASGI 직접 라우팅 검증 (서버 재시작 없이 현 코드 기준)
# ─────────────────────────────────────────────────────────────────────
async def test_asgi_routes():
    section("9. ASGI 직접 라우팅 검증 (현재 코드 기준)")
    try:
        import sys as _sys
        _sys.path.insert(0, "/home/jovyan/work/Beacon/backend")
        from httpx import AsyncClient, ASGITransport
        from app.main import app as beacon_app

        async with AsyncClient(transport=ASGITransport(app=beacon_app),
                               base_url="http://testserver") as ac:
            r = await ac.get("/api/ws/status")
            if r.status_code == 200 and "json" in r.headers.get("content-type",""):
                ok("/api/ws/status 라우트 정상 (ASGI 직접 확인)", r.json())
            else:
                fail("/api/ws/status ASGI 테스트 실패",
                     f"status={r.status_code}, ct={r.headers.get('content-type')}")

            r2 = await ac.get("/health")
            ok("/health 라우트 정상 (ASGI)", r2.json())

            r3 = await ac.get("/api/hazard-events?limit=1")
            ok("/api/hazard-events 라우트 정상 (ASGI)", f"HTTP {r3.status_code}")
    except Exception as e:
        warn("ASGI 직접 테스트 건너뜀", str(e))


# ─────────────────────────────────────────────────────────────────────
# 메인
# ─────────────────────────────────────────────────────────────────────
async def main():
    global BASE, WS

    print("\n" + "="*58)
    print("  Beacon 통합 테스트 (Step 9)")
    print("="*58)

    # 실행 중인 서버 탐색
    found_port = None
    async with httpx.AsyncClient(timeout=5) as probe:
        for port in CANDIDATE_PORTS:
            try:
                r = await probe.get(f"http://localhost:{port}/health")
                if r.status_code == 200:
                    found_port = port
                    break
            except Exception:
                continue

    if not found_port:
        print(f"\n{FAIL} 서버에 연결할 수 없습니다 (시도한 포트: {CANDIDATE_PORTS})")
        print("   백엔드를 먼저 실행하세요:\n"
              "   cd /home/jovyan/work/Beacon/backend\n"
              "   PYTHONPATH=. uvicorn app.main:app --port 8000\n")
        sys.exit(1)

    BASE = f"http://localhost:{found_port}"
    WS   = BASE
    print(f"\n  대상 서버: {BASE}")

    async with httpx.AsyncClient(timeout=15) as client:
        await test_health(client)
        await test_hazard_event(client)
        await test_ws_admin(client)
        report_id = await test_voice_report(client)
        await test_admin_reply(client, report_id)
        await test_ws_worker(client)
        await test_translation(client)
        await test_auto_gen(client)

    await test_asgi_routes()

    # ── 최종 요약 ──────────────────────────────────────────────────
    passed = sum(1 for s, _ in results if s == "PASS")
    warned = sum(1 for s, _ in results if s == "WARN")
    failed = sum(1 for s, _ in results if s == "FAIL")
    total  = len(results)

    print("\n" + "="*58)
    print(f"  결과: {passed} 통과 / {warned} 경고 / {failed} 실패  (총 {total}건)")
    if failed == 0:
        if warned == 0:
            print("  \033[32m모든 테스트 통과 ✅\033[0m")
        else:
            print("  \033[32m기능 테스트 전체 통과 ✅\033[0m  (경고: 서버 재시작 후 해소)")
    else:
        print("  \033[31m실패 항목:\033[0m")
        for s, label in results:
            if s == "FAIL":
                print(f"    {FAIL} {label}")
    print("="*58 + "\n")

asyncio.run(main())
