export function initTheme(){
 const media=matchMedia('(prefers-color-scheme: dark)'),root=document.documentElement;let preference='system';
 const valid=value=>['light','dark','system'].includes(value)?value:'system';try{preference=valid(localStorage.getItem('pim-theme'));}catch{}
 const apply=()=>{const theme=preference==='system'?(media.matches?'dark':'light'):preference;root.dataset.theme=theme;root.style.colorScheme=theme==='light'?'only light':'dark';
 document.querySelectorAll('[data-theme-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeChoice===preference)));
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#1c1c1e':'#f2f2f7');document.querySelector('meta[name="color-scheme"]')?.setAttribute('content',theme==='light'?'only light':'dark');};
 document.querySelectorAll('[data-theme-choice]').forEach(b=>b.addEventListener('click',()=>{preference=valid(b.dataset.themeChoice);try{localStorage.setItem('pim-theme',preference);}catch{}apply();}));
 if(media.addEventListener)media.addEventListener('change',apply);else media.addListener?.(apply);
 window.addEventListener('pageshow',apply);window.addEventListener('storage',event=>{if(event.key==='pim-theme'){preference=valid(event.newValue);apply();}});apply();
}
