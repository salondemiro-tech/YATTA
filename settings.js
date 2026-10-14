// YATTA 清掃管理システム — settings.js
import { EmailAuthProvider, createUserWithEmailAndPassword, reauthenticateWithCredential, signInWithEmailAndPassword, signOut, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, DEPT, EMP_RE, ROOM_TYPES, S, T, addLog, adminAuth, auth, bind, closeSheet, compress, db, empEmail, esc, floorsSorted, normNo, notice, openSheetHTML, parseRooms, show, toast, track, uiConfirm } from "./core.js";
import { bi, bl, tr } from "./i18n.js";
import { logout, render } from "./app.js";

export function openSettings() {
  $("setTitle").innerHTML = bi("設定"); $("acctTitle").innerHTML = bi("アカウント");
  $("pwBtn").textContent = bl("パスワード変更"); $("logoutBtn").textContent = bl("ログアウト"); $("setCancel").textContent = bl("戻る");
  $("acctInfo").textContent = `${S.staff}（社員番号 ${S.me.empNo}・${DEPT[S.me.dept]}${S.me.admin ? "・管理者" : ""}）`;
  $("adminSec").classList.toggle("hidden", !S.me.admin);
  if (S.me.admin) {
    $("roomsTa").value = floorsSorted().map(f => `${f}: ${compress(S.cfg.floors[f])}`).join("\n");
    const order = floorsSorted().flatMap(f => S.cfg.floors[f]);
    $("typesTa").value = ROOM_TYPES.map(t => { const rs = order.filter(r => S.cfg.types[r] === t); return rs.length ? `${t}: ${compress(rs)}` : ""; }).filter(Boolean).join("\n");
    updateSetInfo();
    renderUsers();
  }
  show("settingsView");
  window.scrollTo(0, 0);
}

// 登録済みの室数表示（保存後も最新に更新する）
export function updateSetInfo() {
  const total = Object.values(S.cfg.floors).reduce((a, v) => a + v.length, 0);
  const typed = Object.keys(S.cfg.types).filter(r => S.roomFloor[r]).length;
  $("setInfo").textContent = `登録済み：${Object.keys(S.cfg.floors).length}フロア・${total}室（タイプ設定済み ${typed}室）`;
}

// 社員の登録・編集（管理者のみ）
export function renderUsers() {
  if (!S.me || !S.me.admin) return;
  $("userList").innerHTML = S.users.length ? `<div class="list"><table><thead><tr><th>社員番号</th><th>名前</th><th>所属</th><th>状態</th></tr></thead><tbody>${S.users.map(u =>
    `<tr data-uid="${esc(u.uid)}"><td>${esc(u.empNo)}</td><td>${esc(u.name)}${u.admin ? "<br><small>管理者</small>" : ""}</td><td>${DEPT[u.dept] || esc(u.dept)}</td><td>${u.active ? "利用中" : "<b>停止</b>"}</td></tr>`
  ).join("")}</tbody></table></div><p class="kv">行をタップすると編集できます。</p>` : notice("社員が登録されていません。");
}

export function userSheet(uid) {
  const u = S.users.find(x => x.uid === uid); if (!u) return;
  const self = uid === S.me.uid;
  openSheetHTML(`<h3>社員の編集</h3><div class="kv">社員番号 ${esc(u.empNo)}（変更不可）</div>
    <div class="field"><label>名前</label><input id="eName" value="${esc(u.name)}"></div>
    <div class="field"><label>所属</label><select id="eDept"><option value="front" ${u.dept === "front" ? "selected" : ""}>フロント</option><option value="hk" ${u.dept === "hk" ? "selected" : ""}>管理課</option></select></div>
    <label class="chk"><input type="checkbox" id="eAdmin" ${u.admin ? "checked" : ""} ${self ? "disabled" : ""}> 管理者</label>
    <label class="chk"><input type="checkbox" id="eActive" ${u.active ? "checked" : ""} ${self ? "disabled" : ""}> 利用中（外すと、その時点からアクセスできなくなります）</label>
    ${self ? `<p class="kv">自分の管理者権限と利用状態は変更できません。</p>` : ""}
    <p class="kv">パスワードの再設定は Firebase コンソールの Authentication で行います（ログインID：${esc(empEmail(u.empNo))}）。</p>
    <div class="row"><button id="shClose">閉じる</button><button id="eSave" class="primary">保存</button></div>`);
  bind("eSave", async () => {
    const name = $("eName").value.trim(), dept = $("eDept").value;
    const admin = self ? true : $("eAdmin").checked, active = self ? true : $("eActive").checked;
    if (!name) return toast("名前を入力してください");
    if (!active && u.active && !(await uiConfirm(`${u.name} を利用停止にしますか？`))) return;
    const batch = writeBatch(db);
    batch.update(doc(db, "users", uid), { name, dept, admin, active, updatedAt: serverTimestamp(), updatedBy: S.me.uid });
    addLog(batch, { kind: "user", type: "user_update", target: uid, b: { name: u.name, dept: u.dept, admin: !!u.admin, active: !!u.active }, a: { name, dept, admin, active } });
    if (await track(batch.commit())) { closeSheet(); toast("保存しました"); }
  });
}

// ===== 起動時の設定（イベントの登録など） =====
export function init_settings() {
  // ===== 設定 =====
  $("setBtn").onclick = openSettings;

  $("setCancel").onclick = () => { show("appView"); render(); };

  $("logoutBtn").onclick = logout;

  // 部屋番号（管理者のみ）
  $("setSave").onclick = async () => {
    if (!S.me.admin) return;
    const floors = {}, errs = [];
    $("roomsTa").value.normalize("NFKC").split("\n").forEach((line, i) => {
      if (!line.trim()) return;
      const m = line.match(/^\s*([^:]+?)\s*:\s*(.+)$/);
      const bad = [];
      if (!m) { errs.push(i + 1); return; }
      const f = m[1].replace(/[Ff階]$/, "").trim();
      floors[f] = [...new Set([...(floors[f] || []), ...parseRooms(m[2], bad)])];
      if (bad.length) errs.push(i + 1);
    });
    if (errs.length) return toast(`部屋番号の ${errs.join(",")}行目の書式を確認してください`);
    const total = Object.values(floors).reduce((a, v) => a + v.length, 0);
    // 部屋タイプ：「S: 201-210」の形式。登録されていない部屋・同じ部屋の重複はエラー
    const all = new Set(Object.values(floors).flat()), types = {}, terr = [], unknown = [], dup = [];
    $("typesTa").value.normalize("NFKC").split("\n").forEach((line, i) => {
      if (!line.trim()) return;
      const m = line.match(/^\s*([A-Za-z]+)\s*:\s*(.+)$/), bad = [];
      const t = m ? m[1].toUpperCase() : "";
      if (!m || !ROOM_TYPES.includes(t)) { terr.push(i + 1); return; }
      parseRooms(m[2], bad).forEach(r => {
        if (!all.has(r)) unknown.push(r);
        else if (types[r] && types[r] !== t) dup.push(r);
        else types[r] = t;
      });
      if (bad.length) terr.push(i + 1);
    });
    if (terr.length) return toast(`部屋タイプの ${terr.join(",")}行目を確認してください（タイプは S・D・T・TR）`);
    if (unknown.length) return toast(`部屋タイプに未登録の部屋があります：${unknown.slice(0, 5).join(", ")}`);
    if (dup.length) return toast(`2つのタイプに入っている部屋があります：${dup.slice(0, 5).join(", ")}`);
    const typed = Object.keys(types).length;
    if (!(await uiConfirm(`${Object.keys(floors).length}フロア・${total}室（タイプ設定 ${typed}室）で保存しますか？`))) return;
    if (!navigator.onLine) return toast("オフラインでは設定を保存できません");
    const batch = writeBatch(db);
    batch.set(doc(db, "config", "hotel"), { floors, types, updatedAt: serverTimestamp(), updatedBy: S.staff });
    addLog(batch, { kind: "config", type: "config", a: { floors: Object.keys(floors).length, rooms: total, typed } });
    if (await track(batch.commit())) toast("部屋番号・タイプを保存しました");
  };

  // パスワード変更（本人）
  $("pwBtn").onclick = () => {
    openSheetHTML(`<h3>${bi("パスワード変更")}</h3>
      <div class="field"><label>${bi("現在のパスワード")}</label><input id="pwCur" type="password" autocomplete="current-password"></div>
      <div class="field"><label>${bi("新しいパスワード（6文字以上）")}</label><input id="pwNew" type="password" autocomplete="new-password"></div>
      <div class="field"><label>${bi("新しいパスワード（確認）")}</label><input id="pwNew2" type="password" autocomplete="new-password"></div>
      <div class="row"><button id="shClose">${bl("閉じる")}</button><button id="pwSave" class="primary">${bl("変更")}</button></div>`);
    bind("pwSave", async () => {
      const cur = $("pwCur").value, nw = $("pwNew").value;
      if (nw.length < 6) return toast("6文字以上にしてください");
      if (nw !== $("pwNew2").value) return toast("確認用と一致しません");
      try {
        const u = auth.currentUser;
        await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, cur));
        await updatePassword(u, nw);
        closeSheet(); toast("パスワードを変更しました");
      } catch (e) { toast("変更できませんでした（" + e.code + "）"); }
    });
  };

  $("userList").onclick = e => { const tr = e.target.closest("tr[data-uid]"); if (tr) userSheet(tr.dataset.uid); };

  $("uAdd").onclick = async () => {
    const no = normNo($("uNo").value), name = $("uName").value.trim(), dept = $("uDept").value, admin = $("uAdmin").checked, pw = $("uPw").value;
    if (!EMP_RE.test(no)) return toast("社員番号は半角英数字（-と_も可）で入力してください");
    if (!name) return toast("名前を入力してください");
    if (pw.length < 6) return toast("初期パスワードは6文字以上にしてください");
    if (S.users.some(u => u.empNo === no)) return toast("この社員番号はすでに登録されています");
    if (!navigator.onLine) return toast("オフラインでは登録できません");
    if (!(await uiConfirm(`${name}（${no}・${DEPT[dept]}${admin ? "・管理者" : ""}）を登録しますか？`))) return;
    const btn = $("uAdd"); btn.disabled = true;
    try {
      const a2 = adminAuth();
      let uid;
      try { uid = (await createUserWithEmailAndPassword(a2, empEmail(no), pw)).user.uid; }
      catch (e) {
        // 前回、ログイン用アカウントだけ作られて登録が途中で止まった場合の復旧（同じパスワードなら続きから登録できる）
        if (e.code !== "auth/email-already-in-use") return toast("登録できませんでした（" + e.code + "）");
        try { uid = (await signInWithEmailAndPassword(a2, empEmail(no), pw)).user.uid; }
        catch (e2) { return toast("この社員番号のログイン用アカウントが既にあります。Firebaseコンソールで確認してください"); }
        if (S.users.some(u => u.uid === uid)) return toast("この社員番号はすでに登録されています");
      } finally { try { await signOut(a2); } catch (e) { /* ignore */ } }
      const batch = writeBatch(db);
      batch.set(doc(db, "users", uid), { empNo: no, name, dept, admin, active: true, createdAt: serverTimestamp(), createdBy: S.me.uid });
      addLog(batch, { kind: "user", type: "user_add", target: uid, a: { empNo: no, name, dept, admin } });
      if (await track(batch.commit())) {
        toast(`${name} を登録しました。社員番号と初期パスワードを本人に伝えてください`);
        ["uNo", "uName", "uPw"].forEach(i => { $(i).value = ""; }); $("uAdmin").checked = false;
      }
    } finally { btn.disabled = false; }
  };
}

