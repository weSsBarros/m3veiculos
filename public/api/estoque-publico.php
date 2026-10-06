<?php
// Estoque público da loja, lido do Supabase com a chave pública (a mesma regra
// do site: carro oculto ou de loja bloqueada não vem). Usado pelo sitemap.php
// e pelo catalogo.php.

function site_base_url()
{
    $host = preg_replace('/[^a-z0-9.\-]/i', '', $_SERVER['HTTP_HOST'] ?? '');
    return 'https://' . $host;
}

function public_cars($config, $fields, $statuses)
{
    $query = http_build_query([
        'select' => $fields,
        'company_id' => 'eq.' . $config['company_id'],
        'status' => 'in.(' . implode(',', $statuses) . ')',
        'order' => 'updated_at.desc',
        'limit' => '1000',
    ]);
    $ch = curl_init(rtrim($config['supabase_url'], '/') . '/rest/v1/cars?' . $query);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
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

// Foto com endereço completo (o banco guarda /uploads/carros/... sem domínio)
function absolute_url($base, $url)
{
    if (!is_string($url) || $url === '') return '';
    return str_starts_with($url, '/') ? $base . $url : $url;
}
