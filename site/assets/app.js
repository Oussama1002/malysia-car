/**
 * Site public Malysia Car.
 *
 * Deux appels seulement vers DriveFlow : la flotte visible, et le dépôt d'une
 * demande de réservation. Aucune authentification, aucune donnée interne. Si
 * l'API ne répond pas, la page reste utilisable et le visiteur garde le
 * téléphone et WhatsApp pour joindre l'agence.
 */
(function () {
  'use strict';

  var CFG = window.MALYSIA || {};
  var API = (CFG.apiBase || '').replace(/\/$/, '');

  var $ = function (id) { return document.getElementById(id); };

  // ── Coordonnées ──────────────────────────────────────────
  function fillContacts() {
    var year = $('year');
    if (year) year.textContent = new Date().getFullYear();

    var phoneValue = CFG.phone || '';
    var mailValue = CFG.email || '';

    ['telLink', 'telLinkFooter'].forEach(function (id) {
      var el = $(id);
      if (!el || !phoneValue) return;
      var span = el.querySelector('.reserve__contactValue');
      if (span) span.textContent = phoneValue;
      else el.textContent = phoneValue;
      el.href = 'tel:' + phoneValue.replace(/\s/g, '');
    });
    ['mailLink', 'mailLinkFooter'].forEach(function (id) {
      var el = $(id);
      if (!el || !mailValue) return;
      var span = el.querySelector('.reserve__contactValue');
      if (span) span.textContent = mailValue;
      else el.textContent = mailValue;
      el.href = 'mailto:' + mailValue;
    });
    var addr = $('addrText');
    if (addr && CFG.address) addr.textContent = CFG.address;

    var waHref = CFG.whatsapp
      ? 'https://wa.me/' + CFG.whatsapp + '?text=' + encodeURIComponent('Bonjour, je souhaite louer une voiture.')
      : null;
    ['waLink', 'waFab'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      if (waHref) el.href = waHref;
      else el.style.display = 'none';
    });
  }

  // ── Slider des marques ───────────────────────────────────
  var BRAND_FILES = [
    'abarth-1707227603.png', 'alfa-romeo-1707227628.png', 'audi-1707227800.png',
    'bmw-1707227856.png', 'chery-1707227888.png', 'chevrolet-1707227932.png',
    'chrysler-1707227968.png', 'citroen-1707227988.png', 'cupra-1707228025.png',
    'dacia-1707228045.png', 'daihatsu-1707228069.png', 'dfsk-1707228085.png',
    'dodge-1707228116.png', 'ds-1707228155.png', 'fiat-1707228180.png',
    'ford-1707228198.png', 'foton-1707228209.png', 'gaz-1707228234.png',
    'honda-1707228272.png', 'hummer-1707228285.png', 'hyundai-1707228297.png',
    'isuzu-1707228314.png', 'jaguar-1707228328.png', 'jeep-1707228354.png',
    'kia-1707228364.png', 'lancia-1707228376.png', 'land-rover-1707228401.png',
    'lexus-1707228422.png', 'mahindra-1707228441.png', 'maserati-1707228475.png',
    'mazda-1707228490.png', 'mercedes-1707228505.png', 'mini-1707228534.png',
    'mitsubishi-1707228551.png', 'nissan-1707228569.png', 'opel-1707228581.png',
    'peugeot-1707228598.png', 'porsche-1707228614.png', 'renault-1707228630.png',
    'seat-1707228641.png', 'skoda-1707228661.png', 'ssangyong-1707228673.png',
    'subaru-1707228691.png', 'suzuki-1707228719.png', 'tesla-1738948636.png',
    'toyota-1707228730.png', 'volkswagen-1707228743.png', 'volvo-1707228777.png'
  ];
  function fillBrandsMarquee() {
    var track = $('brandsTrack');
    if (!track) return;
    // On ajoute deux fois les logos pour que la boucle CSS soit fluide
    // (translateX de -50% à 0 revient au point de départ sans à-coup).
    var render = function () {
      BRAND_FILES.forEach(function (file) {
        var img = document.createElement('img');
        img.src = 'assets/brands/' + file;
        img.alt = file.split('-')[0];
        img.loading = 'lazy';
        img.width = 100;
        img.height = 42;
        track.appendChild(img);
      });
    };
    render(); render();
  }

  // ── Menu mobile ──────────────────────────────────────────
  function wireMenu() {
    var burger = $('burger');
    var links = $('navLinks');
    if (!burger || !links) return;
    burger.addEventListener('click', function () {
      links.classList.toggle('is-open');
    });
    links.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') links.classList.remove('is-open');
    });
  }

  // ── Flotte ───────────────────────────────────────────────
  var FUEL_FR = {
    diesel: 'Diesel', gasoline: 'Essence', petrol: 'Essence', essence: 'Essence',
    hybrid: 'Hybride', electric: 'Électrique', lpg: 'GPL'
  };
  var TRANS_FR = {
    manual: 'Manuelle', automatic: 'Automatique',
    semi_automatic: 'Semi-automatique', cvt: 'Automatique'
  };

  function label(map, value) {
    if (!value) return null;
    return map[String(value).toLowerCase()] || value;
  }

  function money(amount) {
    return Number(amount).toLocaleString('fr-MA') + ' MAD';
  }

  function vehicleCard(v) {
    var name = [v.brand, v.model].filter(Boolean).join(' ') || 'Véhicule';

    var el = document.createElement('article');
    el.className = 'car';
    el.dataset.category = inferCategory(v);

    var media = document.createElement('div');
    media.className = 'car__photo';

    var badge = document.createElement('span');
    badge.className = 'car__badge';
    badge.textContent = v.categorie || (v.year ? 'Année ' + v.year : 'Nouveau');
    media.appendChild(badge);

    function fallbackLogo() {
      media.querySelectorAll('img').forEach(function (n) { n.remove(); });
      var logo = document.createElement('img');
      logo.src = 'assets/logo.png';
      logo.alt = 'Malysia Car';
      logo.loading = 'lazy';
      logo.style.objectFit = 'contain';
      logo.style.padding = '28px';
      logo.style.background = 'linear-gradient(135deg, #fbf5e4, #ece2c6)';
      media.appendChild(logo);
    }
    if (v.photo_url) {
      var img = document.createElement('img');
      img.src = API.replace(/\/api$/, '') + v.photo_url;
      img.alt = name;
      img.loading = 'lazy';
      img.onerror = fallbackLogo;
      media.appendChild(img);
    } else {
      fallbackLogo();
    }

    var body = document.createElement('div');
    body.className = 'car__body';

    var title = document.createElement('h3');
    title.className = 'car__name';
    title.textContent = name;
    body.appendChild(title);

    var sub = document.createElement('p');
    sub.className = 'car__sub';
    sub.textContent = [v.year, v.color].filter(Boolean).join(' · ') || 'Entretien suivi';
    body.appendChild(sub);

    var specs = document.createElement('div');
    specs.className = 'car__specs';
    [
      { icon: 'fuel', text: label(FUEL_FR, v.fuel) },
      { icon: 'gear', text: label(TRANS_FR, v.transmission) },
      { icon: 'seat', text: v.seats ? v.seats + ' places' : null }
    ].filter(function (s) { return s.text; }).forEach(function (s) {
      var sp = document.createElement('span');
      sp.className = 'car__spec';
      sp.innerHTML = iconSvg(s.icon) + '<span>' + s.text + '</span>';
      specs.appendChild(sp);
    });
    if (specs.children.length) body.appendChild(specs);

    var foot = document.createElement('div');
    foot.className = 'car__footer';

    var price = document.createElement('div');
    price.className = 'car__price';
    if (v.price_per_day) {
      price.innerHTML =
        '<span class="car__priceValue">' + Number(v.price_per_day).toLocaleString('fr-MA') + ' MAD</span>' +
        '<span class="car__priceLabel">/ jour</span>';
    } else {
      price.innerHTML =
        '<span class="car__priceValue">Sur devis</span>' +
        '<span class="car__priceLabel">tarif personnalisé</span>';
    }
    foot.appendChild(price);

    var pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'car__cta';
    pick.textContent = 'Réserver →';
    pick.addEventListener('click', function () { chooseVehicle(v.id, name); });
    foot.appendChild(pick);

    body.appendChild(foot);
    el.appendChild(media);
    el.appendChild(body);
    return el;
  }

  function iconSvg(name) {
    var paths = {
      fuel: '<path d="M3 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M3 11h10"/><path d="M14 7l3 3v8a2 2 0 1 0 4 0V9l-3-3"/>',
      gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
      seat: '<path d="M4 18V9a3 3 0 0 1 3-3h2v8H4z"/><path d="M4 18h16"/><path d="M14 6h3a3 3 0 0 1 3 3v9h-6V6z"/>'
    };
    return '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || '') + '</svg>';
  }

  function inferCategory(v) {
    var raw = ((v.categorie || v.category || v.body || '') + '').toLowerCase();
    var model = ((v.model || '') + ' ' + (v.brand || '')).toLowerCase();
    if (raw.indexOf('suv') >= 0 || /range|x5|q5|q7|cayenne|touareg|land/i.test(model)) return 'suv';
    if (raw.indexOf('sport') >= 0 || /gt-r|911|m3|m5|supra|amg/i.test(model)) return 'sportive';
    if (raw.indexOf('premium') >= 0 || raw.indexOf('luxe') >= 0 ||
        /mercedes|bmw|audi|porsche|lexus|jaguar|maserati|tesla/i.test(model)) return 'premium';
    if (raw.indexOf('berline') >= 0 || /class|accord|camry|a4|a6|serie/i.test(model)) return 'berline';
    if (raw.indexOf('citadine') >= 0 || /clio|208|polo|yaris|picanto|i10|sandero/i.test(model)) return 'citadine';
    return 'all';
  }

  function wireFleetFilters() {
    var bar = $('fleetFilters');
    var grid = $('fleetGrid');
    if (!bar || !grid) return;
    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('.chip');
      if (!btn) return;
      bar.querySelectorAll('.chip').forEach(function (b) { b.classList.remove('chip--active'); });
      btn.classList.add('chip--active');
      var filter = btn.dataset.filter;
      grid.querySelectorAll('.car').forEach(function (card) {
        var cat = card.dataset.category || 'all';
        card.style.display = (filter === 'all' || cat === filter) ? '' : 'none';
      });
    });
  }

  // DateField : lie l'<input type="date"> au <span> overlay qui affiche
  // JJ/MM/AAAA. Le picker natif s'ouvre quand on clique sur le champ ;
  // on reformate juste la valeur a l'ecran pour forcer le format FR.
  function wireDateFields(scope) {
    var displays = (scope || document).querySelectorAll('.dateField__display');
    for (var i = 0; i < displays.length; i++) {
      (function (display) {
        var input = document.getElementById(display.getAttribute('data-for'));
        if (!input) return;
        function refresh() {
          var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.value);
          if (m) {
            display.textContent = m[3] + '/' + m[2] + '/' + m[1];
            display.dataset.empty = 'false';
          } else {
            display.textContent = 'JJ/MM/AAAA';
            display.dataset.empty = 'true';
          }
        }
        input.addEventListener('input', refresh);
        input.addEventListener('change', refresh);
        // Si l'utilisateur tape sur le champ (y compris sur l'overlay),
        // on ouvre le picker natif quand le navigateur le permet.
        function openPicker() {
          try { if (typeof input.showPicker === 'function') input.showPicker(); }
          catch (_) {}
        }
        display.addEventListener('click', openPicker);
        input.addEventListener('focus', openPicker);
        refresh();
      })(displays[i]);
    }
  }

  // ── Barre de recherche hero ─────────────────────────────
  function wireSearchbar() {
    var form = $('searchForm');
    var quote = $('quoteForm');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var pickup = $('searchPickup').value;
      var ret = $('searchReturn').value;
      if (quote) {
        if (pickup && quote.elements.pickup_at) quote.elements.pickup_at.value = pickup;
        if (ret && quote.elements.return_at) quote.elements.return_at.value = ret;
      }
      var target = document.getElementById('flotte') || quote;
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ── Agences : clic sur une carte → re-centre l'iframe ──
  function wireAgencies() {
    var list = $('agenciesList');
    var frame = $('agencyMapFrame');
    if (!list || !frame) return;
    list.addEventListener('click', function (e) {
      var card = e.target.closest('.agency');
      if (!card) return;
      list.querySelectorAll('.agency').forEach(function (c) { c.classList.remove('agency--active'); });
      card.classList.add('agency--active');
      var lat = parseFloat(card.dataset.lat);
      var lng = parseFloat(card.dataset.lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        var dLat = 0.08, dLng = 0.15;
        var bbox = (lng - dLng) + ',' + (lat - dLat) + ',' + (lng + dLng) + ',' + (lat + dLat);
        frame.src = 'https://www.openstreetmap.org/export/embed.html?bbox=' + bbox +
          '&layer=mapnik&marker=' + lat + ',' + lng;
      }
    });
  }

  // Catalogue complet marques + modeles charge depuis le backend. Les
  // selections courantes vivent dans deux Set() pour que le toggle d'une
  // chip soit immediat.
  var CATALOG = { brands: [], models: [], modelsByBrand: {}, brandById: {} };
  var SELECTED_BRANDS = new Set();   // ids
  var SELECTED_MODELS = new Set();   // ids

  function chooseVehicle(id, name) {
    var select = $('vehicleSelect');
    if (select && id) select.value = id;
    togglePreferences();
    var form = $('quoteForm');
    if (form) {
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var note = $('quoteNote');
      if (note) {
        note.className = 'formNote';
        note.textContent = name + ' — complétez vos dates, on vous rappelle.';
      }
    }
  }

  // ── Catalogue public : marques + modeles complets de la base ──
  function loadCatalog() {
    if (!API) return;
    fetch(API + '/v1/public/site/catalog', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (payload) {
        var data = (payload && payload.data) || payload || {};
        var brands = Array.isArray(data.brands) ? data.brands : [];
        var models = Array.isArray(data.models) ? data.models : [];
        CATALOG.brands = brands;
        CATALOG.models = models;
        CATALOG.brandById = {};
        brands.forEach(function (b) { CATALOG.brandById[b.id] = b; });
        CATALOG.modelsByBrand = {};
        models.forEach(function (m) {
          if (!m.brand_id) return;
          (CATALOG.modelsByBrand[m.brand_id] = CATALOG.modelsByBrand[m.brand_id] || []).push(m);
        });
        renderBrandChips('');
        renderModelChips('');
        wireChipsSearch();
      })
      .catch(function () {
        // Silence : le visiteur peut toujours envoyer sa demande via Message.
      });
  }

  // Mapping marque -> fichier logo (meme dossier que le marquee).
  // On fabrique la cle a partir du nom (lowercase + espaces → tirets) et on
  // trouve le fichier qui commence par cette cle. Fallback : premiere lettre.
  function brandLogo(name) {
    if (!name) return null;
    var key = String(name).toLowerCase().trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    var match = BRAND_FILES.find(function (f) { return f.indexOf(key + '-') === 0; });
    return match ? 'assets/brands/' + match : null;
  }

  function brandInitial(name) {
    return (name || '?').charAt(0).toUpperCase();
  }

  function renderBrandChips(filter) {
    var host = $('brandChips');
    if (!host) return;
    host.innerHTML = '';
    var q = (filter || '').trim().toLowerCase();
    var list = CATALOG.brands.filter(function (b) {
      return !q || b.name.toLowerCase().indexOf(q) >= 0;
    });
    if (list.length === 0) {
      var empty = document.createElement('div');
      empty.style.cssText = 'grid-column: 1/-1; padding: 20px; text-align: center; color: var(--mist); font-size: 12px; font-style: italic;';
      empty.textContent = q
        ? 'Aucune marque ne correspond à votre recherche.'
        : 'Catalogue de marques en cours de chargement…';
      host.appendChild(empty);
      updateBrandCount();
      return;
    }
    list.forEach(function (b) {
      var card = document.createElement('button');
      card.type = 'button';
      var isOn = SELECTED_BRANDS.has(b.id);
      card.className = 'brandCard' + (isOn ? ' brandCard--on' : '');
      card.dataset.brandId = b.id;
      card.title = b.name;

      // Logo (ou fallback initiale cerclee dorée si pas d'image).
      var logoUrl = brandLogo(b.name);
      if (logoUrl) {
        var img = document.createElement('img');
        img.className = 'brandCard__logo';
        img.src = logoUrl;
        img.alt = b.name;
        img.loading = 'lazy';
        img.onerror = function () { img.remove(); card.insertBefore(fallbackInitial(b.name), card.firstChild); };
        card.appendChild(img);
      } else {
        card.appendChild(fallbackInitial(b.name));
      }

      var label = document.createElement('span');
      label.className = 'brandCard__name';
      label.textContent = b.name;
      card.appendChild(label);

      if (isOn) {
        var check = document.createElement('span');
        check.className = 'brandCard__check';
        check.textContent = '✓';
        card.appendChild(check);
      }

      card.addEventListener('click', function () { toggleBrand(b.id); });
      host.appendChild(card);
    });
    updateBrandCount();
  }

  function fallbackInitial(name) {
    var span = document.createElement('span');
    span.style.cssText =
      'width:48px;height:32px;display:inline-flex;align-items:center;justify-content:center;' +
      'background:linear-gradient(135deg,var(--gold),var(--gold-light));' +
      'color:#fff;font-weight:900;border-radius:6px;font-size:13px;';
    span.textContent = brandInitial(name);
    return span;
  }

  function renderModelChips(filter) {
    var host = $('modelChips');
    var hint = $('modelHint');
    var field = $('modelField');
    if (!host || !field) return;
    var brandIds = Array.from(SELECTED_BRANDS);
    if (brandIds.length === 0) {
      field.hidden = false;
      host.innerHTML = '';
      if (hint) hint.hidden = false;
      updateModelCount();
      return;
    }
    field.hidden = false;
    if (hint) hint.hidden = true;
    host.innerHTML = '';
    var q = (filter || '').trim().toLowerCase();
    var collected = [];
    brandIds.forEach(function (bid) {
      (CATALOG.modelsByBrand[bid] || []).forEach(function (m) {
        if (!q || m.name.toLowerCase().indexOf(q) >= 0) collected.push(m);
      });
    });
    var seen = {};
    collected = collected.filter(function (m) {
      if (seen[m.id]) return false;
      seen[m.id] = true;
      return true;
    });
    collected.sort(function (a, b) {
      var ab = (a.brand_name || '').localeCompare(b.brand_name || '');
      return ab !== 0 ? ab : (a.name || '').localeCompare(b.name || '');
    });
    if (collected.length === 0) {
      var empty = document.createElement('span');
      empty.className = 'prefs__chip prefs__chip--empty';
      empty.textContent = q
        ? 'Aucun modèle ne correspond à votre recherche.'
        : 'Aucun modèle disponible pour cette sélection.';
      host.appendChild(empty);
      updateModelCount();
      return;
    }
    collected.forEach(function (m) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'prefs__chip' + (SELECTED_MODELS.has(m.id) ? ' prefs__chip--on' : '');
      chip.innerHTML = '<small style="opacity:.6;font-weight:600;margin-right:4px;">' + (m.brand_name || '') + '</small>' + m.name;
      chip.dataset.modelId = m.id;
      chip.addEventListener('click', function () { toggleModel(m.id); });
      host.appendChild(chip);
    });
    updateModelCount();
  }

  function toggleBrand(id) {
    if (SELECTED_BRANDS.has(id)) {
      SELECTED_BRANDS.delete(id);
      (CATALOG.modelsByBrand[id] || []).forEach(function (m) {
        SELECTED_MODELS.delete(m.id);
      });
    } else {
      SELECTED_BRANDS.add(id);
    }
    syncHiddenSelects();
    renderBrandChips($('brandSearch') ? $('brandSearch').value : '');
    renderModelChips($('modelSearch') ? $('modelSearch').value : '');
  }

  function toggleModel(id) {
    if (SELECTED_MODELS.has(id)) SELECTED_MODELS.delete(id);
    else SELECTED_MODELS.add(id);
    syncHiddenSelects();
    renderModelChips($('modelSearch') ? $('modelSearch').value : '');
  }

  function updateBrandCount() {
    var el = $('brandCount');
    if (el) {
      var n = SELECTED_BRANDS.size;
      el.textContent = n + ' sélectionnée' + (n > 1 ? 's' : '');
      el.style.opacity = n ? '1' : '0.6';
    }
    var clear = $('brandClear');
    if (clear) clear.hidden = SELECTED_BRANDS.size === 0;
    updateSummary();
  }

  function updateModelCount() {
    var el = $('modelCount');
    if (el) {
      var n = SELECTED_MODELS.size;
      el.textContent = n + ' sélectionné' + (n > 1 ? 's' : '');
      el.style.opacity = n ? '1' : '0.6';
    }
    var clear = $('modelClear');
    if (clear) clear.hidden = SELECTED_MODELS.size === 0;
    updateSummary();
  }

  // Résumé en direct : explique au visiteur ce qu'il envoie, pour qu'il
  // comprenne l'algorithme sans ouvrir la documentation.
  function updateSummary() {
    var box = $('prefsSummary');
    var txt = $('prefsSummaryText');
    if (!box || !txt) return;
    var bn = SELECTED_BRANDS.size;
    var mn = SELECTED_MODELS.size;
    if (bn === 0 && mn === 0) { box.hidden = true; return; }
    box.hidden = false;
    var brandNames = Array.from(SELECTED_BRANDS)
      .map(function (id) { return (CATALOG.brandById[id] || {}).name; })
      .filter(Boolean);
    var parts = [];
    if (brandNames.length) {
      parts.push('<strong>' + brandNames.slice(0, 3).join(', ') +
        (brandNames.length > 3 ? ' +' + (brandNames.length - 3) : '') + '</strong>');
    }
    if (mn > 0) parts.push(mn + ' modèle' + (mn > 1 ? 's' : '') + ' précis');
    txt.innerHTML = 'Nous chercherons un véhicule disponible chez ' + parts.join(' · ') +
      '. Si tout est pris, on vous propose le modèle le plus proche.';
  }

  function syncHiddenSelects() {
    // Les anciens <select multiple> caches restent remplis avec les noms
    // selectionnes, pour que wireForm (envoi) renvoie les memes labels
    // qu'avant au backend (vehicle_label texte).
    var bs = $('brandSelect');
    var ms = $('modelSelect');
    if (bs) {
      bs.innerHTML = '';
      SELECTED_BRANDS.forEach(function (id) {
        var b = CATALOG.brandById[id];
        var o = document.createElement('option');
        o.value = b ? b.name : id;
        o.textContent = o.value;
        o.selected = true;
        bs.appendChild(o);
      });
    }
    if (ms) {
      ms.innerHTML = '';
      SELECTED_MODELS.forEach(function (id) {
        var m = CATALOG.models.find(function (x) { return x.id === id; });
        var o = document.createElement('option');
        o.value = m ? m.name : id;
        o.textContent = o.value;
        o.selected = true;
        ms.appendChild(o);
      });
    }
  }

  function wireChipsSearch() {
    var bs = $('brandSearch');
    var ms = $('modelSearch');
    if (bs && !bs.dataset.wired) {
      bs.dataset.wired = '1';
      bs.addEventListener('input', function () { renderBrandChips(bs.value); });
    }
    if (ms && !ms.dataset.wired) {
      ms.dataset.wired = '1';
      ms.addEventListener('input', function () { renderModelChips(ms.value); });
    }
    var bc = $('brandClear');
    if (bc && !bc.dataset.wired) {
      bc.dataset.wired = '1';
      bc.addEventListener('click', function () {
        SELECTED_BRANDS.clear();
        SELECTED_MODELS.clear();
        syncHiddenSelects();
        renderBrandChips(bs ? bs.value : '');
        renderModelChips(ms ? ms.value : '');
      });
    }
    var mc = $('modelClear');
    if (mc && !mc.dataset.wired) {
      mc.dataset.wired = '1';
      mc.addEventListener('click', function () {
        SELECTED_MODELS.clear();
        syncHiddenSelects();
        renderModelChips(ms ? ms.value : '');
      });
    }
  }

  function togglePreferences() {
    var vehicleSelect = $('vehicleSelect');
    var block = $('prefsBlock');
    if (!vehicleSelect || !block) return;
    block.hidden = !!vehicleSelect.value;
  }

  function loadFleet() {
    var grid = $('fleetGrid');
    var note = $('fleetNote');
    if (!grid || !API) return;

    fetch(API + '/v1/public/site/vehicles', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (payload) {
        var list = (payload && payload.data) || [];
        grid.innerHTML = '';
        if (!list.length) {
          note.textContent = 'La flotte est en cours de mise à jour — appelez-nous, nous vous dirons ce qui est disponible.';
          return;
        }
        var select = $('vehicleSelect');
        list.forEach(function (v) {
          grid.appendChild(vehicleCard(v));
          if (select) {
            var opt = document.createElement('option');
            opt.value = v.id;
            opt.textContent = [v.brand, v.model].filter(Boolean).join(' ')
              + (v.price_per_day ? ' — ' + money(v.price_per_day) + '/j' : '');
            select.appendChild(opt);
          }
        });
        // Les marques et modeles du formulaire ne viennent plus de la flotte
        // visible : loadCatalog() les tire de l'API /public/site/catalog
        // pour couvrir tout le referentiel.
        var fact = $('factFleet');
        if (fact) fact.textContent = list.length;
        note.textContent = 'Tarifs à la journée, dégressifs à la semaine et au mois. Disponibilité confirmée par téléphone.';
      })
      .catch(function () {
        grid.innerHTML = '';
        note.textContent = 'La flotte n\'a pas pu être chargée. Appelez-nous, nous vous proposons ce qui est libre.';
      });
  }

  // ── Popup de confirmation ────────────────────────────────
  var lastFocused = null;

  function openDone(reference) {
    var modal = $('doneModal');
    if (!modal) return;

    var ref = $('doneRef');
    if (ref) {
      if (reference) {
        ref.querySelector('strong').textContent = reference;
        ref.hidden = false;
      } else {
        ref.hidden = true;
      }
    }

    var wa = $('doneWa');
    var fab = $('waFab');
    if (wa) {
      if (fab && fab.href && fab.style.display !== 'none') {
        wa.href = fab.href;
        wa.style.display = '';
      } else {
        wa.style.display = 'none';
      }
    }

    // Replay the circle+check animation every time the modal opens — CSS
    // keyframes only run on first mount, so cloning the SVG restarts them.
    var checkWrap = modal.querySelector('.modal__check');
    if (checkWrap) {
      var clone = checkWrap.cloneNode(true);
      checkWrap.parentNode.replaceChild(clone, checkWrap);
    }

    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    var closeBtn = modal.querySelector('.modal__x');
    if (closeBtn) closeBtn.focus();
  }

  function closeDone() {
    var modal = $('doneModal');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function wireModal() {
    var modal = $('doneModal');
    if (!modal) return;
    modal.addEventListener('click', function (e) {
      if (e.target.hasAttribute && e.target.hasAttribute('data-close')) closeDone();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDone();
    });
  }

  // ── Demande de réservation ───────────────────────────────
  function wireForm() {
    var form = $('quoteForm');
    var note = $('quoteNote');
    var submit = $('quoteSubmit');
    if (!form) return;

    // Les champs date sont des <input type="date"> habilles d'un overlay
    // JJ/MM/AAAA (voir wireDateFields). Rien a wirer ici.

    var vehicleSelect = $('vehicleSelect');
    if (vehicleSelect) {
      vehicleSelect.addEventListener('change', togglePreferences);
      togglePreferences();
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!API) return;

      // Build vehicle_label from the specific pick, OR from the "Peu importe"
      // preference multi-selects — so agents still see what the client wants.
      var vehicleId = form.elements.vehicle_id.value || null;
      var vehicleLabel = null;
      if (vehicleId) {
        vehicleLabel = form.elements.vehicle_id.selectedOptions[0]
          ? form.elements.vehicle_id.selectedOptions[0].textContent.split(' — ')[0]
          : null;
      } else {
        // Resoudre les UUID selectionnes en noms lisibles via le catalogue
        // (sinon l'agent voit juste une liste d'UUID dans « vehicle_label »).
        var brandNames = Array.from(SELECTED_BRANDS)
          .map(function (id) { return (CATALOG.brandById[id] || {}).name; })
          .filter(Boolean);
        var modelsById = {};
        (CATALOG.models || []).forEach(function (m) { modelsById[m.id] = m; });
        var modelNames = Array.from(SELECTED_MODELS)
          .map(function (id) {
            var m = modelsById[id];
            if (!m) return null;
            return (m.brand_name ? m.brand_name + ' ' : '') + m.name;
          })
          .filter(Boolean);
        if (brandNames.length || modelNames.length) {
          var parts = [];
          if (brandNames.length) parts.push('Marques: ' + brandNames.join(', '));
          if (modelNames.length) parts.push('Modèles: ' + modelNames.join(', '));
          vehicleLabel = ('Peu importe · ' + parts.join(' · ')).slice(0, 160);
        }
      }

      // <input type="date"> renvoie deja une ISO YYYY-MM-DD valide.
      function toIso(iso) {
        if (!iso) return null;
        return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
      }

      var pickupIso = toIso(form.elements.pickup_at.value.trim());
      var returnIso = toIso(form.elements.return_at.value.trim());

      var data = {
        full_name: form.elements.full_name.value.trim(),
        phone: form.elements.phone.value.trim(),
        vehicle_id: vehicleId,
        vehicle_label: vehicleLabel,
        pickup_at: pickupIso,
        return_at: returnIso,
        message: form.elements.message.value.trim() || null,
        website: form.elements.website.value
      };

      if (form.elements.pickup_at.value && !pickupIso) {
        note.className = 'formNote formNote--err';
        note.textContent = 'Date de départ invalide.';
        return;
      }
      if (form.elements.return_at.value && !returnIso) {
        note.className = 'formNote formNote--err';
        note.textContent = 'Date de retour invalide.';
        return;
      }

      if (!data.full_name || !data.phone) {
        note.className = 'formNote formNote--err';
        note.textContent = 'Votre nom et votre téléphone sont nécessaires pour vous rappeler.';
        return;
      }
      if (data.pickup_at && data.return_at && data.return_at < data.pickup_at) {
        note.className = 'formNote formNote--err';
        note.textContent = 'La date de retour doit suivre la date de départ.';
        return;
      }
      if (!data.vehicle_id) delete data.vehicle_id;

      submit.disabled = true;
      note.className = 'formNote';
      note.textContent = 'Envoi en cours…';

      fetch(API + '/v1/public/site/reservation-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data)
      })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (body) {
            return { ok: r.ok, status: r.status, body: body };
          });
        })
        .then(function (res) {
          if (res.ok) {
            var ref = (res.body && res.body.data && res.body.data.reference) || '';
            form.reset();
            SELECTED_BRANDS.clear();
            SELECTED_MODELS.clear();
            syncHiddenSelects();
            renderBrandChips('');
            renderModelChips('');
            togglePreferences();
            note.className = 'formNote';
            note.textContent = '';
            openDone(ref);
            return;
          }
          if (res.status === 429) {
            note.className = 'formNote formNote--err';
            note.textContent = 'Trop de demandes envoyées. Réessayez dans quelques minutes ou appelez-nous.';
            return;
          }
          var msg = (res.body && res.body.message) || 'Envoi impossible pour le moment.';
          note.className = 'formNote formNote--err';
          note.textContent = msg + ' Vous pouvez aussi nous appeler.';
        })
        .catch(function () {
          note.className = 'formNote formNote--err';
          note.textContent = 'Connexion impossible. Appelez-nous ou écrivez-nous sur WhatsApp.';
        })
        .finally(function () { submit.disabled = false; });
    });
  }

  fillContacts();
  fillBrandsMarquee();
  wireMenu();
  wireModal();
  wireForm();
  wireSearchbar();
  wireDateFields();
  wireAgencies();
  wireFleetFilters();
  loadFleet();
  loadCatalog();
})();
