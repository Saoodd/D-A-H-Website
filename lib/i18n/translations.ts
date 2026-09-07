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

    "footer.tagline": "Giving Dubai's young entrepreneurs room to grow.",
    "footer.legal": "Legal",
    "footer.terms": "Terms & Conditions",
    "footer.privacy": "Privacy Policy",
    "footer.refunds": "Refund & Cancellation Policy",
    "footer.rights": "All rights reserved.",

    "home.heroKicker": "Dar Al Hay Events",
    "home.heroTitle": "A stage for Dubai's next generation of entrepreneurs.",
    "home.heroSubtitle":
      "DAH curates community markets that give young and emerging businesses a real audience, real sales, and room to grow — one market at a time.",
    "home.ctaMarkets": "See upcoming events",
    "home.ctaVendors": "Become a vendor",
    "home.missionTitle": "Our story",
    "home.missionBody":
      "Dar Al Hay (DAH) exists to give Dubai's young and emerging entrepreneurs a place to grow — a warm, curated stage where a first small business can meet its first hundred customers, and a growing one can meet a thousand more. Every DAH market is considered, not crowded: a small, thoughtfully chosen mix of vendors in a warm setting, not a sprawling trade show.",
    "home.whatTitle": "What we do",
    "home.whatItem1": "Monthly markets that put young businesses in front of real Dubai audiences",
    "home.whatItem2": "A curated, F&B-heavy mix alongside craft & lifestyle makers just starting out",
    "home.whatItem3": "A managed application & booking process, so vendors can focus on their craft, not logistics",
    "home.whatItem4": "A connected community of entrepreneurs — on the ground and on WhatsApp",

    "markets.title": "Upcoming Markets",
    "markets.subtitle": "Our next community pop-ups — new dates added roughly monthly.",
    "markets.from": "Booths from",
    "markets.empty": "No upcoming markets published yet — check back soon.",
    "markets.viewDetails": "View details",
    "markets.apply": "Apply as a vendor",

    "vendorInfo.title": "Vendor Info & Application",
    "vendorInfo.subtitle": "Requirements, expectations, and how to bring your business to a DAH market.",
    "vendorInfo.applyTitle": "Create your account",
    "vendorInfo.submit": "Create account",
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
    "vendor.registerNote": "New here? Create your DAH business account to get started.",
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

    "footer.tagline": "نمنح رواد الأعمال الشباب في دبي مساحة للنمو.",
    "footer.legal": "قانوني",
    "footer.terms": "الشروط والأحكام",
    "footer.privacy": "سياسة الخصوصية",
    "footer.refunds": "سياسة الاسترداد والإلغاء",
    "footer.rights": "جميع الحقوق محفوظة.",

    "home.heroKicker": "دار الحي للفعاليات",
    "home.heroTitle": "منصة للجيل القادم من رواد الأعمال في دبي.",
    "home.heroSubtitle":
      "دار الحي تنسّق أسواقاً مجتمعية تمنح المشاريع الشابة والناشئة جمهوراً حقيقياً، ومبيعات حقيقية، ومساحة للنمو — سوقاً بعد سوق.",
    "home.ctaMarkets": "شاهد الفعاليات القادمة",
    "home.ctaVendors": "كن بائعاً معنا",
    "home.missionTitle": "قصتنا",
    "home.missionBody":
      "دار الحي وُجدت لتمنح رواد الأعمال الشباب والناشئين في دبي مساحة للنمو — منصة دافئة ومنسّقة حيث يمكن لمشروع صغير أن يلتقي بأول مئة عميل له، ولمشروع نامٍ أن يصل إلى ألف عميل آخرين. كل سوق من أسواق دار الحي مدروس، لا مزدحم: مزيج صغير ومختار بعناية من البائعين في أجواء دافئة، لا معرضاً تجارياً واسعاً.",
    "home.whatTitle": "ماذا نقدم",
    "home.whatItem1": "أسواق شهرية تضع المشاريع الشابة أمام جمهور دبي الحقيقي",
    "home.whatItem2": "مزيج منسّق يغلب عليه الطعام والمشروبات إلى جانب صنّاع الحرف ونمط الحياة في بداياتهم",
    "home.whatItem3": "عملية تقديم وحجز مُدارة، ليتفرغ البائعون لحرفتهم لا للوجستيات",
    "home.whatItem4": "مجتمع مترابط من رواد الأعمال — على أرض الواقع وعبر واتساب",

    "markets.title": "الأسواق القادمة",
    "markets.subtitle": "فعالياتنا المجتمعية القادمة — مواعيد جديدة تُضاف شهرياً تقريباً.",
    "markets.from": "الأكشاك تبدأ من",
    "markets.empty": "لا توجد أسواق قادمة منشورة بعد — تفقدوا الصفحة قريباً.",
    "markets.viewDetails": "عرض التفاصيل",
    "markets.apply": "التقديم كبائع",

    "vendorInfo.title": "معلومات البائعين والتقديم",
    "vendorInfo.subtitle": "المتطلبات والتوقعات وكيفية إحضار مشروعك إلى سوق دار الحي.",
    "vendorInfo.applyTitle": "أنشئ حسابك",
    "vendorInfo.submit": "إنشاء الحساب",
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
    "vendor.registerNote": "جديد هنا؟ أنشئ حساب عملك في دار الحي للبدء.",
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
