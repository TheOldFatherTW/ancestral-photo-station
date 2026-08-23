(function () {
  const ORIGIN = (window.VAULT_ORIGIN || "").replace(/\/$/, "");
  const STALE_MS = 20 * 60 * 1000;
  const NEED_LINK = "請用給你的專用連結打開";
  const DISCONNECTED = "目前無法連上,請聯絡維護的那個傢伙";
  const CHECK =
    '<span class="ios-check" aria-label="已同步"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#34c759"/><path fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M7.2 12.4l3.1 3.2 6.5-7.2"/></svg></span>';
  const statusEl = document.getElementById("status");
  const cabs = document.getElementById("cabinets");
  const album = document.getElementById("album");
  const albumTitle = document.getElementById("album-title");
  const albumCoverBtn = document.getElementById("album-cover-btn");
  const feed = document.getElementById("feed");
  let openPerson = "";
  let names = {};
  let lastCab = "";
  let coverInput = null;
  let coverPerson = "";
  let uploadInput = null;
  let uploadPerson = "";
  let uploadBtn = null;
  let uploadBusy = false;
  let uploadTip = null;
  let upBar = null;
  let upHide = 0;
  const UPLOAD_CAP = 480 * 1024 * 1024;
  // Small enough that a phone finishes one before anything between it and the vault
  // gives up, and that the bar moves often, since Safari reports no progress of its own.
  const BATCH_CAP = 12 * 1024 * 1024;
  const TIP_LINES = [
    "一次挑 20～30 張最順。",
    "按下相簿右上角的「加入」以後，iPhone 會自己把每一張照片轉檔，選照片那頁會停住十幾秒到好幾分鐘，畫面看起來像當掉。那是正常的，請等它自己跳回來，不要關掉。",
    "想快很多：在選照片那頁的右上角按「選項」，把「格式」從「自動」改成「目前」。這樣 iPhone 就不轉檔，直接交出原檔，家裡那台照收。",
  ];
  let backupAsk = {};
  const CAMERA =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="8" width="17" height="11.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 8l1.4-2.4h5.2L16 8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="13.6" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
  const REFRESH =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M20 4.5V9h-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const UPLOAD =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16.5V4.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M7.4 9.4L12 4.8l4.6 4.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.6 15.4v2.6a2 2 0 0 0 2 2h10.8a2 2 0 0 0 2-2v-2.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const TRASH =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8V6.8A1.8 1.8 0 0 1 9.8 5h4.4A1.8 1.8 0 0 1 16 6.8V8M5 8h14M9 11v7M12 11v7M15 11v7M7 8l.8 12.2A1.6 1.6 0 0 0 9.4 22h5.2a1.6 1.6 0 0 0 1.6-1.8L17 8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const HASH =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4l-1.2 16M15.2 4l-1.2 16M4.5 9h15M4 15h15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const DOWNLOAD =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 11.5L12 16l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 19.5h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

  function api(path) {
    const url = ORIGIN + path;
    const k = window.FAMILY_VIEW_KEY;
    if (!k) return url;
    return url + (path.indexOf("?") >= 0 ? "&" : "?") + "k=" + encodeURIComponent(k);
  }

  function lineFrom(data) {
    if (!data || !data.updated_at) return DISCONNECTED;
    const t = Date.parse(data.updated_at);
    if (!Number.isFinite(t) || Date.now() - t > STALE_MS) return DISCONNECTED;
    return "";
  }

  async function readJson(path) {
    const ctrl = new AbortController();
    const timer = setTimeout(function () {
      ctrl.abort();
    }, 6000);
    try {
      const res = await fetch(api(path), { signal: ctrl.signal });
      if (res.status === 401 || res.status === 403) {
        const err = new Error("need_key");
        err.code = "need_key";
        throw err;
      }
      if (!res.ok) throw new Error("bad status");
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function personFromHash() {
    const h = (location.hash || "").replace(/^#/, "");
    return /^[a-z][a-z0-9-]{0,31}$/.test(h) ? h : "";
  }

  function onlyPerson() {
    const ids = Object.keys(names);
    return ids.length === 1 ? ids[0] : "";
  }

  function paintSoloChrome() {
    const solo = !!onlyPerson();
    const homeWrap = document.querySelector(".local-cabs");
    const bar = document.querySelector(".album-bar");
    const back = document.querySelector("#album .back");
    if (homeWrap) {
      homeWrap.hidden = false;
      homeWrap.classList.toggle("solo", solo);
    }
    if (cabs) cabs.hidden = false;
    if (bar) bar.hidden = solo;
    if (back) back.hidden = solo;
  }

  function showHome() {
    const only = onlyPerson();
    if (only) {
      showAlbum(only, names[only]);
      return;
    }
    openPerson = "";
    if (window.FamilyFeed) window.FamilyFeed.stop();
    paintSoloChrome();
    const homeWrap = document.querySelector(".local-cabs");
    if (homeWrap) homeWrap.hidden = false;
    if (cabs) cabs.hidden = false;
    if (album) album.hidden = true;
    if (feed) feed.innerHTML = "";
    const board = document.getElementById("tag-board");
    if (board) board.hidden = true;
    showRail(false);
  }

  function showAlbum(person, name) {
    const solo = !!onlyPerson();
    paintSoloChrome();
    if (!solo) {
      const homeWrap = document.querySelector(".local-cabs");
      if (homeWrap) homeWrap.hidden = true;
      if (cabs) cabs.hidden = true;
    }
    if (album) album.hidden = false;
    if (!solo && albumTitle) albumTitle.textContent = name || names[person] || person;
    if (albumCoverBtn) albumCoverBtn.dataset.person = person;
    if (window.FamilyTags) window.FamilyTags.show(person);
    showRail(true);
    if (openPerson === person) return;
    openPerson = person;
    if (window.FamilyFeed) window.FamilyFeed.start(person);
  }

  function fail(msg) {
    if (statusEl) statusEl.textContent = msg || DISCONNECTED;
  }

  function mb(bytes) {
    const n = bytes / (1024 * 1024);
    return (n < 10 ? n.toFixed(1) : Math.round(n)) + " MB";
  }

  // The twelve second poll rewrites the status line, and the album scrolls it off the
  // top the moment there are photos, so an upload gets a strip that stays put instead.
  function upNode() {
    if (upBar) return upBar;
    upBar = document.createElement("div");
    upBar.className = "up-bar";
    upBar.hidden = true;
    const main = document.createElement("div");
    main.className = "up-main";
    const meter = document.createElement("div");
    meter.className = "hp-meter";
    const track = document.createElement("div");
    track.className = "hp-track";
    const fill = document.createElement("div");
    fill.className = "hp-fill";
    track.appendChild(fill);
    const num = document.createElement("span");
    num.className = "hp-num";
    meter.appendChild(track);
    meter.appendChild(num);
    const sub = document.createElement("div");
    sub.className = "up-sub";
    upBar.appendChild(main);
    upBar.appendChild(meter);
    upBar.appendChild(sub);
    document.body.appendChild(upBar);
    return upBar;
  }

  function paintUp(main, sub, ratio) {
    const bar = upNode();
    if (upHide) {
      window.clearTimeout(upHide);
      upHide = 0;
    }
    bar.hidden = false;
    bar.querySelector(".up-main").textContent = main;
    bar.querySelector(".up-sub").textContent = sub || "";
    const pct = ratio == null ? null : Math.max(0, Math.min(100, Math.round(ratio * 100)));
    bar.querySelector(".hp-meter").hidden = pct == null;
    bar.querySelector(".hp-fill").style.width = (pct == null ? 0 : pct) + "%";
    bar.querySelector(".hp-num").textContent = pct == null ? "" : pct + "%";
  }

  function closeUp(after) {
    if (upHide) window.clearTimeout(upHide);
    upHide = window.setTimeout(function () {
      upHide = 0;
      if (upBar) upBar.hidden = true;
    }, after);
  }

  function pickCover(person) {
    coverPerson = person;
    if (!coverInput) {
      coverInput = document.createElement("input");
      coverInput.type = "file";
      coverInput.accept = "image/*";
      coverInput.setAttribute("aria-hidden", "true");
      coverInput.style.cssText =
        "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none;";
      document.body.appendChild(coverInput);
      coverInput.addEventListener("change", function () {
        const file = coverInput.files && coverInput.files[0];
        const who = coverPerson;
        coverInput.value = "";
        if (!file || !who) return;
        uploadCover(who, file);
      });
    }
    coverInput.value = "";
    coverInput.click();
  }

  async function uploadCover(person, file) {
    const body = new FormData();
    body.append("cover", file, file.name || "cover.jpg");
    fail("正在換封面…");
    try {
      const res = await fetch(api("/api/cover?person=" + encodeURIComponent(person)), {
        method: "POST",
        body: body,
      });
      const data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) throw new Error(data.error || "fail");
      lastCab = "";
      await boot();
      if (statusEl && statusEl.textContent === "正在換封面…") statusEl.textContent = "";
    } catch (err) {
      fail("封面換不上，請再選一次，或確認家裡這台有開");
    }
  }

  // A phone that will not sync to iCloud and will not talk to Windows over the cable can
  // still open this page, so hand-picking the stranded pictures is the last way in.
  function pickUpload(person, btn) {
    uploadPerson = person;
    uploadBtn = btn || null;
    openTip();
  }

  // iOS hands the pictures over in "compatible" format whatever the accept attribute
  // says, so it re-encodes every HEIC before the picker will close. That wait looks
  // exactly like a dead button, and the only cure is knowing it is coming.
  function openTip() {
    if (!uploadTip) {
      uploadTip = document.createElement("div");
      uploadTip.className = "up-tip";
      uploadTip.hidden = true;
      const card = document.createElement("div");
      card.className = "up-card";
      const head = document.createElement("h3");
      head.textContent = "手動上傳照片";
      card.appendChild(head);
      TIP_LINES.forEach(function (line) {
        const p = document.createElement("p");
        p.textContent = line;
        card.appendChild(p);
      });
      const btns = document.createElement("div");
      btns.className = "up-card-btns";
      const skip = document.createElement("button");
      skip.type = "button";
      skip.className = "up-skip";
      skip.textContent = "先不要";
      skip.addEventListener("click", function () {
        uploadTip.hidden = true;
      });
      const go = document.createElement("button");
      go.type = "button";
      go.className = "up-go";
      go.textContent = "選照片";
      // Reading the card takes longer than the few seconds iOS keeps a tap valid for,
      // so the picker has to open off this button rather than off the one behind it.
      go.addEventListener("click", function () {
        uploadTip.hidden = true;
        openPicker();
      });
      btns.appendChild(skip);
      btns.appendChild(go);
      card.appendChild(btns);
      uploadTip.appendChild(card);
      document.body.appendChild(uploadTip);
    }
    uploadTip.hidden = false;
  }

  function openPicker() {
    if (!uploadInput) {
      uploadInput = document.createElement("input");
      uploadInput.type = "file";
      uploadInput.accept = "image/*,video/*";
      uploadInput.multiple = true;
      uploadInput.setAttribute("aria-hidden", "true");
      uploadInput.style.cssText =
        "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none;";
      document.body.appendChild(uploadInput);
      uploadInput.addEventListener("change", function () {
        const picked = Array.prototype.slice.call(uploadInput.files || []);
        const who = uploadPerson;
        uploadInput.value = "";
        if (!picked.length || !who) return;
        // Let the strip paint before the sizes get added up, so a big pick does not
        // spend its first moment back from the picker looking just as dead as before.
        if (uploadBtn) uploadBtn.classList.add("is-run");
        paintUp("讀取 " + picked.length + " 張照片…", "", null);
        window.setTimeout(function () {
          sendUploads(who, picked);
        }, 50);
      });
    }
    uploadInput.value = "";
    uploadInput.click();
  }

  async function sendUploads(person, files) {
    if (uploadBusy) {
      fail("上一批還在傳，傳完再選下一批");
      return;
    }
    uploadBusy = true;
    const url = api("/api/upload?person=" + encodeURIComponent(person));
    // Grouped by weight rather than count: one pass of holiday videos and one pass of
    // screenshots are wildly different sizes, and a whole pick in one POST would be refused.
    const groups = [];
    let saved = 0;
    let already = 0;
    let failed = 0;
    let total = 0;
    let bytes = 0;
    files.forEach(function (f) {
      if (f.size > UPLOAD_CAP) {
        failed += 1;
        return;
      }
      if (!groups.length || bytes + f.size > BATCH_CAP) {
        groups.push([]);
        bytes = 0;
      }
      groups[groups.length - 1].push(f);
      bytes += f.size;
      total += f.size;
    });
    const note =
      "共 " +
      files.length +
      " 張、" +
      mb(total) +
      "，分 " +
      groups.length +
      " 批送。傳完之前請不要鎖螢幕或切到別的 App。";
    let done = 0;
    const why = [];
    function blame(word) {
      if (why.indexOf(word) < 0) why.push(word);
    }
    try {
      for (let i = 0; i < groups.length; i += 1) {
        const group = groups[i];
        const body = new FormData();
        let weight = 0;
        group.forEach(function (f) {
          body.append("photo", f, f.name || "photo.jpg");
          weight += f.size;
        });
        paintUp("上傳中 第 " + (i + 1) + " 批／共 " + groups.length + " 批", note, total ? done / total : 0);
        try {
          // A plain POST of form data needs no CORS preflight. Asking for byte level
          // progress does, and Safari does not report that progress anyway, so the
          // extra round trip would be one more thing to fail for nothing.
          const res = await fetch(url, { method: "POST", body: body });
          const data = await res.json().catch(function () {
            return null;
          });
          if (!res.ok || !data) {
            blame("伺服器回 " + res.status);
            failed += group.length;
          } else {
            saved += (data.saved || []).length;
            already += (data.already || []).length;
            failed += (data.rejected || []).length;
          }
        } catch (err) {
          blame("送不出去（" + (err && err.name ? err.name : "不明") + "）");
          failed += group.length;
        }
        done += weight;
      }
      const bits = [];
      if (saved) bits.push("收進來 " + saved + " 張");
      if (already) bits.push(already + " 張本來就有");
      if (failed) {
        bits.push(failed + " 張傳不上來" + (why.length ? "，" + why.join("、") : ""));
      }
      paintUp(bits.length ? bits.join("，") : "沒有新的照片", "", 1);
      if (saved) {
        lastCab = "";
        await boot();
        if (openPerson === person && window.FamilyFeed && window.FamilyFeed.refresh) {
          window.FamilyFeed.refresh();
        }
      }
    } catch (err) {
      paintUp("上傳出錯了：" + (err && err.message ? err.message : "連不上家裡那台"), "", null);
    } finally {
      uploadBusy = false;
      if (uploadBtn) uploadBtn.classList.remove("is-run");
      // The outcome has to survive long enough to be read, but the strip must not
      // become permanent furniture, so it takes itself away after a spell.
      closeUp(20000);
    }
  }

  function insButton(className, svg, label) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ins-icon " + className;
    btn.setAttribute("aria-label", label);
    btn.title = label;
    const ring = document.createElement("span");
    ring.className = "ins-ring";
    const face = document.createElement("span");
    face.className = "ins-face";
    face.innerHTML = svg;
    btn.appendChild(ring);
    btn.appendChild(face);
    return btn;
  }

  function bindCastTrash(btn) {
    let hold = 0;
    let raf = 0;
    let start = 0;
    let opened = false;
    function stopCast() {
      if (hold) {
        window.clearTimeout(hold);
        hold = 0;
      }
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      }
      btn.classList.remove("is-cast");
      btn.style.removeProperty("--cast");
    }
    function tick() {
      const t = Math.min(1, (Date.now() - start) / 2000);
      btn.style.setProperty("--cast", 360 * t + "deg");
      if (t < 1 && hold) raf = window.requestAnimationFrame(tick);
    }
    btn.addEventListener("pointerdown", function (ev) {
      if (ev.button && ev.button !== 0) return;
      ev.preventDefault();
      opened = false;
      stopCast();
      btn.classList.add("is-cast");
      start = Date.now();
      raf = window.requestAnimationFrame(tick);
      try {
        btn.setPointerCapture(ev.pointerId);
      } catch (e) {}
      hold = window.setTimeout(function () {
        hold = 0;
        opened = true;
        stopCast();
        if (window.FamilyFeed) window.FamilyFeed.openTrash();
      }, 2000);
    });
    function endCast() {
      if (opened) return;
      const held = Date.now() - start;
      stopCast();
      if (held >= 2000) return;
      if (held < 450 && window.FamilyFeed) window.FamilyFeed.trashSelected();
    }
    btn.addEventListener("pointerup", endCast);
    btn.addEventListener("pointercancel", function () {
      opened = false;
      stopCast();
    });
  }

  function cabCard(p) {
    const hud = document.createElement("div");
    hud.className = "cab-hud";
    hud.dataset.person = p.id;
    const wrap = document.createElement("div");
    wrap.className = "cab-wrap";
    const a = document.createElement("a");
    a.className = "cab" + (p.has_cover ? " has-cover" : "");
    a.href = "#" + p.id;
    a.dataset.name = p.display_name;
    a.setAttribute("aria-label", p.display_name);
    const cover = document.createElement("div");
    cover.className = "cab-cover";
    const ring = document.createElement("div");
    ring.className = "cab-ring";
    const face = document.createElement("div");
    face.className = "cab-face";
    if (p.has_cover) {
      const img = document.createElement("img");
      img.alt = p.display_name;
      img.decoding = "async";
      img.src = api("/cover?person=" + encodeURIComponent(p.id) + "&v=" + (p.cover_rev || 0));
      face.appendChild(img);
    } else {
      const empty = document.createElement("div");
      empty.className = "cab-empty-name";
      empty.textContent = p.display_name;
      face.appendChild(empty);
    }
    cover.appendChild(ring);
    cover.appendChild(face);
    a.appendChild(cover);
    wrap.appendChild(a);
    const pick = insButton("cab-pick", CAMERA, p.has_cover ? "換封面" : "選封面");
    pick.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      pickCover(p.id);
    });
    const refresh = insButton("cab-refresh", REFRESH, "檢查並備份");
    refresh.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      startBackup(p.id, refresh);
    });
    const send = insButton("cab-send", UPLOAD, "手動上傳照片");
    send.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      pickUpload(p.id, send);
    });
    const bars = document.createElement("div");
    bars.className = "cab-bars";
    bars.appendChild(hpRow("backup"));
    bars.appendChild(hpRow("tag"));
    const actions = document.createElement("div");
    actions.className = "cab-actions";
    actions.appendChild(refresh);
    actions.appendChild(send);
    actions.appendChild(pick);
    const side = document.createElement("div");
    side.className = "cab-side";
    side.appendChild(bars);
    side.appendChild(actions);
    hud.appendChild(wrap);
    hud.appendChild(side);
    fillHud(hud, p);
    return hud;
  }

  function hpRow(kind) {
    const row = document.createElement("div");
    row.className = "hp";
    row.dataset.kind = kind;
    const label = document.createElement("div");
    label.className = "hp-label";
    const text = document.createElement("span");
    text.className = "hp-text";
    const mark = document.createElement("span");
    mark.className = "hp-check";
    mark.hidden = true;
    mark.innerHTML = CHECK;
    label.appendChild(text);
    label.appendChild(mark);
    const meter = document.createElement("div");
    meter.className = "hp-meter";
    const track = document.createElement("div");
    track.className = "hp-track";
    const fill = document.createElement("div");
    fill.className = "hp-fill";
    track.appendChild(fill);
    const num = document.createElement("span");
    num.className = "hp-num";
    meter.appendChild(track);
    meter.appendChild(num);
    row.appendChild(label);
    row.appendChild(meter);
    return row;
  }

  function fillHud(hud, p) {
    const id = p.id;
    const backupRun = p.sync === "running";
    if (!backupRun) backupAsk[id] = false;
    if (!backupRun && (p.sync === "synced" || p.percent === 100)) {
      try {
        localStorage.setItem("family.backupDone." + id, "1");
      } catch (e) {}
    }
    let remembered = false;
    try {
      remembered = localStorage.getItem("family.backupDone." + id) === "1";
    } catch (e) {}
    const showRun = backupRun && backupAsk[id];
    const backupDone = !showRun && (remembered || p.sync === "synced" || p.percent === 100);
    paintHp(hud.querySelector('.hp[data-kind="backup"]'), {
      running: showRun,
      done: backupDone,
      percent: p.percent,
      busyText: "自動備份中…",
      doneText: "備份完成",
      waitText: "尚未檢查",
    });
    const job = p.tag || {};
    const tagRun = job.state === "running";
    const tagDone = !tagRun && job.percent === 100;
    paintHp(hud.querySelector('.hp[data-kind="tag"]'), {
      running: tagRun,
      done: tagDone,
      percent: job.percent,
      busyText: "自動標記中…",
      doneText: "標記完成",
      waitText: "自動標記中…",
    });
    const refresh = hud.querySelector(".cab-refresh");
    if (refresh) refresh.classList.toggle("is-run", showRun);
    const cover = hud.querySelector(".cab-cover");
    if (cover) cover.classList.toggle("is-run", showRun);
  }

  function paintHp(row, view) {
    if (!row) return;
    const text = row.querySelector(".hp-text");
    const mark = row.querySelector(".hp-check");
    const fill = row.querySelector(".hp-fill");
    const num = row.querySelector(".hp-num");
    const pct = view.percent == null ? null : Number(view.percent);
    const shown = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : null;
    if (text) {
      text.textContent = view.running
        ? view.busyText
        : view.done
          ? view.doneText
          : view.waitText;
    }
    if (mark) mark.hidden = !view.done;
    if (fill) fill.style.width = (view.done ? 100 : shown == null ? 0 : shown) + "%";
    if (num) {
      if (view.done) num.textContent = "";
      else if (shown == null) num.textContent = view.running ? "…" : "";
      else num.textContent = shown + "%";
    }
    row.classList.toggle("is-run", !!view.running);
    row.classList.toggle("is-done", !!view.done);
  }

  function paintHud(people) {
    if (!cabs) return;
    (people || []).forEach(function (p) {
      const hud = cabs.querySelector('.cab-hud[data-person="' + p.id + '"]');
      if (hud) fillHud(hud, p);
    });
  }

  function startBackup(person, btn) {
    backupAsk[person] = true;
    try {
      localStorage.removeItem("family.backupDone." + person);
    } catch (e) {}
    if (btn) btn.classList.add("is-run");
    fetch(api("/api/sync?person=" + encodeURIComponent(person)), { method: "POST" })
      .then(function (res) {
        return res.json().then(function (j) {
          return { res: res, j: j };
        });
      })
      .then(function (x) {
        if (!x.res.ok && x.j && x.j.sync !== "running") {
          throw new Error(x.j.error || "fail");
        }
        lastCab = "";
        boot();
      })
      .catch(function () {
        fail("現在同步不了，請聯絡維護的那個傢伙");
        if (btn) btn.classList.remove("is-run");
      });
  }

  function cardStamp(people) {
    return JSON.stringify(
      (people || []).map(function (p) {
        return {
          id: p.id,
          sync: p.sync,
          has_cover: p.has_cover,
          cover_rev: p.cover_rev,
          display_name: p.display_name,
        };
      })
    );
  }

  async function boot() {
    if (!ORIGIN) {
      fail(DISCONNECTED);
      return;
    }
    if (!window.FAMILY_VIEW_KEY) {
      fail(NEED_LINK);
      if (cabs) cabs.innerHTML = "";
      lastCab = "";
      return;
    }
    try {
      const pub = await readJson("/api/public");
      if (statusEl) statusEl.textContent = lineFrom(pub);
      const cab = await readJson("/api/cabinets");
      names = {};
      (cab.people || []).forEach(function (p) {
        names[p.id] = p.display_name;
      });
      const stamp = cardStamp(cab.people);
      if (cabs && stamp !== lastCab) {
        lastCab = stamp;
        cabs.innerHTML = "";
        (cab.people || []).forEach(function (p) {
          cabs.appendChild(cabCard(p));
        });
      } else {
        paintHud(cab.people);
      }
      window._familyRunning = (cab.people || []).some(function (p) {
        return p.sync === "running";
      });
      window._familyTagging = (cab.people || []).some(function (p) {
        return p.tag && p.tag.state === "running";
      });
    } catch (err) {
      fail(err && err.code === "need_key" ? NEED_LINK : DISCONNECTED);
    }
    route();
  }

  function route() {
    const id = personFromHash();
    const only = onlyPerson();
    if ((!id || !names[id]) && only) {
      showAlbum(only, names[only]);
      return;
    }
    if (!id || !names[id]) {
      showHome();
      return;
    }
    const link = cabs ? cabs.querySelector('a[href="#' + id + '"]') : null;
    showAlbum(id, (link && link.dataset.name) || names[id] || id);
  }

  function isRailStatus(text) {
    return (
      text.indexOf("已選") === 0 ||
      text.indexOf("請點選") === 0 ||
      text.indexOf("正在下載") === 0 ||
      text.indexOf("已下載") === 0 ||
      text.indexOf("已送出") === 0 ||
      text === "正在看垃圾桶"
    );
  }

  function showRail(on) {
    const rail = ensureRail();
    if (rail) rail.hidden = !on;
  }

  function ensureRail() {
    const rail = document.getElementById("photo-rail");
    if (!rail) return null;
    if (rail.dataset.ready) return rail;
    rail.dataset.ready = "1";
    const hash = insButton("rail-hash", HASH, "新增標記");
    hash.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (!window.FamilyFeed || !window.FamilyFeed.prepareAction()) return;
      const label = window.prompt("要加上的標記名稱");
      if (!label) return;
      window.FamilyFeed.tagSelected(label);
    });
    const trash = insButton("rail-trash", TRASH, "丟進垃圾桶");
    bindCastTrash(trash);
    const down = insButton("rail-down", DOWNLOAD, "下載");
    down.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (window.FamilyFeed) window.FamilyFeed.downloadSelected();
    });
    rail.appendChild(hash);
    rail.appendChild(trash);
    rail.appendChild(down);
    return rail;
  }

  if (albumCoverBtn) {
    albumCoverBtn.innerHTML = CAMERA;
    albumCoverBtn.addEventListener("click", function () {
      const person = albumCoverBtn.dataset.person || openPerson;
      if (person) pickCover(person);
    });
  }
  (function albumTools() {
    const head = document.querySelector(".album-head");
    if (!head) return;
    let tools = document.getElementById("album-tools");
    if (!tools) {
      tools = document.createElement("div");
      tools.id = "album-tools";
      tools.className = "album-tools";
      if (albumCoverBtn && albumCoverBtn.parentNode === head) {
        head.appendChild(tools);
        tools.appendChild(albumCoverBtn);
      } else {
        head.appendChild(tools);
      }
    }
  })();
  window.FamilyDoor = {
    setSelect: function (count, inTrash, hint) {
      const n = Number(count) || 0;
      if (statusEl) {
        if (inTrash) statusEl.textContent = "正在看垃圾桶";
        else if (hint) statusEl.textContent = hint;
        else if (n > 0) statusEl.textContent = "已選 " + n + " / 99";
        else if (isRailStatus(statusEl.textContent)) {
          statusEl.textContent = "";
        }
      }
    },
  };
  window.addEventListener("hashchange", route);
  boot();
  (function poll() {
    const wait = window._familyRunning || window._familyTagging ? 3000 : 12000;
    setTimeout(function () {
      if (!ORIGIN) {
        poll();
        return;
      }
      Promise.resolve(boot()).then(poll);
    }, wait);
  })();
})();
