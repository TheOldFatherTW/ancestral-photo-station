(function () {
  const board = document.getElementById("tag-board");
  const RENAMEABLE = { person: 1, place_country: 1, place_city: 1 };
  let person = "";
  let selected = [];
  let collapsed = { "地點": true, "類型": true, "事": true, "人物": true };
  let mode = "basic";
  let lastBoard = { groups: [], job: {} };
  let sheet = null;
  let sheetItem = null;

  function api(path, opts) {
    const origin = (window.VAULT_ORIGIN || "").replace(/\/$/, "");
    const k = window.FAMILY_VIEW_KEY;
    let url = origin + path;
    if (k) url += (path.indexOf("?") >= 0 ? "&" : "?") + "k=" + encodeURIComponent(k);
    return fetch(url, opts || {});
  }

  function post(body) {
    return api("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ person: person }, body)),
    }).then(function (res) {
      return res.json();
    });
  }

  function modeBtn(id, label) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mode-btn" + (mode === id ? " is-on" : "");
    btn.textContent = label;
    btn.addEventListener("click", function () {
      mode = id;
      if (id === "basic") {
        if (window.FamilyFeed) window.FamilyFeed.filter([]);
      }
      paint(lastBoard);
    });
    return btn;
  }

  function paint(data) {
    if (!board) return;
    lastBoard = data || lastBoard;
    board.hidden = false;
    board.innerHTML = "";
    const bar = document.createElement("div");
    bar.className = "mode-bar";
    bar.appendChild(modeBtn("basic", "Basic mode"));
    bar.appendChild(modeBtn("hashtag", "Hashtag mode"));
    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "mode-btn mode-pick";
    pick.textContent = "Pick";
    pick.disabled = mode !== "hashtag";
    pick.addEventListener("click", function () {
      if (mode !== "hashtag") return;
      if (window.FamilyFeed) window.FamilyFeed.filter(selected.slice());
    });
    bar.appendChild(pick);
    board.appendChild(bar);
    if (mode !== "hashtag") return;
    (lastBoard.groups || []).forEach(function (group) {
      if (!group.tags || !group.tags.length) return;
      const wrap = document.createElement("section");
      wrap.className = "tag-group";
      const closed = collapsed[group.id] === true;
      const head = document.createElement("button");
      head.type = "button";
      head.className = "tag-head";
      head.textContent = (closed ? "▸ " : "▾ ") + group.title;
      head.addEventListener("click", function () {
        collapsed[group.id] = !closed;
        paint(lastBoard);
      });
      wrap.appendChild(head);
      if (!closed) {
        const row = document.createElement("div");
        row.className = "tag-row";
        group.tags.forEach(function (tag) {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "tag-chip" + (selected.indexOf(tag.id) >= 0 ? " is-on" : "");
          chip.textContent = "#" + tag.label;
          chip.addEventListener("click", function () {
            const at = selected.indexOf(tag.id);
            if (at >= 0) selected.splice(at, 1);
            else selected.push(tag.id);
            paint(lastBoard);
          });
          row.appendChild(chip);
        });
        wrap.appendChild(row);
      }
      board.appendChild(wrap);
    });
  }

  function load() {
    if (!person) return;
    api("/api/tags?person=" + encodeURIComponent(person))
      .then(function (res) {
        return res.json();
      })
      .then(paint)
      .catch(function () {});
  }

  function ensureSheet() {
    if (sheet && sheet.isConnected) return sheet;
    sheet = document.createElement("div");
    sheet.className = "pswp-tag-sheet";
    sheet.hidden = true;
    sheet.addEventListener("click", function (ev) {
      ev.stopPropagation();
    });
    sheet.addEventListener("pointerdown", function (ev) {
      ev.stopPropagation();
    });
    return sheet;
  }

  function hostSheet() {
    const host = document.querySelector(".pswp");
    const node = ensureSheet();
    if (host && node.parentNode !== host) host.appendChild(node);
    return node;
  }

  function paintSheet(data) {
    const node = hostSheet();
    node.innerHTML = "";
    const title = document.createElement("p");
    title.className = "pswp-tag-title";
    title.textContent = sheetItem && sheetItem.kind === "video" ? "這支的標記" : "這張的標記";
    node.appendChild(title);
    const row = document.createElement("div");
    row.className = "pswp-tag-row";
    const tags = (data && data.photo && data.photo.tags) || [];
    if (!tags.length) {
      const empty = document.createElement("span");
      empty.textContent = "還沒有標記";
      empty.style.opacity = "0.7";
      empty.style.fontSize = "13px";
      row.appendChild(empty);
    }
    tags.forEach(function (tag) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "tag-chip" + (RENAMEABLE[tag.kind] ? "" : " is-lock");
      chip.textContent = "#" + tag.label;
      if (RENAMEABLE[tag.kind]) {
        chip.addEventListener("click", function () {
          const next = window.prompt("改名（所有照片一起改）", tag.label);
          if (next == null || !String(next).trim()) return;
          photoPost({ action: "rename", id: tag.id, label: next }).then(function (payload) {
            paintSheet(payload);
            load();
          });
        });
      }
      row.appendChild(chip);
    });
    node.appendChild(row);
    const form = document.createElement("form");
    form.className = "pswp-tag-add";
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 48;
    input.placeholder = "新增標記";
    input.setAttribute("enterkeyhint", "done");
    const add = document.createElement("button");
    add.type = "submit";
    add.textContent = "加入";
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      const label = (input.value || "").trim();
      if (!label) return;
      photoPost({ action: "create_on_photo", kind: "event", label: label }).then(function (payload) {
        input.value = "";
        paintSheet(payload);
        load();
      });
    });
    form.appendChild(input);
    form.appendChild(add);
    node.appendChild(form);
  }

  function photoQuery(item) {
    return (
      "person=" + encodeURIComponent(item.person) +
      "&bucket=" + encodeURIComponent(item.bucket) +
      "&rel=" + encodeURIComponent(item.rel)
    );
  }

  function photoPost(body) {
    const item = sheetItem;
    if (!item) return Promise.resolve({});
    return post(
      Object.assign(
        {
          person: item.person,
          bucket: item.bucket,
          rel: item.rel,
        },
        body
      )
    );
  }

  function loadPhoto(item) {
    sheetItem = item;
    const node = hostSheet();
    node.hidden = false;
    node.classList.toggle("is-video", item.kind === "video");
    api("/api/tags?" + photoQuery(item))
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!sheetItem || sheetItem.rel !== item.rel || sheetItem.bucket !== item.bucket) return;
        paintSheet(data);
      })
      .catch(function () {});
  }

  function closePhoto() {
    sheetItem = null;
    if (sheet) sheet.hidden = true;
  }

  window.FamilyTags = {
    show: function (who) {
      if (person === who) {
        load();
        return;
      }
      person = who;
      mode = "basic";
      selected = [];
      load();
    },
    showPhoto: function (item) {
      if (!item || !item.person) return;
      loadPhoto(item);
    },
    closePhoto: closePhoto,
  };
})();
