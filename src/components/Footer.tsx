import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 py-16 border-t border-slate-800">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <img 
                src="/sglogo.png" 
                alt="세계로지스 로고" 
                className="h-10 w-auto object-contain brightness-0 invert"
              />
              <span className="text-xl font-bold tracking-tight text-white">세계로지스</span>
            </div>
            <p className="text-sm leading-relaxed">
              24시간 온라인 퀵 & 화물 자동배차 서비스.<br />
              고객님의 소중한 화물을 가장 빠르고 안전하게 배송해 드립니다.
            </p>
          </div>
          
          <div>
            <h4 className="text-white font-bold mb-4">서비스 안내</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="https://15887185.co.kr" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">온라인 주문</a></li>
              <li><a href="/#vehicle-types" className="hover:text-blue-400 transition-colors">차량종류 확인</a></li>
              <li><a href="https://15887185.co.kr" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">요금 안내</a></li>
              <li><Link to="/contract" className="hover:text-blue-400 transition-colors">기업 계약 안내</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-4">고객지원</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/notice" className="hover:text-blue-400 transition-colors">공지사항</Link></li>
              <li><Link to="/faq" className="hover:text-blue-400 transition-colors">자주 묻는 질문</Link></li>
              <li><a href="http://pf.kakao.com/_bNaPxj/chat" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">1:1 문의</a></li>
              <li><Link to="/notice" className="hover:text-blue-400 transition-colors"></Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-4">상담센터</h4>
            <div className="space-y-2">
              <p className="text-2xl font-bold text-white">1588-7185</p>
              <p className="text-xs">평일/주말 24시간 운영</p>
              <p className="text-xs">이메일: phajuquick@hanmail.net</p>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-start gap-4 text-[11px]">
          <div className="space-y-2 w-full md:w-auto">
            {/* 사업자 정보 */}
            <div className="flex flex-wrap justify-center md:justify-start gap-x-5 gap-y-1">
              <span>회사명: 세계로지스</span>
              <span>사업자등록번호: 141-81-42561</span>
              <span>화물운송주선허가 제2013-7호</span>
              <Link to="/admin" className="text-slate-400 cursor-default no-underline hover:text-slate-400 transition-none">대표자: 유병철</Link>
            </div>
            {/* 사업장 주소 */}
            <div className="flex flex-wrap justify-center md:justify-start gap-x-4 gap-y-1 text-slate-500">
              <span><span className="text-slate-400 font-semibold">본사</span>: 경기도 파주시 조리읍 등원로427</span>
              <span><span className="text-slate-400 font-semibold">일산영업소</span>: 경기도 고양시 일산서구 경의로802</span>
              <span><span className="text-slate-400 font-semibold">김포영업소</span>: 김포시 양촌읍 김포대로1782</span>
              <span><span className="text-slate-400 font-semibold">양주영업소</span>: 경기 양주시 광적면 삼일로11</span>
              <span><span className="text-slate-400 font-semibold">인천영업소</span>: 인천 남동구 남동대로 922번길16</span>
            </div>
          </div>
          <Link to="/admin" className="shrink-0 text-center md:text-right text-slate-400 hover:text-slate-400 cursor-default select-none">© 2024 세계로지스. All Right Reserved.</Link>
        </div>
      </div>
    </footer>
  );
}
