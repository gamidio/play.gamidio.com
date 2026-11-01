/* Gamidio virtual gamepad for keyboard-driven games on touch screens (part of Gamidio's changes, same license as the game).
 *
 * Phones have no keyboard, so action games (platformers, shooters) cannot be played. This layer shows a gamepad over
 * the game on touch devices only and sends keyboard events for it:
 *   left half      joystick: drag from where the thumb lands, the base follows past the edge; 8 directions -> the arrow
 *                  keys (or the configured keys)
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
 *     extra: [{label: 'M', keys: ['m']}],  // optional: more small buttons in a row at the top, for games with many keys
 *     target: 'canvas',                                                                      // element that gets the keys
 *     wheel: {left: 'ArrowLeft', right: 'ArrowRight'},  // optional, driving games: a steering wheel instead of the joystick
 *              // with buttons [{label: 'GAS', keys: ['ArrowUp'], pedal: true}, ...]: tall pedals on the right
 *     pointer: true,  // optional: a finger outside the gamepad works as the mouse (move, hold = button down), e.g. aim and shoot
 *     tapKey: 'x',    // optional: a tap on the game outside the buttons presses this key ('press any key' screens); by
 *                     // default a short tap in the joystick area (no stick movement) clicks the game there
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
	var stickOn = cfg.stick !== false && !cfg.wheel;

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
		if (t.shadowRoot) {  // Ruffle takes keys only after focusin on its player, and a tap on the gamepad does not focus it.
			t.dispatchEvent(new FocusEvent('focusin', {bubbles: true, composed: true}));
			t = t.shadowRoot.getElementById('container') || t;
			t.focus();
		}
		var i = info(key);
		var e = new KeyboardEvent(type, {key: key, code: i[0], bubbles: true, composed: true, cancelable: true, view: window});
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
		'#gp-zone{position:absolute;left:0;bottom:0;width:50%;height:100%;pointer-events:auto;touch-action:none}' +
		'#gp-base,#gp-knob{position:absolute;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%)}' +
		'#gp-base{width:min(120px,30vh);height:min(120px,30vh);background:rgba(0,0,0,.28);border:3px solid rgba(255,255,255,.7);box-shadow:0 0 0 1px rgba(0,0,0,.45)}' +
		'#gp-knob{width:54px;height:54px;background:rgba(255,255,255,.7);box-shadow:0 0 0 2px rgba(0,0,0,.45)}' +
		'.gp-btn{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:50%;pointer-events:auto;touch-action:none;' +
		'width:min(72px,17vh);height:min(72px,17vh);background:rgba(0,0,0,.35);border:3px solid var(--c,rgba(255,255,255,.8));color:var(--c,#fff);' +
		'font-weight:800;font-size:22px;text-shadow:0 1px 2px rgba(0,0,0,.8);box-shadow:0 0 0 1px rgba(0,0,0,.45)}' +
		'.gp-btn.on{background:var(--c,rgba(255,255,255,.8));color:#111;text-shadow:none}' +
		'.gp-small{width:44px;height:44px;font-size:16px}' +
		'#gp-extra{position:absolute;top:12px;left:0;right:0;display:flex;justify-content:center;gap:8px;pointer-events:none}#gp-extra .gp-btn{position:static}' +
		'.gp-pedal{width:min(88px,24vh);height:min(150px,44vh);border-radius:16px;font-size:16px}' +
		'#gp-wheel{position:absolute;left:24px;bottom:calc(18px + env(safe-area-inset-bottom));width:min(170px,46vh);height:min(170px,46vh);pointer-events:auto;touch-action:none;opacity:.85}' +
		'#gp-wheel svg{display:block;width:100%;height:100%;filter:drop-shadow(0 0 1px rgba(0,0,0,.6))}' +
		'#gp-hint{position:fixed;left:50%;bottom:18%;transform:translateX(-50%);z-index:2147483001;pointer-events:none;padding:12px 22px;border-radius:999px;' +
		'background:rgba(0,0,0,.72);color:#fff;font:600 17px system-ui,sans-serif;border:1px solid rgba(255,255,255,.35);animation:gp-pulse 1.6s ease-in-out infinite}' +
		'@keyframes gp-pulse{50%{opacity:.55}}';
	(document.head || document.documentElement).appendChild(css);

	var root = document.createElement('div');
	root.id = 'gp';
	root.className = 'idle';
	// Games shown in a scaled-down frame (D-062): the player reports the scale, so the gamepad keeps its real size.
	var gpZoom = 1;
	addEventListener('message', function (e) {
		if (!e.data || !e.data.gamidioScale) return;
		gpZoom = 1 / e.data.gamidioScale;
		root.style.zoom = gpZoom;
	});
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
	// Aiming with a finger needs the rest of the screen, so the joystick keeps to the bottom left corner there.
	if (cfg.pointer || cfg.look) { zone.style.width = '45%'; zone.style.height = '60%'; }
	var base = document.createElement('div'), knob = document.createElement('div');
	base.id = 'gp-base'; knob.id = 'gp-knob';
	base.className = knob.className = 'gp-pad';
	base.style.display = knob.style.display = 'none';
	root.appendChild(base); root.appendChild(knob);

	// Buttons on the right, A nearest to the thumb (bottom right). Three or four buttons sit as on an Xbox controller.
	var spots = [[20, 20], [96, 58], [96, -18], [172, 20]];  // [right, bottom] offsets in px
	if (buttons.length >= 3) spots = [[76, -6], [20, 50], [132, 50], [76, 106]];  // A bottom, B right, X left, Y top
	if (buttons[0] && buttons[0].pedal) spots = [[20, -6], [116, -6]];  // Gas at the screen edge, brake and reverse beside it
	buttons.slice(0, 4).forEach(function (b, n) {
		var el = document.createElement('div');
		el.className = 'gp-btn gp-pad' + (b.pedal ? ' gp-pedal' : '');
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
	if (cfg.extra) {
		var extra = document.createElement('div');
		extra.id = 'gp-extra';
		extra.className = 'gp-pad';
		cfg.extra.forEach(function (b) {
			var x = document.createElement('div');
			x.className = 'gp-btn gp-small';
			x.textContent = b.label;
			hold(x, b.keys);
			extra.appendChild(x);
		});
		root.appendChild(extra);
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

	// Steering wheel: turns with the thumb around its centre and springs back on release; past a few degrees it holds the
	// left or right key, because the games read keys and have no analog steering.
	if (cfg.wheel) {
		var wheel = document.createElement('div'), wheelId = null, wheelStart = 0, wheelAngle = 0, steer = null;
		wheel.id = 'gp-wheel';
		wheel.className = 'gp-pad';
		wheel.innerHTML = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="rgba(0,0,0,.28)" stroke="rgba(255,255,255,.8)" stroke-width="9"/>' +
			'<circle cx="50" cy="50" r="10" fill="rgba(255,255,255,.8)"/><path d="M8 50H40M60 50H92M50 60V92" stroke="rgba(255,255,255,.8)" stroke-width="7"/></svg>';
		root.appendChild(wheel);
		var thumbAngle = function (t) {
			var r = wheel.getBoundingClientRect();
			return Math.atan2(t.clientY - r.top - r.height / 2, t.clientX - r.left - r.width / 2) * 180 / Math.PI;
		};
		var setSteer = function (dir) {
			if (dir === steer) return;
			if (steer) release(cfg.wheel[steer]);
			if (dir) press(cfg.wheel[dir]);
			steer = dir;
		};
		var turn = function (deg) {
			wheelAngle = Math.max(-120, Math.min(120, deg));
			wheel.style.transform = 'rotate(' + wheelAngle + 'deg)';
			setSteer(wheelAngle < -10 ? 'left' : wheelAngle > 10 ? 'right' : null);
		};
		wheel.addEventListener('touchstart', function (e) {
			e.preventDefault(); e.stopPropagation();
			if (wheelId !== null) return;
			var t = e.changedTouches[0];
			wheelId = t.identifier; wheelStart = thumbAngle(t) - wheelAngle;
		}, {passive: false});
		wheel.addEventListener('touchmove', function (e) {
			e.preventDefault(); e.stopPropagation();
			for (var i = 0; i < e.changedTouches.length; i++) {
				if (e.changedTouches[i].identifier !== wheelId) continue;
				var d = thumbAngle(e.changedTouches[i]) - wheelStart;
				turn(d > 180 ? d - 360 : d < -180 ? d + 360 : d);
			}
		}, {passive: false});
		var wheelEnd = function (e) {
			e.preventDefault(); e.stopPropagation();
			for (var i = 0; i < e.changedTouches.length; i++) {
				if (e.changedTouches[i].identifier === wheelId) { wheelId = null; turn(0); }
			}
		};
		wheel.addEventListener('touchend', wheelEnd, {passive: false});
		wheel.addEventListener('touchcancel', wheelEnd, {passive: false});
	}

	// Joystick: the base appears where the thumb lands; direction = angle of the knob, 8 sectors.
	var stickId = null, origin = null, held = [], moved = false, startTime = 0;
	function setDirs(dirs) {
		held.forEach(function (d) { if (dirs.indexOf(d) < 0) release(stickKeys[d]); });
		dirs.forEach(function (d) { if (held.indexOf(d) < 0) press(stickKeys[d]); });
		held = dirs;
	}
	function place(el, x, y) { el.style.left = x / gpZoom + 'px'; el.style.top = y / gpZoom + 'px'; }
	zone.addEventListener('touchstart', function (e) {
		e.preventDefault(); e.stopPropagation();
		if (stickId !== null) return;
		var t = e.changedTouches[0];
		stickId = t.identifier; origin = {x: t.clientX, y: t.clientY}; moved = false; startTime = Date.now();
		place(base, origin.x, origin.y); place(knob, origin.x, origin.y);
		base.style.display = knob.style.display = 'block';
	}, {passive: false});
	zone.addEventListener('touchmove', function (e) {
		e.preventDefault(); e.stopPropagation();
		for (var i = 0; i < e.changedTouches.length; i++) {
			var t = e.changedTouches[i];
			if (t.identifier !== stickId) continue;
			var dx = t.clientX - origin.x, dy = t.clientY - origin.y, d = Math.hypot(dx, dy), r = 50 * gpZoom;
			if (d > r) {  // The base follows the thumb, so turning back needs only a short move.
				origin.x += dx * (1 - r / d); origin.y += dy * (1 - r / d);
				place(base, origin.x, origin.y);
			}
			place(knob, t.clientX, t.clientY);
			if (d < 10 * gpZoom) { setDirs([]); continue; }
			moved = true;
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
			var t = e.changedTouches[i];
			if (t.identifier !== stickId) continue;
			stickId = null; setDirs([]);
			base.style.display = knob.style.display = 'none';
			// A short tap that never moved the stick is a click on the game below (menu items under the stick area).
			if (e.type === 'touchend' && !moved && Date.now() - startTime < 300) { if (cfg.tapKey) tapKey(); else clickAt(t.clientX, t.clientY); }
		}
	}
	function tapKey() { press(cfg.tapKey); setTimeout(function () { release(cfg.tapKey); }, MIN_HOLD); }
	if (cfg.tapKey) addEventListener('touchend', function (e) { if (!e.target.closest('#gp .gp-btn,#gp-zone')) tapKey(); }, {capture: true, passive: true});
	function clickAt(x, y) {
		var g = document.querySelector(cfg.target || 'canvas') || document.body;
		if (g.shadowRoot) {  // Ruffle reads pointer events on its own canvas.
			var c = g.shadowRoot.querySelector('canvas');
			['pointerdown', 'pointerup'].forEach(function (type) {
				if (c) c.dispatchEvent(new PointerEvent(type, {bubbles: true, composed: true, cancelable: true, pointerType: 'touch', pointerId: 9,
					isPrimary: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0, clientX: x, clientY: y}));
			});
			return;
		}
		// Menus made of page elements (Dante) lie above the canvas: the click goes to what is under the joystick area.
		g = document.elementsFromPoint(x, y).filter(function (el) { return !root.contains(el); })[0] || g;
		['mousemove', 'mousedown', 'mouseup', 'click'].forEach(function (type) {
			g.dispatchEvent(new MouseEvent(type, {bubbles: true, cancelable: true, view: window, button: 0,
				buttons: type === 'mousedown' ? 1 : 0, clientX: x, clientY: y}));
		});
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
