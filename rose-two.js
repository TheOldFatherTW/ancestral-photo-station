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
    const pulse =
      (time % CONFIG.pulseDurationMs) / CONFIG.pulseDurationMs;
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
    if (!root) return;
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

  function boot() {
    mount(document.getElementById("rose-two"));
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
