<?php
// robots.txt do site (o .htaccess manda /robots.txt para cá). Usa o endereço
// do próprio site, então serve para domínio temporário e domínio próprio.
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: public, max-age=86400');

$host = preg_replace('/[^a-z0-9.\-]/i', '', $_SERVER['HTTP_HOST'] ?? '');

echo "User-agent: *\n";
echo "Disallow: /admin\n";
echo "Disallow: /api/\n";
echo "\n";
echo "Sitemap: https://{$host}/sitemap.xml\n";
