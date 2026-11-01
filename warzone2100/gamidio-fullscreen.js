/* Gamidio fullscreen button for games on their own page (part of Gamidio's changes, same license as the game).
 *
 * Browsers allow fullscreen only after a tap, and some refuse the one on the game's Play button, so phones would keep the
 * address bar. This button stays on screen until the game is in fullscreen and turns the phone to landscape where allowed.
 */
(function () {
	'use strict';
	if (!('ontouchstart' in window) && !(navigator.maxTouchPoints > 0)) return;
	var el = document.documentElement;
	var request = el.requestFullscreen || el.webkitRequestFullscreen;
	if (!request) return;  // iPhone Safari has no fullscreen for pages.

	var button = document.createElement('button');
	button.type = 'button';
	button.textContent = '⛶ Fullscreen';
	button.style.cssText = 'position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:2147483002;padding:8px 14px;border-radius:999px;' +
		'border:2px solid rgba(255,255,255,.7);background:rgba(0,0,0,.65);color:#fff;font:600 15px system-ui,sans-serif;touch-action:manipulation';

	function isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
	function update() {
		button.style.display = isFull() ? 'none' : 'block';
		// Pages laid out wider than the phone (Warzone 2100) would show the button tiny.
		button.style.zoom = Math.max(1, window.innerWidth / (screen.width || window.innerWidth));
	}
	button.addEventListener('click', function () {
		var done = request.call(el, {navigationUI: 'hide'});
		var lock = function () {
			if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {});
		};
		if (done && done.then) done.then(lock, function () {}); else lock();
	});
	document.addEventListener('fullscreenchange', update);
	document.addEventListener('webkitfullscreenchange', update);
	addEventListener('resize', update);
	update();
	document.body.appendChild(button);
})();
