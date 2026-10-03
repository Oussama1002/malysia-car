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

    var tel = $('telLink');
    if (tel && CFG.phone) {
      tel.textContent = CFG.phone;
      tel.href = 'tel:' + CFG.phone.replace(/\s/g, '');
    }
    var mail = $('mailLink');
    if (mail && CFG.email) {
      mail.textContent = CFG.email;
      mail.href = 'mailto:' + CFG.email;
    }
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
    var chips = [
      v.year,
      label(FUEL_FR, v.fuel),
      label(TRANS_FR, v.transmission),
      v.categorie
    ].filter(Boolean);

    var el = document.createElement('article');
    el.className = 'card veh';

    var media = document.createElement('div');
    media.className = 'veh__media';
    function fallbackLogo() {
      media.innerHTML = '';
      media.classList.add('veh__media--fallback');
      var logo = document.createElement('img');
      logo.className = 'veh__logo';
      logo.src = 'assets/logo.png';
      logo.alt = 'Malysia Car';
      logo.loading = 'lazy';
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
    body.className = 'veh__body';

    var title = document.createElement('div');
    title.className = 'veh__name';
    title.textContent = name;
    body.appendChild(title);

    if (chips.length) {
      var meta = document.createElement('div');
      meta.className = 'veh__meta';
      chips.forEach(function (c) {
        var chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = c;
        meta.appendChild(chip);
      });
      body.appendChild(meta);
    }

    var foot = document.createElement('div');
    foot.className = 'veh__foot';

    var price = document.createElement('div');
    price.className = 'veh__price';
    if (v.price_per_day) {
      price.innerHTML = '<strong>' + money(v.price_per_day) + '</strong> <span>/ jour</span>';
    } else {
      price.innerHTML = '<span>Tarif sur demande</span>';
    }
    foot.appendChild(price);

    var pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'btn btn--sm';
    pick.textContent = 'Réserver';
    pick.addEventListener('click', function () { chooseVehicle(v.id, name); });
    foot.appendChild(pick);

    body.appendChild(foot);
    el.appendChild(media);
    el.appendChild(body);
    return el;
  }

  var SITE_BRAND_MODELS = {};

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

  function populatePreferences(brandModels) {
    var brandSelect = $('brandSelect');
    var modelSelect = $('modelSelect');
    if (!brandSelect || !modelSelect) return;
    brandSelect.innerHTML = '';
    Object.keys(brandModels).sort().forEach(function (b) {
      var opt = document.createElement('option');
      opt.value = b;
      opt.textContent = b;
      brandSelect.appendChild(opt);
    });
    refreshModels();
    brandSelect.addEventListener('change', refreshModels);
  }

  function refreshModels() {
    var brandSelect = $('brandSelect');
    var modelSelect = $('modelSelect');
    if (!brandSelect || !modelSelect) return;
    var picked = Array.from(brandSelect.selectedOptions).map(function (o) { return o.value; });
    var brands = picked.length ? picked : Object.keys(SITE_BRAND_MODELS);
    var models = new Set();
    brands.forEach(function (b) {
      (SITE_BRAND_MODELS[b] || []).forEach(function (m) { models.add(m); });
    });
    modelSelect.innerHTML = '';
    Array.from(models).sort().forEach(function (m) {
      var opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      modelSelect.appendChild(opt);
    });
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
        // Pré-calcule {marque: Set<modèle>} depuis la flotte pour alimenter les
        // menus de préférences quand le client choisit "Peu importe".
        var brandModels = {};
        list.forEach(function (v) {
          grid.appendChild(vehicleCard(v));
          if (select) {
            var opt = document.createElement('option');
            opt.value = v.id;
            opt.textContent = [v.brand, v.model].filter(Boolean).join(' ')
              + (v.price_per_day ? ' — ' + money(v.price_per_day) + '/j' : '');
            select.appendChild(opt);
          }
          var b = (v.brand || '').trim();
          var m = (v.model || '').trim();
          if (b) {
            if (!brandModels[b]) brandModels[b] = new Set();
            if (m) brandModels[b].add(m);
          }
        });
        SITE_BRAND_MODELS = brandModels;
        populatePreferences(brandModels);
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

    // Les dates passées n'ont pas de sens pour une location à venir.
    var today = new Date().toISOString().slice(0, 10);
    ['pickup_at', 'return_at'].forEach(function (name) {
      var input = form.elements[name];
      if (input) input.min = today;
    });

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
        var brandSel = $('brandSelect');
        var modelSel = $('modelSelect');
        var brands = brandSel ? Array.from(brandSel.selectedOptions).map(function (o) { return o.value; }) : [];
        var models = modelSel ? Array.from(modelSel.selectedOptions).map(function (o) { return o.value; }) : [];
        if (brands.length || models.length) {
          var parts = [];
          if (brands.length) parts.push('Marques: ' + brands.join(', '));
          if (models.length) parts.push('Modèles: ' + models.join(', '));
          vehicleLabel = ('Peu importe · ' + parts.join(' · ')).slice(0, 160);
        }
      }

      var data = {
        full_name: form.elements.full_name.value.trim(),
        phone: form.elements.phone.value.trim(),
        vehicle_id: vehicleId,
        vehicle_label: vehicleLabel,
        pickup_at: form.elements.pickup_at.value || null,
        return_at: form.elements.return_at.value || null,
        message: form.elements.message.value.trim() || null,
        website: form.elements.website.value
      };

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
  wireMenu();
  wireModal();
  wireForm();
  loadFleet();
})();
