import { motion } from "motion/react";
import { Code2, Settings, Zap, Globe, Download } from "lucide-react";

export default function ApiIntegration() {
  return (
    <div className="bg-slate-50 min-h-screen">
      {/* Hero Section */}
      <div className="bg-blue-600 py-24 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <img 
            src="https://picsum.photos/seed/code/1920/600" 
            alt="background" 
            className="w-full h-full object-cover" 
            referrerPolicy="no-referrer" 
          />
        </div>
        <div className="container mx-auto px-4 relative z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-block bg-white/20 backdrop-blur-md px-6 py-2 rounded-full text-white font-medium mb-6"
          >
            Digital Transformation for Logistics
          </motion.div>
          <div className="h-40 flex items-center justify-center">
            <motion.h1 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ 
                type: "spring",
                stiffness: 100,
                damping: 15,
                repeat: Infinity,
                repeatType: "reverse",
                duration: 2
              }}
              className="text-white text-4xl md:text-6xl font-black leading-tight"
            >
              우리회사 홈페이지에 접수버튼 달고<br />
              <span className="text-yellow-400">퀵/화물운송은 세계로지스에 맡기세요</span>
            </motion.h1>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-20 pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left: Image Space */}
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="relative lg:scale-105 lg:origin-center lg:-translate-x-4"
          >
            <div className="relative z-10 rounded-2xl overflow-hidden shadow-2xl">
              <img 
                src="/api-photo.png" 
                alt="API 연동 이미지" 
                className="w-full h-auto object-cover"
              />
            </div>
            {/* Decorative background blocks */}
            <div className="absolute -top-6 -left-6 w-full h-full bg-blue-100 rounded-2xl -z-10" />
            <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-yellow-400/20 rounded-full blur-3xl -z-10" />
          </motion.div>

          {/* Right: Content */}
          <div className="space-y-10">
            <div className="space-y-4">
              <h2 className="text-3xl font-bold text-slate-900">손쉬운 API 연동</h2>
              <p className="text-lg text-slate-600 leading-relaxed">
                복잡한 물류 시스템 구축 없이, 코드 몇 줄로 귀사의 홈페이지에서 바로 퀵과 화물 접수가 가능해집니다.
                세계로지스의 고도화된 물류 엔진을 귀사 서비스의 일부로 만들어보세요.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { icon: Code2, title: "단순한 연동", desc: "표준 REST API 제공" },
                { icon: Settings, title: "맞춤형 UI", desc: "브랜드에 맞는 디자인" },
                { icon: Zap, title: "실시간 배차", desc: "즉각적인 기사 매칭" },
                { icon: Globe, title: "전국 커버리지", desc: "어디서든 접수 가능" }
              ].map((item, idx) => (
                <div key={idx} className="flex gap-4 p-4 rounded-xl bg-white shadow-sm border border-slate-100">
                  <div className="flex-shrink-0 w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">{item.title}</h4>
                    <p className="text-xs text-slate-500">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="pt-6 flex flex-col sm:flex-row gap-4 items-start"
            >
              <a 
                href="/segye-api-guide.zip"
                download="세계로지스_설치가이드.zip"
                className="inline-flex items-center justify-center gap-2 h-16 px-10 bg-blue-700 hover:bg-blue-800 text-white text-xl font-black rounded-lg shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1"
              >
                <Download className="w-6 h-6 shrink-0" />
                설치가이드 다운로드
              </a>
              <a
                href="/segye-api-guide.html"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 h-16 px-8 border-2 border-blue-700 text-blue-700 hover:bg-blue-50 text-lg font-bold rounded-lg transition-all hover:-translate-y-1"
              >
                온라인으로 보기
              </a>
            </motion.div>
            <p className="mt-4 text-sm text-slate-400">* 연동 가이드 및 기술 지원은 상담을 통해 제공됩니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
