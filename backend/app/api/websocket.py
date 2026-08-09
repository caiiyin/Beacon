"""
WebSocket 실시간 통신.
ConnectionManager: 관리자/근로자 연결 풀 관리
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["WebSocket"])


class ConnectionManager:
    def __init__(self):
        self.admin_connections: list[WebSocket] = []
        self.worker_connections: dict[int, list[WebSocket]] = {}

    async def connect_admin(self, ws: WebSocket):
        await ws.accept()
        self.admin_connections.append(ws)

    def disconnect_admin(self, ws: WebSocket):
        if ws in self.admin_connections:
            self.admin_connections.remove(ws)

    async def connect_worker(self, ws: WebSocket, worker_id: int):
        await ws.accept()
        self.worker_connections.setdefault(worker_id, []).append(ws)

    def disconnect_worker(self, ws: WebSocket, worker_id: int):
        conns = self.worker_connections.get(worker_id, [])
        if ws in conns:
            conns.remove(ws)

    async def broadcast_admin(self, message: dict):
        """연결된 모든 관리자에게 전송."""
        dead = []
        for ws in self.admin_connections:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.admin_connections.remove(ws)

    async def send_to_worker(self, worker_id: int, message: dict):
        """특정 근로자에게 전송."""
        conns = self.worker_connections.get(worker_id, [])
        dead = []
        for ws in conns:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            conns.remove(ws)

    async def broadcast_all_workers(self, message: dict):
        """연결된 모든 근로자에게 전송 (위험 이벤트 알림 등)."""
        for worker_id, conns in list(self.worker_connections.items()):
            dead = []
            for ws in conns:
                try:
                    await ws.send_json(message)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                conns.remove(ws)

    def status(self) -> dict:
        """현재 연결 상태 반환 (디버그용)."""
        return {
            "admin_count":  len(self.admin_connections),
            "worker_count": sum(len(c) for c in self.worker_connections.values()),
            "worker_ids":   list(self.worker_connections.keys()),
        }


# 앱 전체 단일 인스턴스
manager = ConnectionManager()


# ── WebSocket 라우트 ───────────────────────────────────────────────────

@router.websocket("/ws/admin")
async def ws_admin(ws: WebSocket):
    """관리자 대시보드 실시간 채널."""
    await manager.connect_admin(ws)
    try:
        await ws.send_json({"type": "connected", "role": "admin", **manager.status()})
        while True:
            await ws.receive_text()   # 클라이언트 ping 수신으로 연결 유지
    except WebSocketDisconnect:
        manager.disconnect_admin(ws)


@router.websocket("/ws/worker/{worker_id}")
async def ws_worker(ws: WebSocket, worker_id: int):
    """근로자 전용 실시간 알림 채널."""
    await manager.connect_worker(ws, worker_id)
    try:
        await ws.send_json({"type": "connected", "role": "worker", "worker_id": worker_id})
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_worker(ws, worker_id)


@router.get("/api/ws/status", tags=["WebSocket"], summary="WebSocket 연결 현황")
async def ws_status():
    return manager.status()
