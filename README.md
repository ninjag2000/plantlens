<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1jP-F2jFNTfMiSZKU5e72lrJdOz11JWDC

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Supabase (optional)

Plants data can be stored in Supabase instead of (or in addition to) local storage.

1. Create a project at [supabase.com](https://supabase.com) and get **Project URL** and **anon public** key from Settings → API.
2. In [.env.local](.env.local) add:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   ```
3. In Supabase Dashboard → SQL Editor, run the migrations in order:
   - [supabase/migrations/20260206000000_create_plants.sql](supabase/migrations/20260206000000_create_plants.sql) (plants)
   - [supabase/migrations/20260206100000_trends_and_discover_cache.sql](supabase/migrations/20260206100000_trends_and_discover_cache.sql) (trends + discover cache)
4. Restart the app. When Supabase is configured, plants sync to `plants`, trending lists to `trends` (per language), and Discover plant cache to `discover_cache`; local storage is used as fallback and for images.
