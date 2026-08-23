(function () {
  const ORIGIN = (window.VAULT_ORIGIN || "").replace(/\/$/, "");
  const FIRST = 12;
  const LIMIT = 24;
  const THUMB_CAP = 6;
  const SELECT_MAX = 99;
  const THUMB_CACHE = "famiphoto-thumbs-v1";
  const SKIP_TRASH_KEY = "family.skipTrashAsk";
  document.addEventListener("contextmenu", function (ev) {
    const t = ev.target && ev.target.closest;
    if (!t) return;
    if (ev.target.closest(".tile") || ev.target.closest(".pswp")) ev.preventDefault();
  }, true);
  let run = 0;
  let lightbox;
  let thumbActive = 0;
  const thumbWait = [];
  const blobUrls = [];
  let paintHint = function () {};
  let afterThumbs = function () {};
  let currentPerson = "";
  let currentTags = [];
  let trashMode = false;
  let selecting = false;
  let picked = {};
  let selectHint = "";

  function api(path) {
    const url = ORIGIN + path;
    const k = window.FAMILY_VIEW_KEY;
    if (!k) return url;
    return url + (path.indexOf("?") >= 0 ? "&" : "?") + "k=" + encodeURIComponent(k);
  }

  function thumbsBusy() {
    return thumbActive > 0 || thumbWait.length > 0;
  }

  function dropBlobs() {
    blobUrls.forEach(function (u) {
      try {
        URL.revokeObjectURL(u);
      } catch (e) {}
    });
    blobUrls.length = 0;
  }

  function pumpThumbs() {
    while (thumbActive < THUMB_CAP && thumbWait.length) {
      const job = thumbWait.shift();
      thumbActive += 1;
      job(function () {
        thumbActive -= 1;
        pumpThumbs();
        paintHint();
        if (!thumbsBusy()) afterThumbs();
      });
    }
  }

  function thumbCache() {
    if (!window.caches) return Promise.resolve(null);
    return caches.open(THUMB_CACHE).catch(function () {
      return null;
    });
  }

  function readCachedThumb(url) {
    return thumbCache()
      .then(function (cache) {
        if (!cache) return null;
        return cache.match(url);
      })
      .then(function (res) {
        return res ? res.blob() : null;
      })
      .catch(function () {
        return null;
      });
  }

  function writeCachedThumb(url, blob) {
    if (!blob) return;
    thumbCache()
      .then(function (cache) {
        if (!cache) return;
        return cache.put(
          url,
          new Response(blob, { headers: { "Content-Type": blob.type || "image/jpeg" } })
        );
      })
      .catch(function () {
        caches.delete(THUMB_CACHE);
      });
  }

  function showBlob(img, blob, onReady) {
    const obj = URL.createObjectURL(blob);
    blobUrls.push(obj);
    function done() {
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", onErr);
      if (onReady) onReady();
    }
    function onLoad() {
      done();
    }
    function onErr() {
      done();
    }
    img.addEventListener("load", onLoad);
    img.addEventListener("error", onErr);
    img.src = obj;
  }

  function watchThumb(img, url) {
    img.dataset.thumbUrl = url;
    if (!window.thumbObserver) {
      window.thumbObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (en) {
            if (!en.isIntersecting) return;
            const node = en.target;
            window.thumbObserver.unobserve(node);
            const src = node.dataset.thumbUrl;
            if (!src || node.dataset.thumbBound) return;
            node.dataset.thumbBound = "1";
            bindThumb(node, src, function () {
              node.classList.add("is-on");
            });
          });
        },
        { rootMargin: "240px 0px" }
      );
    }
    window.thumbObserver.observe(img);
  }

  function bindThumb(img, url, onReady) {
    readCachedThumb(url).then(function (cached) {
      if (cached) {
        showBlob(img, cached, onReady);
        return;
      }
      let tries = 0;
      function start(done) {
        function settle() {
          if (done) done();
        }
        fetch(url, { mode: "cors", credentials: "omit" })
          .then(function (res) {
            if (!res.ok) throw new Error("bad");
            return res.blob();
          })
          .then(function (blob) {
            writeCachedThumb(url, blob);
            showBlob(img, blob, function () {
              settle();
              if (img.isConnected && onReady) onReady();
            });
          })
          .catch(function () {
            function onLoad() {
              img.removeEventListener("load", onLoad);
              img.removeEventListener("error", onErr);
              settle();
              if (img.isConnected && onReady) onReady();
            }
            function onErr() {
              img.removeEventListener("load", onLoad);
              img.removeEventListener("error", onErr);
              settle();
              if (tries >= 1) return;
              tries += 1;
              window.setTimeout(function () {
                thumbWait.push(start);
                pumpThumbs();
              }, 450 * tries);
            }
            img.addEventListener("load", onLoad);
            img.addEventListener("error", onErr);
            img.src = tries ? url + "&retry=" + tries : url;
          });
      }
      thumbWait.push(start);
      pumpThumbs();
    });
  }

  function qs(item, kind, size) {
    const p = new URLSearchParams({
      person: item.person,
      bucket: item.bucket,
      rel: item.rel,
    });
    if (kind === "thumb" && size) p.set("size", size);
    if (kind === "full") p.set("full", "1");
    return api((kind === "thumb" ? "/thumb?" : "/media?") + p.toString());
  }

  function itemKey(item) {
    return item.person + "|" + item.bucket + "|" + item.rel;
  }

  function pickCount() {
    return Object.keys(picked).length;
  }

  function tellSelect(hint) {
    if (hint !== undefined) selectHint = hint || "";
    if (pickCount() > 0) selectHint = "";
    if (window.FamilyDoor && window.FamilyDoor.setSelect) {
      window.FamilyDoor.setSelect(selecting ? pickCount() : 0, trashMode, selectHint);
    }
  }

  function markTile(a, on) {
    if (!a) return;
    a.classList.toggle("is-pick", !!on);
  }

  function paintPicked() {
    const feed = document.getElementById("feed");
    if (!feed) return;
    feed.querySelectorAll(".tile").forEach(function (a) {
      markTile(a, selecting && picked[a.dataset.key]);
    });
    tellSelect();
  }

  function enterSelect(item, tile) {
    selecting = true;
    if (item) {
      const key = itemKey(item);
      if (!picked[key] && pickCount() >= SELECT_MAX) return;
      picked[key] = item;
      markTile(tile, true);
    }
    tellSelect();
  }

  function toggleSelect(item, tile) {
    if (!selecting) {
      enterSelect(item, tile);
      return;
    }
    const key = itemKey(item);
    if (picked[key]) {
      delete picked[key];
      markTile(tile, false);
      if (!pickCount()) {
        selecting = false;
      }
    } else {
      if (pickCount() >= SELECT_MAX) return;
      picked[key] = item;
      markTile(tile, true);
    }
    tellSelect();
  }

  function clearSelect() {
    selecting = false;
    picked = {};
    selectHint = "";
    paintPicked();
  }

  function viewingItem() {
    if (!lightbox || !lightbox.pswp || !lightbox._slides) return null;
    if (!document.querySelector(".pswp--open")) return null;
    const slide = lightbox._slides[lightbox.pswp.currIndex];
    return (slide && slide.familyItem) || null;
  }

  function targetItems() {
    const keys = Object.keys(picked);
    if (keys.length) {
      return keys.map(function (key) {
        return picked[key];
      });
    }
    const one = viewingItem();
    return one ? [one] : [];
  }

  function targetRows() {
    return targetItems().map(function (item) {
      return { person: item.person, bucket: item.bucket, rel: item.rel };
    });
  }

  function prepareAction() {
    if (targetItems().length) return true;
    if (selecting) {
      clearSelect();
      return false;
    }
    selecting = true;
    tellSelect("請點選照片，可一張或多張，再按一次");
    return false;
  }

  function note(msg) {
    const el = document.getElementById("status");
    if (el) el.textContent = msg || "";
  }

  let busyDepth = 0;
  let busyClear = 0;

  function busyNode() {
    let node = document.getElementById("work-note");
    if (node) return node;
    node = document.createElement("div");
    node.id = "work-note";
    node.className = "work-note";
    node.hidden = true;
    const spin = document.createElement("span");
    spin.className = "work-spin";
    const text = document.createElement("span");
    text.className = "work-text";
    node.appendChild(spin);
    node.appendChild(text);
    document.body.appendChild(node);
    return node;
  }

  function paintBusy(msg, spinning) {
    const node = busyNode();
    node.querySelector(".work-text").textContent = msg || "";
    node.classList.toggle("is-done", !spinning);
    node.hidden = !msg;
  }

  // Every change tells the family it is being handled the moment they tap, so no
  // button ever looks like it did nothing while the vault writes.
  window.FamilyBusy = {
    start: function (msg) {
      busyDepth += 1;
      if (busyClear) {
        window.clearTimeout(busyClear);
        busyClear = 0;
      }
      paintBusy(msg || "處理中…", true);
    },
    done: function (msg) {
      busyDepth = Math.max(0, busyDepth - 1);
      if (busyDepth) return;
      if (!msg) {
        paintBusy("", false);
        return;
      }
      paintBusy(msg, false);
      busyClear = window.setTimeout(function () {
        busyClear = 0;
        paintBusy("", false);
      }, 1800);
    },
  };

  function skipTrashAsk() {
    try {
      return localStorage.getItem(SKIP_TRASH_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function rememberSkipTrash() {
    try {
      localStorage.setItem(SKIP_TRASH_KEY, "1");
    } catch (e) {}
  }

  function askTrash() {
    if (skipTrashAsk()) return Promise.resolve(true);
    return new Promise(function (resolve) {
      const mask = document.createElement("div");
      mask.className = "ask-mask";
      mask.innerHTML =
        '<div class="ask-card" role="dialog" aria-modal="true">' +
        "<p>將照片丟進垃圾桶?</p>" +
        '<label class="ask-skip"><span>不再提示</span><input type="checkbox" role="switch"/><span class="ask-sw"></span></label>' +
        '<div class="ask-actions"><button type="button" class="ask-no">取消</button><button type="button" class="ask-yes">丟掉</button></div>' +
        "</div>";
      const box = mask.querySelector("input");
      function finish(ok) {
        if (ok && box && box.checked) rememberSkipTrash();
        mask.remove();
        resolve(ok);
      }
      mask.querySelector(".ask-no").addEventListener("click", function () {
        finish(false);
      });
      mask.querySelector(".ask-yes").addEventListener("click", function () {
        finish(true);
      });
      mask.addEventListener("click", function (ev) {
        if (ev.target === mask) finish(false);
      });
      document.body.appendChild(mask);
    });
  }

  function downloadName(item, mime) {
    let name = String(item.rel || "photo").split(/[/\\]/).pop() || "photo";
    mime = String(mime || "");
    if (/\.hei[cf]$/i.test(name) && mime.indexOf("jpeg") >= 0) {
      name = name.replace(/\.hei[cf]$/i, ".jpg");
    }
    if (item.kind === "video" && mime.indexOf("mp4") >= 0 && /\.(mov|m4v)$/i.test(name)) {
      name = name.replace(/\.(mov|m4v)$/i, ".mp4");
    }
    return name;
  }

  function blobFile(item) {
    return fetch(qs(item, "full"))
      .then(function (res) {
        if (!res.ok) throw new Error("bad");
        return res.blob();
      })
      .then(function (blob) {
        const mime = blob.type || (item.kind === "video" ? "video/mp4" : "image/jpeg");
        return new File([blob], downloadName(item, mime), { type: mime });
      })
      .catch(function () {
        return null;
      });
  }

  function clickDownload(file) {
    const href = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = href;
    a.download = file.name;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(href);
    }, 8000);
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function saveItems(items) {
    if (!items.length) return Promise.resolve();
    const batch = items.length <= 8;
    note(items.length > 1 ? "正在下載 1 / " + items.length : "正在下載…");
    function shareOrSave(files) {
      if (!files.length) {
        note("現在下載不了，請再試一次");
        return Promise.resolve();
      }
      if (navigator.canShare && navigator.canShare({ files: files })) {
        return navigator.share({ files: files }).then(
          function () {
            note(files.length > 1 ? "已送出 " + files.length + " 張" : "已送出");
            clearSelect();
          },
          function (err) {
            if (err && err.name === "AbortError") {
              note("");
              return;
            }
            files.forEach(clickDownload);
            note(files.length > 1 ? "已下載 " + files.length + " 張" : "已下載");
            clearSelect();
          }
        );
      }
      files.forEach(clickDownload);
      note(files.length > 1 ? "已下載 " + files.length + " 張" : "已下載");
      clearSelect();
      return Promise.resolve();
    }
    if (batch) {
      const files = [];
      let chain = Promise.resolve();
      items.forEach(function (item, i) {
        chain = chain.then(function () {
          note("正在下載 " + (i + 1) + " / " + items.length);
          return blobFile(item).then(function (file) {
            if (file) files.push(file);
          });
        });
      });
      return chain.then(function () {
        return shareOrSave(files);
      });
    }
    let chain = Promise.resolve();
    let saved = 0;
    items.forEach(function (item, i) {
      chain = chain.then(function () {
        note("正在下載 " + (i + 1) + " / " + items.length);
        return blobFile(item).then(function (file) {
          if (!file) return;
          clickDownload(file);
          saved += 1;
          return wait(400);
        });
      });
    });
    return chain.then(function () {
      note(saved ? "已下載 " + saved + " 張" : "現在下載不了，請再試一次");
      if (saved) clearSelect();
    });
  }

  function tagPost(body) {
    if (window.FamilyTags && window.FamilyTags.act) return window.FamilyTags.act(body);
    return fetch(api("/api/tags"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (res) {
      if (!res.ok) throw new Error("bad");
      return res.json();
    });
  }

  function displayBox(nw, nh) {
    nw = Number(nw) || 0;
    nh = Number(nh) || 0;
    if (nw < 8 || nh < 8) {
      nw = 1600;
      nh = 1067;
    }
    const need = Math.max(window.innerWidth || 0, window.innerHeight || 0);
    const edge = Math.max(nw, nh);
    if (need && edge < need) {
      const k = need / edge;
      return { w: Math.round(nw * k), h: Math.round(nh * k) };
    }
    return { w: nw, h: nh };
  }

  function sameShape(slide, nw, nh) {
    if (!slide || !slide.width || !slide.height || !nw || !nh) return false;
    return Math.abs(slide.width / slide.height - nw / nh) < 0.01;
  }

  function applySlideSize(content, nw, nh) {
    if (!content) return;
    const box = displayBox(nw, nh);
    content.width = box.w;
    content.height = box.h;
    if (content.data) {
      content.data.width = box.w;
      content.data.height = box.h;
    }
    const slide = content.slide;
    if (!slide) return;
    slide.width = box.w;
    slide.height = box.h;
    // resize() recalculates the zoom levels from the new shape before redrawing.
    // Nudging updateContentSize alone left the old zoom behind, and the global
    // updateSize this used to call re-laid every slide from a neighbour's load
    // event, which is what warped photos after a few swipes.
    if (typeof slide.resize === "function") slide.resize();
    else if (typeof slide.updateContentSize === "function") slide.updateContentSize(true);
  }

  function monthLabel(group) {
    const m = /^(\d{4})-(\d{2})$/.exec(group || "");
    if (!m) return group || "";
    return m[1] + "年" + Number(m[2]) + "月";
  }

  function slideFor(item, tile) {
    const tileUrl = qs(item, "thumb", "tile");
    // The real shape comes from the index, so a portrait photo is never handed a
    // landscape box and then corrected mid-swipe.
    const box = displayBox(item.w, item.h);
    if (item.kind === "video") {
      const src = qs(item, "media");
      return {
        html:
          '<div class="pswp-video"><video controls playsinline webkit-playsinline preload="auto" poster="' +
          tileUrl.replace(/"/g, "") +
          '" src="' +
          src.replace(/"/g, "") +
          '"></video><p class="vid-wait" hidden>影片準備中…</p></div>',
        msrc: tileUrl,
        width: box.w,
        height: box.h,
        element: tile,
        familyItem: item,
      };
    }
    return {
      src: qs(item, "media"),
      msrc: tileUrl,
      width: box.w,
      height: box.h,
      alt: item.who,
      element: tile,
      thumbCropped: true,
      familyItem: item,
    };
  }

  function bufferedPct(video) {
    const d = video.duration;
    if (!d || !isFinite(d) || d <= 0) return null;
    const b = video.buffered;
    if (!b || !b.length) return 0;
    const t = video.currentTime || 0;
    let end = 0;
    for (let i = 0; i < b.length; i++) {
      if (b.start(i) <= t + 0.25) end = Math.max(end, b.end(i));
    }
    if (!end) end = b.end(b.length - 1);
    return Math.max(0, Math.min(99, Math.round((end / d) * 100)));
  }

  function paintWait(video, on) {
    const hint = video.parentNode && video.parentNode.querySelector(".vid-wait");
    if (!hint) return;
    if (!on) {
      hint.hidden = true;
      return;
    }
    const pct = bufferedPct(video);
    hint.textContent = pct == null ? "影片準備中…" : "影片準備中 " + pct + "%";
    hint.hidden = false;
  }

  function bindVideoWait(video) {
    if (!video || video.dataset.waitBound) return;
    video.dataset.waitBound = "1";
    function refresh() {
      paintWait(video, !video.paused && (video.readyState < 3 || video.seeking));
    }
    ["play", "waiting", "seeking", "seeked", "progress", "canplay", "playing", "pause", "ended", "stalled"].forEach(function (name) {
      video.addEventListener(name, refresh);
    });
  }

  function playVideo(video) {
    if (!video) return;
    video.playsInline = true;
    const play = video.play();
    if (play && play.catch) play.catch(function () {});
  }

  function ensureLightbox() {
    if (lightbox || !window.PhotoSwipeLightbox || !window.PhotoSwipe) return lightbox;
    lightbox = new window.PhotoSwipeLightbox({
      pswpModule: window.PhotoSwipe,
      loop: false,
      bgOpacity: 0.92,
      errorMsg: "目前無法載入",
      clickToCloseNonZoomable: false,
      imageClickAction: false,
      tapAction: false,
      maxZoomLevel: 12,
    });
    lightbox.addFilter("isContentZoomable", function (zoomable, content) {
      if (content && content.data && content.data.html) return true;
      return zoomable;
    });
    lightbox.addFilter("numItems", function () {
      return lightbox._slides ? lightbox._slides.length : 0;
    });
    lightbox.addFilter("itemData", function (itemData, index) {
      return (lightbox._slides && lightbox._slides[index]) || itemData;
    });
    lightbox.on("contentActivate", function (evt) {
      const el = evt.content && evt.content.element;
      const video = el && el.querySelector && el.querySelector("video");
      if (video && !video.getAttribute("src") && video.getAttribute("data-src")) {
        video.src = video.getAttribute("data-src");
      }
      if (video) {
        bindVideoWait(video);
        playVideo(video);
        const content = evt.content;
        function sizeVid() {
          if (!video.videoWidth) return;
          if (sameShape(content.slide, video.videoWidth, video.videoHeight)) return;
          applySlideSize(content, video.videoWidth, video.videoHeight);
        }
        if (video.videoWidth) sizeVid();
        else video.addEventListener("loadedmetadata", sizeVid, { once: true });
      }
      if (window.FamilyTags && window.FamilyTags.layoutFaces) window.FamilyTags.layoutFaces();
    });
    lightbox.on("contentDeactivate", function (evt) {
      const el = evt.content && evt.content.element;
      const video = el && el.querySelector && el.querySelector("video");
      if (video) video.pause();
    });
    lightbox.on("contentLoad", function (evt) {
      const el = evt.content && evt.content.element;
      const video = el && el.querySelector && el.querySelector("video[data-src]");
      if (!video) return;
      if (!video.getAttribute("src")) {
        video.src = video.getAttribute("data-src");
        video.load();
      }
    });
    lightbox.on("loadComplete", function (evt) {
      const el = evt.content && evt.content.element;
      const slide = evt.content && evt.content.slide;
      if (el && el.naturalWidth && !sameShape(slide, el.naturalWidth, el.naturalHeight)) {
        applySlideSize(evt.content, el.naturalWidth, el.naturalHeight);
      }
      if (window.FamilyTags && window.FamilyTags.layoutFaces) window.FamilyTags.layoutFaces();
    });
    lightbox.on("close", function () {
      document.querySelectorAll(".pswp-video video").forEach(function (v) {
        v.pause();
      });
      if (window.FamilyTags) window.FamilyTags.closePhoto();
      tellSelect();
    });
    lightbox.on("afterInit", function () {
      const pswp = lightbox.pswp;
      if (!pswp) return;
      pswp.on("resize", function () {
        if (window.FamilyTags && window.FamilyTags.layoutFaces) window.FamilyTags.layoutFaces();
      });
      pswp.on("imageSizeChange", function () {
        if (window.FamilyTags && window.FamilyTags.layoutFaces) window.FamilyTags.layoutFaces();
      });
      pswp.on("resolutionChanged", function () {
        if (window.FamilyTags && window.FamilyTags.syncFaceZoom) window.FamilyTags.syncFaceZoom();
      });
      pswp.on("zoomPanUpdate", function () {
        if (window.FamilyTags && window.FamilyTags.syncFaceZoom) window.FamilyTags.syncFaceZoom();
      });
    });
    lightbox.on("change", function () {
      if (!lightbox.pswp || !lightbox._slides) return;
      document.querySelectorAll(".pswp-video video").forEach(function (v) {
        const item = v.closest(".pswp__item");
        const on = item && item.getAttribute("aria-hidden") !== "true";
        if (!on) v.pause();
      });
      if (lightbox.pswp.currIndex >= lightbox._slides.length - 5 && lightbox._nearEnd) {
        lightbox._nearEnd();
      }
      const slide = lightbox._slides[lightbox.pswp.currIndex];
      if (window.FamilyTags && slide && slide.familyItem) {
        window.FamilyTags.showPhoto(slide.familyItem);
      }
      tellSelect();
    });
    lightbox.init();
    return lightbox;
  }

  window.FamilyFeed = {
    start: function (person, tagIds, opts) {
      const feed = document.getElementById("feed");
      const sentinel = document.getElementById("feed-sentinel");
      const hint = document.getElementById("feed-hint");
      if (!feed || !person) return;
      const my = ++run;
      let offset = 0;
      let total = 0;
      let loading = false;
      let lastGroup = "";
      const slides = [];
      if (window.thumbObserver) {
        window.thumbObserver.disconnect();
        window.thumbObserver = null;
      }
      thumbWait.length = 0;
      dropBlobs();
      feed.innerHTML = "";
      feed.dataset.person = person;
      feed.dataset.tags = (tagIds || []).join(",");
      currentPerson = person;
      currentTags = tagIds || [];
      trashMode = !!(opts && opts.trash);
      feed.dataset.trash = trashMode ? "1" : "";
      feed.classList.toggle("is-trash", trashMode);
      if (!opts || !opts.keepSelect) clearSelect();
      if (trashMode) {
        const bar = document.createElement("p");
        bar.className = "trash-bar";
        const note = document.createElement("span");
        note.textContent = "垃圾桶 · 點進照片，刪掉 #delete 即可救回";
        const back = document.createElement("button");
        back.type = "button";
        back.textContent = "返回相簿";
        back.addEventListener("click", function () {
          window.FamilyFeed.closeTrash();
        });
        bar.appendChild(note);
        bar.appendChild(back);
        feed.appendChild(bar);
      }

      function showHint() {
        if (!hint || my !== run) return;
        const more = loading || (total > 0 && offset < total);
        const thumbs = thumbActive > 0 || thumbWait.length > 0;
        hint.hidden = !(more || thumbs);
        if (!loading && !offset) hint.hidden = true;
      }
      paintHint = showHint;

      const lb = ensureLightbox();
      if (lb) {
        lb._slides = slides;
        lb._nearEnd = function () {
          loadMore();
        };
      }

      function tile(item, index) {
        const a = document.createElement("div");
        a.className = "tile" + (item.kind === "video" ? " is-video" : "");
        a.setAttribute("role", "button");
        a.tabIndex = 0;
        a.dataset.key = itemKey(item);
        const img = document.createElement("img");
        img.decoding = "async";
        img.alt = "";
        img.draggable = false;
        watchThumb(img, qs(item, "thumb", "tile"));
        const shield = document.createElement("span");
        shield.className = "tile-shield";
        a.appendChild(img);
        a.appendChild(shield);
        markTile(a, selecting && picked[a.dataset.key]);
        let press = 0;
        let sx = 0;
        let sy = 0;
        let fromHold = false;
        function clearPress() {
          if (press) {
            window.clearTimeout(press);
            press = 0;
          }
        }
        a.addEventListener("pointerdown", function (ev) {
          if (ev.button && ev.button !== 0) return;
          sx = ev.clientX;
          sy = ev.clientY;
          fromHold = false;
          clearPress();
          press = window.setTimeout(function () {
            press = 0;
            fromHold = true;
            enterSelect(item, a);
          }, 400);
        });
        a.addEventListener("pointermove", function (ev) {
          if (!press) return;
          if (Math.abs(ev.clientX - sx) > 14 || Math.abs(ev.clientY - sy) > 14) clearPress();
        });
        a.addEventListener("pointerup", clearPress);
        a.addEventListener("pointercancel", clearPress);
        ["contextmenu", "selectstart", "dragstart"].forEach(function (name) {
          a.addEventListener(name, function (ev) {
            ev.preventDefault();
          }, true);
        });
        a.addEventListener("click", function (ev) {
          ev.preventDefault();
          if (fromHold) {
            fromHold = false;
            return;
          }
          if (selecting) {
            toggleSelect(item, a);
            return;
          }
          if (!lb) return;
          lb._slides = slides;
          lb.loadAndOpen(index);
          if (item.kind === "video") {
            playVideo(document.querySelector(".pswp-video video"));
          }
        });
        return a;
      }

      function sentinelNear() {
        if (!sentinel || sentinel.hidden) return false;
        const box = sentinel.getBoundingClientRect();
        return box.top < (window.innerHeight || 0) + 1600;
      }

      afterThumbs = function () {
        if (my !== run) return;
        if (sentinelNear()) loadMore();
      };

      async function loadMore() {
        if (loading || my !== run) return;
        if (total && offset >= total) return;
        if (offset && thumbsBusy()) return;
        loading = true;
        showHint();
        let got = 0;
        try {
          const tags = (feed.dataset.tags || "")
            .split(",")
            .filter(Boolean);
          let path =
            "/api/photos?person=" +
            encodeURIComponent(person) +
            "&offset=" +
            offset +
            "&limit=" +
            (offset ? LIMIT : FIRST);
          if (tags.length) path += "&tags=" + tags.map(encodeURIComponent).join(",");
          if (trashMode) path += "&trash=1";
          const url = api(path);
          const res = await fetch(url);
          const data = await res.json();
          if (my !== run) return;
          total = data.total;
          (data.items || []).forEach(function (item) {
            if (item.group && item.group !== lastGroup) {
              lastGroup = item.group;
              const h = document.createElement("p");
              h.className = "feed-month";
              h.textContent = monthLabel(item.group);
              feed.appendChild(h);
            }
            const index = slides.length;
            const a = tile(item, index);
            slides.push(slideFor(item, a));
            feed.appendChild(a);
          });
          got = (data.items || []).length;
          offset += got;
          if (!offset) {
            const empty = document.createElement("p");
            empty.className = "feed-empty";
            empty.textContent = trashMode
              ? "垃圾桶是空的。"
              : "這個櫃子還沒有照片。";
            if (!trashMode) feed.innerHTML = "";
            feed.appendChild(empty);
          }
        } catch (err) {
          if (my !== run) return;
          if (!offset) {
            feed.innerHTML =
              '<p class="feed-empty">目前無法連上,請聯絡維護的那個傢伙</p>';
          }
        } finally {
          loading = false;
          showHint();
        }
      }

      if (window.feedObserver) window.feedObserver.disconnect();
      if (sentinel) {
        sentinel.hidden = false;
        window.feedObserver = new IntersectionObserver(
          function (entries) {
            if (entries.some(function (e) { return e.isIntersecting; })) loadMore();
          },
          { rootMargin: "600px 0px" }
        );
        window.feedObserver.observe(sentinel);
      }
      showHint();
      loadMore();
    },
    filter: function (tagIds) {
      const person = (document.getElementById("feed") || {}).dataset.person;
      if (person) window.FamilyFeed.start(person, tagIds || []);
    },
    refresh: function () {
      if (!currentPerson) return;
      if (lightbox && lightbox.pswp) lightbox.pswp.close();
      window.FamilyFeed.start(currentPerson, currentTags, { trash: trashMode });
    },
    prepareAction: function () {
      return prepareAction();
    },
    trashSelected: function () {
      const rows = targetRows();
      if (!rows.length) {
        prepareAction();
        return Promise.resolve();
      }
      return askTrash().then(function (ok) {
        if (!ok) return;
      const chosen = {};
      targetItems().forEach(function (item) {
        chosen[itemKey(item)] = true;
      });
      const feed = document.getElementById("feed");
      const pulled = [];
      if (feed) {
        feed.querySelectorAll(".tile").forEach(function (a) {
          if (!chosen[a.dataset.key]) return;
          a.classList.add("is-gone");
          pulled.push(a);
        });
      }
      const open = viewingItem();
      if (open && chosen[itemKey(open)] && lightbox && lightbox.pswp) lightbox.pswp.close();
      clearSelect();
      window.FamilyBusy.start(rows.length > 1 ? "正在丟掉 " + rows.length + " 張…" : "正在丟掉…");
      return tagPost({
        action: "trash",
        person: currentPerson,
        photos: rows,
      }).then(
        function () {
          window.FamilyBusy.done(rows.length > 1 ? "已丟掉 " + rows.length + " 張" : "已丟掉");
        },
        function () {
          pulled.forEach(function (a) {
            a.classList.remove("is-gone");
          });
          window.FamilyBusy.done("丟不掉，請再試一次");
        }
      );
      });
    },
    tagSelected: function (label) {
      const rows = targetRows();
      const name = String(label || "").trim().replace(/^#/, "");
      if (!rows.length || !name) return Promise.resolve();
      // A tag does not change how the grid looks, so nothing needs reloading.
      clearSelect();
      window.FamilyBusy.start("正在加上 #" + name + "…");
      return tagPost({
        action: "attach_many",
        person: currentPerson,
        kind: "custom",
        label: name,
        photos: rows,
      }).then(
        function () {
          window.FamilyBusy.done("已加上 #" + name);
        },
        function () {
          window.FamilyBusy.done("加不上，請再試一次");
        }
      );
    },
    downloadSelected: function () {
      if (!prepareAction()) return Promise.resolve();
      return saveItems(targetItems());
    },
    openTrash: function () {
      if (!currentPerson) return;
      if (lightbox && lightbox.pswp) lightbox.pswp.close();
      clearSelect();
      window.FamilyFeed.start(currentPerson, [], { trash: true });
    },
    closeTrash: function () {
      if (!currentPerson) return;
      window.FamilyFeed.start(currentPerson, []);
    },
    pswp: function () {
      return lightbox && lightbox.pswp;
    },
    stop: function () {
      run += 1;
      paintHint = function () {};
      afterThumbs = function () {};
      currentPerson = "";
      trashMode = false;
      clearSelect();
      dropBlobs();
      if (window.thumbObserver) window.thumbObserver.disconnect();
      window.thumbObserver = null;
      if (window.feedObserver) window.feedObserver.disconnect();
      const sentinel = document.getElementById("feed-sentinel");
      const hint = document.getElementById("feed-hint");
      if (sentinel) sentinel.hidden = true;
      if (hint) hint.hidden = true;
    },
  };
})();
