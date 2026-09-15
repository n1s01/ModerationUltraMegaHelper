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

  const FORUM_LINK_SELECTOR = '#pageDescription a[href*="forums/"]';
  const AUTHOR_SELECTOR = ".userText > .item > a.username.poster";

  function getForumKey() {
    const forumLink = document.querySelector(FORUM_LINK_SELECTOR);
    if (!forumLink) return null;

    const pathname = new URL(forumLink.getAttribute("href"), location.origin).pathname;
    return pathname.match(/forums\/([^/]+)/)?.[1] ?? null;
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

  function inspectFirstPost() {
    const post = document.querySelector("li.message.firstPost");
    if (!post) return;

    const username = post.querySelector(AUTHOR_SELECTOR);
    if (!username) return;

    const styleGroup = getStyleGroup(username);
    if (styleGroup) {
      console.debug(
        "Lolz Publication Helper: автор",
        username.textContent.trim(),
        "привилегия",
        styleGroup,
        "публикация разрешена"
      );
      return;
    }

    if (hasUniqueIcon(username)) {
      console.debug(
        "Lolz Publication Helper: автор",
        username.textContent.trim(),
        "кастомная иконка",
        "публикация разрешена"
      );
      return;
    }

    const sympathies = getSympathies(post);
    if (sympathies === null) return;

    const group = getSympathyGroup(sympathies);
    const allowed = sympathies >= MINIMUM_SYMPATHIES;

    console.debug(
      "Lolz Publication Helper: автор",
      username.textContent.trim(),
      "группа",
      group?.name ?? "не определена",
      "симпатии",
      sympathies,
      allowed ? "публикация разрешена" : "публикация запрещена"
    );
  }

  inspectFirstPost();
})();
