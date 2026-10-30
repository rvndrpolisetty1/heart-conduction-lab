// Speech for the characters: a bubble that types out the line, an optional device voice, and a mouth
// level for lip sync. With the voice on, the mouth follows the voice's word boundaries; without it, the
// mouth follows the letters as they appear (open on vowels).

let voiceOn = false;
let voice = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return null;
  const vs = speechSynthesis.getVoices().filter(v => /^en(-|_)/i.test(v.lang));
  return vs.find(v => /natural|online/i.test(v.name)) || vs.find(v => /en-(GB|IN|US)/i.test(v.lang)) || vs[0] || null;
}
if ('speechSynthesis' in window) speechSynthesis.addEventListener?.('voiceschanged', () => { voice = pickVoice(); });

export const setVoice = on => { voiceOn = on && 'speechSynthesis' in window; if (!voiceOn && 'speechSynthesis' in window) speechSynthesis.cancel(); };
export const voiceAvailable = () => 'speechSynthesis' in window;

// Say a line. `bubble` is { el, text } elements; `character` has setMouth(level, speaking).
export function say(character, bubble, text, { cps = 32, hold = 2.6 } = {}) {
  return new Promise(resolve => {
    bubble.el.hidden = false;
    bubble.el.classList.remove('is-out');
    bubble.text.textContent = '';
    let i = 0, done = false, mouthT = null, voiceDone = !voiceOn;
    const id = (bubble.el._sayId || 0) + 1;
    bubble.el._sayId = id;
    const alive = () => bubble.el._sayId === id;

    if (voiceOn) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      voice ||= pickVoice();
      if (voice) u.voice = voice;
      u.rate = 1.02; u.pitch = 1.0;
      u.onboundary = () => { if (!alive()) return; character.setMouth(1); clearTimeout(mouthT); mouthT = setTimeout(() => character.setMouth(0.15), 110); };
      u.onend = u.onerror = () => { voiceDone = true; if (alive()) character.setMouth(0, false); finish(); };
      speechSynthesis.speak(u);
    }
    const tick = () => {
      if (!alive()) return;
      i++;
      bubble.text.textContent = text.slice(0, i);
      if (!voiceOn) {
        const ch = text[i - 1] || '';
        character.setMouth(/[aeiouAEIOU]/.test(ch) ? 1 : /[ .,:;!?]/.test(ch) ? 0 : 0.45);
      }
      if (i < text.length) setTimeout(tick, 1000 / cps * (/[.,:;]/.test(text[i - 1]) ? 5 : 1));
      else { if (!voiceOn) character.setMouth(0, false); done = true; finish(); }
    };
    function finish() {
      if (!done || !voiceDone || !alive()) return;
      setTimeout(() => { if (alive()) { bubble.el.classList.add('is-out'); resolve(); } }, hold * 1000);
    }
    tick();
  });
}

export function hush(character, bubble) {
  bubble.el._sayId = (bubble.el._sayId || 0) + 1;
  bubble.el.classList.add('is-out');
  character.setMouth(0, false);
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
