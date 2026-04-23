"""
Google Sheets 연동 모듈
발행 플랫폼에 관계없이 동일한 구글 시트에 세금계산서 데이터를 기록합니다.
'발행출처' 열로 플랫폼 구분.
"""

import logging
from datetime import datetime
from typing import Dict, List, Optional

from config import SHEETS_CONFIG

logger = logging.getLogger(__name__)


def get_sheet_client():
    """gspread 클라이언트 초기화"""
    try:
        import gspread
        from google.oauth2.service_account import Credentials

        scopes = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive",
        ]
        creds = Credentials.from_service_account_file(
            SHEETS_CONFIG["credentials_file"],
            scopes=scopes,
        )
        client = gspread.authorize(creds)
        return client
    except ImportError:
        logger.error("gspread 미설치: pip install gspread google-auth")
        return None
    except FileNotFoundError:
        logger.error(f"서비스 계정 파일 없음: {SHEETS_CONFIG['credentials_file']}")
        return None
    except Exception as e:
        logger.error(f"Google Sheets 클라이언트 초기화 실패: {e}")
        return None


def get_or_create_sheet(client):
    """스프레드시트 및 시트 가져오기 (없으면 헤더 행 자동 생성)"""
    try:
        spreadsheet = client.open_by_key(SHEETS_CONFIG["spreadsheet_id"])
    except Exception as e:
        logger.error(f"스프레드시트 열기 실패 (ID: {SHEETS_CONFIG['spreadsheet_id']}): {e}")
        return None

    sheet_name = SHEETS_CONFIG["sheet_name"]
    try:
        sheet = spreadsheet.worksheet(sheet_name)
    except Exception:
        # 시트가 없으면 생성
        sheet = spreadsheet.add_worksheet(title=sheet_name, rows=1000, cols=20)
        logger.info(f"새 시트 생성: {sheet_name}")

    # 헤더 행 확인/생성
    try:
        first_row = sheet.row_values(1)
        if not first_row:
            sheet.insert_row(SHEETS_CONFIG["headers"], index=1)
            logger.info("헤더 행 생성 완료")
    except Exception as e:
        logger.warning(f"헤더 확인 실패: {e}")

    return sheet


def record_to_row(result: Dict) -> List:
    """
    처리 결과 딕셔너리 → 구글 시트 행 데이터 변환
    순서: SHEETS_CONFIG["headers"] 와 동일
    """
    record = result.get("invoice_record", {})
    supplier = record.get("supplier", {})

    def fmt_amount(val):
        if val is None:
            return ""
        try:
            return f"{int(val):,}"
        except Exception:
            return str(val)

    row = [
        datetime.now().strftime("%Y-%m-%d %H:%M:%S"),          # 처리일시
        result.get("platform", "기타"),                          # 발행출처
        record.get("issue_date") or "",                          # 발행일자
        record.get("invoice_number") or "",                      # 승인번호
        supplier.get("name") or "",                              # 공급자
        supplier.get("business_number") or "",                   # 공급자_사업자번호
        fmt_amount(record.get("supply_amount")),                 # 공급가액
        fmt_amount(record.get("tax_amount")),                    # 세액
        fmt_amount(record.get("total_amount")),                  # 합계금액
        record.get("note") or "",                                # 비고
        result.get("email_subject") or "",                       # 이메일_제목
        result.get("url") or "",                                 # 원본_URL
        "; ".join(result.get("screenshots", [])[:2]),            # 스크린샷_경로
        result.get("json_path") or "",                           # JSON_경로
    ]
    return row


class SheetsWriter:
    """구글 시트 기록 담당 클래스"""

    def __init__(self):
        self.client = None
        self.sheet = None
        self._connected = False

    def connect(self) -> bool:
        if not SHEETS_CONFIG.get("enabled"):
            logger.info("Google Sheets 비활성화됨 (config.py SHEETS_CONFIG['enabled'] = False)")
            return False
        if not SHEETS_CONFIG.get("spreadsheet_id"):
            logger.warning("스프레드시트 ID 미설정. config.py의 SHEETS_CONFIG['spreadsheet_id']에 입력하세요.")
            return False

        self.client = get_sheet_client()
        if not self.client:
            return False

        self.sheet = get_or_create_sheet(self.client)
        if not self.sheet:
            return False

        self._connected = True
        logger.info("✅ Google Sheets 연결 성공")
        return True

    def append_result(self, result: Dict) -> bool:
        """단일 처리 결과를 시트에 추가"""
        if not self._connected:
            return False
        if not result.get("success"):
            logger.info(f"실패 결과 - 시트 기록 건너뜀: {result.get('url','')[:50]}")
            return False
        try:
            row = record_to_row(result)
            self.sheet.append_row(row, value_input_option="USER_ENTERED")
            platform = result.get("platform", "기타")
            inv_no = result.get("invoice_record", {}).get("invoice_number", "?")
            logger.info(f"📊 시트 기록: [{platform}] 승인번호={inv_no}")
            return True
        except Exception as e:
            logger.error(f"시트 기록 실패: {e}")
            return False

    def append_results(self, results: List[Dict]) -> int:
        """여러 결과 일괄 기록. 성공 건수 반환."""
        if not self._connected:
            return 0
        count = 0
        for r in results:
            if self.append_result(r):
                count += 1
        logger.info(f"📊 Google Sheets 총 {count}건 기록 완료")
        return count

    def get_sheet_url(self) -> str:
        """시트 URL 반환"""
        sid = SHEETS_CONFIG.get("spreadsheet_id", "")
        return f"https://docs.google.com/spreadsheets/d/{sid}/edit" if sid else ""
