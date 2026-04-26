#!/bin/bash
# =============================================================================
# 세금계산서 봇 긴급 패치 스크립트
# VM 서버에서 실행: bash deploy_patch.sh
# =============================================================================

set -e
BOTDIR="/home/phajuquick37/segye-logis/tax-invoice-automation"

echo "============================================================"
echo " 세금계산서 봇 긴급 패치 시작"
echo " 대상 디렉터리: $BOTDIR"
echo "============================================================"

# ── 디렉터리 존재 확인 ───────────────────────────────────────
if [ ! -d "$BOTDIR" ]; then
  echo "[FAIL] 디렉터리 없음: $BOTDIR"
  exit 1
fi
cd "$BOTDIR"
echo "[ OK ] 디렉터리 이동 완료"

# ── google_credentials.json 존재 확인 ───────────────────────
echo ""
echo "[1단계] google_credentials.json 존재 확인"
if [ -f "$BOTDIR/google_credentials.json" ]; then
  echo "[ OK ] google_credentials.json 존재 확인 ($(stat -c%s google_credentials.json) bytes)"
else
  echo "[FAIL] google_credentials.json 파일이 없습니다!"
  echo "       Firebase Console → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성 후"
  echo "       $BOTDIR/google_credentials.json 으로 저장하세요."
  exit 1
fi

# ── config.py 패치 ───────────────────────────────────────────
echo ""
echo "[2단계] config.py 패치 (절대경로 + 90일 재수집)"

# 이미 패치됐는지 확인
if grep -q "_BASE_DIR" config.py; then
  echo "[ OK ] config.py 이미 패치됨 — 건너뜀"
else
  # 백업
  cp config.py config.py.bak
  echo "[ OK ] 백업 생성: config.py.bak"

  python3 - <<'PYEOF'
import re

with open("config.py", "r", encoding="utf-8") as f:
    src = f.read()

# 절대경로 헤더 삽입
header = '''import os as _os

# config.py가 위치한 디렉터리 -> Windows/Linux 양쪽에서 절대 경로 보장
_BASE_DIR = _os.path.dirname(_os.path.abspath(__file__))
_CREDENTIALS_FILE = _os.path.join(_BASE_DIR, "google_credentials.json")

'''
src = src.replace(
    "# --- 이메일 설정 (Gmail IMAP) ---",
    header + "# --- 이메일 설정 (Gmail IMAP) ---",
    1
)

# credentials_file 절대경로로 교체
src = src.replace(
    '"credentials_file": "google_credentials.json"',
    '"credentials_file": _CREDENTIALS_FILE'
)

# days_limit 60 → 90
src = src.replace('"days_limit": 60,', '"days_limit": 90,')
src = src.replace('"days_limit": 60\n', '"days_limit": 90\n')

with open("config.py", "w", encoding="utf-8") as f:
    f.write(src)
print("config.py 패치 완료")
PYEOF

  echo "[ OK ] config.py 패치 완료"
fi

# ── browser_automation.py 패치 ───────────────────────────────
echo ""
echo "[3단계] browser_automation.py 패치 (타임아웃 15s→60s)"

if grep -q "_WAIT_MS = 60000" browser_automation.py; then
  echo "[ OK ] browser_automation.py 이미 패치됨 — 건너뜀"
else
  cp browser_automation.py browser_automation.py.bak
  echo "[ OK ] 백업 생성: browser_automation.py.bak"

  python3 - <<'PYEOF'
with open("browser_automation.py", "r", encoding="utf-8") as f:
    src = f.read()

old = '''    for selector in CONFIRM_BUTTON_SELECTORS:
        try:
            el = await page.wait_for_selector(selector, timeout=3000, state="visible")
            if el:
                await el.scroll_into_view_if_needed()
                await el.click()
                logger.info(f"확인 버튼 클릭: {selector}")
                await page.wait_for_load_state("networkidle", timeout=15000)
                return True
        except Exception:
            continue

    # Enter 키 fallback
    try:
        await page.keyboard.press("Enter")
        await page.wait_for_load_state("networkidle", timeout=10000)
        logger.info("Enter 키로 제출")
        return True
    except Exception as e:
        logger.error(f"확인 버튼 클릭 실패: {e}")
        return False'''

new = '''    # 버튼 클릭 후 networkidle 대기 60초, 초과 시 domcontentloaded로 폴백
    _WAIT_MS = 60000

    for selector in CONFIRM_BUTTON_SELECTORS:
        try:
            el = await page.wait_for_selector(selector, timeout=3000, state="visible")
            if el:
                await el.scroll_into_view_if_needed()
                await el.click()
                logger.info(f"확인 버튼 클릭: {selector}")
                try:
                    await page.wait_for_load_state("networkidle", timeout=_WAIT_MS)
                except Exception:
                    logger.warning("networkidle 초과 — domcontentloaded로 폴백")
                    try:
                        await page.wait_for_load_state("domcontentloaded", timeout=_WAIT_MS)
                    except Exception:
                        pass
                return True
        except Exception:
            continue

    # Enter 키 fallback
    try:
        await page.keyboard.press("Enter")
        try:
            await page.wait_for_load_state("networkidle", timeout=_WAIT_MS)
        except Exception:
            logger.warning("Enter 후 networkidle 초과 — domcontentloaded로 폴백")
            try:
                await page.wait_for_load_state("domcontentloaded", timeout=_WAIT_MS)
            except Exception:
                pass
        logger.info("Enter 키로 제출")
        return True
    except Exception as e:
        logger.error(f"확인 버튼 클릭 실패: {e}")
        return False'''

if old in src:
    src = src.replace(old, new, 1)
    with open("browser_automation.py", "w", encoding="utf-8") as f:
        f.write(src)
    print("browser_automation.py 패치 완료")
else:
    print("[WARN] 패치 대상 코드 블록을 찾지 못했습니다 — 수동 확인 필요")
PYEOF

  echo "[ OK ] browser_automation.py 패치 완료"
fi

# ── 서비스 재시작 ─────────────────────────────────────────────
echo ""
echo "[4단계] taxbot 서비스 재시작"
sudo systemctl restart taxbot
sleep 3
STATUS=$(sudo systemctl is-active taxbot)
if [ "$STATUS" = "active" ]; then
  echo "[ OK ] taxbot 서비스 실행 중 (active)"
else
  echo "[FAIL] taxbot 서비스 상태: $STATUS"
  sudo systemctl status taxbot --no-pager -l
  exit 1
fi

# ── 실시간 로그 감시 (30초) ──────────────────────────────────
echo ""
echo "[5단계] 로그 감시 (30초 — 'Firestore 저장 성공' 또는 오류 출력)"
echo "------------------------------------------------------------"
timeout 30 sudo journalctl -u taxbot -f --no-pager 2>/dev/null || true
echo "------------------------------------------------------------"
echo ""
echo "============================================================"
echo " 패치 완료. 계속 실시간 로그를 보려면:"
echo "   sudo journalctl -u taxbot -f"
echo "============================================================"
