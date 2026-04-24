/**
 * useStaffProfile
 *
 * 담당자 이름을 localStorage + Firestore 양쪽에 동기화하는 훅.
 * - 브라우저마다 고유한 deviceId(UUID)를 생성해 staff_profiles/{deviceId} 에 저장
 * - 앱 시작 시 Firestore → localStorage 방향으로 최신값을 가져옴
 * - 이름 저장 시 localStorage + Firestore 동시 기록
 * - 오프라인이어도 localStorage 값으로 동작
 */

import { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

// ─────────────────────────────────────────────────────────────
// localStorage 키
// ─────────────────────────────────────────────────────────────
const USERNAME_KEY  = "settlement_username";
const DEVICE_ID_KEY = "settlement_device_id";

// ─────────────────────────────────────────────────────────────
// 기기별 고유 ID 생성 (브라우저 재시작해도 유지)
// ─────────────────────────────────────────────────────────────
function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id =
      typeof crypto?.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// ─────────────────────────────────────────────────────────────
// 훅
// ─────────────────────────────────────────────────────────────
export interface StaffProfile {
  username: string;
  deviceId: string;
  syncing: boolean;
  /** 이름 저장 (localStorage + Firestore 동시) */
  save: (name: string) => Promise<void>;
}

export function useStaffProfile(): StaffProfile {
  const deviceId = getDeviceId();
  const [username, setUsername] = useState<string>(
    () => localStorage.getItem(USERNAME_KEY) ?? ""
  );
  const [syncing, setSyncing] = useState(false);

  // ── 앱 시작 시 Firestore → localStorage 동기화 ──
  useEffect(() => {
    const syncFromFirestore = async () => {
      try {
        const snap = await getDoc(doc(db, "staff_profiles", deviceId));
        if (snap.exists()) {
          const data = snap.data();
          const name = data.username as string;
          if (name && name !== username) {
            localStorage.setItem(USERNAME_KEY, name);
            setUsername(name);
          }
          // last_active 갱신
          await setDoc(
            doc(db, "staff_profiles", deviceId),
            { last_active: serverTimestamp() },
            { merge: true }
          );
        }
      } catch {
        // 오프라인 or 권한 없음 → localStorage 값 유지
      }
    };
    syncFromFirestore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 이름 저장 ──
  const save = async (name: string) => {
    const trimmed = name.trim();
    // 1) localStorage 즉시 저장 (오프라인 fallback)
    localStorage.setItem(USERNAME_KEY, trimmed);
    setUsername(trimmed);

    // 2) Firestore 비동기 저장
    setSyncing(true);
    try {
      await setDoc(
        doc(db, "staff_profiles", deviceId),
        {
          username:     trimmed,
          device_id:    deviceId,
          last_active:  serverTimestamp(),
          updated_at:   serverTimestamp(),
        },
        { merge: true }
      );
    } catch {
      // Firestore 저장 실패해도 localStorage에는 저장됨
    } finally {
      setSyncing(false);
    }
  };

  return { username, deviceId, syncing, save };
}
