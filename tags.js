(function () {
  const board = document.getElementById("tag-board");
  const RENAMEABLE = { person: 1, place_country: 1, place_city: 1, custom: 1 };
  const DELETE_ID = "media:delete";
  const ARROW =
    '<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="18"/><path d="M15.2 11.5L22.5 18l-7.3 6.5"/></svg>';
  let person = "";
  let selected = [];
  let applied = [];
  let collapsed = { "地點": true, "類型": true, "自訂": true, "人物": true };
  let mode = "all";
  let modeActive = "all";
  let lastBoard = { groups: [], job: {} };
  let sheet = null;
  let sheetItem = null;
  let faceLayer = null;
  let faceBoxes = [];
  let faceTick = 0;
  let faceCtrl = null;
  let faceCube = null;
  let selectedTag = null;
  let pickerRefresh = function () {};
  let batchSheet = null;
  let lastLoadAt = 0;

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

  function allTags() {
    const seen = {};
    const out = [];
    (lastBoard.groups || []).forEach(function (group) {
      (group.tags || []).forEach(function (tag) {
        if (!tag || !tag.id || seen[tag.id]) return;
        seen[tag.id] = true;
        out.push(tag);
      });
    });
    return out;
  }

  function tagById(id) {
    const rows = allTags();
    for (let i = 0; i < rows.length; i += 1) {
      if (rows[i].id === id) return rows[i];
    }
    return null;
  }

  function tagPool(opts) {
    opts = opts || {};
    return allTags().filter(function (tag) {
      if (opts.kind && tag.kind !== opts.kind) return false;
      if (opts.exceptId && tag.id === opts.exceptId) return false;
      if (opts.exceptIds && opts.exceptIds[tag.id]) return false;
      if (opts.customPeople && tag.kind === "person" && tag.auto) return false;
      return true;
    });
  }

  function recommendations(opts) {
    opts = opts || {};
    const pool = tagPool(opts).filter(function (tag) {
      return !(
        opts.hideAutoPeople &&
        tag.kind === "person" &&
        tag.auto &&
        /^p\d+$/i.test(String(tag.label || ""))
      );
    });
    const recent = pool
      .filter(function (tag) {
        return Number(tag.used_at) > 0;
      })
      .sort(function (a, b) {
        return Number(b.used_at) - Number(a.used_at) || Number(b.count) - Number(a.count);
      });
    const popular = pool.slice().sort(function (a, b) {
      return (
        Number(b.count) - Number(a.count) ||
        Number(b.used_at) - Number(a.used_at) ||
        String(a.label || "").localeCompare(String(b.label || ""), "zh-Hant")
      );
    });
    const out = [];
    const seen = {};
    recent.slice(0, 4).concat(popular).forEach(function (tag) {
      if (out.length >= 8 || seen[tag.id]) return;
      seen[tag.id] = true;
      out.push(tag);
    });
    return out;
  }

  function catalogOf(query, opts) {
    const q = String(query || "").trim().replace(/^#/, "").toLowerCase();
    if (!q) return recommendations(opts);
    return tagPool(opts)
      .filter(function (tag) {
        return String(tag.label || "").toLowerCase().indexOf(q) >= 0;
      })
      .sort(function (a, b) {
        const al = String(a.label || "").toLowerCase();
        const bl = String(b.label || "").toLowerCase();
        return (
          Number(bl === q) - Number(al === q) ||
          Number(bl.indexOf(q) === 0) - Number(al.indexOf(q) === 0) ||
          Number(b.count) - Number(a.count) ||
          Number(b.used_at) - Number(a.used_at)
        );
      })
      .slice(0, 8);
  }

  function tagInput(placeholder) {
    const input = document.createElement("input");
    input.type = "search";
    input.name = "search";
    input.maxLength = 48;
    input.placeholder = placeholder || "搜尋標籤";
    input.autocomplete = "off";
    input.autocapitalize = "none";
    input.setAttribute("autocorrect", "off");
    input.spellcheck = false;
    input.setAttribute("enterkeyhint", "done");
    input.className = "tag-search-input";
    input.addEventListener("pointerdown", function (ev) {
      const ios =
        /iPad|iPhone|iPod/.test(navigator.userAgent || "") ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      if (!ios || document.activeElement === input) return;
      ev.preventDefault();
      try {
        input.focus({ preventScroll: true });
      } catch (e) {
        input.focus();
      }
    });
    return input;
  }

  function submitArrow(label, extraClass) {
    const button = document.createElement("button");
    button.type = "submit";
    button.className = "apple-next tag-submit" + (extraClass ? " " + extraClass : "");
    button.setAttribute("aria-label", label);
    button.title = label;
    button.innerHTML = ARROW;
    return button;
  }

  function tagChip(tag, on, choose) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "tag-chip" + (on ? " is-on" : "");
    chip.dataset.tagId = tag.id;
    chip.textContent = "#" + tag.label;
    chip.addEventListener("click", function (ev) {
      ev.preventDefault();
      choose(tag);
    });
    return chip;
  }

  function removableTagChip(tag, remove) {
    const wrap = document.createElement("span");
    wrap.className = "tag-chip-wrap is-on";
    wrap.dataset.id = tag.id;
    wrap.appendChild(tagChip(tag, true, remove));
    const x = document.createElement("button");
    x.type = "button";
    x.className = "ins-x";
    x.setAttribute("aria-label", "取消 #" + tag.label);
    x.textContent = "×";
    x.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      remove(tag);
    });
    wrap.appendChild(x);
    return wrap;
  }

  function tagKey(ids) {
    return (ids || []).slice().sort().join(",");
  }

  function setBoardInert(on) {
    if (!board) return;
    board.toggleAttribute("inert", !!on);
  }

  function renderSuggestions(host, query, opts, choose) {
    host.innerHTML = "";
    const hits = catalogOf(query, opts);
    if (!hits.length) return;
    const title = document.createElement("p");
    title.className = "tag-suggest-title";
    title.textContent = opts && opts.kind === "person" ? "建議的人物" : "建議的標籤";
    host.appendChild(title);
    hits.forEach(function (tag) {
      let done = false;
      function pick(ev) {
        if (ev) ev.preventDefault();
        if (done) return;
        done = true;
        choose(tag);
      }
      const chip = tagChip(tag, false, pick);
      chip.addEventListener("pointerdown", pick);
      host.appendChild(chip);
    });
  }

  function createPicker(opts) {
    const root = document.createElement("div");
    root.className = "tag-picker" + (opts.hideInput ? " no-search" : "");
    const card = document.createElement("div");
    card.className = "tag-picker-card";
    const chosen = opts.chosenHost || document.createElement("div");
    if (!opts.chosenHost) chosen.className = "tag-picker-chosen";
    const form = document.createElement("form");
    form.className = "tag-picker-form";
    form.autocomplete = "off";
    const input = tagInput("搜尋標籤");
    const go = submitArrow(opts.actionText, opts.mainAction ? "mode-pick" : "");
    const suggest = document.createElement("div");
    suggest.className = "tag-picker-suggest";
    let blurTimer = 0;
    if (!opts.hideInput) form.appendChild(input);
    form.appendChild(go);
    if (!opts.chosenHost) card.appendChild(chosen);
    card.appendChild(form);
    card.appendChild(suggest);
    root.appendChild(card);

    function ids() {
      return opts.ids;
    }

    function toggle(tag, keepFocus) {
      const at = ids().indexOf(tag.id);
      if (at >= 0) ids().splice(at, 1);
      else ids().push(tag.id);
      input.value = "";
      if (keepFocus && input.isConnected) {
        try {
          input.focus({ preventScroll: true });
        } catch (e) {
          input.focus();
        }
      }
      refresh();
      if (opts.onChange) opts.onChange(ids().slice());
    }

    function refresh() {
      chosen.innerHTML = "";
      chosen.hidden = !ids().length;
      ids().forEach(function (id) {
        const tag = tagById(id);
        if (tag) {
          chosen.appendChild(
            removableTagChip(tag, function (picked) {
              toggle(picked, false);
            })
          );
        }
      });
      const exceptIds = {};
      ids().forEach(function (id) {
        exceptIds[id] = true;
      });
      if (
        !opts.hideInput &&
        (root.classList.contains("is-searching") ||
          document.activeElement === input ||
          input.value)
      ) {
        renderSuggestions(
          suggest,
          input.value,
          { exceptIds: exceptIds, hideAutoPeople: !input.value },
          function (picked) {
            toggle(picked, !opts.mainAction);
            if (!opts.mainAction) return;
            if (blurTimer) window.clearTimeout(blurTimer);
            blurTimer = 0;
            root.classList.remove("is-searching");
            suggest.innerHTML = "";
            input.blur();
          }
        );
      } else {
        suggest.innerHTML = "";
      }
      board.querySelectorAll(".tag-row .tag-chip").forEach(function (chip) {
        chip.classList.toggle("is-on", ids().indexOf(chip.dataset.tagId) >= 0);
      });
      const dirty = opts.appliedIds && tagKey(ids()) !== tagKey(opts.appliedIds());
      go.hidden = !!opts.mainAction && !dirty;
      if (!opts.mainAction) {
        go.disabled = !ids().length && !String(input.value || "").trim();
      }
    }

    input.addEventListener("focus", function () {
      if (blurTimer) window.clearTimeout(blurTimer);
      root.classList.add("is-searching");
      refresh();
    });
    function finishBlur() {
      blurTimer = 0;
      if (document.activeElement === input) return;
      if (document.documentElement.classList.contains("kb-up")) {
        blurTimer = window.setTimeout(finishBlur, 120);
        return;
      }
      root.classList.remove("is-searching");
      refresh();
    }
    input.addEventListener("blur", function () {
      if (blurTimer) window.clearTimeout(blurTimer);
      blurTimer = window.setTimeout(finishBlur, 180);
    });
    input.addEventListener("input", refresh);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      const label = String(input.value || "").trim().replace(/^#/, "");
      const exact = catalogOf(label, {}).filter(function (tag) {
        return String(tag.label || "").toLowerCase() === label.toLowerCase();
      })[0];
      if (exact && ids().indexOf(exact.id) < 0) ids().push(exact.id);
      refresh();
      const choices = ids()
        .map(tagById)
        .filter(Boolean);
      const fresh = opts.allowNew && label && !exact ? label : "";
      if (opts.mainAction) {
        root.classList.remove("is-searching");
        suggest.innerHTML = "";
        input.blur();
      }
      opts.onSubmit(choices, fresh);
    });
    refresh();
    return { node: root, refresh: refresh, input: input };
  }

  function updateModeButtons() {
    if (!board) return;
    board.querySelectorAll(".mode-btn[data-mode]").forEach(function (btn) {
      btn.classList.toggle("is-on", btn.dataset.mode === modeActive);
    });
  }

  function modeBtn(id, label) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.mode = id;
    btn.className = "mode-btn" + (modeActive === id ? " is-on" : "");
    btn.textContent = label;
    btn.addEventListener("click", function () {
      if (id === "all") {
        if (
          mode === "all" &&
          modeActive === "all" &&
          !selected.length &&
          !applied.length
        ) {
          return;
        }
        mode = "all";
        modeActive = "all";
        selected.splice(0, selected.length);
        if (window.FamilyFeed) window.FamilyFeed.filter([]);
        paint(lastBoard);
        return;
      }
      if (mode === id && modeActive === id) return;
      mode = id;
      modeActive = id;
      paint(lastBoard);
    });
    return btn;
  }

  function paint(data) {
    if (!board) return;
    lastBoard = data || lastBoard;
    selected = selected.filter(function (id) {
      return !!tagById(id);
    });
    board.hidden = false;
    board.innerHTML = "";
    const bar = document.createElement("div");
    bar.className = "mode-bar";
    bar.appendChild(modeBtn("all", "All"));
    bar.appendChild(modeBtn("list", "List"));
    board.appendChild(bar);
    const chosen = document.createElement("div");
    chosen.className = "tag-picker-chosen tag-main-chosen";
    board.appendChild(chosen);
    const picker = createPicker({
      ids: selected,
      chosenHost: chosen,
      actionText: "Pick",
      mainAction: true,
      hideInput: mode === "list",
      appliedIds: function () {
        return applied;
      },
      allowNew: false,
      onChange: function () {
        if (mode === "list") paint(lastBoard);
      },
      onSubmit: function (choices) {
        const ids = choices.map(function (tag) {
          return tag.id;
        });
        if (window.FamilyFeed) window.FamilyFeed.filter(ids);
      },
    });
    pickerRefresh = picker.refresh;
    board.appendChild(picker.node);
    if (mode !== "list") return;
    (lastBoard.groups || []).forEach(function (group) {
      const available = (group.tags || []).filter(function (tag) {
        return selected.indexOf(tag.id) < 0;
      });
      if (!available.length) return;
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
        available.forEach(function (tag) {
          row.appendChild(
            tagChip(tag, false, function (picked) {
              if (selected.indexOf(picked.id) < 0) selected.push(picked.id);
              paint(lastBoard);
            })
          );
        });
        wrap.appendChild(row);
      }
      board.appendChild(wrap);
    });
  }

  function load() {
    if (!person) return;
    lastLoadAt = Date.now();
    api("/api/tags?person=" + encodeURIComponent(person))
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        const active = document.activeElement;
        if (
          batchSheet ||
          (active && active.classList && active.classList.contains("tag-search-input"))
        ) {
          lastBoard = data || lastBoard;
          return;
        }
        paint(data);
      })
      .catch(function () {});
  }

  function accept(payload) {
    if (payload && payload.groups) paint(payload);
    return payload;
  }

  function closeBatch() {
    if (batchSheet) batchSheet.remove();
    batchSheet = null;
    setBoardInert(false);
    document.documentElement.classList.remove("tag-modal-open");
  }

  function openBatch() {
    closeBatch();
    const mask = document.createElement("div");
    mask.className = "batch-tag-mask";
    const card = document.createElement("div");
    card.className = "batch-tag-sheet";
    const head = document.createElement("div");
    head.className = "batch-tag-head";
    const title = document.createElement("p");
    title.textContent = "加上標籤";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "batch-tag-close";
    close.setAttribute("aria-label", "關閉");
    close.textContent = "×";
    close.addEventListener("click", closeBatch);
    head.appendChild(title);
    head.appendChild(close);
    const ids = [];
    const picker = createPicker({
      ids: ids,
      actionText: "加上",
      allowNew: true,
      onSubmit: function (choices, fresh) {
        const picks = choices.slice();
        if (fresh) picks.push({ label: fresh });
        if (!picks.length || !window.FamilyFeed) return;
        window.FamilyFeed.tagSelected(picks).then(function (payload) {
          if (payload) closeBatch();
        });
      },
    });
    card.appendChild(head);
    card.appendChild(picker.node);
    mask.appendChild(card);
    mask.addEventListener("click", function (ev) {
      if (ev.target === mask) closeBatch();
    });
    document.body.appendChild(mask);
    batchSheet = mask;
    setBoardInert(true);
    document.documentElement.classList.add("tag-modal-open");
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

  function afterChange(payload, item) {
    if (item && stillOn(item)) paintSheet(payload);
    // The write already answers with the whole board, so fetching it again
    // only doubled the wait after every tap.
    if (payload && payload.groups) paint(payload);
    else load();
  }

  function runChange(body, working, said) {
    const item = sheetItem;
    window.FamilyBusy.start(working);
    return photoPost(body, item).then(
      function (payload) {
        window.FamilyBusy.done(said);
        afterChange(payload, item);
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
    node.classList.remove("is-searching");
    node.innerHTML = "";
    const card = document.createElement("div");
    card.className = "pswp-tag-card";
    node.appendChild(card);
    const title = document.createElement("p");
    title.className = "pswp-tag-title";
    title.textContent = sheetItem && sheetItem.trash
      ? "垃圾桶"
      : sheetItem && sheetItem.kind === "video"
        ? "這支的標記"
        : "這張的標記";
    card.appendChild(title);
    const row = document.createElement("div");
    row.className = "pswp-tag-row";
    const photoTags = (data && data.photo && data.photo.tags) || [];
    const tags = sheetItem && sheetItem.trash
      ? photoTags.filter(function (tag) {
          return tag && tag.id === DELETE_ID;
        })
      : photoTags;
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
    function renameTarget() {
      if (renaming) return renaming;
      const on = row.querySelector(".tag-chip-wrap.is-on");
      if (!on) return null;
      const id = on.dataset.id;
      for (let i = 0; i < tags.length; i++) {
        if (tags[i].id === id && RENAMEABLE[tags[i].kind]) return tags[i];
      }
      return null;
    }
    const form = document.createElement("form");
    form.className = "pswp-tag-add tag-picker-form";
    form.autocomplete = "off";
    const input = tagInput("搜尋標籤");
    const go = submitArrow("新增");
    const suggest = document.createElement("div");
    suggest.className = "pswp-tag-suggest tag-picker-suggest";

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
        "要把「#" + src.label + "」改成「#" + dst.label + "」嗎？"
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
      const ok = window.confirm("從這張拿掉「#" + tag.label + "」？");
      if (!ok) return;
      runChange(
        { action: "detach", id: tag.id },
        "正在拿掉 #" + tag.label + "…",
        "已從這張拿掉 #" + tag.label
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
      const target = renameTarget();
      if (target) {
        return catalogOf(q, {
          kind: target.kind,
          exceptId: target.id,
          customPeople: target.kind === "person",
        });
      }
      return catalogOf(q, { exceptIds: onPhoto, hideAutoPeople: !q });
    }

    function renderSuggest() {
      const target = renameTarget();
      renderSuggestions(
        suggest,
        input.value,
        target
          ? {
              kind: target.kind,
              exceptId: target.id,
              customPeople: target.kind === "person",
            }
          : { exceptIds: onPhoto, hideAutoPeople: !input.value },
        function (hit) {
          const target = renameTarget();
          if (target) {
            askMerge(target, hit);
            return;
          }
          ghostChip(hit.label);
          runChange(
            { action: "attach", id: hit.id },
            "正在加上 #" + hit.label + "…",
            "已加上 #" + hit.label
          );
        }
      );
    }

    function exitRename() {
      renaming = null;
      go.setAttribute("aria-label", "新增");
      go.title = "新增";
      input.value = "";
      renderSuggest();
    }

    function enterRename(tag) {
      renaming = tag;
      go.setAttribute("aria-label", "改名");
      go.title = "改名";
      input.value =
        tag.kind === "person" && tag.auto && /^p\d+$/i.test(String(tag.label || ""))
          ? ""
          : tag.label;
      renderSuggest();
      input.focus();
      if (input.value) input.select();
    }

    function enterSearch() {
      node.classList.add("is-searching");
      const target = renameTarget();
      title.textContent = target && target.kind === "person" ? "建議的人物" : "建議的標籤";
      renderSuggest();
    }

    function leaveSearch() {
      window.setTimeout(function () {
        if (node.contains(document.activeElement)) return;
        node.classList.remove("is-searching");
        title.textContent = sheetItem && sheetItem.kind === "video" ? "這支的標記" : "這張的標記";
      }, 0);
    }

    tags.forEach(function (tag) {
      const wrap = document.createElement("span");
      const restore = !!(sheetItem && sheetItem.trash && tag.id === DELETE_ID);
      wrap.className =
        "tag-chip-wrap" +
        (RENAMEABLE[tag.kind] ? "" : " is-lock") +
        (restore ? " is-on" : "");
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
      x.hidden = !restore;
      x.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        askDeleteTag(tag);
      });
      chip.addEventListener("click", function () {
        highlightFace(tag.id);
        showChipX();
        if (!RENAMEABLE[tag.kind]) {
          if (renaming) exitRename();
          return;
        }
        if (renaming && renaming.id === tag.id) {
          exitRename();
          highlightFace(null);
          showChipX();
          return;
        }
        enterRename(tag);
      });
      wrap.appendChild(chip);
      wrap.appendChild(x);
      row.appendChild(wrap);
    });
    card.appendChild(row);
    if (sheetItem && sheetItem.trash) {
      paintFaces([]);
      return;
    }

    let addClick = false;
    go.addEventListener("pointerdown", function () {
      addClick = true;
    });
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      const byAdd = addClick;
      addClick = false;
      if (!byAdd) return;
      const label = (input.value || "").trim().replace(/^#/, "");
      if (!label) return;
      const target = renameTarget();
      if (target) {
        const was = target.label;
        const exact = matches().filter(function (hit) {
          return String(hit.label || "").toLowerCase() === label.toLowerCase();
        });
        if (exact.length === 1) {
          askMerge(target, exact[0]);
          return;
        }
        runChange(
          { action: "rename", id: target.id, label: label },
          "正在把 #" + was + " 改成 #" + label + "…",
          "已改成 #" + label
        );
        return;
      }
      const exact = matches().filter(function (hit) {
        return String(hit.label || "").toLowerCase() === label.toLowerCase();
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
    input.addEventListener("focus", enterSearch);
    input.addEventListener("blur", leaveSearch);
    input.addEventListener("input", renderSuggest);
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && renaming) {
        ev.preventDefault();
        exitRename();
      }
    });
    form.appendChild(input);
    form.appendChild(go);
    card.appendChild(form);
    card.appendChild(suggest);
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
          "從這張拿掉「#" + (face.label || "") + "」？"
        );
        if (!ok) return;
        runChange(
          { action: "detach", id: face.id },
          "正在拿掉 #" + (face.label || "") + "…",
          "已從這張拿掉 #" + (face.label || "")
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

  function photoPost(body, item) {
    item = item || sheetItem;
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
    return (
      !!sheetItem &&
      sheetItem.person === item.person &&
      sheetItem.rel === item.rel &&
      sheetItem.bucket === item.bucket
    );
  }

  function loadPhoto(item) {
    sheetItem = item;
    faceTick += 1;
    faceBoxes = [];
    if (faceLayer) faceLayer.innerHTML = "";
    const node = hostSheet();
    node.classList.remove("is-searching");
    node.innerHTML = "";
    node.hidden = false;
    node.classList.toggle("is-video", item.kind === "video");
    node.classList.toggle("is-trash-photo", !!item.trash);
    setBoardInert(true);
    if (item.trash) {
      if (faceCube) faceCube.hidden = true;
    } else {
      hostFaceCube();
    }
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
    if (item.kind === "video" || item.trash) return;
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
    setBoardInert(false);
    clearFaces();
  }

  function beforePhotoChange() {
    const active = document.activeElement;
    if (sheet && active && sheet.contains(active) && active.blur) active.blur();
    if (sheet) sheet.classList.remove("is-searching");
  }

  function refreshPhoto() {
    if (sheetItem) loadPhoto(sheetItem);
  }

  // iOS does not shrink the layout viewport for the on-screen keyboard, so a sheet
  // pinned to bottom:0 ends up underneath it. visualViewport is the only thing that
  // knows how much of the window the keyboard is actually covering.
  (function watchKeyboard() {
    const vv = window.visualViewport;
    if (!vv) return;
    let keyboardUp = false;
    let lastLift = -1;
    let revealTimer = 0;
    let closeTimer = 0;
    let lastHeight = -1;
    let lastTop = -1;
    function sync() {
      const lift = Math.max(0, window.innerHeight - vv.height);
      const height = Math.round(vv.height);
      const top = Math.round(vv.offsetTop);
      if (Math.abs(height - lastHeight) >= 2 || lastHeight < 0) {
        lastHeight = height;
        document.documentElement.style.setProperty("--vvh", height + "px");
      }
      if (Math.abs(top - lastTop) >= 2 || lastTop < 0) {
        lastTop = top;
        document.documentElement.style.setProperty("--vv-top", top + "px");
      }
      if (!keyboardUp && lift > 100) {
        if (closeTimer) window.clearTimeout(closeTimer);
        closeTimer = 0;
        keyboardUp = true;
      } else if (keyboardUp && lift < 40 && !closeTimer) {
        closeTimer = window.setTimeout(function () {
          closeTimer = 0;
          if (Math.max(0, window.innerHeight - vv.height) >= 40) return;
          keyboardUp = false;
          lastLift = 0;
          document.documentElement.style.setProperty("--kb", "0px");
          document.documentElement.classList.remove("kb-up");
        }, 220);
      } else if (lift >= 40 && closeTimer) {
        window.clearTimeout(closeTimer);
        closeTimer = 0;
      }
      if (!(keyboardUp && lift < 40) && (Math.abs(lift - lastLift) >= 6 || lastLift < 0)) {
        lastLift = lift;
        document.documentElement.style.setProperty("--kb", Math.round(lift) + "px");
      }
      document.documentElement.classList.toggle("kb-up", keyboardUp);
    }
    vv.addEventListener("resize", sync);
    document.addEventListener("focusin", function (ev) {
      const target = ev.target;
      if (!target || !target.classList || !target.classList.contains("tag-search-input")) return;
      if (revealTimer) window.clearTimeout(revealTimer);
      revealTimer = window.setTimeout(function () {
        revealTimer = 0;
        sync();
        if (target.closest(".batch-tag-mask, .pswp")) return;
        if (!keyboardUp || document.activeElement !== target || !target.scrollIntoView) return;
        const box = target.getBoundingClientRect();
        const visibleBottom = vv.offsetTop + vv.height;
        if (box.bottom > visibleBottom - 12) target.scrollIntoView({ block: "nearest" });
      }, 520);
    });
    sync();
  })();

  window.FamilyTags = {
    show: function (who) {
      if (person === who) {
        if (Date.now() - lastLoadAt > 15000) load();
        return;
      }
      person = who;
      mode = "all";
      modeActive = "all";
      selected = [];
      applied = [];
      load();
    },
    showPhoto: function (item) {
      if (!item || !item.person) return;
      loadPhoto(item);
    },
    layoutFaces: layoutFaces,
    syncFaceZoom: syncFaceZoom,
    closePhoto: closePhoto,
    beforePhotoChange: beforePhotoChange,
    refreshPhoto: refreshPhoto,
    openBatch: openBatch,
    setApplied: function (ids) {
      applied = (ids || []).slice();
      selected.splice.apply(selected, [0, selected.length].concat(applied));
      if (!(modeActive === "all" && !applied.length)) modeActive = "";
      pickerRefresh();
      updateModeButtons();
    },
    accept: accept,
    act: post,
    DELETE_ID: DELETE_ID,
  };
})();
