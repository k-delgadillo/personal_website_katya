(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  /* ================= experience [selected, all] ================= */
  const exp = $("#experience");
  $$(".toggle a", exp).forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      $$(".toggle a", exp).forEach((x) => x.classList.toggle("active", x === a));
      exp.classList.toggle("show-all", a.dataset.show === "all");
    })
  );

  /* ================= honors [more / less] ================= */
  $$(".more-toggle").forEach((t) =>
    t.addEventListener("click", (e) => {
      e.preventDefault();
      const list = t.closest(".more-list");
      const open = list.classList.toggle("open");
      t.textContent = open ? "less ↑" : "more ↓";
    })
  );

  /* ================= Hot Jupiter transit simulation ================= */
  const oc = $("#orbitCanvas");
  const octx = oc.getContext("2d");
  const warpEl = $("#warp"), periodEl = $("#period"), transitsEl = $("#transits");
  let OW, OH;
  const P0 = 1.09142; // days, roughly WASP-12b
  let simT = 0, theta = -Math.PI / 2, transits = 0, flux = [], resetFade = 0;
  let ocVisible = false;

  function sizeOrbit() {
    const r = oc.getBoundingClientRect();
    OW = r.width; OH = r.height;
    oc.width = OW * DPR; oc.height = OH * DPR;
    octx.setTransform(DPR, 0, 0, DPR, 0, 0);
    flux = new Array(Math.ceil(OW)).fill(1);
  }
  new IntersectionObserver(([en]) => { ocVisible = en.isIntersecting; }).observe(oc);
  window.addEventListener("resize", sizeOrbit);
  sizeOrbit();

  let last = performance.now();
  function drawOrbit(now) {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    requestAnimationFrame(drawOrbit);
    if (!ocVisible) return;

    const warp = reduceMotion ? 1 : +warpEl.value;
    simT += dt * warp;
    // exaggerated exponential decay so you can actually see it
    const P = P0 * Math.exp(-0.006 * simT);
    const simPeriod = 7 * (P / P0); // seconds per orbit on screen
    const prevSin = Math.sin(theta);
    const prevCos = Math.cos(theta);
    theta += ((Math.PI * 2) / simPeriod) * dt * warp;

    // count a transit at mid-transit (planet crosses the line of sight in front)
    if (prevCos > 0 && Math.cos(theta) <= 0 && prevSin > 0) { transits++; transitsEl.textContent = transits; }

    const cx = OW / 2, cy = OH * 0.36;
    const R = Math.min(OW, OH) * 0.11;           // star radius
    const shrink = P / P0;                        // orbit shrinks as it decays
    const a = Math.min(OW * 0.4, OH * 0.55) * (0.55 + 0.45 * shrink);
    const b = a * 0.2;
    const pr = R * 0.32;                          // planet radius
    const px = cx + a * Math.cos(theta);
    const py = cy + b * Math.sin(theta);
    const inFront = Math.sin(theta) > 0;

    if (P < P0 * 0.55) { // planet reaches the star → start over
      resetFade = 1; simT = 0; theta = -Math.PI / 2; transits = 0; transitsEl.textContent = 0;
    }
    periodEl.textContent = P.toFixed(5) + " d";

    octx.clearRect(0, 0, OW, OH);

    // orbit path
    octx.strokeStyle = "rgba(124, 92, 240, 0.3)"; octx.setLineDash([3, 5]); octx.lineWidth = 1;
    octx.beginPath(); octx.ellipse(cx, cy, a, b, 0, 0, Math.PI * 2); octx.stroke(); octx.setLineDash([]);

    const drawPlanet = () => {
      const g = octx.createRadialGradient(px - pr * 0.3, py - pr * 0.3, pr * 0.1, px, py, pr);
      g.addColorStop(0, "#a5b4fc"); g.addColorStop(1, "#4338ca");
      octx.fillStyle = g; octx.beginPath(); octx.arc(px, py, pr, 0, Math.PI * 2); octx.fill();
    };
    if (!inFront) drawPlanet();

    // star
    const halo = octx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 2.6);
    halo.addColorStop(0, "rgba(253, 224, 171, 0.45)"); halo.addColorStop(1, "rgba(253, 224, 171, 0)");
    octx.fillStyle = halo; octx.beginPath(); octx.arc(cx, cy, R * 2.6, 0, Math.PI * 2); octx.fill();
    const sg = octx.createRadialGradient(cx - R * 0.25, cy - R * 0.25, R * 0.1, cx, cy, R);
    sg.addColorStop(0, "#fff7e0"); sg.addColorStop(0.7, "#fcd98a"); sg.addColorStop(1, "#f6b955");
    octx.fillStyle = sg; octx.beginPath(); octx.arc(cx, cy, R, 0, Math.PI * 2); octx.fill();

    if (inFront) drawPlanet();

    // flux: fraction of the planet disk overlapping the star (simple 1D approx)
    let f = 1;
    if (inFront) {
      const d = Math.abs(px - cx);
      const overlap = Math.max(0, Math.min(1, (R + pr - d) / (2 * pr)));
      f = 1 - 0.1 * overlap;
    }
    // advance the light curve at a steady pace
    flux.push(f); flux.shift();

    // light curve panel
    const top = OH * 0.66, h = OH * 0.26, left = 18, right = OW - 18;
    octx.fillStyle = "#f4f2fc";
    octx.fillRect(left, top - 10, right - left, h + 20);
    octx.font = "10px JetBrains Mono, monospace";
    octx.fillStyle = "#8f8cad";
    octx.fillText("relative brightness", left + 8, top + 2);
    octx.fillText("time →", right - 50, top + h + 4);

    octx.strokeStyle = "#7c5cf0"; octx.lineWidth = 2; octx.lineJoin = "round"; octx.beginPath();
    const span = right - left;
    for (let i = 0; i < span; i++) {
      const v = flux[flux.length - span + i] ?? 1;
      const y = top + h * 0.25 + (1 - v) * h * 6;
      i === 0 ? octx.moveTo(left + i, y) : octx.lineTo(left + i, y);
    }
    octx.stroke();

    if (resetFade > 0) {
      octx.fillStyle = `rgba(28, 26, 58, ${Math.min(resetFade, 1) * 0.8})`;
      octx.font = "600 13px Inter, sans-serif"; octx.textAlign = "center";
      octx.fillText("The planet reached its star. Starting a new system.", cx, OH * 0.6);
      octx.textAlign = "start";
      resetFade -= dt * 0.4;
    }
  }
  requestAnimationFrame(drawOrbit);

})();
