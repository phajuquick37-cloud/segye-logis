import React, { useState } from "react";
import { motion } from "motion/react";
import { MessageCircle } from "lucide-react";

export default function FloatingButtons() {
  const [quickClicked, setQuickClicked] = useState(false);

  const handleQuickClick = () => {
    setQuickClicked(true);
    setTimeout(() => {
      window.open("https://15887185.co.kr", "_blank", "noopener,noreferrer");
      setTimeout(() => setQuickClicked(false), 400);
    }, 250);
  };

  return (
    <div className="fixed bottom-8 right-6 z-50 flex flex-col gap-3 items-end">

      {/* 퀵/접수 버튼 */}
      <motion.button
        onClick={handleQuickClick}
        initial={{ opacity: 0, y: 40, scale: 0.85 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, type: "spring", stiffness: 200, damping: 15 }}
        whileHover={{ y: -6, scale: 1.06 }}
        whileTap={{ y: -2, scale: 1.02 }}
        style={{
          background: quickClicked ? "#eff6ff" : "#ffffff",
          border: `2.5px solid ${quickClicked ? "#3b82f6" : "#1e3a5f"}`,
          borderRadius: "18px",
          boxShadow: quickClicked
            ? "0 0 0 4px rgba(59,130,246,0.25), 0 8px 24px rgba(59,130,246,0.3)"
            : "0 6px 24px rgba(30,58,95,0.22), 0 2px 8px rgba(0,0,0,0.10)",
          padding: "14px 10px 12px",
          width: "90px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "6px",
          cursor: "pointer",
          position: "relative",
          transition: "border-color 0.2s, box-shadow 0.2s, background 0.2s",
        }}
        className="group"
      >
        {/* 접수 뱃지 */}
        <span
          style={{
            position: "absolute",
            top: "-7px",
            right: "-7px",
            width: "22px",
            height: "22px",
            background: "#e8420a",
            borderRadius: "50%",
            border: "2.5px solid #fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "7px",
            fontWeight: 800,
            color: "#fff",
            letterSpacing: "-0.5px",
            animation: "sgPulse 1.8s ease-in-out infinite",
          }}
        >
          접수
        </span>

        <img
          src="/sglogo.png"
          alt="세계로지스"
          style={{ width: "68px", height: "auto", pointerEvents: "none" }}
        />
        <span
          style={{
            fontFamily: "'Malgun Gothic', '맑은 고딕', sans-serif",
            fontSize: "11.5px",
            fontWeight: 700,
            color: quickClicked ? "#3b82f6" : "#1e3a5f",
            letterSpacing: "-0.3px",
            textAlign: "center",
            lineHeight: 1.5,
            pointerEvents: "none",
            transition: "color 0.2s",
          }}
          className="group-hover:!text-[#e8420a]"
        >
          퀵/접수
        </span>

        <style>{`
          @keyframes sgPulse {
            0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(232,66,10,0.5); }
            50%       { transform: scale(1.15); box-shadow: 0 0 0 6px rgba(232,66,10,0); }
          }
          .group:hover .sg-border {
            border-color: #e8420a !important;
            box-shadow: 0 12px 36px rgba(232,66,10,0.28), 0 4px 12px rgba(0,0,0,0.10) !important;
          }
        `}</style>
      </motion.button>

      {/* 카카오 실시간상담 버튼 */}
      <motion.a
        href="http://pf.kakao.com/_bNaPxj/chat"
        target="_blank"
        rel="noopener noreferrer"
        initial={{ opacity: 0, y: 40, scale: 0.85 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, delay: 0.1, type: "spring", stiffness: 200, damping: 15 }}
        whileHover={{ y: -4, scale: 1.05 }}
        className="flex items-center gap-2 bg-[#FEE500] px-4 py-3 rounded-full shadow-lg transition-all"
      >
        <MessageCircle className="w-6 h-6 text-[#3A1D1D] fill-[#3A1D1D]" />
        <span className="text-sm font-bold text-[#3A1D1D]">실시간상담</span>
      </motion.a>

      {/* 네이버 블로그 버튼 */}
      <motion.a
        href="https://blog.naver.com/sg_logis"
        target="_blank"
        rel="noopener noreferrer"
        initial={{ opacity: 0, y: 40, scale: 0.85 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, delay: 0.2, type: "spring", stiffness: 200, damping: 15 }}
        whileHover={{ y: -4, scale: 1.05 }}
        className="flex items-center gap-2 bg-white border-2 border-[#03C75A] px-4 py-3 rounded-full shadow-lg transition-all"
      >
        <div className="w-6 h-6 bg-[#03C75A] rounded-sm flex items-center justify-center text-white font-black text-[10px]">
          N
        </div>
        <span className="text-sm font-bold text-slate-700">블로그보기</span>
      </motion.a>
    </div>
  );
}
