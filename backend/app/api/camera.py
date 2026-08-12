"""
PPE 탐지 WebSocket 엔드포인트.
CameraModal → /ws/camera → YOLO 추론 → JSON 응답
"""
import base64
import json
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ultralytics import YOLO

router = APIRouter(tags=["Camera"])

MODEL_PATH = str(Path(__file__).parent.parent.parent / "best.pt")
CONF_THRESHOLD = 0.25

CLASS_NAMES = {
    0: "Hardhat", 1: "Mask",    2: "NO-Hardhat",    3: "NO-Mask",
    4: "NO-Safety Vest", 5: "Person", 6: "Safety Cone",
    7: "Safety Vest", 8: "machinery", 9: "vehicle",
}
CLASS_COLORS = {
    0: "#00C851", 1: "#00C851", 2: "#FF4444", 3: "#FF4444",
    4: "#FF4444", 5: "#AAAAAA", 6: "#FFD700",
    7: "#00C851", 8: "#888888", 9: "#888888",
}

_model: YOLO | None = None

def get_model() -> YOLO:
    global _model
    if _model is None:
        _model = YOLO(MODEL_PATH)
        _model(np.zeros((480, 640, 3), dtype=np.uint8), verbose=False)  # 워밍업
    return _model

def decode_image(data: str) -> np.ndarray:
    if "," in data:
        data = data.split(",", 1)[1]
    arr = np.frombuffer(base64.b64decode(data), dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("이미지 디코딩 실패")
    return img

def run_detection(img: np.ndarray) -> dict:
    results = get_model()(img, conf=CONF_THRESHOLD, verbose=False)[0]
    detections, summary = [], {}
    for box in results.boxes:
        cid  = int(box.cls[0])
        conf = float(box.conf[0])
        x1, y1, x2, y2 = (float(v) for v in box.xyxy[0])
        name  = CLASS_NAMES.get(cid, f"class_{cid}")
        color = CLASS_COLORS.get(cid, "#00BFFF")
        detections.append({
            "class_id": cid, "class_name": name,
            "confidence": round(conf, 4),
            "bbox": [round(x1), round(y1), round(x2), round(y2)],
            "color": color,
        })
        summary[name] = summary.get(name, 0) + 1
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "detections": detections,
        "summary": summary,
    }

@router.websocket("/ws/camera")
async def camera_ws(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                img    = decode_image(raw)
                result = run_detection(img)
                await websocket.send_text(json.dumps(result, ensure_ascii=False))
            except Exception as e:
                await websocket.send_text(json.dumps({
                    "error": str(e), "detections": [], "summary": {},
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }))
    except WebSocketDisconnect:
        pass
