import React, { useState, useEffect, useRef } from "react";
import { auth, db, storage } from "../lib/firebase";
import { onAuthStateChanged, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { LogIn, LogOut, Trash2, CheckCircle, Clock, PlusCircle, FileUp, X, Lock, Eye, Receipt, DollarSign, ChevronLeft, ChevronRight, ZoomIn, BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";

type Tab = "inquiries" | "notices" | "taxinvoices";

// 검색어 하이라이트 컴포넌트
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-yellow-900 rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

const CATEGORIES = ["공지", "안내", "이벤트", "긴급"];
const STAFF_EMAIL = "staff@segyelogis.com";
const STAFF_PASSWORD = "quick7998!";
const ADMIN_EMAILS = ["phajuquick37@gmail.com", STAFF_EMAIL];

export default function Admin() {
  const [user, setUser] = useState<any>(null);
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [notices, setNotices] = useState<any[]>([]);
  const [taxInvoices, setTaxInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("inquiries");

  // 문의 상세보기 모달
  const [selectedInquiry, setSelectedInquiry] = useState<any>(null);

  // 세금계산서 상세 모달
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [invoiceImageIdx, setInvoiceImageIdx] = useState(0);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  // 입금 처리 폼 상태
  const [payerName, setPayerName] = useState("");
  const [payMemo, setPayMemo] = useState("");
  const [payLoading, setPayLoading] = useState(false);
  // 지급 확인/취소 다이얼로그
  const [payConfirm, setPayConfirm] = useState<null | "pay" | "cancel">(null);
  // 세금계산서 검색 + 필터
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<"all" | "pending" | "paid">("all");

  // 비밀번호 입력 상태
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showGoogleLogin, setShowGoogleLogin] = useState(false);

  // 공지 작성 폼 상태
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("공지");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user && ADMIN_EMAILS.includes(user.email);

  useEffect(() => {
    getRedirectResult(auth).catch(() => {});
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    const q1 = query(collection(db, "inquiries"), orderBy("createdAt", "desc"));
    const unsub1 = onSnapshot(q1, (snap) => {
      setInquiries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const q2 = query(collection(db, "notices"), orderBy("createdAt", "desc"));
    const unsub2 = onSnapshot(q2, (snap) => {
      setNotices(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // 세금계산서 작성일(issue_date) 기준 정렬 — 이메일 수신일과 무관하게 계산서 날짜순
    const q3 = query(collection(db, "tax_invoices"), orderBy("created_at", "desc"));
    const unsub3 = onSnapshot(q3, (snap) => {
      setTaxInvoices(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => { unsub1(); unsub2(); unsub3(); };
  }, [isAdmin]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordLoading(true);
    try {
      await signInWithEmailAndPassword(auth, STAFF_EMAIL, STAFF_PASSWORD);
    } catch (err: any) {
      if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential" || err.code === "auth/invalid-email") {
        try {
          await createUserWithEmailAndPassword(auth, STAFF_EMAIL, STAFF_PASSWORD);
        } catch (createErr: any) {
          setPasswordError("로그인 중 오류가 발생했습니다. 다시 시도해주세요.");
        }
      } else {
        setPasswordError("로그인 중 오류가 발생했습니다. 다시 시도해주세요.");
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithRedirect(auth, new GoogleAuthProvider());
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogout = () => signOut(auth);

  const updateStatus = async (id: string, status: string) => {
    await updateDoc(doc(db, "inquiries", id), { status });
  };

  const deleteInquiry = async (id: string) => {
    if (window.confirm("정말 삭제하시겠습니까?")) {
      await deleteDoc(doc(db, "inquiries", id));
    }
  };

  const deleteNotice = async (id: string) => {
    if (window.confirm("공지사항을 삭제하시겠습니까?")) {
      await deleteDoc(doc(db, "notices", id));
    }
  };

  const openInvoiceModal = (invoice: any) => {
    setSelectedInvoice(invoice);
    setInvoiceImageIdx(0);
    setPayerName(invoice.payer_name || "");
    setPayMemo(invoice.pay_memo || "");
    setPayConfirm(null);
  };

  // 세금계산서 개별 삭제
  const deleteInvoice = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm("이 세금계산서를 삭제하시겠습니까?")) return;
    await deleteDoc(doc(db, "tax_invoices", id));
  };

  // 잡이메일(pending + 공급자 없음) 일괄 삭제
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const deleteBadInvoices = async () => {
    const bad = taxInvoices.filter(
      (i) => i.status === "pending" && !i.supplier_name && !i.total_amount
    );
    if (bad.length === 0) { alert("삭제할 잘못 수집된 데이터가 없습니다."); return; }
    if (!window.confirm(`잘못 수집된 데이터 ${bad.length}건을 일괄 삭제하시겠습니까?\n(공급자·금액 없는 미처리 건)`)) return;
    setBulkDeleting(true);
    try {
      await Promise.all(bad.map((i) => deleteDoc(doc(db, "tax_invoices", i.id))));
      alert(`${bad.length}건 삭제 완료`);
    } catch (e) {
      alert("삭제 실패: " + String(e));
    } finally {
      setBulkDeleting(false);
    }
  };

  // 지급 승인 확인 후 처리
  const handlePayment = async (invoice: any) => {
    setPayConfirm(null);
    setPayLoading(true);
    try {
      await updateDoc(doc(db, "tax_invoices", invoice.id), {
        status: "paid",
        payer_name: payerName,
        pay_memo: payMemo,
        updated_at: new Date(),
      });
      setSelectedInvoice({ ...invoice, status: "paid", payer_name: payerName, pay_memo: payMemo });
    } finally {
      setPayLoading(false);
    }
  };

  // 지급 취소 확인 후 처리
  const handlePayCancel = async (invoice: any) => {
    setPayConfirm(null);
    setPayLoading(true);
    try {
      await updateDoc(doc(db, "tax_invoices", invoice.id), {
        status: "pending",
        payer_name: "",
        pay_memo: "",
        updated_at: new Date(),
      });
      setPayerName("");
      setPayMemo("");
      setSelectedInvoice({ ...invoice, status: "pending", payer_name: "", pay_memo: "" });
    } finally {
      setPayLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
  };

  const handleSubmitNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (!title.trim() || !content.trim()) {
      setFormError("제목과 내용을 입력해주세요.");
      return;
    }

    setUploading(true);

    try {
      let fileUrl = "";
      let fileName = "";

      if (file) {
        const storageRef = ref(storage, `notices/${Date.now()}_${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        await new Promise<void>((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snap) => {
              setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
            },
            reject,
            async () => {
              fileUrl = await getDownloadURL(uploadTask.snapshot.ref);
              fileName = file.name;
              resolve();
            }
          );
        });
      }

      await addDoc(collection(db, "notices"), {
        title: title.trim(),
        category,
        content: content.trim(),
        fileUrl,
        fileName,
        createdAt: serverTimestamp(),
      });

      setTitle("");
      setCategory("공지");
      setContent("");
      setFile(null);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setFormSuccess("공지사항이 등록되었습니다!");
    } catch (err) {
      console.error(err);
      setFormError("등록 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center">로딩 중...</div>;

  if (!user || !isAdmin) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-sm shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
              <Lock className="h-7 w-7 text-blue-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-slate-800">관리자 페이지</CardTitle>
            <p className="text-sm text-slate-500 mt-1">세계로지스 임직원 전용</p>
          </CardHeader>
          <CardContent className="pt-4">
            {!showGoogleLogin ? (
              <form onSubmit={(e) => {
                e.preventDefault();
                if (passwordInput === STAFF_PASSWORD) {
                  handlePasswordLogin(e);
                } else {
                  setPasswordError("비밀번호가 올바르지 않습니다.");
                }
              }} className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">비밀번호</label>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(""); }}
                    placeholder="비밀번호를 입력하세요"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  {passwordError && <p className="mt-1.5 text-xs text-red-500">{passwordError}</p>}
                </div>
                <Button
                  type="submit"
                  disabled={passwordLoading || !passwordInput}
                  className="h-11 bg-blue-600 hover:bg-blue-700 font-semibold"
                >
                  {passwordLoading ? "로그인 중..." : <><LogIn className="mr-2 h-4 w-4" />로그인</>}
                </Button>
                <button
                  type="button"
                  onClick={() => setShowGoogleLogin(true)}
                  className="text-xs text-slate-400 hover:text-slate-600 text-center transition-colors"
                >
                  대표자 구글 계정으로 로그인
                </button>
              </form>
            ) : (
              <div className="flex flex-col gap-4">
                <Button onClick={handleGoogleLogin} className="h-11 bg-blue-600 hover:bg-blue-700 font-semibold">
                  <LogIn className="mr-2 h-4 w-4" /> Google 계정으로 로그인
                </Button>
                <button
                  type="button"
                  onClick={() => setShowGoogleLogin(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 text-center transition-colors"
                >
                  ← 비밀번호로 로그인
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-slate-900">데이터 관리 센터</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-600">{user.email} (관리자)</span>
            <Button onClick={handleLogout} variant="ghost" size="sm">
              <LogOut className="mr-2 h-4 w-4" /> 로그아웃
            </Button>
          </div>
        </div>

        {/* 정산 관리 바로가기 */}
        <Link
          to="/admin/settlement"
          className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 font-semibold text-sm hover:bg-blue-100 transition-colors w-full md:w-auto"
        >
          <BarChart3 className="h-4 w-4" />
          월별 마감 · 미수금 관리 →
        </Link>

        {/* 탭 */}
        <div className="flex gap-2 border-b border-slate-200">
          {(["inquiries", "notices", "taxinvoices"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                tab === t
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t === "inquiries" && "접수 문의 관리"}
              {t === "notices" && "공지사항 관리"}
              {t === "taxinvoices" && (
                <>
                  <Receipt className="h-4 w-4" />
                  세금계산서
                  {taxInvoices.filter((i) => i.status === "pending").length > 0 && (
                    <span className="ml-1 rounded-full bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center">
                      {taxInvoices.filter((i) => i.status === "pending").length}
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>

        {/* 접수 문의 탭 */}
        {tab === "inquiries" && (
          <>
            <div className="grid gap-6 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">전체 문의</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{inquiries.length}건</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">대기 중</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">
                    {inquiries.filter((i) => i.status === "pending" || !i.status).length}건
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">처리 완료</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {inquiries.filter((i) => i.status === "completed").length}건
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>접수 데이터 목록</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>날짜</TableHead>
                        <TableHead>회사명/담당자</TableHead>
                        <TableHead>연락처</TableHead>
                        <TableHead>품목/내용</TableHead>
                        <TableHead>상태</TableHead>
                        <TableHead className="text-right">관리</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inquiries.map((item) => (
                        <TableRow key={item.id} className="cursor-pointer hover:bg-blue-50 transition-colors" onClick={() => setSelectedInquiry(item)}>
                          <TableCell className="text-xs text-slate-500">
                            {new Date(item.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="font-bold">{item.companyName}</div>
                            <div className="text-xs text-slate-500">{item.managerName} ({item.email})</div>
                          </TableCell>
                          <TableCell>{item.phone}</TableCell>
                          <TableCell className="max-w-xs">
                            <div className="truncate font-medium">{item.items}</div>
                            <div className="truncate text-xs text-slate-400">{item.content}</div>
                          </TableCell>
                          <TableCell>
                            {item.status === "completed" ? (
                              <Badge className="bg-green-100 text-green-700 hover:bg-green-100">완료</Badge>
                            ) : item.status === "contacted" ? (
                              <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">연락중</Badge>
                            ) : (
                              <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">대기</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="ghost" className="text-slate-500" onClick={(e) => { e.stopPropagation(); setSelectedInquiry(item); }}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" className="text-blue-600" onClick={(e) => { e.stopPropagation(); updateStatus(item.id, "contacted"); }}>
                                <Clock className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" className="text-green-600" onClick={(e) => { e.stopPropagation(); updateStatus(item.id, "completed"); }}>
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" className="text-red-600" onClick={(e) => { e.stopPropagation(); deleteInquiry(item.id); }}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {inquiries.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-10 text-slate-400">
                            접수된 데이터가 없습니다.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* 공지사항 탭 */}
        {tab === "notices" && (
          <div className="space-y-6">
            {/* 공지 작성 폼 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PlusCircle className="h-5 w-5 text-blue-600" />
                  새 공지사항 작성
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmitNotice} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">제목 *</label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="공지사항 제목을 입력하세요"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">카테고리</label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">내용 *</label>
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="공지사항 내용을 입력하세요"
                      rows={6}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>

                  {/* 파일 첨부 */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">파일 첨부 (선택)</label>
                    <div
                      className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {file ? (
                        <div className="flex items-center justify-center gap-2 text-sm text-slate-700">
                          <FileUp className="h-4 w-4 text-blue-600" />
                          <span className="font-medium">{file.name}</span>
                          <span className="text-slate-400">({(file.size / 1024).toFixed(1)} KB)</span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                            className="ml-2 text-red-500 hover:text-red-700"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="text-slate-400 text-sm">
                          <FileUp className="h-6 w-6 mx-auto mb-1 text-slate-300" />
                          클릭하여 파일 선택 (PDF, 이미지, 문서 등)
                        </div>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleFileChange}
                      className="hidden"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.hwp,.png,.jpg,.jpeg"
                    />
                  </div>

                  {/* 업로드 진행 */}
                  {uploading && file && (
                    <div>
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>파일 업로드 중...</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {formError && <p className="text-sm text-red-500">{formError}</p>}
                  {formSuccess && <p className="text-sm text-green-600 font-medium">{formSuccess}</p>}

                  <Button
                    type="submit"
                    disabled={uploading}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-8"
                  >
                    {uploading ? "등록 중..." : "공지 등록"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* 등록된 공지 목록 */}
            <Card>
              <CardHeader>
                <CardTitle>등록된 공지사항 ({notices.length}건)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {notices.length === 0 && (
                    <p className="text-center py-10 text-slate-400">등록된 공지사항이 없습니다.</p>
                  )}
                  {notices.map((notice) => (
                    <div key={notice.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100">
                      <div className="flex items-center gap-3">
                        <Badge variant={notice.category === "긴급" ? "destructive" : "secondary"}>
                          {notice.category}
                        </Badge>
                        <div>
                          <p className="font-semibold text-slate-800">{notice.title}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {notice.createdAt?.toDate?.()?.toLocaleDateString("ko-KR") ?? ""}
                            {notice.fileName && (
                              <span className="ml-2 text-blue-500">📎 {notice.fileName}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => deleteNotice(notice.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      {/* 세금계산서 탭 */}
      {tab === "taxinvoices" && (
        <>
          {/* 요약 카드 */}
          <div className="grid gap-6 md:grid-cols-4">
            {[
              { label: "전체", value: taxInvoices.length, color: "text-slate-800" },
              { label: "미처리", value: taxInvoices.filter((i) => i.status === "pending").length, color: "text-orange-600" },
              { label: "입금 완료", value: taxInvoices.filter((i) => i.status === "paid").length, color: "text-green-600" },
              {
                label: "이번달 합계",
                value: (() => {
                  const now = new Date();
                  const total = taxInvoices
                    .filter((i) => i.issue_date?.startsWith(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`))
                    .reduce((sum, i) => sum + (i.total_amount || 0), 0);
                  return total.toLocaleString() + "원";
                })(),
                color: "text-blue-600",
              },
            ].map(({ label, value, color }) => (
              <Card key={label}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">{label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${color}`}>{value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* 목록 */}
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-blue-600" />
                  수집된 세금계산서 목록
                </CardTitle>
                {/* 검색창 + 상태 필터 + 일괄삭제 */}
                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50 whitespace-nowrap"
                    onClick={deleteBadInvoices}
                    disabled={bulkDeleting}
                    title="공급자·금액 없는 미처리 잡이메일 데이터 일괄 삭제"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {bulkDeleting ? "삭제 중..." : "잡이메일 일괄삭제"}
                  </Button>
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                    </svg>
                    <input
                      type="text"
                      value={invoiceSearch}
                      onChange={(e) => setInvoiceSearch(e.target.value)}
                      placeholder="상호명·입금자·비고 검색"
                      className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-full sm:w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {invoiceSearch && (
                      <button
                        onClick={() => setInvoiceSearch("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
                    {(["all", "pending", "paid"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setInvoiceStatusFilter(s)}
                        className={`px-3 py-2 font-medium transition-colors ${
                          invoiceStatusFilter === s
                            ? "bg-blue-600 text-white"
                            : "bg-white text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        {s === "all" ? "전체" : s === "pending" ? "미처리" : "입금완료"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const q = invoiceSearch.trim().toLowerCase();
                const filtered = taxInvoices.filter((inv) => {
                  const matchStatus =
                    invoiceStatusFilter === "all" || inv.status === invoiceStatusFilter;
                  const matchSearch =
                    !q ||
                    (inv.supplier_name || "").toLowerCase().includes(q) ||
                    (inv.payer_name || "").toLowerCase().includes(q) ||
                    (inv.note || "").toLowerCase().includes(q) ||
                    (inv.platform || "").toLowerCase().includes(q) ||
                    (inv.invoice_number || "").toLowerCase().includes(q) ||
                    (inv.supplier_biz_no || "").replace(/-/g, "").includes(q.replace(/-/g, ""));
                  return matchStatus && matchSearch;
                });
                return (
              <div className="overflow-x-auto">
                {q && (
                  <p className="mb-3 text-sm text-slate-500">
                    <span className="font-semibold text-blue-600">"{invoiceSearch}"</span> 검색 결과{" "}
                    <span className="font-bold">{filtered.length}건</span>
                    {filtered.length === 0 && " — 일치하는 세금계산서가 없습니다."}
                  </p>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>발행일</TableHead>
                      <TableHead>발행출처</TableHead>
                      <TableHead>공급자 (상호명)</TableHead>
                      <TableHead className="text-right">합계금액</TableHead>
                      <TableHead>입금자</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead className="text-right">관리</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((inv) => (
                      <TableRow
                        key={inv.id}
                        className="cursor-pointer hover:bg-blue-50 transition-colors"
                        onClick={() => openInvoiceModal(inv)}
                      >
                        <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                          {inv.issue_date || "?"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs whitespace-nowrap">{inv.platform || "기타"}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">
                            {q && (inv.supplier_name || "").toLowerCase().includes(q)
                              ? <HighlightText text={inv.supplier_name || "-"} query={invoiceSearch} />
                              : inv.supplier_name || "-"}
                          </div>
                          <div className="text-xs text-slate-400">{inv.supplier_biz_no || ""}</div>
                        </TableCell>
                        <TableCell className="text-right font-bold whitespace-nowrap">
                          {inv.total_amount ? `${Number(inv.total_amount).toLocaleString()}원` : "-"}
                        </TableCell>
                        <TableCell>
                          {inv.payer_name ? (
                            <div>
                              <div className="text-sm font-medium text-green-700">
                                {q && inv.payer_name.toLowerCase().includes(q)
                                  ? <HighlightText text={inv.payer_name} query={invoiceSearch} />
                                  : inv.payer_name}
                              </div>
                              {inv.pay_memo && <div className="text-xs text-slate-400 truncate max-w-[120px]">{inv.pay_memo}</div>}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-300">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {inv.status === "paid" ? (
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-100 whitespace-nowrap">
                              <DollarSign className="h-3 w-3 mr-1" />입금완료
                            </Badge>
                          ) : (
                            <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">미처리</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-slate-500 hover:text-blue-600"
                              onClick={(e) => { e.stopPropagation(); openInvoiceModal(inv); }}
                              title="상세 보기"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-slate-400 hover:text-red-600"
                              onClick={(e) => deleteInvoice(e, inv.id)}
                              title="삭제"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-slate-400">
                          {q || invoiceStatusFilter !== "all"
                            ? "검색 조건에 맞는 세금계산서가 없습니다."
                            : "수집된 세금계산서가 없습니다."}
                          <br />
                          {!q && invoiceStatusFilter === "all" && (
                            <span className="text-xs">Python 봇을 실행하면 자동으로 수집됩니다.</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
                );
              })()}
            </CardContent>
          </Card>
        </>
      )}
      </div>

      {/* 문의 상세 모달 */}
      {selectedInquiry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedInquiry(null)}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between bg-blue-600 px-6 py-4">
              <h2 className="text-lg font-bold text-white">문의 상세 내용</h2>
              <button onClick={() => setSelectedInquiry(null)} className="text-white/80 hover:text-white transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 모달 내용 */}
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                {selectedInquiry.status === "completed" ? (
                  <Badge className="bg-green-100 text-green-700">완료</Badge>
                ) : selectedInquiry.status === "contacted" ? (
                  <Badge className="bg-blue-100 text-blue-700">연락중</Badge>
                ) : (
                  <Badge className="bg-orange-100 text-orange-700">대기</Badge>
                )}
                <span className="text-xs text-slate-400">{new Date(selectedInquiry.createdAt).toLocaleString()}</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-1">회사명</p>
                  <p className="font-bold text-slate-800">{selectedInquiry.companyName}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-1">담당자</p>
                  <p className="font-medium text-slate-800">{selectedInquiry.managerName}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-1">이메일</p>
                  <p className="font-medium text-slate-800">{selectedInquiry.email}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-1">연락처</p>
                  <p className="font-medium text-slate-800">{selectedInquiry.phone}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-1">품목</p>
                  <p className="font-medium text-slate-800">{selectedInquiry.items}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-1">문의 내용</p>
                  <p className="text-slate-700 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap text-sm leading-relaxed">{selectedInquiry.content}</p>
                </div>
              </div>

              {/* 상태 변경 버튼 */}
              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <Button size="sm" variant="outline" className="flex-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                  onClick={() => { updateStatus(selectedInquiry.id, "contacted"); setSelectedInquiry({...selectedInquiry, status: "contacted"}); }}>
                  <Clock className="h-4 w-4 mr-1" /> 연락중
                </Button>
                <Button size="sm" variant="outline" className="flex-1 text-green-600 border-green-200 hover:bg-green-50"
                  onClick={() => { updateStatus(selectedInquiry.id, "completed"); setSelectedInquiry({...selectedInquiry, status: "completed"}); }}>
                  <CheckCircle className="h-4 w-4 mr-1" /> 완료 처리
                </Button>
                <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => { deleteInquiry(selectedInquiry.id); setSelectedInquiry(null); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 세금계산서 상세 모달 */}
      {selectedInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => { setSelectedInvoice(null); setPayConfirm(null); }}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between bg-blue-600 px-6 py-4 shrink-0">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Receipt className="h-5 w-5" /> 세금계산서 상세
              </h2>
              <div className="flex items-center gap-3">
                <Badge className={selectedInvoice.status === "paid"
                  ? "bg-green-400 text-white"
                  : "bg-orange-400 text-white"}>
                  {selectedInvoice.status === "paid" ? "입금완료" : "미처리"}
                </Badge>
                <button onClick={() => { setSelectedInvoice(null); setPayConfirm(null); }} className="text-white/80 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              {/* 기본 정보 */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[
                  ["발행출처", selectedInvoice.platform],
                  ["발행일자", selectedInvoice.issue_date],
                  ["승인번호", selectedInvoice.invoice_number || "-"],
                  ["공급자", selectedInvoice.supplier_name || "-"],
                  ["사업자번호", selectedInvoice.supplier_biz_no || "-"],
                  ["공급가액", selectedInvoice.supply_amount ? `${Number(selectedInvoice.supply_amount).toLocaleString()}원` : "-"],
                  ["세액", selectedInvoice.tax_amount ? `${Number(selectedInvoice.tax_amount).toLocaleString()}원` : "-"],
                  ["합계금액", selectedInvoice.total_amount ? `${Number(selectedInvoice.total_amount).toLocaleString()}원` : "-"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs font-semibold text-slate-400 uppercase mb-0.5">{label}</p>
                    <p className="font-semibold text-slate-800">{value}</p>
                  </div>
                ))}
                <div className="col-span-2">
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-0.5">비고</p>
                  <p className="text-slate-700 bg-slate-50 rounded p-2 text-sm">{selectedInvoice.note || "-"}</p>
                </div>
              </div>

              {/* 스크린샷 뷰어 */}
              {selectedInvoice.screenshot_urls?.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 flex items-center justify-between text-sm text-slate-600 font-medium">
                    <span>원본 이미지 ({invoiceImageIdx + 1} / {selectedInvoice.screenshot_urls.length})</span>
                    <div className="flex gap-2">
                      <button
                        className="p-1 rounded hover:bg-slate-200 disabled:opacity-30"
                        disabled={invoiceImageIdx === 0}
                        onClick={() => setInvoiceImageIdx((i) => i - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        className="p-1 rounded hover:bg-slate-200 disabled:opacity-30"
                        disabled={invoiceImageIdx === selectedInvoice.screenshot_urls.length - 1}
                        onClick={() => setInvoiceImageIdx((i) => i + 1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <button
                        className="p-1 rounded hover:bg-slate-200"
                        onClick={() => setZoomedImage(selectedInvoice.screenshot_urls[invoiceImageIdx])}
                      >
                        <ZoomIn className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <img
                    src={selectedInvoice.screenshot_urls[invoiceImageIdx]}
                    alt="세금계산서 캡처"
                    className="w-full object-contain max-h-72 cursor-zoom-in"
                    onClick={() => setZoomedImage(selectedInvoice.screenshot_urls[invoiceImageIdx])}
                  />
                </div>
              )}

              {/* 입금 처리 폼 */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
                <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                  <DollarSign className="h-4 w-4 text-green-600" /> 입금 처리
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">입금자 이름</label>
                    <input
                      type="text"
                      value={payerName}
                      onChange={(e) => setPayerName(e.target.value)}
                      placeholder="홍길동"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">입금 메모</label>
                    <input
                      type="text"
                      value={payMemo}
                      onChange={(e) => setPayMemo(e.target.value)}
                      placeholder="4월 운임 정산"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  {/* 입금 완료 버튼 */}
                  <Button
                    onClick={() => setPayConfirm("pay")}
                    disabled={payLoading}
                    className="flex-1 font-bold bg-blue-600 hover:bg-blue-700"
                  >
                    {payLoading && payConfirm === null
                      ? "처리 중..."
                      : selectedInvoice.status === "paid"
                      ? "✓ 입금정보 수정"
                      : "입금 완료 처리"}
                  </Button>

                  {/* 입금 취소 버튼 (입금완료 상태일 때만 표시) */}
                  {selectedInvoice.status === "paid" && (
                    <Button
                      onClick={() => setPayConfirm("cancel")}
                      disabled={payLoading}
                      variant="outline"
                      className="font-bold text-red-600 border-red-300 hover:bg-red-50"
                    >
                      입금 취소
                    </Button>
                  )}
                </div>

                {/* 지급 승인 확인 다이얼로그 */}
                {payConfirm === "pay" && (
                  <div className="border border-blue-200 rounded-xl bg-blue-50 p-4 space-y-3">
                    <p className="text-sm font-bold text-blue-800">지급 승인 확인</p>
                    <div className="text-sm text-blue-700 space-y-1">
                      <p>• 공급자: <span className="font-semibold">{selectedInvoice.supplier_name || "-"}</span></p>
                      <p>• 합계금액: <span className="font-semibold">{selectedInvoice.total_amount ? `${Number(selectedInvoice.total_amount).toLocaleString()}원` : "-"}</span></p>
                      <p>• 입금자: <span className="font-semibold">{payerName || "(미입력)"}</span></p>
                      <p>• 메모: <span className="font-semibold">{payMemo || "(없음)"}</span></p>
                    </div>
                    <p className="text-xs text-blue-600">위 내용으로 입금 완료 처리하시겠습니까?</p>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handlePayment(selectedInvoice)}
                        disabled={payLoading}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 font-bold"
                      >
                        {payLoading ? "처리 중..." : "확인 - 입금 완료"}
                      </Button>
                      <Button
                        onClick={() => setPayConfirm(null)}
                        variant="outline"
                        className="flex-1"
                      >
                        취소
                      </Button>
                    </div>
                  </div>
                )}

                {/* 지급 취소 확인 다이얼로그 */}
                {payConfirm === "cancel" && (
                  <div className="border border-red-200 rounded-xl bg-red-50 p-4 space-y-3">
                    <p className="text-sm font-bold text-red-800">입금 취소 확인</p>
                    <div className="text-sm text-red-700 space-y-1">
                      <p>• 공급자: <span className="font-semibold">{selectedInvoice.supplier_name || "-"}</span></p>
                      <p>• 합계금액: <span className="font-semibold">{selectedInvoice.total_amount ? `${Number(selectedInvoice.total_amount).toLocaleString()}원` : "-"}</span></p>
                    </div>
                    <p className="text-xs text-red-600 font-medium">입금 완료 상태를 취소하고 미처리로 되돌립니다.</p>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handlePayCancel(selectedInvoice)}
                        disabled={payLoading}
                        className="flex-1 bg-red-600 hover:bg-red-700 font-bold"
                      >
                        {payLoading ? "처리 중..." : "확인 - 입금 취소"}
                      </Button>
                      <Button
                        onClick={() => setPayConfirm(null)}
                        variant="outline"
                        className="flex-1"
                      >
                        닫기
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* 원본 링크 */}
              {selectedInvoice.source_url && (
                <a
                  href={selectedInvoice.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-blue-500 hover:underline truncate"
                >
                  원본 URL: {selectedInvoice.source_url}
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 이미지 전체화면 줌 */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 cursor-zoom-out"
          onClick={() => setZoomedImage(null)}
        >
          <img src={zoomedImage} alt="확대 보기" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
          <button className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={() => setZoomedImage(null)}>
            <X className="h-8 w-8" />
          </button>
        </div>
      )}
    </div>
  );
}
