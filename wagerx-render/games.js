/* ============================================================
   WAGERX — games
   Every game is playable. Cash is virtual play money.
   ============================================================ */
(function () {
  "use strict";

  const G = window.WagerX;
  if (!G) return;

  const { $, $$, state, newRng, takeStake, settle, betModule, fmtMoney, fmtMult, round2, toast, sound, cardHTML, makeDeck, handTotal } = G;
  const games = {};

  /* ============================== SHARED ============================== */

  function stageTop(title, sub, pill = "") {
    return `<div class="stage-top">
      <div><h3>${title}</h3><p>${sub}</p></div>
      ${pill ? `<span class="stage-pill"><i></i>${pill}</span>` : ""}
    </div>`;
  }

  function setMultHTML(el, value) {
    el.innerHTML = `${Number(value).toFixed(2)}<em>×</em>`;
  }

  function animateNumber(el, from, to, duration, formatter = (n) => n.toFixed(2), done = null) {
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = formatter(from + (to - from) * eased);
      if (t < 1) requestAnimationFrame(tick);
      else if (done) done();
    };
    requestAnimationFrame(tick);
  }

  function pushChip(container, value, type = "") {
    if (!container) return;
    const chip = document.createElement("span");
    chip.className = `hchip ${type}`;
    chip.textContent = value;
    container.prepend(chip);
    while (container.children.length > 10) container.lastElementChild.remove();
  }

  function chipForMult(m) {
    return m >= 10 ? "hchip--hot" : m > 0 ? "hchip--win" : "hchip--loss";
  }

  /* ============================== CRASH ============================== */

  games.crash = {
    mount(stage, panel) {
      stage.innerHTML = `${stageTop("Crash", "The curve only goes up until it doesn't", "Live curve")}
        <div style="position:relative;flex:1;display:flex;flex-direction:column;min-height:0">
          <div class="history-chips" id="crashHistory" style="margin-bottom:6px"></div>
          <div style="position:relative;flex:1;min-height:360px">
            <canvas id="crashCanvas" style="display:block;width:100%;height:100%;min-height:360px"></canvas>
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none">
              <div class="big-mult" id="crashMult">1.00<em>×</em></div>
              <div class="sub-mult" id="crashStatus">Place a bet to launch</div>
            </div>
          </div>
        </div>
        <div class="stage-foot"><span id="crashInfo">Crash point sealed per round</span><span>House edge 3%</span></div>`;

      const ui = betModule(panel, {
        value: 10,
        action: "Place bet",
        note: "Optional auto cash-out. The round ends when the curve stops.",
      });
      ui.options.innerHTML = `<div class="field-label"><span>Auto cash-out</span><b>optional</b></div>
        <input class="input-line" id="autoCashout" type="number" min="1.01" step="0.01" placeholder="e.g. 2.00" />`;

      const canvas = $("#crashCanvas", stage);
      const multEl = $("#crashMult", stage);
      const statusEl = $("#crashStatus", stage);
      const infoEl = $("#crashInfo", stage);
      const historyEl = $("#crashHistory", stage);
      const autoInput = $("#autoCashout", panel);
      const ctx = canvas.getContext("2d");
      let phase = "idle";
      let bet = 0;
      let crashAt = 0;
      let multiplier = 1;
      let cashedOut = false;
      let autoTarget = 0;
      let startTime = 0;
      let points = [];
      let raf = 0;
      let resetTimer = 0;
      let dpr = 1;

      function fit() {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
        draw();
      }

      function draw() {
        if (!ctx) return;
        const w = canvas.width / dpr;
        const h = canvas.height / dpr;
        if (!w || !h) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        const padL = 44;
        const padR = 14;
        const padT = 14;
        const padB = 28;
        const chartW = w - padL - padR;
        const chartH = h - padT - padB;
        const maxMult = Math.max(2, Math.ceil((Math.max(multiplier, 2) * 1.12 + 0.2) * 2) / 2);
        const elapsed = phase === "idle" ? 0 : Math.max(0, (performance.now() - startTime) / 1000);
        const xMax = Math.max(5, elapsed * 1.06);

        ctx.font = "9px Inter, sans-serif";
        ctx.fillStyle = "#5e5e72";
        ctx.strokeStyle = "rgba(255,255,255,.055)";
        ctx.lineWidth = 1;

        for (let i = 0; i <= 4; i++) {
          const y = padT + (chartH / 4) * i;
          ctx.beginPath();
          ctx.moveTo(padL, y);
          ctx.lineTo(w - padR, y);
          ctx.stroke();
          const label = (maxMult - ((maxMult - 1) / 4) * i).toFixed(1) + "×";
          ctx.fillText(label, 6, y + 3);
        }
        for (let i = 0; i <= 4; i++) {
          const x = padL + (chartW / 4) * i;
          ctx.beginPath();
          ctx.moveTo(x, padT);
          ctx.lineTo(x, h - padB);
          ctx.stroke();
          ctx.fillText((xMax / 4) * i <= 0 ? "0s" : `${Math.round((xMax / 4) * i)}s`, x + 2, h - 10);
        }

        if (!points.length) {
          ctx.fillStyle = "rgba(255,255,255,.15)";
          ctx.font = "10px Inter, sans-serif";
          ctx.fillText("waiting for a launch", padL + 12, padT + 22);
          return;
        }

        const mapX = (t) => padL + (t / xMax) * chartW;
        const mapY = (m) => padT + chartH - ((Math.max(1, m) - 1) / (maxMult - 1)) * chartH;

        const lineColor = phase === "crashed" && !cashedOut ? "#ff4d5e" : "#c8ff3d";
        ctx.beginPath();
        ctx.moveTo(mapX(0), mapY(1));
        for (const p of points) ctx.lineTo(mapX(p.t), mapY(p.m));
        const last = points[points.length - 1];
        ctx.lineTo(mapX(last.t), mapY(last.m));

        const area = ctx.createLinearGradient(0, padT, 0, padT + chartH);
        area.addColorStop(0, phase === "crashed" && !cashedOut ? "rgba(255,77,94,.18)" : "rgba(200,255,61,.16)");
        area.addColorStop(1, "rgba(139,92,246,0)");
        ctx.lineTo(mapX(last.t), mapY(1));
        ctx.closePath();
        ctx.fillStyle = area;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(mapX(0), mapY(1));
        for (const p of points) ctx.lineTo(mapX(p.t), mapY(p.m));
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2.4;
        ctx.shadowColor = lineColor;
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.shadowBlur = 0;

        const lx = mapX(last.t);
        const ly = mapY(last.m);
        ctx.beginPath();
        ctx.arc(lx, ly, 4, 0, Math.PI * 2);
        ctx.fillStyle = lineColor;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(lx, ly, 9, 0, Math.PI * 2);
        ctx.strokeStyle = lineColor + "55";
        ctx.stroke();
      }

      const ro = new ResizeObserver(() => fit());
      ro.observe(canvas);
      fit();

      function resetRound() {
        phase = "idle";
        multiplier = 1;
        points = [];
        cashedOut = false;
        autoTarget = 0;
        G.setGameLock(false);
        ui.lockBet(false);
        ui.setAction("Place bet", false);
        setMultHTML(multEl, 1);
        multEl.classList.remove("is-win", "is-loss");
        statusEl.textContent = "Place a bet to launch";
        infoEl.textContent = "Crash point sealed per round";
        draw();
      }

      function finishRound(crashed) {
        phase = "crashed";
        multiplier = crashAt;
        setMultHTML(multEl, crashAt);
        multEl.classList.remove("is-win");
        if (!cashedOut) multEl.classList.add("is-loss");
        statusEl.textContent = cashedOut ? `Cashed out · ${fmtMult(crashAt)} crash` : `Crashed at ${fmtMult(crashAt)}`;
        const lost = !cashedOut;
        if (lost) {
          settle({ game: "crash", bet, mult: 0, payout: 0 });
          ui.setResult("loss", fmtMoney(0), `Crashed at ${fmtMult(crashAt)}`);
        }
        pushChip(historyEl, fmtMult(crashAt), lost ? "hchip--loss" : "hchip--win");
        infoEl.textContent = `Last round: ${fmtMult(crashAt)}`;
        ui.setAction("Play again", false);
        ui.lockBet(false);
        G.setGameLock(false);
        resetTimer = window.setTimeout(() => {
          if (phase === "crashed") resetRound();
        }, 2200);
        draw();
      }

      function crashNow() {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        finishRound(true);
      }

      function cashOut(at) {
        if (phase !== "flying" || cashedOut) return;
        const m = Math.max(1, Math.min(at, crashAt));
        if (m <= 1.001 || m >= crashAt) return;
        cashedOut = true;
        const payout = round2(bet * m);
        settle({ game: "crash", bet, mult: m, payout });
        ui.setResult("win", fmtMoney(payout), `Cashed out at ${fmtMult(m)}`);
        ui.setAction("Cashed out", true);
        statusEl.textContent = `Cashed out at ${fmtMult(m)}`;
        multEl.classList.add("is-win");
        sound.win(m);
      }

      function frame(now) {
        if (phase !== "flying") return;
        const elapsed = (now - startTime) / 1000;
        multiplier = Math.exp(0.16 * elapsed);
        if (autoTarget > 0 && !cashedOut && multiplier >= autoTarget && autoTarget < crashAt) cashOut(autoTarget);
        if (multiplier >= crashAt) {
          points.push({ t: elapsed, m: crashAt });
          draw();
          crashNow();
          return;
        }
        points.push({ t: elapsed, m: multiplier });
        setMultHTML(multEl, multiplier);
        if (!cashedOut) {
          statusEl.textContent = "In flight — cash out when it feels right";
          ui.setAction(multiplier > 1.005 ? `Cash out ${fmtMoney(bet * multiplier)}` : "Cash out $0", multiplier <= 1.005);
        }
        draw();
        raf = requestAnimationFrame(frame);
      }

      function start() {
        if (phase === "flying") return;
        const amount = ui.amount();
        if (!takeStake(amount)) return;
        if (resetTimer) window.clearTimeout(resetTimer);
        const rng = newRng();
        const u = Math.min(0.999999, Math.max(0.000001, rng()));
        crashAt = Math.max(1, Math.floor((0.97 / (1 - u)) * 100) / 100);
        if (crashAt < 1.01) crashAt = 1;
        bet = amount;
        cashedOut = false;
        points = [];
        multiplier = 1;
        autoTarget = parseFloat(autoInput.value);
        if (!Number.isFinite(autoTarget) || autoTarget < 1.01) autoTarget = 0;
        autoInput.value = autoTarget ? autoTarget.toFixed(2) : "";
        phase = "flying";
        startTime = performance.now();
        G.setGameLock(true);
        ui.lockBet(true);
        ui.clearResult();
        ui.setAction("Cash out $0", true);
        multEl.classList.remove("is-win", "is-loss");
        setMultHTML(multEl, 1);
        statusEl.textContent = "In flight — cash out when it feels right";
        infoEl.textContent = "Crash point sealed";
        draw();
        raf = requestAnimationFrame(frame);
      }

      ui.action.addEventListener("click", () => {
        if (phase === "flying") {
          cashOut(multiplier);
        } else if (phase === "idle" || phase === "crashed") {
          start();
        }
      });

      fit();
      const onResize = () => fit();
      window.addEventListener("resize", onResize);
      window.__wagerxActiveCleanup = () => {
        ro.disconnect();
        window.removeEventListener("resize", onResize);
        if (raf) cancelAnimationFrame(raf);
        if (resetTimer) window.clearTimeout(resetTimer);
      };
    },
  };

  /* ============================== DICE ============================== */

  games.dice = {
    mount(stage, panel) {
      stage.innerHTML = `${stageTop("Dice", "Pick your line. The roll does the rest", "1% house edge")}
        <div class="dice-display">
          <div class="dice-number" id="diceValue">50.00</div>
          <div class="sub-mult" id="diceSub">Roll under 50.00</div>
          <div class="dice-track-wrap">
            <div class="dice-track"><div class="dice-zone" id="diceZone" style="left:0;width:49.5%"></div><div class="dice-marker" id="diceMarker" style="left:50%"></div></div>
            <div class="dice-scale"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
          </div>
          <div class="dice-meta">
            <div><span>Win chance</span><b id="diceChance">49.50%</b></div>
            <div><span>Payout</span><b class="lime" id="dicePayout">2.00×</b></div>
          </div>
        </div>
        <div class="stage-foot"><span id="diceFoot">Roll history appears here</span><span>House edge 1%</span></div>`;

      const ui = betModule(panel, {
        value: 10,
        action: "Roll dice",
        note: "Win chance is set by the line. Lower chance, higher payout.",
      });
      ui.options.innerHTML = `
        <div class="seg" id="diceDir">
          <button type="button" class="is-active" data-dir="under">Roll under</button>
          <button type="button" data-dir="over">Roll over</button>
        </div>
        <div style="margin-top:10px">
          <div class="field-label"><span>Win chance</span><b id="chanceLabel">49.50%</b></div>
          <input type="range" id="diceRange" min="2" max="98" step="0.5" value="49.5" />
        </div>`;

      const valueEl = $("#diceValue", stage);
      const subEl = $("#diceSub", stage);
      const zoneEl = $("#diceZone", stage);
      const markerEl = $("#diceMarker", stage);
      const chanceEl = $("#diceChance", stage);
      const payoutOut = $("#dicePayout", stage);
      const footEl = $("#diceFoot", stage);
      const dirWrap = $("#diceDir", panel);
      const range = $("#diceRange", panel);
      const chanceLabel = $("#chanceLabel", panel);
      let direction = "under";
      let chance = 49.5;
      let rolling = false;

      function updateInputs() {
        chance = clampNumber(parseFloat(range.value), 2, 98);
        const payout = 99 / chance;
        chanceEl.textContent = chance.toFixed(2) + "%";
        payoutOut.textContent = fmtMult(payout);
        chanceLabel.textContent = chance.toFixed(2) + "%";
        chanceLabel.style.color = "#c8ff3d";
        if (direction === "under") {
          zoneEl.style.left = "0";
          zoneEl.style.width = chance + "%";
          zoneEl.classList.remove("dice-zone--over");
          subEl.textContent = `Roll under ${chance.toFixed(2)}`;
          valueEl.textContent = chance.toFixed(2);
          markerEl.style.left = chance + "%";
        } else {
          zoneEl.style.left = 100 - chance + "%";
          zoneEl.style.width = chance + "%";
          zoneEl.classList.add("dice-zone--over");
          subEl.textContent = `Roll over ${(100 - chance).toFixed(2)}`;
          valueEl.textContent = (100 - chance).toFixed(2);
          markerEl.style.left = 100 - chance + "%";
        }
      }

      function clampNumber(n, min, max) {
        return Math.min(max, Math.max(min, n));
      }

      dirWrap.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-dir]");
        if (!btn || rolling) return;
        direction = btn.dataset.dir;
        dirWrap.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b === btn));
        updateInputs();
        sound.click();
      });
      range.addEventListener("input", updateInputs);
      updateInputs();

      ui.action.addEventListener("click", () => {
        if (rolling) return;
        const bet = ui.amount();
        if (!takeStake(bet)) return;
        rolling = true;
        G.setGameLock(true);
        ui.lockBet(true);
        ui.setAction("Rolling…", true);
        ui.clearResult();
        valueEl.classList.remove("is-win", "is-loss");
        const rng = newRng();
        const finalRoll = Math.round(rng() * 10000) / 100;
        const payoutMult = 99 / chance;
        const target = direction === "under" ? chance : 100 - chance;
        const win = direction === "under" ? finalRoll < target : finalRoll > target;
        const start = performance.now();
        const interval = window.setInterval(() => {
          const r = Math.random() * 100;
          valueEl.textContent = r.toFixed(2);
          markerEl.style.left = r + "%";
        }, 45);
        window.setTimeout(() => {
          window.clearInterval(interval);
          valueEl.textContent = finalRoll.toFixed(2);
          markerEl.style.left = finalRoll + "%";
          valueEl.classList.add(win ? "is-win" : "is-loss");
          const payout = win ? round2(bet * payoutMult) : 0;
          settle({ game: "dice", bet, mult: win ? payoutMult : 0, payout });
          ui.setResult(win ? "win" : "loss", win ? fmtMoney(payout) : "—", win ? `Rolled ${finalRoll.toFixed(2)} · ${fmtMult(payoutMult)}` : `Rolled ${finalRoll.toFixed(2)} · needed ${direction === "under" ? "under" : "over"} ${target.toFixed(2)}`);
          pushChip(footEl, finalRoll.toFixed(2), win ? "hchip--win" : "hchip--loss");
          rolling = false;
          ui.lockBet(false);
          ui.setAction("Roll again", false);
          G.setGameLock(false);
        }, 950);
      });

      window.__wagerxActiveCleanup = () => {
        rolling = false;
      };
    },
  };

  /* ============================== MINES ============================== */

  games.mines = {
    mount(stage, panel) {
      stage.innerHTML = `${stageTop("Mines", "One grid, a handful of bombs", "3% house edge")}
        <div class="mines-wrap">
          <div class="mines-stats">
            <div><span>Mines</span><b id="minesMineCount">3</b></div>
            <div><span>Gems found</span><b id="minesFound">0</b></div>
            <div><span>Multiplier</span><b class="lime" id="minesMult">1.00×</b></div>
          </div>
          <div class="mines-grid" id="minesGrid"></div>
        </div>
        <div class="stage-foot"><span id="minesMsg">Start a round, then pick a tile.</span><span id="minesNext">Next gem: —</span></div>`;

      const ui = betModule(panel, {
        value: 10,
        action: "Start round",
        note: "Cash out any time after your first gem. All-safe pays automatically.",
      });
      ui.options.innerHTML = `
        <div class="field-label"><span>Mines</span><b id="minePickLabel">3</b></div>
        <div class="seg" id="minePicker">
          ${[1, 2, 3, 5, 10, 24].map((m) => `<button type="button" data-mines="${m}" class="${m === 3 ? "is-active" : ""}">${m}</button>`).join("")}
        </div>`;

      const grid = $("#minesGrid", stage);
      const mineCountEl = $("#minesMineCount", stage);
      const foundEl = $("#minesFound", stage);
      const multEl = $("#minesMult", stage);
      const msgEl = $("#minesMsg", stage);
      const nextEl = $("#minesNext", stage);
      const picker = $("#minePicker", panel);
      const pickLabel = $("#minePickLabel", panel);

      let mineCount = 3;
      let active = false;
      let bet = 0;
      let picks = 0;
      let multiplier = 1;
      let minePositions = new Set();
      let opened = new Set();
      let rng = null;

      function multiplierFor(mines, found) {
        if (found <= 0) return 1;
        const p = G.comb(25 - mines, found) / G.comb(25, found);
        if (p <= 0) return 1;
        return Math.min(1e6, 0.97 / p);
      }

      function renderGrid() {
        grid.innerHTML = "";
        for (let i = 0; i < 25; i++) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "mine-tile";
          btn.dataset.index = String(i);
          btn.disabled = !active || opened.has(i);
          btn.addEventListener("click", () => pickTile(i, btn));
          grid.appendChild(btn);
        }
      }

      function resetGrid() {
        [...grid.children].forEach((cell) => {
          cell.className = "mine-tile";
          cell.innerHTML = "";
          cell.disabled = true;
        });
      }

      function syncStats() {
        foundEl.textContent = String(picks);
        setMultHTML(multEl, multiplier);
        multEl.textContent = fmtMult(multiplier);
        mineCountEl.textContent = String(mineCount);
        const next = picks < 25 - mineCount ? multiplierFor(mineCount, picks + 1) : null;
        nextEl.textContent = next ? `Next gem: ${fmtMult(next)}` : "Field cleared";
        if (active) {
          ui.setAction(`Cash out ${fmtMoney(bet * multiplier)}`, picks === 0);
        }
      }

      function start() {
        const amount = ui.amount();
        if (!takeStake(amount)) return;
        bet = amount;
        active = true;
        picks = 0;
        multiplier = 1;
        opened = new Set();
        rng = newRng();
        minePositions = new Set(rng.shuffle([...Array(25).keys()]).slice(0, mineCount));
        renderGrid();
        syncStats();
        ui.lockBet(true);
        ui.clearResult();
        ui.setAction("Cash out $0", true);
        G.setGameLock(true);
        picker.querySelectorAll("button").forEach((b) => (b.disabled = true));
        msgEl.textContent = "Pick a tile. The first gem is the hardest.";
        sound.click();
      }

      function endRound(payout, mult, won, message) {
        active = false;
        G.setGameLock(false);
        ui.lockBet(false);
        picker.querySelectorAll("button").forEach((b) => (b.disabled = false));
        ui.setAction("Play again", false);
        [...grid.children].forEach((cell) => {
          cell.disabled = true;
          const i = Number(cell.dataset.index);
          if (minePositions.has(i)) {
            cell.classList.add("is-open", "is-mine", "is-revealed");
            cell.innerHTML = '<span class="tile-glyph tile-glyph--bomb">✹</span>';
          } else if (opened.has(i)) {
            cell.classList.add("is-open", "is-safe");
            cell.innerHTML = '<span class="tile-glyph">◆</span>';
          }
        });
        if (!won) {
          ui.setResult("loss", fmtMoney(0), message);
        } else {
          ui.setResult("win", fmtMoney(payout), message);
        }
        msgEl.textContent = won ? "Cashed out. The field closes." : "Bomb. The field closes.";
        if (!won) {
          multiplier = 0;
        }
        settle({ game: "mines", bet, mult: won ? mult : 0, payout });
        syncStats();
      }

      function cashOut() {
        if (!active || picks === 0) return;
        const payout = round2(bet * multiplier);
        endRound(payout, multiplier, true, `${picks} gems · ${fmtMult(multiplier)}`);
      }

      function pickTile(index, btn) {
        if (!active) return;
        if (minePositions.has(index)) {
          endRound(0, 0, false, `Hit a mine after ${picks} gem${picks === 1 ? "" : "s"}`);
          return;
        }
        opened.add(index);
        picks += 1;
        multiplier = multiplierFor(mineCount, picks);
        btn.disabled = true;
        btn.classList.add("is-open", "is-safe");
        btn.innerHTML = '<span class="tile-glyph">◆</span>';
        sound.tick();
        if (picks >= 25 - mineCount) {
          const payout = round2(bet * multiplier);
          endRound(payout, multiplier, true, "Field cleared · maximum payout");
          return;
        }
        syncStats();
        ui.setAction(`Cash out ${fmtMoney(bet * multiplier)}`, false);
        msgEl.textContent = `Gem ${picks}. ${25 - mineCount - picks} safe tiles left.`;
      }

      picker.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-mines]");
        if (!btn || active) return;
        mineCount = Number(btn.dataset.mines);
        picker.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b === btn));
        pickLabel.textContent = String(mineCount);
        mineCountEl.textContent = String(mineCount);
        updateIdleStats();
        sound.click();
      });

      function updateIdleStats() {
        mineCountEl.textContent = String(mineCount);
        if (!active) {
          foundEl.textContent = "0";
          multEl.textContent = "1.00×";
          nextEl.textContent = `Next gem: ${fmtMult(multiplierFor(mineCount, 1))}`;
        }
      }

      ui.action.addEventListener("click", () => {
        if (active) {
          if (picks > 0) cashOut();
          return;
        }
        start();
      });

      renderGrid();
      updateIdleStats();
      window.__wagerxActiveCleanup = () => {
        active = false;
      };
    },
  };

  /* ============================== PLINKO ============================== */

  const PLINKO_TABLES = {
    8: {
      low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
      medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
      high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
    },
    12: {
      low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
      medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
      high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
    },
    16: {
      low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
      medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
      high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
    },
  };

  games.plinko = {
    mount(stage, panel) {
      stage.innerHTML = `${stageTop("Plinko", "Every peg is a coin flip with a view", "99% RTP")}
        <div class="plinko-canvas-wrap"><canvas id="plinkoCanvas" width="800" height="500" aria-label="Plinko board"></canvas></div>
        <div class="plinko-result-line"><span class="last-mult">Last drops: <b id="plinkoLast">—</b></span><div class="history-chips" id="plinkoHistory"></div></div>
        <div class="stage-foot"><span>Row count and risk set the payout table</span><span id="plinkoTable">8 rows · low risk</span></div>`;

      const ui = betModule(panel, {
        value: 10,
        action: "Drop ball",
        note: "Payouts land in the bin the ball reaches. RTP is built into the table.",
      });
      ui.options.innerHTML = `
        <div class="field-label"><span>Rows</span><b id="plinkoRowsLabel">8</b></div>
        <div class="seg" id="plinkoRows">
          ${[8, 12, 16].map((r) => `<button type="button" data-rows="${r}" class="${r === 8 ? "is-active" : ""}">${r}</button>`).join("")}
        </div>
        <div class="field-label" style="margin-top:10px"><span>Risk</span><b id="plinkoRiskLabel">Low</b></div>
        <div class="seg" id="plinkoRisk">
          <button type="button" data-risk="low" class="is-active">Low</button>
          <button type="button" data-risk="medium">Medium</button>
          <button type="button" data-risk="high">High</button>
        </div>`;

      const canvas = $("#plinkoCanvas", stage);
      const ctx = canvas.getContext("2d");
      const lastEl = $("#plinkoLast", stage);
      const historyEl = $("#plinkoHistory", stage);
      const tableEl = $("#plinkoTable", stage);
      const rowsWrap = $("#plinkoRows", panel);
      const riskWrap = $("#plinkoRisk", panel);
      const rowsLabel = $("#plinkoRowsLabel", panel);
      const riskLabel = $("#plinkoRiskLabel", panel);

      let rows = 8;
      let risk = "low";
      let payouts = PLINKO_TABLES[rows][risk];
      let dropping = false;
      let ball = null;
      let raf = 0;
      let highlightBin = -1;
      let lastResult = null;

      const W = 800;
      const H = 500;

      function geom() {
        const s = Math.min(46, 660 / (rows + 2));
        const startY = 78;
        const endY = 405;
        const gapY = rows > 1 ? (endY - startY) / (rows - 1) : 0;
        const pegY = (i) => startY + i * gapY;
        const binY = 440;
        const centerX = W / 2;
        return { s, pegY, binY, centerX };
      }

      function binColor(mult) {
        if (mult >= 10) return "rgba(200,255,61,.9)";
        if (mult >= 3) return "rgba(139,92,246,.9)";
        if (mult >= 1) return "rgba(61,224,255,.65)";
        return "rgba(255,255,255,.22)";
      }

      function drawBoard() {
        const { s, pegY, binY, centerX } = geom();
        ctx.clearRect(0, 0, W, H);
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, "#0b0b12");
        bg.addColorStop(1, "#0e0e17");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        ctx.strokeStyle = "rgba(255,255,255,.045)";
        ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
          ctx.beginPath();
          ctx.moveTo(80, 60 + i * 70);
          ctx.lineTo(W - 80, 60 + i * 70);
          ctx.stroke();
        }

        for (let i = 0; i < rows; i++) {
          const count = i + 3;
          const y = pegY(i);
          for (let j = 0; j < count; j++) {
            const x = centerX + (j - (count - 1) / 2) * s;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(228,228,240,.65)";
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, y, 5.5, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(139,92,246,.15)";
            ctx.stroke();
          }
        }

        const binCount = rows + 1;
        const binW = s - 3;
        for (let b = 0; b < binCount; b++) {
          const x = centerX + (b - (binCount - 1) / 2) * s;
          const mult = payouts[b];
          ctx.fillStyle = b === highlightBin ? binColor(mult) : "rgba(255,255,255,.07)";
          roundRect(ctx, x - binW / 2, binY, binW, 32, 5);
          ctx.fill();
          if (b === highlightBin) {
            ctx.shadowColor = binColor(mult);
            ctx.shadowBlur = 16;
            ctx.fill();
            ctx.shadowBlur = 0;
          }
          ctx.fillStyle = b === highlightBin ? "#08080b" : mult >= 10 ? "#c8ff3d" : mult >= 3 ? "#c4b5fd" : "#8f8fa4";
          ctx.font = `${rows > 12 ? 8 : 9}px Inter, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(`${mult}×`, x, binY + 20);
        }
        ctx.textAlign = "left";

        if (ball) {
          ctx.beginPath();
          ctx.arc(ball.x, ball.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = "#c8ff3d";
          ctx.shadowColor = "#c8ff3d";
          ctx.shadowBlur = 18;
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.arc(ball.x, ball.y, 11, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(200,255,61,.3)";
          ctx.stroke();
        }
      }

      function roundRect(context, x, y, w, h, r) {
        context.beginPath();
        context.moveTo(x + r, y);
        context.arcTo(x + w, y, x + w, y + h, r);
        context.arcTo(x + w, y + h, x, y + h, r);
        context.arcTo(x, y + h, x, y, r);
        context.arcTo(x, y, x + w, y, r);
        context.closePath();
      }

      function updateTableLabel() {
        payouts = PLINKO_TABLES[rows][risk];
        tableEl.textContent = `${rows} rows · ${risk} risk`;
        lastEl.textContent = "—";
        highlightBin = -1;
        drawBoard();
      }

      rowsWrap.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-rows]");
        if (!btn || dropping) return;
        rows = Number(btn.dataset.rows);
        rowsLabel.textContent = String(rows);
        rowsWrap.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b === btn));
        updateTableLabel();
      });
      riskWrap.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-risk]");
        if (!btn || dropping) return;
        risk = btn.dataset.risk;
        riskLabel.textContent = risk[0].toUpperCase() + risk.slice(1);
        riskWrap.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b === btn));
        updateTableLabel();
      });

      function drop() {
        if (dropping) return;
        const bet = ui.amount();
        if (!takeStake(bet)) return;
        dropping = true;
        highlightBin = -1;
        ui.lockBet(true);
        ui.setAction("Dropping…", true);
        ui.clearResult();
        G.setGameLock(true);
        const rng = newRng();
        const dirs = [];
        let rights = 0;
        for (let i = 0; i < rows; i++) {
          const right = rng() < 0.5;
          dirs.push(right);
          if (right) rights++;
        }
        const { s, pegY, binY, centerX } = geom();
        const points = [{ x: centerX, y: 40 }];
        let count = 0;
        for (let i = 0; i < rows; i++) {
          count += dirs[i] ? 1 : 0;
          points.push({ x: centerX + (2 * count - (i + 1)) * (s / 2), y: pegY(i) + 18 });
        }
        points.push({ x: centerX + (rights - rows / 2) * s, y: binY - 10 });
        const start = performance.now();
        const duration = 1500 + rows * 42;
        const tick = (now) => {
          const t = Math.min(1, (now - start) / duration);
          const raw = t * (points.length - 1);
          const idx = Math.min(points.length - 2, Math.floor(raw));
          const f = raw - idx;
          const eased = f * f * (3 - 2 * f);
          const a = points[idx];
          const b = points[idx + 1];
          ball = {
            x: a.x + (b.x - a.x) * eased,
            y: a.y + (b.y - a.y) * eased + Math.sin(f * Math.PI) * 5,
          };
          drawBoard();
          if (t < 1) raf = requestAnimationFrame(tick);
          else {
            ball = null;
            highlightBin = rights;
            drawBoard();
            const mult = payouts[rights];
            const payout = round2(bet * mult);
            settle({ game: "plinko", bet, mult, payout });
            lastEl.textContent = fmtMult(mult);
            pushChip(historyEl, fmtMult(mult), chipForMult(mult));
            ui.setResult(mult > 1 ? "win" : "loss", fmtMoney(payout), `Landed in ${fmtMult(mult)}${mult > 1 ? " · paid" : " bin"}`);
            ui.setAction("Drop again", false);
            ui.lockBet(false);
            dropping = false;
            G.setGameLock(false);
          }
        };
        raf = requestAnimationFrame(tick);
      }

      ui.action.addEventListener("click", drop);
      updateTableLabel();

      window.__wagerxActiveCleanup = () => {
        if (raf) cancelAnimationFrame(raf);
        dropping = false;
        ball = null;
      };
    },
  };

  /* ============================== LIMBO ============================== */

  games.limbo = {
    mount(stage, panel) {
      stage.innerHTML = `${stageTop("Limbo", "Pick the multiplier. Beat the roll", "1% house edge")}
        <div class="limbo-center">
          <div class="big-mult" id="limboMult">1.00<em>×</em></div>
          <div class="limbo-target">Target <b id="limboTargetOut">2.00×</b> · <span id="limboStatus">set a target and roll</span></div>
          <div class="limbo-bar"><i id="limboFill" style="width:25%"></i><span id="limboMark" style="left:25%"></span></div>
          <div class="history-chips" id="limboHistory" style="margin-top:18px"></div>
        </div>
        <div class="stage-foot"><span>Result = 0.99 / uniform draw</span><span id="limboFoot">House edge 1%</span></div>`;

      const ui = betModule(panel, {
        value: 10,
        action: "Play",
        note: "The target is your payout. If the roll lands on or above it, you win.",
      });
      ui.options.innerHTML = `
        <div class="field-label"><span>Target multiplier</span><b id="limboTargetLabel">2.00×</b></div>
        <input class="input-line" id="limboInput" type="number" min="1.01" max="1000" step="0.01" value="2.00" />
        <div class="preset-row" id="limboPresets">
          ${[1.5, 2, 5, 10, 50].map((v) => `<button type="button" data-target="${v}">${v}×</button>`).join("")}
        </div>`;

      const multEl = $("#limboMult", stage);
      const targetOut = $("#limboTargetOut", stage);
      const statusEl = $("#limboStatus", stage);
      const fillEl = $("#limboFill", stage);
      const markEl = $("#limboMark", stage);
      const historyEl = $("#limboHistory", stage);
      const input = $("#limboInput", panel);
      const targetLabel = $("#limboTargetLabel", panel);
      const presets = $("#limboPresets", panel);
      let target = 2;
      let playing = false;

      function syncTarget() {
        target = Math.min(1000, Math.max(1.01, parseFloat(input.value) || 2));
        input.value = target.toFixed(2);
        targetLabel.textContent = fmtMult(target);
        targetOut.textContent = fmtMult(target);
        const pct = Math.min(100, (1 / target) * 100);
        fillEl.style.width = pct + "%";
        markEl.style.left = pct + "%";
      }

      input.addEventListener("input", syncTarget);
      presets.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-target]");
        if (!btn || playing) return;
        input.value = btn.dataset.target;
        syncTarget();
        sound.click();
      });
      syncTarget();
      setMultHTML(multEl, 1);

      ui.action.addEventListener("click", () => {
        if (playing) return;
        const bet = ui.amount();
        if (!takeStake(bet)) return;
        playing = true;
        G.setGameLock(true);
        ui.lockBet(true);
        ui.setAction("Rolling…", true);
        ui.clearResult();
        multEl.classList.remove("is-win", "is-loss");
        const rng = newRng();
        const u = Math.max(1e-9, rng());
        const result = Math.min(1_000_000, 0.99 / u);
        const win = result >= target;
        const payout = win ? round2(bet * target) : 0;
        const startVal = 1;
        // Keep the <em> while animating by replacing with a live span.
        multEl.innerHTML = `<span id="limboLive">1.00</span><em>×</em>`;
        const live = $("#limboLive", multEl);
        animateNumber(live, 1, result, 800, (n) => (n >= 10 ? n.toFixed(1) : n.toFixed(2)), () => {
          multEl.innerHTML = `${result >= 10 ? result.toFixed(1) : result.toFixed(2)}<em>×</em>`;
          if (win) multEl.classList.add("is-win");
          else multEl.classList.add("is-loss");
          statusEl.textContent = win ? "target cleared" : "below target";
          ui.setResult(win ? "win" : "loss", win ? fmtMoney(payout) : "—", win ? `Rolled ${fmtMult(result)} · paid ${fmtMult(target)}` : `Rolled ${fmtMult(result)} · needed ${fmtMult(target)}`);
          pushChip(historyEl, fmtMult(result), win ? "hchip--win" : "hchip--loss");
          settle({ game: "limbo", bet, mult: win ? target : 0, payout });
          playing = false;
          ui.lockBet(false);
          ui.setAction("Play again", false);
          G.setGameLock(false);
        });
      });

      window.__wagerxActiveCleanup = () => {
        playing = false;
      };
    },
  };

  /* ============================== WHEEL ============================== */

  const WHEEL_SEGMENTS = [1.2, 0, 0, 1.5, 0, 2, 0, 0, 3, 0, 1.3, 0, 2, 0, 0, 3.4, 0, 5, 0, 0];
  const WHEEL_COLORS = {
    0: "#1a1a24",
    1.2: "#2f7d63",
    1.3: "#2f7d63",
    1.5: "#2563eb",
    2: "#7c3aed",
    3: "#db2777",
    3.4: "#ea580c",
    5: "#c8ff3d",
  };

  function buildWheelSVG(segments, colorFor, labelFor, radius = 184) {
    const cx = 200;
    const cy = 200;
    const seg = 360 / segments.length;
    const parts = [];
    for (let i = 0; i < segments.length; i++) {
      const a1 = i * seg - 90;
      const a2 = (i + 1) * seg - 90;
      const x1 = cx + radius * Math.cos((a1 * Math.PI) / 180);
      const y1 = cy + radius * Math.sin((a1 * Math.PI) / 180);
      const x2 = cx + radius * Math.cos((a2 * Math.PI) / 180);
      const y2 = cy + radius * Math.sin((a2 * Math.PI) / 180);
      const mid = a1 + seg / 2;
      const tx = cx + radius * 0.73 * Math.cos((mid * Math.PI) / 180);
      const ty = cy + radius * 0.73 * Math.sin((mid * Math.PI) / 180);
      const label = labelFor(segments[i], i);
      const fill = colorFor(segments[i], i);
      parts.push(`<path d="M${cx} ${cy} L${x1.toFixed(2)} ${y1.toFixed(2)} A${radius} ${radius} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${fill}" stroke="rgba(7,7,12,.55)" stroke-width="1"/>`);
      parts.push(`<text x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" fill="${segments[i] === 5 ? "#08080b" : "#f4f4f7"}" font-family="Inter, sans-serif" font-size="${segments.length > 24 ? 7.5 : 9.5}" font-weight="700" text-anchor="middle" dominant-baseline="middle">${label}</text>`);
    }
    return `<svg class="wheel-svg" viewBox="0 0 400 400" role="img" aria-label="Prize wheel">
      <defs>
        <radialGradient id="wheelEdge" cx="50%" cy="50%" r="50%">
          <stop offset="88%" stop-color="rgba(255,255,255,.06)"/>
          <stop offset="100%" stop-color="rgba(200,255,61,.28)"/>
        </radialGradient>
      </defs>
      <circle cx="200" cy="200" r="195" fill="rgba(8,8,13,.35)" stroke="rgba(255,255,255,.08)" stroke-width="2"/>
      <g id="wheelRotator" style="transform-origin:200px 200px">${parts.join("")}</g>
      <circle cx="200" cy="200" r="184" fill="none" stroke="url(#wheelEdge)" stroke-width="2"/>
      <circle cx="200" cy="200" r="191" fill="none" stroke="rgba(200,255,61,.2)" stroke-width="1" stroke-dasharray="2 8"/>
    </svg>`;
  }

  games.wheel = {
    mount(stage, panel) {
      stage.innerHTML = `${stageTop("Wheel", "Twenty segments. One spin", "3% house edge")}
        <div class="wheel-wrap">
          ${buildWheelSVG(WHEEL_SEGMENTS, (v) => WHEEL_COLORS[v] || "#1a1a24", (v) => (v === 0 ? "0" : `${v}×`))}
          <div class="wheel-pointer"></div>
          <div class="wheel-hub"><div><span>WAGERX</span><small>WHEEL</small></div></div>
        </div>
        <div class="wheel-result-line" id="wheelResult"><span>Spin and land a segment</span></div>
        <div class="stage-foot"><div class="history-chips" id="wheelHistory"></div><span>Segment pays on landing</span></div>`;

      const ui = betModule(panel, {
        value: 10,
        action: "Spin wheel",
        note: "The wheel lands where it lands. Expected return is 97%.",
      });
      const rotator = $("#wheelRotator", stage);
      const resultEl = $("#wheelResult", stage);
      const historyEl = $("#wheelHistory", stage);
      let rotation = 0;
      let spinning = false;
      let spinTimer = 0;

      ui.action.addEventListener("click", () => {
        if (spinning) return;
        const bet = ui.amount();
        if (!takeStake(bet)) return;
        spinning = true;
        G.setGameLock(true);
        ui.lockBet(true);
        ui.setAction("Spinning…", true);
        ui.clearResult();
        resultEl.innerHTML = "<span>round and round</span>";
        const rng = newRng();
        const index = rng.int(WHEEL_SEGMENTS.length);
        const value = WHEEL_SEGMENTS[index];
        const segAngle = 360 / WHEEL_SEGMENTS.length;
        const targetMod = 360 - (index * segAngle + segAngle / 2);
        const currentMod = ((rotation % 360) + 360) % 360;
        let delta = (targetMod - currentMod + 360) % 360;
        rotation += 360 * 6 + delta;
        rotator.style.transition = "transform 4.1s cubic-bezier(.12,.76,.06,1)";
        rotator.style.transform = `rotate(${rotation}deg)`;
        spinTimer = window.setTimeout(() => {
          const payout = round2(bet * value);
          resultEl.innerHTML = value > 0 ? `<b>${fmtMult(value)}</b><span>${fmtMoney(payout)} paid</span>` : `<b style="color:#ff4d5e">0×</b><span>no segment</span>`;
          if (value > 0) resultEl.querySelector("b").style.color = "#c8ff3d";
          ui.setResult(value > 0 ? "win" : "loss", value > 0 ? fmtMoney(payout) : "—", value > 0 ? `Landed ${fmtMult(value)}` : "Landed on zero");
          pushChip(historyEl, value > 0 ? fmtMult(value) : "0×", value > 0 ? "hchip--win" : "hchip--loss");
          settle({ game: "wheel", bet, mult: value, payout });
          spinning = false;
          ui.lockBet(false);
          ui.setAction("Spin again", false);
          G.setGameLock(false);
        }, 4250);
      });

      window.__wagerxActiveCleanup = () => {
        spinning = false;
        if (spinTimer) window.clearTimeout(spinTimer);
      };
    },
  };

  /* ============================== KENO ============================== */

  const KENO_PAYS = [0, 0, 0, 1, 2, 6, 12, 50, 250, 1500, 10000];

  games.keno = {
    mount(stage, panel) {
      stage.innerHTML = `${stageTop("Keno", "Pick ten numbers. Ten come back", "95.3% RTP")}
        <div class="keno-wrap">
          <div class="keno-grid" id="kenoGrid"></div>
          <div class="keno-legend">
            <span>Selected <b class="keno-picks" id="kenoCount">0</b> / 10</span>
            <span>Paytable: 3→1× · 5→6× · 7→50× · 10→10,000×</span>
          </div>
        </div>
        <div class="stage-foot"><span id="kenoMsg">Pick exactly ten numbers</span><span id="kenoDrawn">No draw yet</span></div>`;

      const ui = betModule(panel, {
        value: 10,
        action: "Play keno",
        note: "Ten picks, ten drawn from forty. Matches pay the table.",
      });
      ui.options.innerHTML = `<div class="btn-row">
        <button class="act-btn act-btn--dark act-btn--sm" type="button" id="kenoRandom">Random 10</button>
        <button class="act-btn act-btn--dark act-btn--sm" type="button" id="kenoClear">Clear</button>
      </div>`;
      const grid = $("#kenoGrid", stage);
      const countEl = $("#kenoCount", stage);
      const msgEl = $("#kenoMsg", stage);
      const drawnEl = $("#kenoDrawn", stage);
      const selected = new Set();
      let drawn = new Set();
      let drawing = false;

      function render() {
        grid.innerHTML = "";
        for (let n = 1; n <= 40; n++) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "keno-cell";
          btn.dataset.n = String(n);
          btn.textContent = String(n);
          if (selected.has(n)) btn.classList.add("is-picked");
          if (drawn.has(n)) {
            btn.classList.add("is-drawn");
            if (selected.has(n)) btn.classList.add("is-hit");
            else btn.classList.add("is-miss");
          }
          btn.disabled = drawing;
          btn.addEventListener("click", () => {
            if (drawing) return;
            if (selected.has(n)) selected.delete(n);
            else if (selected.size < 10) selected.add(n);
            else {
              toast("Ten is the limit", "Deselect one before adding another.", "error", 2600);
              return;
            }
            sound.tick();
            render();
            sync();
          });
          grid.appendChild(btn);
        }
      }

      function sync() {
        countEl.textContent = String(selected.size);
        ui.setAction(selected.size === 10 ? "Play 10 picks" : `Pick ${10 - selected.size} more`, selected.size !== 10 || drawing);
      }

      $("#kenoRandom", panel).addEventListener("click", () => {
        if (drawing) return;
        const rng = newRng();
        const picks = rng.shuffle([...Array(40).keys()].map((n) => n + 1)).slice(0, 10);
        selected.clear();
        picks.forEach((n) => selected.add(n));
        drawn = new Set();
        render();
        sync();
        sound.click();
      });
      $("#kenoClear", panel).addEventListener("click", () => {
        if (drawing) return;
        selected.clear();
        drawn = new Set();
        render();
        sync();
        msgEl.textContent = "Pick exactly ten numbers";
        drawnEl.textContent = "No draw yet";
        sound.click();
      });

      ui.action.addEventListener("click", () => {
        if (drawing || selected.size !== 10) return;
        const bet = ui.amount();
        if (!takeStake(bet)) return;
        drawing = true;
        G.setGameLock(true);
        ui.lockBet(true);
        ui.setAction("Drawing…", true);
        ui.clearResult();
        drawn = new Set();
        render();
        const rng = newRng();
        const draw = rng.shuffle([...Array(40).keys()].map((n) => n + 1)).slice(0, 10);
        let i = 0;
        const reveal = window.setInterval(() => {
          drawn.add(draw[i]);
          i++;
          render();
          sound.tick();
          if (i >= draw.length) {
            window.clearInterval(reveal);
            const matches = draw.filter((n) => selected.has(n)).length;
            const mult = KENO_PAYS[matches] || 0;
            const payout = round2(bet * mult);
            settle({ game: "keno", bet, mult, payout });
            ui.setResult(mult > 0 ? "win" : "loss", mult > 0 ? fmtMoney(payout) : "—", `${matches} match${matches === 1 ? "" : "es"} · ${fmtMult(mult)}`);
            msgEl.textContent = `${matches} matches. ${mult > 0 ? "Paid." : "No payout."}`;
            drawnEl.textContent = `Drawn: ${draw.slice().sort((a, b) => a - b).join(" · ")}`;
            drawing = false;
            G.setGameLock(false);
            ui.lockBet(false);
            ui.setAction("Play again", false);
            sync();
          }
        }, 105);
      });

      render();
      sync();
      window.__wagerxActiveCleanup = () => {
        drawing = false;
      };
    },
  };

  /* ============================== COINFLIP ============================== */

  games.coinflip = {
    mount(stage, panel) {
      stage.innerHTML = `${stageTop("Coinflip", "Call it in the air", "2% house edge")}
        <div class="coin-wrap">
          <div class="coin" id="coin">
            <div class="coin-face coin-face--heads"><b>$</b><span>HEADS</span></div>
            <div class="coin-face coin-face--tails"><b>◈</b><span>TAILS</span></div>
          </div>
          <div class="coin-shadow"></div>
          <div class="coin-result" id="coinResult">Heads or tails?</div>
        </div>
        <div class="stage-foot"><div class="history-chips" id="coinHistory"></div><span>Pays 1.96×</span></div>`;

      const ui = betModule(panel, {
        value: 10,
        action: "Flip coin",
        note: "A correct call returns 1.96× your stake.",
      });
      ui.options.innerHTML = `<div class="seg" id="coinSide">
        <button type="button" data-side="heads" class="is-active">Heads</button>
        <button type="button" data-side="tails">Tails</button>
      </div>`;

      const coin = $("#coin", stage);
      const resultEl = $("#coinResult", stage);
      const historyEl = $("#coinHistory", stage);
      const sideWrap = $("#coinSide", panel);
      let side = "heads";
      let rotation = 0;
      let flipping = false;
      let timer = 0;

      sideWrap.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-side]");
        if (!btn || flipping) return;
        side = btn.dataset.side;
        sideWrap.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b === btn));
        resultEl.textContent = side === "heads" ? "You called heads" : "You called tails";
        sound.click();
      });

      ui.action.addEventListener("click", () => {
        if (flipping) return;
        const bet = ui.amount();
        if (!takeStake(bet)) return;
        flipping = true;
        G.setGameLock(true);
        ui.lockBet(true);
        ui.setAction("In the air…", true);
        ui.clearResult();
        resultEl.textContent = "In the air…";
        const rng = newRng();
        const outcome = rng() < 0.5 ? "heads" : "tails";
        const faceDeg = outcome === "heads" ? 0 : 180;
        const current = ((rotation % 360) + 360) % 360;
        const delta = ((faceDeg - current) + 360) % 360;
        rotation += 360 * 6 + delta;
        coin.classList.add("is-flipping");
        coin.style.transform = `rotateY(${rotation}deg)`;
        timer = window.setTimeout(() => {
          const win = outcome === side;
          const payout = win ? round2(bet * 1.96) : 0;
          resultEl.innerHTML = win
            ? `<b>${outcome.toUpperCase()}</b> · you called it · +${fmtMoney(payout)}`
            : `<b style="color:#ff7c89">${outcome.toUpperCase()}</b> · ${side} was wrong`;
          ui.setResult(win ? "win" : "loss", win ? fmtMoney(payout) : "—", `${outcome} · ${side} called`);
          pushChip(historyEl, outcome === "heads" ? "H" : "T", win ? "hchip--win" : "hchip--loss");
          settle({ game: "coinflip", bet, mult: win ? 1.96 : 0, payout });
          flipping = false;
          ui.lockBet(false);
          ui.setAction("Flip again", false);
          G.setGameLock(false);
        }, 1850);
      });

      window.__wagerxActiveCleanup = () => {
        flipping = false;
        if (timer) window.clearTimeout(timer);
      };
    },
  };

  /* ============================== TOWERS ============================== */

  const TOWER_DIFFS = {
    easy: { label: "Easy", cols: 4, p: 0.75 },
    medium: { label: "Medium", cols: 3, p: 2 / 3 },
    hard: { label: "Hard", cols: 2, p: 0.5 },
  };

  games.towers = {
    mount(stage, panel) {
      stage.innerHTML = `${stageTop("Towers", "Eight rows. One clean climb", "3% house edge")}
        <div class="towers-wrap" id="towersWrap"></div>
        <div class="stage-foot"><span id="towerMsg">Choose a difficulty and start climbing.</span><span id="towerDiff">Medium · 3 tiles</span></div>`;

      const ui = betModule(panel, {
        value: 10,
        action: "Start climb",
        note: "One tile in each lit row is safe. Cash out before the tower gets taller.",
      });
      ui.options.innerHTML = `<div class="field-label"><span>Difficulty</span><b id="towerDiffLabel">Medium</b></div>
        <div class="seg" id="towerDifficulty">
          ${Object.entries(TOWER_DIFFS).map(([key, d]) => `<button type="button" data-diff="${key}" class="${key === "medium" ? "is-active" : ""}">${d.label}</button>`).join("")}
        </div>`;

      const wrap = $("#towersWrap", stage);
      const msgEl = $("#towerMsg", stage);
      const diffFoot = $("#towerDiff", stage);
      const diffWrap = $("#towerDifficulty", panel);
      const diffLabel = $("#towerDiffLabel", panel);

      let difficulty = "medium";
      let active = false;
      let bet = 0;
      let level = 0;
      let multiplier = 1;
      let bombs = [];
      let chosen = {};
      let ended = false;

      function diff() {
        return TOWER_DIFFS[difficulty];
      }
      function factor() {
        return 0.97 / diff().p;
      }
      function rowMult(row) {
        return Math.pow(factor(), row + 1);
      }

      function render() {
        wrap.innerHTML = "";
        const d = diff();
        for (let r = 0; r < 8; r++) {
          const row = document.createElement("div");
          row.className = "tower-row";
          if (active && r === level) row.classList.add("is-current");
          row.innerHTML = `<span class="tower-row-label">${fmtMult(rowMult(r))}</span><div class="tower-tiles" style="grid-template-columns:repeat(${d.cols},1fr)"></div>`;
          const tiles = row.querySelector(".tower-tiles");
          for (let c = 0; c < d.cols; c++) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "tower-tile";
            btn.textContent = "";
            btn.disabled = !active || r !== level;
            if (!active && ended) {
              if (bombs[r] === c) {
                btn.classList.add("is-mine");
                btn.textContent = "✹";
              } else if (chosen[r] === c) {
                btn.classList.add("is-safe");
                btn.textContent = "◆";
              } else if (r < level) {
                btn.classList.add("is-open");
              }
            } else {
              if (r < level && chosen[r] === c) {
                btn.classList.add("is-safe");
                btn.textContent = "◆";
              } else if (r < level) {
                btn.classList.add("is-open");
              }
            }
            btn.addEventListener("click", () => pick(r, c));
            tiles.appendChild(btn);
          }
          wrap.appendChild(row);
        }
        diffFoot.textContent = `${d.label} · ${d.cols} tiles · ${fmtMult(factor())} per row`;
      }

      function start() {
        const betAmount = ui.amount();
        if (!takeStake(betAmount)) return;
        bet = betAmount;
        active = true;
        ended = false;
        level = 0;
        multiplier = 1;
        chosen = {};
        const rng = newRng();
        bombs = [];
        for (let r = 0; r < 8; r++) bombs.push(rng.int(diff().cols));
        render();
        ui.lockBet(true);
        ui.clearResult();
        ui.setAction("Pick a tile", true);
        diffWrap.querySelectorAll("button").forEach((b) => (b.disabled = true));
        msgEl.textContent = "The bottom row is lit. Pick one tile.";
        G.setGameLock(true);
        sound.click();
      }

      function finish(payout, mult, won, message) {
        active = false;
        ended = true;
        multiplier = won ? mult : 0;
        G.setGameLock(false);
        ui.lockBet(false);
        ui.setAction("Play again", false);
        diffWrap.querySelectorAll("button").forEach((b) => (b.disabled = false));
        render();
        if (won) {
          ui.setResult("win", fmtMoney(payout), message);
          msgEl.textContent = "Cashed out. The tower stays standing.";
        } else {
          ui.setResult("loss", fmtMoney(0), message);
          msgEl.textContent = "Bomb. The tower closes.";
        }
        settle({ game: "towers", bet, mult: won ? mult : 0, payout });
      }

      function cashOut() {
        if (!active || level === 0) return;
        const payout = round2(bet * multiplier);
        finish(payout, multiplier, true, `${level} row${level === 1 ? "" : "s"} · ${fmtMult(multiplier)}`);
      }

      function pick(row, col) {
        if (!active || row !== level) return;
        if (bombs[row] === col) {
          chosen[row] = col;
          finish(0, 0, false, `Bomb on row ${row + 1} after ${level} safe${level === 1 ? "" : "s"}`);
          return;
        }
        chosen[row] = col;
        level += 1;
        multiplier = Math.pow(factor(), level);
        sound.tick();
        if (level >= 8) {
          const payout = round2(bet * multiplier);
          finish(payout, multiplier, true, "Eight rows cleared · maximum tower");
          return;
        }
        render();
        ui.setAction(`Cash out ${fmtMoney(bet * multiplier)}`, false);
        msgEl.textContent = `Row ${level} cleared. Next row lit.`;
      }

      diffWrap.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-diff]");
        if (!btn || active) return;
        difficulty = btn.dataset.diff;
        diffLabel.textContent = diff().label;
        diffWrap.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b === btn));
        render();
        ended = false;
        ui.setResult("push", "Ready", "The tower resets when you start.");
        sound.click();
      });

      ui.action.addEventListener("click", () => {
        if (active) {
          cashOut();
        } else {
          start();
        }
      });

      render();
      window.__wagerxActiveCleanup = () => {
        active = false;
      };
    },
  };

  /* ============================== CHICKEN ============================== */

  const CHICKEN_DIFFS = {
    easy: { label: "Easy", p: 0.9 },
    medium: { label: "Medium", p: 0.78 },
    hard: { label: "Hard", p: 0.62 },
  };

  games.chicken = {
    mount(stage, panel) {
      stage.innerHTML = `${stageTop("Chicken", "Cross the road. Keep the cash", "3% house edge")}
        <div class="chicken-road" id="chickenRoad"></div>
        <div class="chicken-meta">
          <div><span>Lane</span><b id="chickenLane">0 / 8</b></div>
          <div><span>Multiplier</span><b class="lime" id="chickenMult">1.00×</b></div>
          <div><span>Next lane</span><b id="chickenNext">—</b></div>
        </div>
        <div class="stage-foot"><span id="chickenMsg">Step onto the road when you're ready.</span><span id="chickenDiffFoot">Medium · 78% per lane</span></div>`;

      const ui = betModule(panel, {
        value: 10,
        action: "Start crossing",
        note: "Every lane is a chance to lose it all. The cash-out button is always live.",
      });
      ui.options.innerHTML = `<div class="field-label"><span>Traffic</span><b id="chickenDiffLabel">Medium</b></div>
        <div class="seg" id="chickenDifficulty">
          ${Object.entries(CHICKEN_DIFFS).map(([key, d]) => `<button type="button" data-diff="${key}" class="${key === "medium" ? "is-active" : ""}">${d.label}</button>`).join("")}
        </div>
        <button class="act-btn act-btn--dark act-btn--sm" type="button" id="chickenCash" disabled>Cash out</button>`;

      const road = $("#chickenRoad", stage);
      const laneEl = $("#chickenLane", stage);
      const multEl = $("#chickenMult", stage);
      const nextEl = $("#chickenNext", stage);
      const msgEl = $("#chickenMsg", stage);
      const diffFoot = $("#chickenDiffFoot", stage);
      const diffWrap = $("#chickenDifficulty", panel);
      const diffLabel = $("#chickenDiffLabel", panel);
      const cashBtn = $("#chickenCash", panel);

      let difficulty = "medium";
      let active = false;
      let bet = 0;
      let lane = 0;
      let multiplier = 1;
      let crashLane = -1;
      let rng = null;

      function diff() {
        return CHICKEN_DIFFS[difficulty];
      }
      function factor() {
        return 0.97 / diff().p;
      }
      function laneMult(n) {
        return Math.pow(factor(), n);
      }

      function render() {
        road.innerHTML = `<span class="road-start-label">START</span><span class="road-finish"></span>`;
        for (let r = 0; r < 9; r++) {
          const el = document.createElement("div");
          el.className = "road-lane";
          if (r === lane) el.classList.add("is-current");
          if (r < lane) el.classList.add("is-cleared");
          if (r === crashLane) el.classList.add("is-crashed");
          el.innerHTML = `<span class="road-lane-label">${r === 0 ? "START" : fmtMult(laneMult(r))}</span>`;
          if (r === crashLane) el.innerHTML += `<span class="road-car"></span>`;
          if (r === lane) el.innerHTML += `<span class="chicken-sprite">${G.icon("chicken")}</span>`;
          road.appendChild(el);
        }
        laneEl.textContent = `${lane} / 8`;
        multEl.textContent = fmtMult(multiplier);
        nextEl.textContent = lane < 8 ? fmtMult(laneMult(lane + 1)) : "max";
        diffFoot.textContent = `${diff().label} · ${Math.round(diff().p * 100)}% per lane`;
        cashBtn.disabled = !active || lane === 0;
        cashBtn.textContent = lane > 0 ? `Cash out ${fmtMoney(bet * multiplier)}` : "Cash out";
      }

      function start() {
        const amount = ui.amount();
        if (!takeStake(amount)) return;
        bet = amount;
        active = true;
        lane = 0;
        multiplier = 1;
        crashLane = -1;
        rng = newRng();
        render();
        ui.lockBet(true);
        ui.clearResult();
        ui.setAction("Cross the road", false);
        diffWrap.querySelectorAll("button").forEach((b) => (b.disabled = true));
        msgEl.textContent = "Lane one is waiting. Traffic is not.";
        G.setGameLock(true);
        sound.click();
      }

      function finish(payout, mult, won, message) {
        active = false;
        G.setGameLock(false);
        ui.lockBet(false);
        ui.setAction("Play again", false);
        diffWrap.querySelectorAll("button").forEach((b) => (b.disabled = false));
        cashBtn.disabled = true;
        render();
        if (won) {
          ui.setResult("win", fmtMoney(payout), message);
          msgEl.textContent = `Cashed out at lane ${lane}. The road stays behind you.`;
        } else {
          ui.setResult("loss", fmtMoney(0), message);
          msgEl.textContent = `Traffic wins at lane ${crashLane}.`;
        }
        settle({ game: "chicken", bet, mult: won ? mult : 0, payout });
      }

      function cashOut() {
        if (!active || lane === 0) return;
        const payout = round2(bet * multiplier);
        finish(payout, multiplier, true, `Lane ${lane} · ${fmtMult(multiplier)}`);
      }

      function cross() {
        if (!active) return;
        const roll = rng();
        if (roll >= diff().p) {
          crashLane = lane + 1 > 8 ? 8 : lane + 1;
          lane = crashLane;
          finish(0, 0, false, `Car on lane ${crashLane} · ${Math.round((1 - diff().p) * 100)}% traffic`);
          return;
        }
        lane += 1;
        multiplier = Math.pow(factor(), lane);
        sound.tick();
        if (lane >= 8) {
          const payout = round2(bet * multiplier);
          finish(payout, multiplier, true, "Eight lanes cleared · maximum crossing");
          return;
        }
        render();
        ui.setAction("Cross the road", false);
        msgEl.textContent = `Lane ${lane} cleared. ${Math.round(diff().p * 100)}% on the next one.`;
      }

      diffWrap.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-diff]");
        if (!btn || active) return;
        difficulty = btn.dataset.diff;
        diffLabel.textContent = diff().label;
        diffWrap.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b === btn));
        render();
        sound.click();
      });
      cashBtn.addEventListener("click", cashOut);
      ui.action.addEventListener("click", () => {
        if (active) cross();
        else start();
      });

      render();
      window.__wagerxActiveCleanup = () => {
        active = false;
      };
    },
  };

  /* ============================== CASES ============================== */

  const CASE_ITEMS = {
    neon: {
      name: "Neon Crate",
      sub: "Low stakes, bright drops",
      price: 50,
      items: [
        { name: "Scrap Chip", value: 10, weight: 35, glyph: "◇", rarity: "common" },
        { name: "Neon Dice", value: 25, weight: 30, glyph: "▣", rarity: "common" },
        { name: "Holo Card", value: 40, weight: 20, glyph: "▤", rarity: "uncommon" },
        { name: "WagerX Coin", value: 75, weight: 10, glyph: "◈", rarity: "rare" },
        { name: "Prism Gem", value: 150, weight: 3.5, glyph: "◆", rarity: "epic" },
        { name: "Void Shard", value: 500, weight: 1.2, glyph: "✦", rarity: "legendary" },
        { name: "Supernova", value: 2500, weight: 0.3, glyph: "✺", rarity: "legendary" },
      ],
    },
    vault: {
      name: "Vault",
      sub: "The middle drawer",
      price: 250,
      items: [
        { name: "Steel Token", value: 75, weight: 35.3, glyph: "◉", rarity: "common" },
        { name: "Vault Key", value: 150, weight: 30, glyph: "⚿", rarity: "uncommon" },
        { name: "Gold Bar", value: 250, weight: 20, glyph: "▬", rarity: "rare" },
        { name: "Black Card", value: 400, weight: 9, glyph: "▤", rarity: "rare" },
        { name: "Diamond", value: 800, weight: 4, glyph: "◆", rarity: "epic" },
        { name: "Crown", value: 2000, weight: 1.5, glyph: "♛", rarity: "legendary" },
        { name: "Vault Heart", value: 10000, weight: 0.2, glyph: "✺", rarity: "legendary" },
      ],
    },
    nebula: {
      name: "Nebula",
      sub: "For the deep end",
      price: 1000,
      items: [
        { name: "Star Dust", value: 300, weight: 35.4, glyph: "✦", rarity: "common" },
        { name: "Comet", value: 600, weight: 30, glyph: "☄", rarity: "uncommon" },
        { name: "Nova", value: 1000, weight: 18, glyph: "✷", rarity: "rare" },
        { name: "Event Horizon", value: 1500, weight: 10, glyph: "◉", rarity: "rare" },
        { name: "Quasar", value: 3000, weight: 5, glyph: "✺", rarity: "epic" },
        { name: "Galaxy", value: 8000, weight: 1.5, glyph: "❂", rarity: "legendary" },
        { name: "Big Bang", value: 50000, weight: 0.1, glyph: "✹", rarity: "legendary" },
      ],
    },
  };

  function caseItemHTML(item) {
    return `<div class="case-item" data-rarity="${item.rarity}">
      <span class="ci-glyph">${item.glyph}</span>
      <span class="ci-name">${item.name}</span>
      <span class="ci-value">${fmtMoney(item.value)}</span>
    </div>`;
  }

  games.cases = {
    mount(stage, panel) {
      stage.innerHTML = `${stageTop("Cases", "Three crates. Every drop sells for cash", "Up to $50,000")}
        <div class="case-hero">
          <div class="case-headline"><h3 id="caseTitle">Neon Crate</h3><p id="caseSub">Low stakes, bright drops</p></div>
          <div class="case-reel-viewport" id="caseViewport">
            <div class="case-reel" id="caseReel"></div>
            <div class="case-marker"></div>
          </div>
          <div class="case-picker" id="casePicker">
            ${Object.entries(CASE_ITEMS).map(([key, c]) => `<button class="case-option ${key === "neon" ? "is-active" : ""}" type="button" data-case="${key}"><span>${c.name}</span><strong>${fmtMoney(c.price)}</strong><b>top ${fmtMoney(Math.max(...c.items.map((i) => i.value)))}</b></button>`).join("")}
          </div>
          <div class="case-win-banner" id="caseBanner">Choose a crate and open when ready.</div>
          <div class="case-drop-rate" id="caseRates"></div>
        </div>
        <div class="stage-foot"><span>Opened items are sold instantly at their listed value</span><span id="caseFoot">Neon Crate · 90.5% RTP</span></div>`;

      const titleEl = $("#caseTitle", stage);
      const subEl = $("#caseSub", stage);
      const viewport = $("#caseViewport", stage);
      const reel = $("#caseReel", stage);
      const picker = $("#casePicker", stage);
      const banner = $("#caseBanner", stage);
      const rates = $("#caseRates", stage);
      const foot = $("#caseFoot", stage);

      panel.innerHTML = `<div class="gp-card">
        <div class="gp-head"><span>Case price</span><span style="color:#c8ff3d;font-weight:700" id="casePanelName">Neon Crate</span></div>
        <div style="text-align:center;padding:14px 0 10px">
          <div style="font-family:var(--display);font-size:44px;line-height:1;color:#c8ff3d" id="casePrice">$50</div>
          <div style="color:#656578;font-size:9px;letter-spacing:.12em;text-transform:uppercase;margin-top:4px">one spin · instant sell</div>
        </div>
        <button class="act-btn" type="button" id="caseOpen">Open Neon Crate — $50</button>
        <div class="game-result" id="caseResult" aria-live="polite"></div>
        <p class="gp-note">Items are sold automatically. The case price is the stake; the drop value is the payout.</p>
      </div>`;

      const openBtn = $("#caseOpen", panel);
      const resultEl = $("#caseResult", panel);
      const priceEl = $("#casePrice", panel);
      const panelName = $("#casePanelName", panel);
      let selected = "neon";
      let spinning = false;
      let spinTimer = 0;
      let tickTimer = 0;

      function currentCase() {
        return CASE_ITEMS[selected];
      }

      function pickItem(rng) {
        return G.weightedPick(rng, currentCase().items);
      }

      function renderRates() {
        const c = currentCase();
        const groups = {};
        for (const item of c.items) groups[item.rarity] = (groups[item.rarity] || 0) + item.weight;
        rates.innerHTML = Object.entries(groups)
          .map(([rarity, weight]) => `<span style="color:${rarity === "legendary" ? "#c8ff3d" : rarity === "epic" ? "#ff4d8d" : rarity === "rare" ? "#a78bfa" : rarity === "uncommon" ? "#3de0ff" : "#9494a8"}"><i></i>${rarity} ${weight.toFixed(1)}%</span>`)
          .join("");
      }

      function buildPreview() {
        const rng = G.newRng();
        const cells = [];
        for (let i = 0; i < 22; i++) cells.push(caseItemHTML(pickItem(rng)));
        reel.innerHTML = cells.join("");
        reel.style.transition = "none";
        reel.style.transform = "translateX(0)";
      }

      function selectCase(key) {
        if (spinning) return;
        selected = key;
        const c = currentCase();
        titleEl.textContent = c.name;
        subEl.textContent = c.sub;
        priceEl.textContent = fmtMoney(c.price);
        panelName.textContent = c.name;
        openBtn.textContent = `Open ${c.name} — ${fmtMoney(c.price)}`;
        picker.querySelectorAll("[data-case]").forEach((b) => b.classList.toggle("is-active", b.dataset.case === key));
        banner.textContent = "Choose a crate and open when ready.";
        resultEl.classList.remove("is-visible");
        resultEl.innerHTML = "";
        renderRates();
        buildPreview();
        const rtp = c.items.reduce((sum, item) => sum + (item.value * item.weight) / 100, 0) / c.price * 100;
        foot.textContent = `${c.name} · ${rtp.toFixed(1)}% RTP · top ${fmtMoney(Math.max(...c.items.map((i) => i.value)))}`;
        sound.click();
      }

      picker.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-case]");
        if (btn) selectCase(btn.dataset.case);
      });

      function openCase() {
        if (spinning) return;
        const c = currentCase();
        if (!takeStake(c.price)) return;
        spinning = true;
        G.setGameLock(true);
        openBtn.disabled = true;
        openBtn.textContent = "Opening…";
        resultEl.classList.remove("is-visible");
        const rng = G.newRng();
        const winner = pickItem(rng);
        const winnerIndex = 26;
        const cells = [];
        for (let i = 0; i < 34; i++) cells.push(i === winnerIndex ? caseItemHTML(winner) : caseItemHTML(pickItem(rng)));
        reel.innerHTML = cells.join("");
        reel.style.transition = "none";
        reel.style.transform = "translateX(0)";
        void reel.offsetWidth;
        const winnerEl = reel.children[winnerIndex];
        const target = winnerEl.offsetLeft + winnerEl.offsetWidth / 2 - viewport.clientWidth / 2;
        reel.style.transition = "transform 4.2s cubic-bezier(.1,.72,.06,1)";
        reel.style.transform = `translateX(${-target}px)`;
        banner.textContent = "The reel is moving…";
        tickTimer = window.setInterval(() => sound.tick(), 220);
        spinTimer = window.setTimeout(() => {
          window.clearInterval(tickTimer);
          winnerEl.classList.add("is-winner");
          const payout = winner.value;
          const mult = payout / c.price;
          settle({ game: "cases", bet: c.price, mult, payout });
          resultEl.innerHTML = `<div class="result-box ${mult >= 1 ? "is-win" : "is-lose"}"><strong>${fmtMoney(payout)}</strong><span>${winner.name} · ${fmtMult(mult)} · sold</span></div>`;
          resultEl.classList.add("is-visible");
          banner.innerHTML = `Dropped <b>${winner.name}</b> · sold for <b>${fmtMoney(payout)}</b>`;
          foot.textContent = `${c.name} · last drop ${winner.name}`;
          spinning = false;
          G.setGameLock(false);
          openBtn.disabled = false;
          openBtn.textContent = `Open ${c.name} — ${fmtMoney(c.price)}`;
          uiPulse(mult);
        }, 4400);
      }

      function uiPulse(mult) {
        if (mult >= 3) sound.win(mult);
      }

      openBtn.addEventListener("click", openCase);
      selectCase("neon");

      window.__wagerxActiveCleanup = () => {
        spinning = false;
        if (spinTimer) window.clearTimeout(spinTimer);
        if (tickTimer) window.clearInterval(tickTimer);
      };
    },
  };

  /* ============================== UPGRADER ============================== */

  games.upgrader = {
    mount(stage, panel) {
      stage.innerHTML = `${stageTop("Upgrader", "Set the target. Press the odds", "3% house edge")}
        <div class="upg-center">
          <div class="big-mult" id="upgTarget">2.00<em>×</em></div>
          <div class="sub-mult" id="upgStatus">Choose a target and pull the lever</div>
          <div style="width:100%;max-width:560px">
            <div class="upg-dial"><div class="upg-zone" id="upgZone" style="width:48.5%"></div><div class="upg-needle" id="upgNeedle"></div></div>
            <div class="upg-scale"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
          </div>
          <div class="upg-meta">
            <div><span>Win chance</span><b id="upgChance">48.50%</b></div>
            <div><span>Payout</span><b class="lime" id="upgPayout">2.00×</b></div>
            <div><span>Max win</span><b id="upgMax">$0</b></div>
          </div>
        </div>
        <div class="stage-foot"><span id="upgFoot">Land the needle inside the green zone</span><span>House edge 3%</span></div>`;

      const ui = betModule(panel, {
        value: 10,
        action: "Upgrade",
        note: "The needle lands somewhere between 0 and 100. Inside the zone wins.",
      });
      ui.options.innerHTML = `<div class="field-label"><span>Target multiplier</span><b id="upgTargetLabel">2.00×</b></div>
        <input class="input-line" id="upgInput" type="number" min="1.1" max="100" step="0.1" value="2.00" />
        <div class="preset-row" id="upgPresets">${[1.5, 2, 5, 10].map((v) => `<button type="button" data-target="${v}">${v}×</button>`).join("")}</div>`;

      const targetEl = $("#upgTarget", stage);
      const statusEl = $("#upgStatus", stage);
      const zoneEl = $("#upgZone", stage);
      const needle = $("#upgNeedle", stage);
      const chanceEl = $("#upgChance", stage);
      const payoutEl = $("#upgPayout", stage);
      const maxEl = $("#upgMax", stage);
      const footEl = $("#upgFoot", stage);
      const input = $("#upgInput", panel);
      const targetLabel = $("#upgTargetLabel", panel);
      const presets = $("#upgPresets", panel);
      let target = 2;
      let playing = false;
      let playTimer = 0;

      function sync() {
        target = Math.min(100, Math.max(1.1, Math.round((parseFloat(input.value) || 2) * 10) / 10));
        input.value = target.toFixed(1);
        const chance = Math.min(97, 97 / target);
        targetEl.innerHTML = `${target.toFixed(2)}<em>×</em>`;
        targetLabel.textContent = fmtMult(target);
        zoneEl.style.width = chance + "%";
        chanceEl.textContent = chance.toFixed(2) + "%";
        payoutEl.textContent = fmtMult(target);
        maxEl.textContent = fmtMoney(ui.amount() * target);
      }

      input.addEventListener("input", sync);
      presets.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-target]");
        if (!btn || playing) return;
        input.value = btn.dataset.target;
        sync();
        sound.click();
      });
      ui.input.addEventListener("change", sync);
      sync();

      ui.action.addEventListener("click", () => {
        if (playing) return;
        const bet = ui.amount();
        if (!takeStake(bet)) return;
        playing = true;
        G.setGameLock(true);
        ui.lockBet(true);
        ui.setAction("Upgrading…", true);
        ui.clearResult();
        const rng = newRng();
        const roll = rng() * 100;
        const chance = Math.min(97, 97 / target);
        const win = roll < chance;
        needle.style.transition = "none";
        needle.style.left = "0%";
        void needle.offsetWidth;
        needle.style.transition = "left 1.1s cubic-bezier(.16,.85,.24,1)";
        requestAnimationFrame(() => (needle.style.left = roll + "%"));
        statusEl.textContent = "The needle is moving…";
        playTimer = window.setTimeout(() => {
          const payout = win ? round2(bet * target) : 0;
          statusEl.textContent = win ? "inside the zone" : "outside the zone";
          footEl.textContent = win ? `Landed ${roll.toFixed(2)}% · inside ${chance.toFixed(2)}%` : `Landed ${roll.toFixed(2)}% · needed under ${chance.toFixed(2)}%`;
          ui.setResult(win ? "win" : "loss", win ? fmtMoney(payout) : "—", win ? `${fmtMult(target)} target cleared` : `Landed at ${roll.toFixed(2)}%`);
          settle({ game: "upgrader", bet, mult: win ? target : 0, payout });
          playing = false;
          ui.lockBet(false);
          ui.setAction("Upgrade again", false);
          G.setGameLock(false);
          sync();
        }, 1250);
      });

      window.__wagerxActiveCleanup = () => {
        playing = false;
        if (playTimer) window.clearTimeout(playTimer);
      };
    },
  };

  /* ============================== ROULETTE ============================== */

  const ROULETTE_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const ROULETTE_WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

  function rouletteColor(n) {
    return n === 0 ? "green" : ROULETTE_RED.has(n) ? "red" : "black";
  }
  function roulettePay(key) {
    if (key.startsWith("n:")) return 36;
    if (["red", "black", "odd", "even", "low", "high"].includes(key)) return 2;
    return 3;
  }
  function rouletteWins(key, n) {
    if (key.startsWith("n:")) return Number(key.slice(2)) === n;
    if (key === "red") return n !== 0 && ROULETTE_RED.has(n);
    if (key === "black") return n !== 0 && !ROULETTE_RED.has(n);
    if (key === "odd") return n !== 0 && n % 2 === 1;
    if (key === "even") return n !== 0 && n % 2 === 0;
    if (key === "low") return n >= 1 && n <= 18;
    if (key === "high") return n >= 19 && n <= 36;
    if (key === "dozen1") return n >= 1 && n <= 12;
    if (key === "dozen2") return n >= 13 && n <= 24;
    if (key === "dozen3") return n >= 25 && n <= 36;
    if (key === "col1") return n > 0 && n % 3 === 1;
    if (key === "col2") return n > 0 && n % 3 === 2;
    if (key === "col3") return n > 0 && n % 3 === 0;
    return false;
  }

  games.roulette = {
    mount(stage, panel) {
      const topRow = [];
      for (let c = 0; c < 12; c++) topRow.push(3 + c * 3, 2 + c * 3, 1 + c * 3);
      const numberHTML = topRow
        .map((n) => `<button class="roulette-cell is-${rouletteColor(n)}" type="button" data-bet="n:${n}">${n}</button>`)
        .join("");
      const outsideBtn = (key, label, cls = "") => `<button class="outside-bet ${cls}" type="button" data-bet="${key}">${label}</button>`;

      stage.innerHTML = `${stageTop("Roulette", "Single-zero wheel and a full outside board", "97.3% RTP")}
        <div class="roulette-layout">
          <div>
            <div class="roulette-wheel-wrap">
              ${buildWheelSVG(ROULETTE_WHEEL, (n) => (n === 0 ? "#177044" : ROULETTE_RED.has(n) ? "#a51f33" : "#17171f"), (n) => String(n))}
              <div class="roulette-pointer"></div>
              <div class="wheel-hub"><div><span id="rouletteHit">—</span><small>NUMBER</small></div></div>
            </div>
            <div class="roulette-history" id="rouletteHistory"></div>
          </div>
          <div class="roulette-board-scroll">
            <div class="roulette-board" id="rouletteBoard">
              <div class="roulette-grid-wrap">
                <button class="roulette-zero is-green" type="button" data-bet="n:0">0</button>
                <div class="roulette-numbers">${numberHTML}</div>
              </div>
              <div class="outside-bets">
                <div class="outside-row outside-row--dozens">
                  ${outsideBtn("dozen1", "1st 12")}
                  ${outsideBtn("dozen2", "2nd 12")}
                  ${outsideBtn("dozen3", "3rd 12")}
                </div>
                <div class="outside-row">
                  ${outsideBtn("low", "1–18")}
                  ${outsideBtn("even", "EVEN")}
                  ${outsideBtn("red", "RED", "is-red")}
                  ${outsideBtn("black", "BLACK", "is-black")}
                  ${outsideBtn("odd", "ODD")}
                  ${outsideBtn("high", "19–36")}
                </div>
                <div class="outside-row outside-row--dozens">
                  ${outsideBtn("col1", "Col 1 · 1,4…34")}
                  ${outsideBtn("col2", "Col 2 · 2,5…35")}
                  ${outsideBtn("col3", "Col 3 · 3,6…36")}
                </div>
              </div>
              <div class="roulette-summary"><span>Total on table</span><b id="rouletteTotal">$0</b></div>
            </div>
          </div>
        </div>
        <div class="stage-foot"><span id="rouletteMsg">Click the board to place chips</span><span>Straight 36× · Dozens & columns 3×</span></div>`;

      const ui = betModule(panel, {
        value: 10,
        action: "Place a chip",
        note: "Your bet amount is the chip size. Click any number or outside bet to add a chip; spin to settle the whole table.",
      });
      ui.options.innerHTML = `<div class="btn-row"><button class="act-btn act-btn--dark act-btn--sm" type="button" id="rouletteClear">Clear table</button></div>`;

      const board = $("#rouletteBoard", stage);
      const totalEl = $("#rouletteTotal", stage);
      const hitEl = $("#rouletteHit", stage);
      const historyEl = $("#rouletteHistory", stage);
      const msgEl = $("#rouletteMsg", stage);
      const clearBtn = $("#rouletteClear", panel);
      const rotator = $("#wheelRotator", stage);
      const bets = new Map();
      let rotation = 0;
      let spinning = false;
      let spinTimer = 0;

      const fmtChip = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n)));
      const tableTotal = () => [...bets.values()].reduce((sum, n) => sum + n, 0);

      function paintMarks() {
        board.querySelectorAll("[data-bet]").forEach((el) => {
          const amount = bets.get(el.dataset.bet) || 0;
          let mark = el.querySelector(".bet-chip-mark");
          if (amount > 0) {
            if (!mark) {
              mark = document.createElement("span");
              mark.className = "bet-chip-mark" + (el.dataset.bet.startsWith("n:") ? "" : " bet-chip-mark--violet");
              el.appendChild(mark);
            }
            mark.textContent = fmtChip(amount);
          } else if (mark) {
            mark.remove();
          }
        });
      }

      function updateSummary() {
        const total = tableTotal();
        totalEl.textContent = fmtMoney(total);
        if (!spinning) {
          ui.setAction(total > 0 ? "Spin wheel" : "Place a chip", total <= 0);
          clearBtn.disabled = total <= 0;
          msgEl.textContent = total > 0 ? `${fmtMoney(total)} on the table` : "Click the board to place chips";
        }
      }

      board.addEventListener("click", (e) => {
        if (spinning) return;
        const el = e.target.closest("[data-bet]");
        if (!el) return;
        const chip = ui.amount();
        const total = tableTotal();
        if (total + chip > state.balance) {
          toast("Not enough cash", "Lower the chip size or clear the table.", "error");
          return;
        }
        const key = el.dataset.bet;
        bets.set(key, round2((bets.get(key) || 0) + chip));
        sound.chip();
        paintMarks();
        updateSummary();
      });

      board.addEventListener("contextmenu", (e) => {
        const el = e.target.closest("[data-bet]");
        if (!el || spinning) return;
        e.preventDefault();
        const key = el.dataset.bet;
        if (!bets.has(key)) return;
        const chip = ui.amount();
        const next = round2(bets.get(key) - chip);
        if (next > 0) bets.set(key, next);
        else bets.delete(key);
        sound.tick();
        paintMarks();
        updateSummary();
      });

      clearBtn.addEventListener("click", () => {
        if (spinning) return;
        bets.clear();
        paintMarks();
        updateSummary();
        sound.click();
      });

      ui.action.addEventListener("click", () => {
        if (spinning) return;
        const total = tableTotal();
        if (total <= 0) {
          toast("Place a chip first", "Click a number or an outside bet to build your table.", "error");
          return;
        }
        if (!takeStake(total)) return;
        spinning = true;
        G.setGameLock(true);
        ui.lockBet(true);
        ui.setAction("Spinning…", true);
        clearBtn.disabled = true;
        board.style.pointerEvents = "none";
        ui.clearResult();
        msgEl.textContent = "The wheel is spinning…";
        hitEl.textContent = "—";
        board.querySelectorAll(".is-hit").forEach((el) => el.classList.remove("is-hit"));

        const rng = newRng();
        const winning = rng.int(37);
        const index = ROULETTE_WHEEL.indexOf(winning);
        const seg = 360 / ROULETTE_WHEEL.length;
        const targetMod = 360 - (index * seg + seg / 2);
        const currentMod = ((rotation % 360) + 360) % 360;
        const delta = (targetMod - currentMod + 360) % 360;
        rotation += 360 * 6 + delta;
        rotator.style.transition = "transform 4.3s cubic-bezier(.12,.76,.06,1)";
        rotator.style.transform = `rotate(${rotation}deg)`;

        spinTimer = window.setTimeout(() => {
          let payout = 0;
          bets.forEach((amount, key) => {
            if (rouletteWins(key, winning)) payout += amount * roulettePay(key);
          });
          payout = round2(payout);
          const mult = payout / total;
          settle({ game: "roulette", bet: total, mult, payout });

          hitEl.textContent = String(winning);
          const hit = board.querySelector(`[data-bet="n:${winning}"]`);
          if (hit) hit.classList.add("is-hit");
          const colorName = rouletteColor(winning);
          pushChip(historyEl, String(winning), winning === 0 ? "hchip--win" : colorName === "red" ? "hchip--hot" : "hchip--loss");
          ui.setResult(payout > total ? "win" : payout > 0 ? "push" : "loss", payout > 0 ? fmtMoney(payout) : "—", `${winning} ${colorName} · ${bets.size} spot${bets.size === 1 ? "" : "s"}`);
          msgEl.textContent = payout > 0 ? `${winning} ${colorName}. Paid ${fmtMoney(payout)}.` : `${winning} ${colorName}. No winning chips.`;

          bets.clear();
          paintMarks();
          spinning = false;
          board.style.pointerEvents = "";
          G.setGameLock(false);
          ui.lockBet(false);
          ui.setAction("Spin again", false);
          clearBtn.disabled = true;
          totalEl.textContent = "$0";
        }, 4380);
      });

      updateSummary();

      window.__wagerxActiveCleanup = () => {
        spinning = false;
        if (spinTimer) window.clearTimeout(spinTimer);
      };
    },
  };

  /* ============================== BLACKJACK ============================== */

  games.blackjack = {
    mount(stage, panel) {
      stage.innerHTML = `${stageTop("Blackjack", "Six-deck shoe. Dealer stands on every 17", "3:2 blackjack")}
        <div class="table-felt">
          <div class="table-seat">
            <div class="table-seat-head"><span>Dealer</span><b id="bjDealerTotal">—</b></div>
            <div class="hand-area" id="bjDealerHand"><div class="hand-empty"></div><div class="hand-empty"></div></div>
          </div>
          <div class="table-divider"></div>
          <div class="table-seat">
            <div class="table-seat-head"><span>You</span><b id="bjPlayerTotal">—</b></div>
            <div class="hand-area" id="bjPlayerHand"><div class="hand-empty"></div><div class="hand-empty"></div></div>
          </div>
          <div class="table-message" id="bjMessage">Place a bet to receive a hand</div>
        </div>
        <div class="stage-foot"><div class="history-chips" id="bjHistory"></div><span class="table-shoe"><i></i><span id="bjShoe">312 cards in shoe</span></span></div>`;

      const ui = betModule(panel, {
        value: 25,
        action: "Deal hand",
        note: "Blackjack pays 3:2. Double on any first two cards. Dealer stands on all 17s.",
      });
      ui.options.innerHTML = `<div class="bj-actions">
        <button type="button" data-bj="hit" disabled>Hit</button>
        <button type="button" data-bj="stand" disabled>Stand</button>
        <button type="button" data-bj="double" disabled>Double</button>
      </div>`;

      const dealerHandEl = $("#bjDealerHand", stage);
      const playerHandEl = $("#bjPlayerHand", stage);
      const dealerTotalEl = $("#bjDealerTotal", stage);
      const playerTotalEl = $("#bjPlayerTotal", stage);
      const messageEl = $("#bjMessage", stage);
      const historyEl = $("#bjHistory", stage);
      const shoeEl = $("#bjShoe", stage);
      const hitBtn = $('[data-bj="hit"]', panel);
      const standBtn = $('[data-bj="stand"]', panel);
      const doubleBtn = $('[data-bj="double"]', panel);

      let shoe = [];
      let player = [];
      let dealer = [];
      let bet = 0;
      let phase = "idle";
      let holeHidden = true;
      let busy = false;
      let timer = 0;

      function ensureShoe() {
        if (shoe.length < 60) {
          shoe = newRng().shuffle(makeDeck(6));
        }
      }
      function drawCard() {
        if (!shoe.length) ensureShoe();
        return shoe.pop();
      }

      function render() {
        dealerHandEl.innerHTML = dealer.length
          ? dealer.map((card, i) => cardHTML(card, { hidden: holeHidden && i === 1, size: "lg" })).join("")
          : `<div class="hand-empty"></div><div class="hand-empty"></div>`;
        playerHandEl.innerHTML = player.length
          ? player.map((card) => cardHTML(card, { size: "lg" })).join("")
          : `<div class="hand-empty"></div><div class="hand-empty"></div>`;

        const pTotal = handTotal(player);
        const dTotal = handTotal(dealer);
        playerTotalEl.textContent = player.length ? String(pTotal) : "—";
        dealerTotalEl.textContent = dealer.length ? (holeHidden ? `${handTotal([dealer[0]])} + ?` : String(dTotal)) : "—";
        playerTotalEl.className = player.length && pTotal > 21 ? "hand-bust" : player.length === 2 && pTotal === 21 ? "hand-blackjack" : "";
        dealerTotalEl.className = !holeHidden && dealer.length && dTotal > 21 ? "hand-bust" : !holeHidden && dealer.length === 2 && dTotal === 21 ? "hand-blackjack" : "";
        shoeEl.textContent = `${shoe.length} cards in shoe`;
      }

      function updateActions() {
        const canAct = phase === "player" && !busy;
        hitBtn.disabled = !canAct || handTotal(player) >= 21;
        standBtn.disabled = !canAct;
        doubleBtn.disabled = !canAct || player.length !== 2 || state.balance < bet;
        if (phase === "player" || phase === "dealer") ui.setAction("Hand in play", true);
      }

      function setMessage(html, tone = "") {
        messageEl.innerHTML = html;
        messageEl.className = "table-message" + (tone ? ` is-${tone}` : "");
      }

      function startRound() {
        if (phase === "player" || phase === "dealer" || busy) return;
        const stake = ui.amount();
        if (!takeStake(stake)) return;
        bet = stake;
        ensureShoe();
        player = [drawCard(), drawCard()];
        dealer = [drawCard(), drawCard()];
        holeHidden = true;
        phase = "player";
        busy = false;
        G.setGameLock(true);
        ui.lockBet(true);
        ui.clearResult();
        ui.setAction("Hand in play", true);
        render();
        setMessage("Hit, stand, or double.");

        const pTotal = handTotal(player);
        const dTotal = handTotal(dealer);
        const pBJ = player.length === 2 && pTotal === 21;
        const dBJ = dealer.length === 2 && dTotal === 21;
        if (pBJ || dBJ) {
          phase = "dealer";
          busy = true;
          holeHidden = false;
          render();
          updateActions();
          setMessage(pBJ && dBJ ? "Two blackjacks. This one is a push." : pBJ ? "Blackjack on the deal." : "Dealer has blackjack.", pBJ && !dBJ ? "win" : pBJ && dBJ ? "push" : "loss");
          timer = window.setTimeout(resolve, 850);
        } else {
          updateActions();
        }
      }

      function hit() {
        if (phase !== "player" || busy) return;
        busy = true;
        updateActions();
        player.push(drawCard());
        render();
        sound.tick();
        const total = handTotal(player);
        if (total > 21) {
          busy = false;
          phase = "dealer";
          holeHidden = false;
          render();
          updateActions();
          setMessage("Bust. The dealer takes the hand.", "loss");
          timer = window.setTimeout(resolve, 720);
        } else if (total === 21) {
          busy = false;
          phase = "dealer";
          setMessage("Twenty-one. The dealer plays it out.", "win");
          updateActions();
          timer = window.setTimeout(dealerTurn, 650);
        } else {
          busy = false;
          updateActions();
        }
      }

      function stand() {
        if (phase !== "player" || busy) return;
        phase = "dealer";
        busy = true;
        holeHidden = false;
        render();
        updateActions();
        setMessage("Dealer reveals the hole card.");
        timer = window.setTimeout(dealerTurn, 620);
      }

      function double() {
        if (phase !== "player" || busy || player.length !== 2) return;
        if (!takeStake(bet)) return;
        bet = round2(bet * 2);
        player.push(drawCard());
        holeHidden = false;
        phase = "dealer";
        busy = true;
        render();
        updateActions();
        setMessage(`Doubled to ${fmtMoney(bet)}. One card only.`);
        sound.tick();
        timer = window.setTimeout(dealerTurn, 720);
      }

      function dealerTurn() {
        if (phase !== "dealer") return;
        holeHidden = false;
        const pTotal = handTotal(player);
        const dTotal = handTotal(dealer);
        if (pTotal <= 21 && dTotal < 17) {
          dealer.push(drawCard());
          render();
          sound.tick();
          updateActions();
          timer = window.setTimeout(dealerTurn, 650);
        } else {
          resolve();
        }
      }

      function resolve() {
        if (phase === "done") return;
        phase = "done";
        busy = false;
        holeHidden = false;
        render();

        const p = handTotal(player);
        const d = handTotal(dealer);
        const pBJ = player.length === 2 && p === 21;
        const dBJ = dealer.length === 2 && d === 21;
        let payout = 0;
        let tone = "loss";
        let outcome = "Dealer wins";

        if (pBJ && dBJ) {
          payout = bet;
          tone = "push";
          outcome = "Push";
        } else if (pBJ) {
          payout = round2(bet * 2.5);
          tone = "win";
          outcome = "Blackjack";
        } else if (dBJ) {
          outcome = "Dealer blackjack";
        } else if (p > 21) {
          outcome = "Bust";
        } else if (d > 21) {
          payout = round2(bet * 2);
          tone = "win";
          outcome = "Dealer busts";
        } else if (p > d) {
          payout = round2(bet * 2);
          tone = "win";
          outcome = "You win";
        } else if (p === d) {
          payout = bet;
          tone = "push";
          outcome = "Push";
        }

        const mult = bet > 0 ? payout / bet : 0;
        settle({ game: "blackjack", bet, mult, payout });
        ui.setResult(tone === "win" ? "win" : tone === "push" ? "push" : "loss", payout > 0 ? fmtMoney(payout) : "—", `${outcome} · ${p} vs ${d}`);
        setMessage(`<strong>${outcome}</strong> · you ${p} · dealer ${d}`, tone);
        pushChip(historyEl, outcome === "Push" ? "PUSH" : tone === "win" ? `+${fmtMult(mult)}` : "LOSS", tone === "win" ? "hchip--win" : tone === "push" ? "" : "hchip--loss");
        G.setGameLock(false);
        ui.lockBet(false);
        ui.setAction("Deal again", false);
        updateActions();
      }

      ui.action.addEventListener("click", startRound);
      hitBtn.addEventListener("click", hit);
      standBtn.addEventListener("click", stand);
      doubleBtn.addEventListener("click", double);

      ensureShoe();
      render();

      window.__wagerxActiveCleanup = () => {
        if (timer) window.clearTimeout(timer);
        phase = "idle";
        busy = false;
      };
    },
  };

  /* ============================== BACCARAT ============================== */

  games.baccarat = {
    mount(stage, panel) {
      stage.innerHTML = `${stageTop("Baccarat", "Player, banker, or tie. Third-card rules apply", "5% banker commission")}
        <div class="baccarat-table">
          <div class="baccarat-hands">
            <div class="baccarat-side">
              <h4>Player</h4>
              <div class="hand-area" id="bacPlayerHand"><div class="hand-empty"></div></div>
              <div class="baccarat-total" id="bacPlayerTotal">—</div>
            </div>
            <div class="baccarat-vs">VS</div>
            <div class="baccarat-side">
              <h4>Banker</h4>
              <div class="hand-area" id="bacBankerHand"><div class="hand-empty"></div></div>
              <div class="baccarat-total" id="bacBankerTotal">—</div>
            </div>
          </div>
          <div class="baccarat-note" id="bacMessage">Bet Player, Banker, or Tie. Cards are dealt to two hands.</div>
        </div>
        <div class="stage-foot"><div class="baccarat-beads" id="bacBeads"></div><span>Player 1:1 · Banker 0.95:1 · Tie 8:1</span></div>`;

      const ui = betModule(panel, {
        value: 25,
        action: "Deal cards",
        note: "Banker wins pay 0.95:1 after commission. A tie pays 8:1 and Player / Banker bets lose.",
      });
      ui.options.innerHTML = `<div class="field-label"><span>Bet on</span><b id="bacSideLabel">Player</b></div>
        <div class="seg" id="bacSideSeg">
          <button type="button" data-side="player" class="is-active" data-v="lime">Player</button>
          <button type="button" data-side="banker">Banker</button>
          <button type="button" data-side="tie">Tie</button>
        </div>`;

      const playerHandEl = $("#bacPlayerHand", stage);
      const bankerHandEl = $("#bacBankerHand", stage);
      const playerTotalEl = $("#bacPlayerTotal", stage);
      const bankerTotalEl = $("#bacBankerTotal", stage);
      const messageEl = $("#bacMessage", stage);
      const beadsEl = $("#bacBeads", stage);
      const sideSeg = $("#bacSideSeg", panel);
      const sideLabel = $("#bacSideLabel", panel);

      let side = "player";
      let playerCards = [];
      let bankerCards = [];
      let busy = false;
      let timers = [];

      function baccTotal(cards) {
        return cards.reduce((sum, card) => sum + (card.value % 10), 0) % 10;
      }

      function after(ms, fn) {
        timers.push(window.setTimeout(fn, ms));
      }

      function render() {
        playerHandEl.innerHTML = playerCards.length ? playerCards.map((c) => cardHTML(c)).join("") : `<div class="hand-empty"></div>`;
        bankerHandEl.innerHTML = bankerCards.length ? bankerCards.map((c) => cardHTML(c)).join("") : `<div class="hand-empty"></div>`;
        playerTotalEl.textContent = playerCards.length >= 2 ? String(baccTotal(playerCards)) : "—";
        bankerTotalEl.textContent = bankerCards.length >= 2 ? String(baccTotal(bankerCards)) : "—";
        const p = baccTotal(playerCards);
        const b = baccTotal(bankerCards);
        playerTotalEl.style.color = playerCards.length >= 2 && p > b ? "var(--lime)" : "";
        bankerTotalEl.style.color = bankerCards.length >= 2 && b > p ? "var(--lime)" : "";
      }

      function setSide(next) {
        if (busy) return;
        side = next;
        sideSeg.querySelectorAll("[data-side]").forEach((btn) => {
          btn.classList.toggle("is-active", btn.dataset.side === next);
          btn.removeAttribute("data-v");
          if (btn.dataset.side === next) btn.setAttribute("data-v", "lime");
        });
        sideLabel.textContent = next === "player" ? "Player" : next === "banker" ? "Banker" : "Tie";
        sound.click();
      }

      sideSeg.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-side]");
        if (btn) setSide(btn.dataset.side);
      });

      function addBead(winner) {
        const bead = document.createElement("span");
        bead.className = `bead bead--${winner === "player" ? "p" : winner === "banker" ? "b" : "t"}`;
        bead.textContent = winner === "player" ? "P" : winner === "banker" ? "B" : "T";
        beadsEl.prepend(bead);
        while (beadsEl.children.length > 16) beadsEl.lastElementChild.remove();
      }

      function deal() {
        if (busy) return;
        const stake = ui.amount();
        if (!takeStake(stake)) return;
        busy = true;
        G.setGameLock(true);
        ui.lockBet(true);
        ui.setAction("Dealing…", true);
        ui.clearResult();
        sideSeg.querySelectorAll("button").forEach((b) => (b.disabled = true));
        playerCards = [];
        bankerCards = [];
        render();
        messageEl.textContent = "Dealing…";

        const rng = newRng();
        const shoe = rng.shuffle(makeDeck(8));
        const p1 = shoe.pop();
        const b1 = shoe.pop();
        const p2 = shoe.pop();
        const b2 = shoe.pop();
        playerCards = [p1];
        bankerCards = [b1];
        render();

        after(260, () => {
          playerCards.push(p2);
          bankerCards.push(b2);
          render();
          sound.tick();
        });

        const pStart = ((p1.value % 10) + (p2.value % 10)) % 10;
        const bStart = ((b1.value % 10) + (b2.value % 10)) % 10;

        let p3 = null;
        let b3 = null;
        if (pStart < 8 && bStart < 8) {
          if (pStart <= 5) p3 = shoe.pop();
          let bankerDraws = false;
          if (!p3) {
            bankerDraws = bStart <= 5;
          } else {
            const third = p3.value % 10;
            if (bStart <= 2) bankerDraws = true;
            else if (bStart === 3) bankerDraws = third !== 8;
            else if (bStart === 4) bankerDraws = third >= 2 && third <= 7;
            else if (bStart === 5) bankerDraws = third >= 4 && third <= 7;
            else if (bStart === 6) bankerDraws = third === 6 || third === 7;
          }
          if (bankerDraws) b3 = shoe.pop();
        }

        if (p3) {
          after(680, () => {
            playerCards.push(p3);
            render();
            sound.tick();
          });
        }
        if (b3) {
          after(960, () => {
            bankerCards.push(b3);
            render();
            sound.tick();
          });
        }

        after(b3 ? 1330 : p3 ? 1120 : 900, () => {
          const p = baccTotal(playerCards);
          const b = baccTotal(bankerCards);
          const winner = p > b ? "player" : b > p ? "banker" : "tie";
          let payout = 0;
          if (side === winner) {
            payout = round2(stake * (winner === "tie" ? 9 : winner === "banker" ? 1.95 : 2));
          }
          const mult = payout / stake;
          settle({ game: "baccarat", bet: stake, mult, payout });
          playerTotalEl.style.color = winner === "player" ? "var(--lime)" : "";
          bankerTotalEl.style.color = winner === "banker" ? "var(--lime)" : "";
          const label = winner === "player" ? "Player" : winner === "banker" ? "Banker" : "Tie";
          messageEl.innerHTML = `<strong style="color:${winner === "tie" ? "#d6d6e0" : "var(--lime)"}">${label}</strong> · Player ${p} · Banker ${b}`;
          ui.setResult(payout > stake ? "win" : payout > 0 ? "push" : "loss", payout > 0 ? fmtMoney(payout) : "—", `${label} · Player ${p} / Banker ${b}`);
          addBead(winner);
          busy = false;
          G.setGameLock(false);
          ui.lockBet(false);
          ui.setAction("Deal again", false);
          sideSeg.querySelectorAll("button").forEach((b) => (b.disabled = false));
        });
      }

      ui.action.addEventListener("click", deal);
      render();

      window.__wagerxActiveCleanup = () => {
        timers.forEach((t) => window.clearTimeout(t));
        timers = [];
        busy = false;
      };
    },
  };

  /* ============================== DRAGON TIGER ============================== */

  function dtRankValue(card) {
    if (card.rank === "A") return 14;
    if (card.rank === "K") return 13;
    if (card.rank === "Q") return 12;
    if (card.rank === "J") return 11;
    return Number(card.rank);
  }

  games.dragontiger = {
    mount(stage, panel) {
      stage.innerHTML = `${stageTop("Dragon Tiger", "One card each. The higher rank takes it", "8:1 tie")}
        <div class="dt-hands">
          <div class="dt-side" id="dtDragon">
            <h4>Dragon</h4>
            <div id="dtDragonCard">${cardHTML(null, { hidden: true })}</div>
          </div>
          <div class="dt-vs">VS</div>
          <div class="dt-side" id="dtTiger">
            <h4>Tiger</h4>
            <div id="dtTigerCard">${cardHTML(null, { hidden: true })}</div>
          </div>
        </div>
        <div class="table-message" id="dtMessage">Pick a side and deal the cards</div>
        <div class="stage-foot"><div class="baccarat-beads dt-beads" id="dtBeads"></div><span>Dragon / Tiger 1:1 · Tie 8:1</span></div>`;

      const ui = betModule(panel, {
        value: 25,
        action: "Deal cards",
        note: "Ace is high. Suits never break a tie. Dragon and Tiger lose when the ranks match.",
      });
      ui.options.innerHTML = `<div class="field-label"><span>Bet on</span><b id="dtSideLabel">Dragon</b></div>
        <div class="seg" id="dtSideSeg">
          <button type="button" data-side="dragon" class="is-active" data-v="lime">Dragon</button>
          <button type="button" data-side="tiger">Tiger</button>
          <button type="button" data-side="tie">Tie</button>
        </div>`;

      const dragonEl = $("#dtDragon", stage);
      const tigerEl = $("#dtTiger", stage);
      const dragonCardEl = $("#dtDragonCard", stage);
      const tigerCardEl = $("#dtTigerCard", stage);
      const messageEl = $("#dtMessage", stage);
      const beadsEl = $("#dtBeads", stage);
      const sideSeg = $("#dtSideSeg", panel);
      const sideLabel = $("#dtSideLabel", panel);

      let side = "dragon";
      let busy = false;
      let timers = [];

      function setSide(next) {
        if (busy) return;
        side = next;
        sideSeg.querySelectorAll("[data-side]").forEach((btn) => {
          btn.classList.toggle("is-active", btn.dataset.side === next);
          btn.removeAttribute("data-v");
          if (btn.dataset.side === next) btn.setAttribute("data-v", "lime");
        });
        sideLabel.textContent = next === "dragon" ? "Dragon" : next === "tiger" ? "Tiger" : "Tie";
        sound.click();
      }

      sideSeg.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-side]");
        if (btn) setSide(btn.dataset.side);
      });

      function addBead(winner) {
        const bead = document.createElement("span");
        bead.className = `bead bead--${winner === "dragon" ? "b" : winner === "tiger" ? "p" : "t"}`;
        bead.textContent = winner === "dragon" ? "D" : winner === "tiger" ? "T" : "=";
        beadsEl.prepend(bead);
        while (beadsEl.children.length > 16) beadsEl.lastElementChild.remove();
      }

      function deal() {
        if (busy) return;
        const stake = ui.amount();
        if (!takeStake(stake)) return;
        busy = true;
        G.setGameLock(true);
        ui.lockBet(true);
        ui.setAction("Dealing…", true);
        ui.clearResult();
        sideSeg.querySelectorAll("button").forEach((b) => (b.disabled = true));
        dragonEl.classList.remove("is-winner");
        tigerEl.classList.remove("is-winner");
        dragonCardEl.innerHTML = cardHTML(null, { hidden: true });
        tigerCardEl.innerHTML = cardHTML(null, { hidden: true });
        messageEl.className = "table-message";
        messageEl.textContent = "One card each…";

        const rng = newRng();
        const deck = rng.shuffle(makeDeck(1));
        const dragon = deck.pop();
        const tiger = deck.pop();

        timers.push(window.setTimeout(() => {
          dragonCardEl.innerHTML = cardHTML(dragon);
          sound.tick();
        }, 420));
        timers.push(window.setTimeout(() => {
          tigerCardEl.innerHTML = cardHTML(tiger);
          sound.tick();
        }, 760));

        timers.push(window.setTimeout(() => {
          const dRank = dtRankValue(dragon);
          const tRank = dtRankValue(tiger);
          const winner = dRank > tRank ? "dragon" : tRank > dRank ? "tiger" : "tie";
          const label = winner === "dragon" ? "Dragon" : winner === "tiger" ? "Tiger" : "Tie";
          dragonEl.classList.toggle("is-winner", winner === "dragon");
          tigerEl.classList.toggle("is-winner", winner === "tiger");
          let payout = 0;
          if (side === winner) payout = round2(stake * (winner === "tie" ? 9 : 2));
          const mult = payout / stake;
          settle({ game: "dragontiger", bet: stake, mult, payout });
          messageEl.innerHTML = `<strong>${label}</strong> · Dragon ${dragon.rank} · Tiger ${tiger.rank}`;
          messageEl.className = "table-message" + (winner === "tie" ? " is-push" : " is-win");
          ui.setResult(payout > stake ? "win" : payout > 0 ? "push" : "loss", payout > 0 ? fmtMoney(payout) : "—", `${label} · ${dragon.rank} vs ${tiger.rank}`);
          addBead(winner);
          busy = false;
          G.setGameLock(false);
          ui.lockBet(false);
          ui.setAction("Deal again", false);
          sideSeg.querySelectorAll("button").forEach((b) => (b.disabled = false));
        }, 1220));
      }

      ui.action.addEventListener("click", deal);

      window.__wagerxActiveCleanup = () => {
        timers.forEach((t) => window.clearTimeout(t));
        timers = [];
        busy = false;
      };
    },
  };

  /* ============================== VIDEO POKER ============================== */

  const VP_TABLE = [
    { key: "royal", name: "Royal flush", mult: 250 },
    { key: "straightflush", name: "Straight flush", mult: 50 },
    { key: "quads", name: "Four of a kind", mult: 25 },
    { key: "fullhouse", name: "Full house", mult: 9 },
    { key: "flush", name: "Flush", mult: 6 },
    { key: "straight", name: "Straight", mult: 4 },
    { key: "trips", name: "Three of a kind", mult: 3 },
    { key: "twopair", name: "Two pair", mult: 2 },
    { key: "jacks", name: "Jacks or better", mult: 1 },
  ];

  function vpRank(card) {
    if (card.rank === "A") return 14;
    if (card.rank === "K") return 13;
    if (card.rank === "Q") return 12;
    if (card.rank === "J") return 11;
    return Number(card.rank);
  }

  function evaluateVideoPoker(hand) {
    const values = hand.map(vpRank).sort((a, b) => a - b);
    const counts = {};
    values.forEach((v) => (counts[v] = (counts[v] || 0) + 1));
    const groups = Object.values(counts).sort((a, b) => b - a);
    const unique = [...new Set(values)];
    const flush = hand.every((card) => card.suit === hand[0].suit);
    let straight = false;
    if (unique.length === 5) {
      if (unique[4] - unique[0] === 4) straight = true;
      if (unique.join(",") === "2,3,4,5,14") straight = true;
    }
    if (flush && straight && unique[0] === 10 && unique[4] === 14) return VP_TABLE[0];
    if (flush && straight) return VP_TABLE[1];
    if (groups[0] === 4) return VP_TABLE[2];
    if (groups[0] === 3 && groups[1] === 2) return VP_TABLE[3];
    if (flush) return VP_TABLE[4];
    if (straight) return VP_TABLE[5];
    if (groups[0] === 3) return VP_TABLE[6];
    if (groups[0] === 2 && groups[1] === 2) return VP_TABLE[7];
    if (groups[0] === 2) {
      const pairRank = Number(Object.keys(counts).find((v) => counts[v] === 2));
      if (pairRank >= 11) return VP_TABLE[8];
    }
    return { key: "none", name: "No pair", mult: 0 };
  }

  games.videopoker = {
    mount(stage, panel) {
      stage.innerHTML = `${stageTop("Video Poker", "Jacks or better. Hold, then draw", "9/6 paytable")}
        <div class="vp-wrap">
          <div class="vp-hand" id="vpHand"></div>
          <div class="vp-table" id="vpTable">
            ${VP_TABLE.map((row) => `<div data-pay="${row.key}"><span>${row.name}</span><b>${row.mult}×</b></div>`).join("")}
          </div>
          <div class="vp-result" id="vpResult"><span>Deal a hand to begin</span></div>
        </div>
        <div class="stage-foot"><div class="history-chips" id="vpHistory"></div><span>Click cards or HOLD to keep them</span></div>`;

      const ui = betModule(panel, {
        value: 10,
        action: "Deal hand",
        note: "Jacks or better pays 1×. A royal flush pays 250×. Held cards stay; the rest are replaced.",
      });

      const handEl = $("#vpHand", stage);
      const tableEl = $("#vpTable", stage);
      const resultEl = $("#vpResult", stage);
      const historyEl = $("#vpHistory", stage);

      let hand = [];
      let deck = [];
      let held = new Set();
      let phase = "idle";
      let currentBet = 0;
      let timer = 0;

      function render(activeKey = "") {
        const cards = [];
        for (let i = 0; i < 5; i++) {
          const card = hand[i];
          const isHeld = held.has(i);
          cards.push(`<div class="vp-card-wrap${isHeld ? " is-held" : ""}" data-vp-card="${i}">
            ${card ? cardHTML(card) : cardHTML(null, { hidden: true })}
            <button class="vp-hold" type="button" data-vp-hold="${i}" ${phase === "draw" && card ? "" : "disabled"}>${isHeld ? "HELD" : "HOLD"}</button>
          </div>`);
        }
        handEl.innerHTML = cards.join("");
        tableEl.querySelectorAll("[data-pay]").forEach((row) => row.classList.toggle("is-active", row.dataset.pay === activeKey));
      }

      function toggleHold(index) {
        if (phase !== "draw" || !hand[index]) return;
        if (held.has(index)) held.delete(index);
        else held.add(index);
        render();
        sound.tick();
      }

      handEl.addEventListener("click", (e) => {
        const target = e.target.closest("[data-vp-hold]") || e.target.closest("[data-vp-card]");
        if (!target) return;
        toggleHold(Number(target.dataset.vpHold ?? target.dataset.vpCard));
      });

      function deal() {
        if (phase === "draw" || phase === "drawing") return;
        const stake = ui.amount();
        if (!takeStake(stake)) return;
        currentBet = stake;
        const rng = newRng();
        deck = rng.shuffle(makeDeck(1));
        hand = deck.splice(0, 5);
        held.clear();
        phase = "draw";
        G.setGameLock(true);
        ui.lockBet(true);
        ui.clearResult();
        ui.setAction("Draw cards", false);
        resultEl.innerHTML = "<span>Choose the cards you want to keep.</span>";
        render();
        sound.tick();
      }

      function draw() {
        if (phase !== "draw") return;
        phase = "drawing";
        ui.setAction("Drawing…", true);
        for (let i = 0; i < 5; i++) {
          if (!held.has(i)) hand[i] = deck.pop();
        }
        render();
        sound.tick();
        timer = window.setTimeout(() => {
          const result = evaluateVideoPoker(hand);
          const payout = round2(currentBet * result.mult);
          const mult = payout / currentBet;
          settle({ game: "videopoker", bet: currentBet, mult, payout });
          held.clear();
          render(result.mult > 0 ? result.key : "");
          resultEl.innerHTML = result.mult > 0
            ? `<b>${result.name}</b><span>${fmtMoney(payout)} paid · ${fmtMult(mult)}</span>`
            : `<b style="color:#ff7c89">No pair</b><span>Nothing to pay. Deal another hand.</span>`;
          ui.setResult(result.mult > 0 ? "win" : "loss", result.mult > 0 ? fmtMoney(payout) : "—", result.mult > 0 ? `${result.name} · ${fmtMult(mult)}` : "No winning combination");
          pushChip(historyEl, result.mult > 0 ? fmtMult(mult) : "—", result.mult > 0 ? "hchip--win" : "hchip--loss");
          phase = "done";
          G.setGameLock(false);
          ui.lockBet(false);
          ui.setAction("Deal again", false);
        }, 360);
      }

      ui.action.addEventListener("click", () => {
        if (phase === "draw") draw();
        else if (phase === "idle" || phase === "done") deal();
      });

      render();

      window.__wagerxActiveCleanup = () => {
        if (timer) window.clearTimeout(timer);
        phase = "idle";
      };
    },
  };

  /* ============================== HI-LO ============================== */

  function hiloRank(card) {
    if (card.rank === "A") return 14;
    if (card.rank === "K") return 13;
    if (card.rank === "Q") return 12;
    if (card.rank === "J") return 11;
    return Number(card.rank);
  }

  games.hilo = {
    mount(stage, panel) {
      stage.innerHTML = `${stageTop("Hi-Lo", "Call the next card. Build the streak", "3% house edge")}
        <div class="hilo-center">
          <div class="hilo-card-slot">
            <div class="hilo-pulse"></div>
            <div id="hiloCard">${cardHTML(null, { hidden: true, size: "lg" })}</div>
          </div>
          <div class="hilo-mult">
            <div class="big-mult" id="hiloMult">1.00<em>×</em></div>
            <span id="hiloStreak">Place a bet to start</span>
          </div>
          <div class="hilo-chances">
            <div class="hilo-chance hilo-chance--up"><span>Higher</span><b id="hiloHigherChance">—</b></div>
            <div class="hilo-chance hilo-chance--down"><span>Lower</span><b id="hiloLowerChance">—</b></div>
          </div>
        </div>
        <div class="stage-foot"><div class="history-chips" id="hiloHistory"></div><span>A matching rank ends the round</span></div>`;

      const ui = betModule(panel, {
        value: 10,
        action: "Deal card",
        note: "Every correct call multiplies your banked value. Cash out whenever you like; a wrong call or matching rank loses the hand.",
      });
      ui.options.innerHTML = `<div class="btn-row" id="hiloChoices">
        <button class="act-btn act-btn--dark act-btn--sm" type="button" id="hiloHigher" disabled>Higher</button>
        <button class="act-btn act-btn--dark act-btn--sm" type="button" id="hiloLower" disabled>Lower</button>
      </div>`;

      const cardEl = $("#hiloCard", stage);
      const multEl = $("#hiloMult", stage);
      const streakEl = $("#hiloStreak", stage);
      const higherChanceEl = $("#hiloHigherChance", stage);
      const lowerChanceEl = $("#hiloLowerChance", stage);
      const historyEl = $("#hiloHistory", stage);
      const higherBtn = $("#hiloHigher", panel);
      const lowerBtn = $("#hiloLower", panel);

      let shoe = [];
      let current = null;
      let currentMult = 1;
      let streak = 0;
      let bet = 0;
      let phase = "idle";
      let busy = false;
      let note = "Place a bet to start";

      function odds() {
        const value = hiloRank(current);
        let higher = 0;
        let lower = 0;
        for (const card of shoe) {
          const rank = hiloRank(card);
          if (rank > value) higher++;
          else if (rank < value) lower++;
        }
        const remaining = shoe.length || 1;
        return {
          higher,
          lower,
          pHigher: higher / remaining,
          pLower: lower / remaining,
          multHigher: higher ? (0.97 * remaining) / higher : 0,
          multLower: lower ? (0.97 * remaining) / lower : 0,
        };
      }

      function renderOdds() {
        if (!current) {
          higherChanceEl.textContent = "—";
          lowerChanceEl.textContent = "—";
          higherBtn.disabled = true;
          lowerBtn.disabled = true;
          return;
        }
        const o = odds();
        higherChanceEl.textContent = o.higher ? `${(o.pHigher * 100).toFixed(1)}%` : "—";
        lowerChanceEl.textContent = o.lower ? `${(o.pLower * 100).toFixed(1)}%` : "—";
        higherBtn.innerHTML = o.higher ? `Higher <span style="opacity:.65;font-size:9px">${(o.pHigher * 100).toFixed(0)}%</span>` : "Higher —";
        lowerBtn.innerHTML = o.lower ? `Lower <span style="opacity:.65;font-size:9px">${(o.pLower * 100).toFixed(0)}%</span>` : "Lower —";
        higherBtn.disabled = phase !== "guess" || busy || !o.higher;
        lowerBtn.disabled = phase !== "guess" || busy || !o.lower;
      }

      function render() {
        cardEl.innerHTML = current ? cardHTML(current, { size: "lg" }) : cardHTML(null, { hidden: true, size: "lg" });
        multEl.innerHTML = `${currentMult >= 100 ? Math.round(currentMult) : currentMult.toFixed(2)}<em>×</em>`;
        streakEl.textContent = note;
        renderOdds();
      }

      function unlock() {
        phase = "done";
        busy = false;
        G.setGameLock(false);
        ui.lockBet(false);
        ui.setAction("Deal again", false);
        renderOdds();
      }

      function deal() {
        if (busy || phase === "guess") return;
        const stake = ui.amount();
        if (!takeStake(stake)) return;
        bet = stake;
        const rng = newRng();
        shoe = rng.shuffle(makeDeck(1));
        current = shoe.pop();
        currentMult = 1;
        streak = 0;
        note = "Call higher or lower";
        phase = "guess";
        busy = false;
        G.setGameLock(true);
        ui.lockBet(true);
        ui.clearResult();
        ui.setAction("Pick a side", true);
        render();
        sound.tick();
      }

      function call(side) {
        if (phase !== "guess" || busy || !current) return;
        busy = true;
        renderOdds();
        const o = odds();
        const chosen = side === "higher" ? o.higher : o.lower;
        if (!chosen) {
          busy = false;
          renderOdds();
          return;
        }
        const fair = side === "higher" ? o.multHigher : o.multLower;
        const next = shoe.pop();
        const nextRank = hiloRank(next);
        const rank = hiloRank(current);
        sound.tick();

        if (nextRank === rank) {
          settle({ game: "hilo", bet, mult: 0, payout: 0, note: "Matching rank" });
          current = next;
          currentMult = 0;
          note = `Matching ${next.rank}. The hand is over.`;
          ui.setResult("loss", "—", `Matching ${next.rank} · the streak ends`);
          pushChip(historyEl, "TIE", "hchip--loss");
          unlock();
          render();
          return;
        }

        const correct = side === "higher" ? nextRank > rank : nextRank < rank;
        if (!correct) {
          settle({ game: "hilo", bet, mult: 0, payout: 0, note: `Wrong ${side}` });
          current = next;
          currentMult = 0;
          note = `${next.rank} went the other way. The hand is over.`;
          ui.setResult("loss", "—", `${next.rank} went ${side === "higher" ? "lower" : "higher"}`);
          pushChip(historyEl, "LOSS", "hchip--loss");
          unlock();
          render();
          return;
        }

        currentMult = currentMult * fair;
        streak++;
        current = next;
        busy = false;
        note = `${streak} correct call${streak === 1 ? "" : "s"} · cash out or keep going`;
        ui.setAction(`Cash out ${fmtMoney(bet * currentMult)}`, false);
        ui.clearResult();
        render();
      }

      function cashOut() {
        if (phase !== "guess" || busy || streak === 0) return;
        const payout = round2(bet * currentMult);
        settle({ game: "hilo", bet, mult: currentMult, payout });
        note = `Cashed out ${fmtMoney(payout)} after ${streak} call${streak === 1 ? "" : "s"}.`;
        ui.setResult("win", fmtMoney(payout), `${streak} calls · ${fmtMult(currentMult)}`);
        pushChip(historyEl, fmtMult(currentMult), "hchip--win");
        unlock();
        render();
      }

      ui.action.addEventListener("click", () => {
        if (phase === "guess" && streak > 0) cashOut();
        else if (phase !== "guess") deal();
      });
      higherBtn.addEventListener("click", () => call("higher"));
      lowerBtn.addEventListener("click", () => call("lower"));

      render();

      window.__wagerxActiveCleanup = () => {
        phase = "idle";
        busy = false;
      };
    },
  };

  /* ============================== SLOTS ============================== */

  const SLOT_SYMBOLS = [
    { key: "diamond", glyph: "◆", weight: 7, pay: 55 },
    { key: "seven", glyph: "7", weight: 11, pay: 20 },
    { key: "spade", glyph: "♠", weight: 13, pay: 10 },
    { key: "club", glyph: "♣", weight: 17, pay: 6 },
    { key: "heart", glyph: "♥", weight: 22, pay: 4 },
    { key: "star", glyph: "★", weight: 30, pay: 2 },
  ];
  const SLOT_LINES = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  games.slots = {
    mount(stage, panel) {
      stage.innerHTML = `${stageTop("Slots", "Three reels. Five lines. Six symbols", "96.8% RTP")}
        <div class="slots-machine">
          <div class="slots-reels" id="slotReels"></div>
          <div class="slots-bar"><span>5 lines · 3 reels · 3 of a kind</span><b id="slotPayout">Ready</b></div>
          <div class="slots-paytable">
            ${SLOT_SYMBOLS.map((s) => `<span><b style="color:${s.key === "diamond" ? "#7de8ff" : s.key === "seven" ? "#ff6b9d" : s.key === "spade" ? "#b7a6ff" : s.key === "club" ? "#86efac" : s.key === "heart" ? "#ff6b78" : "#ffd166"}">${s.glyph}${s.glyph}${s.glyph}</b> ${s.pay}×</span>`).join("")}
          </div>
        </div>
        <div class="stage-foot"><div class="history-chips" id="slotHistory"></div><span>Winning lines pay on the total bet</span></div>`;

      const ui = betModule(panel, {
        value: 10,
        action: "Spin reels",
        note: "Five lines run across and through the grid. Any three matching symbols on a line pay the table.",
      });

      const reelsEl = $("#slotReels", stage);
      const payoutEl = $("#slotPayout", stage);
      const historyEl = $("#slotHistory", stage);
      const cells = [];
      for (let i = 0; i < 9; i++) {
        const cell = document.createElement("div");
        cell.className = "slot-cell";
        reelsEl.appendChild(cell);
        cells.push(cell);
      }

      const initial = ["star", "heart", "club", "seven", "star", "diamond", "spade", "club", "heart"];
      let grid = initial.map((key) => SLOT_SYMBOLS.find((s) => s.key === key));
      let spinning = false;
      let spinTimer = 0;
      let tickTimer = 0;
      let stopTimers = [];

      function paintCell(cell, symbol) {
        cell.textContent = symbol.glyph;
        cell.dataset.sym = symbol.key;
      }

      function paintGrid(values) {
        values.forEach((symbol, i) => paintCell(cells[i], symbol));
      }

      function evaluate() {
        const wins = [];
        let total = 0;
        const winningCells = new Set();
        SLOT_LINES.forEach((line) => {
          const first = grid[line[0]];
          if (grid[line[1]].key === first.key && grid[line[2]].key === first.key) {
            wins.push(first);
            total += first.pay;
            line.forEach((i) => winningCells.add(i));
          }
        });
        winningCells.forEach((i) => cells[i].classList.add("is-win"));
        return { wins, total, winningCells };
      }

      function spin() {
        if (spinning) return;
        const bet = ui.amount();
        if (!takeStake(bet)) return;
        spinning = true;
        G.setGameLock(true);
        ui.lockBet(true);
        ui.setAction("Spinning…", true);
        ui.clearResult();
        payoutEl.textContent = "…";
        cells.forEach((cell) => {
          cell.classList.remove("is-win");
          cell.classList.add("is-spinning");
        });

        const rng = newRng();
        grid = Array.from({ length: 9 }, () => G.weightedPick(rng, SLOT_SYMBOLS));
        const stopped = [false, false, false];
        const finalGrid = grid.slice();
        tickTimer = window.setInterval(() => {
          for (let col = 0; col < 3; col++) {
            if (stopped[col]) continue;
            for (let row = 0; row < 3; row++) {
              paintCell(cells[row * 3 + col], G.weightedPick(rng, SLOT_SYMBOLS));
            }
          }
        }, 70);

        [520, 760, 1000].forEach((delay, col) => {
          stopTimers.push(window.setTimeout(() => {
            stopped[col] = true;
            for (let row = 0; row < 3; row++) {
              const index = row * 3 + col;
              paintCell(cells[index], finalGrid[index]);
              cells[index].classList.remove("is-spinning");
            }
            sound.tick();
          }, delay));
        });

        spinTimer = window.setTimeout(() => {
          window.clearInterval(tickTimer);
          tickTimer = 0;
          const result = evaluate();
          const payout = round2(bet * result.total);
          const mult = payout / bet;
          settle({ game: "slots", bet, mult, payout });
          if (result.total > 0) {
            const names = [...new Set(result.wins.map((s) => s.glyph))].join(" ");
            payoutEl.textContent = fmtMoney(payout);
            ui.setResult("win", fmtMoney(payout), `${result.wins.length} line${result.wins.length === 1 ? "" : "s"} · ${names} · ${fmtMult(mult)}`);
            pushChip(historyEl, fmtMult(mult), "hchip--win");
          } else {
            payoutEl.textContent = "No line";
            ui.setResult("loss", "—", "No three of a kind on a line");
            pushChip(historyEl, "—", "hchip--loss");
          }
          spinning = false;
          G.setGameLock(false);
          ui.lockBet(false);
          ui.setAction("Spin again", false);
        }, 1210);
      }

      ui.action.addEventListener("click", spin);
      paintGrid(grid);

      window.__wagerxActiveCleanup = () => {
        spinning = false;
        if (spinTimer) window.clearTimeout(spinTimer);
        if (tickTimer) window.clearInterval(tickTimer);
        stopTimers.forEach((t) => window.clearTimeout(t));
        stopTimers = [];
      };
    },
  };

  G.registerGames(games);
})();
