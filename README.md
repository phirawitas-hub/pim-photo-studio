# PIM Photo Studio

เว็บแอปถ่ายรูปสินค้าสำหรับ GitHub Pages รองรับภาษาไทยและมือถือ

## ใช้งาน
1. Import File → เลือก Excel หรือ CSV (ไม่เกิน 25 MB)
2. เลือกแท็บ ตรวจหัวตาราง คอลัมน์รหัสสินค้า ชื่อสินค้า และวัตถุประสงค์
3. เปิดสินค้า แล้วถ่ายรูปจากกล้องหรือเลือก JPG / PNG / WebP
4. 7 มุมบังคับต้องมีอย่างน้อยมุมละ 1 รูป ส่วน All Component เป็นตัวเลือก ทุกมุมสูงสุด 5 รูป
5. บันทึกลง Google → อัปโหลดภาพและสร้าง revision ในชีต

ฉบับร่างเก็บใน IndexedDB ของเบราว์เซอร์นี้ ไม่ใช่ Google และไม่ใช่ระบบสำรองถาวร
เปิดเว็บจาก HTTPS หรือ localhost กล้องจึงใช้งานได้

## รันในเครื่อง
ต้องมี Node.js 22 ขึ้นไป ไม่ต้องติดตั้ง dependencies
รัน npm start แล้วเปิด http://127.0.0.1:4173
รันทดสอบด้วย npm test

## GitHub Pages
1. สร้าง repository ชื่อ pim-photo-studio
2. นำไฟล์โปรเจกต์ขึ้น branch main รวม .github/workflows/pages.yml
3. Settings → Pages → Build and deployment → Source: GitHub Actions
4. Actions → Test and deploy GitHub Pages → Run workflow
5. เปิด URL ที่งาน Deploy ส่งกลับ

Workflow ทดสอบก่อน deploy และส่งเฉพาะไฟล์เว็บเข้า Pages artifact
ไม่เพิ่ม Excel จริง รูปสินค้า tokens หรือ secrets ลง repository
ข้อมูลผู้ใช้ไม่ได้ฝังใน HTML หรือ GitHub

## ตั้งค่า Google ครั้งแรก
แอปเป็น static website ใช้ Google Identity Services token model ไม่มี backend และไม่มี Client Secret

1. เปิด https://console.cloud.google.com/ และสร้าง/เลือก project
2. เปิด Google Sheets API และ Google Drive API
3. ตั้งค่า Google Auth Platform / OAuth consent screen:
   - กำหนดชื่อแอปและ support email ของเจ้าของ
   - Internal หากองค์กรรองรับ หรือ External
   - ถ้าใช้ Testing ให้เพิ่มบัญชีที่ใช้งานเป็น Test users
   - scopes: https://www.googleapis.com/auth/spreadsheets และ https://www.googleapis.com/auth/drive.file
4. สร้าง OAuth Client ประเภท Web application
5. Authorized JavaScript origins:
   - GitHub Pages: https://ชื่อบัญชี.github.io (ไม่มี path ต่อท้าย)
   - ทดสอบในเครื่อง: http://127.0.0.1:4173
6. คัดลอก Client ID ที่ลงท้าย .apps.googleusercontent.com
7. แอป → เชื่อมต่อ Google → ใส่ Client ID และ URL ของชีต → บันทึกการตั้งค่า
8. เชื่อมต่อ Google ด้วยบัญชีที่มีสิทธิ์แก้ไขชีต

ไม่ใส่ Client Secret / access token ใน repository
Access token อยู่ในหน่วยความจำเท่านั้น ต้องเชื่อมใหม่เมื่อหมดอายุ
บัญชีองค์กรอาจต้องให้ผู้ดูแลอนุมัติ OAuth และการใช้หลายบัญชีอาจต้องผ่าน Google verification
แอปไม่เปลี่ยนสิทธิ์แชร์ไฟล์หรือเปิด public sharing อัตโนมัติ

## โครงสร้างข้อมูล
| ตำแหน่ง | ข้อมูล |
| --- | --- |
| PIM_Products | รหัส ชื่อ วัตถุประสงค์ Import ID และแถวต้นฉบับ |
| PIM_Revisions | รายละเอียด ขนาด/น้ำหนัก และ Drive File ID ของภาพทุกมุมในแต่ละเวอร์ชัน |
| PIM_Imports | ประวัติไฟล์และ Drive File ID ต้นฉบับ |
| IMP_… | ค่าที่แสดงในทุกแท็บต้นฉบับ ตามแถว/คอลัมน์เดิม |
| PIM_Source | ชนิดเซลล์ ค่าดิบ สูตร รูปแบบ comments links merged ranges เป็น JSON แบ่งชิ้น |
| Drive / PIM Photo Studio / Imports | ไฟล์ต้นฉบับครบทุกองค์ประกอบ |
| Drive / PIM Photo Studio / รหัสสินค้า / มุม | รูปต้นฉบับ JPG/PNG/WebP |

สูตรจากไฟล์เก็บเป็นข้อมูล ไม่รันสูตรจากไฟล์ใน Google Sheet
รูปแบบหน้ากระดาษ รูปฝัง และองค์ประกอบ Excel เก็บครบในไฟล์ต้นฉบับใน Drive
เก็บทุกแท็บ แต่สร้างงานถ่ายจากแท็บที่ผู้ใช้เลือกเท่านั้น
รหัสซ้ำในแท็บเดียวกันรวมคิวเป็น 1 รายการ โดยยังเก็บทุกแถวต้นฉบับ
ตรวจไฟล์ซ้ำในเบราว์เซอร์เดียวกันด้วย SHA-256

## การบันทึกและการทำงานร่วมกัน
- ใช้ Drive generated IDs ลดไฟล์ซ้ำเมื่อลองอัปโหลดใหม่
- เก็บประวัติสินค้าเป็น append-only revisions
- เช็กเวอร์ชันก่อนและหลังอัปโหลด หากเปลี่ยนจะหยุดให้ตรวจประวัติ
- Google Sheets ไม่มี transaction/row lock ในแอปนี้ จึงควรทำงานคนละสินค้า ไม่แก้งานเดียวกันพร้อมกัน
- อ่านข้อมูลจากชีตเมื่อกด Refresh ไม่เป็น realtime
- หลายชีตควรใช้คนละ browser profile เพื่อไม่ปนฉบับร่าง
- การล้างข้อมูลเว็บไซต์ลบฉบับร่างในเครื่อง ควรบันทึก Google ก่อน
- นำรูปออกจากฉบับร่างไม่ลบไฟล์ Drive ของเวอร์ชันเดิม

## ตรวจรับก่อนใช้จริง
จาก GitHub Pages ด้วย OAuth client ของคุณ ให้ทดสอบลงชื่อเข้าใช้และยกเลิก consent, Import ทุกแท็บ,
บันทึกรูปครบทุกมุมและเปิดจาก Drive, Refresh จากอีกเครื่องที่มีสิทธิ์, ปฏิเสธกล้องแล้วเลือกไฟล์แทน,
และเครือข่ายขาดระหว่างอัปโหลดแล้วลองใหม่
การทดสอบอัตโนมัติและ local UI ไม่ทดแทนการทดสอบ Google API จริง

## แหล่งอ้างอิง
- [Google Identity Services](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [Drive uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
- [Sheets append](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append)
- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/standalone/)

SheetJS 0.20.3 จาก CDN ทางการ พร้อมใบอนุญาตใน vendor/LICENSE
