-- ============================================================
-- MUBIS ERP - etebligatlar tablosuna kaynak kolonu (vergi / sgk)
-- Mevcut kurulumlara eklenir. Supabase Dashboard > SQL Editor'de calistirin.
-- ============================================================

ALTER TABLE etebligatlar ADD COLUMN IF NOT EXISTS kaynak TEXT DEFAULT 'vergi';

-- Eski kayitlarin tamami Dijital Vergi Dairesi'nden geldigi icin
-- varsayilan 'vergi' dogrudur.

SELECT 'etebligatlar.kaynak' AS kolon, COUNT(*) AS satir FROM etebligatlar;
