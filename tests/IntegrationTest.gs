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
    call('sourceMeta',{batchId:'testbatch',part:1,text:'{"test":true}'});
    const now=new Date().toISOString();
    call('products',{rows:[['testproduct','TEST-PHOTO','Integration test','','testbatch','Test',2,now]]});
    call('finishImport',{row:['testbatch','test.csv',now,originalId,'Test',1]});
    const image={key:'photo-testphoto',kind:'photo',productId:'testproduct',angle:'top',name:'test.png',mime:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1sAAAAASUVORK5CYII='};
    const photoId=call('upload',image);
    check(photoId===call('upload',image),'photo retry');
    check(call('photo',{fileId:photoId}).base64===image.base64,'photo download');
    const rev={id:'testrevision',productId:'testproduct',baseRevision:null,meta:{purpose:'Test'},photos:{top:[{id:'testphoto',fileId:photoId,name:'test.png',size:68}]}};
    const saved=call('revision',rev);check(saved.id===call('revision',rev).id,'revision retry');
    check(call('read',{name:'PIM_Revisions'}).length===1,'single revision');
    check(call('read',{name:'PIM_Files'}).length===2,'single original and photo');
    console.log('PASS: live Sheets write/read, literal text, Drive original/photo upload/download, upload retry, revision retry');
  } finally {
    const root=props.getProperty('pim-root-'+sheetId);
    if(root)DriveApp.getFolderById(root).setTrashed(true);
    props.deleteProperty('pim-root-'+sheetId);
    DriveApp.getFileById(sheetId).setTrashed(true);
  }
}
