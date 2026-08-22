(function () {
  const ORIGIN = (window.VAULT_ORIGIN || "").replace(/\/$/, "");
  const LIMIT = 24;
  const THUMB_SLOTS = 4;
  let run = 0;
  let lightbox;
  let thumbActive = 0;
  const thumbWait = [];
  let paintHint = function () {};

  function api(path) {
    const url = ORIGIN + path;
    const k = window.FAMILY_VIEW_KEY;
    if (!k) return url;
    return url + (path.indexOf("?") >= 0 ? "&" : "?") + "k=" + encodeURIComponent(k);
  }

  function pumpThumbs() {
    while (thumbActive < THUMB_SLOTS && thumbWait.length) {
      const job = thumbWait.shift();
      thumbActive += 1;
      job(function () {
        thumbActive -= 1;
        pumpThumbs();
        paintHint();
      });
    }
  }

  function bindThumb(img, url, onReady) {
    let tries = 0;
    function start(done) {
      function settle() {
        img.removeEventListener("load", onLoad);
        img.removeEventListener("error", onErr);
        if (done) done();
      }
      function onLoad() {
        settle();
        if (onReady) onReady();
      }
      function onErr() {
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
    }
    thumbWait.push(start);
    pumpThumbs();
  }

  function qs(item, kind, size) {
    const p = new URLSearchParams({
      person: item.person,
      bucket: item.bucket,
      rel: item.rel,
    });
    if (kind === "thumb" && size) p.set("size", size);
    return api((kind === "thumb" ? "/thumb?" : "/media?") + p.toString());
  }

  function monthLabel(group) {
    const m = /^(\d{4})-(\d{2})$/.exec(group || "");
    if (!m) return group || "";
    return m[1] + "年" + Number(m[2]) + "月";
  }

  function slideFor(item, tile) {
    const tileUrl = qs(item, "thumb");
    const img = tile && tile.querySelector("img");
    const w = (img && img.naturalWidth) || 1600;
    const h = (img && img.naturalHeight) || 1067;
    if (item.kind === "video") {
      const src = qs(item, "media");
      return {
        html:
          '<div class="pswp-video"><video controls playsinline webkit-playsinline preload="none" poster="' +
          tileUrl.replace(/"/g, "") +
          '" src="' +
          src.replace(/"/g, "") +
          '"></video><p class="vid-wait" hidden>影片準備中…</p></div>',
        msrc: tileUrl,
        width: w,
        height: h,
        element: tile,
      };
    }
    return {
      src: qs(item, "thumb"),
      msrc: tileUrl,
      width: w,
      height: h,
      alt: item.who,
      element: tile,
      thumbCropped: true,
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

  function ensureLightbox() {
    if (lightbox || !window.PhotoSwipeLightbox || !window.PhotoSwipe) return lightbox;
    lightbox = new window.PhotoSwipeLightbox({
      pswpModule: window.PhotoSwipe,
      loop: false,
      bgOpacity: 0.92,
      errorMsg: "目前無法載入",
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
        const data = evt.content.data;
        const img = data && data.element && data.element.querySelector("img");
        const tw = img && img.naturalWidth;
        const th = img && img.naturalHeight;
        if (tw && th) {
          evt.content.width = tw;
          evt.content.height = th;
          data.width = tw;
          data.height = th;
          if (evt.content.slide) evt.content.slide.updateContentSize(true);
        }
      }
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
    });
    lightbox.on("close", function () {
      document.querySelectorAll(".pswp-video video").forEach(function (v) {
        v.pause();
      });
    });
    lightbox.init();
    return lightbox;
  }

  window.FamilyFeed = {
    start: function (person, tagIds) {
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
      feed.innerHTML = "";
      feed.dataset.person = person;
      feed.dataset.tags = (tagIds || []).join(",");

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
        const a = document.createElement("a");
        a.className = "tile" + (item.kind === "video" ? " is-video" : "");
        a.href = item.kind === "video" ? qs(item, "media") : qs(item, "thumb");
        const img = document.createElement("img");
        img.decoding = "async";
        img.alt = "";
        bindThumb(img, qs(item, "thumb"), function () {
          img.classList.add("is-on");
          const slide = slides[index];
          if (slide && img.naturalWidth && img.naturalHeight) {
            slide.width = img.naturalWidth;
            slide.height = img.naturalHeight;
            const pswp = lb && lb.pswp;
            if (pswp && pswp.currSlide && pswp.currSlide.data === slide) {
              pswp.currSlide.content.width = img.naturalWidth;
              pswp.currSlide.content.height = img.naturalHeight;
              pswp.currSlide.updateContentSize(true);
              pswp.updateSize(true);
            }
          }
        });
        a.appendChild(img);
        a.addEventListener("click", function (ev) {
          ev.preventDefault();
          if (!lb) return;
          lb._slides = slides;
          lb.loadAndOpen(index);
        });
        return a;
      }

      function sentinelNear() {
        if (!sentinel || sentinel.hidden) return false;
        const box = sentinel.getBoundingClientRect();
        return box.top < (window.innerHeight || 0) + 1600;
      }

      async function loadMore() {
        if (loading || my !== run) return;
        if (total && offset >= total) return;
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
            LIMIT;
          if (tags.length) path += "&tags=" + tags.map(encodeURIComponent).join(",");
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
            feed.innerHTML = '<p class="feed-empty">這個櫃子還沒有照片。</p>';
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
        if (my === run && got > 0 && (!total || offset < total) && sentinelNear()) {
          loadMore();
        }
      }

      if (window.feedObserver) window.feedObserver.disconnect();
      if (sentinel) {
        sentinel.hidden = false;
        window.feedObserver = new IntersectionObserver(
          function (entries) {
            if (entries.some(function (e) { return e.isIntersecting; })) loadMore();
          },
          { rootMargin: "1600px 0px" }
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
    stop: function () {
      run += 1;
      paintHint = function () {};
      if (window.feedObserver) window.feedObserver.disconnect();
      const sentinel = document.getElementById("feed-sentinel");
      const hint = document.getElementById("feed-hint");
      if (sentinel) sentinel.hidden = true;
      if (hint) hint.hidden = true;
    },
  };
})();
