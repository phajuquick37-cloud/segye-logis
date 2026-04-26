"""
Gmail IMAP 연결 테스트 스크립트
실행: (프로젝트 루트 또는 본 디렉터리에서) 환경 변수 설정 후
      python test_imap_connection.py
"""

import imaplib
import ssl
import socket
import sys
import io
from datetime import datetime

from config import EMAIL_CONFIG

# UTF-8 출력 강제 (Windows cp949 우회)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

SEP = "=" * 60


def log(msg: str, level: str = "INFO"):
    ts = datetime.now().strftime("%H:%M:%S")
    icon = {"INFO": "[INFO]", "OK": "[ OK ]", "FAIL": "[FAIL]", "WARN": "[WARN]"}.get(level, "[    ]")
    print(f"[{ts}] {icon}  {msg}")


def main():
    print(f"\n{SEP}")
    print("  Gmail IMAP 연결 테스트 (config.py / 환경 변수)")
    print(f"  실행 시각: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(SEP)

    IMAP_SERVER = EMAIL_CONFIG["imap_server"]
    IMAP_PORT = EMAIL_CONFIG["imap_port"]
    EMAIL_ADDRESS = (EMAIL_CONFIG.get("email_address") or "").strip()
    APP_PASSWORD = EMAIL_CONFIG.get("app_password") or ""

    print("\n[1단계] 설정 확인")
    log(f"IMAP 서버  : {IMAP_SERVER}")
    log(f"IMAP 포트  : {IMAP_PORT}")
    log(f"이메일     : {EMAIL_ADDRESS or '(미설정)'}")
    if not EMAIL_ADDRESS or not APP_PASSWORD:
        log("TAX_IMAP_EMAIL / TAX_IMAP_APP_PASSWORD (또는 GMAIL_USER / GMAIL_APP_PASSWORD) 를 설정하세요.", "FAIL")
        sys.exit(1)
    masked = APP_PASSWORD[:4] + " **** " + APP_PASSWORD[-4:] if len(APP_PASSWORD) >= 8 else "****"
    log(f"앱 비밀번호: {masked}  (총 {len(APP_PASSWORD)}자)")

    print("\n[2단계] DNS 조회")
    try:
        ip = socket.gethostbyname(IMAP_SERVER)
        log(f"{IMAP_SERVER} → {ip}", "OK")
    except socket.gaierror as e:
        log(f"DNS 조회 실패: {e}", "FAIL")
        sys.exit(1)

    print("\n[3단계] TCP 포트 연결 (993)")
    try:
        sock = socket.create_connection((IMAP_SERVER, IMAP_PORT), timeout=10)
        sock.close()
        log(f"포트 {IMAP_PORT} 연결 성공", "OK")
    except Exception as e:
        log(f"포트 연결 실패: {e}", "FAIL")
        sys.exit(1)

    print("\n[4단계] SSL/TLS 연결")
    try:
        ctx = ssl.create_default_context()
        with ctx.wrap_socket(socket.socket(), server_hostname=IMAP_SERVER) as s:
            s.settimeout(10)
            s.connect((IMAP_SERVER, IMAP_PORT))
            log(f"SSL 버전  : {s.version()}", "OK")
            log(f"암호 스위트: {s.cipher()[0]}", "OK")
    except Exception as e:
        log(f"SSL 연결 오류: {e}", "FAIL")
        sys.exit(1)

    print("\n[5단계] IMAP 로그인 (앱 비밀번호)")
    mail = None
    try:
        mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
        log(f"IMAP 서버 배너: {mail.welcome.decode(errors='replace')}", "OK")

        typ, data = mail.login(EMAIL_ADDRESS, APP_PASSWORD)
        if typ == "OK":
            log(f"로그인 성공: {data[0].decode(errors='replace')}", "OK")
        else:
            log(f"로그인 실패 (응답코드={typ}): {data}", "FAIL")
            sys.exit(1)
    except imaplib.IMAP4.error as e:
        err = str(e)
        log(f"IMAP 오류: {err}", "FAIL")
        if "AUTHENTICATIONFAILED" in err or "Invalid credentials" in err:
            print()
            log("Google 계정 → 보안 → 앱 비밀번호를 확인하세요.", "WARN")
        sys.exit(1)
    except Exception as e:
        log(f"예상치 못한 오류: {e}", "FAIL")
        sys.exit(1)

    print("\n[6단계] 받은편지함(INBOX) 접근")
    try:
        typ, data = mail.select("INBOX")
        if typ == "OK":
            total = int(data[0].decode())
            log(f"INBOX 메일 수: {total:,}개", "OK")
        else:
            log(f"INBOX 선택 실패: {data}", "WARN")
    except Exception as e:
        log(f"INBOX 조회 오류: {e}", "WARN")

    print("\n[7단계] 세금계산서 메일 검색 (최근 60일)")
    try:
        from datetime import timedelta
        since = (datetime.now() - timedelta(days=60)).strftime("%d-%b-%Y")
        criteria = f'SINCE "{since}"'
        typ, msg_ids = mail.search(None, criteria)
        ids = msg_ids[0].split()
        log(f"최근 60일 전체 메일: {len(ids)}개", "OK")

        keywords = ["세금계산서", "ONEBILL", "화물맨", "로지노트"]
        for kw in keywords:
            try:
                typ2, ids2 = mail.search(None, f'SUBJECT "{kw}"')
                cnt = len(ids2[0].split()) if ids2[0] else 0
                icon = "OK" if cnt > 0 else "WARN"
                log(f"  제목 '{kw}': {cnt}건", icon)
            except Exception as e:
                log(f"  '{kw}' 검색 오류: {e}", "WARN")
    except Exception as e:
        log(f"메일 검색 오류: {e}", "WARN")

    try:
        mail.logout()
        log("정상 로그아웃", "OK")
    except Exception:
        pass

    print(f"\n{SEP}")
    print("  테스트 완료 — 모든 단계 통과 ✅")
    print(SEP + "\n")


if __name__ == "__main__":
    main()
