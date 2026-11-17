# เปิดเว็บ CEFR for You ด้วย Cloudflare (บอสทำเอง ประมาณ 10 นาที)

เว็บคือไฟล์ในโฟลเดอร์ `dist/` ของ repo `KruTayakamon/tayak-exam` branch `main` · ไม่ต้องใส่คีย์ลับใด ๆ ใน Cloudflare

## วิธีที่ 1 · หน้าจอแบบ Pages (ได้ลิงก์ `cefrforyou.pages.dev`)
1. เข้า https://dash.cloudflare.com แล้วล็อกอินบัญชีเดียวกับเกมครัว
2. เมนูซ้ายกด **Compute (Workers)** แล้วกด **Workers & Pages** (บางบัญชีเห็นเมนู **Workers & Pages** ตรง ๆ)
3. กดปุ่มสีน้ำเงิน **Create** (มุมขวาบน)
4. ถ้ามีแท็บ **Pages** ให้กดแท็บนั้น แล้วกด **Connect to Git** (หรือ **Import an existing Git repository**)
   - ถ้าไม่มีแท็บ Pages ให้เลื่อนลงล่างสุดหา **Looking to deploy Pages? Get started** แล้วกด
5. เลือกบัญชี GitHub · ถ้าไม่เห็น `tayak-exam` ให้กด **Configure GitHub App** แล้วเพิ่ม repo `KruTayakamon/tayak-exam` ให้ Cloudflare เห็น
6. เลือก `tayak-exam` → **Begin setup** แล้วตั้งค่า
   - Project name: `cefrforyou`
   - Production branch: `main`
   - Framework preset: **None**
   - Build command: *(เว้นว่าง)*
   - Build output directory: `dist`
7. กด **Save and Deploy** รอประมาณ 1 นาที → ได้ https://cefrforyou.pages.dev

## วิธีที่ 2 · หน้าจอแบบ Workers (ถ้าเห็นช่อง Deploy command: `npx wrangler deploy`)
ใช้ได้เหมือนกัน เพราะใน repo มีไฟล์ `wrangler.jsonc` ชี้ไปที่ `dist/` แล้ว
- Project name `cefrforyou` · Build command *เว้นว่าง* · Deploy command `npx wrangler deploy` (ค่าเดิม) → **Deploy**
- ลิงก์ที่ได้เป็น `https://cefrforyou.<ชื่อบัญชี>.workers.dev` · **ส่งลิงก์ให้ Claude** เพื่อแก้ลิงก์ในโพสต์และที่อยู่ที่ระบบหลังบ้านอนุญาต (CORS)

## หลังเปิดแล้ว
ส่งลิงก์ที่ได้ให้ Claude · Claude จะเปิดเว็บจริงทดสอบหน้าวัดระดับและหน้าโพสต์บนมือถือ แล้วสรุปผล
ทุกครั้งที่ Claude อัปเดต `main` เว็บจะอัปเดตเอง
