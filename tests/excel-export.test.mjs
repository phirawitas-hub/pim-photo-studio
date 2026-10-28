import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {csvRows} from '../export.mjs';
import {createExcelWorkbook} from '../excel-export.mjs';
const XLSX=createRequire(import.meta.url)('../vendor/xlsx.full.min.js');
test('Excel file round-trips native Drive hyperlinks and selected revision',()=>{
 const p={id:'p',code:'00012',name:'สินค้าไทย',revisionNumber:2,fields:{photographer:'ผู้ถ่าย'},photos:{outer:[{fileId:'selected-photo_2',name:'outer.jpg'},{name:'local.jpg'}]}};
 const rows=csvRows([p]),book=createExcelWorkbook(XLSX,rows),bytes=XLSX.write(book,{bookType:'xlsx',type:'buffer'}),reopened=XLSX.read(bytes,{type:'buffer'});
 assert.deepEqual(reopened.SheetNames,['รูปภาพ','ข้อมูลทั้งหมด']);const gallery=reopened.Sheets['รูปภาพ'];assert.equal(gallery.A2.v,'00012');assert.equal(gallery.C2.v,2);assert.equal(gallery.G2.v,'เปิดรูปใน Drive');assert.equal(gallery.G2.l.Target,'https://drive.google.com/file/d/selected-photo_2/view');assert.equal(gallery.G3?.l,undefined);assert.match(gallery.H3.v,/ฉบับร่าง/);
 const c=rows[0].indexOf('Original Package (Outer) 1 · Drive URL'),cell=reopened.Sheets['ข้อมูลทั้งหมด'][XLSX.utils.encode_cell({r:1,c})];assert.equal(cell.l.Target,gallery.G2.l.Target);assert.equal(cell.v,gallery.G2.l.Target);assert.equal(reopened.Sheets['ข้อมูลทั้งหมด'].A2.v,'00012');
});
test('Excel treats imported formulas as text and only activates valid Drive URLs',()=>{
 const rows=[['Item Code','Product Name','Top view 1 · Drive URL','Top view 1 · File name','Top view 1 · สถานะ'],['=1+1','@SUM(A1)','javascript:alert(1)','a.jpg','draft']];const book=createExcelWorkbook(XLSX,rows);assert.equal(book.Sheets['ข้อมูลทั้งหมด'].A2.t,'s');assert.equal(book.Sheets['ข้อมูลทั้งหมด'].A2.f,undefined);assert.equal(book.Sheets['ข้อมูลทั้งหมด'].C2.l,undefined);assert.equal(book.Sheets['รูปภาพ'].G2?.l,undefined);
});
test('empty photo sets still produce an understandable photo index and full data',()=>{const book=createExcelWorkbook(XLSX,csvRows([{id:'p',code:'no-photo',name:'ไม่มีรูป'}]));assert.equal(book.Sheets['รูปภาพ']['!ref'],'A1:H1');assert.equal(book.Sheets['ข้อมูลทั้งหมด'].A2.v,'no-photo');});
