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
  let backupAsk = {};
  const CAMERA =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="8" width="17" height="11.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 8l1.4-2.4h5.2L16 8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="13.6" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
  const REFRESH =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M20 4.5V9h-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const TRASH =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8V6.8A1.8 1.8 0 0 1 9.8 5h4.4A1.8 1.8 0 0 1 16 6.8V8M5 8h14M9 11v7M12 11v7M15 11v7M7 8l.8 12.2A1.6 1.6 0 0 0 9.4 22h5.2a1.6 1.6 0 0 0 1.6-1.8L17 8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const HASH =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4l-1.2 16M15.2 4l-1.2 16M4.5 9h15M4 15h15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

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
    if (openPerson === person) return;
    openPerson = person;
    if (window.FamilyFeed) window.FamilyFeed.start(person);
  }

  function fail(msg) {
    if (statusEl) statusEl.textContent = msg || DISCONNECTED;
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
    const trash = insButton("cab-trash", TRASH, "丟進垃圾桶");
    trash.hidden = true;
    bindCastTrash(trash);
    const hash = insButton("cab-hash", HASH, "新增多張標記");
    hash.hidden = true;
    hash.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      const label = window.prompt("要加到選取照片的標記名稱");
      if (!label || !window.FamilyFeed) return;
      window.FamilyFeed.tagSelected(label);
    });
    const refresh = insButton("cab-refresh", REFRESH, "檢查並備份");
    refresh.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      startBackup(p.id, refresh);
    });
    const bars = document.createElement("div");
    bars.className = "cab-bars";
    bars.appendChild(hpRow("backup"));
    bars.appendChild(hpRow("tag"));
    const actions = document.createElement("div");
    actions.className = "cab-actions";
    actions.appendChild(refresh);
    actions.appendChild(pick);
    actions.appendChild(trash);
    actions.appendChild(hash);
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
    if (!document.getElementById("album-trash-btn")) {
      const trash = insButton("album-trash", TRASH, "丟進垃圾桶");
      trash.id = "album-trash-btn";
      trash.hidden = true;
      bindCastTrash(trash);
      const hash = insButton("album-hash", HASH, "新增多張標記");
      hash.id = "album-hash-btn";
      hash.hidden = true;
      hash.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const label = window.prompt("要加到選取照片的標記名稱");
        if (!label || !window.FamilyFeed) return;
        window.FamilyFeed.tagSelected(label);
      });
      tools.appendChild(trash);
      tools.appendChild(hash);
    }
  })();
  window.FamilyDoor = {
    setSelect: function (count, inTrash) {
      const n = Number(count) || 0;
      const show = n > 0;
      document.querySelectorAll(".cab-trash, .cab-hash, .album-trash, .album-hash").forEach(function (el) {
        el.hidden = !show;
      });
      if (statusEl) {
        if (inTrash) statusEl.textContent = "正在看垃圾桶";
        else if (show) statusEl.textContent = "已選 " + n + " / 99";
        else if (
          statusEl.textContent.indexOf("已選") === 0 ||
          statusEl.textContent === "正在看垃圾桶"
        ) {
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
