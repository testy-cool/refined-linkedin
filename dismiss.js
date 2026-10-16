// "Dismiss the 7 grey jobs" above a job list clicks LinkedIn's own × on every grey card in it (issue #55): jobs seen,
// and jobs the pop-up's Grey out switches and lists catch. LinkedIn then stops recommending them. The open job, saved
// jobs and jobs already dismissed are left alone. content.js hands over the list's cards each time it paints them.
(() => {
  const GAP_MS = 600; // between two clicks, so they reach LinkedIn one at a time, as a person's would
  // What a card says once dismissed: "We won't show you this job again" on the classic list, "We won't recommend
  // this job anymore" on the new search page.
  const DISMISSED = /We won.t (show you this job again|recommend this job anymore)/;

  let cards = []; // [{el, id, item, open}], item being what holds the card in the list
  let bar = null;
  let run = null; // {done, total, stop, end}

  // LinkedIn's own lines on a card, leaving out the ones this extension adds.
  const says = (el, re) => [...el.querySelectorAll("p, li, span")]
    .some((e) => !e.children.length && !e.closest(".jfold-slot, .rl-ui") && re.test(e.textContent.trim()));
  const cross = (el) => el.querySelector('button[aria-label^="Dismiss "][aria-label$=" job"]');
  const grey = (el) => el.classList.contains("jfold-seen") || el.classList.contains("jfold-off");
  // A classic card scrolled far off has no × until LinkedIn draws it; it still counts, and is drawn when its turn comes.
  const due = (c) => !c.open && c.el.isConnected && grey(c.el) && !says(c.el, DISMISSED) && !says(c.el, /^Saved$/);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function tick(list) {
    cards = list;
    draw();
  }

  function link(text, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "rl-link";
    b.textContent = text;
    b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    return b;
  }

  function draw() {
    // "Dismissed 7 jobs" stays five seconds.
    if (run?.end && Date.now() - run.end >= 5000) run = null;
    const first = cards.find((c) => c.el.isConnected && c.item.parentElement);
    const n = cards.filter(due).length;
    if (!first || (!run && !n)) { bar?.remove(); bar = null; return; }
    const sig = run ? `${run.done}/${run.total}/${!!run.end}/${run.stop}` : `n${n}`;
    const list = first.item.parentElement;
    if (bar?.dataset.sig === sig && bar.isConnected && bar.nextElementSibling === list) return;
    bar?.remove();
    bar = document.createElement("div");
    bar.className = "rl-dismiss-bar rl-ui";
    bar.dataset.sig = sig;
    if (!run) {
      bar.append(link(`Dismiss the ${n} grey job${n === 1 ? "" : "s"}`, dismissAll));
      const hint = document.createElement("span");
      hint.className = "rl-hint";
      hint.textContent = "LinkedIn stops recommending them";
      bar.append(hint);
    } else if (!run.end) {
      const s = document.createElement("span");
      s.textContent = `Dismissing ${run.done} of ${run.total}`;
      bar.append(s, link("Stop", () => { run.stop = true; }));
    } else {
      const s = document.createElement("span");
      s.textContent = `Dismissed ${run.done} job${run.done === 1 ? "" : "s"}`;
      bar.append(s);
    }
    list.before(bar);
  }

  async function dismissAll() {
    const ids = cards.filter(due).map((c) => c.id);
    run = { done: 0, total: ids.length, stop: false, end: 0 };
    draw();
    // The card as content.js last painted it: LinkedIn may have drawn it anew, and it may have been opened, saved or
    // turned white since the click.
    const now = (id) => {
      const c = cards.find((k) => k.id === id);
      return !run.stop && c && due(c) && self.RL?.openJob()?.id !== id ? c : null;
    };
    for (const id of ids) {
      if (run.stop) break;
      let c = now(id);
      for (let t = 0; c && !cross(c.el) && t < 10 && !run.stop; t++) {
        if (!t) c.el.scrollIntoView({ block: "nearest" });
        await sleep(200);
        c = now(id);
      }
      if (run.stop) break;
      const x = c && cross(c.el);
      if (!x) { run.total--; draw(); continue; }
      x.click();
      run.done++;
      draw();
      await sleep(GAP_MS);
    }
    run.end = Date.now();
    draw();
    setTimeout(draw, 5100);
  }

  self.RLDismiss = { tick, DISMISSED };
})();
