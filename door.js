(function () {
  const ORIGIN = (window.VAULT_ORIGIN || "").replace(/\/$/, "");
  const NEED_LINK = "請用給你的專用連結打開";
  const DISCONNECTED = "目前無法連上,請聯絡維護的那個傢伙";
  const CHECK =
    '<span class="ios-check" aria-label="已同步"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#34c759"/><path fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M7.2 12.4l3.1 3.2 6.5-7.2"/></svg></span>';
  const statusEl = document.getElementById("status");
  const cabs = document.getElementById("cabinets");
  const album = document.getElementById("album");
  const albumTitle = document.getElementById("album-title");
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
  let upBar = null;
  let upHide = 0;
  let latestPeople = {};
  let uploadViews = {};
  let settingsWrap = null;
  const UPLOAD_CAP = 480 * 1024 * 1024;
  // Small enough that a phone finishes one before anything between it and the vault
  // gives up, and that the bar moves often, since Safari reports no progress of its own.
  const BATCH_CAP = 12 * 1024 * 1024;
  let backupAsk = {};
  let heldByPerson = {};
  let selectLine = "";
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
  const GEAR =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.6 3.8l.6-1.3h3.6l.6 1.3 1.6.7 1.4-.5 2.5 2.5-.5 1.4.7 1.6 1.3.6v3.6l-1.3.6-.7 1.6.5 1.4-2.5 2.5-1.4-.5-1.6.7-.6 1.3h-3.6l-.6-1.3-1.6-.7-1.4.5-2.5-2.5.5-1.4-.7-1.6-1.3-.6v-3.6l1.3-.6.7-1.6-.5-1.4L6.6 4l1.4.5 1.6-.7z" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linejoin="round"/><circle cx="12" cy="11.9" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

  function api(path) {
    const url = ORIGIN + path;
    const k = window.FAMILY_VIEW_KEY;
    if (!k) return url;
    return url + (path.indexOf("?") >= 0 ? "&" : "?") + "k=" + encodeURIComponent(k);
  }

  function lineFrom(data) {
    if (!data) return DISCONNECTED;
    return "";
  }

  async function readJson(path) {
    const ctrl = new AbortController();
    const timer = setTimeout(function () {
      ctrl.abort();
    }, 20000);
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

  function heldKeySet(keys) {
    const set = {};
    (keys || []).forEach(function (k) {
      set[k] = true;
    });
    return set;
  }

  function fileIsHeld(file, set) {
    if (!set) return false;
    const name = ((file && file.name) || "").split(/[/\\]/).pop();
    const dot = name.lastIndexOf(".");
    const base = (dot > 0 ? name.slice(0, dot) : name).toUpperCase();
    if (!base) return false;
    if (set[base]) return true;
    let ym = "";
    if (file && file.lastModified) {
      const d = new Date(file.lastModified);
      if (!Number.isNaN(d.getTime())) {
        ym = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      }
    }
    if (ym && set[ym + "|" + base]) return true;
    let m = /^(IMG_)E?([0-9]+)/i.exec(base);
    let token = "";
    if (m) token = "IMG_" + m[2];
    else {
      m = /^(IMG_[0-9A-Z]+)/i.exec(base);
      if (m) token = m[1].toUpperCase();
    }
    return !!(token && ym && set[ym + "|" + token]);
  }

  function fetchHeld(person) {
    const hit = heldByPerson[person];
    if (hit && Date.now() - hit.at < 10 * 60 * 1000) {
      return Promise.resolve(hit.set);
    }
    const ctrl = new AbortController();
    const timer = setTimeout(function () {
      ctrl.abort();
    }, 20000);
    return fetch(api("/api/held?person=" + encodeURIComponent(person)), { signal: ctrl.signal })
      .then(function (res) {
        if (!res.ok) throw new Error("held");
        return res.json();
      })
      .then(function (j) {
        const set = heldKeySet((j && j.keys) || []);
        heldByPerson[person] = { at: Date.now(), set: set };
        return set;
      })
      .catch(function () {
        return null;
      })
      .finally(function () {
        clearTimeout(timer);
      });
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
    showSettings(false);
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
    if (window.FamilyTags) window.FamilyTags.show(person);
    showRail(false);
    showSettings(true, person);
    const hud = cabs && cabs.querySelector('.cab-hud[data-person="' + person + '"]');
    const p = latestPeople[person];
    if (hud && p) fillHud(hud, p);
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
    const status = hpRow("backup");
    status.classList.add("up-status");
    const sub = document.createElement("div");
    sub.className = "up-sub";
    upBar.appendChild(status);
    upBar.appendChild(sub);
    document.body.appendChild(upBar);
    return upBar;
  }

  function paintUp(view, sub) {
    const bar = upNode();
    if (upHide) {
      window.clearTimeout(upHide);
      upHide = 0;
    }
    bar.hidden = false;
    paintHp(bar.querySelector(".hp"), view);
    bar.querySelector(".up-sub").textContent = sub || "";
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
    if (uploadBusy) {
      fail("上一批還在傳，傳完再選下一批");
      return;
    }
    uploadPerson = person;
    uploadBtn = btn || null;
    openPicker();
  }

  // iOS re-encodes every HEIC before it will part with a pick, and keeps its own picker
  // on screen until the last one is done. Nothing here runs or can be seen during that
  // wait, so the strip below can only start once the pictures are already in hand.
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
        // The input keeps its pick until the next one is opened. Emptying it here would
        // be tidier, but iOS backs each File with a temporary file it is free to drop
        // the moment the input lets go, and then the vault is handed nothing at all.
        const picked = Array.prototype.slice.call(uploadInput.files || []);
        const who = uploadPerson;
        if (!picked.length || !who) return;
        // Let the strip paint before the sizes get added up, so a big pick does not
        // spend its first moment back from the picker looking just as dead as before.
        if (uploadBtn) uploadBtn.classList.add("is-run");
        paintUpload(
          who,
          {
            running: true,
            done: false,
            percent: 0,
            doneCount: 0,
            totalCount: picked.length,
            busyText: "備份中...",
            doneText: "備份完成",
            waitText: "尚未檢查",
          },
          ""
        );
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
    const held = await fetchHeld(person);
    const fresh = [];
    let already = 0;
    files.forEach(function (f) {
      if (held && fileIsHeld(f, held)) already += 1;
      else fresh.push(f);
    });
    if (!fresh.length) {
      paintUpload(
        person,
        {
          running: false,
          done: true,
          percent: 100,
          doneCount: files.length,
          totalCount: files.length,
          busyText: "備份中...",
          doneText: "備份完成",
          waitText: "尚未檢查",
        },
        already ? already + " 張本來就有" : "沒有新的照片"
      );
      uploadBusy = false;
      if (uploadBtn) uploadBtn.classList.remove("is-run");
      closeUp(20000);
      clearUploadView(person, 20000);
      return;
    }
    // Grouped by weight rather than count: one pass of holiday videos and one pass of
    // screenshots are wildly different sizes, and a whole pick in one POST would be refused.
    const groups = [];
    let saved = 0;
    let failed = 0;
    let total = 0;
    let bytes = 0;
    fresh.forEach(function (f) {
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
    let handled = already;
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
        paintUpload(
          person,
          {
            running: true,
            done: false,
            percent: total ? Math.round((done * 100) / total) : 0,
            doneCount: handled,
            totalCount: files.length,
            busyText: "備份中...",
            doneText: "備份完成",
            waitText: "尚未檢查",
          },
          note
        );
        try {
          // A plain POST of form data needs no CORS preflight. Asking for byte level
          // progress does, and Safari does not report that progress anyway, so the
          // extra round trip would be one more thing to fail for nothing.
          const res = await fetch(url, { method: "POST", body: body });
          const data = await res.json().catch(function () {
            return null;
          });
          if (!res.ok || !data) {
            blame((data && data.error) || "伺服器回 " + res.status);
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
        handled += group.length;
      }
      const bits = [];
      if (saved) bits.push("收進來 " + saved + " 張");
      if (already) bits.push(already + " 張本來就有");
      if (failed) {
        bits.push(failed + " 張傳不上來" + (why.length ? "，" + why.join("、") : ""));
      }
      const complete = Math.min(files.length, saved + already);
      paintUpload(
        person,
        {
          running: false,
          done: failed === 0,
          error: failed > 0,
          errorText: "備份未完成",
          percent: failed ? Math.round((complete * 100) / Math.max(1, files.length)) : 100,
          doneCount: complete,
          totalCount: files.length,
          busyText: "備份中...",
          doneText: "備份完成",
          waitText: "尚未檢查",
        },
        bits.length ? bits.join("，") : "沒有新的照片"
      );
      if (saved) {
        delete heldByPerson[person];
        lastCab = "";
        await boot();
        if (openPerson === person && window.FamilyFeed && window.FamilyFeed.refresh) {
          window.FamilyFeed.refresh();
        }
      }
    } catch (err) {
      paintUpload(
        person,
        {
          running: false,
          done: false,
          error: true,
          errorText: "備份失敗",
          percent: null,
          doneCount: 0,
          totalCount: files.length,
          busyText: "備份中...",
          doneText: "備份完成",
          waitText: "尚未檢查",
        },
        err && err.message ? err.message : "連不上家裡那台"
      );
    } finally {
      uploadBusy = false;
      if (uploadBtn) uploadBtn.classList.remove("is-run");
      // The outcome has to survive long enough to be read, but the strip must not
      // become permanent furniture, so it takes itself away after a spell.
      closeUp(20000);
      clearUploadView(person, 20000);
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

  function closeSettings() {
    const wrap = settingsWrap || document.getElementById("album-settings");
    if (!wrap) return;
    const menu = wrap.querySelector(".settings-menu");
    const toggle = wrap.querySelector(".settings-toggle");
    if (menu) menu.hidden = true;
    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
      toggle.classList.remove("is-live");
    }
  }

  function jobBadge(svg) {
    const badge = document.createElement("span");
    badge.className = "ins-icon job-icon";
    badge.setAttribute("aria-hidden", "true");
    const ring = document.createElement("span");
    ring.className = "ins-ring";
    const face = document.createElement("span");
    face.className = "ins-face";
    face.innerHTML = svg;
    badge.appendChild(ring);
    badge.appendChild(face);
    return badge;
  }

  function setJobRun(entry, on) {
    if (!entry) return;
    entry.classList.toggle("is-run", !!on);
    entry.disabled = !!on;
    entry.setAttribute("aria-disabled", on ? "true" : "false");
    const badge = entry.querySelector(".ins-icon");
    if (badge) badge.classList.toggle("is-run", !!on);
  }

  function ensureSettings() {
    if (settingsWrap && settingsWrap.isConnected) return settingsWrap;
    settingsWrap = null;
    const wrap = document.createElement("div");
    settingsWrap = wrap;
    wrap.id = "album-settings";
    wrap.className = "album-settings";
    wrap.hidden = true;
    const toggle = insButton("settings-toggle", GEAR, "設定");
    toggle.setAttribute("aria-expanded", "false");
    const menu = document.createElement("div");
    menu.className = "settings-menu";
    menu.setAttribute("role", "menu");
    menu.hidden = true;
    function entry(svg, label, action, job) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "settings-entry";
      btn.setAttribute("role", "menuitem");
      if (job) btn.dataset.job = job;
      btn.appendChild(jobBadge(svg));
      const text = document.createElement("span");
      text.textContent = label;
      btn.appendChild(text);
      btn.addEventListener("click", function () {
        if (btn.classList.contains("is-run") || btn.disabled) return;
        closeSettings();
        action();
      });
      return btn;
    }
    menu.appendChild(
      entry(REFRESH, "備份iCloud照片", function () {
        const pid = wrap.dataset.person || openPerson;
        if (pid) startBackup(pid);
      }, "icloud")
    );
    menu.appendChild(
      entry(UPLOAD, "備份本機照片", function () {
        const pid = wrap.dataset.person || openPerson;
        if (pid) pickUpload(pid);
      }, "local")
    );
    menu.appendChild(
      entry(CAMERA, "更換大頭照", function () {
        const pid = wrap.dataset.person || openPerson;
        if (pid) pickCover(pid);
      })
    );
    menu.appendChild(
      entry(TRASH, "開啟垃圾桶", function () {
        if (window.FamilyFeed) window.FamilyFeed.openTrash();
      })
    );
    toggle.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      const open = menu.hidden;
      menu.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.classList.toggle("is-live", open);
    });
    wrap.appendChild(toggle);
    wrap.appendChild(menu);
    document.body.appendChild(wrap);
    document.addEventListener("pointerdown", function (ev) {
      if (!wrap.contains(ev.target)) closeSettings();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") closeSettings();
    });
    return wrap;
  }

  function showSettings(on, pid) {
    const wrap = ensureSettings();
    pid = pid || openPerson;
    if (on && pid && cabs) {
      const host = cabs.querySelector(
        '.cab-hud[data-person="' + pid + '"] .cab-wrap'
      );
      if (host && wrap.parentNode !== host) host.appendChild(wrap);
      wrap.dataset.person = pid;
    }
    wrap.hidden = !on;
    if (!on) closeSettings();
  }

  function bindCastTrash(btn) {
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (window.FamilyFeed) window.FamilyFeed.trashSelected();
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
    const liquid = document.createElement("div");
    liquid.className = "cab-liquid";
    liquid.hidden = true;
    liquid.innerHTML =
      '<span class="cab-wave cab-wave-back"></span><span class="cab-wave cab-wave-front"></span>';
    cover.appendChild(liquid);
    const think = document.createElement("div");
    think.className = "thinking-five";
    think.setAttribute("aria-hidden", "true");
    think.hidden = true;
    think.innerHTML = "<span></span><span></span><span></span><span></span><span></span>";
    cover.appendChild(think);
    a.appendChild(cover);
    wrap.appendChild(a);
    const cap = document.createElement("div");
    cap.className = "cab-caption";
    cap.hidden = true;
    const capText = document.createElement("span");
    capText.className = "hp-text";
    const capAlt = document.createElement("span");
    capAlt.className = "hp-alt";
    capAlt.hidden = true;
    capAlt.innerHTML = '<span class="hp-alt-pct"></span><span class="hp-alt-count"></span>';
    cap.appendChild(capText);
    cap.appendChild(capAlt);
    hud.appendChild(wrap);
    hud.appendChild(cap);
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
    const alt = document.createElement("span");
    alt.className = "hp-alt";
    alt.hidden = true;
    alt.innerHTML = '<span class="hp-alt-pct"></span><span class="hp-alt-count"></span>';
    const mark = document.createElement("span");
    mark.className = "hp-check";
    mark.hidden = true;
    mark.innerHTML = CHECK;
    const think = document.createElement("div");
    think.className = "thinking-five hp-think";
    think.setAttribute("aria-hidden", "true");
    think.innerHTML = "<span></span><span></span><span></span><span></span><span></span>";
    think.hidden = true;
    label.appendChild(text);
    label.appendChild(alt);
    label.appendChild(think);
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

  function setUploadView(person, view) {
    uploadViews[person] = view;
    const p = latestPeople[person];
    const hud = cabs && cabs.querySelector('.cab-hud[data-person="' + person + '"]');
    if (p && hud) fillHud(hud, p);
  }

  function paintUpload(person, view) {
    setUploadView(person, view);
  }

  function clearUploadView(person, after) {
    const view = uploadViews[person];
    window.setTimeout(function () {
      if (uploadViews[person] !== view) return;
      delete uploadViews[person];
      const p = latestPeople[person];
      const hud = cabs && cabs.querySelector('.cab-hud[data-person="' + person + '"]');
      if (p && hud) fillHud(hud, p);
    }, after);
  }

  function fillAmount(running, percent) {
    if (!running) return null;
    const n = Number(percent);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, n));
    return 42;
  }

  function paintBackdrop() {
    const hall = document.getElementById("hall");
    if (hall && hall.classList.contains("is-invite")) return;
    let on = !!uploadBusy;
    Object.keys(latestPeople).forEach(function (id) {
      const person = latestPeople[id];
      if (!person) return;
      const local = uploadViews[id];
      if ((local && local.running) || person.sync === "running" || backupAsk[id]) on = true;
      if (person.tag && person.tag.state === "running") on = true;
    });
    const blobs = document.getElementById("blobs");
    if (blobs) blobs.hidden = !on;
    document.documentElement.classList.toggle("is-backing", !!on);
  }

  function paintCap(el, view, idle) {
    if (!el) return;
    if (view && (view.running || view.error)) {
      el.hidden = false;
      paintHp(el, view);
      return;
    }
    if (idle) {
      el.hidden = false;
      const text = el.querySelector(".hp-text");
      const alt = el.querySelector(".hp-alt");
      if (text) text.textContent = idle;
      if (alt) alt.hidden = true;
      el.classList.remove("is-run", "is-wait", "is-done", "is-error");
      return;
    }
    el.hidden = true;
  }

  function fillHud(hud, p) {
    const id = p.id;
    const local = uploadViews[id] || null;
    const backupRun = p.sync === "running";
    if (backupRun) backupAsk[id] = false;
    if (!backupRun && (p.sync === "synced" || p.percent === 100)) {
      try {
        localStorage.setItem("family.backupDone." + id, "1");
      } catch (e) {}
    }
    const localRun = !!(local && local.running) || (uploadBusy && uploadPerson === id);
    const icloudRun = !localRun && (backupRun || !!backupAsk[id]);
    const showRun = localRun || icloudRun;
    const shownLocal = local && (local.running || !showRun) ? local : null;
    let busyText = "備份中...";
    if (!shownLocal && p.backup_phase === "checking") busyText = "核對中...";
    if (!shownLocal && p.backup_phase === "retry") busyText = "重新連線...";
    const backupView = {
      running: showRun,
      done: false,
      error: !!(shownLocal && shownLocal.error),
      errorText: shownLocal && shownLocal.errorText,
      percent: shownLocal && shownLocal.percent != null ? shownLocal.percent : p.percent,
      doneCount: shownLocal ? shownLocal.doneCount : p.backup_done,
      totalCount: shownLocal ? shownLocal.totalCount : p.backup_total,
      busyText: busyText,
      doneText: "備份完成",
      waitText: "尚未檢查",
    };
    const job = p.tag || {};
    const tagRun = job.state === "running";
    const tagView = {
      running: tagRun,
      done: false,
      percent: tagRun ? job.percent : null,
      busyText: "自動標記中…",
      doneText: "標記完成",
      waitText: "尚未標記",
    };
    const backupFill = fillAmount(showRun, backupView.percent);
    const tagFill = fillAmount(tagRun, tagView.percent);
    let fill = 0;
    const liquidOn = showRun || tagRun;
    if (showRun && tagRun) {
      fill = ((backupFill == null ? 42 : backupFill) + (tagFill == null ? 42 : tagFill)) / 2;
    } else if (showRun) {
      fill = backupFill == null ? 42 : backupFill;
    } else if (tagRun) {
      fill = tagFill == null ? 42 : tagFill;
    }
    const cover = hud.querySelector(".cab-cover");
    if (cover) cover.classList.toggle("is-run", liquidOn);
    const liquid = hud.querySelector(".cab-liquid");
    if (liquid) {
      liquid.hidden = !liquidOn;
      liquid.style.setProperty("--fill", fill + "%");
      liquid.classList.toggle("is-local", localRun);
    }
    const think = hud.querySelector(".cab-cover > .thinking-five");
    if (think) think.hidden = !liquidOn;
    const cap = hud.querySelector(".cab-caption");
    if (showRun || (shownLocal && shownLocal.error)) paintCap(cap, backupView, "");
    else if (tagRun) paintCap(cap, tagView, "");
    else paintCap(cap, null, selectLine);
    const box = settingsWrap || document.getElementById("album-settings");
    if (box && box.dataset.person === id) {
      setJobRun(box.querySelector('[data-job="icloud"]'), icloudRun);
      setJobRun(box.querySelector('[data-job="local"]'), localRun);
    }
    paintBackdrop();
  }

  function paintHp(row, view) {
    if (!row) return;
    const text = row.querySelector(".hp-text");
    const alt = row.querySelector(".hp-alt");
    const mark = row.querySelector(".hp-check");
    const fill = row.querySelector(".hp-fill");
    const num = row.querySelector(".hp-num");
    const pct = view.percent == null ? null : Number(view.percent);
    const shown = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : null;
    if (text) {
      text.textContent = view.error
        ? view.errorText || "備份失敗"
        : view.running
          ? view.busyText
          : view.done
            ? view.doneText
            : view.waitText;
    }
    if (alt) {
      const doneCount = Number(view.doneCount);
      const totalCount = Number(view.totalCount);
      const hasCount =
        view.running &&
        Number.isFinite(doneCount) &&
        Number.isFinite(totalCount) &&
        totalCount > 0;
      const hasPercent = view.running && shown != null;
      alt.querySelector(".hp-alt-pct").textContent = hasPercent ? Math.round(shown) + "%" : "";
      alt.querySelector(".hp-alt-count").textContent = hasCount
        ? Math.max(0, Math.round(doneCount)) + "/" + Math.round(totalCount)
        : "";
      alt.hidden = !hasPercent && !hasCount;
      alt.classList.toggle("has-two", hasPercent && hasCount);
      alt.classList.toggle("count-only", !hasPercent && hasCount);
    }
    if (mark) mark.hidden = !view.done;
    const think = row.querySelector(".hp-think");
    if (think) think.hidden = !view.running;
    if (fill) fill.style.width = (view.done ? 100 : shown == null ? (view.running ? 42 : 0) : shown) + "%";
    if (num) {
      num.textContent = "";
    }
    row.classList.toggle("is-run", !!view.running);
    row.classList.toggle("is-wait", !!view.running && shown == null);
    row.classList.toggle("is-done", !!view.done);
    row.classList.toggle("is-error", !!view.error);
  }

  function paintHud(people) {
    if (!cabs) return;
    (people || []).forEach(function (p) {
      const hud = cabs.querySelector('.cab-hud[data-person="' + p.id + '"]');
      if (hud) fillHud(hud, p);
    });
  }

  function startBackup(person) {
    const row = latestPeople[person];
    if (backupAsk[person] || (row && row.sync === "running")) return;
    backupAsk[person] = true;
    try {
      localStorage.removeItem("family.backupDone." + person);
    } catch (e) {}
    const hud = cabs && cabs.querySelector('.cab-hud[data-person="' + person + '"]');
    if (hud && row) fillHud(hud, row);
    else if (hud) {
      const cover = hud.querySelector(".cab-cover");
      if (cover) cover.classList.add("is-run");
      const liquid = hud.querySelector(".cab-liquid");
      if (liquid) {
        liquid.hidden = false;
        liquid.style.setProperty("--fill", "42%");
        liquid.classList.remove("is-local");
      }
      const think = hud.querySelector(".cab-cover > .thinking-five");
      if (think) think.hidden = false;
    }
    paintBackdrop();
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
        backupAsk[person] = false;
        fail("現在同步不了，請聯絡維護的那個傢伙");
        const p = latestPeople[person];
        const next = cabs && cabs.querySelector('.cab-hud[data-person="' + person + '"]');
        if (p && next) fillHud(next, p);
        else paintBackdrop();
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
      fail(
        window.navigator.standalone
          ? "請刪掉圖示，用 Safari 打開專用連結後再加入"
          : NEED_LINK
      );
      if (cabs) cabs.innerHTML = "";
      lastCab = "";
      return;
    }
    try {
      const pub = await readJson("/api/public");
      if (statusEl) statusEl.textContent = lineFrom(pub);
      const cab = await readJson("/api/cabinets");
      names = {};
      latestPeople = {};
      (cab.people || []).forEach(function (p) {
        names[p.id] = p.display_name;
        latestPeople[p.id] = p;
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
      if (err && err.code === "need_key") {
        fail(NEED_LINK);
        return;
      }
      if (lastCab) return;
      fail(DISCONNECTED);
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
    document.documentElement.classList.toggle("has-rail", !!on);
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
      if (window.FamilyTags && window.FamilyTags.openBatch) {
        window.FamilyTags.openBatch();
      }
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

  window.FamilyDoor = {
    boot: function () {
      boot();
      startPoll();
    },
    setSelect: function (count, inTrash, hint) {
      const n = Number(count) || 0;
      if (inTrash) selectLine = "正在看垃圾桶";
      else if (hint) selectLine = hint;
      else if (n > 0) selectLine = "已選 " + n + " / 99";
      else selectLine = "";
      if (statusEl && isRailStatus(statusEl.textContent)) statusEl.textContent = "";
      const pid = openPerson;
      const p = pid && latestPeople[pid];
      const hud = pid && cabs && cabs.querySelector('.cab-hud[data-person="' + pid + '"]');
      if (p && hud) fillHud(hud, p);
    },
    setRail: function (on) {
      showRail(!!on);
    },
  };
  window.addEventListener("hashchange", route);
  let polling = false;
  function startPoll() {
    if (polling) return;
    polling = true;
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
  }
  if (window.FamiphotoGate) {
    window.FamiphotoGate.start();
  } else {
    boot();
    startPoll();
  }
})();
