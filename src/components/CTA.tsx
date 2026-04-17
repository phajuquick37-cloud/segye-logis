import { Button } from "@/components/ui/button";
import { Phone } from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router-dom";

export default function CTA() {
  const headline = "정기적인 화물운송이 필요하신가요?";
  const words = headline.split(" ");

  return (
    <section className="relative py-24 overflow-hidden bg-blue-900">
      <div className="absolute inset-0 z-0">
        <img 
          src="https://picsum.photos/seed/logistics-blue/1920/1080?grayscale" 
          alt="Logistics" 
          className="w-full h-full object-cover opacity-10"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 opacity-90" />
      </div>
      
      <div className="container relative z-10 mx-auto px-4 md:px-6 text-center text-white">
        <div className="max-w-3xl mx-auto space-y-8">
          <h2 className="text-3xl font-black tracking-tight sm:text-5xl leading-tight flex flex-wrap justify-center gap-x-3">
            {words.map((word, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 30, scale: 0.8 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true }}
                transition={{ 
                  duration: 0.5, 
                  delay: i * 0.1,
                  type: "spring",
                  stiffness: 100
                }}
                className="inline-block"
              >
                {word}
              </motion.span>
            ))}
          </h2>
          <motion.p 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 0.5 }}
            className="text-blue-100 text-lg md:text-xl font-medium"
          >
            기업 월거래, 신용거래등 세계로지스와 상담해 보세요.<br />
            고객님의 비즈니스 파트너로서 최선을 다하겠습니다.
          </motion.p>
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="flex flex-col items-center gap-4 pt-4"
          >
            <motion.div
              animate={{ 
                scale: [1, 1.03, 1],
              }}
              transition={{ 
                duration: 2, 
                repeat: Infinity,
                ease: "easeInOut" 
              }}
            >
              <Link to="/contract">
                <Button size="lg" className="h-16 bg-yellow-400 hover:bg-yellow-500 text-blue-900 font-extrabold text-2xl px-12 rounded-full shadow-2xl transition-transform">
                  <Phone className="mr-3 h-6 w-6" />
                  계약거래문의
                </Button>
              </Link>
            </motion.div>
            <p className="text-sm font-bold text-blue-300 uppercase tracking-widest">
              24시간 친절 상담 대기 중
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
