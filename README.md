# PIM Photo Studio

เว็บถ่ายรูปสินค้า ใช้ Google Apps Script บันทึกข้อมูลใน Google Sheets และเก็บรูปใน Google Drive
เปิดใช้งานบน GitHub Pages และเชื่อม Google ผ่าน Apps Script ส่วนตัวด้วย iframe bridge ที่ตรวจ origin
ไม่ต้องสร้าง OAuth Client ID เปิด Advanced Services หรือผูก Billing

## เปิดใช้ครั้งแรก
1. เข้า https://script.google.com/ แล้วสร้างโปรเจกต์
2. ใส่เนื้อหา apps-script/Code.gs ในไฟล์สคริปต์ และสร้างไฟล์ HTML ชื่อ Index จาก apps-script/Index.html
3. Deploy → New deployment → Web app
4. Execute as: Me และ Who has access: Only myself สำหรับการใช้งานบัญชีนี้
5. อนุญาตสิทธิ์ Google Sheets และ Drive ครั้งแรก แล้วเปิด Web app URL ที่ลงท้าย /exec
6. ตั้ง Script property `PIM_SHEET_ID` เป็น Spreadsheet ID ของชีตเป้าหมาย แล้วตั้ง origin ใน bridge_ ให้ตรงเว็บ GitHub ของคุณ
7. Import Excel/CSV เลือกแท็บและคอลัมน์ แล้วเริ่มถ่ายรูป

การตั้งค่านี้เปิดให้เจ้าของบัญชีเท่านั้น ห้ามเปลี่ยนเป็น Anyone โดยไม่เพิ่มระบบตรวจผู้ใช้ก่อน
Google ขอสิทธิ์ Sheets และ Drive ตามบริการในสคริปต์ สิทธิ์ DriveApp ครอบคลุม Drive ของบัญชี แต่โค้ดนี้สร้าง/อ่านไฟล์ของแอปและชีตที่ระบุ ไม่เปลี่ยนการแชร์ไฟล์

## ใช้งาน
- Import ไฟล์ .xlsx/.xls/.csv สูงสุด 25 MB และเก็บข้อมูลทุกแท็บ
- สร้างคิวถ่ายจากแท็บที่เลือก รหัสซ้ำรวมเป็นงานเดียว แต่ข้อมูลต้นฉบับยังเก็บครบ
- 8 มุม: Top, Under, Left, Right, Physical Product (Inner), Original Package (Outer), Delivery Package, All Component
- 7 มุมแรกบังคับ อย่างน้อยมุมละหนึ่งรูป ทุกมุมไม่เกิน 5 รูป
- JPG/PNG/WebP สูงสุด 20 MB ต่อรูป
- ปุ่มถ่ายรูปบน Apps Script ใช้กล้องผ่านตัวเลือกไฟล์ของมือถือ บนคอมพิวเตอร์อาจเปิดตัวเลือกไฟล์แทน
- กดบันทึกลง Google เพื่ออัปโหลดรูปและบันทึก revision
- ฉบับร่างอยู่ใน IndexedDB จนกดบันทึก Google การล้างข้อมูลเว็บไซต์อาจลบฉบับร่าง
- กดรีเฟรชจากชีตเพื่ออ่านข้อมูลล่าสุดจากอีกเครื่อง

## ย้ายฉบับร่างจากเว็บ GitHub
GitHub และ Apps Script เป็นคนละเว็บไซต์ ฉบับร่างจึงแยกกัน
หน้าเชื่อมต่อ Google ในเว็บเดิม → ส่งออกฉบับร่างทั้งหมด → เปิด Apps Script → นำเข้าฉบับร่าง (หรือวางเนื้อหา JSON) → ใส่ชีตเดิมแล้วบันทึก
ไฟล์ JSON นี้มีรูปและข้อมูลต้นฉบับ เก็บเป็นส่วนตัว การนำเข้าจะไม่ทับรายการที่มีอยู่ในเบราว์เซอร์ปลายทาง

## GitHub Pages
หน้า GitHub เชื่อม Google อัตโนมัติผ่าน iframe bridge ส่วนตัว โดยตรวจ origin, source และ nonce สุ่มต่อการเชื่อมต่อ ไม่เปิด doPost สาธารณะและไม่เก็บ token ในเว็บ
Bridge response อนุญาต framing แต่ไม่มี UI หรือข้อมูลใน HTML และรับคำสั่งจาก origin GitHub ที่กำหนดเท่านั้น หน้าแอป Apps Script ปกติยังใช้ frame protection ตามเดิม
หากเบราว์เซอร์บล็อก Google session ใน iframe ให้ใช้ลิงก์เข้าสู่ระบบในหน้าการตั้งค่า แล้วกลับมากดเชื่อมต่ออีกครั้ง
ไม่มี token, Excel หรือรูปผู้ใช้ใน repository

## โครงสร้างข้อมูล
| ตำแหน่ง | ข้อมูล |
| --- | --- |
| PIM_Products | รายการสินค้าและตำแหน่งแถวต้นฉบับ |
| PIM_Revisions | รายละเอียด ขนาด/น้ำหนัก และรายการ Drive File ID ต่อเวอร์ชัน |
| PIM_Imports | ไฟล์ต้นฉบับและเครื่องหมายว่านำเข้าครบแล้ว |
| IMP_… | ข้อมูลที่แสดงในทุกแท็บ ตามแถว/คอลัมน์เดิม |
| PIM_Source | ค่าดิบ สูตร ชนิดเซลล์ รูปแบบ comments links และ merges เป็น JSON แบ่งชิ้น |
| PIM_Files | ดัชนีไฟล์เพื่ออัปโหลดซ้ำได้อย่างปลอดภัย |
| Drive / PIM Photo Studio - ชื่อชีต / Imports | ไฟล์ต้นฉบับ |
| Drive / PIM Photo Studio - ชื่อชีต / รหัสสินค้า / มุม | ภาพถ่ายต้นฉบับ |

สูตรจาก Excel เก็บเป็นข้อความ ไม่เรียกสูตรใน Google Sheet รูปแบบหน้ากระดาษ/รูปฝังเก็บในไฟล์ต้นฉบับ Drive
คงแท็บเดิมในชีตไว้ และหยุดเมื่อแท็บ PIM_* มีหัวตารางต่างจากสคีมาแอป

## การบันทึกและขีดจำกัด
- LockService ป้องกันการบันทึก revision ชนกัน และตรวจ base revision ก่อนเขียน
- รายการไฟล์และชื่อคงที่ช่วยให้ลองอัปโหลดใหม่โดยไม่สร้างไฟล์ซ้ำ
- Import เขียนเป็นชุดพร้อม completion marker อ่านเฉพาะงานที่นำเข้าครบแล้ว
- การบันทึกเป็นหลายขั้น ไม่ใช่ transaction ทั้งไฟล์ หากเครือข่ายหลุดให้ลองบันทึกซ้ำ
- การลบรูปในฉบับร่างไม่ลบไฟล์ Drive ของประวัติเดิม
- Apps Script มีโควตาและเวลาสูงสุดต่อการเรียก งานใหญ่ควรแยกไฟล์และรอให้เสร็จทีละรายการ
- แหล่งข้อมูลเดิมที่เคยใช้ OAuth และไม่มี PIM_Files ต้องย้ายดัชนีไฟล์ก่อนใช้ตรวจรูปข้ามระบบ

## พัฒนาและเผยแพร่
Node.js 22 ขึ้นไป ไม่ต้อง npm install
- npm start → http://127.0.0.1:4173
- npm test
- node scripts/build-apps-script.mjs เพื่อสร้าง Index.html จากหน้าเว็บล่าสุด
- GitHub Actions ตรวจ syntax และ tests ก่อน deploy Pages
- หลังแก้ Code.gs ให้คัดลอกลง Apps Script แล้ว Deploy → Manage deployments → Edit → New version
- Index.html โหลด assets จาก GitHub Pages ผ่าน HTTPS จึงต้องให้ Pages พร้อมใช้งานก่อนเปิดแอป

## ตรวจรับ
ทดสอบเปิด /exec ด้วยบัญชีที่มีสิทธิ์, เชื่อมชีต, Import ทุกแท็บ, บันทึกรูปแล้วเปิดไฟล์ Drive,
รีเฟรชจากอีกเบราว์เซอร์, ย้ายฉบับร่าง, และลองใหม่หลังเครือข่ายขาด
Tests แบบ mock ไม่แทนการตรวจ Google จริง

## อ้างอิง
- [Apps Script Web apps](https://developers.google.com/apps-script/guides/web)
- [google.script.run](https://developers.google.com/apps-script/guides/html/communication)
- [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)
- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/standalone/) 0.20.3 พร้อมใบอนุญาต vendor/LICENSE

การทดสอบบริการ Google จริง: tests/IntegrationTest.gs ใช้กับตัวแก้ไข Apps Script ชั่วคราว สร้างข้อมูลทดสอบแยก และย้ายไฟล์ทดสอบลงถังขยะหลังเสร็จ

## Data, iOS appearance and PDF

- Data ใช้งานต่อได้โดยตรง: วันที่ ชื่อผู้ขอ แผนก ลำดับ รหัสสินค้า ชื่อสินค้า วัตถุประสงค์ และมุมที่ร้องขอ จะตรงหัวข้อเดิม (รองรับหัวข้อสองภาษา)
- แอปเพิ่มคอลัมน์ข้อมูลสินค้า ขนาด น้ำหนัก สถานะ และรูป 8 มุม × 5 ช่อง เป็นลิงก์ Drive ที่กดได้ รูปและรายละเอียดล่าสุดอัปเดตแถวเดิมตาม PIM Product ID ไม่สร้างแถวซ้ำเมื่อ retry
- บัญชีที่เชื่อมต่อจะเติมรายการเดิมใน Data อัตโนมัติ ข้อมูลต้นฉบับทุกแท็บและประวัติ revision ยังเก็บใน IMP_* / PIM_* สำหรับตรวจสอบย้อนหลัง
- อย่าลบหรือแก้ PIM Product ID ใน Data เพราะเป็นรหัสที่ใช้เชื่อมแถวกับแอป
- ปุ่ม ☀ / ☾ / Auto เลือกสว่าง มืด หรือตามระบบ และจำตัวเลือกในเครื่อง ใช้ system font (SF บน Apple; Segoe UI/Tahoma บน Windows), iOS semantic colours และปุ่มรองรับสัมผัส
- Export PDF บนหน้ารายการเลือกสินค้าที่มีรูปในตัวกรองปัจจุบันได้สูงสุด 10 รายการ หรือปุ่ม PDF ในหน้าสินค้า จัดหน้า A4 แยกรายละเอียดและแกลเลอรี 4 ภาพต่อหน้า ภาพไม่ถูกครอป
- PDF ดาวน์โหลดโดยตรง มี preview ทุกหน้า และลิงก์ Drive ที่คลิกได้สำหรับภาพที่บันทึกแล้ว ภาพฉบับร่างส่งออกได้พร้อมป้ายกำกับ แต่ยังไม่มีลิงก์ Drive
- PDF ฝังภาพหน้าเอกสารที่ความละเอียดประมาณ 150 dpi เพื่อรักษาการจัดวางภาษาไทย ข้อความจึงไม่ใช่ข้อความที่เลือกคัดลอกได้ ลิงก์ Drive ยังคงเป็น PDF annotation ที่คลิกได้
- หากโหลดภาพใดไม่สำเร็จ จะหยุดและแจ้งข้อผิดพลาด แทนการส่งออกเอกสารที่รูปขาด

## Stock และ Revision ตาม Item Code
- อ่าน Stock_VPT_VSP แบบ read-only: Company, Location, Item Code, Inventory Status, On Hand Qty (รวมชื่อหัว SUM ของ On Hand Qty); Categories เป็นคอลัมน์เสริม ไม่จำเป็นต้องมี
- หากพบชีตรวม จะอ่านชีตรวมเท่านั้นเพื่อไม่ให้ข้อมูลซ้ำ หากไม่มีจึงรองรับ Stock_VP / Stock_VSP เดิม
- Match รหัสเต็ม ปรับเฉพาะตัวพิมพ์และช่องว่าง ไม่ตัด suffix หรือศูนย์นำหน้า แสดงแยกทุก Location / สถานะ / บริษัท
- ชื่อผู้ถ่ายจำเป็นก่อนบันทึก Revision อยู่ใน Data และ PDF
- นำเข้างานซ้ำรหัสเดิมจะเลือก Revision ล่าสุดที่มีรูปให้อัตโนมัติ แต่เก็บงานนำเข้าเป็นคนละแถว
- ประวัติการบันทึกเลือกชุดรูปแสดง / Export และบันทึกตัวเลือกของแต่ละงานใน PIM_Selections
- ถ่ายใหม่เป็น Revision ถัดไปเริ่มแกลเลอรีว่าง ประวัติรูป Drive เดิมไม่ถูกลบ ทุกการบันทึกที่แก้ไขเป็น snapshot ใหม่
- Data แยก วันที่ (จากต้นฉบับ), วันที่เวลานำเข้าระบบ, วันที่เวลาบันทึก (เวลา server ของการบันทึก/เลือกชุดรูป) Data เก็บวันที่จริงของ Sheets แสดง dd/MM/yyyy HH:mm:ss ตามเวลาไทย ส่วนวันในไฟล์แสดง dd/MM/yyyy และ PIM_* เก็บ ISO 8601 สำหรับประวัติ
