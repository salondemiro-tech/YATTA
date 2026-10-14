// YATTA 清掃管理システム — app.js
import { clearIndexedDbPersistence, collection, doc, onSnapshot, query, terminate, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { $, DEPT, EMP_RE, KEEP_DAYS, S, T, T1, VIEWS, auth, bySp, closeSheet, dayOf, db, defaultTarget, empEmail, esc, floorsSorted, hasPending, lsGet, lsSet, md, normNo, notice, pad, setMeta, shiftYmd, show, st, syncUI, tm, toast, uiConfirm } from "./core.js";
import { MY, bi, bl, cnt, isMy, tr } from "./i18n.js";
import { renderSched } from "./schedule.js";
import { renderReport, renderSpin, spSheet } from "./specials.js";
import { renderBoard } from "./board.js";
import { loadHist, renderHist } from "./history.js";
import { renderUsers, updateSetInfo } from "./settings.js";
import { init_core } from "./core.js";
import { init_schedule } from "./schedule.js";
import { init_specials } from "./specials.js";
import { init_board } from "./board.js";
import { init_history } from "./history.js";
import { init_settings } from "./settings.js";

export function stop(k) { if (S.unsub[k]) { S.unsub[k](); S.unsub[k] = null; } }

export function cleanup() {
  Object.keys(S.unsub).forEach(stop);
  S.me = null; S.days = {}; S.open = []; S.openByRoom = {}; S.doneToday = []; S.users = []; S.meta = {};
  closeSheet(); syncUI();
}

// ログアウト時は端末内のキャッシュも消す（共用・紛失時の対策）
export async function logout() {
  if (hasPending() && !(await uiConfirm("まだ送信されていない操作があります。ログアウトすると失われます。ログアウトしますか？"))) return;
  if (!hasPending() && !(await uiConfirm(tr("ログアウトしますか？")))) return;
  try { await signOut(auth); } catch (e) { /* ignore */ }
  try { await terminate(db); await clearIndexedDbPersistence(db); } catch (e) { /* ignore */ }
  try { localStorage.removeItem("yatta_view"); } catch (e) { /* ignore */ }
  location.reload();
}

// ===== リスナー =====
export function listenCfg() {
  S.unsub.cfg = onSnapshot(doc(db, "config", "hotel"), { includeMetadataChanges: true }, snap => {
    setMeta("cfg", snap);
    const d = snap.data() || {};
    S.cfg = { floors: d.floors || {}, types: d.types || {} };
    S.roomFloor = {};
    for (const [f, rooms] of Object.entries(S.cfg.floors)) rooms.forEach(r => { S.roomFloor[r] = f; });
    if (!$("settingsView").classList.contains("hidden")) updateSetInfo();
    render();
  }, e => toast("設定の読み込みに失敗しました: " + e.code));
}

export function listenUsers() {
  S.unsub.users = onSnapshot(collection(db, "users"), snap => {
    S.users = snap.docs.map(x => ({ uid: x.id, ...x.data() }))
      .sort((a, b) => String(a.empNo).localeCompare(String(b.empNo), "ja", { numeric: true }));
    if (!$("settingsView").classList.contains("hidden")) renderUsers();
  }, e => toast("社員一覧の読み込みに失敗しました: " + e.code));
}

export let openInit = false;

export function listenOpen() {
  openInit = false;
  S.unsub.open = onSnapshot(query(collection(db, "specials"), where("done", "==", false)), { includeMetadataChanges: true }, snap => {
    setMeta("open", snap);
    if (openInit && !snap.docChanges().length) return;
    openInit = true;
    S.open = snap.docs.map(x => ({ id: x.id, ...x.data() })).sort(bySp);
    S.openByRoom = {};
    S.open.forEach(sp => { (S.openByRoom[sp.room] = S.openByRoom[sp.room] || []).push(sp); });
    render();
  }, e => toast("特別対応の読み込みに失敗しました: " + e.code));
}

export function listenDays() {
  stop("d0"); stop("d1"); stop("doneSp");
  delete S.meta.d0; delete S.meta.d1; delete S.meta.doneSp;
  S.today = T(); S.tomorrow = T1(); S.days = {}; S.doneToday = [];
  if (!S.target || S.target < S.today || S.target > S.tomorrow) S.target = defaultTarget();
  [S.today, S.tomorrow].forEach((d, i) => {
    S.unsub["d" + i] = onSnapshot(collection(db, "days", d, "floors"), { includeMetadataChanges: true }, snap => {
      setMeta("d" + i, snap);
      if (S.days[d] && !snap.docChanges().length) return; // 同期状態だけの変化なら再描画しない
      const o = {}; snap.forEach(s => { o[s.id] = s.data().rooms || {}; });
      S.days[d] = o; render();
    }, e => toast("読み込みに失敗しました: " + e.code));
  });
  let doneInit = false;
  S.unsub.doneSp = onSnapshot(query(collection(db, "specials"), where("doneDate", "==", S.today)), { includeMetadataChanges: true }, snap => {
    setMeta("doneSp", snap);
    if (doneInit && !snap.docChanges().length) return;
    doneInit = true;
    S.doneToday = snap.docs.map(x => ({ id: x.id, ...x.data() })).sort(bySp);
    render();
  }, e => toast("読み込みに失敗しました: " + e.code));
}

// 日付（日本時間）が変わったら当日分に切替。10秒ごと＋画面復帰時に確認
export function rollDay() {
  if (!S.me || T() === S.today) return false;
  listenDays(); setDateRange();
  if (S.view === "hist" && S.hist.date) loadHist();
  render();
  return true;
}

// ===== 画面切替 =====
export function updateWho() {
  $("who").textContent = `${DEPT[S.role]}：${S.staff}${S.me.admin ? "（管理者）" : ""}`;
  $("homeBtn").innerHTML = bi("トップ");
  syncUI();
  $("switchBtn").classList.toggle("hidden", !S.me.admin);
  $("langBtn").classList.toggle("hidden", S.role !== "hk");
  $("langBtn").textContent = S.lang === "my" ? "日本語" : "မြန်မာ";
}

export function startApp() {
  show("appView");
  updateWho();
  setDateRange();
  go("home");
}

// 言語の切り替え（管理課の画面とログイン画面）。端末ごとに記憶する
export function setLang(l) { S.lang = l; lsSet("yatta_lang", l); applyLoginLang(); }

export function applyLoginLang() {
  const m = S.lang === "my";
  $("loginLang").textContent = m ? "日本語" : "မြန်မာ";
  $("lblEmp").textContent = m ? "ဝန်ထမ်းနံပါတ်" : "社員番号";
  $("lblPw").textContent = m ? "စကားဝှက်" : "パスワード";
  $("loginBtn").textContent = m ? "ဝင်ရန်" : "ログイン";
}

export function setDateRange() { $("histDate").max = T(); $("histDate").min = shiftYmd(T(), -KEEP_DAYS); }

export function go(v) {
  if ((v === "sched" || v === "spin") && S.view === "home") S.target = defaultTarget();
  S.view = v;
  document.querySelectorAll(".view").forEach(e => e.classList.toggle("hidden", e.id !== "v-" + v));
  $("viewTitle").innerHTML = bi(VIEWS[v]);
  if (v === "hist") { if (!$("histDate").value) $("histDate").value = S.today; loadHist(); }
  render();
  window.scrollTo(0, 0);
}

export function render() {
  if ($("appView").classList.contains("hidden") || !S.me) return;
  const v = S.view;
  if (v === "home") renderHome();
  else if (v === "sched") renderSched();
  else if (v === "spin") renderSpin();
  else if (v === "board") renderBoard();
  else if (v === "report") renderReport();
  else if (v === "hist") renderHist();
}

// ===== 共通パーツ =====
export function counts(day, floors) {
  const c = { red: 0, redD: 0, green: 0, greenD: 0, yellow: 0, none: 0 };
  for (const f of floors) for (const r of S.cfg.floors[f] || []) {
    const x = (day[f] && day[f][r]) || {};
    if (x.s === "red") { c.red++; if (x.doneBy) c.redD++; }
    else if (x.s === "green") { c.green++; if (x.doneBy) c.greenD++; }
    else if (x.s === "yellow") c.yellow++;
    else c.none++;
  }
  return c;
}

export function sumHTML(c) {
  return `<span><i class="dot red"></i>${bl("要清掃")} <b>${c.redD}</b>/${c.red}</span><span><i class="dot green"></i>${bl("清掃なし")} <b>${c.greenD}</b>/${c.green}</span><span><i class="dot yellow"></i>${bl("清掃不要")} ${c.yellow}</span><span><i class="dot"></i>${bl("未入力")} ${c.none}</span>`;
}

export const spCountHTML = () => `<span><i class="dot orange"></i>${bl("特別対応 未完了")} <b>${S.open.length}</b></span>`;

export function floorBarHTML(withOpen) {
  const fs = floorsSorted();
  return [
    `<button class="chip ${S.floorSel === "all" ? "on" : ""}" data-f="all">${bl("全館")}</button>`,
    ...fs.map(f => `<button class="chip ${S.floorSel === f ? "on" : ""}" data-f="${esc(f)}">${esc(f)}F</button>`),
    withOpen ? `<button class="chip ${S.onlyOpen ? "on" : ""}" data-open="1">${bl("未完了のみ")}</button>` : ""
  ].join("");
}

export function tileHTML(f, r, d = S.today) {
  const x = st(f, r, d);
  const n = (S.openByRoom[r] || []).length;
  const cls = !x.s ? "none" : (x.doneBy ? `done b-${x.s}` : x.s);
  const co = x.s === "red" && x.co ? `<span class="co">C/O</span>` : "";
  const ty = S.cfg.types[r] ? `<span class="ty">${esc(S.cfg.types[r])}</span>` : "";
  return `<div class="tile ${cls}" data-f="${esc(f)}" data-r="${esc(r)}">${n ? `<span class="spband" data-band="1">${tr("特別対応")}${n > 1 ? " ×" + n : ""}</span>` : ""}<span class="no">${esc(r)}</span><span class="by">${x.doneBy ? esc(x.doneBy) : ""}</span>${ty}${co}</div>`;
}

export function spCardHTML(sp, btn) {
  const carried = !sp.done && sp.date < S.today;
  const ahead = !sp.done && sp.date > S.today;
  let h = `<div class="spcard ${sp.done ? "isdone" : ""}" data-sp="${esc(sp.id)}">`;
  h += `<div class="sphead"><span class="sproom">${esc(sp.room)}</span><span class="spdate">${md(sp.date)}${carried ? `<span class="tag">${bl("持ち越し")}</span>` : ""}${ahead ? `<span class="tag next">${bl("明日分")}</span>` : ""}</span></div>`;
  h += `<div class="sptext">${esc(sp.text)}</div>`;
  h += `<div class="kv">${bl("指示")}：${esc(sp.createdBy || "")} ${tm(sp.createdAt)}</div>`;
  if (sp.done) h += `<div class="kv">✓ ${bl("対応")}：${esc(sp.handler || "")}${sp.note ? `「${esc(sp.note)}」` : ""}${sp.reportedBy && sp.reportedBy !== sp.handler ? `（${bl("報告")}：${esc(sp.reportedBy)}）` : ""} ${md(sp.doneDate)} ${tm(sp.doneAt)}</div>`;
  if (btn) h += `<div class="spbtn"><button class="${sp.done ? "" : "primary"}">${bi(btn)}</button></div>`;
  return h + "</div>";
}

export function findSp(id) { return [...S.open, ...S.doneToday, ...S.hist.sps].find(s => s.id === id); }

export function spClick(e) { const c = e.target.closest("[data-sp]"); if (c) { spSheet(c.dataset.sp); return true; } return false; }

export function targetSegHTML() {
  return `<button data-t="${S.today}" class="${S.target === S.today ? "on" : ""}">今日 ${md(S.today)}</button><button data-t="${S.tomorrow}" class="${S.target === S.tomorrow ? "on" : ""}">明日 ${md(S.tomorrow)}</button>`;
}

// ===== トップ =====
export function renderHome() {
  const nav = S.role === "front"
    ? [["sched", "清掃日程表", "部屋ごとに 要清掃（赤）／清掃なし（緑）を入力"], ["spin", "特別対応指示表", "特別な対応の内容を入力"], ["hist", "履歴", "過去30日の記録"]]
    : [["board", "清掃ボード", "清掃・タオル補充が終わったらタップ"], ["report", "特別対応完了報告", "対応した人を記入して完了"], ["hist", "履歴", "過去30日の記録"]];
  const all = floorsSorted();
  let h = `<div class="pad"><div class="kv">${isMy() ? `${md(S.today)} ${MY["今日の状況"]}` : `今日 ${md(S.today)} の状況`}</div></div>`;
  h += `<div class="summary">${sumHTML(counts(dayOf(S.today), all))}</div>`;
  if (S.role === "front") {
    const c = counts(dayOf(S.tomorrow), all);
    h += `<div class="pad"><div class="kv">明日 ${md(S.tomorrow)} の日程表：入力済み ${c.red + c.green + c.yellow}室／未入力 ${c.none}室</div></div>`;
  }
  h += `<div class="pad"><div class="navgrid">${nav.map(([v, t, d]) => `<button data-go="${v}"><b>${bi(t)}</b><span>${bi(d)}</span></button>`).join("")}</div></div>`;
  h += `<h3 class="sec"><i class="dot orange"></i>${cnt("未完了の特別対応", S.open.length, `未完了の特別対応（${S.open.length}件）`)}</h3>`;
  h += S.open.length ? S.open.map(sp => spCardHTML(sp, S.role === "hk" ? "完了報告" : "")).join("") : notice(bi("未完了の特別対応はありません。"));
  if (!all.length) h = notice(S.me.admin ? "部屋が未登録です。⚙ 設定から部屋番号を登録してください。" : "部屋が未登録です。管理者に登録を依頼してください。") + h;
  $("homeBody").innerHTML = h;
}

// ===== 起動時の設定（イベントの登録など） =====
export function init_app() {
  // ===== 認証 =====
  onAuthStateChanged(auth, user => {
    cleanup();
    if (!user) { show("loginView"); return; }
    $("loginErr").textContent = "";
    // 管理者が登録した社員（users/{uid}）で、利用中（active）の人だけが使える
    S.unsub.me = onSnapshot(doc(db, "users", user.uid), snap => {
      const u = snap.exists() ? snap.data() : null;
      if (!u || u.active !== true) {
        $("loginErr").textContent = u ? "このアカウントは利用停止中です。管理者に連絡してください。" : "このアカウントは登録されていません。管理者に連絡してください。";
        signOut(auth);
        return;
      }
      const first = !S.me;
      S.me = { uid: user.uid, empNo: u.empNo, name: u.name, dept: u.dept, admin: u.admin === true };
      S.staff = u.name;
      const v = lsGet("yatta_view");
      S.role = S.me.admin && (v === "front" || v === "hk") ? v : u.dept;
      if (first) { listenCfg(); listenOpen(); listenDays(); listenUsers(); startApp(); }
      else { updateWho(); render(); }
    }, e => {
      $("loginErr").textContent = "アカウント情報を読み込めませんでした（" + e.code + "）";
      signOut(auth);
    });
  });

  $("loginBtn").onclick = async () => {
    $("loginErr").textContent = "";
    const no = normNo($("empNo").value);
    if (!EMP_RE.test(no)) { $("loginErr").textContent = "社員番号を確認してください"; return; }
    try { await signInWithEmailAndPassword(auth, empEmail(no), $("password").value); $("password").value = ""; }
    catch (e) { $("loginErr").textContent = "ログインできませんでした（" + e.code + "）"; }
  };

  setInterval(rollDay, 10000);

  document.addEventListener("visibilitychange", () => { if (!document.hidden) { rollDay(); syncUI(); } });

  applyLoginLang();

  $("loginLang").onclick = () => setLang(S.lang === "my" ? "ja" : "my");

  $("langBtn").onclick = () => { setLang(S.lang === "my" ? "ja" : "my"); updateWho(); go(S.view); };

  // 管理者だけ、フロント／管理課の表示を切り替えられる
  $("switchBtn").onclick = () => {
    if (!S.me || !S.me.admin) return;
    S.role = S.role === "front" ? "hk" : "front";
    lsSet("yatta_view", S.role);
    updateWho(); go("home");
    toast(`${DEPT[S.role]}の表示に切り替えました`);
  };

  $("homeBtn").onclick = () => go("home");

  document.querySelectorAll(".floorbar").forEach(el => {
    el.onclick = e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.open) S.onlyOpen = !S.onlyOpen; else S.floorSel = b.dataset.f;
      render();
    };
  });

  document.querySelectorAll(".targetSeg").forEach(el => {
    el.onclick = e => { const b = e.target.closest("button"); if (!b) return; S.target = b.dataset.t; render(); };
  });

  $("homeBody").onclick = e => {
    const g = e.target.closest("[data-go]"); if (g) return go(g.dataset.go);
    spClick(e);
  };
}


// ===== 起動 =====
init_core();
init_schedule();
init_specials();
init_board();
init_history();
init_settings();
init_app();
