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
  let faceLayer = null;
  let faceBoxes = [];
  let faceTick = 0;
  let faceCtrl = null;

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

  function catalogOf(kind, exceptId, query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return [];
    const hits = [];
    (lastBoard.groups || []).forEach(function (group) {
      (group.tags || []).forEach(function (tag) {
        if (!tag || tag.id === exceptId || tag.kind !== kind) return;
        if (String(tag.label || "").toLowerCase().indexOf(q) < 0) return;
        hits.push(tag);
      });
    });
    return hits.slice(0, 8);
  }

  function paintSheet(data) {
    if (data && data.groups) lastBoard.groups = data.groups;
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
    let renaming = null;
    const form = document.createElement("form");
    form.className = "pswp-tag-add";
    const renameBox = document.createElement("div");
    renameBox.className = "pswp-tag-rename";
    renameBox.hidden = true;
    const renameHint = document.createElement("p");
    renameHint.className = "pswp-tag-title";
    const renameForm = document.createElement("form");
    renameForm.className = "pswp-tag-add";
    const renameInput = document.createElement("input");
    renameInput.type = "text";
    renameInput.maxLength = 48;
    renameInput.placeholder = "改名或輸入既有標記";
    const renameOk = document.createElement("button");
    renameOk.type = "submit";
    renameOk.textContent = "確定";
    const renameCancel = document.createElement("button");
    renameCancel.type = "button";
    renameCancel.textContent = "取消";
    const suggest = document.createElement("div");
    suggest.className = "pswp-tag-suggest";

    function afterChange(payload) {
      paintSheet(payload);
      load();
    }

    function askMerge(src, dst) {
      const ok = window.confirm(
        "要把「" + src.label + "」合併進「" + dst.label + "」嗎？全相簿一起改。"
      );
      if (!ok) return;
      photoPost({ action: "merge", id: src.id, into: dst.id }).then(afterChange);
    }

    function renderSuggest() {
      suggest.innerHTML = "";
      if (!renaming) return;
      catalogOf(renaming.kind, renaming.id, renameInput.value).forEach(function (hit) {
        const pick = document.createElement("button");
        pick.type = "button";
        pick.textContent = "#" + hit.label;
        pick.addEventListener("click", function () {
          askMerge(renaming, hit);
        });
        suggest.appendChild(pick);
      });
    }

    function openRename(tag) {
      renaming = tag;
      form.hidden = true;
      renameBox.hidden = false;
      renameHint.textContent = "改名「" + tag.label + "」（所有照片一起改）";
      renameInput.value = tag.label;
      renderSuggest();
      renameInput.focus();
      renameInput.select();
    }

    tags.forEach(function (tag) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "tag-chip" + (RENAMEABLE[tag.kind] ? "" : " is-lock");
      chip.textContent = "#" + tag.label;
      chip.dataset.id = tag.id;
      chip.addEventListener("click", function () {
        const again = chip.classList.contains("is-on");
        highlightFace(tag.id);
        if (!RENAMEABLE[tag.kind] || !again) return;
        openRename(tag);
      });
      row.appendChild(chip);
    });
    node.appendChild(row);

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
      photoPost({ action: "create_on_photo", kind: "event", label: label }).then(afterChange);
    });
    form.appendChild(input);
    form.appendChild(add);
    node.appendChild(form);

    renameInput.addEventListener("input", renderSuggest);
    renameForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      const next = (renameInput.value || "").trim();
      if (!next || !renaming) return;
      const exact = catalogOf(renaming.kind, renaming.id, next).filter(function (hit) {
        return String(hit.label) === next;
      });
      if (exact.length === 1) {
        askMerge(renaming, exact[0]);
        return;
      }
      photoPost({ action: "rename", id: renaming.id, label: next }).then(afterChange);
    });
    renameCancel.addEventListener("click", function () {
      renaming = null;
      renameBox.hidden = true;
      form.hidden = false;
    });
    renameForm.appendChild(renameInput);
    renameForm.appendChild(renameOk);
    renameForm.appendChild(renameCancel);
    renameBox.appendChild(renameHint);
    renameBox.appendChild(renameForm);
    renameBox.appendChild(suggest);
    node.appendChild(renameBox);
    paintFaces((data && data.photo && data.photo.faces) || []);
  }

  function currentPhotoImg() {
    const items = document.querySelectorAll(".pswp__item");
    let item = null;
    items.forEach(function (el) {
      if (el.getAttribute("aria-hidden") !== "true") item = el;
    });
    if (!item && items.length) item = items[0];
    if (!item) return null;
    const imgs = item.querySelectorAll("img.pswp__img");
    let img = null;
    imgs.forEach(function (el) {
      if (!el.classList.contains("pswp__img--placeholder")) img = el;
    });
    return img || (imgs.length ? imgs[imgs.length - 1] : null);
  }

  function ensureFaceLayer() {
    if (faceLayer && faceLayer.isConnected) return faceLayer;
    faceLayer = document.createElement("div");
    faceLayer.className = "pswp-face-layer";
    return faceLayer;
  }

  function clearFaces() {
    faceTick += 1;
    faceBoxes = [];
    if (faceLayer) faceLayer.remove();
    faceLayer = null;
  }

  function layoutFaces() {
    const tick = faceTick;
    const img = currentPhotoImg();
    const layer = ensureFaceLayer();
    if (sheetItem && sheetItem.kind === "video") {
      if (layer.parentNode) layer.remove();
      return;
    }
    if (!faceBoxes.length) {
      if (layer.parentNode) layer.remove();
      return;
    }
    if (!img || !img.clientWidth) {
      if (img) img.addEventListener("load", layoutFaces, { once: true });
      setTimeout(function () {
        if (tick === faceTick) layoutFaces();
      }, 120);
      return;
    }
    if (layer.parentNode !== img.parentNode) img.parentNode.appendChild(layer);
    layer.style.left = img.offsetLeft + "px";
    layer.style.top = img.offsetTop + "px";
    layer.style.width = img.clientWidth + "px";
    layer.style.height = img.clientHeight + "px";
  }

  function paintFaces(faces) {
    const tick = ++faceTick;
    faceBoxes = (faces || []).filter(function (face) {
      return face && face.bbox && face.bbox.length === 4;
    });
    const layer = ensureFaceLayer();
    layer.innerHTML = "";
    faceBoxes.forEach(function (face) {
      const box = document.createElement("div");
      box.className = "pswp-face";
      box.dataset.id = face.id;
      const x1 = face.bbox[0];
      const y1 = face.bbox[1];
      const x2 = face.bbox[2];
      const y2 = face.bbox[3];
      box.style.left = x1 * 100 + "%";
      box.style.top = y1 * 100 + "%";
      box.style.width = Math.max(0, x2 - x1) * 100 + "%";
      box.style.height = Math.max(0, y2 - y1) * 100 + "%";
      const cap = document.createElement("span");
      cap.textContent = face.label || "";
      box.appendChild(cap);
      layer.appendChild(box);
    });
    layoutFaces();
    requestAnimationFrame(layoutFaces);
    [80, 320, 900, 1800].forEach(function (ms) {
      setTimeout(function () {
        if (tick === faceTick) layoutFaces();
      }, ms);
    });
  }

  function highlightFace(id) {
    if (faceLayer) {
      faceLayer.querySelectorAll(".pswp-face").forEach(function (el) {
        el.classList.toggle("is-on", el.dataset.id === id);
      });
    }
    if (sheet) {
      sheet.querySelectorAll(".tag-chip").forEach(function (el) {
        el.classList.toggle("is-on", el.dataset.id === id);
      });
    }
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
    if (faceCtrl) faceCtrl.abort();
    faceCtrl = new AbortController();
    const ac = faceCtrl;
    api("/api/tags?" + photoQuery(item))
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!sheetItem || sheetItem.rel !== item.rel || sheetItem.bucket !== item.bucket) return;
        paintSheet(data);
        if (item.kind === "video") return;
        return api("/api/faces?" + photoQuery(item), { signal: ac.signal }).then(function (res) {
          return res.json();
        });
      })
      .then(function (faceData) {
        if (!faceData || !sheetItem || sheetItem.rel !== item.rel || sheetItem.bucket !== item.bucket) return;
        if (faceData.faces) paintFaces(faceData.faces);
      })
      .catch(function () {});
  }

  function closePhoto() {
    sheetItem = null;
    if (faceCtrl) faceCtrl.abort();
    if (sheet) sheet.hidden = true;
    clearFaces();
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
    layoutFaces: layoutFaces,
    closePhoto: closePhoto,
  };
})();
