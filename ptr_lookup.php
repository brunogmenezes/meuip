<?php
/**
 * ptr_lookup.php
 * Performs a reverse DNS (PTR) lookup for the given IP address.
 * Usage: ptr_lookup.php?ip=1.2.3.4
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Access-Control-Allow-Origin: *');

$ip = isset($_GET['ip']) ? trim($_GET['ip']) : null;

if (!$ip || !filter_var($ip, FILTER_VALIDATE_IP)) {
    echo json_encode(['status' => 'error', 'message' => 'IP invalido ou ausente.']);
    exit;
}

// gethostbyaddr returns the hostname on success, or the original IP if no PTR exists
$hostname = gethostbyaddr($ip);

if ($hostname === false) {
    // DNS error / timeout
    echo json_encode([
        'status'   => 'ok',
        'ip'       => $ip,
        'ptr'      => null,
        'has_ptr'  => false,
        'message'  => 'Erro ao consultar o DNS reverso.'
    ]);
    exit;
}

$has_ptr = ($hostname !== $ip);

// Optional: forward-confirmed reverse DNS (FCrDNS) check
// Verify that the PTR hostname resolves back to the original IP
$fcrdns = false;
if ($has_ptr) {
    $forward = gethostbyname($hostname);
    $fcrdns  = ($forward === $ip);
}

echo json_encode([
    'status'    => 'ok',
    'ip'        => $ip,
    'ptr'       => $has_ptr ? $hostname : null,
    'has_ptr'   => $has_ptr,
    'fcrdns'    => $fcrdns,
    'message'   => $has_ptr ? 'PTR encontrado.' : 'Nenhum registro PTR configurado.'
]);
