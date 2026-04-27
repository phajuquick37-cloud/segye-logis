"""
브라우저 자동화 모듈 v2
- 어느 플랫폼이든 공통 속성(input[type='text'] 등)으로 사업자번호 입력
- 세금계산서 테이블 영역 자동 감지 후 부분 캡처
- 팝업/보안 레이어 자동 처리
"""

import asyncio
import logging
import re
from pathlib import Path
from typing import Dict, List, Optional
from playwright.async_api import async_playwright, Page, Browser, BrowserContext, ElementHandle

from config import (
    BROWSER_CONFIG, BUSINESS_CONFIG,
    BIZ_NUMBER_INPUT_SELECTORS, CONFIRM_BUTTON_SELECTORS,
    is_blocked_tax_invoice_url, is_excluded_tax_platform,
)
from platform_detector import detect_platform, extract_platform_from_page

logger = logging.getLogger(__name__)


# ─── 사업자번호 입력 ──────────────────────────────────────────────────────────

async def find_biz_number_input(page: Page) -> Optional[ElementHandle]:
    """
    공통 속성 기반으로 사업자번호 입력창 탐색
    input[type='text'], input[type='number'], input[type='tel'],
    placeholder 키워드, name/id 키워드 순서로 시도
    """
    for selector in BIZ_NUMBER_INPUT_SELECTORS:
        try:
            elements = await page.query_selector_all(selector)
            for el in elements:
                if await el.is_visible():
                    return el
        except Exception:
            continue

    # 최후 수단: 보이는 모든 input
    try:
        inputs = await page.query_selector_all("input:visible")
        for inp in inputs:
            t = (await inp.get_attribute("type") or "text").lower()
            if t in ("text", "number", "tel", "password"):
                return inp
    except Exception:
        pass

    return None


async def input_business_number(page: Page) -> bool:
    """사업자번호 자동 입력. 성공 시 True 반환."""
    biz_no = BUSINESS_CONFIG["business_number"]        # 10자리 숫자
    biz_no_fmt = BUSINESS_CONFIG["business_number_formatted"]  # 141-81-42581

    el = await find_biz_number_input(page)
    if not el:
        logger.warning("사업자번호 입력창을 찾지 못했습니다.")
        return False

    try:
        await el.scroll_into_view_if_needed()
        await el.click()
        await el.fill("")
        await asyncio.sleep(0.2)

        # placeholder로 하이픈 포함 여부 결정
        placeholder = (await el.get_attribute("placeholder") or "").lower()
        max_len_attr = await el.get_attribute("maxlength")
        max_len = int(max_len_attr) if max_len_attr and max_len_attr.isdigit() else 12

        use_formatted = "-" in placeholder or max_len >= 12
        value_to_type = biz_no_fmt if use_formatted else biz_no

        await el.type(value_to_type, delay=60)
        logger.info(f"사업자번호 입력 완료: {value_to_type}")
        return True
    except Exception as e:
        logger.error(f"사업자번호 입력 실패: {e}")
        return False


# ─── 확인 버튼 클릭 ───────────────────────────────────────────────────────────

async def click_confirm_button(page: Page) -> bool:
    """공통 선택자로 확인/조회 버튼 클릭"""
    # 버튼 클릭 후 networkidle 대기 60초, 초과 시 domcontentloaded로 폴백
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
        return False


# ─── 사업자번호 입력 화면 감지 ────────────────────────────────────────────────

async def needs_biz_number(page: Page) -> bool:
    """현재 페이지에 사업자번호 입력이 필요한지 판별"""
    try:
        text = await page.inner_text("body")
        keywords = ["사업자", "등록번호", "인증", "확인", "조회", "번호를 입력", "business"]
        if any(kw in text for kw in keywords):
            el = await find_biz_number_input(page)
            return el is not None
    except Exception:
        pass
    return False


# ─── 세금계산서 테이블 감지 + 캡처 ───────────────────────────────────────────

async def find_invoice_tables(page: Page) -> List[ElementHandle]:
    """
    페이지에서 세금계산서 테이블 영역 감지.
    '공급가액', '세액', '합계' 등의 텍스트가 포함된 <table> 반환
    """
    tax_keywords = ["공급가액", "세액", "합계", "공급자", "작성일", "승인번호",
                    "품목", "공급받는자", "invoice"]
    found_tables = []

    try:
        tables = await page.query_selector_all("table")
        for table in tables:
            text = await table.inner_text()
            score = sum(1 for kw in tax_keywords if kw in text)
            if score >= 2:
                found_tables.append((score, table))

        found_tables.sort(key=lambda x: -x[0])
        return [t for _, t in found_tables]
    except Exception as e:
        logger.warning(f"테이블 감지 오류: {e}")
        return []


async def capture_invoice_area(page: Page, output_dir: Path) -> List[str]:
    """세금계산서 테이블 영역 캡처 (부분 스크린샷)"""
    screenshots = []
    tables = await find_invoice_tables(page)

    if not tables:
        logger.info("세금계산서 테이블 없음 → 전체 페이지 캡처")
        path = output_dir / "invoice_fullpage.png"
        await page.screenshot(path=str(path), full_page=True)
        screenshots.append(str(path))
        return screenshots

    for idx, table in enumerate(tables[:3], 1):
        try:
            await table.scroll_into_view_if_needed()
            await asyncio.sleep(0.3)
            path = output_dir / f"invoice_table_{idx}.png"
            await table.screenshot(path=str(path))
            screenshots.append(str(path))
            logger.info(f"테이블 캡처 완료: {path}")
        except Exception as e:
            logger.warning(f"테이블 캡처 실패 (#{idx}): {e}")

    # 전체 페이지 캡처도 추가
    full_path = output_dir / "invoice_fullpage.png"
    await page.screenshot(path=str(full_path), full_page=True)
    screenshots.append(str(full_path))

    return screenshots


# ─── 팝업 / 레이어 처리 ───────────────────────────────────────────────────────

async def handle_popups(page: Page):
    """alert, confirm, 레이어 팝업 자동 처리"""
    page.on("dialog", lambda d: asyncio.create_task(d.accept()))

    # 닫기 버튼 레이어
    close_selectors = [
        ".popup-close", ".modal-close", ".btn-close",
        "button:has-text('닫기')", "button:has-text('확인')",
        "[class*='close']", "[id*='close']",
    ]
    for sel in close_selectors:
        try:
            el = page.locator(sel).first
            if await el.is_visible():
                await el.click()
                await asyncio.sleep(0.5)
        except Exception:
            pass


# ─── DOM 텍스트 추출 ──────────────────────────────────────────────────────────

async def extract_dom_data(page: Page) -> Dict:
    """DOM에서 구조화된 데이터 추출"""
    data = {"full_text": "", "tables": [], "page_url": "", "page_title": ""}

    try:
        data["full_text"] = await page.inner_text("body")
        data["page_url"] = page.url
        data["page_title"] = await page.title()
    except Exception:
        pass

    try:
        tables = await page.query_selector_all("table")
        for table in tables:
            rows_data = []
            rows = await table.query_selector_all("tr")
            for row in rows:
                cells = await row.query_selector_all("td, th")
                row_texts = [(await c.inner_text()).strip() for c in cells]
                row_texts = [t for t in row_texts if t]
                if row_texts:
                    rows_data.append(row_texts)
            if rows_data:
                data["tables"].append(rows_data)
    except Exception as e:
        logger.warning(f"테이블 DOM 추출 오류: {e}")

    return data


# ─── 메인 브라우저 클래스 ─────────────────────────────────────────────────────

class TaxInvoiceBrowser:

    def __init__(self):
        self.playwright = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None

    async def start(self):
        self.playwright = await async_playwright().start()
        btype = getattr(self.playwright, BROWSER_CONFIG["browser"])
        self.browser = await btype.launch(
            headless=BROWSER_CONFIG["headless"],
            slow_mo=BROWSER_CONFIG.get("slow_mo", 0),
        )
        self.context = await self.browser.new_context(
            viewport=BROWSER_CONFIG["viewport"],
            locale="ko-KR",
            timezone_id="Asia/Seoul",
        )
        logger.info(f"🌐 브라우저 시작 ({BROWSER_CONFIG['browser']})")

    async def stop(self):
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

    async def process_link(
        self,
        link_info: Dict,
        output_dir: Path,
        email_info: Dict,
    ) -> Dict:
        """
        단일 링크 처리:
        1. URL 열기
        2. 팝업 처리
        3. 사업자번호 입력 (필요시)
        4. 확인 버튼 클릭
        5. 테이블 영역 캡처
        6. DOM 데이터 추출
        """
        url = link_info["url"]
        result = {
            "url": url,
            "link_text": link_info.get("text", ""),
            "success": False,
            "screenshots": [],
            "dom_data": {},
            "platform": "기타",
            "error": None,
        }

        if is_blocked_tax_invoice_url(url):
            result["error"] = "blocked_url"
            logger.info(f"🚫 링크 스킵 (차단 URL): {url[:80]}")
            return result

        # 플랫폼 사전 감지
        result["platform"] = detect_platform(
            email_subject=email_info.get("subject", ""),
            email_from=email_info.get("from", ""),
            url=url,
        )
        if is_excluded_tax_platform(result["platform"]):
            result["error"] = "excluded_platform"
            logger.info(f"🚫 링크 스킵 (제외 플랫폼): {result['platform']}")
            return result

        output_dir.mkdir(parents=True, exist_ok=True)
        page = await self.context.new_page()

        try:
            # 1. 페이지 열기 — networkidle 우선, 타임아웃 시 domcontentloaded 폴백
            logger.info(f"🔗 링크 열기: {url[:80]}")
            try:
                await page.goto(
                    url,
                    timeout=BROWSER_CONFIG["timeout"],
                    wait_until="networkidle",
                )
            except Exception as nav_err:
                logger.warning(f"⚠️ networkidle 대기 초과, domcontentloaded 폴백: {nav_err}")
                try:
                    await page.goto(
                        url,
                        timeout=BROWSER_CONFIG["timeout"],
                        wait_until="domcontentloaded",
                    )
                except Exception as nav_err2:
                    logger.warning(f"⚠️ domcontentloaded도 초과 — 현재 상태로 계속 진행: {nav_err2}")
                    # 페이지가 부분 로드된 경우에도 계속 처리
            await asyncio.sleep(2)

            # 2. 팝업 처리
            await handle_popups(page)

            # 3. 초기 스크린샷
            init_ss = output_dir / "step1_initial.png"
            await page.screenshot(path=str(init_ss), full_page=False)
            result["screenshots"].append(str(init_ss))

            # 4. 사업자번호 입력 (필요시)
            if await needs_biz_number(page):
                logger.info("🔐 사업자번호 입력 화면 감지")
                await input_business_number(page)
                await asyncio.sleep(0.5)

                input_ss = output_dir / "step2_after_input.png"
                await page.screenshot(path=str(input_ss), full_page=False)
                result["screenshots"].append(str(input_ss))

                # 5. 확인 버튼
                await click_confirm_button(page)
                await asyncio.sleep(2)

                confirm_ss = output_dir / "step3_after_confirm.png"
                await page.screenshot(path=str(confirm_ss), full_page=False)
                result["screenshots"].append(str(confirm_ss))

            # 재차 팝업 처리
            await handle_popups(page)
            await asyncio.sleep(1)

            # 6. 페이지 내 플랫폼 재감지
            try:
                page_text_preview = (await page.inner_text("body"))[:300]
                page_platform = extract_platform_from_page(await page.title(), page_text_preview)
                if page_platform:
                    result["platform"] = page_platform
            except Exception:
                pass

            # 7. 테이블 감지 + 캡처
            table_screenshots = await capture_invoice_area(page, output_dir)
            result["screenshots"].extend(table_screenshots)

            # 8. DOM 데이터 추출
            result["dom_data"] = await extract_dom_data(page)
            try:
                page_url = page.url or ""
            except Exception:
                page_url = ""
            if is_blocked_tax_invoice_url(page_url):
                result["error"] = "blocked_url_after_redirect"
                result["success"] = False
                logger.info(f"🚫 리다이렉트 후 차단 URL — 스킵: {page_url[:80]}")
            elif is_excluded_tax_platform(result["platform"]):
                result["error"] = "excluded_platform"
                result["success"] = False
                logger.info(f"🚫 제외 플랫폼(페이지 반영 후) — 스킵: {result['platform']}")
            else:
                result["success"] = True
            if result["success"]:
                logger.info(f"✅ 처리 완료 | 플랫폼: {result['platform']} | 스크린샷: {len(result['screenshots'])}개")

        except Exception as e:
            result["error"] = str(e)
            logger.error(f"❌ 링크 처리 실패: {url[:60]} | {e}")
            try:
                err_ss = output_dir / "error.png"
                await page.screenshot(path=str(err_ss))
                result["screenshots"].append(str(err_ss))
            except Exception:
                pass

        finally:
            await page.close()

        return result

    async def process_image_email(self, email_info: Dict, output_dir: Path) -> List[Dict]:
        """
        이미지형 메일 처리 — 링크 없이 첨부/인라인 이미지만 있는 세금계산서 메일.
        이미지를 디스크에 저장하고 OCR 대상 스크린샷으로 등록한다.
        """
        images = email_info.get("images", [])
        if not images:
            logger.info("이미지형 메일이지만 추출된 이미지 없음 — 건너뜀")
            return []

        det_pf = detect_platform(
            email_subject=email_info.get("subject", ""),
            email_from=email_info.get("from", ""),
            url="",
        )
        if is_excluded_tax_platform(det_pf) or (
            det_pf and "qoo10" in det_pf.lower()
        ):
            logger.info(f"🚫 이미지형 메일 스킵 (제외 플랫폼): {det_pf}")
            return []

        output_dir.mkdir(parents=True, exist_ok=True)
        plat_label = det_pf if det_pf and det_pf != "기타" else "이미지형 세금계산서"
        result: Dict = {
            "url": "",
            "link_text": "이미지형 세금계산서",
            "success": True,
            "screenshots": [],
            "dom_data": {
                "full_text": "",
                "tables": [],
                "page_url": "",
                "page_title": "이미지형 세금계산서",
            },
            "platform": plat_label,
            "error": None,
            "email_type": "image",
            "email_subject": email_info.get("subject"),
            "email_from": email_info.get("from"),
            "email_date": email_info.get("date"),
        }

        for idx, img_data in enumerate(images, 1):
            try:
                ext = img_data.get("ext", "png")
                path = output_dir / f"invoice_image_{idx}.{ext}"
                path.write_bytes(img_data["data"])
                result["screenshots"].append(str(path))
                logger.info(f"📷 이미지 저장 완료: {path}")
            except Exception as e:
                logger.warning(f"이미지 저장 실패 (#{idx}): {e}")

        logger.info(
            f"✅ 이미지형 메일 처리 완료 | 이미지 {len(result['screenshots'])}개 저장"
        )
        return [result]

    async def process_email(self, email_info: Dict, base_output_dir: Path) -> List[Dict]:
        """이메일의 모든 링크(또는 이미지) 순서대로 처리"""
        results = []
        links = email_info.get("links", [])

        # ── 이미지형 메일: 링크 없이 첨부 이미지만 있는 경우 ──
        if not links:
            if email_info.get("images"):
                logger.info(f"📷 이미지형 메일 감지: [{email_info.get('subject', '')}]")
                return await self.process_image_email(email_info, base_output_dir)
            logger.warning(f"링크도 이미지도 없는 메일 건너뜀: [{email_info.get('subject', '')}]")
            return []

        # ── 링크형 메일: 각 링크별 브라우저 처리 ──
        for idx, link_info in enumerate(links, 1):
            safe_subject = re.sub(r'[\\/:*?"<>|]', '_', email_info.get("subject", "unknown"))[:40]
            link_dir = base_output_dir / f"{safe_subject}_link{idx}"

            logger.info(f"\n링크 처리 ({idx}/{len(links)}): [{link_info.get('text','')}] {link_info['url'][:60]}")
            res = await self.process_link(link_info, link_dir, email_info)
            res["email_subject"] = email_info.get("subject")
            res["email_from"] = email_info.get("from")
            res["email_date"] = email_info.get("date")
            results.append(res)

        return results

    async def __aenter__(self):
        await self.start()
        return self

    async def __aexit__(self, *_):
        await self.stop()
