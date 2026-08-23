(function () {
  const ORIGIN = (window.VAULT_ORIGIN || "").replace(/\/$/, "");
  const KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;
  const DISCONNECTED = "目前無法連上,請聯絡維護的那個傢伙";
  const statusEl = document.getElementById("status");
  const hall = document.getElementById("hall");
  const blobs = document.getElementById("blobs");
  const panel = document.getElementById("invite-panel");
  const hey = document.getElementById("invite-hey");
  const safariNote = document.getElementById("invite-safari");
  const goBtn = document.getElementById("invite-go");
  const authForm = document.getElementById("invite-auth");
  const mfaForm = document.getElementById("invite-mfa");
  const installEl = document.getElementById("invite-install");
  const authErr = document.getElementById("invite-auth-err");
  const mfaErr = document.getElementById("invite-mfa-err");
  let inviteKey = "";
  let ticket = "";

  function api(path, key) {
    const url = ORIGIN + path;
    const k = key || window.FAMILY_VIEW_KEY;
    if (!k) return url;
    return url + (path.indexOf("?") >= 0 ? "&" : "?") + "k=" + encodeURIComponent(k);
  }

  function fail(msg) {
    if (statusEl) statusEl.textContent = msg || DISCONNECTED;
  }

  function readJson(path, key) {
    const ctrl = new AbortController();
    const timer = setTimeout(function () {
      ctrl.abort();
    }, 8000);
    return fetch(api(path, key), { signal: ctrl.signal }).then(function (res) {
      return res.json().then(function (j) {
        return { res: res, j: j };
      });
    }).finally(function () {
      clearTimeout(timer);
    });
  }

  function postJson(path, key, body) {
    return fetch(api(path, key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().then(function (j) {
        return { res: res, j: j };
      });
    });
  }

  function savePersonal(token) {
    if (!KEY_RE.test(token || "")) return;
    window.FAMILY_VIEW_KEY = token;
    try {
      localStorage.setItem("family.viewKey", token);
    } catch (e) {}
    try {
      sessionStorage.removeItem("family.claim");
    } catch (e) {}
    history.replaceState({}, "", location.pathname + (location.hash || ""));
  }

  function stripUrlKey() {
    if (!window.FAMILY_URL_KEY) return;
    history.replaceState({}, "", location.pathname + (location.hash || ""));
    window.FAMILY_URL_KEY = "";
  }

  function isStandalone() {
    if (window.navigator.standalone) return true;
    return !!(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  }

  function needsSafari() {
    if (isStandalone()) return false;
    const ua = navigator.userAgent || "";
    const ios =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (!ios) return false;
    return !(/Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Line\//.test(ua));
  }

  function hideAllInvite() {
    if (hey) hey.hidden = true;
    if (safariNote) safariNote.hidden = true;
    if (goBtn) goBtn.hidden = true;
    if (authForm) authForm.hidden = true;
    if (mfaForm) mfaForm.hidden = true;
    if (installEl) installEl.hidden = true;
  }

  function showLanding() {
    hideAllInvite();
    if (statusEl) statusEl.textContent = "";
    if (hey) hey.hidden = false;
    if (needsSafari()) {
      if (safariNote) safariNote.hidden = false;
      return;
    }
    if (goBtn) goBtn.hidden = false;
  }

  function showInviteChrome() {
    if (hall) hall.classList.add("is-invite");
    if (blobs) blobs.hidden = false;
    if (panel) panel.hidden = false;
  }

  function hideInviteChrome() {
    if (hall) hall.classList.remove("is-invite");
    if (blobs) blobs.hidden = true;
    if (panel) panel.hidden = true;
    hideAllInvite();
  }

  function openAlbum() {
    hideInviteChrome();
    if (window.FamilyDoor && window.FamilyDoor.boot) window.FamilyDoor.boot();
  }

  function showInstallThenAlbum() {
    if (isStandalone()) {
      openAlbum();
      return;
    }
    hideAllInvite();
    if (installEl) installEl.hidden = false;
    if (statusEl) statusEl.textContent = "";
  }

  function watchAuth() {
    readJson("/api/invite/auth?t=" + encodeURIComponent(ticket), inviteKey)
      .then(function (x) {
        if (!x.res.ok) {
          fail((x.j && x.j.error) || DISCONNECTED);
          showLanding();
          return;
        }
        if (x.j.phase === "failed") {
          if (authErr) authErr.textContent = x.j.error || "請再試一次";
          hideAllInvite();
          if (authForm) authForm.hidden = false;
          return;
        }
        if (x.j.phase === "ready" && x.j.token) {
          savePersonal(x.j.token);
          showInstallThenAlbum();
          return;
        }
        if (x.j.need_mfa) {
          hideAllInvite();
          if (mfaForm) mfaForm.hidden = false;
        }
        window.setTimeout(watchAuth, 1200);
      })
      .catch(function () {
        window.setTimeout(watchAuth, 2000);
      });
  }

  function startInvite(key) {
    inviteKey = key;
    try {
      ticket = sessionStorage.getItem("family.claim") || "";
    } catch (e) {
      ticket = "";
    }
    showInviteChrome();
    if (ticket) {
      watchAuth();
      return;
    }
    showLanding();
  }

  if (goBtn) {
    goBtn.addEventListener("click", function () {
      hideAllInvite();
      if (authForm) authForm.hidden = false;
      if (authErr) authErr.textContent = "";
    });
  }

  if (authForm) {
    authForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      const apple = (document.getElementById("invite-apple") || {}).value || "";
      const pass = (document.getElementById("invite-pass") || {}).value || "";
      if (authErr) authErr.textContent = "";
      postJson("/api/invite/login", inviteKey, { apple_id: apple, password: pass })
        .then(function (x) {
          if (!x.res.ok) {
            if (authErr) authErr.textContent = (x.j && x.j.error) || "現在登不進去";
            return;
          }
          ticket = x.j.ticket || "";
          try {
            sessionStorage.setItem("family.claim", ticket);
          } catch (e) {}
          const passEl = document.getElementById("invite-pass");
          if (passEl) passEl.value = "";
          hideAllInvite();
          if (statusEl) statusEl.textContent = "請稍候…";
          watchAuth();
        })
        .catch(function () {
          if (authErr) authErr.textContent = DISCONNECTED;
        });
    });
  }

  if (mfaForm) {
    mfaForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      const code = (document.getElementById("invite-code") || {}).value || "";
      if (mfaErr) mfaErr.textContent = "";
      postJson("/api/invite/code", inviteKey, { ticket: ticket, code: code })
        .then(function (x) {
          if (!x.res.ok) {
            if (mfaErr) mfaErr.textContent = (x.j && x.j.error) || "驗證碼送不出去";
            return;
          }
          watchAuth();
        })
        .catch(function () {
          if (mfaErr) mfaErr.textContent = DISCONNECTED;
        });
    });
  }

  const installed = document.getElementById("invite-installed");
  if (installed) {
    installed.addEventListener("click", openAlbum);
  }

  function start() {
    if (!ORIGIN) {
      fail(DISCONNECTED);
      if (window.FamilyDoor && window.FamilyDoor.boot) window.FamilyDoor.boot();
      return;
    }
    const urlK = window.FAMILY_URL_KEY || "";
    const stored = window.FAMILY_VIEW_KEY || "";
    const probe = urlK || stored;
    if (!probe) {
      fail("請用給你的專用連結打開");
      if (window.FamilyDoor && window.FamilyDoor.boot) window.FamilyDoor.boot();
      return;
    }
    readJson("/api/door", probe)
      .then(function (x) {
        if (!x.res.ok || !x.j || !x.j.kind) {
          fail((x.j && x.j.error) === "need_key" ? "請用給你的專用連結打開" : DISCONNECTED);
          if (!urlK && window.FamilyDoor && window.FamilyDoor.boot) window.FamilyDoor.boot();
          return;
        }
        if (x.j.kind === "invite") {
          startInvite(probe);
          return;
        }
        if (urlK) {
          window.FAMILY_VIEW_KEY = urlK;
          try {
            localStorage.setItem("family.viewKey", urlK);
          } catch (e) {}
          stripUrlKey();
        }
        openAlbum();
      })
      .catch(function () {
        if (urlK) {
          startInvite(urlK);
          fail(DISCONNECTED);
          return;
        }
        fail(DISCONNECTED);
        if (stored && window.FamilyDoor && window.FamilyDoor.boot) window.FamilyDoor.boot();
      });
  }

  window.FamiphotoGate = { start: start };
})();
