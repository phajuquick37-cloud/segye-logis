import React, { useState, useEffect, useRef } from "react";
import { auth, db, storage } from "../lib/firebase";
import { onAuthStateChanged, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut } from "firebase/auth";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { LogIn, LogOut, Trash2, CheckCircle, Clock, PlusCircle, FileUp, X } from "lucide-react";

type Tab = "inquiries" | "notices";

const CATEGORIES = ["공지", "안내", "이벤트", "긴급"];

export default function Admin() {
  const [user, setUser] = useState<any>(null);
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [notices, setNotices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("inquiries");

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

  const isAdmin = user?.email === "phajuquick37@gmail.com";

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

    return () => { unsub1(); unsub2(); };
  }, [isAdmin]);

  const handleLogin = async () => {
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

  if (!user) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">관리자 로그인</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-center text-slate-500">관리자 계정으로 로그인하여 데이터를 확인하세요.</p>
            <Button onClick={handleLogin} className="h-12 bg-blue-600 hover:bg-blue-700">
              <LogIn className="mr-2 h-5 w-5" /> Google로 로그인
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md text-center p-8">
          <h2 className="text-2xl font-bold text-red-600 mb-4">접근 권한 없음</h2>
          <p className="text-slate-600 mb-6">관리자 권한이 있는 계정으로 로그인해주세요.</p>
          <Button onClick={handleLogout} variant="outline">다른 계정으로 로그인</Button>
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

        {/* 탭 */}
        <div className="flex gap-2 border-b border-slate-200">
          <button
            onClick={() => setTab("inquiries")}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === "inquiries"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            접수 문의 관리
          </button>
          <button
            onClick={() => setTab("notices")}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === "notices"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            공지사항 관리
          </button>
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
                        <TableRow key={item.id}>
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
                              <Button size="sm" variant="ghost" className="text-blue-600" onClick={() => updateStatus(item.id, "contacted")}>
                                <Clock className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" className="text-green-600" onClick={() => updateStatus(item.id, "completed")}>
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteInquiry(item.id)}>
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
      </div>
    </div>
  );
}
