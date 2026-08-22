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
  const CAMERA =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="8" width="17" height="11.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 8l1.4-2.4h5.2L16 8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="13.6" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';

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
    if (data.rescuing) {
      if (data.percent == null) return "正在救援中,目前進度？%";
      return "正在救援中,目前進度" + data.percent + "%";
    }
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

  function cabCard(p) {
    const wrap = document.createElement("div");
    wrap.className = "cab-wrap";
    const a = document.createElement("a");
    a.className = "cab" + (p.has_cover ? " has-cover" : "");
    a.href = "#" + p.id;
    a.dataset.name = p.display_name;
    a.setAttribute("aria-label", p.display_name);
    const cover = document.createElement("div");
    cover.className = "cab-cover";
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
    cover.appendChild(face);
    if (p.sync === "synced") {
      const mark = document.createElement("div");
      mark.className = "cab-sync";
      mark.innerHTML = CHECK;
      face.appendChild(mark);
    } else if (p.sync === "behind") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cab-now";
      btn.textContent = "立即同步";
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        fetch(api("/api/sync?person=" + encodeURIComponent(p.id)), { method: "POST" })
          .then(function (res) {
            return res.json().then(function (j) {
              return { res: res, j: j };
            });
          })
          .then(function (x) {
            if (!x.res.ok) throw new Error(x.j.error || "fail");
            lastCab = "";
            boot();
          })
          .catch(function () {
            fail("現在同步不了，請聯絡維護的那個傢伙");
          });
      });
      face.appendChild(btn);
    } else if (p.sync === "running") {
      attachBusy(cover, p);
    }
    a.appendChild(cover);
    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "cab-pick";
    pick.innerHTML = CAMERA;
    pick.setAttribute("aria-label", p.has_cover ? "換封面" : "選封面");
    pick.title = p.has_cover ? "換封面" : "選封面";
    pick.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      pickCover(p.id);
    });
    wrap.appendChild(a);
    wrap.appendChild(pick);
    return wrap;
  }

  function attachBusy(cover, p) {
    let wrap = cover.querySelector(".cab-progress");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "cab-progress";
      wrap.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      });
      const rose = document.createElement("div");
      rose.className = "rose-two rose-mini";
      const bar = document.createElement("div");
      bar.className = "cab-progress-bar";
      const label = document.createElement("div");
      label.className = "cab-progress-label";
      wrap.appendChild(rose);
      wrap.appendChild(bar);
      wrap.appendChild(label);
      const host = cover.querySelector(".cab-face") || cover;
      host.appendChild(wrap);
      if (window.RoseTwo) {
        window.RoseTwo.mount(rose);
        window.RoseTwo.mountBar(bar, function () {
          const n = Number(wrap.dataset.percent);
          return wrap.dataset.percent === "" || !Number.isFinite(n) ? null : n / 100;
        });
      }
    }
    wrap.dataset.percent = p.percent == null ? "" : String(p.percent);
    const label = wrap.querySelector(".cab-progress-label");
    if (label) {
      label.textContent =
        p.percent == null ? "備份中" : "備份中 " + p.percent + "%";
    }
  }

  function paintBusy(people) {
    if (!cabs) return;
    (people || []).forEach(function (p) {
      const card = cabs.querySelector('a[href="#' + p.id + '"] .cab-cover');
      if (!card) return;
      const wrap = card.querySelector(".cab-progress");
      if (p.sync === "running") {
        attachBusy(card, p);
      } else if (wrap) {
        wrap.remove();
      }
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
        paintBusy(cab.people);
      }
      window._familyRunning = (cab.people || []).some(function (p) {
        return p.sync === "running";
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
  window.addEventListener("hashchange", route);
  boot();
  (function poll() {
    const wait = !openPerson && window._familyRunning ? 4000 : 15000;
    setTimeout(function () {
      if (!ORIGIN) {
        poll();
        return;
      }
      if (openPerson) {
        readJson("/api/public")
          .then(function (pub) {
            if (statusEl) statusEl.textContent = lineFrom(pub);
          })
          .catch(function () {
            fail(DISCONNECTED);
          })
          .then(poll);
      } else {
        Promise.resolve(boot()).then(poll);
      }
    }, wait);
  })();
})();
