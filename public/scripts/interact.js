// Post-page interactions: likes, bookmarks, comments (anonymous ones with proof of work), replies, reports.
// Labels come from data-* attributes on <body>; the page works read-only without this script.
(() => {
  const d = document;
  const labels = d.body.dataset;
  const api = (path, method, body) =>
    fetch(path, {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  const toast = (text) => {
    const el = d.createElement("div");
    el.className = "ni-toast";
    el.setAttribute("role", "status");
    el.textContent = text;
    d.body.append(el);
    setTimeout(() => el.remove(), 2600);
  };

  // ---- likes (post buttons appear twice: action row + phone bar) ----
  for (const btn of d.querySelectorAll("button[data-like]")) {
    btn.addEventListener("click", async () => {
      const { like, id } = btn.dataset;
      const twins = d.querySelectorAll(`button[data-like="${like}"][data-id="${id}"]`);
      const next = btn.getAttribute("aria-pressed") !== "true";
      const path = like === "post" ? `/api/v1/p/${id}/like` : `/api/v1/comments/${id}/like`;
      twins.forEach((b) => (b.disabled = true));
      try {
        const res = await api(path, next ? "POST" : "DELETE");
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        twins.forEach((b) => {
          b.setAttribute("aria-pressed", String(data.liked));
          b.querySelector("span").textContent = data.likeCount || (like === "post" ? "0" : "");
        });
      } catch {
        toast(labels.commentErrorLabel || "");
      } finally {
        twins.forEach((b) => (b.disabled = false));
      }
    });
  }

  // ---- reposts (signed in; menu form Repost / Undo repost, sent in place; twice on post pages) ----
  for (const form of d.querySelectorAll("form[data-repost]")) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const slug = form.dataset.repost;
      const menus = [...d.querySelectorAll("details[data-repost-menu]")].filter((m) => m.dataset.repostMenu === slug);
      const buttons = menus.map((m) => m.querySelector("form[data-repost] button"));
      buttons.forEach((b) => (b.disabled = true));
      try {
        const res = await fetch(form.action, { method: "POST", body: new FormData(form), credentials: "same-origin", headers: { Accept: "application/json" } });
        if (res.status === 401) {
          location.href = new URL(`/auth/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`, location.href).href;
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        for (const m of menus) {
          m.open = false;
          m.toggleAttribute("data-reposted", data.reposted);
          m.querySelector("[data-repost-count]").textContent = String(data.repostCount);
          m.querySelector('form[data-repost] input[name="on"]').value = data.reposted ? "0" : "1";
          const b = m.querySelector("form[data-repost] button");
          b.querySelector("span").textContent = data.reposted ? b.dataset.offLabel : b.dataset.onLabel;
        }
      } catch {
        toast(labels.commentErrorLabel || "");
      } finally {
        buttons.forEach((b) => (b.disabled = false));
      }
    });
  }

  // ---- bookmarks (signed in; post buttons appear twice on post pages: action row + phone bar) ----
  for (const btn of d.querySelectorAll("button[data-bookmark]")) {
    btn.addEventListener("click", async () => {
      const slug = btn.dataset.bookmark;
      const twins = d.querySelectorAll(`button[data-bookmark="${slug}"]`);
      const next = btn.getAttribute("aria-pressed") !== "true";
      twins.forEach((b) => (b.disabled = true));
      try {
        const res = await api(`/api/v1/p/${slug}/bookmark`, next ? "POST" : "DELETE");
        // Signed out meanwhile: sign in and come back.
        if (res.status === 401) {
          location.href = new URL(`/auth/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`, location.href).href;
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        twins.forEach((b) => {
          b.setAttribute("aria-pressed", String(data.bookmarked));
          b.querySelector("span").textContent = String(data.bookmarkCount);
        });
      } catch {
        toast(labels.commentErrorLabel || "");
      } finally {
        twins.forEach((b) => (b.disabled = false));
      }
    });
  }

  // ---- SHA-256 (sync, for the proof of work) ----
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const W = new Uint32Array(64);
  // First 32 bits of sha256(ascii) — enough to count leading zero bits (≤ 24).
  const sha256Head = (str) => {
    const n = str.length;
    const words = new Uint32Array(((n + 9 + 63) >> 6) << 4);
    for (let i = 0; i < n; i++) words[i >> 2] |= str.charCodeAt(i) << (24 - (i & 3) * 8);
    words[n >> 2] |= 0x80 << (24 - (n & 3) * 8);
    words[words.length - 1] = n * 8;
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    for (let off = 0; off < words.length; off += 16) {
      for (let i = 0; i < 64; i++) {
        if (i < 16) W[i] = words[off + i];
        else {
          const a = W[i - 15], b = W[i - 2];
          W[i] = (W[i - 16] + (((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)) + W[i - 7] + (((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10))) | 0;
        }
      }
      let a = h0, b = h1, c = h2, e = h4, f = h5, g = h6, h = h7, dd = h3;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
        const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (dd + t1) | 0; dd = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + dd) | 0; h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }
    return h0 >>> 0;
  };
  const solve = async (challenge, bits) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    for (let n = 0; ; n++) {
      if ((sha256Head(`${challenge}:${n.toString(36)}`) & mask) === 0) return n.toString(36);
      if (n % 20000 === 19999) await new Promise((r) => setTimeout(r)); // keep the page responsive
    }
  };

  // ---- comments ----
  const form = d.querySelector("form.ni-composer");
  if (form) {
    const replyBox = form.querySelector(".ni-reply-to");
    const errorBox = form.querySelector(".ni-form-error");
    let parentId = null;
    const showError = (text) => { errorBox.textContent = text; errorBox.hidden = false; };
    for (const btn of d.querySelectorAll("button[data-reply]")) {
      btn.addEventListener("click", () => {
        parentId = btn.dataset.reply;
        replyBox.querySelector("span").textContent = (labels.replyToLabel || "").replace("{name}", btn.dataset.name || "");
        replyBox.hidden = false;
        form.scrollIntoView({ block: "center" });
        form.body.focus();
      });
    }
    replyBox.querySelector("button").addEventListener("click", () => { parentId = null; replyBox.hidden = true; });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorBox.hidden = true;
      const body = form.body.value.trim();
      if (!body) return form.body.focus();
      const submit = form.querySelector("button[type=submit]");
      submit.disabled = true;
      try {
        const slug = form.dataset.slug;
        // Signed in: the comment is the account's (no nickname, no proof of work).
        const payload = { body, parentId: parentId || undefined };
        if (!("account" in form.dataset)) {
          const ch = await (await api(`/api/v1/p/${slug}/comments/challenge`, "GET")).json();
          Object.assign(payload, { name: form.elements.name.value.trim() || undefined, challenge: ch.challenge, nonce: await solve(ch.challenge, ch.bits) });
        }
        const res = await api(`/api/v1/p/${slug}/comments`, "POST", payload);
        if (res.status === 429) return showError(labels.rateLimitedLabel || "");
        if (!res.ok) return showError(labels.commentErrorLabel || "");
        const { comment, page } = await res.json();
        const url = new URL(location.href);
        if (page > 1) url.searchParams.set("cpage", String(page)); else url.searchParams.delete("cpage");
        url.hash = `c-${comment.id}`;
        location.replace(url.toString());
        if (url.pathname + url.search === location.pathname + location.search) location.reload();
      } catch {
        showError(labels.commentErrorLabel || "");
      } finally {
        submit.disabled = false;
      }
    });
  }
  const target = location.hash.startsWith("#c-") && d.getElementById(location.hash.slice(1));
  if (target) target.classList.add("ni-new");

  // ---- reports ----
  const dialog = d.getElementById("ni-report");
  if (dialog && typeof dialog.showModal === "function") {
    let commentId = null;
    for (const btn of d.querySelectorAll("button[data-report]")) {
      btn.addEventListener("click", () => { commentId = btn.dataset.report || null; dialog.showModal(); });
    }
    dialog.querySelector("button[value=cancel]").addEventListener("click", () => dialog.close());
    dialog.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const reason = dialog.querySelector("input[name=reason]:checked").value;
      dialog.close();
      const res = await api("/api/v1/reports", "POST", { slug: dialog.dataset.slug, commentId: commentId || undefined, reason }).catch(() => null);
      toast(res && res.ok ? labels.reportDoneLabel || "" : labels.commentErrorLabel || "");
    });
  }
})();
