import { contactLinks, displayPhone } from '../logic/contactLinks';

describe('alert contact links (a converted lead\'s client → WhatsApp / Call)', () => {
  it('builds WhatsApp (app + wa.me) and tel links from an E.164 number', () => {
    expect(contactLinks('+919876543210')).toEqual({
      whatsapp: 'whatsapp://send?phone=919876543210',
      whatsappWeb: 'https://wa.me/919876543210',
      tel: 'tel:+919876543210',
    });
    expect(contactLinks(' +254700000000 ')?.whatsappWeb).toBe('https://wa.me/254700000000');
  });

  it('gives no links for anything that is not E.164 — never a chat with the wrong person', () => {
    for (const bad of ['9876543210', '+0123456789', '+91 98765 43210', 'whatsapp://x', '', null, undefined]) {
      expect(contactLinks(bad)).toBeNull();
    }
  });

  it('groups Indian mobiles for display and leaves other countries as sent', () => {
    expect(displayPhone('+919876543210')).toBe('+91 98765 43210');
    expect(displayPhone('+254700000000')).toBe('+254700000000');
  });
});
