const SUPABASE_URL = 'https://ijqqluybdltnjkuggyrq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqcXFsdXliZGx0bmprdWdneXJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMjE3NDIsImV4cCI6MjEwODc5Nzc0Mn0.9OYd0jyjb1-weJtnlmpBpe36JelDZ39jPIxwXK0ITsY';

// สร้าง Client กลางไว้ให้ทุกไฟล์เรียกใช้
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);