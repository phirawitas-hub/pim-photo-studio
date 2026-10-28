import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {csvRows} from '../export.mjs';
import {createExcelWorkbook} from '../excel-export.mjs';
import {excelPhotoUrl,drivePhotoUrl} from '../drive-links.mjs';
const XLSX=createRequire(import.meta.url)('../vendor/xlsx.full.min.js');
const url='https://drive.google.com/file/d/selected-photo_2/view';
function roundTrip(rows){return XLSX.read(XLSX.write(createExcelWorkbook(XLSX,rows),{bookType:'xlsx',type:'buffer'}),{type:'buffer'});}
test('horizontal gallery keeps one row per Item, correct slots, drafts and full source URLs',()=>{
 const rows=csvRows([{id:'p',code:'00012',name:'สินค้าไทย',revisionNumber:2,fields:{photographer:'ผู้ถ่าย'},photos:{outer:[{fileId:'selected-photo_2',name:'outer.jpg'},{name:'local.jpg'}]}},{id:'q',code:'00013',photos:{top:[{fileId:'top-photo',name:'top.jpg'}]}}]);
 const book=roundTrip(rows),gallery=book.Sheets['รูปภาพ'],matrix=XLSX.utils.sheet_to_json(gallery,{header:1});
 assert.deepEqual(book.SheetNames,['รูปภาพ','ข้อมูลทั้งหมด']);assert.equal(matrix.length,3);assert.equal(gallery.A2.v,'00012');assert.equal(gallery.C2.v,2);assert.equal(gallery.A3.v,'00013');
 const outer=matrix[0].indexOf('Original Package (Outer) 1'),draft=matrix[0].indexOf('Original Package (Outer) 2'),top=matrix[0].indexOf('Top view 1');
 const at=(r,c)=>gallery[XLSX.utils.encode_cell({r,c})];
 assert.equal(at(1,outer).v,'เปิดรูปใน Drive');assert.equal(at(1,outer).l.Target,excelPhotoUrl(url));assert.equal(at(2,outer).l,undefined);assert.equal(at(1,top).l,undefined);assert.ok(at(2,top).l);assert.equal(at(1,draft).l,undefined);assert.match(at(1,draft).v,/ฉบับร่าง/);
 const c=rows[0].indexOf('Original Package (Outer) 1 · Drive URL'),cell=book.Sheets['ข้อมูลทั้งหมด'][XLSX.utils.encode_cell({r:1,c})];assert.equal(cell.v,url);assert.equal(cell.l.Target,excelPhotoUrl(url));
});
test('imported formulas and unsafe links remain text without formulas or active hyperlinks',()=>{
 const rows=[['Item Code','Product Name','Top view 1 · Drive URL','Top view 1 · File name','Top view 1 · สถานะ'],['=1+1','@SUM(A1)','javascript:alert(1)','a.jpg','draft']];const book=roundTrip(rows);
 assert.equal(book.Sheets['ข้อมูลทั้งหมด'].A2.t,'s');assert.equal(book.Sheets['ข้อมูลทั้งหมด'].A2.f,undefined);assert.equal(book.Sheets['ข้อมูลทั้งหมด'].C2.l,undefined);assert.equal(book.Sheets['รูปภาพ'].I2.l,undefined);
});
test('products with no photos remain present in horizontal gallery',()=>{const book=roundTrip(csvRows([{id:'p',code:'no-photo',name:'ไม่มีรูป'}]));assert.equal(book.Sheets['รูปภาพ']['!ref'],'A1:H2');assert.equal(book.Sheets['รูปภาพ'].A2.v,'no-photo');});
test('browser handoff can only navigate to a validated Google Drive file',()=>{
 assert.equal(excelPhotoUrl(url),'https://phirawitas-hub.github.io/pim-photo-studio/open-photo.html?id=selected-photo_2');assert.equal(drivePhotoUrl('selected-photo_2'),url);
 for(const id of [null,'','../bad','https://evil.example','x?url=evil','x#fragment','a'.repeat(201)])assert.equal(drivePhotoUrl(id),'');
 for(const target of ['https://drive.google.com.evil/file/d/a/view','javascript:alert(1)',url+'?redirect=evil','http://drive.google.com/file/d/a/view'])assert.equal(excelPhotoUrl(target),'');
});
