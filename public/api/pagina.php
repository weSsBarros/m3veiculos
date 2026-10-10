<?php
// Páginas públicas do site para o Google e para a prévia do WhatsApp/Facebook.
// O .htaccess manda as páginas do site para cá: sai o index.html do build com o
// título, a descrição, o endereço canônico, as tags de prévia e os dados
// estruturados (schema.org) de cada página; na página do carro, com os dados do
// carro no banco. O React monta o site por cima, como sempre. Qualquer falha
// devolve o index.html como está. Textos das páginas: src/utils/seoPages.js
// (gravados no fotos-config.php pelo build).

$html = @file_get_contents(dirname(__DIR__) . '/index.html');
if ($html === false) {
    http_response_code(500);
    exit;
}
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');

try {
    $config = require __DIR__ . '/fotos-config.php';
    require_once __DIR__ . '/estoque-publico.php';
    $path = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
    $page = seo_for_path('/' . trim($path, '/'), $config);
    if (!empty($page['status'])) http_response_code($page['status']);
    echo seo_inject($html, $page);
} catch (Throwable $e) {
    echo $html;
}

// Endereço canônico: sempre https e sem "www."
function seo_base()
{
    $host = preg_replace('/[^a-z0-9.\-]/i', '', $_SERVER['HTTP_HOST'] ?? '');
    return 'https://' . preg_replace('/^www\./i', '', strtolower($host));
}

// Foto para a prévia: a cópia em JPG (a mesma da OLX), que qualquer app abre
function seo_photo($base, $url)
{
    if (preg_match('#^/uploads/carros/([^/]+)\.webp$#', (string) $url, $m)) $url = '/uploads/carros/jpg/' . $m[1] . '.jpg';
    return absolute_url($base, $url);
}

function seo_money($value)
{
    return 'R$ ' . number_format((float) $value, 0, ',', '.');
}

function seo_car_title($car)
{
    $year = trim((string) (($car['model_year'] ?? '') ?: ($car['year'] ?? '')));
    return trim(implode(' ', array_filter([$car['brand'] ?? '', $car['model'] ?? '', $car['version'] ?? '', $year])));
}

// A loja como empresa local (página inicial e Contato)
function seo_dealer($seo, $base)
{
    $dealer = ['@context' => 'https://schema.org', '@type' => 'AutoDealer', 'name' => $seo['name'] ?? '', 'url' => $base . '/'];
    if (!empty($seo['image'])) $dealer['image'] = $base . $seo['image'];
    if (!empty($seo['phone'])) $dealer['telephone'] = $seo['phone'];
    if (!empty($seo['email'])) $dealer['email'] = $seo['email'];
    if (!empty($seo['address'])) {
        $address = ['@type' => 'PostalAddress', 'streetAddress' => $seo['address'][0], 'addressCountry' => 'BR'];
        if (!empty($seo['city'])) $address['addressLocality'] = $seo['city'];
        if (!empty($seo['region'])) $address['addressRegion'] = $seo['region'];
        if (preg_match('/\b(\d{5})-?(\d{3})\b/', implode(' ', $seo['address']), $m)) $address['postalCode'] = $m[1] . '-' . $m[2];
        $dealer['address'] = $address;
    }
    if (!empty($seo['city'])) $dealer['areaServed'] = ['@type' => 'City', 'name' => $seo['city']];
    if (!empty($seo['instagram'])) $dealer['sameAs'] = array_values($seo['instagram']);
    return $dealer;
}

function seo_breadcrumb($base, $items)
{
    $list = [];
    foreach ($items as $i => [$name, $url]) {
        $list[] = ['@type' => 'ListItem', 'position' => $i + 1, 'name' => $name, 'item' => $base . $url];
    }
    return ['@context' => 'https://schema.org', '@type' => 'BreadcrumbList', 'itemListElement' => $list];
}

// Título, descrição, prévia e dados estruturados de cada endereço
function seo_for_path($path, $config)
{
    $seo = $config['seo'] ?? [];
    $base = seo_base();
    $name = $seo['name'] ?? '';
    $city = $seo['city'] ?? '';
    $page = [
        'title' => $seo['title'] ?? '',
        'description' => $seo['description'] ?? '',
        'canonical' => $base . ($path === '/' ? '/' : $path),
        'image' => !empty($seo['image']) ? $base . $seo['image'] : '',
        'type' => 'website',
        'site' => $name,
        'robots' => '',
        'ld' => [],
    ];

    if ($path === '/') {
        $page['ld'][] = seo_dealer($seo, $base);
        return $page;
    }

    if (isset($seo['pages'][$path])) {
        $page = array_merge($page, $seo['pages'][$path]);
        if ($path === '/contato') $page['ld'][] = seo_dealer($seo, $base);
        if ($path === '/estoque') {
            // Quantos carros e quais marcas, do estoque de agora
            $cars = public_cars($config, 'slug,brand,model,version,year,model_year', ['disponivel', 'manutencao'], 4) ?? [];
            if ($cars) {
                $brands = array_count_values(array_filter(array_map(fn($c) => trim((string) ($c['brand'] ?? '')), $cars)));
                arsort($brands);
                $top = array_slice(array_keys($brands), 0, 4);
                $count = count($cars);
                $page['description'] = $count . ($count === 1 ? ' carro à venda' : ' carros à venda')
                    . ($top ? ' (' . implode(', ', $top) . (count($brands) > 4 ? ' e mais' : '') . ')' : '') . '. ' . $page['description'];
                $items = [];
                foreach (array_slice($cars, 0, 30) as $car) {
                    if (empty($car['slug'])) continue;
                    $items[] = ['@type' => 'ListItem', 'position' => count($items) + 1, 'url' => $base . '/carro/' . rawurlencode($car['slug']), 'name' => seo_car_title($car)];
                }
                if ($items) $page['ld'][] = ['@context' => 'https://schema.org', '@type' => 'ItemList', 'itemListElement' => $items];
            }
            $page['ld'][] = seo_breadcrumb($base, [['Início', '/'], ['Estoque', '/estoque']]);
        }
        return $page;
    }

    if (preg_match('#^/carro/([^/]+)$#', $path, $m)) {
        $car = public_car_by_slug($config, $m[1]);
        // Banco fora do ar: sai a página da loja (nada de dizer ao Google que o carro não existe)
        if ($car === false) return $page;
        if (!$car) {
            return array_merge($page, ['title' => 'Carro não encontrado | ' . $name, 'robots' => 'noindex', 'status' => 404]);
        }
        $title = seo_car_title($car);
        $url = $base . '/carro/' . rawurlencode($car['slug']);
        $facts = array_filter([
            isset($car['km']) && $car['km'] !== '' ? number_format((float) $car['km'], 0, ',', '.') . ' km' : '',
            $car['transmission'] ?? '',
            $car['fuel'] ?? '',
            $car['color'] ?? '',
        ]);
        $price = !empty($car['price']) ? seo_money($car['price']) : 'consulte o valor';
        $sold = ($car['status'] ?? '') === 'vendido';
        $page['title'] = ($sold ? 'Vendido: ' : '') . $title . ($city ? ' à venda em ' . $city : '') . ' | ' . $name;
        $page['description'] = $title . ($facts ? ' — ' . implode(', ', $facts) : '') . ', por ' . $price . ' na ' . $name . ($city ? ', em ' . $city : '') . '. Fotos e atendimento pelo WhatsApp.';
        $page['canonical'] = $url;
        $page['type'] = 'product';
        $photos = array_values(array_filter($car['images'] ?? []));
        if ($photos) $page['image'] = seo_photo($base, $photos[0]);
        if ($sold) $page['robots'] = 'noindex, follow';

        $ld = [
            '@context' => 'https://schema.org',
            '@type' => 'Car',
            'name' => $title,
            'url' => $url,
            'brand' => ['@type' => 'Brand', 'name' => $car['brand'] ?? ''],
            'model' => $car['model'] ?? '',
            'itemCondition' => 'https://schema.org/UsedCondition',
            'image' => array_map(fn($p) => absolute_url($base, $p), array_slice($photos, 0, 10)),
            'description' => trim((string) ($car['description'] ?? '')) ?: $page['description'],
        ];
        $years = array_values(array_filter(array_map('trim', explode('/', (string) ($car['model_year'] ?? '')))));
        if ($years) $ld['vehicleModelDate'] = end($years);
        if (!empty($car['year'])) $ld['productionDate'] = (string) $car['year'];
        if (isset($car['km']) && $car['km'] !== '') $ld['mileageFromOdometer'] = ['@type' => 'QuantitativeValue', 'value' => (float) $car['km'], 'unitCode' => 'KMT'];
        if (!empty($car['color'])) $ld['color'] = $car['color'];
        if (!empty($car['transmission'])) $ld['vehicleTransmission'] = $car['transmission'];
        if (!empty($car['fuel'])) $ld['fuelType'] = $car['fuel'];
        if (!empty($car['doors'])) $ld['numberOfDoors'] = (int) $car['doors'];
        if (!empty($car['price'])) {
            $ld['offers'] = [
                '@type' => 'Offer',
                'price' => (float) $car['price'],
                'priceCurrency' => 'BRL',
                'url' => $url,
                'availability' => $sold ? 'https://schema.org/SoldOut' : (($car['status'] ?? '') === 'disponivel' ? 'https://schema.org/InStock' : 'https://schema.org/LimitedAvailability'),
                'seller' => ['@type' => 'AutoDealer', 'name' => $name],
            ];
        }
        $page['ld'][] = $ld;
        $page['ld'][] = seo_breadcrumb($base, [['Início', '/'], ['Estoque', '/estoque'], [$title, '/carro/' . rawurlencode($car['slug'])]]);
        return $page;
    }

    // Página do site sem texto próprio: fica com o da loja
    if (in_array($path, $config['site_pages'] ?? [], true)) return $page;

    // Endereço que não existe no site
    return array_merge($page, ['robots' => 'noindex', 'status' => 404]);
}

// Troca o <head> do index.html: título, descrição e as tags de cada página
function seo_inject($html, $page)
{
    $e = fn($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
    // O que o index.html já tinha de prévia ou canônico sai (cada página tem o seu)
    $html = preg_replace('#\s*<meta\s+(?:property|name)="(?:og:|twitter:)[^"]*"[^>]*>#i', '', $html);
    $html = preg_replace('#\s*<link\s+rel="canonical"[^>]*>#i', '', $html);
    $html = preg_replace('#\s*<meta\s+name="robots"[^>]*>#i', '', $html);
    $tags = [];
    if ($page['title'] !== '') {
        $html = preg_replace_callback('#<title>.*?</title>#s', fn() => '<title>' . $e($page['title']) . '</title>', $html, 1);
    }
    if ($page['description'] !== '') {
        $tag = '<meta name="description" content="' . $e($page['description']) . '" />';
        $count = 0;
        $html = preg_replace_callback('#<meta\s+name="description"[^>]*>#i', fn() => $tag, $html, 1, $count);
        if (!$count) $tags[] = $tag;
    }
    if ($page['robots'] !== '') $tags[] = '<meta name="robots" content="' . $e($page['robots']) . '" />';
    $tags[] = '<link rel="canonical" href="' . $e($page['canonical']) . '" />';
    $tags[] = '<meta property="og:type" content="' . $e($page['type']) . '" />';
    $tags[] = '<meta property="og:locale" content="pt_BR" />';
    if ($page['site'] !== '') $tags[] = '<meta property="og:site_name" content="' . $e($page['site']) . '" />';
    $tags[] = '<meta property="og:title" content="' . $e($page['title']) . '" />';
    $tags[] = '<meta property="og:description" content="' . $e($page['description']) . '" />';
    $tags[] = '<meta property="og:url" content="' . $e($page['canonical']) . '" />';
    if ($page['image'] !== '') {
        $tags[] = '<meta property="og:image" content="' . $e($page['image']) . '" />';
        $tags[] = '<meta name="twitter:card" content="summary_large_image" />';
    }
    foreach ($page['ld'] as $ld) {
        // < e > codificados (<): nenhum texto do carro fecha o <script> nem vira tag
        $json = json_encode($ld, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG);
        if ($json !== false) $tags[] = '<script type="application/ld+json">' . $json . '</script>';
    }
    $block = "\n    " . implode("\n    ", $tags) . "\n  </head>";
    return preg_replace_callback('#\s*</head>#i', fn() => $block, $html, 1);
}
