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

  // эти топики вне правил
  const EXCLUDED_FORUMS = new Set([
    "381", // оценка товара
    "832" // ищу работу (напишите мне)
  ]);

  const FORUM_LINK_SELECTOR = '#pageDescription a[href*="forums/"]';
  const AUTHOR_SELECTOR = ".userText > .item > a.username.poster";
  const PURCHASE_PREFIX_SELECTOR = ".prefixThreadGroup .prefix.ts_buy, .prefixThreadGroup .prefix.ts_mass_buy";

  let observer = null;

  function getForumKey() {
    const forumLink = document.querySelector(FORUM_LINK_SELECTOR);
    if (!forumLink) return null;

    const pathname = new URL(forumLink.getAttribute("href"), location.origin).pathname;
    return pathname.match(/forums\/([^/]+)/)?.[1] ?? null;
  }

  function shouldCheckThread() {
    const forumKey = getForumKey();
    if (!forumKey || EXCLUDED_FORUMS.has(forumKey)) return false;

    return RESTRICTED_FORUMS.has(forumKey) && !document.querySelector(PURCHASE_PREFIX_SELECTOR);
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

  function getPublicationDecision(post) {
    const username = post.querySelector(AUTHOR_SELECTOR);
    if (!username) return null;

    const styleGroup = getStyleGroup(username);
    if (styleGroup) {
      return {
        allowed: true,
        group: styleGroup,
        reason: "распознана привилегия по стилю ника"
      };
    }

    if (hasUniqueIcon(username)) {
      return {
        allowed: true,
        group: "Уник",
        reason: "распознана кастомная иконка ника"
      };
    }

    const sympathies = getSympathies(post);
    if (sympathies === null) return null;

    const group = getSympathyGroup(sympathies);
    return {
      allowed: sympathies >= MINIMUM_SYMPATHIES,
      group: group?.name ?? "не определена",
      sympathies,
      reason: sympathies >= MINIMUM_SYMPATHIES
        ? `достаточно симпатий: минимум ${MINIMUM_SYMPATHIES.toLocaleString("ru-RU")}`
        : `нужно минимум ${MINIMUM_SYMPATHIES.toLocaleString("ru-RU")} симпатий`
    };
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

    const details = [
      `Группа: ${decision.group}`,
      decision.sympathies === undefined
        ? "Симпатии: не проверялись"
        : `Симпатии: ${decision.sympathies.toLocaleString("ru-RU")}`,
      `Основание: ${decision.reason}`
    ];

    status.title = details.join("\n");
    post.querySelector(".lolz-publication-loader")?.remove();
    username.after(status);
    post.dataset.lolzPublicationChecked = "true";
  }

  function inspectFirstPost() {
    const post = document.querySelector("li.message.firstPost");
    if (!post || post.dataset.lolzPublicationChecked === "true") return;
    if (post.dataset.lolzPublicationLoading === "true") return;

    if (createLoader(post)) {
      post.dataset.lolzPublicationLoading = "true";

      window.setTimeout(() => {
        delete post.dataset.lolzPublicationLoading;
        inspectFirstPost();
      }, 150);
      return;
    }

    const decision = getPublicationDecision(post);
    if (decision) renderDecision(post, decision);
  }

  function activate() {
    if (!document.querySelector(FORUM_LINK_SELECTOR)) return;

    activationObserver.disconnect();
    observer?.disconnect();
    observer = null;

    if (!shouldCheckThread()) return;

    observer = new MutationObserver(inspectFirstPost);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    inspectFirstPost();
  }

  const activationObserver = new MutationObserver(activate);
  activationObserver.observe(document.documentElement, { childList: true, subtree: true });
  activate();
})();
