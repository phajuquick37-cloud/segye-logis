"""
프로젝트 루트에서 세금계산서 자동화를 실행할 때 사용하는 위임 스크립트.

  python main.py --pipeline

위 명령은 ``tax-invoice-automation/main.py`` 로 인자를 그대로 넘깁니다.
(IMAP 한메일 수집 → 브라우저·사업자번호·캡처 → Firestore tax_invoices)
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parent
    script = root / "tax-invoice-automation" / "main.py"
    if not script.is_file():
        print(
            f"오류: {script} 가 없습니다. tax-invoice-automation 폴더를 확인하세요.",
            file=sys.stderr,
        )
        sys.exit(2)
    cmd = [sys.executable, str(script), *sys.argv[1:]]
    raise SystemExit(subprocess.call(cmd))


if __name__ == "__main__":
    main()
