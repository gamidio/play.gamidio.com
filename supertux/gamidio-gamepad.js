/* Gamidio virtual gamepad for keyboard-driven games on touch screens (part of Gamidio's changes, same license as the game).
 *
 * Phones have no keyboard, so action games (platformers, shooters) cannot be played. This layer shows a gamepad over
 * the game on touch devices only and sends keyboard events for it:
 *   left side      joystick: drag from where the thumb lands; 8 directions -> the arrow keys (or the configured keys)
 *   right side     round buttons A, B (X, Y): each sends its configured key(s) while held
 *   top right      menu button (e.g. Escape), top left: hide/show the gamepad
 * Taps outside the gamepad still reach the game (menus with touch/mouse support keep working). The gamepad appears
 * with the first touch, so laptops with a touch screen played with a keyboard never see it.
 *
 * Configuration, set before this script runs:
 *   window.GAMIDIO_GAMEPAD = {
 *     stick: {up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'},  // default
 *     buttons: [{label: 'A', keys: [' ']}, {label: 'B', keys: ['Control']}],                // 1 to 4 buttons
 *              // a button may press a mouse button instead: {label: 'A', mouse: 0} (0 left, 2 right)
 *     menu: {label: '☰', keys: ['Escape']},                                                  // optional
 *     target: 'canvas',                                                                      // element that gets the keys
 *     pointer: true,  // optional: a finger outside the gamepad works as the mouse (move, hold = button down), e.g. aim and shoot
 *     look: 2.5,      // optional, first-person games: dragging a finger outside the gamepad turns the view (mouse
 *                     // movementX/Y times this factor); a short tap is a click (menus, 'click to start')
 *     fullscreen: 'landscape'  // optional, games on their own page: the first touch goes fullscreen (no browser bars) and
 *                              // locks the orientation where the browser allows it (Android); a ⛶ button goes back in
 *   };
 * Keys are KeyboardEvent.key values; code and keyCode are filled in for engines that read them (SDL/Emscripten).
 */
(function () {
	'use strict';
	if (!('ontouchstart' in window) && !(navigator.maxTouchPoints > 0)) return;
	var cfg = window.GAMIDIO_GAMEPAD || {};
	var stickKeys = cfg.stick || {up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'};
	var buttons = cfg.buttons || [{label: 'A', keys: [' ']}, {label: 'B', keys: ['Control']}];
	var stickOn = cfg.stick !== false;

	var KEYS = {
		'ArrowUp': ['ArrowUp', 38], 'ArrowDown': ['ArrowDown', 40], 'ArrowLeft': ['ArrowLeft', 37], 'ArrowRight': ['ArrowRight', 39],
		' ': ['Space', 32], 'Enter': ['Enter', 13], 'Escape': ['Escape', 27], 'Control': ['ControlLeft', 17],
		'Shift': ['ShiftLeft', 16], 'Alt': ['AltLeft', 18], 'Tab': ['Tab', 9], 'Backspace': ['Backspace', 8]
	};
	function info(key) {
		if (KEYS[key]) return KEYS[key];
		if (/^[a-z]$/i.test(key)) return ['Key' + key.toUpperCase(), key.toUpperCase().charCodeAt(0)];
		if (/^[0-9]$/.test(key)) return ['Digit' + key, key.charCodeAt(0)];
		return [key, 0];
	}

	var down = {};  // key -> number of pads holding it
	var MIN_HOLD = 80;  // ms: games that poll the keyboard once per frame miss a press shorter than a frame or two
	var since = {};
	function send(type, key) {
		var t = document.querySelector(cfg.target || 'canvas') || document.body;
		var i = info(key);
		var e = new KeyboardEvent(type, {key: key, code: i[0], bubbles: true, cancelable: true, view: window});
		// keyCode/which are read-only in the constructor but still used by many engines (SDL 2.0 on Emscripten).
		Object.defineProperty(e, 'keyCode', {get: function () { return i[1]; }});
		Object.defineProperty(e, 'which', {get: function () { return i[1]; }});
		t.dispatchEvent(e);
	}
	function press(key) { if (down[key] === 0.5) { down[key] = 1; return; } if (!down[key]) { send('keydown', key); since[key] = Date.now(); } down[key] = (down[key] || 0) + 1; }
	function release(key) {
		if (!down[key]) return;
		if (--down[key] > 0) return;
		var wait = MIN_HOLD - (Date.now() - since[key]);
		if (wait <= 0) { send('keyup', key); return; }
		down[key] = 0.5;  // still down until the timer lifts it; a new press in between keeps it down
		setTimeout(function () { if (down[key] === 0.5) { down[key] = 0; send('keyup', key); } }, wait);
	}

	var css = document.createElement('style');
	css.textContent =
		'#gp{position:fixed;inset:0;pointer-events:none;z-index:2147483000;font:600 18px system-ui,sans-serif;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}' +
		'#gp.off .gp-pad{display:none}#gp.idle{display:none}' +
		'#gp-zone{position:absolute;left:0;bottom:0;width:45%;height:60%;pointer-events:auto;touch-action:none}' +
		'#gp-base,#gp-knob{position:absolute;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%)}' +
		'#gp-base{width:min(120px,30vh);height:min(120px,30vh);background:rgba(0,0,0,.28);border:3px solid rgba(255,255,255,.7);box-shadow:0 0 0 1px rgba(0,0,0,.45)}' +
		'#gp-knob{width:54px;height:54px;background:rgba(255,255,255,.7);box-shadow:0 0 0 2px rgba(0,0,0,.45)}' +
		'.gp-btn{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:50%;pointer-events:auto;touch-action:none;' +
		'width:min(72px,17vh);height:min(72px,17vh);background:rgba(0,0,0,.35);border:3px solid var(--c,rgba(255,255,255,.8));color:var(--c,#fff);' +
		'font-weight:800;font-size:22px;text-shadow:0 1px 2px rgba(0,0,0,.8);box-shadow:0 0 0 1px rgba(0,0,0,.45)}' +
		'.gp-btn.on{background:var(--c,rgba(255,255,255,.8));color:#111;text-shadow:none}' +
		'.gp-small{width:44px;height:44px;font-size:16px}' +
		'@media (orientation:portrait){#gp-zone{height:45%}}' +
		'#gp-hint{position:fixed;left:50%;bottom:18%;transform:translateX(-50%);z-index:2147483001;pointer-events:none;padding:12px 22px;border-radius:999px;' +
		'background:rgba(0,0,0,.72);color:#fff;font:600 17px system-ui,sans-serif;border:1px solid rgba(255,255,255,.35);animation:gp-pulse 1.6s ease-in-out infinite}' +
		'@keyframes gp-pulse{50%{opacity:.55}}';
	(document.head || document.documentElement).appendChild(css);

	var root = document.createElement('div');
	root.id = 'gp';
	root.className = 'idle';
	addEventListener('touchstart', function () { root.classList.remove('idle'); }, {capture: true, passive: true, once: true});

	// Fullscreen (only on the game's own page; inside our player the page's fullscreen button does this). Browsers allow
	// it only from a user gesture, so it starts with the first touch. iPhone Safari has no fullscreen for pages.
	var el = document.documentElement;
	var canFull = cfg.fullscreen && window.top === window && (el.requestFullscreen || el.webkitRequestFullscreen);
	function isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
	function goFull() {
		if (!canFull || isFull()) return;
		try {
			var r = (el.requestFullscreen || el.webkitRequestFullscreen).call(el, {navigationUI: 'hide'});
			var lock = function () { try { if (typeof cfg.fullscreen === 'string' && screen.orientation && screen.orientation.lock) screen.orientation.lock(cfg.fullscreen).catch(function () {}); } catch (e) {} };
			if (r && r.then) r.then(lock, function () {}); else lock();
		} catch (e) {}
	}
	if (canFull) {
		// A new tab cannot open in fullscreen by itself (browsers require a tap in the page), so ask for that tap at once.
		var hint = document.createElement('div');
		hint.id = 'gp-hint';
		hint.textContent = 'Tap to play fullscreen';
		var shownAt = 0;
		var hideHint = function () { if (hint.parentNode) hint.parentNode.removeChild(hint); };
		// The first tap only switches to fullscreen; it must not also press whatever menu item is under the finger.
		var first = true;
		var swallow = function (e) { if (!first) return; e.preventDefault(); e.stopImmediatePropagation(); };
		addEventListener('touchstart', function (e) { if (first && !e.target.closest('.gp-btn,#gp-zone')) swallow(e); else first = false; }, {capture: true, passive: false});
		addEventListener('touchend', function (e) {
			if (!first) return;
			first = false; swallow(e); goFull(); hideHint(); shownAt = Date.now();
		}, {capture: true, passive: false});
		['mousedown', 'mouseup', 'click'].forEach(function (type) {  // mouse events the browser derives from that tap
			addEventListener(type, function (e) { if (e.isTrusted && Date.now() - shownAt < 700) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
		});
		var addHint = function () { document.body.appendChild(hint); };
		addEventListener('mousedown', hideHint, true);  // touch-screen laptops played with a mouse or keyboard
		addEventListener('keydown', hideHint, true);
		if (document.body) addHint(); else document.addEventListener('DOMContentLoaded', addHint);
	}
	root.innerHTML = stickOn ? '<div id="gp-zone" class="gp-pad"></div>' : '<div></div>';
	var zone = root.firstChild;
	var base = document.createElement('div'), knob = document.createElement('div');
	base.id = 'gp-base'; knob.id = 'gp-knob';
	base.className = knob.className = 'gp-pad';
	base.style.display = knob.style.display = 'none';
	root.appendChild(base); root.appendChild(knob);

	// Buttons in a diamond / row on the right, A nearest to the thumb (bottom right).
	var spots = [[20, 20], [96, 58], [96, -18], [172, 20]];  // [right, bottom] offsets in px
	buttons.slice(0, 4).forEach(function (b, n) {
		var el = document.createElement('div');
		el.className = 'gp-btn gp-pad';
		// Colours as on common controllers: A green, B red, X blue, Y yellow (b.color overrides).
		el.style.setProperty('--c', b.color || {A: '#4ade80', B: '#f87171', X: '#60a5fa', Y: '#facc15'}[b.label] || '#fff');
		el.textContent = b.label;
		el.style.right = spots[n][0] + 'px';
		el.style.bottom = 'calc(' + (spots[n][1] + 24) + 'px + env(safe-area-inset-bottom))';
		if (b.mouse !== undefined) holdMouse(el, b.mouse); else hold(el, b.keys);
		root.appendChild(el);
	});
	if (cfg.menu) {
		var m = document.createElement('div');
		m.className = 'gp-btn gp-small gp-pad';
		m.textContent = cfg.menu.label || '☰';
		m.style.right = '12px'; m.style.top = '12px';
		hold(m, cfg.menu.keys);
		root.appendChild(m);
	}
	var toggle = document.createElement('div');
	toggle.className = 'gp-btn gp-small';
	toggle.textContent = '🎮';
	toggle.title = 'Show or hide the on-screen gamepad';
	toggle.style.left = '12px'; toggle.style.top = '12px';
	toggle.addEventListener('touchstart', function (e) {
		e.preventDefault(); e.stopPropagation();
		root.classList.toggle('off');
	}, {passive: false});
	root.appendChild(toggle);
	if (canFull) {
		var fs = document.createElement('div');
		fs.className = 'gp-btn gp-small';
		fs.textContent = '⛶';
		fs.title = 'Fullscreen';
		fs.style.left = '68px'; fs.style.top = '12px';
		fs.addEventListener('touchend', function (e) { e.preventDefault(); e.stopPropagation(); goFull(); }, {passive: false});
		fs.addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); }, {passive: false});
		var showFs = function () { fs.style.display = isFull() ? 'none' : 'flex'; };
		document.addEventListener('fullscreenchange', showFs);
		document.addEventListener('webkitfullscreenchange', showFs);
		root.appendChild(fs);
	}

	function mouseButton(type, button) {
		var t = document.querySelector(cfg.target || 'canvas') || document.body;
		var r = t.getBoundingClientRect();
		t.dispatchEvent(new MouseEvent(type, {bubbles: true, cancelable: true, view: window, button: button,
			buttons: type === 'mousedown' ? (button === 2 ? 2 : 1) : 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2}));
	}
	function holdMouse(el, button) {
		var n = 0;
		el.addEventListener('touchstart', function (e) {
			e.preventDefault(); e.stopPropagation();
			if (n++ === 0) { el.classList.add('on'); mouseButton('mousedown', button); if (navigator.vibrate) navigator.vibrate(10); }
		}, {passive: false});
		var end = function (e) {
			e.preventDefault(); e.stopPropagation();
			n = Math.max(0, n - e.changedTouches.length);
			if (n === 0 && el.classList.contains('on')) { el.classList.remove('on'); mouseButton('mouseup', button); }
		};
		el.addEventListener('touchend', end, {passive: false});
		el.addEventListener('touchcancel', end, {passive: false});
	}

	function hold(el, keys) {
		var ids = {};
		el.addEventListener('touchstart', function (e) {
			e.preventDefault(); e.stopPropagation();
			for (var i = 0; i < e.changedTouches.length; i++) ids[e.changedTouches[i].identifier] = 1;
			if (!el.classList.contains('on')) { el.classList.add('on'); keys.forEach(press); if (navigator.vibrate) navigator.vibrate(10); }
		}, {passive: false});
		function end(e) {
			e.preventDefault(); e.stopPropagation();
			for (var i = 0; i < e.changedTouches.length; i++) delete ids[e.changedTouches[i].identifier];
			if (Object.keys(ids).length === 0 && el.classList.contains('on')) { el.classList.remove('on'); keys.forEach(release); }
		}
		el.addEventListener('touchend', end, {passive: false});
		el.addEventListener('touchcancel', end, {passive: false});
	}

	// Joystick: the base appears where the thumb lands; direction = angle of the knob, 8 sectors.
	var stickId = null, origin = null, held = [];
	function setDirs(dirs) {
		held.forEach(function (d) { if (dirs.indexOf(d) < 0) release(stickKeys[d]); });
		dirs.forEach(function (d) { if (held.indexOf(d) < 0) press(stickKeys[d]); });
		held = dirs;
	}
	function place(el, x, y) { el.style.left = x + 'px'; el.style.top = y + 'px'; }
	zone.addEventListener('touchstart', function (e) {
		e.preventDefault(); e.stopPropagation();
		if (stickId !== null) return;
		var t = e.changedTouches[0];
		stickId = t.identifier; origin = {x: t.clientX, y: t.clientY};
		place(base, origin.x, origin.y); place(knob, origin.x, origin.y);
		base.style.display = knob.style.display = 'block';
	}, {passive: false});
	zone.addEventListener('touchmove', function (e) {
		e.preventDefault(); e.stopPropagation();
		for (var i = 0; i < e.changedTouches.length; i++) {
			var t = e.changedTouches[i];
			if (t.identifier !== stickId) continue;
			var dx = t.clientX - origin.x, dy = t.clientY - origin.y, d = Math.hypot(dx, dy), r = 50;
			var k = d > r ? r / d : 1;
			place(knob, origin.x + dx * k, origin.y + dy * k);
			if (d < 16) { setDirs([]); continue; }
			var a = Math.atan2(dy, dx) * 180 / Math.PI, dirs = [];  // 0 = right, 90 = down
			if (a > -67.5 && a < 67.5) dirs.push('right');
			if (a > 112.5 || a < -112.5) dirs.push('left');
			if (a > 22.5 && a < 157.5) dirs.push('down');
			if (a < -22.5 && a > -157.5) dirs.push('up');
			setDirs(dirs);
		}
	}, {passive: false});
	function stickEnd(e) {
		e.preventDefault(); e.stopPropagation();
		for (var i = 0; i < e.changedTouches.length; i++) {
			if (e.changedTouches[i].identifier !== stickId) continue;
			stickId = null; setDirs([]);
			base.style.display = knob.style.display = 'none';
		}
	}
	zone.addEventListener('touchend', stickEnd, {passive: false});
	zone.addEventListener('touchcancel', stickEnd, {passive: false});

	// Pointer mode: a finger on the game (outside the gamepad) is the mouse; the browser alone would only send a click
	// at the end of a tap, so holding (continuous fire) and dragging (aiming) would not work.
	if (cfg.pointer) {
		var pid = null, last = null;
		var mouse = function (type, t) {
			last = {x: t.clientX, y: t.clientY};
			var el = document.elementFromPoint(last.x, last.y) || document.body;
			el.dispatchEvent(new MouseEvent(type, {bubbles: true, cancelable: true, view: window, clientX: last.x, clientY: last.y, screenX: last.x, screenY: last.y, button: 0, buttons: type === 'mousedown' || type === 'mousemove' ? 1 : 0}));
		};
		var mine = function (e) { return root.contains(e.target); };
		addEventListener('touchstart', function (e) {
			if (mine(e) || pid !== null) return;
			var t = e.changedTouches[0];
			pid = t.identifier;
			e.preventDefault();
			mouse('mousemove', t); mouse('mousedown', t);
		}, {passive: false});
		addEventListener('touchmove', function (e) {
			for (var i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === pid) { e.preventDefault(); mouse('mousemove', e.changedTouches[i]); }
		}, {passive: false});
		var up = function (e) {
			for (var i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === pid) { e.preventDefault(); pid = null; mouse('mouseup', e.changedTouches[i]); mouse('click', e.changedTouches[i]); }
		};
		addEventListener('touchend', up, {passive: false});
		addEventListener('touchcancel', up, {passive: false});
	}

	// Look mode: a finger outside the gamepad turns the view like a mouse with pointer lock (movementX/Y).
	if (cfg.look) {
		var lid = null, lp = null, l0 = null, lt = 0;
		var lookTarget = function () { return document.querySelector(cfg.target || 'canvas') || document.body; };
		var inPad = function (e) { return root.contains(e.target); };
		addEventListener('touchstart', function (e) {
			if (inPad(e) || lid !== null) return;
			var t = e.changedTouches[0];
			lid = t.identifier; lp = l0 = {x: t.clientX, y: t.clientY}; lt = Date.now();
			e.preventDefault();
		}, {passive: false});
		addEventListener('touchmove', function (e) {
			for (var i = 0; i < e.changedTouches.length; i++) {
				var t = e.changedTouches[i];
				if (t.identifier !== lid) continue;
				e.preventDefault();
				var dx = (t.clientX - lp.x) * cfg.look, dy = (t.clientY - lp.y) * cfg.look;
				lp = {x: t.clientX, y: t.clientY};
				lookTarget().dispatchEvent(new MouseEvent('mousemove', {bubbles: true, cancelable: true, view: window, movementX: dx, movementY: dy, clientX: lp.x, clientY: lp.y}));
			}
		}, {passive: false});
		var lookEnd = function (e) {
			for (var i = 0; i < e.changedTouches.length; i++) {
				var t = e.changedTouches[i];
				if (t.identifier !== lid) continue;
				e.preventDefault(); lid = null;
				if (Math.hypot(t.clientX - l0.x, t.clientY - l0.y) < 12 && Date.now() - lt < 350) {
					var el = document.elementFromPoint(t.clientX, t.clientY) || document.body;
					el.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, view: window, clientX: t.clientX, clientY: t.clientY}));
				}
			}
		};
		addEventListener('touchend', lookEnd, {passive: false});
		addEventListener('touchcancel', lookEnd, {passive: false});
	}

	function mount() { document.body.appendChild(root); }
	if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
