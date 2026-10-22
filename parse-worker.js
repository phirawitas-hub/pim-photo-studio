importScripts('./vendor/xlsx.full.min.js');
self.onmessage=async event=>{try{const {inspectWorkbook}=await import('./importer.mjs');self.postMessage({ok:true,result:inspectWorkbook(XLSX,event.data)});}catch(e){self.postMessage({ok:false,error:e.message});}};
