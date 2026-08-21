(function () {
  const ORIGIN = (window.VAULT_ORIGIN || "").replace(/\/$/, "");
  const LIMIT = 24;
  let run = 0;
  let lightbox;

  function api(path) {
    return ORIGIN + path;
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
    if (item.kind === "video") {
      const src = qs(item, "media");
      return {
        html:
          '<div class="pswp-video"><video src="' +
          src.replace(/"/g, "") +
          '" controls playsinline></video></div>',
        msrc: tileUrl,
        width: 1920,
        height: 1080,
        element: tile,
      };
    }
    return {
      src: qs(item, "thumb"),
      msrc: tileUrl,
      width: 1600,
      height: 1600,
      alt: item.who,
      element: tile,
      thumbCropped: true,
    };
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
    lightbox.on("change", function () {
      if (!lightbox.pswp || !lightbox._slides) return;
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
    start: function (person) {
      const feed = document.getElementById("feed");
      const sentinel = document.getElementById("feed-sentinel");
      if (!feed || !person) return;
      const my = ++run;
      let offset = 0;
      let total = 0;
      let loading = false;
      let lastGroup = "";
      const slides = [];
      feed.innerHTML = "";
      feed.dataset.person = person;

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
        img.alt = item.who;
        img.src = qs(item, "thumb");
        a.appendChild(img);
        a.addEventListener("click", function (ev) {
          ev.preventDefault();
          if (!lb) return;
          lb._slides = slides;
          lb.loadAndOpen(index);
        });
        return a;
      }

      async function loadMore() {
        if (loading || my !== run) return;
        if (total && offset >= total) return;
        loading = true;
        try {
          const url =
            api("/api/photos") +
            "?person=" +
            encodeURIComponent(person) +
            "&offset=" +
            offset +
            "&limit=" +
            LIMIT;
          const res = await fetch(url, { cache: "no-store" });
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
          offset += (data.items || []).length;
          if (!offset) {
            feed.innerHTML = '<p class="feed-empty">這個櫃子還沒有照片。</p>';
          }
        } catch (err) {
          if (my !== run) return;
          feed.innerHTML =
            '<p class="feed-empty">目前無法連上,請聯絡維護的那個傢伙</p>';
        } finally {
          loading = false;
        }
      }

      if (window.feedObserver) window.feedObserver.disconnect();
      if (sentinel) {
        sentinel.hidden = false;
        window.feedObserver = new IntersectionObserver(
          function (entries) {
            if (entries.some(function (e) { return e.isIntersecting; })) loadMore();
          },
          { rootMargin: "800px 0px" }
        );
        window.feedObserver.observe(sentinel);
      }
      loadMore();
    },
    stop: function () {
      run += 1;
      if (window.feedObserver) window.feedObserver.disconnect();
      const sentinel = document.getElementById("feed-sentinel");
      if (sentinel) sentinel.hidden = true;
    },
  };
})();
