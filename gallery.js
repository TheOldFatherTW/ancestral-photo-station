(function () {
  const ORIGIN = (window.VAULT_ORIGIN || "").replace(/\/$/, "");
  const LIMIT = 48;

  function api(path) {
    return ORIGIN + path;
  }

  function qs(item, kind) {
    const p = new URLSearchParams({
      person: item.person,
      bucket: item.bucket,
      rel: item.rel,
    });
    return api((kind === "thumb" ? "/thumb?" : "/media?") + p.toString());
  }

  function bindStage(stage, stageImg, stageVid) {
    if (!stage) return;
    stage.addEventListener("click", function () {
      stage.classList.remove("is-open");
      if (stageVid) {
        stageVid.pause();
        stageVid.removeAttribute("src");
      }
      if (stageImg) stageImg.removeAttribute("src");
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") stage.click();
    });
  }

  window.FamilyFeed = {
    start: function (person) {
      const feed = document.getElementById("feed");
      const stage = document.getElementById("lightbox");
      const stageImg = document.getElementById("lightbox-img");
      const stageVid = document.getElementById("lightbox-vid");
      if (!feed || !person) return;
      bindStage(stage, stageImg, stageVid);
      let offset = 0;
      let total = 0;
      let loading = false;
      feed.innerHTML = "";
      feed.dataset.person = person;

      function openItem(item) {
        if (!stage) return;
        stage.classList.add("is-open");
        if (item.kind === "video") {
          stageImg.hidden = true;
          stageVid.hidden = false;
          stageVid.src = qs(item, "media");
          stageVid.play().catch(function () {});
        } else {
          stageVid.pause();
          stageVid.removeAttribute("src");
          stageVid.hidden = true;
          stageImg.hidden = false;
          stageImg.src = qs(item, "thumb");
        }
      }

      function tile(item) {
        const a = document.createElement("a");
        a.className = "tile" + (item.kind === "video" ? " is-video" : "");
        a.href = qs(item, "media");
        const img = document.createElement("img");
        img.loading = "lazy";
        img.alt = item.who;
        img.src = qs(item, "thumb");
        a.appendChild(img);
        a.addEventListener("click", function (ev) {
          ev.preventDefault();
          openItem(item);
        });
        return a;
      }

      async function loadMore() {
        if (loading) return;
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
          total = data.total;
          (data.items || []).forEach(function (item) {
            feed.appendChild(tile(item));
          });
          offset += (data.items || []).length;
          if (!offset) {
            feed.innerHTML = '<p class="feed-empty">這個櫃子還沒有照片。</p>';
          }
        } catch (err) {
          feed.innerHTML =
            '<p class="feed-empty">目前無法連上,請聯絡維護的那個傢伙</p>';
        } finally {
          loading = false;
        }
      }

      window.addEventListener("scroll", function onScroll() {
        if (!document.body.contains(feed)) {
          window.removeEventListener("scroll", onScroll);
          return;
        }
        if (window.innerHeight + window.scrollY > document.body.offsetHeight - 900) {
          loadMore();
        }
      });
      loadMore();
    },
  };

  const ready = document.getElementById("feed");
  if (ready && ready.dataset.person) {
    window.FamilyFeed.start(ready.dataset.person);
  }
})();
