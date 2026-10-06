<?php
// Catálogo do estoque para Facebook/Instagram (Gerenciador de Comércio da Meta
// → Catálogo → Fontes de dados → Feed de dados programado, com este endereço:
// https://<site>/api/catalogo.php). Planilha CSV no formato de produtos da Meta,
// atualizada sozinha a cada leitura: só carros disponíveis e com preço.
require __DIR__ . '/estoque-publico.php';
$config = require __DIR__ . '/fotos-config.php';

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: inline; filename="catalogo.csv"');
header('Cache-Control: public, max-age=1800');

$base = site_base_url();
$cars = public_cars(
    $config,
    'id,slug,brand,model,version,year,model_year,km,color,transmission,fuel,price,description,images',
    ['disponivel']
) ?? [];

$out = fopen('php://output', 'w');
fputcsv($out, ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'additional_image_link', 'brand']);
foreach ($cars as $car) {
    if (empty($car['slug']) || empty($car['price']) || empty($car['images'][0])) continue;
    // "Ano/Modelo" já vem como texto ("2022/2023"); sem ele, o ano de fabricação
    $year = trim((string) (!empty($car['model_year']) ? $car['model_year'] : ($car['year'] ?? '')));
    $title = trim(implode(' ', array_filter([$car['brand'] ?? '', $car['model'] ?? '', $car['version'] ?? '', $year])));
    $km = isset($car['km']) && $car['km'] !== null ? number_format((float) $car['km'], 0, ',', '.') . ' km' : '';
    $facts = implode(' · ', array_filter([$year, $km, $car['transmission'] ?? '', $car['fuel'] ?? '', $car['color'] ?? '']));
    $description = trim((string) ($car['description'] ?? ''));
    $description = $description !== '' ? $description : $title . ($facts !== '' ? ' — ' . $facts : '');
    $photos = array_values(array_filter(array_map(fn($u) => absolute_url($base, $u), $car['images'])));
    fputcsv($out, [
        $car['id'],
        mb_substr($title, 0, 150),
        mb_substr($description, 0, 5000),
        'in stock',
        'used',
        number_format((float) $car['price'], 2, '.', '') . ' BRL',
        $base . '/carro/' . rawurlencode($car['slug']),
        $photos[0],
        implode(',', array_slice($photos, 1, 10)),
        $car['brand'] ?? '',
    ]);
}
fclose($out);
