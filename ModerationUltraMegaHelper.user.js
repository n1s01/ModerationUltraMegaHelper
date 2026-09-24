// ==UserScript==
// @name         ModerationUltraMegaHelper
// @namespace    https://lolz.team/
// @version      67.0.0
// @description  Показывает, может ли автор опубликовать тему в выбранных разделах.
// @match        https://lolz.team/threads/*
// @match        https://zelenka.guru/threads/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const MINIMUM_SYMPATHIES = 200;

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

  function getForumKey() {
    const forumLink = document.querySelector(FORUM_LINK_SELECTOR);
    if (!forumLink) return null;

    const pathname = new URL(forumLink.getAttribute("href"), location.origin).pathname;
    return pathname.match(/forums\/([^/]+)/)?.[1] ?? null;
  }

  function shouldCheckThread() {
    const forumKey = getForumKey();
    return Boolean(
      forumKey &&
      RESTRICTED_FORUMS.has(forumKey) &&
      !EXCLUDED_FORUMS.has(forumKey) &&
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

    if (username.querySelector(".uniqUsernameIcon--custom")) {
      return {
        allowed: true,
        group: "Уник",
        reason: "распознана кастомная иконка ника"
      };
    }

    const sympathies = getSympathies(post);
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
    status.title = [
      `Группа: ${decision.group}`,
      decision.sympathies === undefined
        ? "Симпатии: не проверялись"
        : `Симпатии: ${decision.sympathies.toLocaleString("ru-RU")}`,
      `Основание: ${decision.reason}`
    ].join("\n");

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
    if (!shouldCheckThread()) return;

    const style = document.createElement("style");
    style.textContent = STYLES;
    (document.head ?? document.documentElement).append(style);

    const observer = new MutationObserver(inspectFirstPost);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    inspectFirstPost();
  }

  const activationObserver = new MutationObserver(activate);

  function start() {
    activationObserver.observe(document.documentElement, { childList: true, subtree: true });
    activate();
  }

  if (document.documentElement) {
    start();
  } else {
    document.addEventListener("readystatechange", start, { once: true });
  }
})();
