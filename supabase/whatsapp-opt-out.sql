-- WhatsApp otomatik bildirim opt-out (kullanicinin secimi: 2026-11-15)
-- Musteri "WhatsApp istemiyorum" isaretlerse otomatik gonderimler
-- (odeme hatirlatma, beyan hatirlatma, tebligat bildirimi) WhatsApp'a gitmez.
-- Manuel (muhasebecinin elle sectigi) gonderimler etkilenmez.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS whatsapp_opt_out BOOLEAN NOT NULL DEFAULT FALSE;

NOTIFY pgrst, 'reload schema';
