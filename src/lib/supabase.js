import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://gxuqrxmpgoeyykoolmwv.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4dXFyeG1wZ29leXlrb29sbXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NjI2NjgsImV4cCI6MjA5OTUzODY2OH0.vCbRod67rNLMsimXpU8A1wYXRLz4WPrkmF0CtkGU7Tg'

export const supabase = createClient(supabaseUrl, supabaseKey)