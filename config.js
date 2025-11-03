// config.js

// يمكنك تعديل هذه القيم حسب البيئة
const SERVERS = {
    local: "http://localhost:3000",                // السيرفر المحلي أثناء التطوير
    production: "https://itemfinder-backend.onrender.com",  // السيرفر الحقيقي
  }
  
  // اختر الوضع الذي تريده
  const ACTIVE_SERVER = "production"; //  production    local    ← غيّرها إلى" أثناء التطوير
  
  export const API_URL = SERVERS[ACTIVE_SERVER];
  