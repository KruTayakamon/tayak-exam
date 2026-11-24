// ค่าสาธารณะของเว็บ (ไม่ใช่ความลับ) · บอสหรือผู้ดูแลเติมเมื่อมีโปรเจกต์จริง · anon key ของ Supabase เป็นค่าที่เปิดเผยได้ตามการออกแบบของ Supabase
export const SITE = {
  brand: 'CEFR for You',
  // คอร์สที่กำลังเรียน (มติบอส 18 พ.ย. รอบ 26: เปิด B1 B2 C1 · C2 เปิด 23 พ.ย. · A2 เปิด 24 พ.ย. (ครบ 5 คอร์ส)) · จำในเครื่อง cfk_course · ลิงก์ ?course=c1 ตั้งให้
  get course() { let c = null; try { c = localStorage.getItem('cfk_course'); } catch { /* ไม่มีที่เก็บ */ } return OPEN_COURSES.includes(c) ? c : 'b1'; },
  consentVersion: 1,      // เพิ่มเลขเมื่อนโยบายความเป็นส่วนตัวเปลี่ยน ผู้ใช้จะถูกขอให้ยอมรับใหม่
  supabaseUrl: 'https://sleozjpeectuawvmxgyn.supabase.co',
  functions: 'https://sleozjpeectuawvmxgyn.supabase.co/functions/v1',   // โปรเจกต์ tayak-kitchen (ใช้ร่วมกับเกมครัว)
  anonKey: 'sb_publishable_cqL9wPky_Gyl_6RzJghiMw_WCtQ3O02',            // publishable key: เปิดเผยได้ตามการออกแบบของ Supabase (ไม่ใช่ความลับ)
};

export const OPEN_COURSES = ['a2', 'b1', 'b2', 'c1', 'c2'];                 // คอร์สที่มีเนื้อหาและเปิดให้เลือก (ต้องตรงกับ exam_settings.on_sale)
export const COURSE_TH = { a2: 'คอร์สปูพื้นสู่ A2', b1: 'คอร์สเป้าหมาย B1', b2: 'คอร์สเป้าหมาย B2', c1: 'คอร์สเป้าหมาย C1', c2: 'คอร์สเป้าหมาย C2' };
export const COURSE_FOR = { a2: 'เพิ่งเริ่มหรือพื้นยังไม่แน่น อยากแนะนำตัว เล่ากิจวัตร และซื้อของได้คล่อง', b1: 'พื้นฐานพอใช้ อยากสื่อสารเรื่องงานและชีวิตประจำวันได้คล่อง', b2: 'สื่อสารได้แล้ว อยากเล่า โต้แย้ง และเขียนรายงานได้เป็นระบบ', c1: 'ใช้ภาษาได้ดีแล้ว อยากพูดและเขียนแบบทางการ แม่นยำ มีชั้นเชิง', c2: 'คล่องมากแล้ว อยากเก็บรายละเอียดระดับสูง สำนวน น้ำเสียง และการสังเคราะห์ความ' };
export function setCourse(c) { if (!OPEN_COURSES.includes(c)) return; try { localStorage.setItem('cfk_course', c); localStorage.removeItem('cfk-session'); } catch { /* ไม่มีที่เก็บ */ } }
