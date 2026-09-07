// Single source of truth for all site copy. Every string a user sees on the
// public/vendor-facing site should be pulled from here, keyed the same way
// in every locale, so the EN/AR toggle + RTL layout keep working even before
// every string has a reviewed Arabic translation (untranslated keys fall
// back to English — see lib/i18n/context.tsx `t()`).

export type Locale = "en" | "ar";

export const locales: Locale[] = ["en", "ar"];

export const translations: Record<Locale, Record<string, string>> = {
  en: {
    "nav.home": "Home",
    "nav.markets": "Upcoming Markets",
    "nav.vendors": "Vendors",
    "nav.gallery": "Gallery",
    "nav.contact": "Contact",
    "nav.vendorLogin": "Vendor Login",
    "nav.vendorDashboard": "My Dashboard",
    "nav.admin": "Admin",

    "footer.tagline": "Community pop-up markets in Dubai.",
    "footer.legal": "Legal",
    "footer.terms": "Terms & Conditions",
    "footer.privacy": "Privacy Policy",
    "footer.refunds": "Refund & Cancellation Policy",
    "footer.rights": "All rights reserved.",

    "home.heroKicker": "Dar Al Hay Events",
    "home.heroTitle": "Community markets, curated with care.",
    "home.heroSubtitle":
      "DAH brings together Dubai's best food, drink and craft vendors for warm, boutique pop-up markets.",
    "home.ctaMarkets": "See upcoming markets",
    "home.ctaVendors": "Become a vendor",
    "home.missionTitle": "Our story",
    "home.whatTitle": "What we do",

    "markets.title": "Upcoming Markets",
    "markets.subtitle": "Our next community pop-ups — new dates added roughly monthly.",
    "markets.from": "Booths from",
    "markets.empty": "No upcoming markets published yet — check back soon.",
    "markets.viewDetails": "View details",
    "markets.apply": "Apply as a vendor",

    "vendorInfo.title": "Vendor Info & Application",
    "vendorInfo.subtitle": "Booth fees, requirements and how to apply.",
    "vendorInfo.applyTitle": "Apply now",
    "vendorInfo.submit": "Submit application",
    "vendorInfo.success": "Application received",
    "vendorInfo.successBody": "Thanks — we've received your application and will be in touch.",

    "gallery.title": "Gallery",
    "gallery.subtitle": "Moments from past DAH markets.",

    "contact.title": "Contact & Socials",
    "contact.subtitle": "Say hello, or join the community.",
    "contact.communityGroup": "Main DAH Community Group",
    "contact.send": "Send message",

    "form.businessName": "Business name",
    "form.contactName": "Contact name",
    "form.email": "Email",
    "form.phone": "Phone",
    "form.category": "Vendor category",
    "form.instagram": "Instagram / social handle",
    "form.message": "Message",
    "form.password": "Password",
    "form.confirmPassword": "Confirm password",
    "form.event": "Event",
    "form.name": "Name",

    "vendor.loginTitle": "Vendor Login",
    "vendor.registerNote": "New here? Applying for an event creates your vendor account automatically.",
    "vendor.dashboardTitle": "My Dashboard",
    "vendor.communityLink": "Main DAH Community Group",
    "vendor.status.PENDING": "Pending review",
    "vendor.status.REJECTED": "Not accepted",
    "vendor.status.ACCEPTED_UNPAID": "Accepted — payment due",
    "vendor.status.PAID": "Confirmed & paid",
    "vendor.status.EXPIRED": "Acceptance expired",
    "vendor.selectBooth": "Select your booth",
    "vendor.deadlineLabel": "Complete payment within",
    "vendor.cancelBooth": "Cancel my booth",

    "floorplan.legend": "Legend",
    "floorplan.available": "Available",
    "floorplan.held": "Held",
    "floorplan.reserved": "Reserved",
    "floorplan.sold": "Sold",

    "checkout.title": "Checkout",
    "checkout.payWithApplePay": "Pay with Apple Pay",
    "checkout.payWithCard": "Pay with card (sandbox)",
    "checkout.sandboxNotice": "Sandbox mode — no real payment is taken.",

    "admin.login": "Admin Login",
    "lang.toggle": "العربية",
  },
  ar: {
    "nav.home": "الرئيسية",
    "nav.markets": "الأسواق القادمة",
    "nav.vendors": "البائعون",
    "nav.gallery": "معرض الصور",
    "nav.contact": "تواصل معنا",
    "nav.vendorLogin": "دخول البائعين",
    "nav.vendorDashboard": "لوحتي",
    "nav.admin": "الإدارة",

    "footer.tagline": "أسواق مجتمعية منبثقة في دبي.",
    "footer.legal": "قانوني",
    "footer.terms": "الشروط والأحكام",
    "footer.privacy": "سياسة الخصوصية",
    "footer.refunds": "سياسة الاسترداد والإلغاء",
    "footer.rights": "جميع الحقوق محفوظة.",

    "home.heroKicker": "دار الحي للفعاليات",
    "home.heroTitle": "أسواق مجتمعية، منسّقة بعناية.",
    "home.heroSubtitle":
      "دار الحي تجمع أفضل بائعي الطعام والمشروبات والحرف اليدوية في دبي في أسواق منبثقة أنيقة ودافئة.",
    "home.ctaMarkets": "شاهد الأسواق القادمة",
    "home.ctaVendors": "كن بائعاً معنا",
    "home.missionTitle": "قصتنا",
    "home.whatTitle": "ماذا نقدم",

    "markets.title": "الأسواق القادمة",
    "markets.subtitle": "فعالياتنا المجتمعية القادمة — مواعيد جديدة تُضاف شهرياً تقريباً.",
    "markets.from": "الأكشاك تبدأ من",
    "markets.empty": "لا توجد أسواق قادمة منشورة بعد — تفقدوا الصفحة قريباً.",
    "markets.viewDetails": "عرض التفاصيل",
    "markets.apply": "التقديم كبائع",

    "vendorInfo.title": "معلومات البائعين والتقديم",
    "vendorInfo.subtitle": "رسوم الأكشاك والمتطلبات وكيفية التقديم.",
    "vendorInfo.applyTitle": "قدّم الآن",
    "vendorInfo.submit": "إرسال الطلب",
    "vendorInfo.success": "تم استلام الطلب",
    "vendorInfo.successBody": "شكراً لكم — لقد استلمنا طلبكم وسنتواصل معكم قريباً.",

    "gallery.title": "معرض الصور",
    "gallery.subtitle": "لحظات من أسواق دار الحي السابقة.",

    "contact.title": "تواصل معنا",
    "contact.subtitle": "تواصلوا معنا أو انضموا لمجتمعنا.",
    "contact.communityGroup": "مجموعة دار الحي المجتمعية",
    "contact.send": "إرسال الرسالة",

    "form.businessName": "اسم النشاط التجاري",
    "form.contactName": "اسم المسؤول",
    "form.email": "البريد الإلكتروني",
    "form.phone": "رقم الهاتف",
    "form.category": "فئة البائع",
    "form.instagram": "حساب انستغرام / التواصل الاجتماعي",
    "form.message": "الرسالة",
    "form.password": "كلمة المرور",
    "form.confirmPassword": "تأكيد كلمة المرور",
    "form.event": "الفعالية",
    "form.name": "الاسم",

    "vendor.loginTitle": "دخول البائعين",
    "vendor.registerNote": "جديد هنا؟ التقديم لفعالية ينشئ حسابك تلقائياً.",
    "vendor.dashboardTitle": "لوحتي",
    "vendor.communityLink": "مجموعة دار الحي المجتمعية",
    "vendor.status.PENDING": "قيد المراجعة",
    "vendor.status.REJECTED": "لم يتم القبول",
    "vendor.status.ACCEPTED_UNPAID": "مقبول — الدفع مطلوب",
    "vendor.status.PAID": "مؤكد ومدفوع",
    "vendor.status.EXPIRED": "انتهت مهلة القبول",
    "vendor.selectBooth": "اختر كشكك",
    "vendor.deadlineLabel": "أكمل الدفع خلال",
    "vendor.cancelBooth": "إلغاء الكشك",

    "floorplan.legend": "المفتاح",
    "floorplan.available": "متاح",
    "floorplan.held": "محجوز مؤقتاً",
    "floorplan.reserved": "محجوز",
    "floorplan.sold": "مُباع",

    "checkout.title": "الدفع",
    "checkout.payWithApplePay": "الدفع عبر Apple Pay",
    "checkout.payWithCard": "الدفع بالبطاقة (تجريبي)",
    "checkout.sandboxNotice": "وضع تجريبي — لن يتم خصم أي مبلغ حقيقي.",

    "admin.login": "دخول الإدارة",
    "lang.toggle": "English",
  },
};
