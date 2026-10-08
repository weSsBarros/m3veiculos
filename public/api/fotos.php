<?php
// Fotos dos carros no próprio site (pasta /uploads/carros), no lugar do
// Supabase Storage. O painel comprime a foto no navegador e envia a foto e a
// miniatura para cá, com o token do login no cabeçalho X-Auth-Token.
//
// Só grava ou apaga se o Supabase confirmar que o login é da equipe ativa
// DESTA loja — a mesma regra que protegia as fotos no Storage
// (current_company_id() = loja e can_edit_stock(): admin, gerente ou vendedor ativo). Quem confere é o próprio
// Supabase: aqui fica só a chave pública, gerada no build em
// api/fotos-config.php (ver vite.config.js).
//
// POST action=upload, photo=<arquivo>, thumb=<arquivo>  -> {"url": "/uploads/carros/<nome>"}
// POST action=delete, url=/uploads/carros/<nome>        -> {"ok": true}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const MAX_BYTES = 10485760; // 10 MB, o mesmo limite do Storage
const PUBLIC_DIR = '/uploads/carros';
const TYPES = ['image/webp' => 'webp', 'image/jpeg' => 'jpg', 'image/png' => 'png'];

function reply($status, $body)
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail($status, $message)
{
    reply($status, ['error' => $message]);
}

// Chama uma função do banco como o usuário do token (o Supabase valida o token)
function rpc($config, $token, $fn)
{
    $ch = curl_init(rtrim($config['supabase_url'], '/') . '/rest/v1/rpc/' . $fn);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => '{}',
        CURLOPT_HTTPHEADER => [
            'apikey: ' . $config['anon_key'],
            'Authorization: Bearer ' . $token,
            'Content-Type: application/json',
            'Accept: application/json',
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 10,
    ]);
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($status === 401) fail(401, 'Sua sessão expirou. Entre de novo no painel.');
    if ($body === false || $status !== 200) fail(502, 'Não foi possível confirmar o login agora. Tente de novo.');
    return json_decode($body, true);
}

function checked_image($field)
{
    $file = isset($_FILES[$field]) ? $_FILES[$field] : null;
    if (!$file || is_array($file['error'])) fail(400, 'Foto não recebida.');
    if ($file['error'] === UPLOAD_ERR_INI_SIZE || $file['error'] === UPLOAD_ERR_FORM_SIZE || $file['size'] > MAX_BYTES) {
        fail(413, 'A foto é grande demais (limite de 10 MB).');
    }
    if ($file['error'] !== UPLOAD_ERR_OK) fail(400, 'A foto não chegou inteira. Tente de novo.');
    // O tipo vem do conteúdo do arquivo, não do nome nem do navegador
    $info = @getimagesize($file['tmp_name']);
    $type = $info && isset($info['mime']) ? $info['mime'] : '';
    if (!isset(TYPES[$type])) fail(415, 'Envie fotos em JPG, PNG ou WebP.');
    return ['tmp' => $file['tmp_name'], 'type' => $type];
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405, 'Use POST.');

$config = @include __DIR__ . '/fotos-config.php';
if (!is_array($config) || empty($config['supabase_url']) || empty($config['anon_key']) || empty($config['company_id'])) {
    fail(500, 'Envio de fotos sem configuração neste site (falta o api/fotos-config.php gerado no build).');
}

// Corpo maior que o post_max_size: o PHP descarta tudo
if (empty($_POST) && empty($_FILES) && (int) (isset($_SERVER['CONTENT_LENGTH']) ? $_SERVER['CONTENT_LENGTH'] : 0) > 0) {
    fail(413, 'A foto é grande demais para o servidor.');
}

$token = isset($_SERVER['HTTP_X_AUTH_TOKEN']) ? $_SERVER['HTTP_X_AUTH_TOKEN'] : '';
if (strlen($token) > 4096 || !preg_match('/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/', $token)) {
    fail(401, 'Sua sessão expirou. Entre de novo no painel.');
}
if (rpc($config, $token, 'current_company_id') !== $config['company_id'] || rpc($config, $token, 'can_edit_stock') !== true) {
    fail(403, 'Este login não pode alterar as fotos desta loja.');
}

$root = dirname(__DIR__) . PUBLIC_DIR;
$thumbs = $root . '/thumbs';
$action = isset($_POST['action']) ? $_POST['action'] : '';

if ($action === 'upload') {
    $photo = checked_image('photo');
    $thumb = checked_image('thumb');
    if ($photo['type'] !== $thumb['type']) fail(400, 'Foto e miniatura em formatos diferentes.');
    if (!is_dir($thumbs) && !@mkdir($thumbs, 0755, true) && !is_dir($thumbs)) {
        fail(500, 'Não foi possível criar a pasta das fotos no site.');
    }
    $name = bin2hex(random_bytes(16)) . '.' . TYPES[$photo['type']];
    // Miniatura primeiro: uma foto "com miniatura" nunca fica sem ela
    if (!move_uploaded_file($thumb['tmp'], "$thumbs/$name")) fail(500, 'Não foi possível salvar a foto no site.');
    if (!move_uploaded_file($photo['tmp'], "$root/$name")) {
        @unlink("$thumbs/$name");
        fail(500, 'Não foi possível salvar a foto no site.');
    }
    @chmod("$thumbs/$name", 0644);
    @chmod("$root/$name", 0644);
    reply(200, ['url' => PUBLIC_DIR . '/' . $name]);
}

if ($action === 'delete') {
    $url = isset($_POST['url']) ? $_POST['url'] : '';
    // Nomes gerados aqui (hex) ou trazidos do Supabase (uuid com hífens)
    if (!is_string($url) || !preg_match('#^/uploads/carros/([A-Za-z0-9-]{8,64}\.(?:webp|jpg|png))$#', $url, $m)) {
        fail(400, 'Endereço de foto inválido.');
    }
    @unlink("$root/{$m[1]}");
    @unlink("$thumbs/{$m[1]}");
    // Cópia em JPG feita para a OLX (api/foto-jpg.php)
    @unlink("$root/jpg/" . preg_replace('/\.(webp|jpg|png)$/', '', $m[1]) . '.jpg');
    reply(200, ['ok' => true]);
}

fail(400, 'Ação desconhecida.');
