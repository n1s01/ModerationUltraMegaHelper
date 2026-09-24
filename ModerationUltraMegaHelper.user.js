// ==UserScript==
// @name         ModerationUltraMegaHelper
// @namespace    https://lolz.team/
// @version      68.7.4
// @description  Показывает, может ли автор опубликовать тему в выбранных разделах.
// @match        https://lolz.team/forums/*
// @match        https://lolz.team/threads/*
// @match        https://zelenka.guru/forums/*
// @match        https://zelenka.guru/threads/*
// @run-at       document-idle
// @sandbox      JavaScript
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// ==/UserScript==

(() => {
  "use strict";

  const MINIMUM_SYMPATHIES = 200;
  const LIST_CHECK_SETTING = "checkForumLists";
  let checkForumLists = GM_getValue(LIST_CHECK_SETTING, true);
  const LIST_TOGGLE_ID = "lolz-publication-list-toggle";
  const AUTO_REPORT_SETTING = "autoReport";
  let autoReport = GM_getValue(AUTO_REPORT_SETTING, false) && checkForumLists;
  const AUTO_REPORT_TOGGLE_ID = "lolz-publication-report-toggle";

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
  const LIST_ROW_SELECTOR = ".DiscussionList .discussionListItems .discussionListItem[id^='thread-']";
  const LIST_AUTHOR_SELECTOR = ".listBlock.main .threadCreator[data-href]";
  const CUSTOM_BADGE_SELECTOR = ".profilePage .avatarScaler > em.userBanner.wrapped[itemprop='title'] > strong, .profilePage .userBannersBlock > em.userBanner.wrapped[itemprop='title'] > strong";
  const LIST_LOAD_MARGIN = "500px 0px";
  const USER_CACHE_KEY = "lolz-publication-users-v1";
  const REPORT_HISTORY_KEY = "lolz-publication-reports-v1";
  const REVIEW_HISTORY_KEY = "lolz-publication-review-v1";
  const MAX_CACHED_USERS = 2_000;
  const userCache = loadUserCache();
  const reportHistory = loadReportHistory();
  const reviewHistory = loadReviewHistory();
  const reportInFlight = new Set();
  const reviewContexts = new WeakMap();
  const profileRequests = new Map();
  const requestQueue = [];
  const activeControllers = new Set();
  const reportControllers = new Set();
  let activeRequests = 0;
  let listGeneration = 0;
  let listVisibilityObserver = null;
  let listMutationObserver = null;
  let listScanHandler = null;
  let listScanTimer = null;
  let cacheSaveTimer = null;

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
    .lolz-publication-status--review {
      background: #713f12;
      color: #fde68a;
    }
    .lolz-publication-review-actions {
      display: inline-flex;
      gap: 4px;
      margin-left: 6px;
      vertical-align: middle;
    }
    .lolz-publication-review-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 19px;
      height: 19px;
      padding: 0;
      border: 1px solid currentColor;
      border-radius: 5px;
      background: transparent;
      font-size: 14px;
      font-weight: 700;
      line-height: 1;
      cursor: pointer;
    }
    .lolz-publication-review-action--allow { color: #86efac; }
    .lolz-publication-review-action--deny { color: #fca5a5; }
    .lolz-publication-review-action:hover { background: rgba(255, 255, 255, 0.1); }
    .lolz-publication-review-action:disabled { opacity: 0.45; cursor: not-allowed; }
    .lolz-publication-report {
      display: inline-block;
      margin-left: 6px;
      padding: 1px 6px;
      border-radius: 8px;
      background: #3f3f46;
      color: #e4e4e7;
      font-size: 10px;
      font-weight: 700;
      line-height: 16px;
      vertical-align: middle;
      white-space: nowrap;
      pointer-events: none;
    }
  `;

  function log(message, details) {
    if (details === undefined) {
      console.info(`[ModerationUltraMegaHelper] ${message}`);
    } else {
      console.info(`[ModerationUltraMegaHelper] ${message}`, details);
    }
  }

  function currentHour() {
    return Math.floor(Date.now() / 3_600_000);
  }

  function loadUserCache() {
    try {
      const entries = JSON.parse(window.localStorage.getItem(USER_CACHE_KEY) ?? "[]");
      if (!Array.isArray(entries)) return new Map();
      return new Map(entries.filter((entry) => {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" ||
            !Array.isArray(entry[1]) || entry[1].length !== 4) return false;
        const [mode, sympathies, fingerprint, hour] = entry[1];
        if (!["s", "u", "p", "d"].includes(mode) ||
            !(sympathies === null || Number.isSafeInteger(sympathies) && sympathies >= 0) ||
            typeof fingerprint !== "string" || !Number.isInteger(hour)) return false;
        if (mode === "s") return sympathies >= MINIMUM_SYMPATHIES;
        if (mode === "d") return sympathies !== null && sympathies < MINIMUM_SYMPATHIES;
        return true;
      }).slice(-MAX_CACHED_USERS));
    } catch {
      return new Map();
    }
  }

  function saveUserCache() {
    if (cacheSaveTimer !== null) {
      window.clearTimeout(cacheSaveTimer);
      cacheSaveTimer = null;
    }
    try {
      window.localStorage.setItem(USER_CACHE_KEY, JSON.stringify([...userCache]));
    } catch (error) {
      console.warn("[ModerationUltraMegaHelper] Не удалось сохранить кеш пользователей", error);
    }
  }

  function scheduleCacheSave() {
    if (cacheSaveTimer !== null) return;
    cacheSaveTimer = window.setTimeout(saveUserCache, 300);
  }

  function getCachedUser(key) {
    const value = userCache.get(key);
    if (!value) return null;
    const hour = currentHour();
    userCache.delete(key);
    userCache.set(key, value);
    if (hour - value[3] >= 24) {
      value[3] = hour;
      scheduleCacheSave();
    }
    return value;
  }

  function cacheUser(key, mode, sympathies, fingerprint) {
    userCache.delete(key);
    userCache.set(key, [mode, sympathies, fingerprint, currentHour()]);
    while (userCache.size > MAX_CACHED_USERS) {
      userCache.delete(userCache.keys().next().value);
    }
    scheduleCacheSave();
  }

  function loadReportHistory() {
    const history = new Map();
    try {
      const saved = GM_getValue(REPORT_HISTORY_KEY, "");
      if (typeof saved !== "string") throw new Error("неверный формат истории");
      for (const entry of saved.split(",")) {
        const match = entry.match(/^([0-9a-z]+)\.([0-9a-z]+)\.([rp])$/);
        if (!match) continue;
        const threadId = Number.parseInt(match[1], 36);
        const hour = Number.parseInt(match[2], 36);
        if (Number.isSafeInteger(threadId) && Number.isSafeInteger(hour)) {
          history.set(String(threadId), [match[3], hour]);
        }
      }
    } catch (error) {
      autoReport = false;
      console.warn("[ModerationUltraMegaHelper] Не удалось прочитать историю жалоб", error);
    }
    return history;
  }

  function setReportHistory(threadId, state) {
    const previous = reportHistory.get(threadId);
    if (state) reportHistory.set(threadId, [state, currentHour()]);
    else reportHistory.delete(threadId);
    try {
      const compact = [...reportHistory].map(([id, [mode, hour]]) =>
        `${Number(id).toString(36)}.${hour.toString(36)}.${mode}`
      ).join(",");
      GM_setValue(REPORT_HISTORY_KEY, compact);
      return true;
    } catch (error) {
      if (previous) reportHistory.set(threadId, previous);
      else reportHistory.delete(threadId);
      console.warn("[ModerationUltraMegaHelper] Не удалось сохранить историю жалоб", error);
      return false;
    }
  }

  function loadReviewHistory() {
    const history = new Map();
    try {
      const saved = GM_getValue(REVIEW_HISTORY_KEY, "");
      if (typeof saved !== "string") throw new Error("неверный формат ручных решений");
      for (const entry of saved.split(",")) {
        const match = entry.match(/^([0-9a-z]+)\.([ad])$/);
        if (!match) continue;
        const threadId = Number.parseInt(match[1], 36);
        if (Number.isSafeInteger(threadId)) history.set(String(threadId), match[2]);
      }
    } catch (error) {
      console.warn("[ModerationUltraMegaHelper] Не удалось прочитать ручные решения", error);
    }
    return history;
  }

  function setReviewHistory(threadId, state) {
    const previous = reviewHistory.get(threadId);
    reviewHistory.set(threadId, state);
    try {
      GM_setValue(REVIEW_HISTORY_KEY, [...reviewHistory]
        .map(([id, mode]) => `${Number(id).toString(36)}.${mode}`).join(","));
      return true;
    } catch (error) {
      if (previous) reviewHistory.set(threadId, previous);
      else reviewHistory.delete(threadId);
      console.warn("[ModerationUltraMegaHelper] Не удалось сохранить ручное решение", error);
      return false;
    }
  }

  function nicknameFingerprint(username) {
    const nickname = username.querySelector(".styleUserNickname");
    const value = `${nickname?.className ?? ""}|${nickname?.getAttribute("style") ?? ""}|${Boolean(username.querySelector(".uniqUsernameIcon--custom"))}`;
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
      hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
    }
    return (hash >>> 0).toString(36);
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

  function getThreadPrefixState(doc) {
    const prefixes = doc.querySelector(".prefixThreadGroup");
    const hasBuy = Boolean(prefixes?.querySelector(".ts_buy, .ts_mass_buy"));
    const hasSell = Boolean(prefixes?.querySelector(".ts_sell"));
    return hasBuy ? (hasSell ? "review" : "purchase") : "regular";
  }

  function shouldCheckThread() {
    const forumKey = getForumKey();
    return Boolean(
      isRestrictedForum(forumKey) &&
      getThreadPrefixState(document) !== "purchase"
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

    const nickname = username.querySelector(".styleUserNickname");
    const nicknameStyle = nickname?.getAttribute("style") ?? "";
    if (/(?:linear|radial|conic)-gradient\s*\(/i.test(nicknameStyle) &&
        /background-clip\s*:\s*text/i.test(nicknameStyle)) {
      return "распознан градиентный ник";
    }

    if (nickname && ![...nickname.classList].some((name) => /^style\d+$/.test(name)) &&
        /(?:^|;)\s*color\s*:/i.test(nicknameStyle) &&
        /(?:^|;)\s*text-shadow\s*:/i.test(nicknameStyle)) {
      return "распознан кастомный стиль ника";
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
    username.parentElement?.querySelector(".lolz-publication-status")?.remove();
    username.parentElement?.querySelector(".lolz-publication-review-actions")?.remove();
    username.after(status);
  }

  function renderReview(username, threadId, postId, token) {
    reviewContexts.set(username, { threadId, postId, token });
    const saved = reviewHistory.get(threadId) ?? (reportHistory.has(threadId) ? "d" : null);
    if (saved) {
      renderDecision(username, {
        allowed: saved === "a",
        group: "Ручная проверка",
        reason: saved === "a" ? "тема разрешена вручную" : "тема запрещена вручную"
      });
      if (saved === "a" || reportHistory.has(threadId) || reportInFlight.has(threadId)) return;
    }

    if (!saved) {
      const status = document.createElement("span");
      status.className = "lolz-publication-status lolz-publication-status--review";
      status.textContent = "⚠ Нужно проверить";
      status.title = "В теме есть теги «Куплю» и «Продам». Автоматическая жалоба не отправляется.";
      username.parentElement?.querySelector(".lolz-publication-loader")?.remove();
      username.parentElement?.querySelector(".lolz-publication-status")?.remove();
      username.parentElement?.querySelector(".lolz-publication-review-actions")?.remove();
      username.after(status);
    }

    const actions = document.createElement("span");
    actions.className = "lolz-publication-review-actions";
    const addAction = (kind, symbol, title) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `lolz-publication-review-action lolz-publication-review-action--${kind}`;
      button.textContent = symbol;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!username.isConnected) return;
        if (kind === "allow") {
          if (setReviewHistory(threadId, "a")) {
            log(`Тема ${threadId}: разрешена вручную`);
            renderReview(username, threadId, postId, token);
          }
        } else if (setReviewHistory(threadId, "d")) {
          log(`Тема ${threadId}: запрещена вручную, отправляю жалобу`);
          void sendReport(threadId, postId, token, { manual: true });
          renderReview(username, threadId, postId, token);
        }
      });
      if (kind === "deny" && (!postId || !token)) {
        button.disabled = true;
        button.title = "Нет ID сообщения или CSRF-токена для жалобы";
      }
      actions.append(button);
    };
    if (!saved) addAction("allow", "✓", "Разрешить тему и запомнить решение");
    addAction("deny", "✕", saved ? "Повторить жалобу 3.8" : "Запретить тему и отправить жалобу 3.8");
    username.parentElement?.append(actions);
  }

  function renderCheckedDecision(username, decision, reviewContext = null) {
    if (reviewContext && !decision?.allowed) {
      renderReview(username, reviewContext.threadId, reviewContext.postId, reviewContext.token);
    } else if (decision) {
      reviewContexts.delete(username);
      renderDecision(username, decision);
    }
  }

  function renderReportHistory(username, threadId) {
    const record = reportHistory.get(threadId);
    username.parentElement?.querySelector(".lolz-publication-report")?.remove();
    if (!record) return;
    const badge = document.createElement("span");
    badge.className = "lolz-publication-report";
    badge.textContent = record[0] === "r" ? "⚑ Жалоба отправлена"
      : reportInFlight.has(threadId) ? "⚑ Отправляется…" : "⚑ Статус жалобы неизвестен";
    badge.title = record[0] === "r"
      ? "Эта тема уже была отправлена в авторепорт"
      : "Отправка могла завершиться после потери соединения. Повторная жалоба отключена.";
    username.parentElement?.append(badge);
  }

  async function inspectFirstPost() {
    const post = document.querySelector("li.message.firstPost");
    if (!post || post.dataset.lolzPublicationChecked === "true") return;
    if (post.dataset.lolzPublicationLoading === "true") return;
    const username = post.querySelector(AUTHOR_SELECTOR);
    if (!username) return;
    const threadId = location.pathname.match(/^\/threads\/(\d+)/)?.[1];
    if (threadId) renderReportHistory(username, threadId);

    const reviewContext = getThreadPrefixState(document) === "review" ? {
      threadId,
      postId: post.id.match(/^post-(\d+)$/)?.[1] ?? null,
      token: document.querySelector('input[name="_xfToken"]')?.value ?? null
    } : null;
    const localDecision = getPublicationDecision(username, getSympathies(post));
    if (localDecision?.allowed) {
      renderCheckedDecision(username, localDecision, reviewContext);
      post.dataset.lolzPublicationChecked = "true";
      log(`Тема ${location.pathname}: разрешено по данным темы`, localDecision);
      return;
    }

    post.dataset.lolzPublicationLoading = "true";
    createLoader(username);
    try {
      const profileUrl = sameSiteUrl(username.getAttribute("href"));
      if (!profileUrl) throw new Error("ссылка на профиль автора не найдена");
      const { username: profileUsername, sympathies, profile } = await getProfile(profileUrl);
      if (!post.isConnected || post.querySelector(AUTHOR_SELECTOR) !== username) return;
      const decision = getPublicationDecision(profileUsername, sympathies, profile);
      if (!decision) throw new Error("недостаточно данных для проверки статуса");
      renderCheckedDecision(username, decision, reviewContext);
      post.dataset.lolzPublicationChecked = "true";
      log(`Тема ${location.pathname}: ${reviewContext && !decision.allowed ? "нужна ручная проверка" : decision.allowed ? "разрешено" : "запрещено"}`, decision);
    } catch (error) {
      if (reviewContext) {
        renderReview(username, reviewContext.threadId, reviewContext.postId, reviewContext.token);
        post.dataset.lolzPublicationChecked = "true";
        console.warn(`[ModerationUltraMegaHelper] Тема ${location.pathname}: право автора не подтверждено, нужна ручная проверка`, error);
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
      const task = async () => {
        const controller = new AbortController();
        activeControllers.add(controller);
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
          activeControllers.delete(controller);
        }
      };
      task.cancel = () => reject(new DOMException("Проверка списка отключена", "AbortError"));
      requestQueue.push(task);
      runRequestQueue();
    });
  }

  function fetchReportJson(url, options = {}, onStart = null, manual = false) {
    return new Promise((resolve, reject) => {
      const task = async () => {
        if (!manual && !autoReport) {
          reject(new DOMException("Авторепорт выключен", "AbortError"));
          return;
        }
        const controller = new AbortController();
        if (!manual) {
          activeControllers.add(controller);
          reportControllers.add(controller);
        }
        const timeout = window.setTimeout(() => controller.abort(), 12_000);
        try {
          const requestUrl = new URL(url, location.origin);
          if (requestUrl.origin !== location.origin) throw new Error("адрес жалобы вне текущего сайта");
          const pageJQuery = unsafeWindow.jQuery;
          if (typeof pageJQuery?.ajax !== "function") {
            throw new Error("AJAX форума недоступен на странице");
          }
          onStart?.();
          const result = await new Promise((resolveRequest, rejectRequest) => {
            const request = pageJQuery.ajax({
              url: requestUrl.href,
              type: options.method ?? "GET",
              data: options.body?.toString(),
              dataType: "json",
              ...(options.headers?.["Content-Type"]
                ? { contentType: options.headers["Content-Type"] }
                : {})
            });
            const abort = () => request.abort();
            controller.signal.addEventListener("abort", abort, { once: true });
            request.done((data) => {
              controller.signal.removeEventListener("abort", abort);
              resolveRequest(data);
            });
            request.fail((xhr, status) => {
              controller.signal.removeEventListener("abort", abort);
              if (status === "abort") {
                rejectRequest(new DOMException("Запрос жалобы прерван", "AbortError"));
              } else {
                const error = new Error(`HTTP ${xhr.status || 0}${status === "parsererror" ? " (некорректный JSON)" : ""}`);
                error.httpStatus = xhr.status;
                rejectRequest(error);
              }
            });
            if (controller.signal.aborted) request.abort();
          });
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          window.clearTimeout(timeout);
          if (!manual) {
            activeControllers.delete(controller);
            reportControllers.delete(controller);
          }
        }
      };
      task.cancel = () => reject(new DOMException("Проверка списка отключена", "AbortError"));
      if (manual) void task();
      else {
        requestQueue.push(task);
        runRequestQueue();
      }
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
      const request = fetchPage(key).then((profile) => {
        if (!profile.querySelector(".profilePage")) throw new Error("профиль не найден в ответе");
        const username = profile.querySelector(".profilePage #page_info_wrap h1.username")
          ?? profile.querySelector(".profilePage h1.username");
        const sympathies = parseSympathies(profile);
        if (!username) throw new Error("ник в профиле не найден");
        log(`Профиль ${profileUrl.pathname}: симпатии ${sympathies ?? "не найдены"}, статус ${getStyleGroup(username) ?? (getUniqueReason(username, profile) ? "Уник" : "обычный")}`);
        return { username, sympathies, profile };
      }).catch((error) => {
        profileRequests.delete(key);
        throw error;
      });
      profileRequests.set(key, request);
    }
    return profileRequests.get(key);
  }

  function updateReportBadge(threadId) {
    const listUsername = document.getElementById(`thread-${threadId}`)?.querySelector(LIST_AUTHOR_SELECTOR);
    const threadUsername = location.pathname.match(/^\/threads\/(\d+)/)?.[1] === threadId
      ? document.querySelector(`li.message.firstPost ${AUTHOR_SELECTOR}`) : null;
    for (const username of [listUsername, threadUsername]) {
      if (!username) continue;
      renderReportHistory(username, threadId);
      const context = reviewContexts.get(username);
      if (context) renderReview(username, context.threadId, context.postId, context.token);
    }
  }

  async function sendReport(threadId, postId, token, { manual = false, generation = listGeneration } = {}) {
    if ((!manual && (!autoReport || !checkForumLists || generation !== listGeneration)) ||
        reportHistory.has(threadId) || reportInFlight.has(threadId)) return;
    if (!postId || !token) {
      log(`Тема ${threadId}: жалоба пропущена, нет ID первого сообщения или CSRF-токена`);
      return;
    }

    reportInFlight.add(threadId);
    let postStarted = false;
    let stage = "получение формы жалобы";
    try {
      const requestUri = `${location.pathname}${location.search}`;
      const query = new URLSearchParams({
        post_id: postId,
        _xfRequestUri: requestUri,
        _xfNoRedirect: "1",
        _xfToken: token,
        _xfResponseType: "json"
      });
      log(`Тема ${threadId}: запрашиваю форму жалобы через AJAX форума`);
      const overlay = await fetchReportJson(`/posts/report?${query}`, {}, null, manual);
      if (!manual && (!autoReport || generation !== listGeneration)) return;
      const form = new DOMParser().parseFromString(overlay.templateHtml ?? "", "text/html")
        .querySelector("form._reportForm[action]");
      const action = sameSiteUrl(form?.getAttribute("action"));
      const formToken = form?.querySelector('input[name="_xfToken"]')?.value ?? token;
      if (!action || action.pathname !== `/posts/${postId}/report`) {
        throw new Error("форма жалобы не найдена или относится к другому сообщению");
      }

      if (!setReportHistory(threadId, "p")) return;
      updateReportBadge(threadId);
      const body = new URLSearchParams({
        message: "3.8",
        is_common_reason: "0",
        _xfToken: formToken,
        _xfRequestUri: requestUri,
        _xfNoRedirect: "1",
        _xfResponseType: "json"
      });
      stage = "отправка жалобы";
      log(`Тема ${threadId}: отправляю жалобу 3.8 через AJAX форума`);
      const result = await fetchReportJson(action.href, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body
      }, () => { postStarted = true; }, manual);
      if (result._redirectStatus !== "ok") {
        setReportHistory(threadId, null);
        throw new Error(result.error ?? result._redirectMessage ?? "сервер не подтвердил жалобу");
      }
      setReportHistory(threadId, "r");
      log(`Тема ${threadId}: ${manual ? "ручная жалоба" : "авторепорт"} отправлена, сообщение ${postId}`);
    } catch (error) {
      if ((!postStarted || (error.httpStatus >= 400 && error.httpStatus < 500)) &&
          reportHistory.get(threadId)?.[0] === "p") {
        setReportHistory(threadId, null);
      }
      console.warn(`[ModerationUltraMegaHelper] Тема ${threadId}: ${stage} не подтверждена`, error);
    } finally {
      reportInFlight.delete(threadId);
      updateReportBadge(threadId);
    }
  }

  async function inspectListRow(row) {
    const generation = listGeneration;
    const threadId = row.id.slice("thread-".length);
    const username = row.querySelector(LIST_AUTHOR_SELECTOR);
    const threadUrl = sameSiteUrl(row.querySelector("a.listBlock.main[href]")?.getAttribute("href"));
    const profileUrl = sameSiteUrl(username?.getAttribute("data-href"));
    if (!username || !profileUrl || !threadUrl || !/^\/threads\/\d+\/?$/.test(threadUrl.pathname)) {
      log(`Тема ${threadId}: пропущена, ссылка на тему или автора не найдена`);
      return;
    }
    createLoader(username);
    log(`Тема ${threadId}: проверяю раздел и префикс`);
    let firstPostId = null;
    let csrfToken = null;
    let prefixState = "regular";
    try {
      const thread = await fetchPage(threadUrl.href);
      if (!checkForumLists || generation !== listGeneration || !row.isConnected ||
          row.querySelector(LIST_AUTHOR_SELECTOR) !== username) return;
      const forumKey = getForumKey(thread);
      prefixState = getThreadPrefixState(thread);
      if (!isRestrictedForum(forumKey) || prefixState === "purchase") {
        username.parentElement?.querySelector(".lolz-publication-loader")?.remove();
        log(`Тема ${threadId}: пропущена, раздел ${forumKey ?? "не найден"} или префикс исключён`);
        return;
      }
      const threadAuthor = thread.querySelector(`li.message.firstPost ${AUTHOR_SELECTOR}`)?.textContent.trim();
      if (!threadAuthor || threadAuthor.toLocaleLowerCase() !== username.textContent.trim().toLocaleLowerCase()) {
        throw new Error("автор списка не совпадает с автором темы");
      }
      firstPostId = thread.querySelector("li.message.firstPost[id^='post-']")?.id.slice(5) ?? null;
      csrfToken = document.querySelector('input[name="_xfToken"]')?.value
        ?? thread.querySelector('input[name="_xfToken"]')?.value ?? null;
      renderReportHistory(username, threadId);
    } catch (error) {
      if (checkForumLists && generation === listGeneration) {
        username.parentElement?.querySelector(".lolz-publication-loader")?.remove();
        console.warn(`[ModerationUltraMegaHelper] Тема ${threadId}: не удалось определить раздел`, error);
      }
      return;
    }

    const reviewContext = prefixState === "review"
      ? { threadId, postId: firstPostId, token: csrfToken } : null;

    const userKey = profileUrl.pathname.replace(/\/$/, "").toLocaleLowerCase();
    const fingerprint = nicknameFingerprint(username);
    const cached = getCachedUser(userKey);
    if (cached?.[0] === "s") {
      const decision = getPublicationDecision(username, cached[1]);
      renderCheckedDecision(username, decision, reviewContext);
      log(`Автор ${userKey}: разрешено по сохранённым симпатиям`, decision);
      return;
    }
    if (cached?.[0] === "u" && cached[2] === fingerprint) {
      const decision = getPublicationDecision(username, cached[1]);
      const uniqueDecision = decision?.allowed ? decision : {
        allowed: true,
        group: "Уник",
        ...(cached[1] === null ? {} : { sympathies: cached[1] }),
        reason: "привилегия подтверждена ранее"
      };
      renderCheckedDecision(username, uniqueDecision, reviewContext);
      log(`Автор ${userKey}: разрешено по сохранённому статусу «Уник»`, uniqueDecision);
      return;
    }
    const localDecision = getPublicationDecision(username, null);
    if (localDecision?.allowed) {
      const mode = localDecision.group === "Уник" ? "u" : "p";
      const sympathies = cached?.[1] ?? null;
      const decision = getPublicationDecision(username, sympathies);
      cacheUser(userKey, mode, sympathies, fingerprint);
      renderCheckedDecision(username, decision, reviewContext);
      log(`Автор ${userKey}: разрешено по текущему оформлению ника`, decision);
      return;
    }
    if (cached?.[0] === "d" && cached[2] === fingerprint) {
      const decision = getPublicationDecision(username, cached[1]);
      renderCheckedDecision(username, decision, reviewContext);
      log(`Автор ${userKey}: сохранённый отказ, обновляю проверку`, decision);
    }

    createLoader(username);
    log(`Автор ${userKey}: проверяю профиль`);
    try {
      const { username: profileUsername, sympathies, profile } = await getProfile(profileUrl);
      if (!checkForumLists || generation !== listGeneration || !row.isConnected ||
          row.querySelector(LIST_AUTHOR_SELECTOR) !== username) return;
      const decision = getPublicationDecision(profileUsername, sympathies, profile);
      if (!decision) throw new Error("недостаточно данных для проверки статуса");
      const mode = sympathies !== null && sympathies >= MINIMUM_SYMPATHIES
        ? "s"
        : decision.group === "Уник" ? "u" : decision.allowed ? "p" : "d";
      cacheUser(userKey, mode, sympathies, fingerprint);
      renderCheckedDecision(username, decision, reviewContext);
      log(`Автор ${userKey}: ${decision.allowed ? "разрешено" : "запрещено"}, сохранено в кеш`, decision);
      if (!decision.allowed) {
        if (reviewContext) log(`Тема ${threadId}: теги «Куплю» и «Продам», нужна ручная проверка`);
        else if (autoReport) void sendReport(threadId, firstPostId, csrfToken, { generation });
        else log(`Тема ${threadId}: авторепорт выключен`);
      } else {
        log(`Тема ${threadId}: авторепорт пропущен, публикация разрешена`);
      }
    } catch (error) {
      if (checkForumLists && generation === listGeneration && row.isConnected &&
          row.querySelector(LIST_AUTHOR_SELECTOR) === username) {
        if (localDecision?.allowed) {
          renderCheckedDecision(username, localDecision, reviewContext);
          log(`Автор ${userKey}: разрешено по оформлению ника, симпатии не получены`, localDecision);
        } else if (reviewContext) {
          renderReview(username, threadId, firstPostId, csrfToken);
          console.warn(`[ModerationUltraMegaHelper] Тема ${threadId}: право автора не подтверждено, нужна ручная проверка`, error);
        } else {
          console.warn(`[ModerationUltraMegaHelper] Тема ${threadId}: ошибка проверки`, error);
        }
      }
    } finally {
      if (generation === listGeneration) {
        username.parentElement?.querySelector(".lolz-publication-loader")?.remove();
      }
    }
  }

  function scanList() {
    if (!checkForumLists || !isRestrictedForum(getForumKeyFromPath(location.pathname))) return;
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
    if (listMutationObserver) return;
    const forumKey = getForumKeyFromPath(location.pathname);
    if (!isRestrictedForum(forumKey)) {
      log(`Список не проверяется: раздел ${forumKey ?? "не найден"}`);
      return;
    }
    addStyles();
    log(`Проверяю список тем раздела ${forumKey}`);
    const generation = listGeneration;
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        if (!checkForumLists || generation !== listGeneration) return;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const row = entry.target;
          observer.unobserve(row);
          if (row.dataset.lolzPublicationStarted === "true") continue;
          row.dataset.lolzPublicationStarted = "true";
          void inspectListRow(row);
        }
      }, { rootMargin: LIST_LOAD_MARGIN });
      listVisibilityObserver = observer;
    }
    listScanHandler = () => {
      if (listScanTimer !== null || !checkForumLists || generation !== listGeneration) return;
      listScanTimer = window.setTimeout(() => {
        listScanTimer = null;
        scanList();
      }, 100);
    };
    listMutationObserver = new MutationObserver(listScanHandler);
    listMutationObserver.observe(document.documentElement, { childList: true, subtree: true });
    if (!listVisibilityObserver) {
      window.addEventListener("scroll", listScanHandler, { passive: true });
      window.addEventListener("resize", listScanHandler);
    }
    scanList();
  }

  function deactivateList() {
    listGeneration++;
    listVisibilityObserver?.disconnect();
    listVisibilityObserver = null;
    listMutationObserver?.disconnect();
    listMutationObserver = null;
    if (listScanHandler) {
      window.removeEventListener("scroll", listScanHandler);
      window.removeEventListener("resize", listScanHandler);
      listScanHandler = null;
    }
    if (listScanTimer !== null) {
      window.clearTimeout(listScanTimer);
      listScanTimer = null;
    }
    for (const task of requestQueue.splice(0)) task.cancel();
    for (const controller of activeControllers) controller.abort();
    profileRequests.clear();
    for (const row of document.querySelectorAll(LIST_ROW_SELECTOR)) {
      delete row.dataset.lolzPublicationStarted;
      delete row.dataset.lolzPublicationObserved;
      row.querySelectorAll(".lolz-publication-loader, .lolz-publication-status, .lolz-publication-report, .lolz-publication-review-actions")
        .forEach((item) => item.remove());
    }
    log("Проверка списка тем выключена");
  }

  function stopAutoReport() {
    for (const controller of reportControllers) controller.abort();
    log("Авторепорт выключен");
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
      checkForumLists = checkbox.checked;
      GM_setValue(LIST_CHECK_SETTING, checkForumLists);
      if (checkForumLists) activateList();
      else {
        if (autoReport) {
          autoReport = false;
          GM_setValue(AUTO_REPORT_SETTING, false);
          document.getElementById(AUTO_REPORT_TOGGLE_ID).checked = false;
          stopAutoReport();
        }
        deactivateList();
      }
    });
    label.append(checkbox, "Проверять 3.8 в списке");
    createTab.after(label);

    const reportLabel = forumCheckbox?.closest("label")?.cloneNode(false)
      ?? document.createElement("label");
    reportLabel.className = "button middle checkboxLikeButton";
    reportLabel.style.display = "inline-flex";
    reportLabel.style.marginLeft = "8px";
    const reportCheckbox = document.createElement("input");
    reportCheckbox.type = "checkbox";
    reportCheckbox.id = AUTO_REPORT_TOGGLE_ID;
    reportCheckbox.checked = autoReport;
    reportCheckbox.addEventListener("change", () => {
      autoReport = reportCheckbox.checked;
      GM_setValue(AUTO_REPORT_SETTING, autoReport);
      if (autoReport) {
        if (!checkForumLists) {
          checkForumLists = true;
          checkbox.checked = true;
          GM_setValue(LIST_CHECK_SETTING, true);
          activateList();
        } else {
          deactivateList();
          activateList();
        }
        log("Авторепорт включен: проверяю видимые темы заново");
      } else {
        stopAutoReport();
      }
    });
    reportLabel.append(reportCheckbox, "Авторепорт");
    label.after(reportLabel);
    return true;
  }

  const activationObserver = new MutationObserver(activateThread);

  window.addEventListener("pagehide", () => {
    if (cacheSaveTimer !== null) saveUserCache();
  });

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
