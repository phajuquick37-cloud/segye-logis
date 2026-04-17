import React, { useState, useEffect } from "react";
import { auth, db } from "../lib/firebase";
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { LogIn, LogOut, Trash2, CheckCircle, Clock } from "lucide-react";

export default function Admin() {
  const [user, setUser] = useState<any>(null);
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Admin email check (as defined in rules)
  const isAdmin = user?.email === "phajuquick37@gmail.com";

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      const q = query(collection(db, "inquiries"), orderBy("createdAt", "desc"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setInquiries(docs);
      });
      return () => unsubscribe();
    }
  }, [isAdmin]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const updateStatus = async (id: string, status: string) => {
    try {
      await updateDoc(doc(db, "inquiries", id), { status });
    } catch (error) {
      console.error("Update failed", error);
    }
  };

  const deleteInquiry = async (id: string) => {
    if (window.confirm("정말 삭제하시겠습니까?")) {
      try {
        await deleteDoc(doc(db, "inquiries", id));
      } catch (error) {
        console.error("Delete failed", error);
      }
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
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-slate-900">데이터 관리 센터</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-600">{user.email} (관리자)</span>
            <Button onClick={handleLogout} variant="ghost" size="sm">
              <LogOut className="mr-2 h-4 w-4" /> 로그아웃
            </Button>
          </div>
        </div>

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
                {inquiries.filter(i => i.status === "pending" || !i.status).length}건
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">처리 완료</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {inquiries.filter(i => i.status === "completed").length}건
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
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="text-blue-600"
                            onClick={() => updateStatus(item.id, "contacted")}
                          >
                            <Clock className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="text-green-600"
                            onClick={() => updateStatus(item.id, "completed")}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="text-red-600"
                            onClick={() => deleteInquiry(item.id)}
                          >
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
      </div>
    </div>
  );
}
