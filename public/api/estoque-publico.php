<?php
// Estoque público da loja, lido do Supabase com a chave pública (a mesma regra
// do site: carro oculto, repasse ou de loja bloqueada não vem). Usado pelo
// sitemap.php, pelo catalogo.php e pelo pagina.php.

function site_base_url()
{
    $host = preg_replace('/[^a-z0-9.\-]/i', '', $_SERVER['HTTP_HOST'] ?? '');
    return 'https://' . $host;
}

// Consulta pública ao Supabase (REST). O teste do pagina.php
// (design/seo/testar_pagina.php) troca por uma de mentira em
// $GLOBALS['estoque_publico_get'].
function supabase_public_get($config, $table, $params, $timeout = 15)
{
    if (isset($GLOBALS['estoque_publico_get']) && is_callable($GLOBALS['estoque_publico_get'])) {
        return ($GLOBALS['estoque_publico_get'])($table, $params);
    }
    $ch = curl_init(rtrim($config['supabase_url'], '/') . '/rest/v1/' . $table . '?' . http_build_query($params));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_HTTPHEADER => [
            'apikey: ' . $config['anon_key'],
            'Authorization: Bearer ' . $config['anon_key'],
            'Accept: application/json',
        ],
    ]);
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($status !== 200) return null;
    $rows = json_decode($body, true);
    return is_array($rows) ? $rows : null;
}

function public_cars($config, $fields, $statuses, $timeout = 15)
{
    return supabase_public_get($config, 'cars', [
        'select' => $fields,
        'company_id' => 'eq.' . $config['company_id'],
        'status' => 'in.(' . implode(',', $statuses) . ')',
        'order' => 'updated_at.desc',
        'limit' => '1000',
    ], $timeout);
}

// Um carro pelo endereço (/carro/<slug>), vendido também (a página diz "vendido").
// null = não existe; false = o banco não respondeu (não é para dizer que não existe)
function public_car_by_slug($config, $slug)
{
    $rows = supabase_public_get($config, 'cars', [
        'select' => 'slug,brand,model,version,year,model_year,km,transmission,fuel,color,doors,price,status,description,images',
        'company_id' => 'eq.' . $config['company_id'],
        'slug' => 'eq.' . $slug,
        'limit' => '1',
    ], 4);
    if (!is_array($rows)) return false;
    return $rows[0] ?? null;
}

// Foto com endereço completo (o banco guarda /uploads/carros/... sem domínio)
function absolute_url($base, $url)
{
    if (!is_string($url) || $url === '') return '';
    return str_starts_with($url, '/') ? $base . $url : $url;
}
