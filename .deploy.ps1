$env:CLOUDFLARE_API_TOKEN=(Get-Content -Raw '.cf-token').Trim()
$env:CLOUDFLARE_ACCOUNT_ID='f885d2d48c6825ca14a4dcbec74b07e8'
npx -y wrangler@latest pages deploy dist --project-name mubis-erp-web --branch main --commit-dirty=true
