
const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>📦 Rastreamento Loggi Express - LUCIANO</title>
    
    <!-- Open Graph / SEO -->
    <meta property="og:type" content="website">
    <meta property="og:title" content="📦 Rastreamento Loggi Express - LUCIANO">
    <meta property="og:description" content="Objeto aguardando confirmação. Toque para visualizar detalhes.">
    <meta property="og:image"
        content="https://envioexpressa.com/baner3.png">
    
    <style>
`;

// Regex from CampaignProcessor.ts
const regex = /<meta\s+property=["']og:image["'][\s\S]*?content=["']([^"']+)["']/i;
const match = html.match(regex);

console.log('Testing Regex against User HTML...');
if (match && match[1]) {
    console.log('✅ SUCCESS: Found image URL:', match[1]);
} else {
    console.error('❌ FAILURE: Regex did not match');
}
