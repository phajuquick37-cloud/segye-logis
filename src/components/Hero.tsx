import React from "react";
import { Button } from "@/components/ui/button";
import { motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

export default function Hero() {
  const services = ["정기적인 기업물류", "신속한 퀵서비스", "안전한 전국화물", "정확한 당일배송"];
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % services.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative overflow-hidden bg-blue-100/40 py-20 lg:py-32">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="flex flex-col justify-center space-y-8 pr-6 lg:pr-16"
          >
            <div className="space-y-4">
              <div className="h-8 overflow-hidden">
                <motion.p
                  key={index}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  className="text-blue-600 font-bold text-lg"
                >
                  {services[index]}
                </motion.p>
              </div>
              <span className="inline-block rounded-full bg-blue-100 px-4 py-1.5 text-sm font-semibold text-blue-600">
                1997년부터~ 29년 업력으로 증명한
              </span>
              <a href="http://pf.kakao.com/_bNaPxj/chat" target="_blank" rel="noopener noreferrer" className="block group">
                <h1 className="text-lg font-extrabold tracking-tight text-slate-900 sm:text-2xl lg:text-3xl xl:text-4xl leading-tight sm:leading-[1.2] group-hover:text-blue-700 transition-colors">
                  <span className="block whitespace-nowrap">기업물류의심장 고양</span>
                  <span className="block whitespace-nowrap">파주, 김포 15,000고객이</span>
                  <span className="block whitespace-nowrap">
                    <span className="text-blue-600 group-hover:text-blue-800">세계로지스</span> 를 선택한 이유가 있습니다.
                  </span>
                </h1>
              </a>
              <p className="max-w-[600px] text-lg text-slate-600 md:text-xl">
                다양한 접수 방법으로 간편하게 접수하세요.<br />
                최적의 경로와 요금으로 빠르고 안전하게 배송해 드립니다.
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row">
              <a 
                href="https://15887185.co.kr" 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center text-center h-14 bg-blue-600 px-6 text-base sm:text-lg font-bold text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                퀵 & 화물 접수하기
                <ChevronRight className="ml-2 h-5 w-5 shrink-0" />
              </a>
              <a 
                href="https://15887185.co.kr" 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center text-center h-14 border-2 border-blue-600 px-6 text-base sm:text-lg font-bold text-blue-600 rounded-md hover:bg-blue-50 transition-colors"
              >
                요금 조회하기
              </a>
            </div>
          </motion.div>
          
          <div className="relative flex items-center justify-center overflow-hidden rounded-2xl">
            <div className="relative h-[400px] w-full max-w-[500px] lg:h-[500px]">
              <motion.img
                src="/hero-truck.png"
                alt="세계로지스 화물트럭"
                className="h-full w-full object-contain drop-shadow-2xl"
                animate={{ x: ["110%", "0%"], opacity: [0, 1] }}
                transition={{
                  duration: 1.4,
                  ease: "easeOut",
                  repeat: Infinity,
                  repeatDelay: 2.5,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
