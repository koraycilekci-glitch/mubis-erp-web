DO $$
BEGIN
  RAISE EXCEPTION 'Bu eski dosya kullanım dışıdır. supabase/migrations/20261107120000_restrict_payment_access.sql geçişini test ederek uygulayın.';
END;
$$;
