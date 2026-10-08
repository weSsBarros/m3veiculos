<?php
// Cópia em JPG das fotos dos carros, para a OLX (que não aceita WebP; seção 59).
// O .htaccess manda /uploads/carros/jpg/<nome>.jpg para cá quando o arquivo
// ainda não existe: converte /uploads/carros/<nome>.webp (GD), guarda a cópia
// em uploads/carros/jpg/ e entrega. Da segunda vez o Apache serve o arquivo
// direto. O fotos.php apaga a cópia junto com a foto.
//
// GET ?f=<nome>   (só letras, números e hífen, como os nomes do fotos.php)
// GET ?teste=1    diz se o servidor converte WebP (conferência na publicação)

const QUALITY = 85;

if (isset($_GET['teste'])) {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['webp_para_jpg' => function_exists('imagecreatefromwebp') && function_exists('imagejpeg')]);
    exit;
}

function stop($status)
{
    http_response_code($status);
    header('Cache-Control: no-store');
    exit;
}

$name = isset($_GET['f']) ? (string) $_GET['f'] : '';
if (!preg_match('/^[A-Za-z0-9-]{8,64}$/', $name)) stop(404);

$root = dirname(__DIR__) . '/uploads/carros';
$source = "$root/$name.webp";
$dir = "$root/jpg";
$target = "$dir/$name.jpg";

if (!is_file($target)) {
    if (!is_file($source)) stop(404);
    if (!function_exists('imagecreatefromwebp') || !function_exists('imagejpeg')) stop(500);
    $image = @imagecreatefromwebp($source);
    if (!$image) stop(500);
    // Fundo branco (o JPG não tem transparência)
    $width = imagesx($image);
    $height = imagesy($image);
    $canvas = imagecreatetruecolor($width, $height);
    imagefill($canvas, 0, 0, imagecolorallocate($canvas, 255, 255, 255));
    imagecopy($canvas, $image, 0, 0, 0, 0, $width, $height);
    imagedestroy($image);
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) stop(500);
    $tmp = $target . '.' . bin2hex(random_bytes(4)) . '.tmp';
    $ok = @imagejpeg($canvas, $tmp, QUALITY) && @rename($tmp, $target);
    imagedestroy($canvas);
    if (!$ok) {
        @unlink($tmp);
        stop(500);
    }
    @chmod($target, 0644);
}

header('Content-Type: image/jpeg');
header('Content-Length: ' . filesize($target));
// no-transform: o CDN da Hostinger não troca o JPG por WebP
header('Cache-Control: public, max-age=31536000, immutable, no-transform');
header('X-Content-Type-Options: nosniff');
readfile($target);
