// Links for an alert's contact (a converted lead's client): open a WhatsApp chat or the dialler.
// The backend only ever sends E.164 numbers ("+919876543210"); anything else yields no links, so
// a malformed number can never open a chat with the wrong person.

const E164 = /^\+[1-9]\d{7,14}$/;

export interface ContactLinks {
  whatsapp: string; // the WhatsApp app itself (whatsapp:// scheme)
  whatsappWeb: string; // wa.me — opens the app via its universal/app link, or the browser without it
  tel: string;
}

export function contactLinks(phone: string | null | undefined): ContactLinks | null {
  const p = String(phone ?? '').trim();
  if (!E164.test(p)) return null;
  const digits = p.slice(1); // WhatsApp wants the international number without the "+"
  return {
    whatsapp: `whatsapp://send?phone=${digits}`,
    whatsappWeb: `https://wa.me/${digits}`,
    tel: `tel:${p}`,
  };
}

// "+919876543210" → "+91 98765 43210" (Indian mobiles, the bulk of the leads); every other
// country is shown as sent — a wrong guess at its grouping would be worse than none.
export function displayPhone(phone: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}
