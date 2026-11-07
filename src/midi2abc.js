let section;
let sectionEnd;
let activeSharps = new Set();
let currentMinDuration = 30;

function gcd(a, b) {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b > 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a || 1;
}

function foldLotroPitch(pitch) {
  let p = Math.round(pitch);
  while (p < 48) p += 12;
  while (p > 84) p -= 12;
  return p;
}

function deduplicateLotroChord(chord) {
  const byPitch = new Map();
  for (let i = 0; i < chord.length; i++) {
    const note = chord[i];
    const p = foldLotroPitch(note.pitch);
    const existing = byPitch.get(p);
    if (!existing) {
      byPitch.set(p, { ...note, pitch: p });
    } else if (note.tie) {
      existing.tie = true;
    }
  }
  const unique = Array.from(byPitch.values());
  unique.sort((a, b) => a.pitch - b.pitch);
  // LOTRO allows at most 6 simultaneous notes in a chord
  if (unique.length > 6) {
    return unique.slice(0, 6);
  }
  return unique;
}

function stripTrailingTies(abcStr) {
  return abcStr.replace(/-(\]?(?:\|\n?)?)$/, (_, suffix) => suffix).replace(/(\[[^\]]*\])((?:\|\n?)?)$/, (_, chordBlock, suffix) => {
    return chordBlock.replaceAll("-", "") + suffix;
  });
}

function fixIllegalDuration(
  chord,
  nextChord,
  unitTime,
  unitLength,
  keyLength,
  duration,
) {
  const error = keyLength.error;
  if (error != 0) {
    if (keyLength.numerator > 0 && keyLength.denominator > 0 && error > 0) {
      const base = 60;
      const startTick = chord[0].startTick;
      const endTick = chord[0].endTick;
      const newDuration = base * keyLength.numerator / keyLength.denominator /
        unitTime;
      const t = chord[0].startTick + newDuration;
      if (t > startTick && t < endTick) {
        const originalTies = chord.map((note) => note.tie);
        const remDuration = round((endTick - t) * unitTime, 1e6);
        const hasSecondHalf = remDuration >= currentMinDuration;
        for (let i = 0; i < chord.length; i++) {
          chord[i].endTick = t;
          chord[i].tie = hasSecondHalf ? true : originalTies[i];
        }
        let abc1 = chordToString(chord, null, unitTime, unitLength);
        let abc2 = "";
        if (hasSecondHalf) {
          for (let i = 0; i < chord.length; i++) {
            chord[i].startTick = t;
            chord[i].endTick = endTick;
            chord[i].tie = originalTies[i];
          }
          abc2 = chordToString(chord, nextChord, unitTime, unitLength);
          if (abc2 == "") {
            abc1 = stripTrailingTies(abc1);
          }
        }
        for (let i = 0; i < chord.length; i++) {
          chord[i].startTick = startTick;
          chord[i].endTick = endTick;
          chord[i].tie = originalTies[i];
        }
        duration = round(duration, 1e6);
        console.log(
          `illegal duration is rounded: ${duration}, ${error}, ${abc1}${abc2}`,
        );
        return abc1 + abc2;
      }
    }
  }
}

function getTupletString(_len1, _keyLength) {
  return "";
}

function noteToString(chord, nextChord, unitTime, unitLength) {
  const note = chord[0];
  const duration = (note.endTick - note.startTick) * unitTime;
  const keyLength = approximateKeyLength(duration, unitLength);
  if (keyLength.numerator == 0) return "";
  const abc = fixIllegalDuration(
    chord,
    nextChord,
    unitTime,
    unitLength,
    keyLength,
    duration,
  );
  if (abc) return abc;
  const keyString = noteToKeyString(note);
  const [len1, len2] = calcKeyLength(keyLength);
  const tie = (note.tie) ? "-" : "";
  const tupletString = getTupletString(len1, keyLength);
  return tupletString + keyString + len2 + tie;
}

function chordToString(chord, nextChord, unitTime, unitLength) {
  const deduped = deduplicateLotroChord(chord);
  if (deduped.length == 0) return "";
  if (deduped.length == 1) {
    return noteToString(deduped, nextChord, unitTime, unitLength);
  } else {
    const n = deduped[0];
    const duration = (n.endTick - n.startTick) * unitTime;
    const keyLength = approximateKeyLength(duration, unitLength);
    if (keyLength.numerator == 0) return "";
    const abc = fixIllegalDuration(
      deduped,
      nextChord,
      unitTime,
      unitLength,
      keyLength,
      duration,
    );
    if (abc) return abc;
    const [len1, len2] = calcKeyLength(keyLength);
    const tupletString = getTupletString(len1, keyLength);
    let allTied = true;
    for (let i = 0; i < deduped.length; i++) {
      if (!deduped[i].tie) allTied = false;
    }
    const tie = allTied ? "-" : "";
    let str = "";
    for (let i = 0; i < deduped.length; i++) {
      const note = deduped[i];
      // LOTRO requires duration and tie inside [...] on each note, never after ]
      str += noteToKeyString(note) + len2 + tie;
    }
    return tupletString + `[${str}]`;
  }
}

function noteToKeyString(note) {
  const pitch = foldLotroPitch(note.pitch);
  const doremi = [
    "C",
    "^C",
    "D",
    "^D",
    "E",
    "F",
    "^F",
    "G",
    "^G",
    "A",
    "^A",
    "B",
  ];
  const baseline = pitch - 60;
  const key = ((baseline % 12) + 12) % 12;
  const height = Math.floor(baseline / 12);
  const isSharp = key == 1 || key == 3 || key == 6 || key == 8 || key == 10;
  let naturalPrefix = "";
  if (isSharp) {
    activeSharps.add(pitch - 1);
  } else if (activeSharps.has(pitch)) {
    naturalPrefix = "=";
    activeSharps.delete(pitch);
  }
  if (height >= 1) {
    const count = height - 1;
    let keyString = naturalPrefix + doremi.at(key).toLowerCase();
    for (let i = 0; i < count; i++) {
      keyString += "'";
    }
    return keyString;
  } else {
    const count = -height;
    let keyString = naturalPrefix + doremi.at(key);
    for (let i = 0; i < count; i++) {
      keyString += ",";
    }
    return keyString;
  }
}

function cleanupTimeSignatures(timeSignatures) {
  const map = new Map();
  for (let i = 0; i < timeSignatures.length; i++) {
    map.set(timeSignatures[i].tick, timeSignatures[i]);
  }
  const values = Array.from(map.values());
  const result = [];
  for (let i = 0; i < values.length; i++) {
    result.push(values[i]);
  }
  return result;
}

function cleanupTempos(tempos, totalTicks) {
  const map = new Map();
  for (let i = 0; i < tempos.length; i++) {
    map.set(tempos[i].tick, tempos[i].qpm);
  }
  const entries = Array.from(map.entries());
  const result = [];
  for (let i = 0; i < entries.length; i++) {
    const [tick, qpm] = entries[i];
    result.push({ tick: tick, qpm: qpm, tickTo: totalTicks });
  }
  if (result.length != 1) {
    for (let i = 0; i < result.length - 1; i++) {
      result[i].tickTo = result[i + 1].tick;
    }
    result[result.length - 1].tickTo = totalTicks;
  }
  return result;
}

function splitTempos(notes, tempos, totalTicks) {
  const result = [];
  const cleanedTempos = cleanupTempos(tempos, totalTicks);
  if (cleanedTempos.length == 1) {
    return [[notes, cleanedTempos[0]]];
  }
  for (let i = 0; i < cleanedTempos.length; i++) {
    const tempo = cleanedTempos[i];
    const tFrom = tempo.tick;
    const tTo = tempo.tickTo;
    const filtered = [];
    for (let j = 0; j < notes.length; j++) {
      if (notes[j].startTick < tTo && tFrom <= notes[j].startTick) {
        filtered.push(notes[j]);
      }
    }
    result.push([filtered, cleanedTempos[i]]);
  }
  return result;
}

function splitInstruments(notes) {
  if (notes.length == 0) return [];
  let instrument = notes[0].instrument;
  let pos = 0;
  const result = [];
  for (let i = 0; i < notes.length; i++) {
    if (notes[i].instrument != instrument) {
      result.push(notes.slice(pos, i));
      instrument = notes[i].instrument;
      pos = i;
    }
  }
  result.push(notes.slice(pos));
  return result;
}

class KeyLength {
  constructor(numerator, denominator, factor, error) {
    if (numerator > 0 && denominator > 0) {
      const g = gcd(numerator, denominator);
      this.numerator = numerator / g;
      this.denominator = denominator / g;
    } else {
      this.numerator = numerator;
      this.denominator = denominator;
    }
    this.factor = factor;
    this.error = error;
  }
}

function calcKeyLength(keyLength) {
  const n = keyLength.numerator;
  const d = keyLength.denominator;
  if (n == 0) return [null, null];
  if (d == 1) {
    if (n == 1) return ["", ""];
    return ["", `${n}`];
  }
  if (n == 1) return ["", `/${d}`];
  return ["", `${n}/${d}`];
}

function approximateKeyLength(duration, unitLength) {
  const base = 60;
  duration = Math.round(duration * 1e6) / 1e6;
  if (duration == base) return new KeyLength(1, 1, 0, 0);
  if (duration <= 0) {
    console.error(`duration is negative: ${duration}`);
    return new KeyLength(0, 0, 0, duration);
  }
  const minDuration = currentMinDuration;
  if (duration < minDuration) {
    console.log(`duration (less than minDuration) is ignored: ${duration}`);
    return new KeyLength(0, 0, 0, duration);
  }
  let n = 2;
  if (duration > base) {
    // normal power-of-2 note (capped at 8 units per token so notes never exceed LOTRO's 8-second limit)
    while (duration / n > base && n < 8) n *= 2;
    if (duration / n == base) return new KeyLength(n, 1, 0, 0);
    if (duration / n > base) {
      const diff = duration - base * n;
      return new KeyLength(n, 1, 0, diff);
    }
    // single-dotted note (3/2 * n)
    n /= 2;
    let nearestDiff = duration / n - base;
    let nearestNumerator = n;
    let nearestDenominator = 1;
    const p = 2;
    const q = 3;
    const k = n * q / p;
    const diffDot = round(duration / k, 1e6) - base;
    if (diffDot == 0) {
      return new KeyLength(n * q, p, 0, 0);
    } else if (0 < diffDot && diffDot < nearestDiff) {
      nearestNumerator = n * q;
      nearestDenominator = p;
    }
    const diff = duration - base * nearestNumerator / nearestDenominator;
    return new KeyLength(nearestNumerator, nearestDenominator, 0, diff);
  } else {
    // normal fractional note (/2 when currentMinDuration == 30)
    const maxDenom = Math.max(1, Math.round(base / minDuration));
    while (duration * n < base && n < maxDenom) n *= 2;
    if (duration * n == base) return new KeyLength(1, n, 0, 0);
    let nearestDiff = Math.abs(duration * n - base);
    let nearestNumerator = 1;
    let nearestDenominator = n;
    const p = 2;
    const q = 3;
    if (n * p <= maxDenom) {
      const k = q / (n * p);
      const diffDot = Math.abs(round(duration / k, 1e6) - base);
      if (diffDot == 0) {
        return new KeyLength(q, n * p, 0, 0);
      } else if (diffDot < nearestDiff) {
        nearestNumerator = q;
        nearestDenominator = n * p;
      }
    }
    const diff = duration - base * nearestNumerator / nearestDenominator;
    return new KeyLength(nearestNumerator, nearestDenominator, 0, diff);
  }
}

function splitRestDurtion(duration) {
  const base = 60;
  duration = Math.round(duration * 1e6) / 1e6;
  if (duration <= base) return [duration];
  const result = [];
  while (duration > 60) {
    let n = 2;
    while (duration / n > base && n < 16) n *= 2;
    if (duration / n == base) {
      result.push(duration);
      return result;
    } else if (duration / n > base) {
      const rest = n * base;
      result.push(rest);
      duration = round(duration - rest, 1e6);
    } else {
      const rest = n * 30;
      result.push(rest);
      duration = round(duration - rest, 1e6);
    }
  }
  if (duration >= currentMinDuration) {
    result.push(duration);
  }
  return result;
}

function durationToRestString(startTick, endTick, unitTime, unitLength) {
  if (startTick < endTick) {
    const duration = (endTick - startTick) * unitTime;
    let abc = "";
    const durations = splitRestDurtion(duration);
    for (let i = 0; i < durations.length; i++) {
      const keyLength = approximateKeyLength(durations[i], unitLength);
      const [len1, len2] = calcKeyLength(keyLength);
      if (len2 == null) continue;
      const tupletString = getTupletString(len1, keyLength);
      abc += tupletString + "z" + len2;
    }
    return abc;
  } else {
    return "";
  }
}

function guessClef(ins) {
  let total = 0;
  for (let i = 0; i < ins.length; i++) {
    total += ins[i].pitch;
  }
  const pitch = total / ins.length;
  if (pitch > 64) {
    return "G2";
  } else {
    return "F4";
  }
}

function cleanupTicks(ns) {
  let min = Infinity;
  for (let i = 0; i < ns.notes.length; i++) {
    if (ns.notes[i].startTick < min) min = ns.notes[i].startTick;
  }
  if (min != 0) {
    for (let i = 0; i < ns.notes.length; i++) {
      ns.notes[i].startTick -= min;
      ns.notes[i].endTick -= min;
    }
    for (let i = 0; i < ns.tempos.length; i++) {
      if (0 < ns.tempos[i].tick) ns.tempos[i].tick -= min;
    }
    ns.totalTicks -= min;
  }
  return ns;
}

function round(x, epsilon) {
  return Math.round(x * epsilon) / epsilon;
}

function chordToTieString(
  chord,
  nextChord,
  unitTime,
  unitLength,
  sectionLength,
  tempo,
) {
  let abcString = "";
  const origStart = chord[0].startTick;
  const endTick = chord[0].endTick;
  const originalTies = chord.map((note) => note.tie);
  let currStart = origStart;

  while (round((endTick - sectionEnd) * unitTime, 1e6) >= currentMinDuration) {
    for (let i = 0; i < chord.length; i++) {
      chord[i].startTick = currStart;
      chord[i].endTick = sectionEnd;
      chord[i].tie = true;
    }
    abcString += chordToString(chord, nextChord, unitTime, unitLength);
    abcString += "|";
    activeSharps.clear();
    if (section % 2 == 0) abcString += "\n";
    currStart = sectionEnd;
    section += 1;
    sectionEnd = tempo.tick + section * sectionLength;
  }

  if (round(currStart, 1e9) < round(endTick, 1e9)) {
    const endsOnBar = round(endTick, 1e9) == round(sectionEnd, 1e9);
    for (let i = 0; i < chord.length; i++) {
      chord[i].startTick = currStart;
      chord[i].endTick = endTick;
      chord[i].tie = endsOnBar ? false : originalTies[i];
    }
    const tail = chordToString(chord, nextChord, unitTime, unitLength);
    if (tail == "") {
      abcString = stripTrailingTies(abcString);
    } else {
      abcString += tail;
    }
    if (endsOnBar) {
      abcString += "|";
      activeSharps.clear();
      if (section % 2 == 0) abcString += "\n";
      section += 1;
      sectionEnd = tempo.tick + section * sectionLength;
    }
  }

  for (let i = 0; i < chord.length; i++) {
    chord[i].startTick = origStart;
    chord[i].endTick = endTick;
    chord[i].tie = originalTies[i];
  }
  return abcString;
}

function durationToRestStrings(
  startTick,
  endTick,
  tempo,
  unitTime,
  unitLength,
  sectionLength,
) {
  let abcString = "";
  let currStart = startTick;
  while (round(sectionEnd, 1e9) <= round(endTick, 1e9)) {
    if (round(currStart, 1e9) < round(sectionEnd, 1e9)) {
      abcString += durationToRestString(
        currStart,
        sectionEnd,
        unitTime,
        unitLength,
      );
    }
    abcString += "|";
    activeSharps.clear();
    if (section % 2 == 0) abcString += "\n";
    currStart = sectionEnd;
    section += 1;
    sectionEnd = tempo.tick + section * sectionLength;
  }
  if (round(currStart, 1e9) < round(endTick, 1e9)) {
    abcString += durationToRestString(
      currStart,
      endTick,
      unitTime,
      unitLength,
    );
  }
  return abcString;
}

function cloneNote(note) {
  return {
    instrument: note.instrument,
    program: note.program,
    startTick: note.startTick,
    endTick: note.endTick,
    pitch: note.pitch,
    velocity: note.pitch,
    isDrum: note.isDrum,
    // tie
    // splitted
  };
}

function getTargetPosition(ns, i) {
  const endTick = ns[i].endTick;
  i += 1;
  while (ns[i] && ns[i].startTick < endTick) {
    i += 1;
  }
  return i;
}

function getNotationBreaks(ns) {
  const set = new Set();
  for (let i = 0; i < ns.length; i++) {
    set.add(ns[i].startTick);
    set.add(ns[i].endTick);
  }
  const arr = [...set];
  arr.sort((a, b) => {
    if (a > b) return 1;
    if (a < b) return -1;
    return 0;
  });
  return arr.slice(1);
}

function getChord(ns) {
  let i = 0;
  const result = [];
  while (ns[i]) {
    const j = getTargetPosition(ns, i);
    const target = ns.slice(i, j);
    const notationBreaks = getNotationBreaks(target);
    if (notationBreaks.length == 1) {
      result.push(target);
      i = j;
    } else {
      const endTick = ns[i].endTick;
      const targetBreaks = [];
      for (let k = 0; k < notationBreaks.length; k++) {
        if (notationBreaks[k] <= endTick) targetBreaks.push(notationBreaks[k]);
      }
      const chords = splitChord(target, targetBreaks);
      result.push(...chords);
      const nextTarget = [];
      for (let k = 0; k < target.length; k++) {
        const n = target[k];
        if (endTick < n.endTick) {
          const newNote = cloneNote(n);
          newNote.startTick = endTick;
          newNote.splitted = true;
          nextTarget.push(newNote);
        }
      }
      ns = ns.slice(j);
      ns.unshift(...nextTarget);
      i = 0;
    }
  }
  return result;
}

function splitChord(chord, endTicks) {
  const result = [];
  for (let i = 0; i < endTicks.length; i++) {
    const endTick = endTicks[i];
    if (i == 0) {
      const newChord = [];
      const startTick = chord[0].startTick;
      for (let j = 0; j < chord.length; j++) {
        const n = chord[j];
        if (n.startTick == startTick) {
          const newNote = cloneNote(n);
          newNote.endTick = endTick;
          newNote.splitted = true;
          newNote.tie = false;
          newChord.push(newNote);
        }
      }
      result.push(newChord);
    } else {
      const startTick = endTicks[i - 1];
      const newChord = [];
      for (let j = 0; j < chord.length; j++) {
        const n = chord[j];
        if (n.startTick <= startTick && endTick <= n.endTick) {
          const newNote = cloneNote(n);
          newNote.startTick = startTick;
          newNote.endTick = endTick;
          newNote.splitted = true;
          newNote.tie = false;
          newChord.push(newNote);
        }
      }
      result.push(newChord);
    }
  }
  return result;
}

function sanitizeLotroBody(body) {
  // Remove any dangling tie before a rest or at the end of a part (both single notes and chords)
  let cleaned = body.replace(/-((?:\|\n?|\n)*z)/g, "$1");
  cleaned = cleaned.replace(/(\[[^\]]*\])((?:\|\n?|\n)*z)/g, (_, ch, rest) => ch.replaceAll("-", "") + rest);
  cleaned = cleaned.replace(/-(?:(\|\s*)|\s*)$/, "$1");
  cleaned = cleaned.replace(/(\[[^\]]*\])((?:\|\s*|\s*)$)/, (_, ch, suffix) => ch.replaceAll("-", "") + suffix);
  return cleaned;
}

function quantizeNotesForTempo(ns, qpm) {
  const stepDiv = qpm > 120 ? 4 : 8;
  const grid = Math.max(1, ns.ticksPerBeat / stepDiv);
  let maxEnd = 0;
  const validNotes = [];
  for (let i = 0; i < ns.notes.length; i++) {
    const n = ns.notes[i];
    const s = Math.round(n.startTick / grid) * grid;
    let e = Math.round(n.endTick / grid) * grid;
    if (e <= s) e = s + grid;
    n.startTick = s;
    n.endTick = e;
    validNotes.push(n);
    if (e > maxEnd) maxEnd = e;
  }
  ns.notes = validNotes;
  if (maxEnd > ns.totalTicks) ns.totalTicks = maxEnd;
}

function segmentToString(ns, ins, partNumber, tempo, options, totalParts) {
  if (ins.length == 0) return "";
  activeSharps.clear();
  const unitLength = 4;
  const timeSignature = { numerator: 4, denominator: 4 };
  const beat = 1;
  const unitTime = 60 * unitLength / ns.ticksPerBeat;
  const sectionLength = 4 * ns.ticksPerBeat * beat;
  const header = setInstrumentHeader(
    ins,
    partNumber,
    unitLength,
    timeSignature,
    tempo,
    options,
    totalParts,
  );
  section = 1;
  sectionEnd = tempo.tick + section * sectionLength;

  let body = "";
  const chords = getChord(ins);
  for (let i = 0; i < chords.length; i++) {
    const chord = chords[i];
    const nextChord = chords[i + 1];
    if (i == 0 && chord[0].startTick != tempo.tick) {
      body += durationToRestStrings(
        tempo.tick,
        chord[0].startTick,
        tempo,
        unitTime,
        unitLength,
        sectionLength,
      );
    }
    if (round(sectionEnd, 1e9) <= round(chord[0].endTick, 1e9)) {
      body += chordToTieString(
        chord,
        nextChord,
        unitTime,
        unitLength,
        sectionLength,
        tempo,
      );
    } else {
      body += chordToString(chord, nextChord, unitTime, unitLength);
    }
    if (nextChord) {
      body += durationToRestStrings(
        chord[0].endTick,
        nextChord[0].startTick,
        tempo,
        unitTime,
        unitLength,
        sectionLength,
      );
    } else {
      if (!body.endsWith("\n")) {
        body += "\n";
      }
    }
  }
  return header + sanitizeLotroBody(body);
}

function getPrimaryTempo(tempos, totalTicks) {
  const cleaned = cleanupTempos(tempos, totalTicks);
  if (cleaned.length == 0) return { tick: 0, qpm: 120, tickTo: totalTicks };
  let best = cleaned[0];
  let bestSpan = -1;
  for (let i = 0; i < cleaned.length; i++) {
    const span = Math.max(0, cleaned[i].tickTo - Math.max(0, cleaned[i].tick));
    if (span > bestSpan) {
      bestSpan = span;
      best = cleaned[i];
    }
  }
  // Clamp QPM to [45, 240] so notes stay well within LOTRO's [60ms, 8s] duration limits
  const clampedQpm = Math.min(240, Math.max(45, Math.round(best.qpm || 120)));
  return { tick: 0, qpm: clampedQpm, tickTo: totalTicks };
}

function setInstrumentHeader(
  ins,
  partNumber,
  unitLength,
  timeSignature,
  tempo,
  options,
  totalParts,
) {
  const numerator = timeSignature.numerator;
  const denominator = timeSignature.denominator;
  const baseTitle = (options && options.title) ? options.title : "Untitled";
  const partSuffix = totalParts > 1
    ? ` - Part ${partNumber}${ins[0].isDrum ? " (Drums)" : ""}`
    : "";
  let header = `X:${partNumber}\n`;
  header += `T:${baseTitle}${partSuffix}\n`;
  if (options && options.composer) {
    header += `C:${options.composer}\n`;
  }
  header += `%%MIDI program ${ins[0].program}\n`;
  header += `M:${numerator}/${denominator}\n`;
  header += `L:1/${4 * unitLength}\n`;
  header += `Q:1/4=${Math.round(tempo.qpm)}\n`;
  header += `K:C\n`;
  return header;
}

export default function notesToAbc(ns, options) {
  if (!ns.notes || ns.notes.length == 0) {
    const baseTitle = (options && options.title) ? options.title : "Untitled";
    return `X:1\nT:${baseTitle}\nM:4/4\nL:1/16\nQ:1/4=120\nK:C\nz4\n`;
  }
  cleanupTicks(ns);
  const tempo = getPrimaryTempo(ns.tempos, ns.totalTicks);
  currentMinDuration = tempo.qpm > 120 ? 60 : 30;
  quantizeNotesForTempo(ns, tempo.qpm);
  const rawSegments = splitInstruments(ns.notes).filter((seg) => seg.length > 0);
  // Place melodic parts before percussion parts so X:1 is melodic when available
  const melodic = rawSegments.filter((seg) => !seg[0].isDrum);
  const drums = rawSegments.filter((seg) => seg[0].isDrum);
  const instrumentSegments = [...melodic, ...drums];

  const parts = [];
  for (let i = 0; i < instrumentSegments.length; i++) {
    section = 0;
    const partStr = segmentToString(
      ns,
      instrumentSegments[i],
      i + 1,
      tempo,
      options,
      instrumentSegments.length,
    );
    if (partStr) parts.push(partStr.trimEnd());
  }
  return parts.join("\n\n") + "\n";
}
