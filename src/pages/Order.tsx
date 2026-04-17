import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "motion/react";

export default function Order() {
  return (
    <div className="py-20 bg-slate-50 min-h-screen">
      <div className="container mx-auto px-4 md:px-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-slate-900 mb-4">온라인 주문 접수</h1>
            <p className="text-slate-600">빠르고 정확한 배송을 위해 정보를 입력해 주세요.</p>
          </div>

          <Card className="shadow-xl border-none">
            <CardHeader className="bg-blue-600 text-white rounded-t-xl">
              <CardTitle>배송 정보 입력</CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">출발지 주소</label>
                  <input type="text" className="w-full p-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="출발지 주소를 입력하세요" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">도착지 주소</label>
                  <input type="text" className="w-full p-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="도착지 주소를 입력하세요" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">연락처</label>
                  <input type="tel" className="w-full p-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="연락처를 입력하세요" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">물품 종류</label>
                  <select className="w-full p-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none">
                    <option>서류/소형</option>
                    <option>박스/중형</option>
                    <option>대형 화물</option>
                    <option>기타</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">요청사항</label>
                <textarea className="w-full p-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none h-32" placeholder="기사님께 전달할 메모를 남겨주세요"></textarea>
              </div>
              <Button className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-lg font-bold">
                주문 접수하기
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
