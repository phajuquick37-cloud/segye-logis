import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, Star, Quote } from "lucide-react";

const reviews = [
  {
    id: 1,
    author: "김*호 (제조업체 물류팀)",
    content: "파주에서 고양까지 급하게 원단 배송이 필요했는데, 배차 속도가 정말 빠르네요. 기사님도 친절하시고 물건도 안전하게 도착했습니다.",
    rating: 5,
    date: "2024.03.12"
  },
  {
    id: 2,
    author: "이*영 (온라인 쇼핑몰 운영)",
    content: "매일 정기적으로 퀵을 이용하는데, 요금이 합리적이라 부담이 적습니다. 특히 온라인으로 간편하게 주문할 수 있는 점이 제일 편해요.",
    rating: 5,
    date: "2024.03.10"
  },
  {
    id: 3,
    author: "박*준 (인테리어 업체)",
    content: "1톤 트럭 리프트 차량이 필요했는데 바로 배차해주셨어요. 무거운 자재라 걱정했는데 기사님이 베테랑이셔서 수월하게 끝났습니다.",
    rating: 5,
    date: "2024.03.08"
  },
  {
    id: 4,
    author: "최*서 (개인 고객)",
    content: "이사 짐이 조금 많아서 라보를 불렀는데, 시간 약속도 칼같이 지키시고 짐 싣는 것도 많이 도와주셔서 감동받았습니다. 감사합니다!",
    rating: 5,
    date: "2024.03.05"
  },
  {
    id: 5,
    author: "정*우 (식자재 유통)",
    content: "냉동차량이 급하게 필요할 때마다 세계로지스를 찾습니다. 온도 유지도 잘 되고 배송 시간도 정확해서 믿고 맡깁니다.",
    rating: 5,
    date: "2024.03.01"
  },
  {
    id: 6,
    author: "한*진 (광고 대행사)",
    content: "전시회 비품 운송 때문에 5톤 윙바디를 이용했습니다. 상담원분이 친절하게 안내해주시고 배차 현황도 실시간으로 알 수 있어 안심됐어요.",
    rating: 5,
    date: "2024.02.28"
  },
  {
    id: 7,
    author: "윤*현 (가구 공방)",
    content: "김포에서 서울까지 가구 배송할 때 자주 이용합니다. 가구라 파손 위험이 큰데 항상 꼼꼼하게 고정해주셔서 한 번도 사고가 없었네요.",
    rating: 5,
    date: "2024.02.25"
  },
  {
    id: 8,
    author: "임*택 (건설 현장)",
    content: "현장 자재 운반 때문에 11톤 카고를 불렀습니다. 좁은 현장 입구인데도 기사님이 운전을 너무 잘하셔서 깜짝 놀랐습니다. 실력 최고네요.",
    rating: 5,
    date: "2024.02.20"
  },
  {
    id: 9,
    author: "송*아 (플라워샵)",
    content: "꽃 배달이라 조심스러운데 다마스 퀵 기사님이 항상 조심조심 다뤄주세요. 덕분에 손님들께 싱싱한 꽃을 잘 전달하고 있습니다.",
    rating: 5,
    date: "2024.02.15"
  },
  {
    id: 10,
    author: "조*민 (IT 기업)",
    content: "사무실 이전 때문에 여러 대의 차량이 필요했는데 통합적으로 잘 관리해주셔서 무사히 마쳤습니다. 기업 물류 파트너로 추천합니다.",
    rating: 5,
    date: "2024.02.10"
  }
];

export default function CustomerReviews() {
  const [page, setPage] = useState(0);
  const itemsPerPage = 2; // Show 2 reviews at a time on desktop
  const totalPages = Math.ceil(reviews.length / itemsPerPage);

  const next = () => setPage((p) => (p + 1) % totalPages);
  const prev = () => setPage((p) => (p - 1 + totalPages) % totalPages);

  const currentReviews = reviews.slice(page * itemsPerPage, (page + 1) * itemsPerPage);

  return (
    <section className="py-24 bg-white relative overflow-hidden">
      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            고객 리얼후기
          </h2>
          <p className="text-slate-500">세계로지스를 이용하신 고객님들의 소중한 목소리입니다.</p>
          <div className="h-1 w-20 bg-blue-600 mx-auto rounded-full" />
        </div>

        <div className="relative max-w-5xl mx-auto">
          <button 
            onClick={prev}
            className="absolute left-[-20px] md:left-[-60px] top-1/2 -translate-y-1/2 z-20 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-slate-50 transition-colors border border-slate-100"
          >
            <ChevronLeft className="w-6 h-6 text-slate-400" />
          </button>
          
          <button 
            onClick={next}
            className="absolute right-[-20px] md:right-[-60px] top-1/2 -translate-y-1/2 z-20 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-slate-50 transition-colors border border-slate-100"
          >
            <ChevronRight className="w-6 h-6 text-slate-400" />
          </button>

          <div className="overflow-hidden min-h-[300px]">
            <AnimatePresence mode="wait">
              <motion.div 
                key={page}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.5 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-8"
              >
                {currentReviews.map((review) => (
                  <div key={review.id} className="bg-slate-50 p-8 rounded-2xl border border-slate-100 relative">
                    <Quote className="absolute top-4 right-4 w-8 h-8 text-blue-100" />
                    <div className="flex gap-1 mb-4">
                      {[...Array(review.rating)].map((_, i) => (
                        <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      ))}
                    </div>
                    <p className="text-slate-700 leading-relaxed mb-6 italic">
                      "{review.content}"
                    </p>
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="font-bold text-slate-900">{review.author}</p>
                        <p className="text-xs text-slate-400 mt-1">이용일: {review.date}</p>
                      </div>
                      <div className="bg-blue-600/10 px-3 py-1 rounded-full">
                        <span className="text-[10px] font-bold text-blue-600">Verified Review</span>
                      </div>
                    </div>
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>
          
          <div className="flex justify-center gap-2 mt-12">
            {[...Array(totalPages)].map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`w-2 h-2 rounded-full transition-all ${page === i ? "w-8 bg-blue-600" : "bg-slate-200"}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
