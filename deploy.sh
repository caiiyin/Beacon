#!/bin/bash
# Beacon 데모 배포 스크립트
# 팀 계정 서버에서 git pull 후 이 파일 하나만 실행하면 됩니다.
# 사용법: bash deploy.sh

set -e
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== [1/3] React 프론트엔드 빌드 ==="
cd "$ROOT_DIR/frontend"
npm install --silent
npm run build
echo "✅ 빌드 완료 → frontend/dist/"

echo ""
echo "=== [2/3] 백엔드 의존성 확인 ==="
cd "$ROOT_DIR/backend"
pip install -r requirements.txt -q --user

echo ""
echo "=== [3/3] FastAPI 서버 시작 (포트 8000) ==="
echo "🔗 로컬 접속: http://localhost:8000"
echo "🔗 API 문서:  http://localhost:8000/docs"
echo "📡 cloudflared 터널: cloudflared tunnel --url http://localhost:8000"
echo ""
PYTHONPATH="$ROOT_DIR/backend" uvicorn app.main:app --host 0.0.0.0 --port 8000
