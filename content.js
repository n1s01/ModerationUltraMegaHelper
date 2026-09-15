(() => {
  "use strict";

  const MINIMUM_SYMPATHIES = 200;

  // ренжи
  const SYMPATHY_GROUPS = [
    { from: 0, to: 19, name: "Новорег" },
    { from: 20, to: 199, name: "Местный" },
    { from: 200, to: 999, name: "Постоялец" },
    { from: 1_000, to: 3_999, name: "Эксперт" },
    { from: 4_000, to: 9_999, name: "Гуру" },
    { from: 10_000, to: 111_110, name: "Искусственный интеллект" },
    { from: 111_111, to: Infinity, name: "Величайший" }
  ];

  // классы для покупных групп
  const STYLE_GROUPS = new Map([
    ["style8", "Суприм"],
    ["style11", "Продавец"],
    ["style26", "Легенда"]
  ]);

  const RESTRICTED_FORUMS = new Set([
    "1001", "1003", "1007", "1014", "1039", "104", "105", "1073", "1077", "1081",
    "1085", "263", "345", "381", "431", "593", "595", "596", "597", "664", "671",
    "682", "683", "685", "688", "689", "690", "720", "726", "728", "729", "733",
    "763", "784", "785", "800", "805", "806", "810", "814", "815", "816", "817",
    "828", "834", "839", "841", "844", "846", "852", "855", "858", "863", "868",
    "898", "900", "901", "908", "909", "910", "912", "913", "915", "919", "925",
    "927", "929", "932", "936", "947", "948", "962", "975",
    "design", "escapefromtarkov", "origin", "psn", "steam", "supercell", "uplay", "warface"
  ]);

  const FORUM_LINK_SELECTOR = '#pageDescription a[href*="forums/"]';
  const AUTHOR_SELECTOR = ".userText > .item > a.username.poster";

  function getForumKey() {
    const forumLink = document.querySelector(FORUM_LINK_SELECTOR);
    if (!forumLink) return null;

    const pathname = new URL(forumLink.getAttribute("href"), location.origin).pathname;
    return pathname.match(/forums\/([^/]+)/)?.[1] ?? null;
  }

  function shouldCheckThread() {
    const forumKey = getForumKey();
    if (!forumKey) return false;

    return RESTRICTED_FORUMS.has(forumKey);
  }

  function getSympathyGroup(sympathies) {
    return SYMPATHY_GROUPS.find(({ from, to }) =>
      sympathies >= from && sympathies <= to
    ) ?? null;
  }

  function getStyleGroup(username) {
    const nickname = username.querySelector(".styleUserNickname");
    if (!nickname) return null;

    const styleClass = [...nickname.classList].find((className) =>
      /^style\d+$/.test(className)
    );

    return styleClass ? STYLE_GROUPS.get(styleClass) ?? null : null;
  }

  function hasUniqueIcon(username) {
    return Boolean(username.querySelector(".uniqUsernameIcon--custom"));
  }

  function getSympathies(post) {
    const counter = post.querySelector(
      ".userCounters .userCounter:not(.userCounter--registerDate)"
    );

    if (!counter?.querySelector(".fa-heart")) return null;

    const value = Number(counter.textContent.replace(/[^\d]/g, ""));
    return Number.isFinite(value) ? value : null;
  }

  function createLoader(post) {
    const username = post.querySelector(AUTHOR_SELECTOR);
    if (!username || post.querySelector(".lolz-publication-loader")) return false;

    const loader = document.createElement("span");
    loader.className = "lolz-publication-loader";
    loader.title = "Проверяем право публикации…";
    loader.setAttribute("aria-label", "Проверяем право публикации");
    username.after(loader);
    return true;
  }

  function renderDecision(post, decision) {
    const username = post.querySelector(AUTHOR_SELECTOR);
    if (!username) return;

    const status = document.createElement("span");
    status.className = `lolz-publication-status lolz-publication-status--${decision.allowed ? "allowed" : "denied"}`;
    status.textContent = decision.allowed
      ? "✓ Публикация разрешена"
      : "✕ Публикация запрещена";
    status.title = `Группа: ${decision.group}`;
    post.querySelector(".lolz-publication-loader")?.remove();
    username.after(status);
    post.dataset.lolzPublicationChecked = "true";
  }

  function inspectFirstPost() {
    const post = document.querySelector("li.message.firstPost");
    if (!post || post.dataset.lolzPublicationChecked === "true") return;
    if (post.dataset.lolzPublicationLoading === "true") return;

    if (!shouldCheckThread()) return;

    if (createLoader(post)) {
      post.dataset.lolzPublicationLoading = "true";

      window.setTimeout(() => {
        delete post.dataset.lolzPublicationLoading;
        inspectFirstPost();
      }, 150);
      return;
    }

    const username = post.querySelector(AUTHOR_SELECTOR);
    if (!username) return;

    const styleGroup = getStyleGroup(username);
    if (styleGroup) {
      renderDecision(post, { allowed: true, group: styleGroup });
      return;
    }

    if (hasUniqueIcon(username)) {
      renderDecision(post, { allowed: true, group: "Уник" });
      return;
    }

    const sympathies = getSympathies(post);
    if (sympathies === null) return;

    renderDecision(post, {
      allowed: sympathies >= MINIMUM_SYMPATHIES,
      group: getSympathyGroup(sympathies)?.name ?? "не определена"
    });
  }

  inspectFirstPost();
})();
