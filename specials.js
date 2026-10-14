// YATTA 清掃管理システム — specials.js
import { collection, doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, S, addLog, bind, closeSheet, db, esc, expireFor, md, notice, now, openSheetHTML, parseRooms, st, stateLabel, tm, toast, track, uiConfirm } from "./core.js";
import { MY, bi, bl, cnt, isMy, tr } from "./i18n.js";
import { spLogs } from "./history.js";
import { findSp, spCardHTML, spClick, targetSegHTML } from "./app.js";

export function renderSpin() {
  $("spinTarget").innerHTML = targetSegHTML();
  let h = `<h3 class="sec"><i class="dot orange"></i>未完了（持ち越し含む ${S.open.length}件）</h3>`;
  h += S.open.length ? S.open.map(sp => spCardHTML(sp, "")).join("") : notice("未完了の特別対応はありません。");
  h += `<h3 class="sec">今日完了（${S.doneToday.length}件）</h3>`;
  h += S.doneToday.length ? S.doneToday.map(sp => spCardHTML(sp, "")).join("") : notice("まだありません。");
  $("spinList").innerHTML = h;
}

// ===== 管理課：特別対応完了報告 =====
export function renderReport() {
  let h = `<h3 class="sec"><i class="dot orange"></i>${cnt("未完了（持ち越し含む）", S.open.length, `未完了（持ち越し含む ${S.open.length}件）`)}</h3>`;
  h += S.open.length ? S.open.map(sp => spCardHTML(sp, "完了報告")).join("") : notice(bi("未完了の特別対応はありません。"));
  h += `<h3 class="sec">${cnt("今日完了", S.doneToday.length, `今日完了（${S.doneToday.length}件）`)}</h3>`;
  h += S.doneToday.length ? S.doneToday.map(sp => spCardHTML(sp, "")).join("") : notice(bi("まだありません。"));
  $("reportList").innerHTML = h;
}

export function roomSheet(f, r, d = S.today) {
  const x = st(f, r, d);
  const sps = [...(S.openByRoom[r] || []), ...S.doneToday.filter(s => s.room === r)];
  let h = `<h3>${esc(r)}${S.cfg.types[r] ? `（${esc(S.cfg.types[r])}）` : ""}</h3><div class="kv">${md(d)} ${bl("清掃")}：${stateLabel(x)}</div>`;
  h += sps.length ? sps.map(sp => spCardHTML(sp, !sp.done && S.role === "hk" ? "完了報告" : "")).join("") : `<p class="kv">${bi("特別対応はありません")}</p>`;
  h += `<div class="row"><button id="shClose">${bl("閉じる")}</button></div>`;
  openSheetHTML(h);
}

export function spSheet(id) {
  const sp = findSp(id);
  if (!sp) return toast("見つかりませんでした");
  const front = S.role === "front";
  const staffAll = [...new Set(S.users.filter(u => u.active).map(u => u.name))];
  let h = `<h3>${esc(sp.room)} ${tr("特別対応")}</h3>`;
  h += `<div class="kv">${md(sp.date)} ${bl("指示")}：${esc(sp.createdBy || "")} ${tm(sp.createdAt)}${sp.editedBy ? `（修正：${esc(sp.editedBy)}）` : ""}</div>`;
  if (front && !sp.done) h += `<div class="field"><label>内容</label><textarea id="shText" rows="4">${esc(sp.text)}</textarea></div>`;
  else h += `<div class="note">${esc(sp.text)}</div>`;
  if (sp.done) {
    h += `<div class="kv">✓ ${bl("対応した人")}：${esc(sp.handler || "")}${sp.note ? `「${esc(sp.note)}」` : ""}</div>`;
    h += `<div class="kv">${bl("報告")}：${esc(sp.reportedBy || "")} ${md(sp.doneDate)} ${tm(sp.doneAt)}</div>`;
  } else if (!front) {
    h += `<div class="field"><label>${bi("実際に対応した人（代筆の場合は書き換えてください）")}</label><input id="shHandler" list="staffList" value="${esc(S.staff)}"><datalist id="staffList">${staffAll.map(n => `<option value="${esc(n)}">`).join("")}</datalist></div>`;
    h += `<div class="field"><label>${bi("一言（任意）")}</label><input id="shNote" placeholder="例：14時にお届け済み"></div>`;
  }
  h += `<div class="row"><button id="shClose">${bi("閉じる")}</button>`;
  if (front && !sp.done) h += `<button id="shDel">削除</button><button id="shSave" class="primary">保存</button>`;
  if (!front && !sp.done) h += `<button id="shDone" class="primary">${bi("完了報告")}</button>`;
  h += `</div><div class="row"><button id="shLog">${bi("操作履歴を見る")}</button></div><div id="spLogBox"></div>`;
  openSheetHTML(h);

  const ref = doc(db, "specials", id);
  bind("shLog", () => spLogs(id));
  bind("shSave", () => {
    const v = $("shText").value.trim();
    if (!v) return toast("内容が空です（取りやめる場合は削除）");
    if (v !== sp.text) {
      const batch = writeBatch(db);
      batch.update(ref, { text: v, editedBy: S.staff, editedAt: now() });
      addLog(batch, { kind: "sp", type: "sp_edit", sid: id, room: sp.room, date: sp.date, b: { text: sp.text }, a: { text: v } });
      track(batch.commit());
    }
    closeSheet();
  });
  bind("shDel", async () => {
    if (!(await uiConfirm(`${sp.room} の特別対応を削除しますか？（操作履歴には残ります）`))) return;
    const batch = writeBatch(db);
    batch.delete(ref);
    addLog(batch, { kind: "sp", type: "sp_delete", sid: id, room: sp.room, date: sp.date, b: { text: sp.text } });
    track(batch.commit());
    closeSheet();
  });
  bind("shDone", async () => {
    const handler = $("shHandler").value.trim(), note = $("shNote").value.trim();
    if (!handler) return toast(bl("対応した人を入力してください"));
    if (!(await uiConfirm(isMy() ? `${sp.room}（${MY["対応"]}：${handler}）\n${MY["完了報告は取り消せません。よろしいですか？"]}` : `${sp.room} の特別対応を完了にします（対応：${handler}）。\n完了報告は取り消せません。よろしいですか？`))) return;
    const batch = writeBatch(db);
    batch.update(ref, { done: true, handler, note, reportedBy: S.staff, doneAt: now(), doneDate: S.today, expireAt: expireFor(S.today) });
    addLog(batch, { kind: "sp", type: "sp_done", sid: id, room: sp.room, date: sp.date, a: { handler, note } });
    track(batch.commit());
    closeSheet();
    toast(isMy() ? `${sp.room} ${MY["特別対応を完了報告しました"]}` : `${sp.room} の特別対応を完了報告しました`);
  });
}

// ===== 起動時の設定（イベントの登録など） =====
export function init_specials() {
  // ===== フロント：特別対応指示表 =====
  $("spAdd").onclick = () => {
    const bad = [], rooms = parseRooms($("spRoom").value, bad), text = $("spText").value.trim();
    if (bad.length) return toast(`読み取れない指定：${bad.join(", ")}`);
    if (!rooms.length) return toast("部屋番号を入力してください");
    if (!text) return toast("内容を入力してください");
    if (rooms.length > 200) return toast("一度に登録できるのは200室までです");
    const unknown = rooms.filter(r => !S.roomFloor[r]);
    if (unknown.length) return toast(`未登録の部屋：${unknown.slice(0, 5).join(", ")}`);
    const batch = writeBatch(db);
    rooms.forEach(r => {
      const ref = doc(collection(db, "specials"));
      batch.set(ref, { room: r, floor: S.roomFloor[r], date: S.target, text, createdBy: S.staff, createdAt: now(), done: false });
      addLog(batch, { kind: "sp", type: "sp_add", sid: ref.id, room: r, date: S.target, a: { text } });
    });
    track(batch.commit());
    $("spRoom").value = ""; $("spText").value = "";
    toast(`${md(S.target)} 分として ${rooms.length}室（${rooms.slice(0, 8).join(", ")}${rooms.length > 8 ? " ほか" : ""}）に追加しました`);
  };

  $("spinList").onclick = spClick;

  $("reportList").onclick = spClick;
}

