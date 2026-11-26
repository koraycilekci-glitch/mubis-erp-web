-- Otomatik OKC hasilat sorgulama: kdv_dokumleri ve dvs_sorgu_loglari tur kisitina 'okc' eklenir.
ALTER TABLE kdv_dokumleri DROP CONSTRAINT IF EXISTS kdv_dokumleri_tur_check;
ALTER TABLE kdv_dokumleri ADD CONSTRAINT kdv_dokumleri_tur_check CHECK (tur IN ('109','110','okc'));

ALTER TABLE dvs_sorgu_loglari DROP CONSTRAINT IF EXISTS dvs_sorgu_loglari_tur_check;
ALTER TABLE dvs_sorgu_loglari ADD CONSTRAINT dvs_sorgu_loglari_tur_check CHECK (tur IN ('pos','109','110','okc'));
