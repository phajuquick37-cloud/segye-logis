import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from "../../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);
// (default) Firestore DB 사용 — 보안 규칙이 배포된 데이터베이스
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
