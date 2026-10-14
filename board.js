// YATTA 清掃管理システム — board.js
import { deleteField } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, S, dayOf, esc, isOpenRoom, notice, now, snapState, st, toast, uiConfirm, visibleFloors, writeRooms } from "./core.js";
import { BOARD_LEGEND, MY, bl, isMy } from "./i18n.js";
import { roomSheet } from "./specials.js";
import { counts, floorBarHTML, rollDay, spCountHTML, sumHTML, tileHTML } from "./app.js";

// ===== 管理課：清掃ボード =====
export function renderBoard() {
  $("boardLegend").textContent = isMy() ? MY.LEGEND : BOARD_LEGEND;
  const fs = visibleFloors();
  $("boardSum").innerHTML = sumHTML(counts(dayOf(S.today), fs)) + spCountHTML();
  $("boardFloors").innerHTML = floorBarHTML(true);
  if (!fs.length) { $("boardGrid").innerHTML = notice("部屋が未登録です。"); return; }
  const html = fs.map(f => {
    const rooms = S.cfg.floors[f].filter(r => !S.onlyOpen || isOpenRoom(f, r));
    if (S.onlyOpen && !rooms.length) return "";
    return `<section class="floor"><h2>${esc(f)}F</h2><div class="grid">${rooms.map(r => tileHTML(f, r)).join("")}</div></section>`;
  }).join("");
  $("boardGrid").innerHTML = html || notice("未完了の部屋はありません。");
}

// ===== 起動時の設定（イベントの登録など） =====
export function init_board() {
  $("boardGrid").onclick = async e => {
    if (rollDay()) return toast(bl("日付が変わったため、今日の表示に切り替えました"));
    const t = e.target.closest(".tile"); if (!t) return;
    const f = t.dataset.f, r = t.dataset.r;
    if (e.target.closest("[data-band]")) return roomSheet(f, r);
    const x = st(f, r);
    if (!x.s || x.s === "yellow") {
      if ((S.openByRoom[r] || []).length) return roomSheet(f, r);
      if (isMy()) return toast(`${r}: ${MY[x.s ? "今日は清掃不要です" : "清掃の指示がありません"]}`);
      return toast(x.s ? `${r} は今日は清掃不要です（未清掃）` : `${r} は清掃の指示がありません`);
    }
    if (x.doneBy) {
      if (!(await uiConfirm(isMy() ? `${r} ${MY["完了を取り消しますか？"]}\n（${MY["完了者"]}：${x.doneBy}）` : `${r} の完了を取り消しますか？\n（完了者：${x.doneBy}）`))) return;
      writeRooms(S.today, "undo", [{ f, r, data: { doneBy: deleteField(), doneAt: deleteField() }, a: { ...snapState(x), done: null } }]);
    } else {
      writeRooms(S.today, "done", [{ f, r, data: { doneBy: S.staff, doneAt: now() }, a: { ...snapState(x), done: S.staff } }]);
    }
  };
}

