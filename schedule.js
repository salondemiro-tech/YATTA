// YATTA 清掃管理システム — schedule.js
import { $, S, curPen, dayOf, esc, floorsSorted, hasPending, md, notice, parseRooms, roomItem, serverDay, shiftYmd, snapState, st, toast, uiConfirm, visibleFloors, writeRooms } from "./core.js";
import { roomSheet } from "./specials.js";
import { counts, floorBarHTML, render, sumHTML, targetSegHTML, tileHTML } from "./app.js";

// ===== フロント：清掃日程表（対象日 = S.target） =====
export const PEN_NAME = { red: "赤（連泊清掃）", co: "赤（C/O）", green: "緑（清掃なし）", yellow: "黄（未清掃・清掃不要）", erase: "未入力（消す）" };

export function renderSched() {
  $("schedTarget").innerHTML = targetSegHTML();
  document.querySelectorAll("#penSeg button").forEach(b => b.classList.toggle("on", b.dataset.pen === S.pen));
  const fs = visibleFloors();
  $("schedSum").innerHTML = `<span>${md(S.target)}</span>` + sumHTML(counts(dayOf(S.target), fs));
  $("schedFloors").innerHTML = floorBarHTML(false);
  if (!fs.length) { $("schedBoard").innerHTML = notice("部屋が未登録です。"); return; }
  const lbl = S.pen === "erase" ? "未完了を消す" : `未入力→${PEN_NAME[S.pen]}`;
  $("schedBoard").innerHTML = fs.map(f =>
    `<section class="floor"><h2>${esc(f)}F<span class="fl-actions"><button data-bulk="${esc(f)}">${lbl}</button></span></h2><div class="grid">${S.cfg.floors[f].map(r => tileHTML(f, r, S.target)).join("")}</div></section>`
  ).join("");
}

export async function paint(f, r) {
  const d = S.target, x = st(f, r, d), cur = curPen(x);
  let ns;
  if (x.doneBy) {
    // 完了済みの部屋も変更できる。完了していた記録は操作履歴に残る
    if (!(await uiConfirm(`${r} は管理課が完了済みです（完了：${x.doneBy}）。\n変更すると完了表示は消えます（完了した記録は操作履歴に残ります）。よろしいですか？`))) return;
    ns = S.pen === "erase" ? null : S.pen;
  } else {
    ns = (S.pen === "erase" || S.pen === cur) ? null : S.pen;
  }
  if (!ns && !x.s) return;
  writeRooms(d, "set", [roomItem(f, r, ns)]);
}

export async function bulkFloor(f) {
  const d = S.target, rooms = S.cfg.floors[f] || [], items = [];
  if (S.pen === "erase") rooms.forEach(r => { const x = st(f, r, d); if (x.s && !x.doneBy) items.push(roomItem(f, r, null)); });
  else rooms.forEach(r => { if (!st(f, r, d).s) items.push(roomItem(f, r, S.pen)); });
  if (!items.length) return toast("対象の部屋はありません");
  const msg = S.pen === "erase"
    ? `${md(d)} ${f}F の未完了 ${items.length}室の入力を消しますか？`
    : `${md(d)} ${f}F の未入力 ${items.length}室を「${PEN_NAME[S.pen]}」にしますか？`;
  if (!(await uiConfirm(msg))) return;
  writeRooms(d, "floor", items);
}

// 前日から下書き：C/O→灰、連泊清掃→緑、黄（未清掃・清掃不要）→赤C/O、緑が3日続いた→赤、それ以外の緑→緑。入力済みの部屋は変更しない
// 上書き防止：端末内のデータではなく、必ずサーバーから最新を読み込んで判定する。確認後にもう一度読み直してから書き込む
export function draftPlan(cur, prev) {
  const g = (o, f, r) => (o[f] && o[f][r]) || {};
  const items = [], c = { red: 0, green: 0, co: 0, yco: 0 };
  for (const f of floorsSorted()) for (const r of S.cfg.floors[f]) {
    if (g(cur, f, r).s) continue;
    const p1 = g(prev[0], f, r), p2 = g(prev[1], f, r), p3 = g(prev[2], f, r);
    let ns = null;
    if (p1.s === "yellow") ns = "co";
    else if (p1.s === "red") { if (p1.co) { c.co++; continue; } ns = "green"; }
    else if (p1.s === "green") ns = (p2.s === "green" && p3.s === "green") ? "red" : "green";
    if (!ns) continue;
    items.push({ ...roomItem(f, r, ns), b: snapState({}) });
    if (ns === "co") c.yco++; else c[ns]++;
  }
  return { items, c };
}

// ===== 起動時の設定（イベントの登録など） =====
export function init_schedule() {
  $("penSeg").onclick = e => { const b = e.target.closest("button"); if (!b) return; S.pen = b.dataset.pen; render(); };

  $("schedBoard").onclick = e => {
    const b = e.target.closest("[data-bulk]"); if (b) return bulkFloor(b.dataset.bulk);
    const t = e.target.closest(".tile"); if (!t) return;
    if (e.target.closest("[data-band]")) return roomSheet(t.dataset.f, t.dataset.r, S.target);
    paint(t.dataset.f, t.dataset.r);
  };

  // まとめ塗り：反映前に対象室数・未登録の番号・読み取れない指定を確認表示する
  $("rangeBtn").onclick = async () => {
    const d = S.target, items = [], unknown = [], bad = []; let skipped = 0;
    const ns = S.pen === "erase" ? null : S.pen;
    const list = parseRooms($("rangeIn").value, bad);
    if (!list.length && !bad.length) return toast("部屋番号を入力してください");
    list.forEach(r => {
      const f = S.roomFloor[r];
      if (!f) { unknown.push(r); return; }
      const x = st(f, r, d);
      if (x.doneBy) { skipped++; return; }
      if (curPen(x) === ns) return;
      items.push(roomItem(f, r, ns));
    });
    let msg = `${md(d)}：${items.length}室を「${PEN_NAME[S.pen]}」にします。`;
    if (skipped) msg += `\n完了済みの${skipped}室は変更しません。`;
    if (unknown.length) msg += `\n未登録の番号（反映しません）：${unknown.slice(0, 10).join(", ")}${unknown.length > 10 ? ` ほか${unknown.length - 10}件` : ""}`;
    if (bad.length) msg += `\n読み取れない指定（反映しません）：${bad.join(", ")}`;
    if (!items.length) return uiConfirm(msg + "\n\n変更する部屋はありません。", true);
    if (!(await uiConfirm(msg + "\n\nよろしいですか？"))) return;
    writeRooms(d, "range", items);
    $("rangeIn").value = "";
  };

  $("draftBtn").onclick = async () => {
    const btn = $("draftBtn");
    if (btn.disabled) return;
    if (!navigator.onLine) return toast("下書きは通信できる状態で実行してください");
    if (hasPending()) return toast("未送信の入力があります。「同期済み」になってから実行してください");
    const D = S.target;
    const ds = [1, 2, 3].map(n => shiftYmd(D, -n));
    btn.disabled = true; btn.textContent = "読み込み中…";
    try {
      let cur, prev;
      try { [cur, ...prev] = await Promise.all([D, ...ds].map(serverDay)); }
      catch (e) { return toast("サーバーから読み込めませんでした。通信を確認してください（" + (e.code || e) + "）"); }
      const p = draftPlan(cur, prev);
      if (!p.c.red && !p.c.green && !p.c.yco) return toast("下書きできる部屋はありません（前日が未入力、または入力済み）");
      if (!(await uiConfirm(`${md(D)} の日程表を ${md(ds[0])} から下書きします。\n赤（4日目の清掃）${p.c.red}室／赤 C/O（前日が黄）${p.c.yco}室／緑 ${p.c.green}室\n前日C/Oの${p.c.co}室は灰（未入力）のままです。\n入力済みの部屋は変更しません。`))) return;
      // 確認している間に他の端末で入力された部屋を除くため、もう一度サーバーから読み直す
      try { cur = await serverDay(D); }
      catch (e) { return toast("サーバーから読み込めませんでした。もう一度実行してください（" + (e.code || e) + "）"); }
      const q = draftPlan(cur, prev);
      if (!q.c.red && !q.c.green && !q.c.yco) return toast("他の端末で入力済みのため、変更はありません");
      btn.textContent = "保存中…";
      if (await writeRooms(D, "draft", q.items)) toast(`下書きを作成しました（赤${q.c.red + q.c.yco}室・緑${q.c.green}室）。C/O・チェックインなどを修正してください`);
    } finally {
      btn.disabled = false; btn.textContent = "前日から下書き";
    }
  };
}

