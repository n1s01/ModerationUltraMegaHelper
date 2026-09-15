(() => {
  "use strict";

  const FORUM_LINK_SELECTOR = '#pageDescription a[href*="forums/"]';
  const AUTHOR_SELECTOR = ".userText > .item > a.username.poster";

  function getForumKey() {
    const forumLink = document.querySelector(FORUM_LINK_SELECTOR);
    if (!forumLink) return null;

    const pathname = new URL(forumLink.getAttribute("href"), location.origin).pathname;
    return pathname.match(/forums\/([^/]+)/)?.[1] ?? null;
  }

  function inspectFirstPost() {
    const post = document.querySelector("li.message.firstPost");
    if (!post) return;

    const username = post.querySelector(AUTHOR_SELECTOR);
    if (!username) return;

    console.debug(
      "Lolz Publication Helper: раздел",
      getForumKey(),
      "автор",
      username.textContent.trim()
    );
  }

  inspectFirstPost();
})();
