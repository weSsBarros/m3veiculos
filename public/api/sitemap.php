<?php
// sitemap.xml do site (o .htaccess manda /sitemap.xml para cá): páginas do
// site (lista gerada no build a partir das rotas do App.jsx) e a página de cada
// carro à venda, com a primeira foto. Ajuda o Google a achar os carros.
require __DIR__ . '/estoque-publico.php';
$config = require __DIR__ . '/fotos-config.php';

header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: public, max-age=3600');

$base = site_base_url();
$pages = $config['site_pages'] ?? ['/', '/estoque', '/sobre', '/contato'];
$cars = public_cars($config, 'slug,updated_at,images', ['disponivel', 'manutencao']) ?? [];

$esc = fn($s) => htmlspecialchars($s, ENT_XML1 | ENT_QUOTES, 'UTF-8');

echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' . "\n";
foreach ($pages as $page) {
    echo '  <url><loc>' . $esc($base . $page) . '</loc></url>' . "\n";
}
foreach ($cars as $car) {
    if (empty($car['slug'])) continue;
    echo '  <url>';
    echo '<loc>' . $esc($base . '/carro/' . rawurlencode($car['slug'])) . '</loc>';
    if (!empty($car['updated_at'])) echo '<lastmod>' . $esc(substr($car['updated_at'], 0, 10)) . '</lastmod>';
    $photo = absolute_url($base, $car['images'][0] ?? '');
    if ($photo !== '') echo '<image:image><image:loc>' . $esc($photo) . '</image:loc></image:image>';
    echo "</url>\n";
}
echo "</urlset>\n";
