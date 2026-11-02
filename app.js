(() => {
  "use strict";

  const data = window.SITE_DATA;
  if (!data) return;

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const body = document.body;
  const header = $("[data-header]");
  const menu = $("[data-mobile-menu]");
  const menuOpenButton = $("[data-menu-open]");
  const menuCloseButton = $("[data-menu-close]");
  const eventList = $("#event-list");
  const eventEmpty = $("#event-empty");
  const eventDialog = $("#event-dialog");
  const albumDialog = $("#album-dialog");
  const lightbox = $("#lightbox");
  const toast = $("#toast");

  let menuIsOpen = false;
  let toastTimer = null;
  let currentEventId = null;
  let currentAlbumId = null;

  /* -------------------------------------------------------
     Utilities
     ------------------------------------------------------- */

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-show"), 2800);
  }

  function syncBodyLock() {
    const anyDialogOpen = Boolean(eventDialog?.open || albumDialog?.open || lightbox?.open);
    body.classList.toggle("is-locked", menuIsOpen || anyDialogOpen);
  }

  function formatDateKey(date) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);
  }

  function daysFromToday(dateString) {
    const today = formatDateKey(new Date());
    const a = Date.parse(`${today}T00:00:00Z`);
    const b = Date.parse(`${dateString}T00:00:00Z`);
    return Math.round((b - a) / 86400000);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function pad(number) {
    return String(Math.max(0, number)).padStart(2, "0");
  }

  /* -------------------------------------------------------
     Header and navigation
     ------------------------------------------------------- */

  function onScrollHeader() {
    header.classList.toggle("is-scrolled", window.scrollY > 34);
  }

  window.addEventListener("scroll", onScrollHeader, { passive: true });
  onScrollHeader();

  const sectionNodes = $$("[data-section]");
  const navLinks = $$("[data-nav]");

  function updateActiveSection() {
    const marker = window.scrollY + window.innerHeight * 0.34;
    let activeId = "";

    sectionNodes.forEach((section) => {
      if (section.offsetTop <= marker) activeId = section.dataset.section;
    });

    navLinks.forEach((link) => {
      const isActive = link.dataset.nav === activeId;
      link.classList.toggle("is-active", isActive);
      if (isActive) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  }

  window.addEventListener("scroll", updateActiveSection, { passive: true });
  updateActiveSection();

  function openMenu() {
    menuIsOpen = true;
    menu.classList.add("is-open");
    menu.setAttribute("aria-hidden", "false");
    menuOpenButton.setAttribute("aria-expanded", "true");
    syncBodyLock();
    window.setTimeout(() => menuCloseButton?.focus(), 60);
  }

  function closeMenu() {
    menuIsOpen = false;
    menu.classList.remove("is-open");
    menu.setAttribute("aria-hidden", "true");
    menuOpenButton.setAttribute("aria-expanded", "false");
    syncBodyLock();
    menuOpenButton.focus();
  }

  menuOpenButton?.addEventListener("click", openMenu);
  menuCloseButton?.addEventListener("click", closeMenu);
  $$("a", menu).forEach((link) => link.addEventListener("click", closeMenu));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuIsOpen) {
      closeMenu();
    }

    const tag = document.activeElement?.tagName;
    if (
      event.key === "/" &&
      !menuIsOpen &&
      !eventDialog?.open &&
      !albumDialog?.open &&
      !lightbox?.open &&
      !["INPUT", "TEXTAREA", "SELECT"].includes(tag)
    ) {
      event.preventDefault();
      $("#trend-search")?.focus();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 980 && menuIsOpen) closeMenu();
  });

  $$("[data-back-top]").forEach((button) => {
    button.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  /* -------------------------------------------------------
     Next show / countdown
     ------------------------------------------------------- */

  const sessionDates = data.events
    .flatMap((event) => event.sessions)
    .filter(Boolean)
    .sort();

  function getNextSession() {
    const now = Date.now();
    return sessionDates
      .map((date) => new Date(`${date}T14:00:00+08:00`))
      .find((date) => date.getTime() > now) || null;
  }

  let nextSession = getNextSession();

  function renderNextShowLabel() {
    const dayBadges = $$("[data-days]");
    if (!dayBadges.length) return;

    let label = "DONE";
    if (nextSession) {
      const diff = daysFromToday(formatDateKey(nextSession));
      if (diff === 0) label = "D-DAY";
      else if (diff > 0) label = `D-${pad(diff)}`;
      else label = "LIVE";
    }

    dayBadges.forEach((badge) => {
      badge.textContent = label;
    });
  }

  const countdownNodes = {
    days: $('[data-countdown="days"]'),
    hours: $('[data-countdown="hours"]'),
    minutes: $('[data-countdown="minutes"]'),
    seconds: $('[data-countdown="seconds"]')
  };

  function renderCountdown() {
    nextSession = getNextSession();
    renderNextShowLabel();

    if (!nextSession) {
      Object.values(countdownNodes).forEach((node) => {
        if (node) node.textContent = "00";
      });
      return;
    }

    const diff = Math.max(0, nextSession.getTime() - Date.now());
    const totalSeconds = Math.floor(diff / 1000);

    countdownNodes.days.textContent = pad(Math.floor(totalSeconds / 86400));
    countdownNodes.hours.textContent = pad(Math.floor((totalSeconds % 86400) / 3600));
    countdownNodes.minutes.textContent = pad(Math.floor((totalSeconds % 3600) / 60));
    countdownNodes.seconds.textContent = pad(totalSeconds % 60);
  }

  renderCountdown();
  window.setInterval(renderCountdown, 1000);

  /* -------------------------------------------------------
     Events
     ------------------------------------------------------- */

  let eventFilter = "all";

  function eventCardMarkup(event) {
    const isPast = event.status === "past";
    const isMilestone = event.id === "nov-14";
    const metaItems = event.meta
      .map((item) => `<span>${escapeHtml(item)}</span>`)
      .join("<span>·</span>");

    return `
      <article class="event-card${isPast ? " is-past" : ""}${isMilestone ? " is-milestone" : ""}" data-event-card data-status="${event.status}" data-id="${event.id}">
        <div class="event-date">
          <span class="month">${escapeHtml(event.month)}</span>
          <strong>${escapeHtml(event.day)}</strong>
          <span class="weekday">${escapeHtml(event.weekday)}</span>
        </div>
        <div class="event-card-body">
          <div class="event-card-top">
            <span class="status-dot" aria-hidden="true"></span>
            <span class="event-status">${escapeHtml(event.statusLabel)}</span>
            ${isMilestone ? '<span class="event-milestone">THE 100TH</span>' : ""}
          </div>
          <h3>${escapeHtml(event.title)}</h3>
          <p>${escapeHtml(event.summary)}</p>
          <div class="event-meta">${metaItems}</div>
          <div class="event-tags">
            ${event.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
          </div>
        </div>
        <div class="event-actions">
          <button class="event-detail-btn" type="button" data-event-open="${event.id}">详情 <span>↗</span></button>
          <button class="event-cal-btn" type="button" data-calendar="${event.id}" aria-label="将${escapeHtml(event.title)}加入日历">＋</button>
        </div>
      </article>
    `;
  }

  function renderEvents() {
    eventList.innerHTML = data.events.map(eventCardMarkup).join("");
  }

  function applyEventFilter() {
    const cards = $$("[data-event-card]", eventList);
    let visible = 0;

    cards.forEach((card) => {
      const show = eventFilter === "all" || card.dataset.status === eventFilter;
      card.hidden = !show;
      if (show) visible += 1;
    });

    eventEmpty.hidden = visible !== 0;

    $$(".filter-chip").forEach((button) => {
      const isActive = button.dataset.filter === eventFilter;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  const eventCounts = {
    all: data.events.length,
    upcoming: data.events.filter((event) => event.status === "upcoming").length,
    past: data.events.filter((event) => event.status === "past").length
  };

  Object.entries(eventCounts).forEach(([key, value]) => {
    const node = $(`[data-filter-count="${key}"]`);
    if (node) node.textContent = pad(value);
  });

  $$(".filter-chip").forEach((button) => {
    button.addEventListener("click", () => {
      eventFilter = button.dataset.filter || "all";
      applyEventFilter();
    });
  });

  renderEvents();
  applyEventFilter();

  function openEventDialog(eventId) {
    const event = data.events.find((item) => item.id === eventId);
    if (!event || !eventDialog) return;

    currentEventId = eventId;

    $("#event-dialog-image").src = event.image;
    $("#event-dialog-image").alt = event.imageAlt;
    $("#event-dialog-stamp").textContent = `${event.stamp} · ${event.month} ${event.day}`;
    $("#event-dialog-status").textContent = event.statusLabel;
    $("#event-dialog-date").textContent = event.dateLabel;
    $("#event-dialog-title").textContent = event.title;
    $("#event-dialog-summary").textContent = event.description;
    $("#event-dialog-meta").innerHTML = event.meta
      .map((item) => `<span>${escapeHtml(item)}</span>`)
      .join("");
    $("#event-dialog-list").innerHTML = event.highlights
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("");
    $("#event-dialog-source").href = event.sourceUrl;
    $("#event-dialog-source").textContent = `查看来源 · ${event.sourceLabel}`;

    const calendarButton = $("#event-dialog-calendar");
    calendarButton.dataset.calendar = event.id;

    eventDialog.showModal();
    syncBodyLock();
  }

  eventList.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-event-open]");
    if (openButton) {
      openEventDialog(openButton.dataset.eventOpen);
      return;
    }

    const calendarButton = event.target.closest("[data-calendar]");
    if (calendarButton) {
      const item = data.events.find((entry) => entry.id === calendarButton.dataset.calendar);
      if (item) downloadCalendar(item);
    }
  });

  $("[data-close-event]")?.addEventListener("click", () => eventDialog.close());

  eventDialog?.addEventListener("click", (event) => {
    if (event.target === eventDialog) eventDialog.close();
  });

  eventDialog?.addEventListener("close", () => {
    syncBodyLock();
    if (currentEventId) {
      const trigger = $(`[data-event-open="${currentEventId}"]`);
      trigger?.focus({ preventScroll: true });
    }
  });

  $("#event-dialog-calendar")?.addEventListener("click", () => {
    const event = data.events.find((item) => item.id === currentEventId);
    if (event) downloadCalendar(event);
  });

  /* -------------------------------------------------------
     Calendar (.ics)
     ------------------------------------------------------- */

  function icsEscape(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function icsStamp() {
    return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function downloadCalendar(event) {
    const nowStamp = icsStamp();
    const events = event.sessions.map((date, index) => {
      const compact = date.replace(/-/g, "");
      const endDate = new Date(`${date}T22:00:00+08:00`);
      const endCompact = formatDateKey(endDate).replace(/-/g, "");
      const uid = `hcy-${event.id}-${compact}-${index}@mars-file.local`;
      return [
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${nowStamp}`,
        `DTSTART;TZID=Asia/Shanghai:${compact}T140000`,
        `DTEND;TZID=Asia/Shanghai:${endCompact}T220000`,
        `SUMMARY:${icsEscape(`华晨宇火星演唱会 · ${event.title}`)}`,
        `DESCRIPTION:${icsEscape(`${event.meta.join(" / ")}\n\n${event.summary}\n\n具体开场时间以官方发布为准。信息整理自 MARS FILE。`)}`,
        `LOCATION:${icsEscape("南京汤山音乐谷")}`,
        `URL:${event.sourceUrl}`,
        "STATUS:CONFIRMED",
        "BEGIN:VALARM",
        "TRIGGER:-P1D",
        "ACTION:DISPLAY",
        `DESCRIPTION:${icsEscape("明天有华晨宇火星演唱会，记得检查门票与交通。")}`,
        "END:VALARM",
        "END:VEVENT"
      ].join("\r\n");
    });

    const content = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//MARS FILE//HCY Fan Archive//CN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VTIMEZONE",
      "TZID:Asia/Shanghai",
      "BEGIN:STANDARD",
      "DTSTART:19700101T000000",
      "TZOFFSETFROM:+0800",
      "TZOFFSETTO:+0800",
      "TZNAME:CST",
      "END:STANDARD",
      "END:VTIMEZONE",
      ...events,
      "END:VCALENDAR"
    ].join("\r\n");

    const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `华晨宇-南京-${event.startDate}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);

    showToast("日历文件已生成 · 用系统日历打开即可");
  }

  /* -------------------------------------------------------
     Trends
     ------------------------------------------------------- */

  const trendSection = $("#trends");
  const trendList = $("#trend-list");
  const trendEmpty = $("#trend-empty");
  const trendSearch = $("#trend-search");
  const trendCount = $("#trend-count");
  const platformName = $("#trend-platform-name");
  const platformCopy = $("#platform-copy");
  const platformLink = $("#platform-link");

  let currentPlatform = "weibo";
  let trendQuery = "";
  let openTrendId = "wb-1";

  function heatBars(heat) {
    const bars = Array.from({ length: 7 }, (_, index) => {
      const on = index < Math.round(heat / 14);
      const height = 7 + ((heat * (index + 3)) % 18);
      return `<span class="${on ? "is-on" : ""}" style="height:${height}px"></span>`;
    }).join("");
    return `<span class="heat-meter" aria-hidden="true">${bars}</span>`;
  }

  function trendMarkup(item, index) {
    const isOpen = item.id === openTrendId;
    return `
      <article class="trend-row${isOpen ? " is-open" : ""}" role="listitem" data-trend-id="${item.id}">
        <button class="trend-summary" type="button" aria-expanded="${isOpen}" aria-controls="trend-detail-${item.id}" data-trend-toggle="${item.id}">
          <span class="trend-rank">${pad(index + 1)}</span>
          <span class="trend-main">
            <span class="trend-title">${escapeHtml(item.title)}</span>
            <span class="trend-meta">
              <b class="trend-level">${escapeHtml(item.level)}</b>
              <span>${escapeHtml(item.meta)}</span>
            </span>
          </span>
          ${heatBars(item.heat)}
          <span class="trend-toggle" aria-hidden="true">＋</span>
        </button>
        <div class="trend-detail" id="trend-detail-${item.id}"${isOpen ? "" : " hidden"}>
          <p>${escapeHtml(item.summary)}</p>
          <a class="trend-source" href="${item.sourceUrl}" target="_blank" rel="noopener noreferrer">来源 · ${escapeHtml(item.sourceLabel)} <span>↗</span></a>
        </div>
      </article>
    `;
  }

  function renderTrends() {
    const config = data.trends[currentPlatform];
    if (!config) return;

    const normalized = trendQuery.trim().toLowerCase();
    const filtered = config.items.filter((item) => {
      if (!normalized) return true;
      return `${item.title} ${item.summary} ${item.meta}`.toLowerCase().includes(normalized);
    });

    trendList.innerHTML = filtered
      .map((item) => trendMarkup(item, config.items.indexOf(item)))
      .join("");

    trendEmpty.hidden = filtered.length !== 0;
    trendCount.textContent = `${pad(filtered.length)} 个话题`;
    platformName.textContent = config.name;
    platformCopy.textContent = config.copy;

    platformLink.href = config.link;
    platformLink.innerHTML = `${config.linkLabel} <span>↗</span>`;

    trendSection.dataset.platform = currentPlatform;

    $$(".platform-tab").forEach((tab) => {
      const active = tab.dataset.platformTab === currentPlatform;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
  }

  $$(".platform-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      currentPlatform = tab.dataset.platformTab;
      openTrendId = data.trends[currentPlatform]?.items[0]?.id || "";
      renderTrends();
    });
  });

  trendList.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-trend-toggle]");
    if (!toggle) return;

    const id = toggle.dataset.trendToggle;
    openTrendId = openTrendId === id ? "" : id;

    $$(".trend-row", trendList).forEach((row) => {
      const isOpen = row.dataset.trendId === openTrendId;
      row.classList.toggle("is-open", isOpen);
      const button = $(".trend-summary", row);
      const detail = $(".trend-detail", row);
      if (button) button.setAttribute("aria-expanded", String(isOpen));
      if (detail) detail.hidden = !isOpen;
    });
  });

  trendSearch?.addEventListener("input", () => {
    trendQuery = trendSearch.value;
    renderTrends();
  });

  $("#trend-reset")?.addEventListener("click", () => {
    trendQuery = "";
    if (trendSearch) {
      trendSearch.value = "";
      trendSearch.focus();
    }
    renderTrends();
  });

  renderTrends();

  /* -------------------------------------------------------
     Day / night setlist panel
     ------------------------------------------------------- */

  const dualPanel = $("#dual-panel");
  const dualTitle = $("#dual-title");
  const dualKicker = $("#dual-kicker");
  const dualDesc = $("#dual-desc");
  const dualFacts = $("#dual-facts");
  const dualCaption = $("#dual-media-caption");
  const trackChips = $("#track-chips");

  function renderDualMode(mode) {
    const config = data.dual[mode];
    if (!config || !dualPanel) return;

    dualPanel.dataset.mode = mode;

    $$(".mode-switch button", dualPanel).forEach((button) => {
      const active = button.dataset.mode === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    $$(".dual-img", dualPanel).forEach((image) => {
      const active = image.classList.contains(`dual-img-${mode}`);
      image.classList.toggle("is-active", active);
    });

    dualKicker.textContent = config.kicker;
    dualTitle.innerHTML = config.title;
    dualDesc.textContent = config.desc;
    dualCaption.textContent = config.caption;
    dualFacts.innerHTML = config.facts.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
    trackChips.innerHTML = config.tracks.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  }

  $$(".mode-switch button").forEach((button) => {
    button.addEventListener("click", () => renderDualMode(button.dataset.mode));
  });

  renderDualMode("day");

  /* -------------------------------------------------------
     Gallery + lightbox
     ------------------------------------------------------- */

  const galleryGrid = $("#gallery-grid");
  let galleryIndex = 0;
  let galleryTimer = null;
  let isPlaying = false;

  function galleryMarkup(item, index) {
    return `
      <button class="gallery-card ${item.layout ? `is-${item.layout}` : ""}" type="button" data-gallery-open="${index}" aria-label="全屏查看：${escapeHtml(item.title)}">
        <img src="${item.src}" alt="${escapeHtml(item.alt)}" width="${item.width}" height="${item.height}">
        <span class="gallery-index">${pad(index + 1)}</span>
        <span class="gallery-arrow" aria-hidden="true">↗</span>
        <span class="gallery-caption">
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.meta)}</small>
        </span>
      </button>
    `;
  }

  galleryGrid.innerHTML = data.gallery.map(galleryMarkup).join("");

  const lightboxImage = $("#lightbox-image");
  const lightboxTitle = $("#lightbox-title");
  const lightboxCaption = $("#lightbox-caption");
  const lightboxIndex = $("#lightbox-index");
  const lightboxProgress = $("#lightbox-progress");
  const lightboxPlay = $("[data-lightbox-play]");
  const playLabel = $("[data-play-label]");

  function renderLightbox(index) {
    const item = data.gallery[index];
    if (!item) return;

    galleryIndex = (index + data.gallery.length) % data.gallery.length;
    const current = data.gallery[galleryIndex];

    lightboxImage.src = current.src;
    lightboxImage.alt = current.alt;
    lightboxTitle.textContent = current.title;
    lightboxCaption.textContent = current.caption;
    lightboxIndex.textContent = `${pad(galleryIndex + 1)} / ${pad(data.gallery.length)}`;
    lightboxProgress.style.width = `${((galleryIndex + 1) / data.gallery.length) * 100}%`;
    lightboxImage.style.opacity = "0";

    window.requestAnimationFrame(() => {
      lightboxImage.style.transition = "opacity .35s ease";
      lightboxImage.style.opacity = "1";
    });
  }

  function openLightbox(index) {
    if (!lightbox) return;
    renderLightbox(index);
    lightbox.showModal();
    syncBodyLock();
  }

  function closeLightbox() {
    stopGalleryAutoplay();
    lightbox.close();
  }

  function stepLightbox(direction) {
    renderLightbox(galleryIndex + direction);
  }

  function stopGalleryAutoplay() {
    window.clearInterval(galleryTimer);
    galleryTimer = null;
    isPlaying = false;
    if (lightboxPlay) lightboxPlay.setAttribute("aria-pressed", "false");
    if (playLabel) playLabel.textContent = "自动播放";
  }

  function startGalleryAutoplay() {
    window.clearInterval(galleryTimer);
    isPlaying = true;
    galleryTimer = window.setInterval(() => renderLightbox(galleryIndex + 1), 4500);
    if (lightboxPlay) lightboxPlay.setAttribute("aria-pressed", "true");
    if (playLabel) playLabel.textContent = "暂停播放";
  }

  galleryGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-gallery-open]");
    if (button) openLightbox(Number(button.dataset.galleryOpen));
  });

  $$("[data-open-gallery]").forEach((button) => {
    button.addEventListener("click", () => openLightbox(Number(button.dataset.openGallery) || 0));
  });

  $("[data-close-lightbox]")?.addEventListener("click", closeLightbox);
  $("[data-lightbox-prev]")?.addEventListener("click", () => stepLightbox(-1));
  $("[data-lightbox-next]")?.addEventListener("click", () => stepLightbox(1));

  lightboxPlay?.addEventListener("click", () => {
    if (isPlaying) stopGalleryAutoplay();
    else startGalleryAutoplay();
  });

  lightbox?.addEventListener("close", () => {
    stopGalleryAutoplay();
    syncBodyLock();
  });

  lightbox?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      stepLightbox(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      stepLightbox(1);
    }
  });

  lightbox?.addEventListener("click", (event) => {
    if (event.target === lightbox) closeLightbox();
  });

  /* -------------------------------------------------------
     Discography
     ------------------------------------------------------- */

  const albumGrid = $("#album-grid");
  const albums = Array.isArray(data.discography) ? data.discography : [];

  function albumCoverMarkup(album) {
    return `<img src="${album.cover}" alt="${escapeHtml(album.coverAlt)}" width="900" height="900">`;
  }

  function albumCardMarkup(album) {
    return `
      <button class="album-card" type="button" data-album-open="${album.id}" aria-label="查看专辑档案：${escapeHtml(album.title)}">
        <span class="album-cover">
          ${albumCoverMarkup(album)}
          <span class="album-open" aria-hidden="true">↗</span>
        </span>
        <span class="album-meta">
          <span>
            <strong>${escapeHtml(album.title)}</strong>
            <small>${escapeHtml(album.year)} · ${escapeHtml(album.tracksCount)} 首 · ${escapeHtml(album.en)}</small>
          </span>
          <span class="album-arrow" aria-hidden="true">↗</span>
        </span>
      </button>
    `;
  }

  if (albumGrid && albums.length) {
    albumGrid.innerHTML = albums.map(albumCardMarkup).join("");
  }

  function openAlbumDialog(albumId) {
    const album = albums.find((item) => item.id === albumId);
    if (!album || !albumDialog) return;

    currentAlbumId = albumId;

    const cover = $("#album-dialog-cover img");
    cover.src = album.cover;
    cover.alt = album.coverAlt;

    $("#album-dialog-stamp").textContent = `MARS FILE / ALBUM ${album.no}`;
    $("#album-dialog-index").textContent = `ALBUM ${album.no} / ${album.year}`;
    $("#album-dialog-tracks").textContent = `${album.tracksCount} TRACKS`;
    $("#album-dialog-title").textContent = album.title;
    $("#album-dialog-en").textContent = album.en;
    $("#album-dialog-tagline").textContent = album.tagline;
    $("#album-dialog-concept").textContent = album.concept;

    $("#album-dialog-meta").innerHTML = [
      album.date,
      album.label,
      "录音室专辑",
      ...album.sound
    ].map((item) => `<span>${escapeHtml(item)}</span>`).join("");

    $("#album-dialog-tracklist").innerHTML = album.tracks
      .map((track) => `<li>${escapeHtml(track)}</li>`)
      .join("");

    $("#album-dialog-lyric").innerHTML = album.lyric.lines
      .map((line) => `<span>${escapeHtml(line)}</span>`)
      .join("");
    $("#album-dialog-lyric-song").textContent = album.lyric.song;
    $("#album-dialog-lyric-credit").textContent = album.lyric.credit;

    $("#album-dialog-achievements").innerHTML = album.achievements
      .map((item) => `
        <div class="album-achievement">
          <strong>${escapeHtml(item.value)}</strong>
          <span>${escapeHtml(item.label)}</span>
        </div>
      `)
      .join("");

    $("#album-dialog-link").href = album.netease;
    $("#album-dialog-source").href = album.source;

    albumDialog.showModal();
    syncBodyLock();
  }

  albumGrid?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-album-open]");
    if (button) openAlbumDialog(button.dataset.albumOpen);
  });

  $("[data-close-album]")?.addEventListener("click", () => albumDialog.close());

  albumDialog?.addEventListener("click", (event) => {
    if (event.target === albumDialog) albumDialog.close();
  });

  albumDialog?.addEventListener("close", () => {
    syncBodyLock();
    if (currentAlbumId) {
      const trigger = $(`[data-album-open="${currentAlbumId}"]`);
      trigger?.focus({ preventScroll: true });
    }
  });

  /* -------------------------------------------------------
     Background music
     ------------------------------------------------------- */

  const musicDock = $("[data-music-dock]");
  const musicToggle = $("[data-music-toggle]");
  const musicPanel = $("[data-music-panel]");
  const musicFrame = $("#music-frame");
  const musicHint = $("[data-music-hint]");
  const MUSIC_SRC = "https://music.163.com/outchain/player?type=2&id=2006485344&auto=1&height=66";

  let musicStarted = false;
  let musicHintTimer = null;

  function startMusic() {
    if (!musicDock || !musicFrame || musicStarted) return;

    musicStarted = true;
    musicFrame.src = MUSIC_SRC;
    musicDock.classList.add("is-open");
    musicPanel.hidden = false;
    musicToggle.setAttribute("aria-expanded", "true");
    musicHint?.classList.add("is-hidden");
    window.clearTimeout(musicHintTimer);
    showToast("官方播放器已加载 · 若未自动响起请点播放键");
  }

  function stopMusic() {
    if (!musicDock || !musicFrame) return;

    musicStarted = false;
    musicFrame.src = "about:blank";
    musicDock.classList.remove("is-open", "is-playing");
    musicPanel.hidden = true;
    musicToggle.setAttribute("aria-expanded", "false");
    musicHint?.classList.add("is-hidden");
  }

  musicToggle?.addEventListener("click", startMusic);
  musicHint?.addEventListener("click", startMusic);
  $("[data-music-close]")?.addEventListener("click", stopMusic);
  $("[data-music-stop]")?.addEventListener("click", stopMusic);

  const startMusicOnFirstGesture = () => {
    if (!musicStarted) startMusic();
  };

  document.addEventListener("pointerdown", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-music-dock]")) return;
    startMusicOnFirstGesture();
  }, { once: true });

  document.addEventListener("keydown", (event) => {
    if (!(event.target instanceof Element)) return;
    if (["Enter", " "].includes(event.key) && !event.target.closest("[data-music-dock]")) {
      startMusicOnFirstGesture();
    }
  }, { once: true });

  musicHintTimer = window.setTimeout(() => {
    if (!musicStarted) musicHint?.classList.add("is-hidden");
  }, 12000);

  /* -------------------------------------------------------
     Ticker duplication safety
     ------------------------------------------------------- */

  // The ticker is authored twice in HTML so the loop is seamless.
  // Keep its animation duration proportional to content width.
  const tickerTrack = $(".ticker-track");
  if (tickerTrack) {
    tickerTrack.style.animationDuration = `${Math.max(28, tickerTrack.scrollWidth / 42)}s`;
  }
})();
