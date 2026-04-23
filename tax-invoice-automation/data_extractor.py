"""
데이터 추출 모듈 v2
1. DOM 텍스트 우선 파싱
2. OCR(pytesseract) 로 스크린샷에서 텍스트 보완
3. 발행처/금액/비고 구조화
4. JSON 저장
"""

import json
import re
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from config import STORAGE_CONFIG, BUSINESS_CONFIG, OCR_CONFIG

logger = logging.getLogger(__name__)


# ─── OCR ──────────────────────────────────────────────────────────────────────

def ocr_image(image_path: str) -> str:
    """이미지에서 텍스트 추출 (pytesseract)"""
    if not OCR_CONFIG.get("enabled"):
        return ""
    try:
        import pytesseract
        from PIL import Image
        pytesseract.pytesseract.tesseract_cmd = OCR_CONFIG["tesseract_path"]
        img = Image.open(image_path)
        text = pytesseract.image_to_string(img, lang=OCR_CONFIG["languages"])
        return text
    except ImportError:
        logger.warning("pytesseract 미설치. OCR 건너뜀 (pip install pytesseract pillow)")
        return ""
    except Exception as e:
        logger.warning(f"OCR 실패 ({image_path}): {e}")
        return ""


def ocr_screenshots(screenshots: List[str]) -> str:
    """스크린샷 목록에서 OCR 텍스트 통합"""
    if not OCR_CONFIG.get("enabled"):
        return ""
    texts = []
    for path in screenshots:
        if "table" in path or "final" in path or "fullpage" in path:
            text = ocr_image(path)
            if text.strip():
                texts.append(f"[{Path(path).name}]\n{text}")
    return "\n\n".join(texts)


# ─── 숫자/날짜 정제 ───────────────────────────────────────────────────────────

def clean_amount(text) -> Optional[int]:
    if not text:
        return None
    cleaned = re.sub(r"[^\d]", "", str(text))
    return int(cleaned) if cleaned else None


def clean_date(text: str) -> Optional[str]:
    if not text:
        return None
    m = re.search(r"(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})", str(text))
    if m:
        y, mo, d = m.groups()
        return f"{y}-{int(mo):02d}-{int(d):02d}"
    m2 = re.search(r"(\d{4})(\d{2})(\d{2})", str(text))
    if m2:
        y, mo, d = m2.groups()
        return f"{y}-{mo}-{d}"
    return str(text).strip()


def clean_biz_no(text: str) -> Optional[str]:
    if not text:
        return None
    digits = re.sub(r"\D", "", str(text))
    if len(digits) == 10:
        return f"{digits[:3]}-{digits[3:5]}-{digits[5:]}"
    return str(text).strip()


# ─── 텍스트 파싱 ──────────────────────────────────────────────────────────────

FIELD_PATTERNS = {
    "invoice_number": [
        r"(?:승인번호|문서번호|세금계산서번호|Invoice\s*No)[^\d]*(\d[\d\-]{6,})",
    ],
    "issue_date": [
        r"작성일자[\s:：]*(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})",
        r"발행일[\s:：]*(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})",
        r"거래일[\s:：]*(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})",
    ],
    "supply_amount": [
        r"공급가액[\s:：₩]*([\d,]+)",
        r"공급금액[\s:：₩]*([\d,]+)",
    ],
    "tax_amount": [
        r"세액[\s:：₩]*([\d,]+)",
    ],
    "total_amount": [
        r"합계금액[\s:：₩]*([\d,]+)",
        r"합\s*계[\s:：₩]*([\d,]+)",
        r"Total[\s:：₩]*([\d,]+)",
    ],
    "supplier_name": [
        r"공급자\s*(?:상호)?[\s:：]*([가-힣a-zA-Z\(\)（）\s]{2,20}?)(?:\s|$)",
        r"상\s*호[\s:：]*([가-힣a-zA-Z\(\)（）\s]{2,20}?)(?:\n|\s{2})",
    ],
    "supplier_biz_no": [
        r"공급자.*?등록번호[\s:：]*(\d{3}[-\s]?\d{2}[-\s]?\d{5})",
        r"(?<!받는)사업자등록번호[\s:：]*(\d{3}[-\s]?\d{2}[-\s]?\d{5})",
    ],
    "buyer_name": [
        r"공급받는\s*자\s*(?:상호)?[\s:：]*([가-힣a-zA-Z\(\)（）\s]{2,20}?)(?:\s|$)",
    ],
    "note": [
        r"비고[\s:：]*(.*?)(?:\n|$)",
        r"remark[\s:：]*(.*?)(?:\n|$)",
    ],
}


def parse_text(text: str) -> Dict:
    """정규식으로 핵심 필드 추출"""
    result = {}
    for field, patterns in FIELD_PATTERNS.items():
        for pat in patterns:
            m = re.search(pat, text, re.IGNORECASE | re.MULTILINE)
            if m:
                result[field] = m.group(1).strip()
                break
    return result


def parse_tables(tables: List[List]) -> Dict:
    """
    DOM 테이블에서 키-값 쌍 추출
    예: [["공급가액", "1,000,000"], ["세액", "100,000"]] → dict
    """
    result = {}
    key_map = {
        "공급가액": "supply_amount",
        "공급금액": "supply_amount",
        "세액": "tax_amount",
        "합계금액": "total_amount",
        "합계": "total_amount",
        "작성일자": "issue_date",
        "발행일": "issue_date",
        "승인번호": "invoice_number",
        "문서번호": "invoice_number",
        "상호": "supplier_name",
        "공급자": "supplier_name",
        "비고": "note",
    }
    items = []

    for table in tables:
        for row in table:
            # 2열 구조 (키, 값)
            if len(row) == 2:
                k, v = row[0].strip(), row[1].strip()
                for kor_key, field in key_map.items():
                    if kor_key in k:
                        result[field] = v
                        break
            # 품목 행 감지
            elif len(row) >= 3:
                row_text = " ".join(row).lower()
                if any(kw in row_text for kw in ["품목", "품명", "수량", "단가"]):
                    continue  # 헤더 행
                if any(kw in row_text for kw in ["원", ","]):
                    items.append(row)

    if items:
        result["items"] = items
    return result


# ─── 통합 파싱 ────────────────────────────────────────────────────────────────

def build_invoice_record(dom_data: Dict, ocr_text: str, platform: str, email_info: Dict) -> Dict:
    """
    DOM + OCR 텍스트를 통합하여 최종 세금계산서 레코드 생성
    """
    combined_text = dom_data.get("full_text", "") + "\n" + ocr_text

    # 텍스트 파싱
    from_text = parse_text(combined_text)
    # DOM 테이블 파싱
    from_tables = parse_tables(dom_data.get("tables", []))

    # 병합 (테이블 값이 우선)
    merged = {**from_text, **{k: v for k, v in from_tables.items() if v}}

    record = {
        "platform": platform,
        "invoice_number": merged.get("invoice_number"),
        "issue_date": clean_date(merged.get("issue_date")),
        "supply_amount": clean_amount(merged.get("supply_amount")),
        "tax_amount": clean_amount(merged.get("tax_amount")),
        "total_amount": clean_amount(merged.get("total_amount")),
        "supplier": {
            "name": merged.get("supplier_name"),
            "business_number": clean_biz_no(merged.get("supplier_biz_no")),
        },
        "buyer": {
            "name": BUSINESS_CONFIG["company_name"],
            "business_number": BUSINESS_CONFIG["business_number_formatted"],
        },
        "note": merged.get("note"),
        "items": merged.get("items", []),
        "source_email": {
            "subject": email_info.get("subject"),
            "from": email_info.get("from"),
            "date": email_info.get("date"),
        },
        "page_url": dom_data.get("page_url"),
        "page_title": dom_data.get("page_title"),
    }
    return record


# ─── 저장 ─────────────────────────────────────────────────────────────────────

def get_output_dir(platform: str, date_str: str) -> Path:
    try:
        dt = datetime.fromisoformat(date_str)
    except Exception:
        dt = datetime.now()
    folder = STORAGE_CONFIG["folder_structure"].format(
        year=dt.strftime("%Y"),
        month=dt.strftime("%m"),
        platform=re.sub(r"[^\w가-힣]", "_", platform),
    )
    return Path(STORAGE_CONFIG["output_dir"]) / folder


def save_json(record: Dict, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    inv_no = re.sub(r"[^\w\-]", "", str(record.get("invoice_number") or "unknown"))[:20]
    filename = f"{ts}_{inv_no}.json"
    path = output_dir / filename

    def _serial(obj):
        if hasattr(obj, "isoformat"):
            return obj.isoformat()
        return str(obj)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(record, f, ensure_ascii=False, indent=2, default=_serial)
    logger.info(f"💾 JSON 저장: {path}")
    return path


def save_summary(results: List[Dict], output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    summary = {
        "generated_at": datetime.now().isoformat(),
        "total": len(results),
        "success": sum(1 for r in results if r.get("success")),
        "fail": sum(1 for r in results if not r.get("success")),
        "results": results,
    }
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = output_dir / f"summary_{ts}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    logger.info(f"📋 요약 저장: {path}")
    return path


# ─── 통합 처리 함수 ───────────────────────────────────────────────────────────

def process_and_save(email_info: Dict, browser_results: List[Dict]) -> List[Dict]:
    """브라우저 결과 → OCR 보완 → 파싱 → JSON 저장"""
    finals = []
    for br in browser_results:
        if not br.get("success"):
            finals.append(br)
            continue

        # OCR 보완
        ocr_text = ocr_screenshots(br.get("screenshots", []))

        # 통합 레코드 생성
        record = build_invoice_record(
            dom_data=br.get("dom_data", {}),
            ocr_text=ocr_text,
            platform=br.get("platform", "기타"),
            email_info=email_info,
        )

        # 저장
        out_dir = get_output_dir(br.get("platform", "기타"), email_info.get("date", ""))
        json_path = save_json(record, out_dir)

        finals.append({
            **br,
            "invoice_record": record,
            "json_path": str(json_path),
        })
    return finals
