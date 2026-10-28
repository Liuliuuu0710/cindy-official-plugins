'use strict';
// Shared by the sandbox pages and Node worker. Paths stay relative in saved settings.
globalThis.CindyPingLibrary = (() => {
  const definitions = [
    ['help', '❓', '解困', 'Help me out', '我卡在这里了，帮我搞定', "I'm stuck; help me work this out."],
    ['verify', '🔎', '求证', 'Verify', '这靠谱吗，帮我核实', 'Is this reliable? Check the evidence.'],
    ['decide', '🔀', '拿主意', 'Help me choose', '拿不定主意，帮我选', 'Help me choose a direction.'],
    ['inspire', '💡', '找灵感', 'Find ideas', '没思路，帮我想些好点子', 'Give me fresh, usable ideas.'],
    ['improve', '✨', '改进', 'Improve this', '不够好，帮我做好一点', 'Make this better.'],
    ['investigate', '🔍', '深挖', 'Investigate', '想弄清这件事，帮我查到底', 'Research this thoroughly.'],
    ['organize', '🧶', '理顺', 'Untangle', '这堆东西太乱了，帮我理清', 'Turn this mess into something clear.'],
    ['respond', '💬', '应对沟通', 'Handle a conversation', '这段沟通怎么处理，帮我接一下', 'Help me handle this conversation.'],
    ['keep', '📝', '留存', 'Keep this', '这个有用，帮我留下来', 'Save this useful information.'],
    ['delegate', '➡️', '代劳', 'Take it from here', '目标很清楚，交给你做完', 'The task is clear; take it from here.'],
    ['undo', '🙀', '撤销', 'Undo', '收回上一条还没生效的动作', 'Take back the last pending action.'],
  ];
  function presets(locale = 'en') {
    const zh = locale === 'zh-CN';
    return definitions.map(([id, emoji, zhName, enName, zhMeaning, enMeaning]) => ({
      id, emoji, label: zh ? zhName : enName, meaning: zh ? zhMeaning : enMeaning,
      imagePath: `assets/emotes/${id}.webp`,
    }));
  }
  function defaults(locale) {
    const library = presets(locale);
    const emotes = ['help', 'verify', 'inspire'].map(id => {
      const { label, emoji, imagePath } = library.find(item => item.id === id);
      return { id: `ping-${id}`, label, emoji, imagePath, action: 'none', prompt: '', taskId: '', screenshot: true };
    });
    const { label, emoji, imagePath } = library.find(item => item.id === 'undo');
    emotes.push({ id: 'ping-undo', label, emoji, imagePath,
      action: 'none', prompt: '', taskId: '', screenshot: false });
    return { emotes };
  }
  function imagePath(path) {
    // Preserve configurations saved before the bundled lossless format change.
    const preset = definitions.find(([id]) => path === `assets/emotes/${id}.png`);
    return preset ? `assets/emotes/${preset[0]}.webp` : path;
  }
  return { presets, defaults, imagePath };
})();
if (typeof module !== 'undefined') module.exports = globalThis.CindyPingLibrary;
