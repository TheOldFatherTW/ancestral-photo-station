(function () {
  const ORIGIN = (window.VAULT_ORIGIN || "").replace(/\/$/, "");
  const STALE_MS = 20 * 60 * 1000;
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

  function api(path) {
    return ORIGIN + path;
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
      const res = await fetch(api(path), { cache: "no-store", signal: ctrl.signal });
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

  function showHome() {
    openPerson = "";
    if (window.FamilyFeed) window.FamilyFeed.stop();
    if (cabs) cabs.hidden = false;
    if (album) album.hidden = true;
    if (feed) feed.innerHTML = "";
  }

  function showAlbum(person, name) {
    if (cabs) cabs.hidden = true;
    if (album) album.hidden = false;
    if (albumTitle) albumTitle.textContent = name || names[person] || person;
    if (albumCoverBtn) albumCoverBtn.dataset.person = person;
    if (openPerson === person) return;
    openPerson = person;
    if (window.FamilyFeed) window.FamilyFeed.start(person);
  }

  function fail(msg) {
    if (statusEl) statusEl.textContent = msg || DISCONNECTED;
  }

  function pickCover(person) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", async function () {
      const file = input.files && input.files[0];
      if (!file) return;
      const body = new FormData();
      body.append("cover", file, file.name || "cover.jpg");
      try {
        const res = await fetch(api("/api/cover?person=" + encodeURIComponent(person)), {
          method: "POST",
          body: body,
        });
        const data = await res.json().catch(function () {
          return {};
        });
        if (!res.ok) throw new Error(data.error || "fail");
        boot();
      } catch (err) {
        fail("封面換不上，請確認家裡這台有開");
      }
    });
    input.click();
  }

  function cabCard(p) {
    const a = document.createElement("a");
    a.className = "cab" + (p.has_cover ? " has-cover" : "");
    a.href = "#" + p.id;
    a.dataset.name = p.display_name;
    a.setAttribute("aria-label", p.display_name);
    const cover = document.createElement("div");
    cover.className = "cab-cover";
    if (p.has_cover) {
      const img = document.createElement("img");
      img.alt = p.display_name;
      img.decoding = "async";
      img.src = api("/cover?person=" + encodeURIComponent(p.id) + "&v=" + (p.cover_rev || 0));
      cover.appendChild(img);
    } else {
      const empty = document.createElement("div");
      empty.className = "cab-empty-name";
      empty.textContent = p.display_name;
      cover.appendChild(empty);
    }
    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "cab-pick";
    pick.textContent = p.has_cover ? "換封面" : "選封面";
    pick.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      pickCover(p.id);
    });
    cover.appendChild(pick);
    if (p.sync === "synced") {
      const mark = document.createElement("div");
      mark.className = "cab-sync";
      mark.innerHTML = CHECK;
      cover.appendChild(mark);
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
            boot();
          })
          .catch(function () {
            fail("現在同步不了，請聯絡維護的那個傢伙");
          });
      });
      cover.appendChild(btn);
    } else if (p.sync === "running") {
      attachBusy(cover, p);
    }
    a.appendChild(cover);
    return a;
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
      cover.appendChild(wrap);
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
      fail(DISCONNECTED);
    }
    route();
  }

  function route() {
    const id = personFromHash();
    if (!id) {
      showHome();
      return;
    }
    const link = cabs ? cabs.querySelector('a[href="#' + id + '"]') : null;
    showAlbum(id, (link && link.dataset.name) || names[id] || id);
  }

  if (albumCoverBtn) {
    albumCoverBtn.addEventListener("click", function () {
      const person = albumCoverBtn.dataset.person || openPerson;
      if (person) pickCover(person);
    });
  }
  window.addEventListener("hashchange", route);
  boot();
  (function poll() {
    const wait = window._familyRunning ? 4000 : 15000;
    setTimeout(function () {
      if (ORIGIN) boot();
      poll();
    }, wait);
  })();
})();
