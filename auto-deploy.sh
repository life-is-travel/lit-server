#!/bin/bash

# 수뜨립 자동 배포 스크립트

cd ~/suittrip-server

# 현재 커밋 해시
LOCAL=$(git rev-parse HEAD)

# 원격 최신 커밋 해시
git fetch origin main
REMOTE=$(git rev-parse origin/main)

# 변경사항 비교
if [ "$LOCAL" != "$REMOTE" ]; then
    echo "$(date): 변경사항 감지! 배포 시작..."

    # 로컬 변경사항 무시하고 강제 pull
    git reset --hard origin/main

    # 서버 재시작
    docker-compose down
    docker-compose up -d --build

    echo "$(date): 배포 완료!"
else
    echo "$(date): 변경사항 없음"
fi