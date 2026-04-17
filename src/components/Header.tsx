import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Phone, Menu, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";

const NAV_LINKS = [
  { label: "온라인 주문", href: "https://15887185.co.kr", external: true },
  { label: "차량종류 확인", to: "/vehicles" },
  { label: "화물계산기", to: "/cargo", highlight: true },
  { label: "공지사항", to: "/notice" },
  { label: "계약거래문의", to: "/contract" },
  { label: "API연동", to: "/api-integration" },
];

export default function Header() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (to?: string) => to && location.pathname === to;

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="container mx-auto flex h-20 items-center justify-between px-4 md:px-6">
          {/* 로고 */}
          <Link to="/" className="flex items-center gap-3" aria-label="세계로지스 홈으로 이동">
            <img
              src="/sglogo.png"
              alt="세계로지스 로고"
              className="h-12 w-auto object-contain"
              width="96"
              height="48"
            />
            <span className="text-xl font-bold tracking-tight text-blue-900">세계로지스</span>
          </Link>

          {/* 데스크톱 네비게이션 */}
          <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-gray-600" aria-label="주요 메뉴">
            {NAV_LINKS.map((item) =>
              item.external ? (
                <a
                  key={item.label}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-blue-600"
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.label}
                  to={item.to!}
                  className={`transition-colors hover:text-blue-600 ${
                    item.highlight ? "font-semibold text-blue-600" : ""
                  } ${isActive(item.to) ? "text-blue-700 font-bold" : ""}`}
                >
                  {item.label}
                </Link>
              )
            )}
          </nav>

          {/* 오른쪽: 전화 + 버튼 + 햄버거 */}
          <div className="flex items-center gap-3">
            <a
              href="tel:1588-7185"
              className="hidden lg:flex flex-col items-end hover:opacity-80 transition-opacity"
              aria-label="무료 전화상담 1588-7185"
            >
              <span className="text-[10px] font-semibold text-red-500 uppercase tracking-wider">무료 전화상담</span>
              <span className="text-xl font-bold text-blue-900">1588-7185</span>
            </a>
            <a href="tel:1588-7185" aria-label="전화 접수">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5">
                <Phone className="mr-1.5 h-4 w-4" />
                전화접수
              </Button>
            </a>
            {/* 햄버거 버튼 (모바일) */}
            <button
              className="md:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X className="w-6 h-6 text-slate-700" /> : <Menu className="w-6 h-6 text-slate-700" />}
            </button>
          </div>
        </div>
      </header>

      {/* 모바일 드로어 메뉴 */}
      <AnimatePresence>
        {menuOpen && (
          <>
            {/* 오버레이 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/40 md:hidden"
              onClick={() => setMenuOpen(false)}
              aria-hidden="true"
            />
            {/* 메뉴 패널 */}
            <motion.nav
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed top-0 right-0 z-50 h-full w-72 bg-white shadow-2xl flex flex-col md:hidden"
              aria-label="모바일 메뉴"
            >
              {/* 패널 헤더 */}
              <div className="flex items-center justify-between px-5 py-5 border-b">
                <span className="font-black text-blue-900 text-lg">세계로지스</span>
                <button
                  onClick={() => setMenuOpen(false)}
                  className="p-2 rounded-lg hover:bg-slate-100"
                  aria-label="메뉴 닫기"
                >
                  <X className="w-5 h-5 text-slate-600" />
                </button>
              </div>

              {/* 메뉴 링크 */}
              <div className="flex-1 overflow-y-auto py-4 px-4 space-y-1">
                {NAV_LINKS.map((item) =>
                  item.external ? (
                    <a
                      key={item.label}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center h-12 px-4 rounded-xl text-slate-700 font-medium hover:bg-blue-50 hover:text-blue-700 transition-colors"
                    >
                      {item.label}
                    </a>
                  ) : (
                    <Link
                      key={item.label}
                      to={item.to!}
                      onClick={() => setMenuOpen(false)}
                      className={`flex items-center h-12 px-4 rounded-xl font-medium transition-colors
                        ${isActive(item.to)
                          ? "bg-blue-600 text-white"
                          : item.highlight
                          ? "text-blue-600 font-semibold hover:bg-blue-50"
                          : "text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                        }`}
                    >
                      {item.label}
                    </Link>
                  )
                )}
              </div>

              {/* 전화 CTA */}
              <div className="px-4 pb-6 pt-4 border-t">
                <a
                  href="tel:1588-7185"
                  className="flex items-center justify-center gap-2 w-full h-13 py-3.5 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-700 transition-colors"
                  onClick={() => setMenuOpen(false)}
                >
                  <Phone className="w-5 h-5" />
                  1588-7185 전화상담
                </a>
                <p className="text-center text-xs text-slate-400 mt-2">평일·주말 24시간 운영</p>
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
