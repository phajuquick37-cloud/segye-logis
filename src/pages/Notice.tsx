import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "motion/react";
import { Download } from "lucide-react";

const notices = [
  { 
    id: 1, 
    title: "2024년 설 연휴 배송 일정 안내", 
    date: "2024-02-01", 
    category: "공지",
    file: "/files/holiday_schedule_2024.pdf"
  },
  { 
    id: 2, 
    title: "세계로지스 홈페이지 리뉴얼 오픈 이벤트", 
    date: "2024-01-15", 
    category: "이벤트",
    file: "/files/event_info.pdf"
  },
  { 
    id: 3, 
    title: "화물 운송 약관 개정 안내", 
    date: "2024-01-05", 
    category: "안내",
    file: "/files/terms_update.pdf"
  },
  { 
    id: 4, 
    title: "폭설로 인한 일부 지역 배송 지연 안내", 
    date: "2023-12-21", 
    category: "긴급",
    file: "/files/weather_delay.pdf"
  },
];

export default function Notice() {
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

          <div className="space-y-4">
            {notices.map((notice) => (
              <Card key={notice.id} className="hover:shadow-md transition-shadow border-slate-100">
                <CardContent className="p-6 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Badge variant={notice.category === "긴급" ? "destructive" : "secondary"}>
                      {notice.category}
                    </Badge>
                    <h3 className="font-bold text-slate-800">
                      {notice.title}
                    </h3>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className="text-sm text-slate-400">{notice.date}</span>
                    <a 
                      href={notice.file} 
                      download 
                      className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      다운로드
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-12 p-6 bg-slate-50 rounded-xl border border-slate-100 text-center">
            <p className="text-sm text-slate-500">
              ※ 다운로드 버튼을 클릭하면 관련 서류를 확인하실 수 있습니다. <br />
              파일이 열리지 않을 경우 고객센터(1588-7185)로 문의 바랍니다.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
