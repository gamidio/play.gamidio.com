/*
 * Gamidio text input for touch screens (written by Gamidio, no dependencies; D-046 family).
 *
 * Canvas games (Emscripten/SDL) read text from key events, so a phone never shows its keyboard when the game
 * asks for a name. The game calls window.gamidioTextInput(true) when a text field gets focus and
 * window.gamidioTextInput(false) when it loses it (Flare: patched SDLInputState::start/stopTextInput).
 * On a touch screen we then focus a hidden <input> (the phone opens its keyboard) and show a "Keyboard" button
 * for browsers that open it only from a tap (iOS). Every change of that field is sent to the game as key events
 * (the difference: Backspace for removed characters, keypress for new ones, which SDL turns into text input),
 * so word composition and autocorrect on phone keyboards work too; Enter goes as keydown/keyup.
 * On a computer nothing changes: the physical keyboard reaches the game directly.
 *
 * The keyboard floats over the page (Chrome and Brave on Android), so a game on the full screen keeps its size. Only the
 * top page may ask for that, so inside our player the page asks it. window.GAMIDIO_TEXT_BAR = true shows the text in a bar
 * at the top with a Done button, for games whose text field would lie under the keyboard.
 */
(function () {
	"use strict";
	var touch = ("ontouchstart" in window) || (navigator.maxTouchPoints || 0) > 0;
	var input, button, bar, active = false;
	var useBar = window.GAMIDIO_TEXT_BAR;

	if (touch && navigator.virtualKeyboard) navigator.virtualKeyboard.overlaysContent = true;
	if (touch && window.parent !== window) window.parent.postMessage({gamidioFloatingKeyboard: true}, "*");

	function key(type, k, code, keyCode, charCode) {
		// From the canvas the event also reaches engines that listen on the document or the window.
		(document.querySelector("canvas") || window).dispatchEvent(new KeyboardEvent(type, {
			key: k, code: code, keyCode: keyCode, which: keyCode || charCode, charCode: charCode || 0,
			bubbles: true, cancelable: true
		}));
	}
	// Games read held keys once per frame: a keydown and keyup in the same moment would be missed (Flare's
	// Backspace). All key events therefore go out one after another from a queue, a key held for 60 ms.
	var queue = [], busy = false;
	function next() {
		var job = queue.shift();
		if (!job) { busy = false; return; }
		busy = true;
		job[0]();
		setTimeout(next, job[1]);
	}
	function later(fn, wait) {
		queue.push([fn, wait]);
		if (!busy) next();
	}
	function press(k, code, keyCode) {
		later(function () { key("keydown", k, code, keyCode, 0); }, 60);
		later(function () { key("keyup", k, code, keyCode, 0); }, 30);
	}
	// Games that read letters as key presses, not as text (Endless Sky: window.GAMIDIO_TEXT_KEYS = true).
	function typeKey(ch) {
		var lower = ch.toLowerCase(), code;
		if (/[a-z]/.test(lower)) code = "Key" + lower.toUpperCase();
		else if (/[0-9]/.test(ch)) code = "Digit" + ch;
		else if (ch === " ") code = "Space";
		else if (ch === "-") code = "Minus";
		else if (ch === ".") code = "Period";
		else return;
		var shift = ch !== lower;
		if (shift) later(function () { key("keydown", "Shift", "ShiftLeft", 16, 0); }, 20);
		press(lower, code, lower.toUpperCase().charCodeAt(0));
		if (shift) later(function () { key("keyup", "Shift", "ShiftLeft", 16, 0); }, 20);
	}
	function type(text) {
		if (window.GAMIDIO_TEXT_KEYS) {
			for (var n = 0; n < text.length; n++) typeKey(text.charAt(n));
			return;
		}
		for (var i = 0; i < text.length; i++) {
			(function (ch, c) {
				later(function () { key("keypress", ch, "", c, c); }, 20);
			})(text.charAt(i), text.charCodeAt(i));
		}
	}
	// One space stays in the field, so Backspace on an "empty" field still changes it (Android keyboards).
	// "sent" = what the field holds after the space and the game has already received.
	var sent = "";
	function reset() {
		input.value = " ";
		sent = "";
		try { input.setSelectionRange(1, 1); } catch (e) {}
	}
	// Whatever the keyboard did (typing, word composition, autocorrect, delete), send the difference.
	function sync() {
		var v = input.value;
		if (v.charAt(0) !== " ") { // the space itself was deleted: Backspace in the game's field
			for (var n = sent.length; n >= 0; n--) press("Backspace", "Backspace", 8);
			reset();
			return;
		}
		var cur = v.slice(1), p = 0;
		while (p < cur.length && p < sent.length && cur.charAt(p) === sent.charAt(p)) p++;
		for (var i = sent.length; i > p; i--) press("Backspace", "Backspace", 8);
		type(cur.slice(p));
		sent = cur;
	}
	function build() {
		input = document.createElement("input");
		input.type = "text";
		input.setAttribute("autocomplete", "off");
		input.setAttribute("autocorrect", "off");
		input.setAttribute("autocapitalize", "off");
		input.setAttribute("spellcheck", "false");
		input.setAttribute("aria-hidden", "true");
		// 16 px: iOS zooms into smaller fields. Off screen but focusable.
		input.style.cssText = "position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;font-size:16px;border:0;padding:0;z-index:-1";
		input.addEventListener("input", sync);
		var composing = false;
		input.addEventListener("compositionstart", function () { composing = true; });
		input.addEventListener("compositionend", function () {
			composing = false;
			sync();
			if (!useBar && sent.length > 30) reset(); // keep the field short; the game already has the text
		});
		input.addEventListener("input", function () {
			if (!useBar && !composing && sent.length > 30) reset();
		});
		["keydown", "keypress", "keyup"].forEach(function (t) {
			input.addEventListener(t, function (e) {
				e.stopPropagation(); // the real events (key code 229 on phones) must not reach the game twice
				if (t === "keydown" && e.key === "Enter") {
					e.preventDefault();
					if (useBar) window.gamidioTextInput(false);
					else press("Enter", "Enter", 13);
				}
			});
		});
		button = document.createElement("button");
		button.type = "button";
		button.textContent = "⌨ Keyboard";
		button.style.cssText = "position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:20;display:none;" +
			"padding:10px 18px;border:0;border-radius:999px;background:#7c5cff;color:#fff;font:600 15px system-ui,sans-serif;" +
			"box-shadow:0 4px 14px rgba(0,0,0,.4)";
		button.addEventListener("touchstart", function (e) { e.stopPropagation(); }, { passive: true, capture: true });
		button.addEventListener("click", function (e) {
			e.stopPropagation();
			reset();
			input.focus();
		});
		if (useBar) {
			bar = document.createElement("div");
			bar.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:2147483000;display:none;gap:8px;padding:8px;justify-content:center;background:rgba(0,0,0,.8)";
			input.style.cssText = "width:min(70vw,520px);padding:8px 10px;border:0;border-radius:8px;font-size:16px;background:#fff;color:#000";
			input.removeAttribute("aria-hidden");
			input.setAttribute("aria-label", "Text for the game");
			var done = document.createElement("button");
			done.type = "button";
			done.textContent = "Done";
			done.style.cssText = "padding:8px 16px;border:0;border-radius:8px;background:#7c5cff;color:#fff;font:600 15px system-ui,sans-serif";
			done.addEventListener("click", function () { window.gamidioTextInput(false); });
			bar.appendChild(input);
			bar.appendChild(done);
			["touchstart", "touchend", "pointerdown", "mousedown", "mouseup", "click"].forEach(function (t) {
				bar.addEventListener(t, function (e) { e.stopPropagation(); });
			});
			document.body.appendChild(bar);
		} else document.body.appendChild(input);
		document.body.appendChild(button);
	}

	window.gamidioTextInput = function (on) {
		if (!touch || !document.body) return;
		if (!input) build();
		active = !!on;
		button.style.display = active && !window.GAMIDIO_TEXT_KEYS && !useBar ? "block" : "none";
		if (bar) bar.style.display = active ? "flex" : "none";
		if (active) {
			reset();
			input.focus(); // opens the keyboard where the browser allows it outside a tap (Android)
		} else {
			input.blur();
		}
	};
})();
