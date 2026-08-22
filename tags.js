(function () {
  const board = document.getElementById("tag-board");
  const RENAMEABLE = { person: 1, place_country: 1, place_city: 1, custom: 1 };
  const DELETE_ID = "media:delete";
  let person = "";
  let selected = [];
  let collapsed = { "地點": true, "類型": true, "自訂": true, "人物": true };
  let mode = "basic";
  let lastBoard = { groups: [], job: {} };
  let sheet = null;
  let sheetItem = null;
  let faceLayer = null;
  let faceBoxes = [];
  let faceTick = 0;
  let faceCtrl = null;
  let faceCube = null;
  let trashBtn = null;
  let selectedTag = null;

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

  function catalogOf(query, opts) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return [];
    opts = opts || {};
    const hits = [];
    (lastBoard.groups || []).forEach(function (group) {
      (group.tags || []).forEach(function (tag) {
        if (!tag) return;
        if (opts.kind && tag.kind !== opts.kind) return;
        if (opts.exceptId && tag.id === opts.exceptId) return;
        if (opts.exceptIds && opts.exceptIds[tag.id]) return;
        if (String(tag.label || "").toLowerCase().indexOf(q) < 0) return;
        hits.push(tag);
      });
    });
    return hits.slice(0, 8);
  }

  function faceCubeOn() {
    try {
      return localStorage.getItem("family.faceCube") !== "0";
    } catch (e) {
      return true;
    }
  }

  function applyFaceCube() {
    const on = faceCubeOn();
    if (faceCube) {
      const box = faceCube.querySelector("input");
      if (box) box.checked = on;
      faceCube.hidden = !sheetItem || sheetItem.kind === "video";
    }
    if (faceLayer) faceLayer.classList.toggle("is-off", !on);
  }

  function ensureFaceCube() {
    if (faceCube && faceCube.isConnected) return faceCube;
    faceCube = document.createElement("label");
    faceCube.className = "pswp-face-cube";
    const name = document.createElement("span");
    name.className = "pswp-face-cube-name";
    name.textContent = "face cube";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.setAttribute("role", "switch");
    box.setAttribute("aria-label", "face cube");
    box.checked = faceCubeOn();
    const sw = document.createElement("span");
    sw.className = "pswp-face-cube-sw";
    box.addEventListener("change", function () {
      try {
        localStorage.setItem("family.faceCube", box.checked ? "1" : "0");
      } catch (e) {}
      applyFaceCube();
      if (box.checked) layoutFaces();
    });
    faceCube.appendChild(name);
    faceCube.appendChild(box);
    faceCube.appendChild(sw);
    return faceCube;
  }

  function hostFaceCube() {
    const host = document.querySelector(".pswp");
    const node = ensureFaceCube();
    if (host && node.parentNode !== host) host.appendChild(node);
    applyFaceCube();
    return node;
  }

  function ensureTrashBtn() {
    if (trashBtn && trashBtn.isConnected) return trashBtn;
    trashBtn = document.createElement("button");
    trashBtn.type = "button";
    trashBtn.className = "ins-icon pswp-trash";
    trashBtn.setAttribute("aria-label", "丟進垃圾桶");
    trashBtn.title = "丟進垃圾桶";
    trashBtn.innerHTML =
      '<span class="ins-ring"></span><span class="ins-face"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8V6.8A1.8 1.8 0 0 1 9.8 5h4.4A1.8 1.8 0 0 1 16 6.8V8M5 8h14M9 11v7M12 11v7M15 11v7M7 8l.8 12.2A1.6 1.6 0 0 0 9.4 22h5.2a1.6 1.6 0 0 0 1.6-1.8L17 8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
    trashBtn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (!sheetItem) return;
      const ok = window.confirm("把這張丟進垃圾桶？三天內可在垃圾桶救回。");
      if (!ok) return;
      photoPost({ action: "trash" }).then(function () {
        closePhoto();
        if (window.FamilyFeed && window.FamilyFeed.refresh) window.FamilyFeed.refresh();
      });
    });
    return trashBtn;
  }

  function hostTrashBtn() {
    const host = document.querySelector(".pswp");
    const node = ensureTrashBtn();
    if (host && node.parentNode !== host) host.appendChild(node);
    node.hidden = !sheetItem;
    return node;
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
    const onPhoto = {};
    tags.forEach(function (tag) {
      if (tag && tag.id) onPhoto[tag.id] = true;
    });
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
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 48;
    input.placeholder = "輸入標記名稱";
    input.setAttribute("enterkeyhint", "done");
    const go = document.createElement("button");
    go.type = "submit";
    go.textContent = "新增";
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

    function askDeleteTag(tag) {
      if (!tag || !tag.id) return;
      if (tag.id === DELETE_ID) {
        const ok = window.confirm("把這張從垃圾桶救回來？");
        if (!ok) return;
        photoPost({ action: "detach", id: DELETE_ID }).then(function (payload) {
          afterChange(payload);
          if (window.FamilyFeed && window.FamilyFeed.refresh) window.FamilyFeed.refresh();
        });
        return;
      }
      const ok = window.confirm(
        "刪除「#" + tag.label + "」？所有照片上的這個標記都會消失。"
      );
      if (!ok) return;
      photoPost({ action: "delete", id: tag.id }).then(afterChange);
    }

    function showChipX() {
      if (!sheet) return;
      sheet.querySelectorAll(".tag-chip-wrap").forEach(function (wrap) {
        const x = wrap.querySelector(".ins-x");
        if (x) x.hidden = !wrap.classList.contains("is-on");
      });
    }

    function matches() {
      const q = input.value;
      if (renaming) return catalogOf(q, { kind: renaming.kind, exceptId: renaming.id });
      return catalogOf(q, { exceptIds: onPhoto });
    }

    function renderSuggest() {
      suggest.innerHTML = "";
      const hits = matches();
      if (!hits.length) return;
      const hint = document.createElement("p");
      hint.className = "pswp-tag-suggest-hint";
      hint.textContent = "點一下才會加上，光輸入不會存檔";
      suggest.appendChild(hint);
      hits.forEach(function (hit) {
        const pick = document.createElement("button");
        pick.type = "button";
        pick.textContent = "#" + hit.label;
        pick.addEventListener("click", function () {
          if (renaming) askMerge(renaming, hit);
          else photoPost({ action: "attach", id: hit.id }).then(afterChange);
        });
        suggest.appendChild(pick);
      });
    }

    function exitRename() {
      renaming = null;
      go.textContent = "新增";
      input.value = "";
      renderSuggest();
    }

    function enterRename(tag) {
      renaming = tag;
      go.textContent = "改名";
      input.value = tag.label;
      renderSuggest();
      input.focus();
      input.select();
    }

    tags.forEach(function (tag) {
      const wrap = document.createElement("span");
      wrap.className = "tag-chip-wrap" + (RENAMEABLE[tag.kind] ? "" : " is-lock");
      wrap.dataset.id = tag.id;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "tag-chip" + (RENAMEABLE[tag.kind] ? "" : " is-lock");
      chip.textContent = "#" + tag.label;
      chip.dataset.id = tag.id;
      const x = document.createElement("button");
      x.type = "button";
      x.className = "ins-x";
      x.setAttribute("aria-label", "刪除標記");
      x.textContent = "×";
      x.hidden = true;
      x.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        askDeleteTag(tag);
      });
      chip.addEventListener("click", function () {
        const again = wrap.classList.contains("is-on");
        highlightFace(tag.id);
        showChipX();
        if (renaming && renaming.id === tag.id) {
          exitRename();
          return;
        }
        if (!RENAMEABLE[tag.kind] || !again) {
          if (renaming) exitRename();
          return;
        }
        enterRename(tag);
      });
      wrap.appendChild(chip);
      wrap.appendChild(x);
      row.appendChild(wrap);
    });
    node.appendChild(row);

    let addClick = false;
    go.addEventListener("pointerdown", function () {
      addClick = true;
    });
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      const byAdd = addClick;
      addClick = false;
      if (!byAdd) return;
      const label = (input.value || "").trim();
      if (!label) return;
      if (renaming) {
        const exact = matches().filter(function (hit) {
          return String(hit.label) === label;
        });
        if (exact.length === 1) {
          askMerge(renaming, exact[0]);
          return;
        }
        photoPost({ action: "rename", id: renaming.id, label: label }).then(afterChange);
        return;
      }
      const exact = matches().filter(function (hit) {
        return String(hit.label) === label;
      });
      if (exact.length === 1) {
        photoPost({ action: "attach", id: exact[0].id }).then(afterChange);
        return;
      }
      photoPost({ action: "create_on_photo", kind: "custom", label: label }).then(afterChange);
    });
    input.addEventListener("input", renderSuggest);
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && renaming) {
        ev.preventDefault();
        exitRename();
      }
    });
    form.appendChild(input);
    form.appendChild(go);
    node.appendChild(form);
    node.appendChild(suggest);
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

  function currentPswp() {
    return window.FamilyFeed && typeof window.FamilyFeed.pswp === "function"
      ? window.FamilyFeed.pswp()
      : null;
  }

  function layoutFaces() {
    const tick = faceTick;
    const img = currentPhotoImg();
    const layer = ensureFaceLayer();
    if (sheetItem && sheetItem.kind === "video") {
      if (layer.parentNode) layer.remove();
      return;
    }
    applyFaceCube();
    if (!faceBoxes.length) {
      if (layer.parentNode) layer.remove();
      return;
    }
    const pswp = currentPswp();
    const root = pswp && pswp.element;
    if (!img || !root) {
      if (img) img.addEventListener("load", layoutFaces, { once: true });
      setTimeout(function () {
        if (tick === faceTick) layoutFaces();
      }, 120);
      return;
    }
    const ir = img.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    if (ir.width < 8 || ir.height < 8) {
      setTimeout(function () {
        if (tick === faceTick) layoutFaces();
      }, 120);
      return;
    }
    if (layer.parentNode !== root) root.appendChild(layer);
    applyFaceCube();
    layer.style.left = ir.left - rr.left + "px";
    layer.style.top = ir.top - rr.top + "px";
    layer.style.width = ir.width + "px";
    layer.style.height = ir.height + "px";
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
      const x = document.createElement("button");
      x.type = "button";
      x.className = "ins-x";
      x.setAttribute("aria-label", "刪除人物標記");
      x.textContent = "×";
      x.hidden = true;
      x.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const ok = window.confirm(
          "刪除「#" + (face.label || "") + "」？所有照片上的這個標記都會消失。"
        );
        if (!ok) return;
        photoPost({ action: "delete", id: face.id }).then(function (payload) {
          paintSheet(payload);
          load();
        });
      });
      box.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        highlightFace(face.id);
      });
      box.appendChild(cap);
      box.appendChild(x);
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
    selectedTag = id;
    if (faceLayer) {
      faceLayer.querySelectorAll(".pswp-face").forEach(function (el) {
        const on = el.dataset.id === id;
        el.classList.toggle("is-on", on);
        const x = el.querySelector(".ins-x");
        if (x) x.hidden = !on;
      });
    }
    if (sheet) {
      sheet.querySelectorAll(".tag-chip-wrap").forEach(function (el) {
        const on = el.dataset.id === id;
        el.classList.toggle("is-on", on);
        const chip = el.querySelector(".tag-chip");
        if (chip) chip.classList.toggle("is-on", on);
        const x = el.querySelector(".ins-x");
        if (x) x.hidden = !on;
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
    hostFaceCube();
    hostTrashBtn();
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
    if (faceCube) faceCube.hidden = true;
    if (trashBtn) trashBtn.hidden = true;
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
    act: post,
    DELETE_ID: DELETE_ID,
  };
})();
