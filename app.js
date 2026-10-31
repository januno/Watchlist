(function () {
    'use strict';

    // ---------- Auto-fill setup: choose ONE option, or leave both empty ----------
    // Option A (best): the address of your Cloudflare Worker, which holds your TMDB key privately.
    //   Example: 'https://watchlist-search.yourname.workers.dev'
    var TMDB_PROXY = '';
    // Option B (simplest): your own TMDB key. Anyone who views the page source can see it.
    var TMDB_BUILTIN_KEY = '2f36b3c0269f68cee6ad360135a2bdd7';
    // If both are empty, each person can paste their own free TMDB key in Settings instead.

    var KEY = 'watchlist-manager.v1';
    var CATEGORIES = ['Movie', 'Series', 'Drama', 'Anime', 'Other'];
    var STATUSES = ['Completed', 'Watching', 'Plan to watch'];
    var VIEWS = {
        'home':        { title: "Everything you've watched", status: null },
        'completed':   { title: 'Completed',          status: 'Completed' },
        'watch-later': { title: 'Watch later',        status: 'Plan to watch' },
        'watching':    { title: 'Currently watching', status: 'Watching' }
    };

    var state = {
        items: [],
        view: 'home',
        category: '',
        query: '',
        editingId: null,
        formImage: '',        // picture currently chosen in the form
        fileImage: false,     // true when formImage came from an uploaded photo
        busy: false           // true while a photo is being processed
    };

    // ---------- small helpers ----------
    function $(id) { return document.getElementById(id); }

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;   // textContent: never interprets HTML
        return n;
    }

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    var toastTimer;
    function toast(msg) {
        var t = $('toast');
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
    }

    // ---------- data checks (used for stored data and imported files) ----------
    function safeImage(v) {
        v = String(v || '');
        if (/^https?:\/\//i.test(v) && v.length < 2000) return v;
        if (/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(v) && v.length < 400000) return v;
        return '';
    }

    function clean(o) {
        if (!o || typeof o !== 'object') return null;
        var title = String(o.title || '').trim().slice(0, 200);
        if (!title) return null;
        var rating = parseInt(o.rating, 10);
        if (!(rating >= 1 && rating <= 10)) rating = null;
        return {
            id: String(o.id || uid()),
            title: title,
            category: CATEGORIES.indexOf(o.category) > -1 ? o.category : 'Other',
            status: STATUSES.indexOf(o.status) > -1 ? o.status : 'Completed',
            rating: rating,
            notes: String(o.notes || '').slice(0, 2000),
            image: safeImage(o.image),
            added: Number(o.added) || Date.now()
        };
    }

    // ---------- storage ----------
    function load() {
        try {
            var raw = localStorage.getItem(KEY);
            var data = raw ? JSON.parse(raw) : [];
            return Array.isArray(data) ? data.map(clean).filter(Boolean) : [];
        } catch (e) {
            return [];
        }
    }

    function save() {
        try {
            localStorage.setItem(KEY, JSON.stringify(state.items));
            if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
            return true;
        } catch (e) {
            toast('Could not save. Storage may be full or blocked in private mode.');
            return false;
        }
    }

    // ---------- rendering ----------
    function visibleItems() {
        var status = VIEWS[state.view].status;
        var q = state.query.trim().toLowerCase();
        return state.items.filter(function (i) {
            if (status && i.status !== status) return false;
            if (state.category && i.category !== state.category) return false;
            if (q && i.title.toLowerCase().indexOf(q) === -1) return false;
            return true;
        }).sort(function (a, b) { return b.added - a.added; });
    }

    function card(item) {
        var c = el('article', 'card');
        var wrap = el('div', 'poster-wrap');
        if (item.image) {
            var img = el('img', 'poster');
            img.src = item.image;
            img.alt = item.title + ' picture';
            img.loading = 'lazy';
            wrap.appendChild(img);
        } else {
            wrap.appendChild(el('div', 'poster blank', (Array.from(item.title)[0] || '?').toUpperCase()));
        }
        if (item.rating) wrap.appendChild(el('span', 'rating', '★ ' + item.rating + '/10'));
        c.appendChild(wrap);

        var body = el('div', 'card-body');
        body.appendChild(el('h3', '', item.title));
        var chips = el('div', 'chips');
        chips.appendChild(el('span', 'chip', item.category));
        chips.appendChild(el('span', 'chip', item.status));
        body.appendChild(chips);
        if (item.notes) body.appendChild(el('p', 'notes', item.notes));

        var actions = el('div', 'card-actions');
        var edit = el('button', 'btn ghost small', 'Edit');
        edit.type = 'button';
        edit.addEventListener('click', function () { openForm(item.id); });
        var del = el('button', 'btn danger small', 'Delete');
        del.type = 'button';
        del.addEventListener('click', function () { removeItem(item.id); });
        actions.appendChild(edit);
        actions.appendChild(del);
        body.appendChild(actions);
        c.appendChild(body);
        return c;
    }

    function renderFilters() {
        var box = $('filters');
        box.textContent = '';
        ['All'].concat(CATEGORIES).forEach(function (name) {
            var value = name === 'All' ? '' : name;
            var b = el('button', value === state.category ? 'on' : '', name);
            b.type = 'button';
            b.addEventListener('click', function () {
                state.category = value;
                render();
            });
            box.appendChild(b);
        });
    }

    function render() {
        var view = VIEWS[state.view];
        var items = visibleItems();

        $('pageTitle').textContent = view.title;
        $('pageCount').textContent = items.length + (items.length === 1 ? ' title' : ' titles') +
            (state.category ? ' in ' + state.category : '');

        Array.prototype.forEach.call($('tabbar').children, function (b) {
            if (b.dataset.view === state.view) b.setAttribute('aria-current', 'page');
            else b.removeAttribute('aria-current');
        });

        renderFilters();

        var grid = $('grid');
        grid.textContent = '';
        items.forEach(function (i) { grid.appendChild(card(i)); });
        grid.hidden = items.length === 0;

        var empty = $('empty');
        empty.hidden = items.length !== 0;
        if (items.length === 0) {
            var searching = state.query.trim() || state.category;
            $('emptyText').textContent = searching
                ? 'Nothing matches that.'
                : (state.items.length === 0 && state.view === 'home'
                    ? "Nothing here yet. Add the first title you've watched."
                    : 'No titles in this list yet.');
        }
    }

    // ---------- add / edit form ----------
    function resizeImage(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onerror = function () { reject(new Error('read')); };
            reader.onload = function () {
                var img = new Image();
                img.onerror = function () { reject(new Error('decode')); };
                img.onload = function () {
                    var max = 400;
                    var scale = Math.min(1, max / Math.max(img.width, img.height));
                    var c = document.createElement('canvas');
                    c.width = Math.max(1, Math.round(img.width * scale));
                    c.height = Math.max(1, Math.round(img.height * scale));
                    var ctx = c.getContext('2d');
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, c.width, c.height);
                    ctx.drawImage(img, 0, 0, c.width, c.height);
                    resolve(c.toDataURL('image/jpeg', 0.8));
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
    }

    function showPreview() {
        var has = !!state.formImage;
        $('preview').hidden = !has;
        if (has) $('previewImg').src = state.formImage;
        else $('previewImg').removeAttribute('src');
    }

    function openForm(id) {
        var item = id ? state.items.filter(function (i) { return i.id === id; })[0] : null;
        state.editingId = item ? item.id : null;
        state.formImage = item ? item.image : '';
        state.fileImage = false;
        state.busy = false;

        $('formTitle').textContent = item ? 'Edit title' : 'Add a title';
        $('fTitle').value = item ? item.title : '';
        $('fCategory').value = item ? item.category : 'Movie';
        $('fStatus').value = item ? item.status : (VIEWS[state.view].status || 'Completed');
        $('fRating').value = item && item.rating ? item.rating : '';
        $('fNotes').value = item ? item.notes : '';
        $('fFile').value = '';
        $('fUrl').value = '';
        showPreview();
        $('fSearch').value = '';
        $('results').textContent = '';
        clearTimeout(searchTimer);
        if (searchAbort) searchAbort.abort();
        updateLookupUI();
        $('formDlg').showModal();
        (!item && lookupReady() ? $('fSearch') : $('fTitle')).focus();
    }

    function submitForm(e) {
        e.preventDefault();
        if (state.busy) { toast('Still processing the picture, one moment.'); return; }

        var title = $('fTitle').value.trim();
        if (!title) { $('fTitle').focus(); return; }

        var image = state.formImage;
        if (!state.fileImage) {                       // an uploaded photo wins over a link
            var url = $('fUrl').value.trim();
            if (url) {
                if (!/^https?:\/\//i.test(url)) {
                    toast('The picture link must start with http:// or https://');
                    return;
                }
                image = url;
            }
        }

        var data = clean({
            id: state.editingId || uid(),
            title: title,
            category: $('fCategory').value,
            status: $('fStatus').value,
            rating: $('fRating').value,
            notes: $('fNotes').value,
            image: image,
            added: Date.now()
        });

        if (state.editingId) {
            state.items = state.items.map(function (i) {
                return i.id === state.editingId ? Object.assign(data, { added: i.added }) : i;
            });
        } else {
            state.items.push(data);
        }

        if (save()) {
            $('formDlg').close();
            render();
        }
    }

    function removeItem(id) {
        if (!confirm('Delete this title?')) return;
        state.items = state.items.filter(function (i) { return i.id !== id; });
        save();
        render();
    }

    // ---------- backup ----------
    function exportBackup() {
        var payload = { app: 'watchlist-manager', version: 1, items: state.items };
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'watchlist-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    }

    function importBackup(file) {
        var reader = new FileReader();
        reader.onerror = function () { toast('Could not read that file.'); };
        reader.onload = function () {
            var data;
            try { data = JSON.parse(reader.result); } catch (e) { toast('That is not a valid backup file.'); return; }
            var list = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : null);
            if (!list) { toast('That is not a valid backup file.'); return; }

            var added = 0;
            list.map(clean).filter(Boolean).forEach(function (n) {
                var idx = state.items.findIndex(function (i) { return i.id === n.id; });
                if (idx > -1) state.items[idx] = n; else state.items.push(n);
                added++;
            });
            if (save()) {
                render();
                updateStorageNote();
                toast(added + (added === 1 ? ' title restored.' : ' titles restored.'));
            }
        };
        reader.readAsText(file);
    }

    function updateStorageNote() {
        var bytes = 0;
        try { bytes = (localStorage.getItem(KEY) || '').length; } catch (e) { /* ignore */ }
        $('storageNote').textContent = state.items.length + (state.items.length === 1 ? ' title' : ' titles') +
            ' saved, about ' + (bytes / 1024 < 1000 ? Math.max(1, Math.round(bytes / 1024)) + ' KB' : (bytes / 1048576).toFixed(1) + ' MB') +
            ' of roughly 5 MB available.';
    }

    // ---------- TMDB auto-fill (optional, uses the person's own free key) ----------
    var TMDB_STORE = 'watchlist-manager.tmdb';
    var searchTimer = null;
    var searchAbort = null;

    function getKey() {
        try { return (localStorage.getItem(TMDB_STORE) || '').trim(); } catch (e) { return ''; }
    }

    function setKey(v) {
        try {
            if (v) localStorage.setItem(TMDB_STORE, v); else localStorage.removeItem(TMDB_STORE);
            return true;
        } catch (e) { return false; }
    }

    function tmdbFetch(key, path, params, signal) {
        var url = new URL('https://api.themoviedb.org/3' + path);
        Object.keys(params || {}).forEach(function (k) { url.searchParams.set(k, params[k]); });
        var headers = { Accept: 'application/json' };
        if (/^eyJ/.test(key)) headers.Authorization = 'Bearer ' + key;   // long "read access token"
        else url.searchParams.set('api_key', key);                       // short v3 key
        return fetch(url.toString(), { headers: headers, signal: signal }).then(function (r) {
            if (r.status === 401) throw new Error('badkey');
            if (!r.ok) throw new Error('http');
            return r.json();
        });
    }

    function sharedAccess() { return !!(TMDB_PROXY || TMDB_BUILTIN_KEY); }
    function lookupReady() { return sharedAccess() || !!getKey(); }

    function searchTmdb(q, signal) {
        if (TMDB_PROXY) {
            var url = TMDB_PROXY.replace(/\/+$/, '') + '/search?query=' + encodeURIComponent(q);
            return fetch(url, { headers: { Accept: 'application/json' }, signal: signal }).then(function (r) {
                if (r.status === 401 || r.status === 403) throw new Error('badkey');
                if (!r.ok) throw new Error('http');
                return r.json();
            });
        }
        return tmdbFetch(TMDB_BUILTIN_KEY || getKey(), '/search/multi', { query: q, include_adult: 'false' }, signal);
    }

    function setLookupMsg(t) { $('lookupMsg').textContent = t; }

    function updateLookupUI() {
        var has = lookupReady();
        $('fSearch').disabled = !has;
        $('setupKey').hidden = has;
        if (!has) {
            $('results').textContent = '';
            setLookupMsg('Auto-fill is off. Add a free TMDB key in Settings to fill in details by name, or fill the form in by hand.');
        } else if (!$('fSearch').value) {
            setLookupMsg('');
        }
    }

    function updateKeyStatus() {
        $('keyMsg').textContent = getKey() ? 'Auto-fill is on.' : 'Auto-fill is off.';
        $('fKey').value = '';
    }

    // turns one TMDB search result into the fields of our form
    function fromTmdb(r) {
        var isTv = r.media_type === 'tv';
        var genres = Array.isArray(r.genre_ids) ? r.genre_ids : [];
        var lang = r.original_language;
        var category;
        if (genres.indexOf(16) > -1 && lang === 'ja') category = 'Anime';
        else if (!isTv) category = 'Movie';
        else if (genres.indexOf(18) > -1 && ['ko', 'ja', 'zh', 'cn', 'th'].indexOf(lang) > -1) category = 'Drama';
        else category = 'Series';
        var path = /^\/[A-Za-z0-9_\-]+\.(jpg|jpeg|png|webp)$/.test(r.poster_path || '') ? r.poster_path : '';
        return {
            title: String((isTv ? r.name : r.title) || '').trim().slice(0, 200),
            year: String((isTv ? r.first_air_date : r.release_date) || '').slice(0, 4),
            kind: isTv ? 'TV' : 'Movie',
            category: category,
            overview: String(r.overview || ''),
            poster: path ? 'https://image.tmdb.org/t/p/w342' + path : '',
            thumb: path ? 'https://image.tmdb.org/t/p/w92' + path : ''
        };
    }

    function applyResult(m) {
        $('fTitle').value = m.title;
        $('fCategory').value = m.category;
        if (!$('fNotes').value.trim() && m.overview) $('fNotes').value = m.overview.slice(0, 600);
        if (!state.fileImage && m.poster) {
            state.formImage = m.poster;
            $('fUrl').value = '';
            showPreview();
        }
        $('results').textContent = '';
        $('fSearch').value = '';
        setLookupMsg('Filled in from TMDB. Check the details, pick a status, then Save.');
    }

    function showResults(list) {
        var ul = $('results');
        ul.textContent = '';
        var shown = 0;
        list.forEach(function (r) {
            var m = fromTmdb(r);
            if (!m.title) return;
            shown++;
            var li = el('li');
            var b = el('button', 'result');
            b.type = 'button';
            if (m.thumb) {
                var t = el('img', 'thumb');
                t.src = m.thumb; t.alt = ''; t.loading = 'lazy';
                b.appendChild(t);
            } else {
                b.appendChild(el('span', 'thumb blank', (Array.from(m.title)[0] || '?').toUpperCase()));
            }
            var txt = el('span', 'result-text');
            txt.appendChild(el('strong', '', m.title));
            txt.appendChild(el('small', '', (m.year ? m.year + ', ' : '') + m.kind));
            b.appendChild(txt);
            b.addEventListener('click', function () { applyResult(m); });
            li.appendChild(b);
            ul.appendChild(li);
        });
        setLookupMsg(shown ? 'Tap the right one:' : 'No matches. Try another spelling, or fill the form in by hand.');
    }

    function runSearch(q) {
        if (!lookupReady()) return;
        if (searchAbort) searchAbort.abort();
        searchAbort = ('AbortController' in window) ? new AbortController() : null;
        setLookupMsg('Searching...');
        searchTmdb(q, searchAbort && searchAbort.signal)
            .then(function (data) {
                if (q !== $('fSearch').value.trim()) return;           // ignore out-of-date answers
                var list = (data.results || []).filter(function (r) {
                    return r && (r.media_type === 'movie' || r.media_type === 'tv');
                }).slice(0, 6);
                showResults(list);
            })
            .catch(function (e) {
                if (e && e.name === 'AbortError') return;
                setLookupMsg(e && e.message === 'badkey'
                    ? (sharedAccess() ? 'Auto-fill is not working right now. You can fill the form in by hand.' : 'TMDB did not accept your key. Check it in Settings.')
                    : 'Could not reach TMDB. Check your connection, or fill the form in by hand.');
            });
    }

    function onSearchInput() {
        clearTimeout(searchTimer);
        var q = $('fSearch').value.trim();
        if (searchAbort) searchAbort.abort();
        $('results').textContent = '';
        if (q.length < 2) { setLookupMsg(''); return; }
        searchTimer = setTimeout(function () { runSearch(q); }, 450);
    }

    // ---------- wiring ----------
    function closeOnBackdrop(dlg) {
        dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    }

    function init() {
        state.items = load();

        $('addBtn').addEventListener('click', function () { openForm(null); });
        $('emptyAdd').addEventListener('click', function () { openForm(null); });
        $('search').addEventListener('input', function (e) { state.query = e.target.value; render(); });

        Array.prototype.forEach.call($('tabbar').children, function (b) {
            b.addEventListener('click', function () {
                state.view = b.dataset.view;
                render();
                window.scrollTo(0, 0);
            });
        });

        $('itemForm').addEventListener('submit', submitForm);
        $('cancelBtn').addEventListener('click', function () { $('formDlg').close(); });
        closeOnBackdrop($('formDlg'));
        closeOnBackdrop($('backupDlg'));

        $('fFile').addEventListener('change', function (e) {
            var file = e.target.files[0];
            if (!file) return;
            if (!/^image\//.test(file.type)) { toast('Please choose an image file.'); e.target.value = ''; return; }
            if (file.size > 20 * 1024 * 1024) { toast('That photo is too large.'); e.target.value = ''; return; }
            state.busy = true;
            resizeImage(file).then(function (dataUrl) {
                state.formImage = dataUrl;
                state.fileImage = true;
                showPreview();
            }).catch(function () {
                toast('Could not use that photo. Try a different one.');
                e.target.value = '';
            }).then(function () { state.busy = false; });
        });

        $('removeImg').addEventListener('click', function () {
            state.formImage = '';
            state.fileImage = false;
            $('fFile').value = '';
            showPreview();
        });

        $('backupBtn').addEventListener('click', function () {
            updateStorageNote();
            updateKeyStatus();
            $('backupDlg').showModal();
        });
        $('setupKey').addEventListener('click', function () {
            updateKeyStatus();
            $('backupDlg').showModal();
        });
        if (sharedAccess()) $('keySection').hidden = true;     // nobody needs their own key
        $('fSearch').addEventListener('input', onSearchInput);
        $('fSearch').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {                       // Enter searches; it must not submit the form
                e.preventDefault();
                clearTimeout(searchTimer);
                var q = $('fSearch').value.trim();
                if (q.length >= 2) runSearch(q);
            }
        });
        $('saveKey').addEventListener('click', function () {
            var key = $('fKey').value.trim();
            if (!key) { $('keyMsg').textContent = 'Paste your key first.'; return; }
            $('keyMsg').textContent = 'Checking the key...';
            tmdbFetch(key, '/authentication', {}).then(function () {
                if (setKey(key)) { updateKeyStatus(); updateLookupUI(); toast('Auto-fill is on.'); }
                else $('keyMsg').textContent = 'Could not save the key on this device.';
            }).catch(function (e) {
                $('keyMsg').textContent = e && e.message === 'badkey'
                    ? 'TMDB did not accept that key. Check that you copied all of it.'
                    : 'Could not reach TMDB. Check your connection and try again.';
            });
        });
        $('removeKey').addEventListener('click', function () {
            setKey('');
            updateKeyStatus();
            updateLookupUI();
        });
        $('closeBackup').addEventListener('click', function () { $('backupDlg').close(); });
        $('exportBtn').addEventListener('click', exportBackup);
        $('importFile').addEventListener('change', function (e) {
            if (e.target.files[0]) importBackup(e.target.files[0]);
            e.target.value = '';
        });
        $('eraseBtn').addEventListener('click', function () {
            if (!confirm('Erase your whole list from this device? This cannot be undone. Your TMDB key is kept.')) return;
            state.items = [];
            save();
            render();
            updateStorageNote();
            toast('Everything was erased.');
        });

        render();

        if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
            navigator.serviceWorker.register('sw.js').catch(function () { /* app still works online */ });
        }
    }

    init();
})();
