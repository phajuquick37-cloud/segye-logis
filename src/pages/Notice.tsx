import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, ChevronUp } from "lucide-react";

const notices = [
  {
    id: 1,
    title: "2025년 설 연휴 배송 일정 안내",
    date: "2025-01-20",
    category: "공지",
    content: `안녕하세요. 세계로지스입니다.\n\n2025년 설 연휴 기간 동안 배송 일정을 아래와 같이 안내드립니다.\n\n• 연휴 기간: 2025년 1월 28일(화) ~ 2월 2일(일)\n• 마지막 정상 접수: 1월 27일(월) 오후 5시까지\n• 연휴 중 긴급 배송: 전화 문의 후 가능 (1588-7185)\n• 정상 영업 재개: 2월 3일(월) 오전 9시\n\n연휴 기간 중 긴급 배송이 필요하신 경우 고객센터로 연락 주시기 바랍니다.\n\n감사합니다.`,
  },
  {
    id: 2,
    title: "세계로지스 홈페이지 리뉴얼 오픈 안내",
    date: "2025-01-10",
    category: "이벤트",
    content: `안녕하세요. 세계로지스입니다.\n\n더욱 편리한 서비스 이용을 위해 홈페이지를 새롭게 리뉴얼하였습니다.\n\n주요 변경 사항:\n• 온라인 자동배차 시스템 도입\n• 실시간 화물 요금 계산기 추가\n• 모바일 최적화 디자인 적용\n• 24시간 온라인 접수 가능\n\n앞으로도 더 나은 서비스로 보답하겠습니다.\n\n감사합니다.`,
  },
  {
    id: 3,
    title: "화물 운송 약관 개정 안내",
    date: "2025-01-05",
    category: "안내",
    content: `안녕하세요. 세계로지스입니다.\n\n2025년 1월 1일부터 화물 운송 약관이 일부 개정되었습니다.\n\n주요 개정 내용:\n• 파손·분실 보상 기준 명확화\n• 당일 취소 수수료 기준 변경 (접수 후 1시간 이내 취소 시 무료)\n• 초과 중량 요금 기준 조정\n\n자세한 내용은 고객센터(1588-7185)로 문의해 주시기 바랍니다.\n\n감사합니다.`,
  },
  {
    id: 4,
    title: "폭설로 인한 일부 지역 배송 지연 안내",
    date: "2024-12-21",
    category: "긴급",
    content: `안녕하세요. 세계로지스입니다.\n\n현재 수도권 지역에 대설 특보가 발효 중으로 일부 지역 배송이 지연되고 있습니다.\n\n지연 예상 지역:\n• 파주시 북부 지역 (문산, 적성)\n• 고양시 일부 지역\n• 김포시 통진읍 일대\n\n기사님들의 안전 운행을 위해 불가피하게 배송이 지연될 수 있는 점 양해 부탁드립니다.\n\n긴급 문의: 1588-7185 (24시간)\n\n감사합니다.`,
  },
];

const categoryColor: Record<string, "destructive" | "secondary" | "default"> = {
  긴급: "destructive",
  이벤트: "default",
  공지: "secondary",
  안내: "secondary",
};

export default function Notice() {
  const [openId, setOpenId] = useState<number | null>(null);

  const toggle = (id: number) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="py-20 bg-white min-h-screen">
      <div className="container mx-auto px-4 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          <div className="text-center mb-16">
            <h1 className="text-4xl font-bold text-slate-900 mb-4">공지사항</h1>
            <p className="text-slate-600">세계로지스의 새로운 소식을 전해드립니다.</p>
          </div>

          <div className="space-y-3">
            {notices.map((notice) => {
              const isOpen = openId === notice.id;
              return (
                <Card
                  key={notice.id}
                  className="border-slate-100 overflow-hidden"
                >
                  <CardContent className="p-0">
                    <button
                      onClick={() => toggle(notice.id)}
                      className="w-full text-left p-6 flex items-center justify-between hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <Badge variant={categoryColor[notice.category] ?? "secondary"}>
                          {notice.category}
                        </Badge>
                        <span className="font-bold text-slate-800">{notice.title}</span>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 ml-4">
                        <span className="text-sm text-slate-400 hidden sm:block">{notice.date}</span>
                        {isOpen ? (
                          <ChevronUp className="h-5 w-5 text-slate-400" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-slate-400" />
                        )}
                      </div>
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          key="content"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          <div className="px-6 pb-6 border-t border-slate-100">
                            <p className="text-sm text-slate-400 mb-3 pt-4">{notice.date}</p>
                            <p className="text-slate-700 whitespace-pre-line leading-relaxed">
                              {notice.content}
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="mt-12 p-6 bg-slate-50 rounded-xl border border-slate-100 text-center">
            <p className="text-sm text-slate-500">
              ※ 공지사항을 클릭하면 상세 내용을 확인하실 수 있습니다. <br />
              추가 문의사항은 고객센터(1588-7185)로 연락 주시기 바랍니다.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
