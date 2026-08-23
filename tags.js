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
      if (!res.ok) throw new Error("bad");
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

  function afterChange(payload) {
    paintSheet(payload);
    // The write already answers with the whole board, so fetching it again
    // only doubled the wait after every tap.
    if (payload && payload.groups) paint(payload);
    else load();
  }

  function runChange(body, working, said) {
    window.FamilyBusy.start(working);
    return photoPost(body).then(
      function (payload) {
        window.FamilyBusy.done(said);
        afterChange(payload);
        return payload;
      },
      function () {
        window.FamilyBusy.done("沒有存到，請再試一次");
        return null;
      }
    );
  }

  function paintSheet(data, keepFaces) {
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
      empty.className = "pswp-tag-empty";
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

    function ghostChip(label) {
      const empty = row.querySelector(".pswp-tag-empty");
      if (empty) empty.remove();
      const wrap = document.createElement("span");
      wrap.className = "tag-chip-wrap is-ghost";
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "tag-chip";
      chip.textContent = "#" + label;
      wrap.appendChild(chip);
      row.appendChild(wrap);
      input.value = "";
      renderSuggest();
    }

    function askMerge(src, dst) {
      const ok = window.confirm(
        "要把「" + src.label + "」合併進「" + dst.label + "」嗎？全相簿一起改。"
      );
      if (!ok) return;
      runChange(
        { action: "merge", id: src.id, into: dst.id },
        "正在把 #" + src.label + " 併進 #" + dst.label + "…",
        "已併進 #" + dst.label
      );
    }

    function askDeleteTag(tag) {
      if (!tag || !tag.id) return;
      if (tag.id === DELETE_ID) {
        const ok = window.confirm("把這張從垃圾桶救回來？");
        if (!ok) return;
        runChange({ action: "detach", id: DELETE_ID }, "正在救回…", "已救回").then(
          function (payload) {
            if (payload && window.FamilyFeed && window.FamilyFeed.refresh) {
              window.FamilyFeed.refresh();
            }
          }
        );
        return;
      }
      const ok = window.confirm(
        "刪除「#" + tag.label + "」？所有照片上的這個標記都會消失。"
      );
      if (!ok) return;
      runChange(
        { action: "delete", id: tag.id },
        "正在刪除 #" + tag.label + "…",
        "已刪除 #" + tag.label
      );
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
          if (renaming) {
            askMerge(renaming, hit);
            return;
          }
          ghostChip(hit.label);
          runChange(
            { action: "attach", id: hit.id },
            "正在加上 #" + hit.label + "…",
            "已加上 #" + hit.label
          );
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
        const was = renaming.label;
        const exact = matches().filter(function (hit) {
          return String(hit.label) === label;
        });
        if (exact.length === 1) {
          askMerge(renaming, exact[0]);
          return;
        }
        runChange(
          { action: "rename", id: renaming.id, label: label },
          "正在把 #" + was + " 改成 #" + label + "…",
          "已改成 #" + label
        );
        return;
      }
      const exact = matches().filter(function (hit) {
        return String(hit.label) === label;
      });
      ghostChip(label);
      if (exact.length === 1) {
        runChange(
          { action: "attach", id: exact[0].id },
          "正在加上 #" + label + "…",
          "已加上 #" + label
        );
        return;
      }
      runChange(
        { action: "create_on_photo", kind: "custom", label: label },
        "正在新增 #" + label + "…",
        "已新增 #" + label
      );
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
    const shipped = (data && data.photo && data.photo.faces) || [];
    // The tag sheet and the face boxes are fetched side by side, so whichever
    // lands second must not wipe out boxes the other one already drew.
    if (!keepFaces || shipped.length) paintFaces(shipped);
  }

  function currentPswp() {
    return window.FamilyFeed && typeof window.FamilyFeed.pswp === "function"
      ? window.FamilyFeed.pswp()
      : null;
  }

  function currentPhotoImg() {
    const pswp = currentPswp();
    const slide = pswp && pswp.currSlide;
    if (slide && slide.content) {
      const el = slide.content.element;
      if (el && el.tagName === "IMG" && el.parentNode) return el;
      const ph = slide.getPlaceholderElement && slide.getPlaceholderElement();
      if (ph && ph.parentNode) return ph;
    }
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
    document.querySelectorAll(".pswp-face-layer").forEach(function (el) {
      el.remove();
    });
    faceLayer = document.createElement("div");
    faceLayer.className = "pswp-face-layer";
    return faceLayer;
  }

  function clearFaces() {
    faceTick += 1;
    faceBoxes = [];
    document.querySelectorAll(".pswp-face-layer").forEach(function (el) {
      el.remove();
    });
    faceLayer = null;
  }

  function wrapScale(slide) {
    if (!slide) return 1;
    const base = slide.currentResolution || (slide.zoomLevels && slide.zoomLevels.initial) || 1;
    const z = (slide.currZoomLevel || base) / base;
    return z > 0 ? z : 1;
  }

  function syncFaceZoom() {
    if (!faceLayer || !faceLayer.isConnected || !faceBoxes.length) return;
    const img = currentPhotoImg();
    if (!img || !img.parentNode) return;
    const pswp = currentPswp();
    const content = pswp && pswp.currSlide && pswp.currSlide.content;
    let w = img.offsetWidth;
    let h = img.offsetHeight;
    if (content && content.element === img && content.displayedImageWidth >= 8) {
      w = content.displayedImageWidth;
      h = content.displayedImageHeight;
    }
    if (w < 8 || h < 8) return;
    const widthPx = w + "px";
    const heightPx = h + "px";
    if (faceLayer.style.width !== widthPx) faceLayer.style.width = widthPx;
    if (faceLayer.style.height !== heightPx) faceLayer.style.height = heightPx;
    const leftPx = img.offsetLeft + "px";
    const topPx = img.offsetTop + "px";
    if (faceLayer.style.left !== leftPx) faceLayer.style.left = leftPx;
    if (faceLayer.style.top !== topPx) faceLayer.style.top = topPx;
    faceLayer.style.setProperty("--face-z", String(wrapScale(pswp && pswp.currSlide)));
  }

  function fillFaceBoxes() {
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
        runChange(
          { action: "delete", id: face.id },
          "正在刪除 #" + (face.label || "") + "…",
          "已刪除 #" + (face.label || "")
        );
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
    if (selectedTag) highlightFace(selectedTag);
  }

  function layoutFaces() {
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
    const img = currentPhotoImg();
    const wrap = img && img.parentNode;
    if (!img || !wrap || img.offsetWidth < 8 || img.offsetHeight < 8) {
      if (img && !img.complete && !img.dataset.faceLay) {
        img.dataset.faceLay = "1";
        img.addEventListener(
          "load",
          function () {
            img.dataset.faceLay = "";
            layoutFaces();
          },
          { once: true }
        );
      }
      return;
    }
    wrap.appendChild(layer);
    if (!layer.querySelector(".pswp-face")) fillFaceBoxes();
    applyFaceCube();
    syncFaceZoom();
  }

  function paintFaces(faces) {
    faceTick += 1;
    faceBoxes = (faces || []).filter(function (face) {
      return face && face.bbox && face.bbox.length === 4;
    });
    if (!faceBoxes.length) {
      layoutFaces();
      return;
    }
    fillFaceBoxes();
    layoutFaces();
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

  function stillOn(item) {
    return !!sheetItem && sheetItem.rel === item.rel && sheetItem.bucket === item.bucket;
  }

  function loadPhoto(item) {
    sheetItem = item;
    faceTick += 1;
    faceBoxes = [];
    if (faceLayer) faceLayer.innerHTML = "";
    const node = hostSheet();
    node.hidden = false;
    node.classList.toggle("is-video", item.kind === "video");
    hostFaceCube();
    if (faceCtrl) faceCtrl.abort();
    faceCtrl = new AbortController();
    const ac = faceCtrl;
    const query = photoQuery(item);
    let drewFaces = false;
    // Both answers are wanted straight away. Holding the face request until the
    // tag sheet came back is what left the cubes trailing the photo.
    api("/api/tags?" + query, { signal: ac.signal })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (stillOn(item)) paintSheet(data, drewFaces);
      })
      .catch(function () {});
    if (item.kind === "video") return;
    api("/api/faces?" + query, { signal: ac.signal })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.faces || !stillOn(item)) return;
        drewFaces = true;
        paintFaces(data.faces);
      })
      .catch(function () {});
  }

  function closePhoto() {
    sheetItem = null;
    if (faceCtrl) faceCtrl.abort();
    if (sheet) sheet.hidden = true;
    if (faceCube) faceCube.hidden = true;
    clearFaces();
  }

  // iOS does not shrink the layout viewport for the on-screen keyboard, so a sheet
  // pinned to bottom:0 ends up underneath it. visualViewport is the only thing that
  // knows how much of the window the keyboard is actually covering.
  (function watchKeyboard() {
    const vv = window.visualViewport;
    if (!vv) return;
    function sync() {
      const lift = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      const up = lift > 80;
      document.documentElement.style.setProperty("--kb", Math.round(lift) + "px");
      document.documentElement.classList.toggle("kb-up", up);
      if (up && sheet) {
        window.requestAnimationFrame(function () {
          const focused = document.activeElement;
          if (focused && sheet.contains(focused) && focused.scrollIntoView) {
            focused.scrollIntoView({ block: "nearest" });
          }
        });
      }
    }
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    sync();
  })();

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
    syncFaceZoom: syncFaceZoom,
    closePhoto: closePhoto,
    act: post,
    DELETE_ID: DELETE_ID,
  };
})();
