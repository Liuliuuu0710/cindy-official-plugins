'use strict';
const EmoteWheel = (() => {
const normalizedAngle = angle => ((angle % 360) + 360) % 360;
function polar(radius, angle) {
  const radians = angle * Math.PI / 180;
  return [160 + radius * Math.cos(radians), 160 + radius * Math.sin(radians)];
}
function layout(items) {
  const pins = items.filter(emote => emote.pinAngle !== null);
  pins.forEach(emote => { if (emote.pinAngle !== null) emote.angle = emote.pinAngle; });
  pins.sort((a, b) => a.angle - b.angle);
  if (!pins.length) {
    items.sort((a, b) => a.angle - b.angle).forEach((emote, i) => { emote.angle = i * 360 / items.length; });
  } else {
    // A free item stays between the same two Pins; inserting here cannot jump elsewhere.
    pins.forEach((pin, i) => {
      const length = (i + 1 < pins.length ? pins[i + 1].angle : pins[0].angle + 360) - pin.angle;
      const members = items.filter(emote => emote.pinAngle === null && normalizedAngle(emote.angle - pin.angle) < length)
        .sort((a, b) => normalizedAngle(a.angle - pin.angle) - normalizedAngle(b.angle - pin.angle));
      members.forEach((emote, index) => { emote.angle = normalizedAngle(pin.angle + length * (index + 1) / (members.length + 1)); });
    });
  }
  return items.sort((a, b) => a.angle - b.angle);
}
function geometry(index, items) {
  const angle = items[index].angle;
  const previous = index ? items[index - 1].angle : items.at(-1).angle - 360;
  const next = index + 1 < items.length ? items[index + 1].angle : items[0].angle + 360;
  return { angle, start: (previous + angle) / 2, end: (angle + next) / 2, gap: Math.min(angle - previous, next - angle) };
}
function slicePath(index, items) {
  const section = geometry(index, items), inset = Math.min(.65, (section.end - section.start) / 12);
  const start = section.start - 90 + inset, end = section.end - 90 - inset;
  const a = polar(148, start), b = polar(148, end), c = polar(51, end), d = polar(51, start), large = end - start > 180 ? 1 : 0;
  return `M${a} A148,148 0 ${large} 1 ${b} L${c} A51,51 0 ${large} 0 ${d} Z`;
}
return { layout, geometry, slicePath, polar, normalizedAngle };
})();
if (typeof module !== 'undefined') module.exports = EmoteWheel;
