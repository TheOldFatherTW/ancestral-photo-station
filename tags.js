(function () {
  const board = document.getElementById("tag-board");
  let person = "";
  let selected = [];
  let collapsed = {};
  let editing = false;
  let sheet = null;
  let sheetItem = null;
  let sheetOpen = false;

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

  function paint(data) {
    if (!board) return;
    board.hidden = false;
    board.innerHTML = "";
    const job = (data && data.job) || {};
    if (job.state === "running") {
      const note = document.createElement("p");
      note.className = "tag-job";
      note.textContent =
        "正在自動標記 " + (job.done || 0) + "/" + (job.total || 0);
      board.appendChild(note);
    }
    const tools = document.createElement("div");
    tools.className = "tag-tools";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "tag-edit" + (editing ? " is-on" : "");
    editBtn.textContent = editing ? "完成" : "改標籤";
    editBtn.addEventListener("click", function () {
      editing = !editing;
      load();
    });
    tools.appendChild(editBtn);
    if (selected.length) {
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "tag-edit";
      clear.textContent = "清除篩選";
      clear.addEventListener("click", function () {
        selected = [];
        if (window.FamilyFeed) window.FamilyFeed.filter([]);
        load();
      });
      tools.appendChild(clear);
    }
    board.appendChild(tools);
    (data.groups || []).forEach(function (group) {
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
        paint(data);
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
            if (editing) {
              const next = window.prompt("改名，空白則刪除", tag.label);
              if (next == null) return;
              if (!String(next).trim()) {
                post({ action: "delete", id: tag.id }).then(function (payload) {
                  selected = selected.filter(function (id) { return id !== tag.id; });
                  if (window.FamilyFeed) window.FamilyFeed.filter(selected);
                  paint(payload);
                });
                return;
              }
              post({ action: "rename", id: tag.id, label: next }).then(paint);
              return;
            }
            const at = selected.indexOf(tag.id);
            if (at >= 0) selected.splice(at, 1);
            else selected.push(tag.id);
            if (window.FamilyFeed) window.FamilyFeed.filter(selected);
            paint(data);
          });
          row.appendChild(chip);
        });
        wrap.appendChild(row);
      }
      board.appendChild(wrap);
    });
    if (job.state === "running") {
      window.setTimeout(load, 6000);
    }
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
    title.textContent = "這張的標記";
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
      chip.className = "tag-chip";
      chip.textContent = "#" + tag.label;
      chip.addEventListener("click", function () {
        const next = window.prompt("改名", tag.label);
        if (next == null || !String(next).trim()) return;
        photoPost({ action: "rename", id: tag.id, label: next }).then(paintSheet);
      });
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
    sheetOpen = true;
    const node = hostSheet();
    node.hidden = false;
    api("/api/tags?" + photoQuery(item))
      .then(function (res) {
        return res.json();
      })
      .then(paintSheet)
      .catch(function () {});
  }

  function closePhoto() {
    sheetOpen = false;
    sheetItem = null;
    if (sheet) sheet.hidden = true;
  }

  window.FamilyTags = {
    show: function (who) {
      person = who;
      load();
    },
    togglePhoto: function (item) {
      if (!item || !item.person) return;
      if (sheetOpen && sheetItem && sheetItem.rel === item.rel && sheetItem.bucket === item.bucket) {
        closePhoto();
        return;
      }
      loadPhoto(item);
    },
    showPhoto: function (item) {
      if (!item || !item.person) return;
      if (!sheetOpen) return;
      loadPhoto(item);
    },
    closePhoto: closePhoto,
  };
})();
