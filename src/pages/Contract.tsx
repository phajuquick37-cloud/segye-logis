import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { motion } from "motion/react";
import { Checkbox } from "../../components/ui/checkbox";
import { Label } from "../../components/ui/label";
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { useState } from "react";
import { db } from "../lib/firebase";
import { collection, addDoc } from "firebase/firestore";
import emailjs from "@emailjs/browser";

const EMAILJS_SERVICE_ID = "phajuquick37@gmail.com";
const EMAILJS_TEMPLATE_ID = "template_fq46vyb";
const EMAILJS_PUBLIC_KEY = "2UV1EoVCkgGhWZpTS";

export default function Contract() {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    companyName: "",
    email: "",
    managerName: "",
    phone: "",
    items: "",
    content: ""
  });

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!formData.companyName || !formData.email || !formData.managerName || !formData.phone || !formData.items || !formData.content) {
      alert("필수 항목을 모두 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, "inquiries"), {
        ...formData,
        createdAt: new Date().toISOString(),
        status: "pending"
      });

      // 관리자 이메일 알림 발송 (EmailJS)
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        {
          company_name: formData.companyName,
          manager_name: formData.managerName,
          email: formData.email,
          phone: formData.phone,
          items: formData.items,
          message: formData.content,
        },
        EMAILJS_PUBLIC_KEY
      );

      alert("문의가 정상적으로 접수되었습니다. 곧 연락드리겠습니다.");
      setFormData({
        companyName: "",
        email: "",
        managerName: "",
        phone: "",
        items: "",
        content: ""
      });
    } catch (error) {
      console.error("Error adding document: ", error);
      alert("접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen">
      {/* Hero Section for Contract */}
      <div className="bg-slate-900 py-20 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <img src="https://picsum.photos/seed/warehouse/1920/400" alt="background" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        </div>
        <div className="container mx-auto px-4 relative z-10">
          <h2 className="text-yellow-400 font-bold text-2xl mb-4">온라인 자동배차 시스템</h2>
          <h1 className="text-white text-4xl md:text-5xl font-bold">언제 어디서든 365일 24시간 접수 플랫폼</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-5xl mx-auto"
        >
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">회사 계약거래</h2>
          
          <Card className="border-none shadow-sm bg-white">
            <CardContent className="p-8 md:p-12">
              <form onSubmit={handleSubmit} className="space-y-10">
                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <div className="space-y-2">
                    <Label className="text-sm font-bold flex items-center gap-1">회사명 <span className="text-red-500">*</span></Label>
                    <Input 
                      className="bg-slate-50 border-slate-200 h-12" 
                      placeholder="예)세계로지스" 
                      value={formData.companyName}
                      onChange={(e) => setFormData({...formData, companyName: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold flex items-center gap-1">이메일 <span className="text-red-500">*</span></Label>
                    <Input 
                      className="bg-slate-50 border-slate-200 h-12" 
                      placeholder="예)test@test.com" 
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold flex items-center gap-1">담당자명 <span className="text-red-500">*</span></Label>
                    <Input 
                      className="bg-slate-50 border-slate-200 h-12" 
                      placeholder="예)홍길동" 
                      value={formData.managerName}
                      onChange={(e) => setFormData({...formData, managerName: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold flex items-center gap-1">담당자 핸드폰 <span className="text-red-500">*</span></Label>
                    <Input 
                      className="bg-slate-50 border-slate-200 h-12" 
                      placeholder="예)01012345678" 
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    />
                  </div>
                </div>

                {/* Regions */}
                <div className="space-y-4">
                  <Label className="text-sm font-bold text-slate-500">이용지역 (출발지 기준, 중복선택 가능)</Label>
                  <div className="flex flex-wrap gap-6">
                    {["수도권", "경기도", "그 외 지역"].map((region) => (
                      <div key={region} className="flex items-center space-x-2">
                        <Checkbox id={`region-${region}`} />
                        <label htmlFor={`region-${region}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                          {region}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Vehicles */}
                <div className="space-y-4">
                  <Label className="text-sm font-bold text-slate-500">이용차량 (중복선택 가능)</Label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {["오토바이 퀵", "다마스", "라보", "1톤", "2.5톤", "3.5톤", "5톤", "리프트, 윙바디, 탑차"].map((v) => (
                      <div key={v} className="flex items-center space-x-2">
                        <Checkbox id={`v-${v}`} />
                        <label htmlFor={`v-${v}`} className="text-sm font-medium leading-none">
                          {v}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Monthly Amount */}
                <div className="space-y-4">
                  <Label className="text-sm font-bold text-slate-500">월 이용 금액</Label>
                  <RadioGroup defaultValue="100" className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "100만 이상", value: "100" },
                      { label: "300만 이상", value: "300" },
                      { label: "500만 이상", value: "500" },
                      { label: "1000만 이상", value: "1000" }
                    ].map((item) => (
                      <div key={item.value} className="flex items-center space-x-2">
                        <RadioGroupItem value={item.value} id={`amt-${item.value}`} />
                        <Label htmlFor={`amt-${item.value}`}>{item.label}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                {/* Payment Date */}
                <div className="space-y-4">
                  <Label className="text-sm font-bold text-slate-500">결재일 선택</Label>
                  <div className="flex flex-wrap gap-6">
                    {["익월 5일", "익월 10일", "익월 15일"].map((date) => (
                      <div key={date} className="flex items-center space-x-2">
                        <Checkbox id={`date-${date}`} />
                        <label htmlFor={`date-${date}`} className="text-sm font-medium leading-none">
                          {date}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Items */}
                <div className="space-y-2">
                  <Label className="text-sm font-bold flex items-center gap-1">운송품목 <span className="text-red-500">*</span></Label>
                  <Textarea 
                    className="bg-slate-50 border-slate-200 h-32" 
                    value={formData.items}
                    onChange={(e) => setFormData({...formData, items: e.target.value})}
                  />
                </div>

                {/* Inquiry */}
                <div className="space-y-2">
                  <Label className="text-sm font-bold flex items-center gap-1">문의내용 <span className="text-red-500">*</span></Label>
                  <Textarea 
                    className="bg-slate-50 border-slate-200 h-48" 
                    value={formData.content}
                    onChange={(e) => setFormData({...formData, content: e.target.value})}
                  />
                </div>

                {/* Submit */}
                <div className="pt-6 flex justify-center">
                  <Button 
                    type="submit"
                    disabled={loading}
                    className="w-full md:w-64 h-14 bg-blue-700 hover:bg-blue-800 text-lg font-bold rounded-md"
                  >
                    {loading ? "접수 중..." : "월거래 문의하기"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
