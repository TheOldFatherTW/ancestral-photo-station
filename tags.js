(function () {
  const board = document.getElementById("tag-board");
  let person = "";
  let selected = [];
  let collapsed = {};
  let editing = false;

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
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "tag-edit";
    addBtn.textContent = "新增";
    addBtn.addEventListener("click", function () {
      const kind = window.prompt("種類：person / place_city / event / media", "event");
      if (!kind) return;
      const label = window.prompt("標籤名稱");
      if (!label) return;
      post({ action: "create", kind: kind, label: label }).then(paint);
    });
    tools.appendChild(editBtn);
    tools.appendChild(addBtn);
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

  window.FamilyTags = {
    show: function (who) {
      person = who;
      load();
    },
  };
})();
