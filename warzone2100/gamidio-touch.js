/* Gamidio touch controls for canvas games driven by the mouse (part of Gamidio's changes, same license as the game).
 *
 * Browsers turn a touch into a left click only, so mouse games miss the right button and the wheel. This layer takes
 * the touches on the game canvas and sends mouse events instead:
 *   tap                      left click
 *   drag                     left drag
 *   hold (~0.45 s)           right click; hold and drag = right drag (OpenTTD: scroll the map)
 *   two-finger drag          right drag at the midpoint (scroll the map)
 *   pinch                    mouse wheel at the midpoint (zoom)
 * The canvas is found with window.GAMIDIO_TOUCH_TARGET (CSS selector, default "canvas").
 */
(function () {
	'use strict';
	if (!('ontouchstart' in window) && !(navigator.maxTouchPoints > 0)) return;

	var HOLD_MS = 450;      // finger still for this long = right button
	var MOVE_TOL = 10;      // px a finger may wobble and still count as a tap or a hold
	var PINCH_STEP = 1.5;   // finger distance ratio for one wheel step (OpenTTD zooms 2x per step)

	var style = document.createElement('style');
	style.textContent = 'canvas{touch-action:none;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}';
	(document.head || document.documentElement).appendChild(style);

	var mode = 'idle';      // idle | pending | left | right | two | done
	var held = 0;           // MouseEvent.buttons bitmask: 1 left, 2 right
	var start = null, last = null, timer = 0, pinchDist = 0;

	function canvas() { return document.querySelector(window.GAMIDIO_TOUCH_TARGET || 'canvas'); }

	function send(type, p, button) {
		var c = canvas();
		if (!c || !p) return;
		if (type === 'mousedown') held |= button === 2 ? 2 : 1;
		if (type === 'mouseup') held &= button === 2 ? ~2 : ~1;
		c.dispatchEvent(new MouseEvent(type, {
			bubbles: true, cancelable: true, view: window,
			clientX: p.x, clientY: p.y, screenX: p.x, screenY: p.y,
			button: button || 0, buttons: held
		}));
		last = p;
	}

	function wheel(p, dir) {
		var c = canvas();
		if (!c) return;
		c.dispatchEvent(new WheelEvent('wheel', {
			bubbles: true, cancelable: true, view: window,
			clientX: p.x, clientY: p.y, deltaY: dir * 100, deltaMode: 0
		}));
	}

	function point(t) { return {x: t.clientX, y: t.clientY}; }
	function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
	function mid(ts) { return {x: (ts[0].clientX + ts[1].clientX) / 2, y: (ts[0].clientY + ts[1].clientY) / 2}; }
	function spread(ts) { return dist(point(ts[0]), point(ts[1])); }

	function release() {
		clearTimeout(timer);
		if (held & 1) send('mouseup', last, 0);
		if (held & 2) send('mouseup', last, 2);
	}

	function onHold() {
		if (mode !== 'pending') return;
		mode = 'right';
		send('mousedown', start, 2);
		if (navigator.vibrate) navigator.vibrate(25);
	}

	function onStart(e) {
		if (mode === 'idle' && e.target !== canvas()) return;
		e.preventDefault();
		e.stopImmediatePropagation();
		var ts = e.touches;
		if (ts.length === 1 && mode === 'idle') {
			start = point(ts[0]);
			mode = 'pending';
			send('mousemove', start);
			timer = setTimeout(onHold, HOLD_MS);
		} else if (ts.length === 2 && mode !== 'done') {
			release();
			mode = 'two';
			pinchDist = spread(ts);
			var m = mid(ts);
			send('mousemove', m);
			send('mousedown', m, 2);
		}
	}

	function onMove(e) {
		if (mode === 'idle') return;
		e.preventDefault();
		e.stopImmediatePropagation();
		var ts = e.touches;
		if (mode === 'two' && ts.length >= 2) {
			var m = mid(ts), d = spread(ts), dir = 0;
			send('mousemove', m);
			if (d > pinchDist * PINCH_STEP) dir = -1;
			else if (d < pinchDist / PINCH_STEP) dir = 1;
			if (dir) {
				// Games such as OpenTTD ignore the wheel while the right button scrolls: lift it for the zoom step.
				send('mouseup', m, 2);
				wheel(m, dir);
				send('mousedown', m, 2);
				pinchDist = d;
			}
			return;
		}
		if (ts.length !== 1) return;
		var p = point(ts[0]);
		if (mode === 'pending') {
			if (dist(p, start) <= MOVE_TOL) return;
			clearTimeout(timer);
			mode = 'left';
			send('mousedown', start, 0);
		}
		if (mode === 'left' || mode === 'right') send('mousemove', p);
	}

	function onEnd(e) {
		if (mode === 'idle') return;
		e.preventDefault();
		e.stopImmediatePropagation();
		if (e.touches.length > 0) {
			// One finger of a two-finger gesture lifted: end the gesture, ignore the rest until all fingers are up.
			if (mode === 'two') { release(); mode = 'done'; }
			return;
		}
		if (mode === 'pending') {
			clearTimeout(timer);
			var p = start;
			send('mousedown', p, 0);
			setTimeout(function () { send('mouseup', p, 0); }, 40);
		} else {
			release();
		}
		mode = 'idle';
	}

	// Capture phase on window, registered before the game: the game's own touch handlers never see these touches.
	var opt = {capture: true, passive: false};
	window.addEventListener('touchstart', onStart, opt);
	window.addEventListener('touchmove', onMove, opt);
	window.addEventListener('touchend', onEnd, opt);
	window.addEventListener('touchcancel', onEnd, opt);
	window.addEventListener('contextmenu', function (e) { if (e.target === canvas()) e.preventDefault(); }, true);
})();
