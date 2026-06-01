<script src="[cdn.jsdelivr.net](https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2)"></script>
<script>
  const SUPABASE_URL = "[vqkytqdixzuxlfqlcanr.supabase.co](https://vqkytqdixzuxlfqlcanr.supabase.co)";
  const SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxa3l0cWRpeHp1eGxmcWxjYW5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjc2NDAsImV4cCI6MjA5NDk0MzY0MH0.4SJUBKDjuQv_nWPM_mx9TmBr6Xh0QpSPw8JOV_5cWKQ
  const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  async function loadBoards() {
    const { data, error } = await supabaseClient
      .from("boards")
      .select("slug, name, description")
      .order("sort_order", { ascending: true });
    if (error) {
      console.error("게시판 목록을 불러오지 못했습니다:", error);
      return;
    }
    console.log("게시판 목록:", data);
  }
  loadBoards();
</script>
