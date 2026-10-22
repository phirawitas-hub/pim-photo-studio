export function initTheme(){
 const media=matchMedia('(prefers-color-scheme: dark)');let preference='system';try{preference=localStorage.getItem('pim-theme')||'system';}catch{}
 const apply=()=>{document.documentElement.dataset.theme=preference==='system'?(media.matches?'dark':'light'):preference;document.querySelectorAll('[data-theme-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeChoice===preference)));document.querySelector('meta[name="theme-color"]')?.setAttribute('content',document.documentElement.dataset.theme==='dark'?'#1c1c1e':'#f2f2f7');};
 document.querySelectorAll('[data-theme-choice]').forEach(b=>b.addEventListener('click',()=>{preference=b.dataset.themeChoice;try{localStorage.setItem('pim-theme',preference);}catch{}apply();}));media.addEventListener('change',apply);apply();
}
