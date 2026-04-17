import { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, ChevronUp, Download, FileText } from "lucide-react";

type Notice = {
  id: string;
  title: string;
  category: string;
  content: string;
  fileUrl?: string;
  fileName?: string;
  createdAt: any;
};

const categoryVariant: Record<string, "destructive" | "secondary" | "default"> = {
  긴급: "destructive",
  이벤트: "default",
  공지: "secondary",
  안내: "secondary",
};

export default function Notice() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "notices"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snap) => {
      setNotices(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Notice)));
      setLoadingData(false);
    });
    return () => unsubscribe();
  }, []);

  const toggle = (id: string) => setOpenId((prev) => (prev === id ? null : id));

  const formatDate = (ts: any) => {
    if (!ts) return "";
    try {
      return ts.toDate().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
    } catch {
      return "";
    }
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

          {loadingData ? (
            <div className="text-center py-20 text-slate-400">공지사항을 불러오는 중...</div>
          ) : notices.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <FileText className="h-12 w-12 mx-auto mb-4 text-slate-200" />
              <p>등록된 공지사항이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notices.map((notice) => {
                const isOpen = openId === notice.id;
                return (
                  <Card key={notice.id} className="border-slate-100 overflow-hidden">
                    <CardContent className="p-0">
                      <button
                        onClick={() => toggle(notice.id)}
                        className="w-full text-left p-6 flex items-center justify-between hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <Badge variant={categoryVariant[notice.category] ?? "secondary"} className="shrink-0">
                            {notice.category}
                          </Badge>
                          <span className="font-bold text-slate-800 truncate">{notice.title}</span>
                          {notice.fileUrl && (
                            <span className="shrink-0 text-blue-400 text-xs flex items-center gap-1">
                              <Download className="h-3 w-3" /> 첨부
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 shrink-0 ml-4">
                          <span className="text-sm text-slate-400 hidden sm:block">{formatDate(notice.createdAt)}</span>
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
                              <p className="text-sm text-slate-400 mb-4 pt-4">{formatDate(notice.createdAt)}</p>
                              <p className="text-slate-700 whitespace-pre-line leading-relaxed mb-4">
                                {notice.content}
                              </p>

                              {notice.fileUrl && notice.fileName && (
                                <a
                                  href={notice.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download={notice.fileName}
                                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors border border-blue-200"
                                >
                                  <Download className="h-4 w-4" />
                                  {notice.fileName} 다운로드
                                </a>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

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
