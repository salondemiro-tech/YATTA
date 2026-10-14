// YATTA 清掃管理システム — core.js
import { Timestamp, collection, deleteField, doc, getDocsFromServer, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, inMemoryPersistence, initializeAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { MY, bi, bl, isMy, tr } from "./i18n.js";
import { spClick } from "./app.js";

// ===== Firebase の設定（Firebaseコンソールの値を貼り付け） =====
export const firebaseConfig = {
  apiKey: "AIzaSyAHPEE7OyDeVNIkdBliCPJp4gfesIb91KQ",
  authDomain: "yatta-b4269.firebaseapp.com",
  projectId: "yatta-b4269",
  storageBucket: "yatta-b4269.firebasestorage.app",
  messagingSenderId: "180732265248",
  appId: "1:180732265248:web:128ba326628d736db40d45"
};

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

// 管理者が社員アカウントを作るための2つ目の認証（作成しても管理者自身のログインは切れない）
export let auth2 = null;

export function adminAuth() {
  if (!auth2) auth2 = initializeAuth(initializeApp(firebaseConfig, "yatta-admin"), { persistence: inMemoryPersistence });
  return auth2;
}

export const KEEP_DAYS = 30;       // 履歴画面で見られる日数

export const LOG_KEEP_DAYS = 90;   // 操作履歴の保存日数（仮。確定後に変更）

export const EMAIL_DOMAIN = "yatta.local"; // 社員番号をログイン用のメール形式に変換（実際にメールは送られない）

export const EMP_RE = /^[A-Za-z0-9_-]{1,32}$/;

export const JST = 9 * 3600 * 1000; // 日付・時刻はすべて日本時間で判定（端末の時刻設定に依存しない）

export const $ = id => document.getElementById(id);

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const pad = n => String(n).padStart(2, "0");

export const ymdU = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export const ymdParts = s => String(s).split("-").map(Number);

export const T = () => ymdU(new Date(Date.now() + JST));

export const shiftYmd = (s, n) => { const [y, m, d] = ymdParts(s); return ymdU(new Date(Date.UTC(y, m - 1, d + n))); };

export const T1 = () => shiftYmd(T(), 1);

export const now = () => serverTimestamp();

export const expireAfter = (s, days) => { const [y, m, d] = ymdParts(s); return Timestamp.fromMillis(Date.UTC(y, m - 1, d + days) - JST); };

export const expireFor = s => expireAfter(s, KEEP_DAYS + 2);

export const empEmail = no => `${no}@${EMAIL_DOMAIN}`;

export const normNo = s => String(s || "").normalize("NFKC").trim();

export const notice = m => `<p class="notice">${m}</p>`;

export const bind = (id, fn) => { const e = $(id); if (e) e.onclick = fn; };

export const fail = e => toast("保存に失敗しました: " + (e && e.code ? e.code : e));

export function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

export function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

export function md(s) { if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return ""; const [y, m, d] = ymdParts(s); return `${m}/${d}(${"日月火水木金土"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`; }

export const hm = ms => { const d = new Date(ms + JST); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };

export function tm(t) { return t && t.toMillis ? hm(t.toMillis()) : "送信中"; }

export const ROOM_TYPES = ["S", "D", "T", "TR"];

export const VIEWS = { home: "トップ", sched: "清掃日程表", spin: "特別対応指示表", board: "清掃ボード", report: "特別対応完了報告", hist: "履歴" };

export const DEPT = { front: "フロント", hk: "管理課" };

export const S = {
  me: null, role: null, staff: "", lang: lsGet("yatta_lang") === "my" ? "my" : "ja",
  today: T(), tomorrow: T1(), target: null,
  cfg: { floors: {}, types: {} }, roomFloor: {}, users: [],
  days: {}, open: [], openByRoom: {}, doneToday: [],
  view: "home", pen: "red", floorSel: "all", onlyOpen: false,
  hist: { date: null, loading: false, day: {}, sps: [] },
  unsub: {},
  sync: { pending: 0, err: null, last: null }, meta: {}
};

export let toastTimer;

export function toast(m) { const t = $("toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2600); }

// 確認ダイアログ（ブラウザ標準の confirm は「ダイアログを表示しない」を押すと以後すべて自動でキャンセルされるため使わない）
export function uiConfirm(msg, okOnly) {
  return new Promise(res => {
    $("dlgMsg").textContent = msg;
    $("dlgCancel").textContent = bl("キャンセル");
    $("dlgCancel").classList.toggle("hidden", !!okOnly);
    $("dlgBg").classList.remove("hidden");
    const done = v => { $("dlgBg").classList.add("hidden"); $("dlgOk").onclick = $("dlgCancel").onclick = null; res(v); };
    $("dlgOk").onclick = () => done(true);
    $("dlgCancel").onclick = () => done(false);
  });
}

export function show(id) { ["loginView", "appView", "settingsView"].forEach(v => $(v).classList.toggle("hidden", v !== id)); }

// ===== 部屋番号 =====
// bad を渡すと、読み取れない範囲指定（逆順・300室超）をそこに入れる
export function parseRooms(s, bad) {
  const out = [];
  for (const tok of String(s).normalize("NFKC").split(/[\s,、]+/)) {
    if (!tok) continue;
    const m = tok.match(/^(\d+)[-~〜ー](\d+)$/);
    if (m) {
      const a = +m[1], b = +m[2], w = m[1].length;
      if (b >= a && b - a <= 300) for (let i = a; i <= b; i++) out.push(String(i).padStart(w, "0"));
      else if (bad) bad.push(tok);
    } else out.push(tok);
  }
  return [...new Set(out)];
}

export function compress(rooms) {
  const out = []; let i = 0;
  const num = s => /^\d+$/.test(s);
  while (i < rooms.length) {
    let j = i;
    while (j + 1 < rooms.length && num(rooms[j]) && num(rooms[j + 1]) && +rooms[j + 1] === +rooms[j] + 1 && rooms[j + 1].length === rooms[i].length) j++;
    if (j > i + 1) out.push(`${rooms[i]}-${rooms[j]}`);
    else if (j === i + 1) out.push(rooms[i], rooms[j]);
    else out.push(rooms[i]);
    i = j + 1;
  }
  return out.join(", ");
}

export function floorsSorted() {
  return Object.keys(S.cfg.floors).sort((a, b) => ((parseFloat(a) || 0) - (parseFloat(b) || 0)) || a.localeCompare(b));
}

export function visibleFloors() {
  const fs = floorsSorted();
  if (S.floorSel !== "all" && !fs.includes(S.floorSel)) S.floorSel = "all";
  return S.floorSel === "all" ? fs : [S.floorSel];
}

export const roomNum = r => parseFloat(r) || 0;

export const bySp = (a, b) => (a.date || "").localeCompare(b.date || "") || (roomNum(a.room) - roomNum(b.room)) || String(a.room).localeCompare(String(b.room));

// ===== 状態 =====
export const dayOf = d => S.days[d] || {};

export const st = (f, r, d = S.today) => { const o = dayOf(d); return (o[f] && o[f][r]) || {}; };

export const isOpenRoom = (f, r) => { const x = st(f, r); return (x.s && x.s !== "yellow" && !x.doneBy) || (S.openByRoom[r] || []).length > 0; };

export const sOf = pen => pen === "green" ? "green" : pen === "yellow" ? "yellow" : "red";

export const curPen = x => !x.s ? null : (x.s === "red" && x.co ? "co" : x.s);

export const defaultTarget = () => S.today; // 日程表は 23:59 まで今日を初期表示（明日は手動で切替）

// pen: "red"（連泊清掃）/ "co"（チェックアウト清掃・管理課には赤で表示）/ "green" / null（未入力）
export function stateData(pen) {
  if (!pen) return { s: deleteField(), co: deleteField(), setBy: deleteField(), setAt: deleteField(), doneBy: deleteField(), doneAt: deleteField() };
  return { s: sOf(pen), co: pen === "co" ? true : deleteField(), setBy: S.staff, setAt: now(), doneBy: deleteField(), doneAt: deleteField() };
}

export function stateLabel(x) {
  if (!x.s) return bi("未入力");
  if (x.s === "yellow") return `${tr("未清掃・清掃不要")}${x.setBy ? `（${tr("指示")}：${esc(x.setBy)} ${tm(x.setAt)}）` : ""}`;
  const base = x.s === "red" ? "要清掃" : "清掃なし（タオル補充）";
  let t = x.s === "red" ? (x.co && S.role === "front" ? "要清掃（C/O）" : "要清掃") : base;
  if (x.setBy) t += `（指示：${esc(x.setBy)} ${tm(x.setAt)}）`;
  t += x.doneBy ? ` → 完了：${esc(x.doneBy)} ${tm(x.doneAt)}` : " → 未完了";
  if (isMy()) return `${MY[base]}${x.setBy ? `（${MY["指示"]}：${esc(x.setBy)} ${tm(x.setAt)}）` : ""} → ${x.doneBy ? `${MY["完了"]}：${esc(x.doneBy)} ${tm(x.doneAt)}` : MY["未完了"]}`;
  return t;
}

// 操作履歴に残す部屋の状態（変更前・変更後）
export const snapState = x => ({ s: x.s || null, co: !!x.co, done: x.doneBy || null });

export const penAfter = pen => ({ s: pen ? sOf(pen) : null, co: pen === "co", done: null });

export const roomItem = (f, r, pen) => ({ f, r, data: stateData(pen), a: penAfter(pen) });

// ===== 同期状態 =====
// 書き込みはすべて track() を通す。サーバー反映まで「同期中」、失敗したら「同期エラー」
export function track(p) {
  S.sync.pending++; syncUI();
  return p.then(() => { S.sync.pending--; S.sync.err = null; S.sync.last = Date.now(); syncUI(); return true; },
    e => { S.sync.pending--; S.sync.err = (e && e.code) || String(e); syncUI(); fail(e); return false; });
}

export function setMeta(key, snap) {
  S.meta[key] = { c: snap.metadata.fromCache, p: snap.metadata.hasPendingWrites };
  if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites) S.sync.last = Date.now();
  syncUI();
}

export const hasPending = () => S.sync.pending > 0 || Object.values(S.meta).some(m => m.p);

export function syncUI() {
  const el = $("syncBadge"); if (!el) return;
  const ms = Object.values(S.meta);
  const cache = ms.some(m => m.c), pend = hasPending();
  const n = S.sync.pending ? ` ${S.sync.pending}件` : "";
  let cls, txt;
  if (S.sync.err) { cls = "err"; txt = "同期エラー"; }
  else if (!navigator.onLine) { cls = "off"; txt = pend ? `オフライン・未送信${n || "あり"}` : "オフライン"; }
  else if (cache) { cls = "off"; txt = "接続中…"; }
  else if (pend) { cls = "busy"; txt = "同期中" + n; }
  else { cls = "ok"; txt = "同期済み" + (S.sync.last ? " " + hm(S.sync.last) : ""); }
  const k = cls === "err" ? "同期エラー" : !navigator.onLine ? (pend ? "未送信" : "オフライン") : cache ? "接続中…" : pend ? "同期中" : "同期済み";
  el.className = "sync " + cls; el.textContent = isMy() ? MY[k] + (cls === "ok" && S.sync.last ? " " + hm(S.sync.last) : "") : txt;
}

// ===== 書き込み＋操作履歴 =====
// データの変更と操作履歴（logs）は同じバッチで書き込む（片方だけ保存されることはない）
export function addLog(batch, data) {
  batch.set(doc(collection(db, "logs")), { ...data, uid: S.me.uid, name: S.staff, at: serverTimestamp(), expireAt: expireAfter(T(), LOG_KEEP_DAYS) });
}

// items: [{ f, r, data, a, b? }]  1フロア＝1ドキュメント、操作履歴もフロアごとに1件
export function writeRooms(d, type, items) {
  if (!items.length) return Promise.resolve(false);
  const byF = {};
  items.forEach(it => { (byF[it.f] = byF[it.f] || []).push(it); });
  const batch = writeBatch(db), expireAt = expireFor(d);
  for (const [f, list] of Object.entries(byF)) {
    const rooms = {}, changes = {};
    list.forEach(it => { rooms[it.r] = it.data; changes[it.r] = { b: it.b || snapState(st(f, it.r, d)), a: it.a }; });
    batch.set(doc(db, "days", d, "floors", f), { rooms, expireAt }, { merge: true });
    addLog(batch, { kind: "room", type, date: d, floor: f, rooms: Object.keys(changes), changes });
  }
  return track(batch.commit());
}

export async function serverDay(d) {
  const snap = await getDocsFromServer(collection(db, "days", d, "floors"));
  const o = {}; snap.forEach(s => { o[s.id] = s.data().rooms || {}; });
  return o;
}

// ===== シート =====
export function openSheetHTML(h) { $("sheet").innerHTML = h; $("sheetBg").classList.remove("hidden"); bind("shClose", closeSheet); }

export function closeSheet() { $("sheetBg").classList.add("hidden"); }

// ===== 起動時の設定（イベントの登録など） =====
export function init_core() {
  $("syncBadge").onclick = () => {
    if (S.sync.err) { uiConfirm(`保存に失敗した操作があります（${S.sync.err}）。\n画面の状態を確認し、必要なら入力し直してください。`, true); S.sync.err = null; syncUI(); }
    else toast($("syncBadge").textContent);
  };

  window.addEventListener("online", syncUI);

  window.addEventListener("offline", syncUI);

  $("sheetBg").onclick = e => { if (e.target === $("sheetBg")) closeSheet(); };

  $("sheet").addEventListener("click", spClick);
}

