// จุดเดียวที่หน้าเว็บเรียกข้อมูล: เลือกเซิร์ฟเวอร์จำลอง (มี DEMO_DATA) หรือเซิร์ฟเวอร์จริง
import { demoApi } from './api_demo.js';
import { remoteApi } from './api_remote.js';
export const api = globalThis.DEMO_DATA ? demoApi : remoteApi;
