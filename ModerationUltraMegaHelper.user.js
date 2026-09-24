// ==UserScript==
// @name         ModerationUltraMegaHelper
// @namespace    https://lolz.team/
// @version      68.3.0
// @description  Показывает, может ли автор опубликовать тему в выбранных разделах.
// @match        https://lolz.team/forums/*
// @match        https://lolz.team/threads/*
// @match        https://zelenka.guru/forums/*
// @match        https://zelenka.guru/threads/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(() => {
  "use strict";

  const MINIMUM_SYMPATHIES = 200;
  const LIST_CHECK_SETTING = "checkForumLists";
  const checkForumLists = GM_getValue(LIST_CHECK_SETTING, true);
  const LIST_TOGGLE_ID = "lolz-publication-list-toggle";

  const SYMPATHY_GROUPS = [
    { from: 0, to: 19, name: "Новорег" },
    { from: 20, to: 199, name: "Местный" },
    { from: 200, to: 999, name: "Постоялец" },
    { from: 1_000, to: 3_999, name: "Эксперт" },
    { from: 4_000, to: 9_999, name: "Гуру" },
    { from: 10_000, to: 111_110, name: "Искусственный интеллект" },
    { from: 111_111, to: Infinity, name: "Величайший" }
  ];

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

  const EXCLUDED_FORUMS = new Set(["381", "832"]);
  const FORUM_LINK_SELECTOR = '#pageDescription a[href*="forums/"]';
  const AUTHOR_SELECTOR = ".userText > .item > a.username.poster";
  const PURCHASE_PREFIX_SELECTOR = ".prefixThreadGroup .prefix.ts_buy, .prefixThreadGroup .prefix.ts_mass_buy";
  const LIST_ROW_SELECTOR = ".DiscussionList .discussionListItems .discussionListItem[id^='thread-']";
  const LIST_AUTHOR_SELECTOR = ".listBlock.main .threadCreator[data-href]";
  const LIST_PURCHASE_PREFIX_SELECTOR = ".threadTitle--prefixGroup .ts_buy, .threadTitle--prefixGroup .ts_mass_buy";
  const CUSTOM_BADGE_SELECTOR = ".profilePage .avatarScaler > em.userBanner.wrapped[itemprop='title'] > strong, .profilePage .userBannersBlock > em.userBanner.wrapped[itemprop='title'] > strong";
  const LIST_LOAD_MARGIN = "500px 0px";
  const profileRequests = new Map();
  const requestQueue = [];
  let activeRequests = 0;
  let listVisibilityObserver = null;

  const STYLES = `
    .lolz-publication-status {
      display: inline-block;
      margin-left: 6px;
      padding: 1px 6px;
      border-radius: 8px;
      font-size: 10px;
      font-weight: 700;
      line-height: 16px;
      vertical-align: middle;
      white-space: nowrap;
      pointer-events: none;
    }
    .lolz-publication-loader {
      display: inline-block;
      box-sizing: border-box;
      width: 12px;
      height: 12px;
      margin-left: 7px;
      border: 2px solid rgba(148, 163, 184, 0.3);
      border-top-color: #e2e8f0;
      border-radius: 50%;
      animation: lolz-publication-spin 700ms linear infinite;
      vertical-align: -1px;
      pointer-events: none;
    }
    @keyframes lolz-publication-spin {
      to { transform: rotate(360deg); }
    }
    .lolz-publication-status--allowed {
      background: #14532d;
      color: #bbf7d0;
    }
    .lolz-publication-status--denied {
      background: #7f1d1d;
      color: #fecaca;
    }
  `;

  function log(message, details) {
    if (details === undefined) {
      console.info(`[ModerationUltraMegaHelper] ${message}`);
    } else {
      console.info(`[ModerationUltraMegaHelper] ${message}`, details);
    }
  }

  function getForumKey(doc = document) {
    const forumLink = doc.querySelector(FORUM_LINK_SELECTOR);
    if (!forumLink) return null;

    const pathname = new URL(forumLink.getAttribute("href"), location.origin).pathname;
    return getForumKeyFromPath(pathname);
  }

  function getForumKeyFromPath(pathname) {
    const segment = pathname.match(/^\/forums\/([^/]+)/)?.[1];
    if (!segment) return null;
    return segment.match(/(?:^|\.)(\d+)$/)?.[1] ?? segment;
  }

  function isRestrictedForum(forumKey) {
    return Boolean(forumKey && RESTRICTED_FORUMS.has(forumKey) && !EXCLUDED_FORUMS.has(forumKey));
  }

  function shouldCheckThread() {
    const forumKey = getForumKey();
    return Boolean(
      isRestrictedForum(forumKey) &&
      !document.querySelector(PURCHASE_PREFIX_SELECTOR)
    );
  }

  function getStyleGroup(username) {
    const nickname = username.querySelector(".styleUserNickname");
    if (!nickname) return null;

    const styleClass = [...nickname.classList].find((className) => /^style\d+$/.test(className));
    return STYLE_GROUPS.get(styleClass) ?? null;
  }

  function getSympathies(post) {
    const counters = post.querySelectorAll(
      ".userCounters .userCounter:not(.userCounter--registerDate)"
    );
    const counter = [...counters].find((item) => item.querySelector(".fa-heart"));
    if (!counter) return null;

    return parseCount(counter.textContent);
  }

  function parseCount(value) {
    const text = value.trim();
    const compact = text.match(/^([\d\s\u00a0\u202f]+)(?:[,.](\d+))?\s*([kкmм])$/i);
    if (compact) {
      const whole = compact[1].replace(/\D/g, "");
      const multiplier = /[mм]/i.test(compact[3]) ? 1_000_000 : 1_000;
      return Math.floor(Number(`${whole}.${compact[2] ?? "0"}`) * multiplier);
    }
    if (!/^\d[\d\s\u00a0\u202f,.]*$/.test(text)) return null;
    return Number(text.replace(/\D/g, ""));
  }

  function getUniqueReason(username, profile) {
    if (username.querySelector(".uniqUsernameIcon--custom")) {
      return "распознана кастомная иконка ника";
    }

    const nicknameStyle = username.querySelector(".styleUserNickname")?.getAttribute("style") ?? "";
    if (/(?:linear|radial|conic)-gradient\s*\(/i.test(nicknameStyle) &&
        /background-clip\s*:\s*text/i.test(nicknameStyle)) {
      return "распознан градиентный ник";
    }

    if (profile?.querySelector(CUSTOM_BADGE_SELECTOR)?.textContent.trim()) {
      return "распознан кастомный бейдж профиля";
    }

    return null;
  }

  function getPublicationDecision(username, sympathies, profile = null) {
    const styleGroup = getStyleGroup(username);
    if (styleGroup) {
      return {
        allowed: true,
        group: styleGroup,
        ...(sympathies === null ? {} : { sympathies }),
        reason: "распознана привилегия по стилю ника"
      };
    }

    const uniqueReason = getUniqueReason(username, profile);
    if (uniqueReason) {
      return {
        allowed: true,
        group: "Уник",
        ...(sympathies === null ? {} : { sympathies }),
        reason: uniqueReason
      };
    }

    if (sympathies === null) return null;

    const group = SYMPATHY_GROUPS.find(({ from, to }) =>
      sympathies >= from && sympathies <= to
    );

    return {
      allowed: sympathies >= MINIMUM_SYMPATHIES,
      group: group?.name ?? "не определена",
      sympathies,
      reason: sympathies >= MINIMUM_SYMPATHIES
        ? `достаточно симпатий: минимум ${MINIMUM_SYMPATHIES.toLocaleString("ru-RU")}`
        : `нужно минимум ${MINIMUM_SYMPATHIES.toLocaleString("ru-RU")} симпатий`
    };
  }

  function createLoader(username) {
    if (!username || username.parentElement?.querySelector(".lolz-publication-loader")) return false;

    const loader = document.createElement("span");
    loader.className = "lolz-publication-loader";
    loader.title = "Проверяем право публикации…";
    loader.setAttribute("aria-label", "Проверяем право публикации");
    username.after(loader);
    return true;
  }

  function renderDecision(username, decision) {
    const status = document.createElement("span");
    status.className = `lolz-publication-status lolz-publication-status--${decision.allowed ? "allowed" : "denied"}`;
    status.textContent = decision.allowed
      ? "✓ Публикация разрешена"
      : "✕ Публикация запрещена";
    status.title = [
      `Группа: ${decision.group}`,
      decision.sympathies === undefined
        ? "Симпатии: не проверялись"
        : `Симпатии: ${decision.sympathies.toLocaleString("ru-RU")}`,
      `Основание: ${decision.reason}`
    ].join("\n");

    username.parentElement?.querySelector(".lolz-publication-loader")?.remove();
    username.after(status);
  }

  async function inspectFirstPost() {
    const post = document.querySelector("li.message.firstPost");
    if (!post || post.dataset.lolzPublicationChecked === "true") return;
    if (post.dataset.lolzPublicationLoading === "true") return;
    const username = post.querySelector(AUTHOR_SELECTOR);
    if (!username) return;

    post.dataset.lolzPublicationLoading = "true";
    createLoader(username);
    try {
      const profileUrl = sameSiteUrl(username.getAttribute("href"));
      if (!profileUrl) throw new Error("ссылка на профиль автора не найдена");
      const { username: profileUsername, sympathies, profile } = await getProfile(profileUrl);
      if (!post.isConnected || post.querySelector(AUTHOR_SELECTOR) !== username) return;
      const decision = getPublicationDecision(profileUsername, sympathies, profile);
      if (!decision) throw new Error("недостаточно данных для проверки статуса");
      renderDecision(username, decision);
      post.dataset.lolzPublicationChecked = "true";
      log(`Тема ${location.pathname}: ${decision.allowed ? "разрешено" : "запрещено"}`, decision);
    } catch (error) {
      const localDecision = getPublicationDecision(username, getSympathies(post));
      if (localDecision?.allowed) {
        renderDecision(username, localDecision);
        post.dataset.lolzPublicationChecked = "true";
        log(`Тема ${location.pathname}: разрешено по данным темы`, localDecision);
      } else {
        post.dataset.lolzPublicationChecked = "true";
        console.warn(`[ModerationUltraMegaHelper] Тема ${location.pathname}: профиль автора не проверен`, error);
      }
    } finally {
      username.parentElement?.querySelector(".lolz-publication-loader")?.remove();
      delete post.dataset.lolzPublicationLoading;
    }
  }

  function addStyles() {
    if (document.getElementById("lolz-publication-styles")) return;
    const style = document.createElement("style");
    style.id = "lolz-publication-styles";
    style.textContent = STYLES;
    (document.head ?? document.documentElement).append(style);
  }

  function activateThread() {
    if (!document.querySelector(FORUM_LINK_SELECTOR)) return;
    activationObserver.disconnect();
    if (!shouldCheckThread()) {
      log("Тема пропущена: раздел или префикс исключён");
      return;
    }

    addStyles();

    const observer = new MutationObserver(() => { void inspectFirstPost(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    void inspectFirstPost();
  }

  function runRequestQueue() {
    while (activeRequests < 2 && requestQueue.length) {
      const task = requestQueue.shift();
      activeRequests++;
      task().finally(() => {
        activeRequests--;
        runRequestQueue();
      });
    }
  }

  function fetchPage(url) {
    return new Promise((resolve, reject) => {
      requestQueue.push(async () => {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 12_000);
        try {
          const response = await fetch(url, {
            credentials: "same-origin",
            signal: controller.signal,
            headers: { Accept: "text/html" }
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const html = await response.text();
          resolve(new DOMParser().parseFromString(html, "text/html"));
        } catch (error) {
          reject(error);
        } finally {
          window.clearTimeout(timeout);
        }
      });
      runRequestQueue();
    });
  }

  function sameSiteUrl(rawUrl) {
    if (!rawUrl) return null;
    const url = new URL(rawUrl, `${location.origin}/`);
    if (url.origin !== location.origin &&
        ["lolz.team", "zelenka.guru"].includes(url.hostname) &&
        ["lolz.team", "zelenka.guru"].includes(location.hostname)) {
      url.host = location.host;
      url.protocol = location.protocol;
    }
    if (url.origin !== location.origin) return null;
    url.search = "";
    url.hash = "";
    return url;
  }

  function parseSympathies(profile) {
    const counters = profile.querySelectorAll(
      ".profilePage .counts_module a.page_counter, .profilePage .mobileCountsBlock a.mobileCountsItem"
    );
    const counter = [...counters].find((item) => {
      const url = sameSiteUrl(item.getAttribute("href"));
      return url && /\/likes\/?$/.test(url.pathname);
    });
    const text = counter?.querySelector(".count")?.textContent;
    return text ? parseCount(text) : null;
  }

  function getProfile(profileUrl) {
    const key = profileUrl.href;
    if (!profileRequests.has(key)) {
      profileRequests.set(key, fetchPage(key).then((profile) => {
        if (!profile.querySelector(".profilePage")) throw new Error("профиль не найден в ответе");
        const username = profile.querySelector(".profilePage #page_info_wrap h1.username")
          ?? profile.querySelector(".profilePage h1.username");
        const sympathies = parseSympathies(profile);
        if (!username) throw new Error("ник в профиле не найден");
        log(`Профиль ${profileUrl.pathname}: симпатии ${sympathies ?? "не найдены"}, статус ${getStyleGroup(username) ?? (getUniqueReason(username, profile) ? "Уник" : "обычный")}`);
        return { username, sympathies, profile };
      }));
    }
    return profileRequests.get(key);
  }

  async function inspectListRow(row) {
    const threadId = row.id.slice("thread-".length);
    const username = row.querySelector(LIST_AUTHOR_SELECTOR);
    const threadUrl = sameSiteUrl(row.querySelector("a.listBlock.main[href]")?.getAttribute("href"));
    const profileUrl = sameSiteUrl(username?.getAttribute("data-href"));
    if (!username || !threadUrl || !profileUrl || !/^\/threads\/\d+\/?$/.test(threadUrl.pathname)) {
      log(`Тема ${threadId}: пропущена, ссылка на тему или автора не найдена`);
      return;
    }
    if (row.querySelector(LIST_PURCHASE_PREFIX_SELECTOR)) {
      log(`Тема ${threadId}: пропущена по префиксу «Куплю/Скупаю»`);
      return;
    }

    createLoader(username);
    log(`Тема ${threadId}: проверяю раздел и профиль ${profileUrl.pathname}`);
    try {
      const thread = await fetchPage(threadUrl.href);
      const forumKey = getForumKey(thread);
      if (!isRestrictedForum(forumKey) || thread.querySelector(PURCHASE_PREFIX_SELECTOR)) {
        log(`Тема ${threadId}: пропущена, раздел ${forumKey ?? "не найден"} или префикс исключён`);
        return;
      }
      const threadAuthor = thread.querySelector(`li.message.firstPost ${AUTHOR_SELECTOR}`)?.textContent.trim();
      if (threadAuthor && threadAuthor.toLocaleLowerCase() !== username.textContent.trim().toLocaleLowerCase()) {
        throw new Error("автор списка не совпадает с автором темы");
      }

      const { username: profileUsername, sympathies, profile } = await getProfile(profileUrl);
      if (!row.isConnected || row.querySelector(LIST_AUTHOR_SELECTOR) !== username) return;
      const decision = getPublicationDecision(profileUsername, sympathies, profile);
      if (!decision) throw new Error("недостаточно данных для проверки статуса");
      renderDecision(username, decision);
      log(`Тема ${threadId}, раздел ${forumKey}: ${decision.allowed ? "разрешено" : "запрещено"}`, decision);
    } catch (error) {
      console.warn(`[ModerationUltraMegaHelper] Тема ${threadId}: ошибка проверки`, error);
    } finally {
      username.parentElement?.querySelector(".lolz-publication-loader")?.remove();
    }
  }

  function scanList() {
    if (!isRestrictedForum(getForumKeyFromPath(location.pathname))) return;
    for (const row of document.querySelectorAll(LIST_ROW_SELECTOR)) {
      if (row.dataset.lolzPublicationStarted === "true") continue;
      if (listVisibilityObserver) {
        if (row.dataset.lolzPublicationObserved === "true") continue;
        row.dataset.lolzPublicationObserved = "true";
        listVisibilityObserver.observe(row);
      } else {
        const bounds = row.getBoundingClientRect();
        if (bounds.bottom < -500 || bounds.top > window.innerHeight + 500) continue;
        row.dataset.lolzPublicationStarted = "true";
        void inspectListRow(row);
      }
    }
  }

  function activateList() {
    const forumKey = getForumKeyFromPath(location.pathname);
    if (!isRestrictedForum(forumKey)) {
      log(`Список не проверяется: раздел ${forumKey ?? "не найден"}`);
      return;
    }
    addStyles();
    log(`Проверяю список тем раздела ${forumKey}`);
    if ("IntersectionObserver" in window) {
      listVisibilityObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const row = entry.target;
          listVisibilityObserver.unobserve(row);
          if (row.dataset.lolzPublicationStarted === "true") continue;
          row.dataset.lolzPublicationStarted = "true";
          void inspectListRow(row);
        }
      }, { rootMargin: LIST_LOAD_MARGIN });
    }
    let scheduled = false;
    const scheduleScan = () => {
      if (scheduled) return;
      scheduled = true;
      window.setTimeout(() => {
        scheduled = false;
        scanList();
      }, 100);
    };
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    if (!listVisibilityObserver) {
      window.addEventListener("scroll", scheduleScan, { passive: true });
      window.addEventListener("resize", scheduleScan);
    }
    scanList();
  }

  function mountListToggle() {
    if (document.getElementById(LIST_TOGGLE_ID)) return true;
    const createTab = document.querySelector(
      'form.DiscussionListOptions a.CreatePersonalExtendedTab[href*="feed/create-tab"]'
    );
    if (!createTab) return false;

    const forumCheckbox = document.querySelector("form.DiscussionListOptions #ctrl_online_authors");
    const label = forumCheckbox?.closest("label")?.cloneNode(false) ?? document.createElement("label");
    label.className = "button middle checkboxLikeButton";
    label.style.display = "inline-flex";
    label.style.marginLeft = "8px";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = LIST_TOGGLE_ID;
    checkbox.checked = checkForumLists;
    checkbox.addEventListener("change", () => {
      GM_setValue(LIST_CHECK_SETTING, checkbox.checked);
      location.reload();
    });
    label.append(checkbox, "Проверять 3.8 в списке");
    createTab.after(label);
    return true;
  }

  const activationObserver = new MutationObserver(activateThread);

  function start() {
    if (location.pathname.startsWith("/forums/")) {
      if (!isRestrictedForum(getForumKeyFromPath(location.pathname))) return;
      if (!mountListToggle()) {
        const toggleObserver = new MutationObserver(() => {
          if (mountListToggle()) toggleObserver.disconnect();
        });
        toggleObserver.observe(document.documentElement, { childList: true, subtree: true });
      }
      if (checkForumLists) activateList();
    } else if (location.pathname.startsWith("/threads/")) {
      activationObserver.observe(document.documentElement, { childList: true, subtree: true });
      activateThread();
    }
  }

  if (document.documentElement) {
    start();
  } else {
    document.addEventListener("readystatechange", start, { once: true });
  }
})();
