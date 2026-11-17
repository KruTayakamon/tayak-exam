-- ดาวและตราสะสมของผู้เรียน (มติบอส 17 พ.ย. 2569 รอบ 18 "ทำตามที่แนะนำ") · ให้ตามไปทุกเครื่อง
-- รูปแบบ: {"stars":N,"perfect":N,"best":N,"sessions":N,"wrote":N,"badges":{"perfect":N,...}} · เซิร์ฟเวอร์รวมด้วยค่ามากสุดต่อช่อง (ค่าไม่ลดลง)
-- เป็นของตกแต่งเพื่อกำลังใจ ไม่ใช้ตัดสินสิทธิ์หรือคะแนนใด ๆ
alter table public.exam_enrolments add column if not exists stars jsonb;
