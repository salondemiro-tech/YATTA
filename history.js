// YATTA 清掃管理システム — history.js
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, S, bySp, dayOf, db, esc, md, normNo, notice, openSheetHTML, tm, toast, visibleFloors } from "./core.js";
import { HIST_LEGEND, MY, bi, bl, isMy, tr } from "./i18n.js";
import { counts, floorBarHTML, render, spClick, sumHTML } from "./app.js";

export async function loadHist() {
  const d = $("histDate").value || S.today;
  S.hist = { date: d, loading: d !== S.today, day: {}, sps: [] };
  render();
  if (d === S.today) return;
  try {
    const [fl, a, b] = await Promise.all([
      getDocs(collection(db, "days", d, "floors")),
      getDocs(query(collection(db, "specials"), where("date", "==", d))),
      getDocs(query(collection(db, "specials"), where("doneDate", "==", d)))
    ]);
    if (S.hist.date !== d) return;
    const day = {}; fl.forEach(s => { day[s.id] = s.data().rooms || {}; });
    const m = new Map(); [...a.docs, ...b.docs].forEach(s => m.set(s.id, { id: s.id, ...s.data() }));
    S.hist = { date: d, loading: false, day, sps: [...m.values()].sort(bySp) };
  } catch (e) {
    toast("読み込みに失敗しました: " + e.code);
    S.hist.loading = false;
  }
  render();
}

export function renderHist() {
  $("histLegend").textContent = isMy() ? MY.HLEGEND : HIST_LEGEND;
  $("histRoomBtn").textContent = bl("操作履歴");
  $("histFloors").innerHTML = floorBarHTML(false);
  if (S.hist.loading) { $("histSum").innerHTML = ""; $("histBody").innerHTML = notice(bi("読み込み中…")); return; }
  const isT = S.hist.date === S.today;
  const day = isT ? dayOf(S.today) : S.hist.day;
  const sps = isT ? [...S.open, ...S.doneToday] : S.hist.sps;
  const fs = visibleFloors();
  $("histSum").innerHTML = sumHTML(counts(day, fs));
  const byRoom = {}; sps.forEach(sp => { (byRoom[sp.room] = byRoom[sp.room] || []).push(sp); });
  const rows = [];
  for (const f of fs) for (const r of S.cfg.floors[f]) {
    const x = (day[f] && day[f][r]) || {}, list = byRoom[r] || [];
    if (!x.s && !list.length) continue;
    const c = x.s === "yellow" ? `<i class="dot yellow"></i>${bi("未清掃・清掃不要")}` : x.s ? `<i class="dot ${x.s}"></i>${x.s === "red" ? (x.co ? (isMy() ? MY["要清掃"] + " (C/O)" : "要清掃（C/O）") : bi("要清掃")) : bi("清掃なし")}${x.doneBy ? `✓ ${esc(x.doneBy)} ${tm(x.doneAt)}` : bi("未完了")}` : "";
    const s = list.map(sp => `<div class="hsp" data-sp="${esc(sp.id)}">${md(sp.date)} ${esc(sp.text)}<br>${sp.done ? `✓ ${esc(sp.handler || "")} ${md(sp.doneDate)} ${tm(sp.doneAt)}` : bi("未完了")}</div>`).join("");
    rows.push(`<tr data-r="${esc(r)}"><td><b>${esc(r)}</b></td><td>${c}</td><td>${s}</td></tr>`);
  }
  $("histBody").innerHTML = rows.length
    ? `<div style="padding:8px 12px 24px"><table><thead><tr><th>${bi("部屋")}</th><th>${bi("清掃")}</th><th>${bi("特別対応")}</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`
    : notice("この日の記録はありません。（消去された部屋の履歴は、上の欄に部屋番号を入れて確認できます）");
}

// ===== 操作履歴の表示 =====
export const LOG_TYPE = { set: "日程", floor: "フロア一括", range: "まとめ塗り", draft: "下書き", done: "清掃完了", undo: "完了取消",
  sp_add: "登録", sp_edit: "内容修正", sp_delete: "削除", sp_done: "完了報告" };

export function fmtState(x) {
  if (!x) return "";
  const c = !x.s ? "灰（未入力）" : x.s === "green" ? "緑" : x.s === "yellow" ? "黄（未清掃・清掃不要）" : (x.co ? "赤（C/O）" : "赤");
  return c + (x.done ? `・完了（${esc(x.done)}）` : "");
}

export const logTime = l => l.at && l.at.toMillis ? l.at.toMillis() : 0;

export async function roomLogSheet(d, r) {
  openSheetHTML(`<h3>${esc(r)} の操作履歴</h3><div class="kv">${md(d)}</div><p class="kv">読み込み中…</p><div class="row"><button id="shClose">閉じる</button></div>`);
  try {
    const snap = await getDocs(query(collection(db, "logs"), where("rooms", "array-contains", r)));
    const list = snap.docs.map(x => x.data()).filter(l => l.date === d).sort((a, b) => logTime(a) - logTime(b));
    const lines = list.map(l => {
      const c = (l.changes || {})[r] || {};
      return `<li><b>${l.at ? tm(l.at) : ""}</b> ${esc(l.name)}［${l.type in LOG_TYPE ? bl(LOG_TYPE[l.type]) : esc(l.type)}］<br>${fmtState(c.b)} → ${fmtState(c.a)}</li>`;
    });
    openSheetHTML(`<h3>${esc(r)} ${isMy() ? MY["操作履歴"] : "の操作履歴"}</h3><div class="kv">${md(d)}・${list.length}件</div>${lines.length ? `<ul class="loglist">${lines.join("")}</ul>` : `<p class="kv">この日の操作はありません</p>`}<div class="row"><button id="shClose">${bl("閉じる")}</button></div>`);
  } catch (e) {
    openSheetHTML(`<h3>${esc(r)} の操作履歴</h3><p class="kv">読み込めませんでした（${esc(e.code || e)}）<br>${esc(e.message || "")}</p><div class="row"><button id="shClose">閉じる</button></div>`);
  }
}

export async function spLogs(id) {
  const box = $("spLogBox"); if (!box) return;
  box.innerHTML = `<p class="kv">読み込み中…</p>`;
  try {
    const snap = await getDocs(query(collection(db, "logs"), where("sid", "==", id)));
    const list = snap.docs.map(x => x.data()).sort((a, b) => logTime(a) - logTime(b));
    box.innerHTML = list.length ? `<ul class="loglist">${list.map(l => {
      let t = "";
      if (l.type === "sp_edit") t = `「${esc(l.b && l.b.text)}」→「${esc(l.a && l.a.text)}」`;
      else if (l.type === "sp_done") t = `対応：${esc(l.a && l.a.handler)}${l.a && l.a.note ? `「${esc(l.a.note)}」` : ""}`;
      else if (l.type === "sp_add") t = `「${esc(l.a && l.a.text)}」`;
      return `<li><b>${md(l.date)} ${l.at ? tm(l.at) : ""}</b> ${esc(l.name)}［${l.type in LOG_TYPE ? bl(LOG_TYPE[l.type]) : esc(l.type)}］<br>${t}</li>`;
    }).join("")}</ul>` : `<p class="kv">操作履歴はありません</p>`;
  } catch (e) { box.innerHTML = `<p class="kv" style="word-break:break-all">読み込めませんでした（${esc(e.code || e)}）<br>${esc(e.message || "")}</p>`; }
}

// ===== 起動時の設定（イベントの登録など） =====
export function init_history() {
  // ===== 履歴 =====
  $("histDate").onchange = () => { if ($("histDate").value) loadHist(); };

  $("histBody").onclick = e => {
    if (spClick(e)) return;
    const tr = e.target.closest("tr[data-r]");
    if (tr) roomLogSheet(S.hist.date || S.today, tr.dataset.r);
  };

  $("histRoomBtn").onclick = () => {
    const r = normNo($("histRoom").value);
    if (!r) return toast("部屋番号を入力してください");
    roomLogSheet($("histDate").value || S.today, r);
  };
}

