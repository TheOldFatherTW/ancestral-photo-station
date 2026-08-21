/* Rose Two: r = a cos(2θ). Motion after Paidax01/math-curve-loaders. */
(function () {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const CONFIG = {
    roseA: 9.2,
    roseABoost: 0.6,
    roseBreathBase: 0.72,
    roseBreathBoost: 0.28,
    roseScale: 3.25,
    rotate: true,
    particleCount: 74,
    trailSpan: 0.3,
    durationMs: 5200,
    rotationDurationMs: 28000,
    pulseDurationMs: 4300,
    strokeWidth: 4.6,
  };

  function point(progress, detailScale) {
    const t = progress * Math.PI * 2;
    const a = CONFIG.roseA + detailScale * CONFIG.roseABoost;
    const r =
      a *
      (CONFIG.roseBreathBase + detailScale * CONFIG.roseBreathBoost) *
      Math.cos(2 * t);
    return {
      x: 50 + Math.cos(t) * r * CONFIG.roseScale,
      y: 50 + Math.sin(t) * r * CONFIG.roseScale,
    };
  }

  function buildPath(detailScale, steps) {
    const n = steps || 480;
    let d = "";
    for (let i = 0; i <= n; i++) {
      const p = point(i / n, detailScale);
      d += (i === 0 ? "M" : "L") + " " + p.x.toFixed(2) + " " + p.y.toFixed(2);
    }
    return d;
  }

  function detailScale(time) {
    const pulse = (time % CONFIG.pulseDurationMs) / CONFIG.pulseDurationMs;
    return 0.52 + ((Math.sin(pulse * Math.PI * 2 + 0.55) + 1) / 2) * 0.48;
  }

  function rotation(time) {
    return -((time % CONFIG.rotationDurationMs) / CONFIG.rotationDurationMs) * 360;
  }

  function particle(index, progress, scale) {
    const tail = index / (CONFIG.particleCount - 1);
    const p = point(
      (((progress - tail * CONFIG.trailSpan) % 1) + 1) % 1,
      scale
    );
    const fade = Math.pow(1 - tail, 0.56);
    return {
      x: p.x,
      y: p.y,
      radius: 0.9 + fade * 2.7,
      opacity: 0.04 + fade * 0.96,
    };
  }

  function mount(root) {
    if (!root || root.getAttribute("data-rose") === "on") return;
    root.setAttribute("data-rose", "on");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("class", "rose-svg");
    svg.setAttribute("aria-hidden", "true");
    const group = document.createElementNS(SVG_NS, "g");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", String(CONFIG.strokeWidth));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("opacity", "0.14");
    group.appendChild(path);
    const dots = [];
    if (!reduce) {
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const c = document.createElementNS(SVG_NS, "circle");
        c.setAttribute("fill", "currentColor");
        group.appendChild(c);
        dots.push(c);
      }
    }
    svg.appendChild(group);
    root.innerHTML = "";
    root.appendChild(svg);
    path.setAttribute("d", buildPath(0.76));
    if (reduce) return;

    const start = performance.now();
    function tick(now) {
      if (!root.isConnected) return;
      const time = now - start;
      const progress = (time % CONFIG.durationMs) / CONFIG.durationMs;
      const scale = detailScale(time);
      group.setAttribute("transform", "rotate(" + rotation(time) + " 50 50)");
      path.setAttribute("d", buildPath(scale));
      dots.forEach(function (node, index) {
        const p = particle(index, progress, scale);
        node.setAttribute("cx", p.x.toFixed(2));
        node.setAttribute("cy", p.y.toFixed(2));
        node.setAttribute("r", p.radius.toFixed(2));
        node.setAttribute("opacity", p.opacity.toFixed(3));
      });
      window.requestAnimationFrame(tick);
    }
    window.requestAnimationFrame(tick);
  }

  function mountBar(root, readRatio) {
    if (!root || root.getAttribute("data-rose-bar") === "on") return;
    root.setAttribute("data-rose-bar", "on");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 12");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("class", "rose-bar-svg");
    svg.setAttribute("aria-hidden", "true");
    const track = document.createElementNS(SVG_NS, "path");
    track.setAttribute("d", "M 2 6 L 98 6");
    track.setAttribute("fill", "none");
    track.setAttribute("stroke", "currentColor");
    track.setAttribute("stroke-width", "3.2");
    track.setAttribute("stroke-linecap", "round");
    track.setAttribute("opacity", "0.14");
    const fill = document.createElementNS(SVG_NS, "path");
    fill.setAttribute("fill", "none");
    fill.setAttribute("stroke", "currentColor");
    fill.setAttribute("stroke-width", "3.2");
    fill.setAttribute("stroke-linecap", "round");
    fill.setAttribute("opacity", "0.92");
    svg.appendChild(track);
    svg.appendChild(fill);
    const count = 28;
    const dots = [];
    if (!reduce) {
      for (let i = 0; i < count; i++) {
        const c = document.createElementNS(SVG_NS, "circle");
        c.setAttribute("fill", "currentColor");
        svg.appendChild(c);
        dots.push(c);
      }
    }
    root.innerHTML = "";
    root.appendChild(svg);
    if (reduce) {
      fill.setAttribute("d", "M 2 6 L 98 6");
      return;
    }
    const start = performance.now();
    function tick(now) {
      if (!root.isConnected) return;
      const time = now - start;
      const loop = (time % CONFIG.durationMs) / CONFIG.durationMs;
      const scale = detailScale(time);
      const breath = 2.6 + scale * 1.4;
      track.setAttribute("stroke-width", breath.toFixed(2));
      fill.setAttribute("stroke-width", breath.toFixed(2));
      let ratio = typeof readRatio === "function" ? readRatio() : 0;
      if (ratio == null || !Number.isFinite(ratio)) {
        const slide = (Math.sin(loop * Math.PI * 2) + 1) / 2;
        ratio = 0.18 + slide * 0.22;
      }
      ratio = Math.max(0, Math.min(1, ratio));
      const x = 2 + 96 * ratio;
      fill.setAttribute("d", "M 2 6 L " + x.toFixed(2) + " 6");
      dots.forEach(function (node, index) {
        const tail = index / (count - 1);
        const along = (((loop - tail * CONFIG.trailSpan) % 1) + 1) % 1;
        const fade = Math.pow(1 - tail, 0.56);
        node.setAttribute("cx", (2 + along * 96 * ratio).toFixed(2));
        node.setAttribute("cy", "6");
        node.setAttribute("r", (0.55 + fade * 1.55).toFixed(2));
        node.setAttribute("opacity", (0.04 + fade * 0.96).toFixed(3));
      });
      window.requestAnimationFrame(tick);
    }
    window.requestAnimationFrame(tick);
  }

  window.RoseTwo = { mount: mount, mountBar: mountBar };

  function boot() {
    mount(document.getElementById("rose-two"));
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
