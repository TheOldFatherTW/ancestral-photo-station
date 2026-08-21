(function () {
  const ORIGIN = (window.VAULT_ORIGIN || "").replace(/\/$/, "");
  const STALE_MS = 20 * 60 * 1000;
  const DISCONNECTED = "目前無法連上,請聯絡維護的那個傢伙";
  const statusEl = document.getElementById("status");
  const cabs = document.getElementById("cabinets");
  const album = document.getElementById("album");
  const albumTitle = document.getElementById("album-title");
  const feed = document.getElementById("feed");
  let openPerson = "";

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
      const res = await fetch(ORIGIN + path, { cache: "no-store", signal: ctrl.signal });
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
    if (albumTitle) albumTitle.textContent = name || person;
    if (openPerson === person) return;
    openPerson = person;
    if (window.FamilyFeed) window.FamilyFeed.start(person);
  }

  function coverUrl(cover) {
    const p = new URLSearchParams({
      person: cover.person,
      bucket: cover.bucket,
      rel: cover.rel,
      size: "tile",
    });
    return ORIGIN + "/thumb?" + p.toString();
  }

  function cabCard(p) {
    const a = document.createElement("a");
    a.className = "cab";
    a.href = "#" + p.id;
    const cover = document.createElement("div");
    cover.className = "cab-cover";
    if (p.cover) {
      const img = document.createElement("img");
      img.alt = "";
      img.decoding = "async";
      img.src = coverUrl(p.cover);
      cover.appendChild(img);
    }
    const name = document.createElement("div");
    name.className = "cab-name";
    name.textContent = p.display_name;
    a.appendChild(cover);
    a.appendChild(name);
    return a;
  }

  async function boot() {
    if (!ORIGIN) {
      if (statusEl) statusEl.textContent = DISCONNECTED;
      return;
    }
    try {
      const pub = await readJson("/api/public");
      if (statusEl) statusEl.textContent = lineFrom(pub);
      const cab = await readJson("/api/cabinets");
      if (cabs) {
        cabs.innerHTML = "";
        (cab.people || []).forEach(function (p) {
          cabs.appendChild(cabCard(p));
        });
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = DISCONNECTED;
    }
    route();
  }

  function route() {
    const id = personFromHash();
    if (!id) {
      showHome();
      return;
    }
    const link = cabs ? cabs.querySelector('a[href="#' + id + '"] .cab-name') : null;
    showAlbum(id, link ? link.textContent : id);
  }

  window.addEventListener("hashchange", route);
  boot();
  setInterval(function () {
    if (!ORIGIN || !statusEl) return;
    readJson("/api/public")
      .then(function (pub) {
        statusEl.textContent = lineFrom(pub);
      })
      .catch(function () {
        statusEl.textContent = DISCONNECTED;
      });
  }, 30000);
})();
