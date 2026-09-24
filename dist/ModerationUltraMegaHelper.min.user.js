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

(()=>{"use strict";const d=[{from:0,to:19,name:"Новорег"},{from:20,to:199,name:"Местный"},{from:200,to:999,name:"Постоялец"},{from:1e3,to:3999,name:"Эксперт"},{from:4e3,to:9999,name:"Гуру"},{from:1e4,to:111110,name:"Искусственный интеллект"},{from:111111,to:1/0,name:"Величайший"}],m=new Map([["style8","Суприм"],["style11","Продавец"],["style26","Легенда"]]),f=new Set(["1001","1003","1007","1014","1039","104","105","1073","1077","1081","1085","263","345","381","431","593","595","596","597","664","671","682","683","685","688","689","690","720","726","728","729","733","763","784","785","800","805","806","810","814","815","816","817","828","834","839","841","844","846","852","855","858","863","868","898","900","901","908","909","910","912","913","915","919","925","927","929","932","936","947","948","962","975","design","escapefromtarkov","origin","psn","steam","supercell","uplay","warface"]),p=new Set(["381","832"]),u='#pageDescription a[href*="forums/"]',r=".userText > .item > a.username.poster",b=".prefixThreadGroup .prefix.ts_buy, .prefixThreadGroup .prefix.ts_mass_buy",S=`
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
  `;function g(){const e=document.querySelector(u);return e?new URL(e.getAttribute("href"),location.origin).pathname.match(/forums\/([^/]+)/)?.[1]??null:null}function y(){const e=g();return!!(e&&f.has(e)&&!p.has(e)&&!document.querySelector(b))}function h(e){const t=e.querySelector(".styleUserNickname");if(!t)return null;const o=[...t.classList].find(n=>/^style\d+$/.test(n));return m.get(o)??null}function E(e){const o=[...e.querySelectorAll(".userCounters .userCounter:not(.userCounter--registerDate)")].find(a=>a.querySelector(".fa-heart"));if(!o)return null;const n=Number(o.textContent.replace(/[^\d]/g,""));return Number.isFinite(n)?n:null}function M(e){const t=e.querySelector(r);if(!t)return null;const o=h(t);if(o)return{allowed:!0,group:o,reason:"распознана привилегия по стилю ника"};if(t.querySelector(".uniqUsernameIcon--custom"))return{allowed:!0,group:"Уник",reason:"распознана кастомная иконка ника"};const n=E(e);if(n===null)return null;const a=d.find(({from:w,to:I})=>n>=w&&n<=I);return{allowed:n>=200,group:a?.name??"не определена",sympathies:n,reason:n>=200?`достаточно симпатий: минимум ${200 .toLocaleString("ru-RU")}`:`нужно минимум ${200 .toLocaleString("ru-RU")} симпатий`}}function _(e){const t=e.querySelector(r);if(!t||e.querySelector(".lolz-publication-loader"))return!1;const o=document.createElement("span");return o.className="lolz-publication-loader",o.title="Проверяем право публикации…",o.setAttribute("aria-label","Проверяем право публикации"),t.after(o),!0}function x(e,t){const o=e.querySelector(r);if(!o)return;const n=document.createElement("span");n.className=`lolz-publication-status lolz-publication-status--${t.allowed?"allowed":"denied"}`,n.textContent=t.allowed?"✓ Публикация разрешена":"✕ Публикация запрещена",n.title=[`Группа: ${t.group}`,t.sympathies===void 0?"Симпатии: не проверялись":`Симпатии: ${t.sympathies.toLocaleString("ru-RU")}`,`Основание: ${t.reason}`].join(`
`),e.querySelector(".lolz-publication-loader")?.remove(),o.after(n),e.dataset.lolzPublicationChecked="true"}function l(){const e=document.querySelector("li.message.firstPost");if(!e||e.dataset.lolzPublicationChecked==="true"||e.dataset.lolzPublicationLoading==="true")return;if(_(e)){e.dataset.lolzPublicationLoading="true",window.setTimeout(()=>{delete e.dataset.lolzPublicationLoading,l()},150);return}const t=M(e);t&&x(e,t)}function i(){if(!document.querySelector(u)||(s.disconnect(),!y()))return;const e=document.createElement("style");e.textContent=S,(document.head??document.documentElement).append(e),new MutationObserver(l).observe(document.documentElement,{childList:!0,subtree:!0}),l()}const s=new MutationObserver(i);function c(){s.observe(document.documentElement,{childList:!0,subtree:!0}),i()}document.documentElement?c():document.addEventListener("readystatechange",c,{once:!0})})();
