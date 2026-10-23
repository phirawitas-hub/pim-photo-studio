// Optional live service test. Run testPimIntegration in the Apps Script editor.
// Creates a disposable spreadsheet and test photo, then moves them to Trash.
function testPimIntegration() {
  const ss=SpreadsheetApp.create('PIM Photo Studio - disposable integration test');
  const sheetId=ss.getId(), props=PropertiesService.getUserProperties();
  const call=(action,payload)=>pimCall({sheetId,action,payload});
  const check=(ok,message)=>{if(!ok)throw Error('Integration check failed: '+message);};
  try {
    check(call('hello').sheetId===sheetId,'open sheet');
    const original=Utilities.base64Encode(Utilities.newBlob('Item Code,Product Name\n0001,Test\n').getBytes());
    const payload={key:'import-testbatch',kind:'import',name:'test.csv',mime:'text/csv',base64:original};
    const originalId=call('upload',payload);
    check(originalId===call('upload',payload),'upload retry');
    call('sourceRows',{batchId:'testbatch',index:0,rows:[{number:1,cells:['0001','=1+1',"'literal quote",'normal']}]});
    const source=ss.getSheetByName('IMP_testbatch_1').getRange(1,1,1,4);
    check(source.getDisplayValues()[0].join('|')==="0001|=1+1|'literal quote|normal",'literal imported text');
    check(source.getFormulas()[0].every(v=>!v),'formulas not executed');
    call('sourceMeta',{batchId:'testbatch',part:1,text:JSON.stringify({sheets:[{name:'Test',cells:[{address:'A1',value:'Item Code',type:'s'},{address:'B1',value:'Product Name',type:'s'},{address:'A2',value:'TEST-PHOTO',type:'s'},{address:'B2',value:'Integration test',type:'s'}]}]})});
    const now=new Date().toISOString();
    call('products',{rows:[['testproduct','TEST-PHOTO','Integration test','','testbatch','Test',2,now]]});
    call('finishImport',{row:['testbatch','test.csv',now,originalId,'Test',1]});
    const image={key:'photo-testphoto',kind:'photo',productId:'testproduct',angle:'top',name:'test.png',mime:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1sAAAAASUVORK5CYII='};
    const photoId=call('upload',image);
    check(photoId===call('upload',image),'photo retry');
    check(call('photo',{fileId:photoId}).base64===image.base64,'photo download');
    const rev={id:'testrevision',productId:'testproduct',baseRevision:null,meta:{purpose:'Test',fields:{photographer:'Integration QA'}},photos:{top:[{id:'testphoto',fileId:photoId,name:'test.png',size:68}]}};
    const saved=call('revision',rev);check(saved.id===call('revision',rev).id,'revision retry');
    check(call('read',{name:'PIM_Revisions'}).length===1,'single revision');
    check(call('read',{name:'PIM_Files'}).length===2,'single original and photo');
    const data=ss.getSheetByName('Data');check(data.getLastRow()===2,'single Data row after retry');const heads=data.getRange(1,1,1,data.getLastColumn()).getDisplayValues()[0];const photoCell=data.getRange(2,heads.indexOf('Top view 1')+1);check(photoCell.getRichTextValue().getLinkUrl()==='https://drive.google.com/file/d/'+photoId+'/view','clickable Drive link in Data');check(data.getRange(2,heads.indexOf('รหัสสินค้า')+1).getDisplayValue()==='TEST-PHOTO','Data code heading');
    call('products',{rows:[['testproduct2','TEST-PHOTO','Second request','','testbatch','Test',2,now]]});
    call('syncData',{});check(ss.getSheetByName('Data').getLastRow()===3,'reuse added second request row');
    const hist=call('itemHistory',{code:'TEST-PHOTO'});check(hist.length===1,'shared item history');
    const rev2=call('revision',{id:'testrevision2',productId:'testproduct2',baseRevision:'testrevision',meta:{fields:{photographer:'Second QA'}},photos:rev.photos});
    check(rev2.number===2,'numbered revision');call('selectRevision',{productId:'testproduct2',revisionId:'testrevision'});
    const data2=data.getRange(3,1,1,data.getLastColumn()).getDisplayValues()[0];
    check(data2[heads.indexOf('ชื่อผู้ถ่าย')]==='Integration QA','selected photographer in Data');
    check(data2[heads.indexOf('Revision')]==='1','selected revision in Data');
    check(!!data2[heads.indexOf('วันที่เวลาบันทึก')],'server saved timestamp');
    const stock=ss.insertSheet('Stock_VP');stock.getRange(1,1,3,6).setValues([['Location','Item Code','Description','Inventory Status','Categories','On Hand Qty'],['A','TEST-PHOTO','Part','Good','SPARE PART',3],['B','TEST-PHOTO','Part','Hold','SPARE PART',2]]);
    check(call('stock',{code:'TEST-PHOTO'}).rows.length===2,'stock locations');
    console.log('PASS: Stock, photographer, timestamps, shared item revision, selected revision;  Data headings, clickable Drive links, no duplicate Data rows; live Sheets write/read, literal text, Drive original/photo upload/download, upload retry, revision retry');
  } finally {
    const root=props.getProperty('pim-root-'+sheetId);
    if(root)DriveApp.getFolderById(root).setTrashed(true);
    props.deleteProperty('pim-root-'+sheetId);
    DriveApp.getFileById(sheetId).setTrashed(true);
  }
}
